'use client';

import { useEffect, useRef } from 'react';

const CELL_W = 10;
const CELL_H = 20;
const FPS = 24;
/** How far the map moves per walkthrough step, in cells. */
const TRAVEL_X = 26;
const TRAVEL_Y = 7;
const RIPPLE_MS = 1800;

/** Deterministic pseudo-random number in [0, 1) per seed. */
const hash = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};

/** Terrain height at a map position (in cells, rows already scaled to square units). */
const terrain = (x: number, y: number, t: number) =>
  Math.sin(x * 0.055 + Math.sin(y * 0.045 + t * 0.05) * 1.6) * 1.0
  + Math.cos(y * 0.07 - x * 0.021 + t * 0.12) * 0.8
  + Math.sin((x * 0.031 + y * 0.052) - t * 0.08) * 0.65
  + Math.cos(Math.hypot(x - 40, y - 30) * 0.06 - t * 0.1) * 0.35;

function readColor(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value ? `hsl(${value})` : fallback;
}

function prefersReducedMotion() {
  return document.documentElement.dataset.motion === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Background of the walkthrough: an ASCII contour map, drawn on a character grid. Every step pans the map a
 * little further (the "journey" of the roadmap) and sends a ripple through it from the reached station.
 * It fades out behind the content, pauses in hidden tabs and stands still with reduced motion.
 */
export function AsciiField({ step, steps }: { step: number; steps: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const target = useRef({ step, steps });

  useEffect(() => { target.current = { step, steps }; }, [step, steps]);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const still = prefersReducedMotion();
    let frame = 0;
    let last = 0;
    let time = 0;
    let width = 0;
    let height = 0;
    let heights = new Float32Array(0);
    const camera = { x: target.current.step * TRAVEL_X, y: 0 };
    let shownStep = target.current.step;
    let ripple = { start: -Infinity, x: 0, y: 0 };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw(performance.now());
    };

    const draw = (now: number) => {
      const { step: current, steps: count } = target.current;
      if (current !== shownStep) {
        // The ripple starts where the roadmap station sits (bottom of the screen, spread across the width).
        const pad = Math.min(96, width * 0.08);
        ripple = { start: now, x: pad + (current / Math.max(1, count - 1)) * (width - pad * 2), y: height - 72 };
        shownStep = current;
      }
      const goalX = current * TRAVEL_X;
      const goalY = (current % 2 ? -1 : 1) * TRAVEL_Y * Math.min(current, 1);
      if (still) {
        camera.x = goalX;
        camera.y = goalY;
      } else {
        camera.x += (goalX - camera.x) * 0.06;
        camera.y += (goalY - camera.y) * 0.06;
      }

      const cols = Math.ceil(width / CELL_W) + 1;
      const rows = Math.ceil(height / CELL_H) + 1;
      const aspect = CELL_H / CELL_W;
      if (heights.length !== (cols + 1) * (rows + 1)) heights = new Float32Array((cols + 1) * (rows + 1));
      const levels = 1.5;
      for (let row = 0; row <= rows; row += 1) {
        for (let col = 0; col <= cols; col += 1) {
          heights[row * (cols + 1) + col] = terrain(col + camera.x, (row + camera.y) * aspect, time) * levels;
        }
      }

      const dark = document.documentElement.classList.contains('dark');
      const ink = readColor('--foreground', dark ? '#fff' : '#000');
      const brand = readColor('--brand', ink);
      const base = dark ? 0.34 : 0.2;
      const age = now - ripple.start;
      const rippleOn = age >= 0 && age < RIPPLE_MS;
      const rippleRadius = (age / RIPPLE_MS) * Math.hypot(width, height) * 0.75;
      const rippleFade = 1 - age / RIPPLE_MS;

      context.clearRect(0, 0, width, height);
      context.font = `13px ${getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace'}, monospace`;
      context.textBaseline = 'middle';
      context.textAlign = 'center';

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const index = row * (cols + 1) + col;
          const v00 = heights[index];
          const v10 = heights[index + 1];
          const v01 = heights[index + cols + 1];
          const v11 = heights[index + cols + 2];
          const gx = (v10 + v11 - v00 - v01) / 2;
          const gy = (v01 + v11 - v00 - v10) / 2;
          // Marching squares: a contour passes through the cell when its corners lie on different levels.
          const level = Math.floor(Math.max(v00, v10, v01, v11));
          const major = ((level % 3) + 3) % 3 === 0;
          // On steep slopes the lines crowd together; there only the index lines stay.
          const onLine = level !== Math.floor(Math.min(v00, v10, v01, v11)) && (major || Math.hypot(gx, gy) < 0.5);

          const px = col * CELL_W + CELL_W / 2;
          const py = row * CELL_H + CELL_H / 2;
          // Quiet in the middle where the content sits, fuller towards the edges.
          const mx = (px - width / 2) / (width * 0.5);
          const my = (py - height * 0.45) / (height * 0.55);
          // The roadmap band along the bottom stays calm as well.
          const band = py > height - 190 ? 0.4 : 1;
          const mask = Math.min(1, 0.1 + Math.max(0, Math.hypot(mx, my) - 0.25) * 1.2) * band;

          let glyph = '';
          let alpha = 0;
          if (onLine) {
            // Contour runs perpendicular to the gradient; pick the character that matches its direction.
            // Tangent angle in screen space (y points down): 0 = horizontal, π/2 = vertical.
            const angle = Math.atan2(gx, -gy / aspect);
            const a = ((angle % Math.PI) + Math.PI) % Math.PI;
            glyph = a < Math.PI / 8 || a > (Math.PI * 7) / 8 ? '-' : a < (Math.PI * 3) / 8 ? '\\' : a < (Math.PI * 5) / 8 ? '|' : '/';
            // Every third contour is an index line, drawn stronger like on a real map.
            alpha = major ? 1 : 0.5;
          } else {
            const seed = (col + Math.round(camera.x)) * 7919 + (row + Math.round(camera.y)) * 104729;
            const sparkle = hash(seed);
            if (sparkle > 0.985) {
              glyph = sparkle > 0.997 ? '+' : '.';
              alpha = 0.45 + Math.sin(time * 0.6 + sparkle * 40) * 0.25;
            }
          }

          let color = ink;
          if (rippleOn) {
            const ring = Math.abs(Math.hypot(px - ripple.x, py - ripple.y) - rippleRadius);
            if (ring < 26) {
              const strength = (1 - ring / 26) * rippleFade;
              if (!glyph && hash(index + Math.floor(age / 90)) > 0.55) glyph = strength > 0.6 ? '*' : '·';
              if (glyph) {
                color = brand;
                alpha = Math.max(alpha, strength * 1.6);
              }
            }
          }
          if (!glyph) continue;
          context.globalAlpha = Math.min(1, alpha * base * (color === brand ? Math.max(mask, 0.5) : mask));
          context.fillStyle = color;
          context.fillText(glyph, px, py);
        }
      }
      context.globalAlpha = 1;
    };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (document.hidden || now - last < 1000 / FPS) return;
      time += (now - last > 200 ? 1000 / FPS : now - last) / 1000;
      last = now;
      draw(now);
    };

    resize();
    window.addEventListener('resize', resize);
    if (still) {
      // No animation: redraw only when the step changes.
      const interval = window.setInterval(() => { if (target.current.step !== shownStep) draw(performance.now()); }, 150);
      return () => { window.clearInterval(interval); window.removeEventListener('resize', resize); };
    }
    frame = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full duration-1000 animate-in fade-in" aria-hidden="true" />;
}
