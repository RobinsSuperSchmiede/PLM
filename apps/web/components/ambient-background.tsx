'use client';

import { useEffect, useRef, useState } from 'react';

import { type Ambient, type Appearance, appearanceChangeEvent, defaultAppearance, loadAppearance } from '@/lib/appearance';

/**
 * Decorative animation behind the workspace (Settings → Appearance): ASCII scenes drawn on a character
 * grid, or a pixel sun. It sits on a fixed canvas below all content, runs at a few frames per second,
 * pauses in hidden tabs and stands still with "reduce motion".
 */
export function AmbientBackground() {
  const [appearance, setAppearance] = useState<Appearance>(defaultAppearance);
  useEffect(() => {
    const sync = () => setAppearance(loadAppearance());
    sync();
    // The settings save from inside a state update; reading the new value has to wait until that render is over.
    const onChange = () => queueMicrotask(sync);
    window.addEventListener(appearanceChangeEvent, onChange);
    return () => window.removeEventListener(appearanceChangeEvent, onChange);
  }, []);

  if (appearance.ambient === 'none') return null;
  return <AmbientCanvas key={appearance.ambient} scene={appearance.ambient} strength={appearance.ambientStrength} still={appearance.reduceMotion} />;
}

const CELL_W = 9;
const CELL_H = 18;
const FPS = 10;

/** Deterministic pseudo-random number in [0, 1) per seed, so a scene looks the same on every frame. */
const hash = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};

type Painter = {
  cols: number;
  rows: number;
  width: number;
  height: number;
  /** Text color of the page as "r, g, b". */
  ink: string;
  dark: boolean;
  text: (col: number, row: number, value: string, color?: string, alpha?: number) => void;
  rect: (x: number, y: number, w: number, h: number, color: string, alpha?: number) => void;
};
type Scene = (painter: Painter, tick: number) => void;

const fishRight = ['><>', '><(((°>', '><{{{°>', '>=>', '><((°>'];
const fishLeft = ['<><', '<°)))><', '<°}}}><', '<=<', '<°))><'];
const fishHues = [18, 42, 190, 205, 330, 160, 275];

const aquarium: Scene = (p, tick) => {
  // Seaweed along the bottom, swaying.
  for (let i = 0; i < Math.ceil(p.cols / 9); i += 1) {
    const col = Math.floor(hash(i + 1) * p.cols);
    const height = 2 + Math.floor(hash(i + 50) * 5);
    for (let k = 0; k < height; k += 1) {
      const sway = Math.floor((tick / 6 + k + i) % 2);
      p.text(col + sway, p.rows - 1 - k, sway ? ')' : '(', 'hsl(150 55% 42%)', 0.9);
    }
  }
  // Fish swim across at their own depth and speed, and wrap around.
  const count = Math.max(4, Math.round((p.cols * p.rows) / 520));
  for (let i = 0; i < count; i += 1) {
    const right = hash(i + 7) > 0.5;
    const kind = Math.floor(hash(i + 21) * fishRight.length);
    const sprite = (right ? fishRight : fishLeft)[kind];
    const speed = 0.12 + hash(i + 33) * 0.35;
    const span = p.cols + sprite.length * 2;
    const travelled = (hash(i + 90) * span + tick * speed) % span;
    const col = Math.floor(right ? travelled - sprite.length : p.cols + sprite.length - travelled);
    const row = 3 + Math.floor(hash(i + 64) * (p.rows - 9)) + Math.round(Math.sin(tick / 14 + i * 2) * 0.6);
    p.text(col, row, sprite, `hsl(${fishHues[i % fishHues.length]} 75% ${p.dark ? 66 : 46}%)`);
  }
  // Bubbles rise in loose columns.
  for (let i = 0; i < Math.ceil(p.cols / 7); i += 1) {
    const col = Math.floor(hash(i + 300) * p.cols) + Math.round(Math.sin(tick / 9 + i) * 0.7);
    const row = p.rows - 1 - ((tick * (0.2 + hash(i + 310) * 0.2) + hash(i + 320) * p.rows) % p.rows);
    p.text(col, Math.floor(row), row < p.rows / 3 ? '°' : row < (p.rows * 2) / 3 ? 'o' : '.', undefined, 0.55);
  }
};

const rain: Scene = (p, tick) => {
  for (let col = 0; col < p.cols; col += 1) {
    if (hash(col + 3) > 0.42) continue;
    const speed = 0.7 + hash(col + 11) * 0.9;
    const row = Math.floor((tick * speed + hash(col + 17) * p.rows * 3) % (p.rows * 1.6));
    if (row < p.rows - 1) {
      p.text(col, row, '|', undefined, 0.75);
      p.text(col, row - 1, "'", undefined, 0.4);
    } else if (row < p.rows + 2) {
      // The drop hits the ground and splashes.
      p.text(col - 1, p.rows - 1, row === p.rows - 1 ? ' . ' : '. .', undefined, 0.6);
    }
  }
};

