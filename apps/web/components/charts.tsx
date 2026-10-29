'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils';

export type BarDatum = { key: string; label: string; value: number; tooltip?: string };

/**
 * Single-series column chart (one hue, so no legend): thin bars with rounded tops anchored to the
 * baseline, a recessive baseline, sparse axis labels and a hover tooltip per bar.
 */
export function BarChart({ data, height = 140, className, ariaLabel }: { data: BarDatum[]; height?: number; className?: string; ariaLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((entry) => entry.value));
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));

  return (
    <div className={cn('relative', className)}>
      <div className="flex items-end gap-[2px]" style={{ height }} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {data.map((entry, index) => (
          <div key={entry.key} className="flex h-full flex-1 cursor-default items-end" onMouseEnter={() => setHover(index)}>
            <div
              className={cn('w-full rounded-t-[4px] transition-[height,background-color] duration-500 ease-[var(--ease-out)]', hover === index ? 'bg-info' : 'bg-info/70')}
              style={{ height: entry.value ? `${Math.max(3, (entry.value / max) * 100)}%` : '1px', opacity: entry.value ? 1 : 0.35 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 border-t" />
      <div className="mt-1 flex gap-[2px] text-[10px] text-muted-foreground">
        {data.map((entry, index) => (
          <span key={entry.key} className="flex-1 overflow-visible whitespace-nowrap text-center">{index % labelEvery === 0 ? entry.label : ''}</span>
        ))}
      </div>
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs shadow-md"
          style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
        >
          <span className="font-medium tabular-nums">{data[hover].value}</span>
          <span className="ml-1.5 text-muted-foreground">{data[hover].tooltip ?? data[hover].label}</span>
        </div>
      )}
    </div>
  );
}

/** GitHub-style activity calendar: one sequential hue, light to dark, weeks as columns. */
export function Heatmap({ days, weeks = 53, tooltip, legend }: {
  days: Record<string, number>;
  weeks?: number;
  tooltip: (date: string, count: number) => string;
  legend: { less: string; more: string };
}) {
  const [hover, setHover] = useState<{ date: string; count: number; x: number; y: number } | null>(null);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - ((end.getDay() + 6) % 7)));
  const start = new Date(end);
  start.setDate(start.getDate() - weeks * 7 + 1);
  const cells: { date: string; count: number; future: boolean }[] = [];
  for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    cells.push({ date: key, count: days[key] ?? 0, future: day > today });
  }
  const values = cells.map((cell) => cell.count).filter(Boolean).sort((a, b) => a - b);
  const quantile = (q: number) => values[Math.min(values.length - 1, Math.floor(q * values.length))] ?? 1;
  const thresholds = [quantile(0.25), quantile(0.5), quantile(0.8)];
  const level = (count: number) => (count === 0 ? 0 : count <= thresholds[0] ? 1 : count <= thresholds[1] ? 2 : count <= thresholds[2] ? 3 : 4);
  const shades = ['bg-muted', 'bg-info/25', 'bg-info/45', 'bg-info/70', 'bg-info'];

  return (
    <div className="relative">
      <div className="overflow-x-auto pb-1">
        <div className="grid w-max grid-flow-col grid-rows-7 gap-[3px]" role="img" aria-label={legend.more} onMouseLeave={() => setHover(null)}>
          {cells.map((cell) => (
            <div
              key={cell.date}
              className={cn('h-[11px] w-[11px] rounded-[3px] transition-colors', cell.future ? 'bg-transparent' : shades[level(cell.count)])}
              onMouseEnter={(event) => {
                if (cell.future) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const parent = event.currentTarget.closest('.relative')!.getBoundingClientRect();
                setHover({ date: cell.date, count: cell.count, x: rect.left - parent.left + 5, y: rect.top - parent.top });
              }}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
        {legend.less}
        {shades.map((shade) => <span key={shade} className={cn('h-[10px] w-[10px] rounded-[3px]', shade)} />)}
        {legend.more}
      </div>
      {hover && (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs shadow-md" style={{ left: hover.x, top: hover.y - 4 }}>
          {tooltip(hover.date, hover.count)}
        </div>
      )}
    </div>
  );
}

/** Horizontal bars with the value as text; one hue, labels in text ink. */
export function BarList({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex justify-between text-xs"><span>{item.label}</span><span className="tabular-nums text-muted-foreground">{item.value}</span></div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-info/80 transition-[width] duration-700 ease-[var(--ease-out)]" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
