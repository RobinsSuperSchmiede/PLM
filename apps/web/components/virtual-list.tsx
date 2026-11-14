'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useVirtualizer, useWindowVirtualizer, type Virtualizer } from '@tanstack/react-virtual';

type Scroller = HTMLElement | 'window';

type VirtualListProps<T> = {
  items: T[];
  keyOf: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** Rough height of one row in pixels; real heights are measured once rows are on screen. */
  estimateSize: number;
  /** Items per row: a number, or a function of the viewport width for responsive grids. */
  columns?: number | ((viewportWidth: number) => number);
  /** Space between rows and columns in pixels. */
  gap?: number;
  className?: string;
};

/**
 * Renders only the rows that are on screen (plus a few around them), so lists with hundreds or
 * thousands of entries cost the same as short ones. Works inside a scrolling panel as well as with
 * page scroll: the nearest ancestor that actually scrolls is detected.
 */
export function VirtualList<T>(props: VirtualListProps<T>) {
  const { items, columns = 1, estimateSize, gap = 0, className } = props;
  const root = useRef<HTMLDivElement>(null);
  const [scroller, setScroller] = useState<Scroller | null>(null);
  // Distance from the top of the scrolled content to the top of this list.
  const [offset, setOffset] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Checked after every render: content above the list (filters, headers) can change its position.
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const found = findScroller(element);
    const rect = element.getBoundingClientRect();
    const next = found === 'window'
      ? rect.top + window.scrollY
      : rect.top - found.getBoundingClientRect().top - found.clientTop + found.scrollTop;
    setScroller((current) => (current === found ? current : found));
    setOffset((current) => (Math.abs(current - next) < 1 ? current : next));
  });

  const columnCount = Math.max(1, typeof columns === 'function' ? columns(viewportWidth) : columns);
  const rowCount = Math.ceil(items.length / columnCount);
  const shared = { ...props, root, offset, columnCount, rowCount };

  if (scroller === 'window') return <WindowRows {...shared} />;
  if (scroller) return <ElementRows {...shared} scroller={scroller} />;
  // First render: reserve the estimated height so the scrolling ancestor can be detected.
  return <div ref={root} className={className} style={{ height: rowCount * (estimateSize + gap) }} />;
}

function findScroller(element: HTMLElement): Scroller {
  for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const { overflowY } = window.getComputedStyle(parent);
    if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight + 1) return parent;
  }
  return 'window';
}

type RowsProps<T> = VirtualListProps<T> & { root: React.RefObject<HTMLDivElement | null>; offset: number; columnCount: number; rowCount: number };

function options<T>({ items, keyOf, estimateSize, gap = 0, offset, columnCount, rowCount }: RowsProps<T>) {
  return {
    count: rowCount,
    estimateSize: () => estimateSize + gap,
    overscan: 6,
    scrollMargin: offset,
    // Keyed by the first entry of the row, so measured heights survive filtering and sorting.
    getItemKey: (index: number) => `${columnCount}:${keyOf(items[index * columnCount])}`,
  };
}

function WindowRows<T>(props: RowsProps<T>) {
  return <Rows {...props} virtualizer={useWindowVirtualizer(options(props))} />;
}

function ElementRows<T>({ scroller, ...props }: RowsProps<T> & { scroller: HTMLElement }) {
  return <Rows {...props} virtualizer={useVirtualizer({ ...options(props), getScrollElement: () => scroller })} />;
}

function Rows<T, S extends Element | Window>({ virtualizer, items, keyOf, renderItem, gap = 0, className, root, offset, columnCount }: RowsProps<T> & { virtualizer: Virtualizer<S, Element> }) {
  return (
    <div ref={root} className={className} style={{ position: 'relative', height: Math.max(0, virtualizer.getTotalSize() - gap) }}>
      {virtualizer.getVirtualItems().map((row) => (
        <div
          key={row.key}
          ref={virtualizer.measureElement}
          data-index={row.index}
          style={{
            position: 'absolute',
            left: 0,
            top: row.start - offset,
            width: '100%',
            paddingBottom: gap,
            ...(columnCount > 1 ? { display: 'grid', gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`, columnGap: gap } : null),
          }}
        >
          {items.slice(row.index * columnCount, (row.index + 1) * columnCount).map((item) => <VirtualItem key={keyOf(item)}>{renderItem(item)}</VirtualItem>)}
        </div>
      ))}
    </div>
  );
}

function VirtualItem({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
