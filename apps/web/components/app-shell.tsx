'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Archive, BellRing, BookOpen, Bot, CalendarDays, CheckSquare2, Code2, Database, FileText, Folder, FolderKanban, Hash, Home, Image as ImageIcon, LifeBuoy, Lightbulb, ListTodo, type LucideIcon, Menu, Network, NotebookPen, PanelLeftClose, PanelLeftOpen, Paperclip, Search, Send, Settings, Users,
} from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';

import { useI18n } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { TelegramMenu } from '@/components/quick-capture';
import { GlobalSearch } from '@/components/global-search';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useWorkspace } from '@/components/workspace-provider';
import type { TranslationKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type NavItem = { key: TranslationKey; href: string; icon: LucideIcon };

const navGroups: { key: TranslationKey | null; items: NavItem[] }[] = [
  { key: null, items: [{ key: 'nav.dashboard', href: '/', icon: Home }] },
  {
    key: 'nav.groupPlan',
    items: [
      { key: 'nav.projects', href: '/projects', icon: FolderKanban },
      { key: 'nav.tasks', href: '/tasks', icon: CheckSquare2 },
      { key: 'nav.calendar', href: '/calendar', icon: CalendarDays },
      { key: 'nav.reminders', href: '/reminders', icon: BellRing },
      { key: 'nav.meetings', href: '/meetings', icon: Users },
    ],
  },
  {
    key: 'nav.groupKnowledge',
    items: [
      { key: 'nav.notes', href: '/notes', icon: NotebookPen },
      { key: 'nav.knowledge', href: '/knowledge', icon: BookOpen },
      { key: 'nav.graph', href: '/graph', icon: Network },
      { key: 'nav.tags', href: '/tags', icon: Hash },
      { key: 'nav.files', href: '/files', icon: Paperclip },
      { key: 'nav.images', href: '/images', icon: ImageIcon },
      { key: 'nav.lists', href: '/lists', icon: ListTodo },
      { key: 'nav.ideas', href: '/ideas', icon: Lightbulb },
    ],
  },
  {
    key: 'nav.groupSystem',
    items: [
      { key: 'nav.archive', href: '/archive', icon: Archive },
      { key: 'nav.database', href: '/database', icon: Database },
      { key: 'nav.telegram', href: '/telegram', icon: Send },
      { key: 'nav.assistant', href: '/ai-assistant', icon: Bot },
      { key: 'nav.developer', href: '/developer-center', icon: Code2 },
    ],
  },
];

const bottomItems: NavItem[] = [{ key: 'nav.docs', href: '/docs', icon: LifeBuoy }, { key: 'nav.settings', href: '/settings', icon: Settings }];
const allNavItems = [...navGroups.flatMap((group) => group.items), ...bottomItems];

/** Thumb-reachable navigation on phones; "Menu" opens the full sidebar as a drawer. */
const mobileNav: NavItem[] = [
  { key: 'nav.dashboard', href: '/', icon: Home },
  { key: 'nav.notes', href: '/notes', icon: NotebookPen },
  { key: 'nav.tasks', href: '/tasks', icon: CheckSquare2 },
  { key: 'nav.calendar', href: '/calendar', icon: CalendarDays },
  { key: 'nav.menu', href: '#menu', icon: Menu },
];

/** Pages that lay out their own explorer + content panes edge to edge (no page padding). */
const fullBleed = ['/notes', '/files', '/images', '/docs', '/database'];

const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const { data, error, reload } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [modifier, setModifier] = useState('Ctrl');

  useEffect(() => {
    setModifier(/Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl');
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  const openTasks = data.tasks.filter((task) => task.status !== 'done').length;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-14 shrink-0 items-center gap-2 border-b border-transparent px-4', collapsed && 'lg:justify-center lg:px-0')}>
        <Link href="/" className={cn('min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', collapsed && 'lg:hidden')}>
          <BrandWord />
        </Link>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="hidden shrink-0 text-muted-foreground hover:text-foreground lg:inline-flex"
              onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? t('shell.expand') : t('shell.collapse')} aria-expanded={!collapsed}>
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{collapsed ? t('shell.expand') : t('shell.collapse')}</TooltipContent>
        </Tooltip>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-2" aria-label="Navigation">
        {navGroups.map((group, index) => (
          <div key={group.key ?? index} className="space-y-0.5">
            {group.key && !collapsed && <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">{t(group.key)}</p>}
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} label={t(item.key)} active={isActive(pathname, item.href)} collapsed={collapsed}
                badge={item.href === '/tasks' && openTasks > 0 ? openTasks : undefined} />
            ))}
          </div>
        ))}
      </nav>

      <div className="space-y-0.5 border-t p-2">
        {bottomItems.map((item) => <NavLink key={item.href} item={item} label={t(item.key)} active={isActive(pathname, item.href)} collapsed={collapsed} />)}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className={cn('sticky top-0 hidden h-screen shrink-0 overflow-hidden border-r bg-[hsl(var(--sidebar))] transition-[width] duration-300 ease-[var(--ease-out)] lg:block', collapsed ? 'w-[60px]' : 'w-60')}>
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-black/40 backdrop-blur-sm duration-200 animate-in fade-in" aria-label={t('shell.closeNav')} onClick={() => setMobileOpen(false)} />
          <aside className="pb-safe absolute inset-y-0 left-0 w-[min(20rem,85vw)] border-r bg-background shadow-2xl duration-300 ease-[var(--ease-out)] animate-in slide-in-from-left">{sidebar}</aside>
        </div>
      )}

      <div className="page-glow flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-border/60 bg-background/75 px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-background/55 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1">
              <Suspense fallback={null}><Breadcrumbs /></Suspense>
            </div>
          </div>
          <button type="button" onClick={() => setPaletteOpen(true)}
            className="group flex h-9 w-9 items-center gap-2.5 rounded-full border bg-muted/40 px-0 text-sm text-muted-foreground shadow-sm transition-all duration-300 ease-[var(--ease-out)] hover:border-brand/40 hover:bg-background hover:text-foreground hover:shadow-[0_0_0_4px_hsl(var(--brand)/0.08)] sm:w-[22rem] sm:px-3.5 lg:w-[30rem]">
            <Search className="mx-auto h-4 w-4 shrink-0 transition-colors group-hover:text-brand sm:mx-0" />
            <span className="hidden flex-1 truncate text-left sm:inline">{t('search.trigger')}</span>
            <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded-md border bg-background px-1.5 font-mono text-[10px] font-medium sm:inline-flex">{modifier} K</kbd>
          </button>
          <div className="flex items-center justify-end gap-1.5">
            <TelegramMenu />
          </div>
        </header>

        <main className={cn('w-full flex-1 pb-20 lg:pb-0', fullBleed.some((href) => isActive(pathname, href)) ? 'min-h-0' : 'mx-auto max-w-[1800px] px-4 py-5 sm:px-6 lg:px-10 lg:py-8 2xl:px-14')}>
          {error && (
            <div role="alert" className="mb-6 flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm animate-in fade-in slide-in-from-top-2 sm:flex-row sm:items-center">
              <p className="flex-1"><span className="font-medium">{t('common.errorLoading')}</span> <span className="text-muted-foreground">{error}</span></p>
              <Button size="sm" variant="outline" onClick={() => void reload()}>{t('common.retry')}</Button>
            </div>
          )}
          <div key={pathname} className="page-enter">{children}</div>
        </main>
      </div>

      <nav aria-label={t('shell.openNav')} className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-5">
          {mobileNav.map((item) => {
            const active = item.href !== '#menu' && isActive(pathname, item.href);
            const content = (
              <>
                <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200', active && 'bg-brand/15 text-brand')}>
                  <item.icon className="h-5 w-5" />
                </span>
                <span className="text-[10px] font-medium">{t(item.key)}</span>
              </>
            );
            const className = cn('flex flex-col items-center gap-0.5 py-2 transition-colors', active ? 'text-foreground' : 'text-muted-foreground');
            return item.href === '#menu' ? (
              <button key={item.href} type="button" onClick={() => setMobileOpen(true)} className={className} aria-label={t('shell.openNav')}>{content}</button>
            ) : (
              <Link key={item.href} href={item.href} className={className} aria-current={active ? 'page' : undefined}>{content}</Link>
            );
          })}
        </div>
      </nav>

      <GlobalSearch open={paletteOpen} onOpenChange={setPaletteOpen} pages={allNavItems.map((item) => ({ href: item.href, label: t(item.key), icon: item.icon }))} />
    </div>
  );
}

