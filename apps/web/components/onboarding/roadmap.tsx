'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

const HEIGHT = 128;
const MID = 66;
const TRAVEL_MS = 1100;
/** Distance between the ASCII dots of the path still ahead. */
const DOT_GAP = 11;
/** Up/down offset of each station, so the path swings like a trail on a map. */
const swing = [0.7, -0.75, 0.45, -0.6, 0.75, -0.35, 0.55, -0.55];

type Point = { x: number; y: number };
type Track = { points: Point[]; lengths: number[]; total: number; stations: Point[]; stationLengths: number[] };

const cubic = (a: Point, b: Point, c: Point, d: Point, t: number): Point => {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
};

/** Builds the trail through all stations: soft S-curves, one loop in the middle on wide screens, sampled into a polyline. */
function buildTrack(width: number, count: number): Track {
  const pad = Math.min(96, Math.max(28, width * 0.08));
  const step = (width - pad * 2) / Math.max(1, count - 1);
  const amplitude = width < 640 ? 16 : 24;
  const stations = Array.from({ length: count }, (_, index) => ({ x: pad + index * step, y: MID + swing[index % swing.length] * amplitude }));
  const loopAt = width >= 760 && count > 3 ? Math.floor((count - 1) / 2) : -1;

  const segments: [Point, Point, Point, Point][] = [];
  // Lead-in from the left edge.
  segments.push([{ x: -8, y: MID - amplitude * 0.4 }, { x: pad * 0.4, y: MID - amplitude * 0.4 }, { x: stations[0].x - pad * 0.5, y: stations[0].y }, stations[0]]);
  for (let index = 0; index < count - 1; index += 1) {
    const from = stations[index];
    const to = stations[index + 1];
    const dx = to.x - from.x;
    if (index === loopAt) {
      // Control points cross over each other: the curve draws a small loop.
      segments.push([from, { x: from.x + dx * 1.7, y: from.y - 62 }, { x: to.x - dx * 1.7, y: to.y - 62 }, to]);
    } else {
      segments.push([from, { x: from.x + dx * 0.5, y: from.y }, { x: to.x - dx * 0.5, y: to.y }, to]);
    }
  }
  // Trailing off to the right edge.
  const end = stations[count - 1];
  segments.push([end, { x: end.x + pad * 0.5, y: end.y }, { x: width - pad * 0.4, y: MID + amplitude * 0.3 }, { x: width + 8, y: MID + amplitude * 0.3 }]);

  const points: Point[] = [segments[0][0]];
  const lengths = [0];
  const stationLengths: number[] = [];
  segments.forEach((segment, position) => {
    for (let sample = 1; sample <= 64; sample += 1) {
      const point = cubic(...segment, sample / 64);
      const previous = points[points.length - 1];
      lengths.push(lengths[lengths.length - 1] + Math.hypot(point.x - previous.x, point.y - previous.y));
      points.push(point);
    }
    // Segment `position` ends at station `position` (the lead-in ends at the first one).
    if (position < count) stationLengths.push(lengths[lengths.length - 1]);
  });
  return { points, lengths, total: lengths[lengths.length - 1], stations, stationLengths };
}

/** Point and index on the polyline at a given distance along it. */
function pointAt(track: Track, distance: number): { point: Point; index: number } {
  const { points, lengths } = track;
  let low = 0;
  let high = lengths.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (lengths[middle] < distance) low = middle + 1; else high = middle;
  }
  if (low === 0) return { point: points[0], index: 0 };
  const span = lengths[low] - lengths[low - 1] || 1;
  const t = Math.min(1, Math.max(0, (distance - lengths[low - 1]) / span));
  const a = points[low - 1];
  const b = points[low];
  return { point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, index: low };
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The walkthrough's roadmap: a curved trail along the bottom with one station per step. The path still ahead is
 * dotted with ASCII characters that shimmer towards the next station; on every step a marker travels the solid
 * line to the new station. Stations can be clicked to jump.
 */
