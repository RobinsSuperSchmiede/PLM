'use client';

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
              className={cn('h-7 w-auto gap-1.5 rounded-full px-3 text-xs', isActive ? 'bg-seg font-medium text-foreground shadow-sm' : 'text-muted-foreground')}>
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
