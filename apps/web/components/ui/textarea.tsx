import * as React from 'react';

import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      'flex min-h-[120px] w-full resize-y rounded-[16px] border-0 px-3.5 py-[9px] text-[13px] leading-normal text-foreground bg-field shadow-sm transition-[background-color,box-shadow] duration-600 ease-ds placeholder:text-muted-foreground hover:bg-field-hover hover:shadow-md focus-visible:outline-none focus-visible:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring aria-[invalid=true]:ring-[1.5px] aria-[invalid=true]:ring-destructive disabled:cursor-not-allowed disabled:opacity-45',
      className,
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export { Textarea };
