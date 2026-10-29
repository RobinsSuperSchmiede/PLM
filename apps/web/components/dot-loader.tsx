'use client';

import { DotmSquare3 } from '@/components/ui/dotm-square-3';
import { cn } from '@/lib/utils';

/** Dot matrix spinner used for loading states and transitions. Inherits the text color. */
export function DotLoader({ size = 28, label, className, animated = true, hoverAnimated }: {
  size?: number;
  label?: string;
  className?: string;
  animated?: boolean;
  hoverAnimated?: boolean;
}) {
  return (
    <span className={cn('inline-flex text-foreground', className)} role={label ? 'status' : undefined} aria-label={label}>
      <DotmSquare3 size={size} animated={animated} hoverAnimated={hoverAnimated} ariaLabel={label} />
    </span>
  );
}
