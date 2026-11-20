'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

export type BarDatum = { key: string; label: string; value: number; tooltip?: string };

/**
 * Single-series column chart: neutral bars, only the current period (the last bar) and the hovered
 * bar carry the accent. Muted mono axis labels and a hover tooltip per bar.
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
              className={cn('w-full rounded-t-[3px] transition-colors duration-150 ease-ds', hover === index || (hover === null && index === data.length - 1) ? 'bg-brand' : 'bg-foreground/15')}
              style={{ height: entry.value ? `${Math.max(3, (entry.value / max) * 100)}%` : '1px', opacity: entry.value ? 1 : 0.35 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 border-t" />
      <div className="mt-2 flex gap-[2px] font-mono text-[10px] text-muted-foreground">
        {data.map((entry, index) => (
          <span key={entry.key} className="flex-1 overflow-visible whitespace-nowrap text-center">{index % labelEvery === 0 ? entry.label : ''}</span>
        ))}
      </div>
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md ds-menu px-2 py-1 text-xs shadow-md"
          style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
        >
          <span className="font-medium tabular-nums">{data[hover].value}</span>
          <span className="ml-1.5 text-muted-foreground">{data[hover].tooltip ?? data[hover].label}</span>
        </div>
      )}
    </div>
  );
}

/** Activity calendar: weeks as columns, one sequential ramp of the accent from faint to full. */
export function Heatmap({ days, weeks = 53, cell: fixedCell, fit = false, tooltip, legend }: {
  days: Record<string, number>;
  weeks?: number;
  /** Edge length of one day in px. */
  cell?: number;
  /** Size the days so the year fills the available width (between 9 and 20 px). */
  fit?: boolean;
  tooltip: (date: string, count: number) => string;
  legend: { less: string; more: string };
}) {
  const [hover, setHover] = useState<{ date: string; count: number; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [fitted, setFitted] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = box.current;
    if (!fit || !element) return;
    const measure = () => setFitted(Math.max(9, Math.min(20, Math.floor((element.clientWidth + 3) / weeks) - 3)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fit, weeks]);
  const cell = fitted ?? fixedCell ?? 11;
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
  const shades = ['bg-foreground/[0.06]', 'bg-brand/25', 'bg-brand/45', 'bg-brand/70', 'bg-brand'];

  return (
    <div className="relative" ref={box}>
      <div className="overflow-x-auto pb-1">
        <div className="grid w-max grid-flow-col grid-rows-7 gap-[3px]" role="img" aria-label={legend.more} onMouseLeave={() => setHover(null)}>
          {cells.map((day) => (
            <div
              key={day.date}
              className={cn('rounded-[3px]', day.future ? 'bg-transparent' : shades[level(day.count)])}
              style={{ width: cell, height: cell }}
              onMouseEnter={(event) => {
                if (day.future) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const parent = event.currentTarget.closest('.relative')!.getBoundingClientRect();
                setHover({ date: day.date, count: day.count, x: rect.left - parent.left + cell / 2, y: rect.top - parent.top });
              }}
            />
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
        {legend.less}
        {shades.map((shade) => <span key={shade} className={cn('h-[10px] w-[10px] rounded-[2px]', shade)} />)}
        {legend.more}
      </div>
      {hover && (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md ds-menu px-2 py-1 text-xs shadow-md" style={{ left: hover.x, top: hover.y - 4 }}>
          {tooltip(hover.date, hover.count)}
        </div>
      )}
    </div>
  );
}

/** Ranked list with thin neutral bars; the leading entry carries the accent. */
export function BarList({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ul className="space-y-3">
      {items.map((item, index) => (
        <li key={item.label}>
          <div className="flex justify-between text-xs"><span>{item.label}</span><span className="font-mono tabular-nums text-muted-foreground">{item.value.toLocaleString()}</span></div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
            <div className={cn('h-full rounded-full', index === 0 ? 'bg-brand' : 'bg-foreground/25')} style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export type DonutSlice = { key: string; label: string; value: number; color: string; display?: string; href?: string };

/**
 * Donut for one whole split into a few parts (at most ~4). A 2px gap in the surface color separates the
 * slices, the total sits in the middle, and a legend with value and share sits beside it, so no slice
 * depends on its color alone. Hovering a slice or a legend row highlights the pair.
 */
export function Donut({ slices, total, totalLabel, size = 132, thickness = 14, emptyLabel, shareLabel }: {
  slices: DonutSlice[];
  /** Text in the center; defaults to the sum. */
  total?: string;
  totalLabel?: string;
  size?: number;
  thickness?: number;
  emptyLabel: string;
  shareLabel: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const sum = slices.reduce((acc, slice) => acc + slice.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = slices.filter((slice) => slice.value > 0).length > 1 ? 2.5 : 0;
  let offset = 0;
  const arcs = slices.map((slice) => {
    const length = sum ? (slice.value / sum) * circumference : 0;
    const arc = { slice, dash: Math.max(0, length - gap), offset };
    offset += length;
    return arc;
  });
  const active = slices.find((slice) => slice.key === hover);
  const percent = (value: number) => (sum ? Math.round((value / sum) * 1000) / 10 : 0);

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={slices.map((slice) => `${slice.label} ${slice.display ?? slice.value}`).join(', ')} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--foreground) / 0.06)" strokeWidth={thickness} />
          {sum > 0 && arcs.map(({ slice, dash, offset: start }) => (
            <circle key={slice.key} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={slice.color} strokeWidth={hover === slice.key ? thickness + 3 : thickness}
              strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-start} strokeLinecap="butt"
              className="cursor-default transition-[stroke-width,opacity] duration-200 ease-ds" style={{ opacity: hover && hover !== slice.key ? 0.35 : 1 }}
              onMouseEnter={() => setHover(slice.key)} onMouseLeave={() => setHover(null)} />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-mono text-[15px] font-medium tabular-nums leading-tight">{active ? active.display ?? active.value.toLocaleString() : total ?? sum.toLocaleString()}</span>
          <span className="mt-0.5 max-w-[80%] truncate text-[10px] text-muted-foreground">{active ? `${percent(active.value)} %` : totalLabel}</span>
        </div>
      </div>
      {sum === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <table className="w-full min-w-0 text-[13px]">
          <thead className="sr-only"><tr><th>{totalLabel}</th><th>{shareLabel}</th></tr></thead>
          <tbody>
            {slices.map((slice) => {
              const Row = slice.href ? 'a' : 'span';
              return (
                <tr key={slice.key} onMouseEnter={() => setHover(slice.key)} onMouseLeave={() => setHover(null)}
                  className={cn('transition-opacity duration-200', hover && hover !== slice.key && 'opacity-50')}>
                  <td className="py-1 pr-3">
                    <Row {...(slice.href ? { href: slice.href } : {})} className="flex min-w-0 items-center gap-2 hover:underline">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: slice.color }} aria-hidden="true" />
                      <span className="truncate">{slice.label}</span>
                    </Row>
                  </td>
                  <td className="whitespace-nowrap py-1 text-right font-mono text-xs tabular-nums">{slice.display ?? slice.value.toLocaleString()}</td>
                  <td className="w-14 whitespace-nowrap py-1 text-right font-mono text-xs tabular-nums text-muted-foreground">{percent(slice.value)} %</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Tiny line of the last days for a stat tile: one neutral stroke, the last point marked. */
export function Sparkline({ values, width = 96, height = 28, className }: { values: number[]; width?: number; height?: number; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const step = width / (values.length - 1);
  const y = (value: number) => height - 3 - (value / max) * (height - 6);
  const points = values.map((value, index) => `${(index * step).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
  const last = values[values.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      <polyline points={points} fill="none" stroke="hsl(var(--foreground) / 0.35)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={y(last)} r={2.5} className="fill-brand" transform={`translate(${-1.5} 0)`} />
    </svg>
  );
}
