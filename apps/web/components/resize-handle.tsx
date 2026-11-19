'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useI18n } from '@/components/i18n-provider';
import { cn } from '@/lib/utils';

/**
 * A vertical edge that changes the width of a pane when it is dragged with the mouse (or pen/touch).
 * `onResizeStart` gets the handle element, so callers can measure the pane or its container once;
 * `onResize` then gets the horizontal distance from the starting point on every move. A double click
 * resets the width. While dragging, transitions and text selection are off everywhere
 * (`body[data-resizing]` in globals.css), so the pane follows the pointer without lag.
 */
export function ResizeHandle({ onResizeStart, onResize, onResizeEnd, onReset, className, style }: {
  onResizeStart: (handle: HTMLElement) => void;
  onResize: (deltaX: number) => void;
  onResizeEnd?: () => void;
  onReset?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { t } = useI18n();
  const start = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const stop = useCallback(() => {
    if (start.current === null) return;
    start.current = null;
    setDragging(false);
    delete document.body.dataset.resizing;
    onResizeEnd?.();
  }, [onResizeEnd]);

  useEffect(() => () => { delete document.body.dataset.resizing; }, []);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('ui.resize')}
      title={t('ui.resize')}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = event.clientX;
        setDragging(true);
        document.body.dataset.resizing = 'true';
        onResizeStart(event.currentTarget);
      }}
      onPointerMove={(event) => { if (start.current !== null) onResize(event.clientX - start.current); }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onDoubleClick={onReset}
      className={cn('group/resize absolute inset-y-0 z-20 w-2 cursor-col-resize touch-none select-none', className)}
      style={style}
    >
      <span className={cn('pointer-events-none absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-brand opacity-0 transition-opacity duration-150 group-hover/resize:opacity-60',
        dragging && 'opacity-100 group-hover/resize:opacity-100')} />
    </div>
  );
}

/** Keeps a number within bounds. */
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
