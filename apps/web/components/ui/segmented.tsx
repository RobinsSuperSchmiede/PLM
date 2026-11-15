import { cn } from '@/lib/utils';

/** Segmented control of the design system: a glass group whose active segment is a raised pill. */
export function Segmented<T extends string>({ value, options, onChange, label, className }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn('ds-glass inline-flex gap-0.5 rounded-full p-[3px]', className)} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)}
          className={cn('h-[22px] rounded-full px-3.5 text-xs font-book transition-[background-color,box-shadow,color] duration-600 ease-ds focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
            value === option.value ? 'bg-seg text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
