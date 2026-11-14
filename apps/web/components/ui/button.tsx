import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Design system button: pill shaped, no border, glass by default.
 * Heights 22 / 28 / 32 px, text 12 / 13 / 14 px at weight 450, icons 13 / 15 px.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border-0 font-book leading-none tracking-[-0.005em] transition-[background-color,box-shadow,transform,color,opacity] duration-600 ease-ds hover:-translate-y-[0.5px] active:scale-[0.98] active:duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-[15px] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-[hsl(var(--primary-hover))] hover:shadow-md',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:shadow-md',
        outline: 'ds-glass text-foreground hover:bg-glass-hover hover:shadow-md',
        secondary: 'ds-glass text-foreground hover:bg-glass-hover hover:shadow-md',
        ghost: 'bg-transparent text-foreground hover:bg-accent',
        link: 'h-auto px-0 text-foreground underline-offset-4 hover:translate-y-0 hover:underline',
      },
      size: {
        default: 'h-7 px-4 text-[13px]',
        sm: 'h-[22px] gap-[5px] px-[11px] text-xs [&_svg]:size-[13px]',
        lg: 'h-8 px-5 text-sm',
        icon: 'h-7 w-7 p-0',
        'icon-sm': 'h-[22px] w-[22px] p-0 [&_svg]:size-[13px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
