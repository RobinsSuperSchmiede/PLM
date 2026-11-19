'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CalendarDays, CheckSquare2, ChevronRight, FolderTree, Home, LogOut, type LucideIcon, Menu, PanelLeftClose, PanelLeftOpen, Search, UserRound, Users } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';

import { AmbientBackground } from '@/components/ambient-background';
import { useAccount } from '@/components/auth-gate';
import { useI18n } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { titleBarProps, useDesktopWindow, WindowControls } from '@/components/desktop-window';
import { TelegramMenu } from '@/components/quick-capture';
import { useWorkspace } from '@/components/workspace-provider';
import type { TranslationKey } from '@/lib/i18n';
import { onboardingEvent } from '@/lib/onboarding';
import { type NavItem as PageItem, type ResolvedNavItem, navItems, resolveNav, useSidebarPrefs } from '@/lib/navigation';
import { cn } from '@/lib/utils';

type NavItem = { key: TranslationKey; href: string; icon: LucideIcon };

/** Thumb-reachable navigation on phones; "Menu" opens the full sidebar as a drawer. */
const mobileNav: NavItem[] = [
  { key: 'nav.dashboard', href: '/', icon: Home },
  { key: 'nav.explorer', href: '/explorer', icon: FolderTree },
  { key: 'nav.tasks', href: '/tasks', icon: CheckSquare2 },
  { key: 'nav.calendar', href: '/calendar', icon: CalendarDays },
  { key: 'nav.menu', href: '#menu', icon: Menu },
];
/** Pages that lay out their own explorer + content panes edge to edge (no page padding). */
const fullBleed = ['/explorer', '/docs', '/database'];

const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

const pinnedStorageKey = 'anamnesies.sidebarPinned';

