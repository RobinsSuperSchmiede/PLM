import * as React from 'react';

import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      'flex min-h-[120px] w-full resize-y rounded-lg border border-input bg-background/60 px-3.5 py-2.5 text-sm leading-relaxed shadow-sm transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground hover:border-foreground/20 focus-visible:border-foreground/30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/10 disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export { Textarea };