const stars: Scene = (p, tick) => {
  const count = Math.round((p.cols * p.rows) / 38);
  for (let i = 0; i < count; i += 1) {
    const phase = (Math.sin(tick / (7 + hash(i + 5) * 14) + hash(i + 9) * 6.28) + 1) / 2;
    const bright = hash(i + 13) > 0.86;
    p.text(Math.floor(hash(i + 1) * p.cols), Math.floor(hash(i + 2) * p.rows), bright ? (phase > 0.72 ? '*' : '+') : phase > 0.6 ? '·' : '.', undefined, 0.3 + phase * 0.7);
  }
  // Now and then a shooting star crosses the sky.
  const cycle = 140;
  const step = tick % cycle;
  if (step < 16) {
    const run = Math.floor(tick / cycle);
    const col = Math.floor(hash(run + 70) * p.cols * 0.7) + step * 2;
    const row = Math.floor(hash(run + 71) * p.rows * 0.4) + step;
    for (let k = 0; k < 5; k += 1) p.text(col - k * 2, row - k, k === 0 ? '*' : '\\', undefined, 1 - k * 0.2);
  }
};

/** A retro pixel sun: banded disc with slits that drift downwards, pulsing rays and a few pixel clouds. */
const sun: Scene = (p, tick) => {
  const px = Math.max(6, Math.round(Math.min(p.width, p.height) / 90));
  const radius = Math.round(Math.min(p.width, p.height) * 0.17 / px);
  const cx = Math.round((p.width * 0.76) / px);
  const cy = Math.round((p.height * 0.34) / px);
  for (let y = -radius; y <= radius; y += 1) {
    // Slits open up towards the lower edge and scroll down slowly.
    const below = (y + radius) / (radius * 2);
    const slit = below > 0.5 && ((y + Math.floor(tick / 5)) % 5) < Math.round((below - 0.45) * 5);
    if (slit) continue;
    for (let x = -radius; x <= radius; x += 1) {
      if (x * x + y * y > radius * radius) continue;
      p.rect((cx + x) * px, (cy + y) * px, px, px, `hsl(${48 - below * 44} 96% ${60 - below * 8}%)`);
    }
  }
  const rays = 12;
  for (let i = 0; i < rays; i += 1) {
    const angle = (i / rays) * Math.PI * 2 + tick / 90;
    const length = 3 + Math.round((Math.sin(tick / 8 + i * 1.7) + 1) * 1.5);
    for (let k = 0; k < length; k += 1) {
      const distance = radius + 3 + k;
      p.rect(Math.round(cx + Math.cos(angle) * distance) * px, Math.round(cy + Math.sin(angle) * distance) * px, px, px, 'hsl(40 96% 58%)', 0.85 - k * 0.12);
    }
  }
  // Clouds: a few rounded pixel rows drifting to the right.
  const cloud = [[2, 5], [1, 8], [0, 10], [0, 10]];
  for (let i = 0; i < 4; i += 1) {
    const span = p.width / px + 30;
    const left = Math.floor((hash(i + 400) * span + tick * (0.05 + hash(i + 410) * 0.07)) % span) - 15;
    const top = Math.floor((p.height * (0.12 + hash(i + 420) * 0.5)) / px);
    cloud.forEach(([offset, length], row) => p.rect((left + offset) * px, (top + row) * px, length * px, px, `rgb(${p.ink})`, 0.16));
  }
};

const scenes: Record<Exclude<Ambient, 'none'>, Scene> = { aquarium, sun, rain, stars };

function AmbientCanvas({ scene, strength, still }: { scene: Exclude<Ambient, 'none'>; strength: number; still: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    let frame = 0;
    let last = 0;
    let tick = Math.floor(Math.random() * 1000);

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * ratio);
      canvas.height = Math.round(window.innerHeight * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    };

    const draw = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const ink = (getComputedStyle(canvas).color.match(/\d+(\.\d+)?/g) ?? ['0', '0', '0']).slice(0, 3).join(', ');
      const level = strength / 100;
      context.clearRect(0, 0, width, height);
      context.font = `14px ${getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace'}, monospace`;
      context.textBaseline = 'top';
      scenes[scene]({
        cols: Math.ceil(width / CELL_W),
        rows: Math.floor(height / CELL_H),
        width,
        height,
        ink,
        dark: document.documentElement.classList.contains('dark'),
        text: (col, row, value, color, alpha = 1) => {
          context.globalAlpha = alpha * level;
          context.fillStyle = color ?? `rgb(${ink})`;
          context.fillText(value, col * CELL_W, row * CELL_H);
        },
        rect: (x, y, w, h, color, alpha = 1) => {
          context.globalAlpha = alpha * level;
          context.fillStyle = color;
          context.fillRect(x, y, w, h);
        },
      }, tick);
      context.globalAlpha = 1;
    };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (document.hidden || now - last < 1000 / FPS) return;
      last = now;
      tick += 1;
      draw();
    };

    resize();
    window.addEventListener('resize', resize);
    // Theme switches change the ink color; a still picture has to be redrawn for them.
    const observer = new MutationObserver(draw);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    if (!still) frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [scene, strength, still]);

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-[1] h-full w-full text-foreground" />;
}