function NavLink({ item, label, active, collapsed, badge }: { item: NavItem; label: string; active: boolean; collapsed: boolean; badge?: number }) {
  const link = (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-all duration-200 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:scale-[0.98]',
        active ? 'bg-accent font-medium text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]' : 'text-muted-foreground',
        collapsed && 'lg:justify-center lg:px-0',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute -left-2 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-brand shadow-[0_0_10px_hsl(var(--brand)/0.7)] transition-all duration-300 ease-[var(--ease-out)]',
          active ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0',
        )}
      />
      <item.icon className={cn('h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110', active && 'text-brand')} />
      <span className={cn('flex-1 truncate', collapsed && 'lg:hidden')}>{label}</span>
      {badge !== undefined && (
        <span key={badge} className={cn('rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground duration-300 animate-in zoom-in-50', collapsed && 'lg:hidden')}>{badge}</span>
      )}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

/** The brand name; its letters drift up and back in an endless, quiet loop. */
function BrandWord() {
  return (
    <p className="brand-word truncate text-[15px] font-semibold leading-tight tracking-tight" aria-label="Anamnesies">
      {Array.from('Anamnesies').map((letter, index) => (
        <span key={index} aria-hidden="true" style={{ '--i': index } as React.CSSProperties}>{letter}</span>
      ))}
    </p>
  );
}
