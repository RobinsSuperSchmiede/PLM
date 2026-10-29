'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, X } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export const ANY = '__any__';

export type FilterOption = { value: string; label: string; color?: string };
export type FilterDef = { key: string; label: string; value: string; options: FilterOption[]; onChange: (value: string) => void };

/** A row of compact filter selects plus sorting; active filters are highlighted and can be reset at once. */
export function FilterBar({ filters, sort, className, children }: {
  filters: FilterDef[];
  sort?: { value: string; options: FilterOption[]; onChange: (value: string) => void };
  className?: string;
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  const active = filters.filter((filter) => filter.value !== ANY);

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {children}
      {filters.map((filter) => {
        const selected = filter.options.find((option) => option.value === filter.value);
        const isActive = filter.value !== ANY;
        return (
          <Select key={filter.key} value={filter.value} onValueChange={filter.onChange}>
            <SelectTrigger aria-label={filter.label}
              className={cn('h-8 w-auto gap-1.5 rounded-full px-3 text-xs', isActive ? 'border-brand/40 bg-brand/10 font-medium text-foreground' : 'text-muted-foreground')}>
              {selected?.color && isActive && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: selected.color }} />}
              <span className="text-muted-foreground">{filter.label}:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t('filters.any')}</SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <span className="flex items-center gap-2">
                    {option.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: option.color }} />}
                    {option.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      })}
      {sort && (
        <Select value={sort.value} onValueChange={sort.onChange}>
          <SelectTrigger aria-label={t('filters.sort')} className="h-8 w-auto gap-1.5 rounded-full px-3 text-xs text-muted-foreground">
            <ArrowUpDown className="h-3.5 w-3.5" /><SelectValue />
          </SelectTrigger>
          <SelectContent>{sort.options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
      )}
      {active.length > 0 && (
        <Button variant="ghost" size="sm" className="h-8 rounded-full text-xs text-muted-foreground" onClick={() => active.forEach((filter) => filter.onChange(ANY))}>
          <X />{t('filters.reset')}
        </Button>
      )}
    </div>
  );
}

/**
 * Renders long lists in slices: the first `step` items right away, more when the end of the list
 * scrolls into view. Keeps hundreds of rows fast without a virtualization library.
 */
export function useIncremental<T>(items: T[], step = 80) {
  const [count, setCount] = useState(step);
  const sentinel = useRef<HTMLDivElement>(null);
  const total = items.length;

  useEffect(() => setCount(step), [items, step]);

  useEffect(() => {
    const element = sentinel.current;
    if (!element || count >= total) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setCount((value) => Math.min(total, value + step));
    }, { rootMargin: '600px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [count, step, total]);

  const marker = count < total ? <div ref={sentinel} className="h-8" aria-hidden="true" /> : null;
  return { visible: items.slice(0, count), marker, shown: Math.min(count, total), total };
}