// The command palette is loaded the first time it opens.
const GlobalSearch = dynamic(() => import('@/components/global-search').then((module) => module.GlobalSearch), { ssr: false });
// The first-run walkthrough is only loaded when it is shown.
const Walkthrough = dynamic(() => import('@/components/onboarding/walkthrough').then((module) => module.Walkthrough), { ssr: false });

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // The clicked target counts as active right away, so the rail reacts before the page has rendered.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const activePath = pendingHref ?? pathname;
  const { t } = useI18n();
  const { data, error, reload, settings } = useWorkspace();
  const [onboarding, setOnboarding] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteUsed, setPaletteUsed] = useState(false);
  const [modifier, setModifier] = useState('Ctrl');
  const hoverTimer = useRef<number | undefined>(undefined);
  const [sidebarPrefs] = useSidebarPrefs();
  // Desktop app with its own title bar: the header is the title bar (see desktop-window.tsx).
  const desktop = useDesktopWindow();
  const groups = useMemo(() => resolveNav(sidebarPrefs), [sidebarPrefs]);
  // Sub-pages the user unfolded by hand; the family of the current page is always unfolded.
  const [unfolded, setUnfolded] = useState<string[]>([]);

  useEffect(() => {
    setModifier(/Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl');
    try { setPinned(window.localStorage.getItem(pinnedStorageKey) === 'true'); } catch { /* storage unavailable */ }
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => { setMobileOpen(false); setHovered(false); setPendingHref(null); }, [pathname]);

  // Dev server only: compile every page once in the background, so the first visit of a page does not
  // wait for the compiler. Production builds are compiled ahead of time and prefetched by <Link>.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      for (const item of navItems) {
        if (cancelled) return;
        if (item.href === pathname) continue;
        await fetch(item.href, { cache: 'no-store' }).catch(() => undefined);
        router.prefetch(item.href);
      }
    }, 1500);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (paletteOpen) setPaletteUsed(true); }, [paletteOpen]);

  // First run: the walkthrough opens until it was finished or skipped once; the settings can open it again.
  useEffect(() => { if (settings && !settings.onboarding_done) setOnboarding(true); }, [settings]);
  useEffect(() => {
    const open = () => setOnboarding(true);
    window.addEventListener(onboardingEvent, open);
    return () => window.removeEventListener(onboardingEvent, open);
  }, []);

  const togglePinned = () => {
    setPinned((value) => {
      const next = !value;
      try { window.localStorage.setItem(pinnedStorageKey, String(next)); } catch { /* storage unavailable */ }
      return next;
    });
    setHovered(false);
  };

  // Opens with a short delay so passing the mouse over the rail does not flash the panel.
  const hover = (value: boolean) => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setHovered(value), value ? 90 : 180);
  };

  const openTasks = data.tasks.filter((task) => task.status !== 'done').length;
  const expanded = pinned || hovered;

  /** A page with its sub-pages: folded into one icon on the closed rail, a small tree in the open panel. */
  const family = (item: ResolvedNavItem, open: boolean) => {
    const childActive = item.children.some((child) => isActive(activePath, child.href));
    const showChildren = open && item.children.length > 0 && (childActive || unfolded.includes(item.id));
    const hasBadge = item.id === 'tasks' && openTasks > 0;
    const link = (entry: PageItem, nested: boolean) => (
      <RailLink key={entry.id} item={entry} label={t(entry.key)} open={open} nested={nested} onNavigate={setPendingHref} onIntent={router.prefetch}
        active={isActive(activePath, entry.href) || (!nested && !open && childActive)}
        badge={entry.id === 'tasks' && openTasks > 0 ? openTasks : undefined} />
    );
    if (!item.children.length) return link(item, false);
    return (
      <Fragment key={item.id}>
        <div className="relative">
          {link(item, false)}
          {open && (
            <button type="button" aria-expanded={showChildren} aria-label={`${t('sidebar.subpages')}: ${t(item.key)}`}
              onClick={() => setUnfolded((list) => (list.includes(item.id) ? list.filter((id) => id !== item.id) : [...list, item.id]))}
              className={cn('absolute top-1 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors duration-300 hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring', hasBadge ? 'right-8' : 'right-1')}>
              <ChevronRight className={cn('h-3.5 w-3.5 transition-transform duration-300 ease-ds', showChildren && 'rotate-90')} strokeWidth={1.6} />
            </button>
          )}
        </div>
        {showChildren && item.children.map((child) => link(child, true))}
      </Fragment>
    );
  };

  const navList = (open: boolean, withPin: boolean) => (
    <div className="flex min-h-full flex-col gap-2">
      {withPin && (
        <RailButton open={open} label={pinned ? t('shell.collapse') : t('shell.expand')} icon={pinned ? PanelLeftClose : PanelLeftOpen}
          onClick={togglePinned} pressed={pinned} />
      )}
      {groups.map((group) => {
        const list = group.items.map((item) => family(item, open));
        return group.id === 'bottom' ? <div key={group.id} className="mt-auto flex flex-col gap-[2px] pt-2">{list}</div> : (
          <div key={group.id} className="flex flex-col gap-[2px]">
            {group.key && (
              <p className={cn('ds-label overflow-hidden whitespace-nowrap px-2.5 transition-[max-height,opacity] duration-500 ease-ds', open ? 'max-h-5 opacity-100' : 'max-h-0 opacity-0')} aria-hidden={!open}>
                {t(group.key)}
              </p>
            )}
            {list}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen" style={{ '--titlebar-inset': desktop?.os === 'macos' ? '72px' : '0px' } as React.CSSProperties}>
      <AmbientBackground />
      {/* Brand: plain text, always top left – also inside the opened navigation panel. In the desktop
          app on macOS it moves right of the window buttons (--titlebar-inset). */}
      <Link href="/" className="fixed left-[calc(1rem+var(--titlebar-inset))] top-0 z-50 flex h-14 items-center rounded-full focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
        <BrandWord />
      </Link>

      {/* Floating top bar: no surface of its own, content scrolls underneath the glass pieces. In the
          desktop app it is the window's title bar: its free space moves the window. */}
      <header {...titleBarProps(desktop)}
        className={cn('fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 pl-[calc(120px+var(--titlebar-inset))] pr-3 transition-[padding] duration-700 ease-ds sm:pr-4',
          desktop ? 'select-none' : 'pointer-events-none', pinned && 'lg:pl-[calc(284px+var(--titlebar-inset))]')}>
        <div className="pointer-events-auto hidden min-w-0 items-center md:flex" style={{ maxWidth: `calc(50vw - 15.5rem - ${pinned ? 284 : 120}px - var(--titlebar-inset))` }}>
          <Suspense fallback={null}><Breadcrumbs /></Suspense>
        </div>

        <button type="button" onClick={() => setPaletteOpen(true)}
          className="group pointer-events-auto ml-auto flex h-8 w-8 items-center gap-2 rounded-full bg-field px-0 text-[13px] text-muted-foreground shadow-sm backdrop-blur-glass transition-[background-color,box-shadow,color] duration-600 ease-ds hover:bg-field-hover hover:text-foreground hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring sm:absolute sm:left-1/2 sm:ml-0 sm:w-[20rem] sm:-translate-x-1/2 sm:px-3.5 lg:w-[28rem]">
          <Search className="mx-auto h-3.5 w-3.5 shrink-0 sm:mx-0" strokeWidth={1.6} />
          <span className="hidden flex-1 truncate text-left sm:inline">{t('search.trigger')}</span>
          <kbd className="ds-kbd pointer-events-none hidden select-none sm:inline-flex">{modifier} K</kbd>
        </button>

        <div className="pointer-events-auto flex items-center justify-end gap-1.5 sm:ml-auto">
          <TelegramMenu />
          <AccountMenu />
          {desktop && <WindowControls win={desktop} className="ml-1.5" />}
        </div>
      </header>

      {/* Desktop rail: free-standing icons; hover or the pin button opens the full panel. */}
      <nav aria-label="Navigation"
        className={cn('fixed inset-y-0 left-0 z-40 hidden flex-col overflow-hidden pt-14 transition-[width,background-color,box-shadow] duration-700 ease-ds lg:flex',
          expanded ? 'ds-menu w-[248px]' : 'w-[56px] bg-transparent shadow-none')}
        onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)}
        onFocusCapture={() => hover(true)}
        onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hover(false); }}>
        <div className="no-scrollbar h-full overflow-y-auto overflow-x-hidden px-3 pb-3 pt-0.5">
          {navList(expanded, true)}
        </div>
      </nav>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-black/20 backdrop-blur-[3px] duration-500 animate-in fade-in" aria-label={t('shell.closeNav')} onClick={() => setMobileOpen(false)} />
          <aside className="pb-safe ds-menu no-scrollbar absolute inset-y-3 left-3 w-[min(17rem,85vw)] overflow-y-auto rounded-2xl p-2 duration-700 ease-ds animate-in slide-in-from-left">
            {navList(true, false)}
          </aside>
        </div>
      )}

      <div className={cn('pt-14 transition-[padding] duration-700 ease-ds', pinned ? 'lg:pl-[248px]' : 'lg:pl-[56px]')}>
        <main className={cn('w-full pb-24 lg:pb-0', fullBleed.some((href) => isActive(pathname, href)) ? 'min-h-0' : 'mx-auto max-w-[1800px] px-4 py-5 sm:px-6 lg:px-10 lg:py-8 2xl:px-14')}>
          {error && (
            <div role="alert" className="ds-menu mb-6 flex flex-col gap-3 rounded-[16px] px-3.5 py-[11px] text-[13px] animate-in fade-in slide-in-from-top-2 sm:flex-row sm:items-center">
              <p className="flex-1"><span className="font-semibold text-destructive">{t('common.errorLoading')}</span> <span className="text-muted-foreground">{error}</span></p>
              <Button size="sm" variant="outline" onClick={() => void reload()}>{t('common.retry')}</Button>
            </div>
          )}
          <div key={pathname} className="page-enter">{children}</div>
        </main>
      </div>

      {/* Phone dock: free-standing glass buttons at the bottom edge. */}
      <nav aria-label={t('shell.openNav')} className="pb-safe pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center lg:hidden">
        <div className="pointer-events-auto flex items-center gap-2">
          {mobileNav.map((item) => {
            const active = item.href !== '#menu' && isActive(pathname, item.href);
            const className = cn('ds-float flex h-11 w-11 items-center justify-center rounded-full shadow-sm transition-[background-color,box-shadow,transform] duration-500 ease-ds active:scale-95',
              active ? 'bg-primary text-primary-foreground' : 'ds-glass text-foreground');
            const icon = <item.icon className="h-[18px] w-[18px]" strokeWidth={1.6} />;
            return item.href === '#menu' ? (
              <button key={item.href} type="button" onClick={() => setMobileOpen(true)} className={className} aria-label={t('shell.openNav')}>{icon}</button>
            ) : (
              <Link key={item.href} href={item.href} className={className} aria-label={t(item.key)} aria-current={active ? 'page' : undefined}>{icon}</Link>
            );
          })}
        </div>
      </nav>

      {onboarding && <Walkthrough onClose={() => setOnboarding(false)} />}
      {paletteUsed && <GlobalSearch open={paletteOpen} onOpenChange={setPaletteOpen} pages={navItems.map((item) => ({ href: item.href, label: t(item.key), icon: item.icon }))} />}
    </div>
  );
}