export function Roadmap({ labels, current, onSelect, label }: { labels: string[]; current: number; onSelect: (index: number) => void; label: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const track = useMemo(() => (width ? buildTrack(width, labels.length) : null), [width, labels.length]);
  const [progress, setProgress] = useState<number | null>(null);
  const progressRef = useRef<number | null>(null);
  const [arrived, setArrived] = useState(current);

  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Travel from wherever the marker is to the current station.
  useEffect(() => {
    if (!track) return;
    const goal = track.stationLengths[current];
    const start = progressRef.current;
    const reduced = document.documentElement.dataset.motion === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (start === null || reduced || Math.abs(goal - start) < 1) {
      progressRef.current = goal;
      setProgress(goal);
      setArrived(current);
      return;
    }
    const began = performance.now();
    const duration = Math.min(1600, TRAVEL_MS * Math.max(1, Math.abs(goal - start) / (track.total / labels.length) * 0.6));
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / duration);
      const value = start + (goal - start) * ease(t);
      progressRef.current = value;
      setProgress(value);
      if (t < 1) frame = requestAnimationFrame(tick);
      else setArrived(current);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [current, track, labels.length]);

  const traveled = useMemo(() => {
    if (!track || progress === null) return '';
    const { point, index } = pointAt(track, progress);
    const head = track.points.slice(0, index).map((entry) => `${entry.x.toFixed(1)},${entry.y.toFixed(1)}`);
    head.push(`${point.x.toFixed(1)},${point.y.toFixed(1)}`);
    return `M${head.join(' L')}`;
  }, [track, progress]);

  const dots = useMemo(() => {
    if (!track) return [];
    const result: { x: number; y: number; at: number }[] = [];
    for (let at = DOT_GAP; at < track.total; at += DOT_GAP) {
      // Leave room around the stations.
      if (track.stationLengths.some((length) => Math.abs(length - at) < 9)) continue;
      const { point } = pointAt(track, at);
      result.push({ x: point.x, y: point.y, at });
    }
    return result;
  }, [track]);

  const marker = track && progress !== null ? pointAt(track, progress).point : null;
  const compact = width < 600;
  const last = labels.length - 1;

  return (
    <div ref={container} className="relative w-full select-none" style={{ height: HEIGHT }}>
      {track && progress !== null && marker && (
        <svg width={width} height={HEIGHT} className="absolute inset-0 overflow-visible" role="group" aria-label={label}>
          <defs>
            <linearGradient id="roadmap-fade" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="hsl(var(--brand))" stopOpacity="0" />
              <stop offset="0.06" stopColor="hsl(var(--brand))" stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* The trail still ahead: ASCII dots that shimmer in a wave towards the next station. */}
          <g className="font-mono" fontSize="12" textAnchor="middle" dominantBaseline="central" fill="hsl(var(--foreground))">
            {dots.map((dot) => {
              if (dot.at < progress + 4) return null;
              const ahead = dot.at - progress;
              const nextStop = track.stationLengths[Math.min(last, current + 1)];
              const leading = current < last && dot.at < nextStop;
              return (
                <text key={dot.at} x={dot.x} y={dot.y} className={cn('roadmap-dot', leading && 'roadmap-dot-lead')}
                  style={{ '--d': `${Math.round(ahead * 9)}ms`, opacity: leading ? undefined : 0.22 } as React.CSSProperties}>
                  {leading ? '·' : '.'}
                </text>
              );
            })}
          </g>

          {/* The road already travelled. */}
          <path d={traveled} fill="none" stroke="url(#roadmap-fade)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />

          {track.stations.map((station, index) => {
            // A station lights up as soon as the traveller has passed it.
            const done = progress >= track.stationLengths[index] - 0.5;
            const active = index === current && arrived === current;
            const below = station.y >= MID;
            const showLabel = !compact || index === current;
            return (
              <g key={labels[index]} role="button" tabIndex={0} aria-label={`${index + 1}. ${labels[index]}`} aria-current={index === current ? 'step' : undefined}
                className="group cursor-pointer outline-none" onClick={() => onSelect(index)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(index); } }}>
                <circle cx={station.x} cy={station.y} r={18} fill="transparent" />
                {active && <circle cx={station.x} cy={station.y} r={11} fill="hsl(var(--brand))" className="roadmap-halo" style={{ transformOrigin: `${station.x}px ${station.y}px` }} />}
                {index === last ? (
                  // The treasure: an "x marks the spot".
                  <text x={station.x} y={station.y} textAnchor="middle" dominantBaseline="central" className="font-mono transition-[fill] duration-500"
                    fontSize={done ? 17 : 15} fill={done ? 'hsl(var(--brand))' : 'hsl(var(--muted-foreground) / var(--muted-foreground-a))'}>×</text>
                ) : (
                  <circle cx={station.x} cy={station.y} r={done && !active ? 3.5 : 5}
                    className="transition-[r,fill,stroke] duration-500 group-hover:stroke-foreground group-focus-visible:stroke-foreground"
                    fill={done && !active ? 'hsl(var(--brand))' : 'hsl(var(--background))'}
                    stroke={active || done ? 'hsl(var(--brand))' : 'hsl(var(--foreground) / 0.3)'} strokeWidth={1.5} />
                )}
                {showLabel && (
                  <text x={station.x} y={below ? station.y + 26 : station.y - 22} textAnchor="middle" dominantBaseline="central"
                    className={cn('text-[12px] transition-[fill,opacity] duration-500', index === current ? 'font-medium' : 'opacity-70 group-hover:opacity-100')}
                    fill={index === current ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground) / var(--muted-foreground-a))'}>
                    <tspan className="font-mono" fontSize="10" opacity="0.6">{String(index + 1).padStart(2, '0')}  </tspan>{labels[index]}
                  </text>
                )}
              </g>
            );
          })}

          {/* The traveller; at the treasure only its ring stays, so the "×" shows. */}
          {!(current === last && arrived === last) && <circle cx={marker.x} cy={marker.y} r={4} fill="hsl(var(--brand))" />}
          <circle cx={marker.x} cy={marker.y} r={current === last && arrived === last ? 11 : 8} fill="none" stroke="hsl(var(--brand))" strokeOpacity={0.35} strokeWidth={1}
            className="transition-[r] duration-500" />
        </svg>
      )}
    </div>
  );
}
