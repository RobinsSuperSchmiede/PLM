import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full border-0 px-2.5 text-[11px] font-medium leading-none transition-colors duration-500 ease-ds focus:outline-none focus:ring-[3px] focus:ring-ring',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm',
        secondary: 'ds-glass text-[hsl(var(--fg-2)/var(--fg-2-a))]',
        destructive: 'bg-field text-destructive shadow-sm',
        success: 'bg-field text-success shadow-sm',
        warning: 'bg-field text-warning shadow-sm',
        info: 'bg-field text-foreground shadow-sm',
        brand: 'bg-field text-foreground shadow-sm',
        outline: 'ds-glass text-[hsl(var(--fg-2)/var(--fg-2-a))]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
