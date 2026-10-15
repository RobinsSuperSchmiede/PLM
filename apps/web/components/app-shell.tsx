'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity, Archive, ArrowUp, Bell, BookOpen, CalendarDays, CheckSquare2,
  ChevronLeft, Command, Database, FileText, FolderKanban, Home, Lightbulb, ListTodo,
  Menu, NotebookPen, Plus, Search, Settings, Sparkles, X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/workspace-provider';
import { cn } from '@/lib/utils';

const navItems: { label: string; href: string; icon: LucideIcon }[] = [
  { label: 'Dashboard', href: '/', icon: Home },
  { label: 'Projects', href: '/projects', icon: FolderKanban },
  { label: 'Tasks', href: '/tasks', icon: CheckSquare2 },
  { label: 'Calendar', href: '/calendar', icon: CalendarDays },
  { label: 'Meetings', href: '/meetings', icon: Activity },
  { label: 'Notes', href: '/notes', icon: NotebookPen },
  { label: 'Lists', href: '/lists', icon: ListTodo },
  { label: 'Ideas', href: '/ideas', icon: Lightbulb },
  { label: 'Knowledge', href: '/knowledge', icon: BookOpen },
  { label: 'Database', href: '/database', icon: Database },
  { label: 'AI Assistant', href: '/ai-assistant', icon: Sparkles },
  { label: 'Developer Center', href: '/developer-center', icon: Archive },
];

