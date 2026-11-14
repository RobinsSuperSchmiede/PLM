'use client';

import { useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { cn } from '@/lib/utils';

/**
 * Explorer on the left, content on the right – edge to edge like an editor, without nested cards.
 * Each pane scrolls on its own; on small screens the explorer sits above the content.
 */
export function SplitLayout({ sidebar, children, sidebarClassName, className, wide, mobileLabel }: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  sidebarClassName?: string;
  className?: string;
  wide?: boolean;
  /** Label of the toggle that shows the explorer on phones (where it is collapsed by default). */
  mobileLabel?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className={cn('grid lg:h-[calc(100vh-3.5rem)]', wide ? 'lg:grid-cols-[300px_minmax(0,1fr)]' : 'lg:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[290px_minmax(0,1fr)]', className)}>
      <div className="border-b lg:hidden">
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}
          className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground">
          <SlidersHorizontal className="h-4 w-4" />
          <span className="flex-1 text-left">{mobileLabel ?? t('explorer.filters')}</span>
          <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', open && 'rotate-180')} />
        </button>
      </div>
      <aside className={cn('min-h-0 overflow-y-auto border-b bg-card/60 lg:block lg:border-b-0 lg:border-r', open ? 'block max-h-[55vh] lg:max-h-none duration-200 animate-in fade-in slide-in-from-top-1' : 'hidden', sidebarClassName)}
        onClick={(event) => {
          // On phones, picking an entry closes the panel again.
          if (window.innerWidth < 1024 && (event.target as HTMLElement).closest('button[aria-current], li > button')) setOpen(false);
        }}>
        {sidebar}
      </aside>
      <div className="min-h-0 min-w-0 overflow-y-auto">{children}</div>
    </div>
  );
}

export function SidebarSection({ title, children, action }: { title?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="px-2 py-3">
      {(title || action) && (
        <div className="flex items-center justify-between px-2 pb-1.5">
          {title && <p className="ds-label">{title}</p>}
          {action}
        </div>
      )}
      <ul className="space-y-px">{children}</ul>
    </div>
  );
}

export function SidebarItem({ active, onClick, icon, label, count, color }: {
  active?: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
  count?: number;
  color?: string;
}) {
  return (
    <li>
      <button type="button" onClick={onClick} aria-current={active ? 'true' : undefined}
        className={cn('relative flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors duration-150',
          active ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground')}>
        {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand" aria-hidden="true" />}
        {color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />}
        {icon}
        <span className="flex-1 truncate">{label}</span>
        {count !== undefined && <span className="text-xs tabular-nums text-muted-foreground">{count}</span>}
      </button>
    </li>
  );
}

/** Title row at the top of a content pane. */
export function PaneHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b px-5 py-4 sm:px-8 xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
