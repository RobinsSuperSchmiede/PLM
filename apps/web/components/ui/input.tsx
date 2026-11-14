import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      'flex h-7 w-full rounded-full border-0 px-3.5 text-[13px] text-foreground file:border-0 file:bg-transparent file:text-[13px] file:font-medium bg-field shadow-sm transition-[background-color,box-shadow] duration-600 ease-ds placeholder:text-muted-foreground hover:bg-field-hover hover:shadow-md focus-visible:outline-none focus-visible:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring aria-[invalid=true]:ring-[1.5px] aria-[invalid=true]:ring-destructive disabled:cursor-not-allowed disabled:opacity-45',
      className,
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