const pageNames = Object.fromEntries(navItems.map((item) => [item.href, item.label]));

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data, storageError } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState('Ctrl');

  useEffect(() => {
    setPlatform(navigator.platform.includes('Mac') ? '⌘' : 'Ctrl');
    const openPalette = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', openPalette);
    return () => window.removeEventListener('keydown', openPalette);
  }, []);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return navItems.filter((item) => !term || item.label.toLowerCase().includes(term));
  }, [query]);
  const contentResults = useMemo(() => [
    ...data.tasks.map((item) => ({ ...item, kind: 'Task', href: '/tasks', icon: CheckSquare2 })),
    ...data.notes.map((item) => ({ ...item, kind: 'Note', href: '/notes', icon: FileText })),
    ...data.lists.map((item) => ({ ...item, kind: 'List', href: '/lists', icon: ListTodo })),
    ...data.events.map((item) => ({ ...item, kind: 'Event', href: '/calendar', icon: CalendarDays })),
    ...data.records.map((item) => ({ ...item, title: item.name, kind: 'Record', href: '/database', icon: Database })),
  ].filter((item) => query.trim() && item.title.toLowerCase().includes(query.trim().toLowerCase())), [data, query]);
  const title = pageNames[pathname] || 'Workspace';
  const SidebarIcon = Menu;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col border-r border-border bg-card transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
            collapsed && 'lg:w-[66px]',
            mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          )}
          aria-label="Hauptnavigation"
        >
          <div className={cn('flex h-[58px] items-center border-b border-border px-3', collapsed ? 'lg:justify-center' : 'gap-3')}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-foreground text-[10px] font-bold tracking-tight text-background">PLM</div>
            <div className={cn('min-w-0 flex-1 transition-opacity', collapsed && 'lg:hidden')}>
              <p className="truncate text-[13px] font-semibold">Personal workspace</p>
              <p className="text-[10px] text-muted-foreground">LOCAL · PRIVATE</p>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Navigation schließen">
              <X className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn('hidden h-7 w-7 shrink-0 lg:inline-flex', collapsed && 'lg:hidden')}
              onClick={() => setCollapsed(true)}
              aria-label="Sidebar einklappen"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Bereiche">
            {!collapsed && <p className="mb-2 px-2 pt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Workspace</p>}
            {navItems.map(({ label, href, icon: Icon }) => {
              const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
              const count = href === '/tasks' ? data.tasks.filter((task) => task.status !== 'done').length : undefined;
              return (
                <Link
                  key={href}
                  href={href}
                  title={collapsed ? label : undefined}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group flex h-8 items-center gap-2.5 rounded-md px-2 text-[12px] transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                    active ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground',
                    collapsed && 'lg:justify-center lg:px-0',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span className={cn('min-w-0 flex-1 truncate', collapsed && 'lg:hidden')}>{label}</span>
                  {count !== undefined && !collapsed && <span className="text-[10px] tabular-nums text-muted-foreground">{count}</span>}
                </Link>
              );
            })}
          </nav>

          <div className="space-y-1 border-t border-border p-2">
            {!collapsed && (
              <div className="mb-1 flex items-center gap-2 rounded-md px-2 py-2 text-[10px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
                Local workspace
              </div>
            )}
            {collapsed && <Button variant="ghost" size="icon" className="hidden h-8 w-full lg:inline-flex" onClick={() => setCollapsed(false)} aria-label="Sidebar ausklappen"><Menu className="h-4 w-4" /></Button>}
            <Link href="/settings" title={collapsed ? 'Settings' : undefined} className={cn('flex h-8 items-center gap-2.5 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground', collapsed && 'lg:justify-center lg:px-0')}>
              <Settings className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span className={cn(collapsed && 'lg:hidden')}>Settings</span>
            </Link>
          </div>
        </aside>

        {mobileOpen && <button className="fixed inset-0 z-30 bg-black/60 lg:hidden" aria-label="Navigation schließen" onClick={() => setMobileOpen(false)} />}

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 h-[52px] border-b border-border bg-background/90 backdrop-blur">
            <div className="flex h-full items-center justify-between gap-3 px-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Navigation öffnen">
                  <SidebarIcon className="h-4 w-4" />
                </Button>
                <div className="hidden items-center gap-2 text-[11px] text-muted-foreground sm:flex" aria-label="Breadcrumb">
                  <span>Workspace</span><span aria-hidden="true">/</span><span className="font-medium text-foreground">{title}</span>
                </div>
                <span className="truncate text-[12px] font-medium sm:hidden">{title}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" className="h-8 w-[min(35vw,230px)] justify-start gap-2 px-2.5 text-[11px] font-normal text-muted-foreground sm:w-56" onClick={() => setPaletteOpen(true)}>
                  <Search className="h-3.5 w-3.5" /><span className="flex-1 text-left">Search workspace…</span>
                  <kbd className="hidden rounded border border-border px-1 py-0.5 text-[9px] sm:inline">{platform} K</kbd>
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Notifications"><Bell className="h-4 w-4" /></Button>
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 sm:px-6 sm:py-6">
            {storageError && <p role="alert" className="mb-4 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">{storageError}</p>}
            {children}
          </main>
          <footer className="border-t border-border px-6 py-2 text-[10px] text-muted-foreground">PLM · Local-first workspace</footer>
        </div>
      </div>

      {paletteOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 px-4 pt-[15vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) setPaletteOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-label="Workspace-Suche" className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Command className="h-4 w-4 text-muted-foreground" />
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Bereiche durchsuchen…" className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">ESC</kbd>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-1.5">
              {results.map(({ label, href, icon: Icon }) => (
                <Link key={href} href={href} onClick={() => { setPaletteOpen(false); setQuery(''); }} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none">
                  <Icon className="h-4 w-4 text-muted-foreground" /><span>{label}</span><ArrowUp className="ml-auto h-3 w-3 rotate-45 text-muted-foreground" />
                </Link>
              ))}
              {results.length === 0 && contentResults.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No results found.</p>}
              {query.trim() && contentResults.length > 0 && (
                <div className="mt-1 border-t border-border pt-1">
                  {contentResults.map((item) => {
                    const Icon = item.icon;
                    return <Link key={`${item.kind}-${item.id}`} href={item.href} onClick={() => { setPaletteOpen(false); setQuery(''); }} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent"><Icon className="h-4 w-4" /><span className="truncate text-foreground">{item.title}</span><span className="ml-auto text-[10px]">{item.kind}</span></Link>;
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-[10px] text-muted-foreground"><Plus className="h-3 w-3" /> Quick navigation <span className="ml-auto">ESC to close</span></div>
          </section>
        </div>
      )}
    </div>
  );
}