/**
 * One rail entry. Closed: a free-standing glass circle (active = primary). Open: a full-width nav row.
 * The icon keeps its position between both states, so opening the panel only grows the rows.
 */
const railItemClass = (open: boolean, active: boolean) => cn(
  'group relative flex h-[32px] shrink-0 items-center gap-2.5 overflow-hidden rounded-full pl-[8px] text-[13px] transition-[width,background-color,box-shadow,color,transform] duration-600 ease-ds focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring active:scale-[0.97]',
  open
    ? cn('w-full pr-2.5 shadow-none', active ? 'bg-accent font-medium text-foreground' : 'bg-transparent text-[hsl(var(--fg-2)/var(--fg-2-a))] hover:bg-accent hover:text-foreground')
    : cn('w-[32px]', active ? 'bg-primary text-primary-foreground shadow-sm hover:shadow-md' : 'ds-glass text-foreground hover:bg-glass-hover hover:shadow-md'),
);

function RailLabel({ open, children }: { open: boolean; children: React.ReactNode }) {
  return <span className={cn('flex-1 truncate whitespace-nowrap text-left transition-opacity duration-500 ease-ds', open ? 'opacity-100 delay-100' : 'opacity-0')}>{children}</span>;
}

function RailLink({ item, label, active, open, badge, nested, onNavigate, onIntent }: {
  item: NavItem; label: string; active: boolean; open: boolean; badge?: number; nested?: boolean;
  onNavigate?: (href: string) => void; onIntent?: (href: string) => void;
}) {
  return (
    <Link href={item.href} aria-current={active ? 'page' : undefined} aria-label={open ? undefined : label} className={cn(railItemClass(open, active), nested && 'ml-[18px] w-[calc(100%-18px)] duration-300 animate-in fade-in slide-in-from-top-1')}
      onMouseEnter={() => onIntent?.(item.href)} onFocus={() => onIntent?.(item.href)}
      onClick={(event) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) onNavigate?.(item.href); }}>
      <item.icon className={cn('h-4 w-4 shrink-0', open && active && 'text-brand')} style={{ width: 16, height: 16 }} strokeWidth={1.6} />
      <RailLabel open={open}>{label}</RailLabel>
      {badge !== undefined && (
        <span key={badge}
          className={cn('inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold tabular-nums transition-colors duration-500 ease-ds animate-in zoom-in-50',
            open ? 'mr-0 bg-foreground text-background' : 'absolute right-0 top-0 scale-90 bg-foreground text-background ring-2 ring-background',
            !open && active && 'bg-primary-foreground text-primary ring-primary')}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

function RailButton({ open, label, icon: Icon, onClick, pressed }: { open: boolean; label: string; icon: LucideIcon; onClick: () => void; pressed: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={pressed} aria-label={label} className={railItemClass(open, false)}>
      <Icon className="shrink-0" style={{ width: 16, height: 16 }} strokeWidth={1.6} />
      <RailLabel open={open}>{label}</RailLabel>
    </button>
  );
}

/** Signed-in account with links to its settings and sign-out (only with accounts). */
function AccountMenu() {
  const { t } = useI18n();
  const { mode, user, signOut } = useAccount();
  if (mode !== 'multi' || !user) return null;
  const name = user.display_name || user.username;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t('account.menu')} title={name}
          className="ds-glass flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold uppercase shadow-sm transition-[background-color,box-shadow] duration-500 ease-ds hover:bg-glass-hover hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
          {name.slice(0, 2)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[13rem]">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">@{user.username}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/settings?tab=account"><UserRound />{t('account.title')}</Link></DropdownMenuItem>
        {user.is_admin && <DropdownMenuItem asChild><Link href="/settings?tab=users"><Users />{t('account.usersTitle')}</Link></DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}><LogOut />{t('account.signOut')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The brand name; its letters drift up and back in an endless, quiet loop. */
function BrandWord() {
  return (
    <p className="brand-word whitespace-nowrap text-[13px] font-semibold leading-tight tracking-[-0.01em]" aria-label="Anamnesies">
      {Array.from('Anamnesies').map((letter, index) => (
        <span key={index} aria-hidden="true" style={{ '--i': index } as React.CSSProperties}>{letter}</span>
      ))}
    </p>
  );
}
