import {
  Archive, BellRing, Bot, CalendarDays, CheckSquare2, Code2, Database, FolderKanban, FolderTree, Hash, Home, LifeBuoy, Lightbulb, ListTodo,
  type LucideIcon, Network, Send, Settings, Users,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { TranslationKey } from '@/lib/i18n';

export type NavGroupId = 'main' | 'plan' | 'knowledge' | 'system' | 'bottom';
export type NavItem = {
  id: string;
  key: TranslationKey;
  href: string;
  icon: LucideIcon;
  group: NavGroupId;
  /** Sub-pages sit folded under their parent instead of taking a row of their own. */
  parent?: string;
  /** Cannot be hidden (otherwise there would be no way back to the settings). */
  locked?: boolean;
};

export const navGroupKeys: Record<NavGroupId, TranslationKey | null> = {
  main: null, plan: 'nav.groupPlan', knowledge: 'nav.groupKnowledge', system: 'nav.groupSystem', bottom: null,
};
export const navGroupOrder: NavGroupId[] = ['main', 'plan', 'knowledge', 'system', 'bottom'];

/** Every page of the app. The explorer covers notes, documents, files and images in one place. */
export const navItems: NavItem[] = [
  { id: 'dashboard', key: 'nav.dashboard', href: '/', icon: Home, group: 'main' },
  { id: 'projects', key: 'nav.projects', href: '/projects', icon: FolderKanban, group: 'plan' },
  { id: 'tasks', key: 'nav.tasks', href: '/tasks', icon: CheckSquare2, group: 'plan' },
  { id: 'lists', key: 'nav.lists', href: '/lists', icon: ListTodo, group: 'plan', parent: 'tasks' },
  { id: 'calendar', key: 'nav.calendar', href: '/calendar', icon: CalendarDays, group: 'plan' },
  { id: 'reminders', key: 'nav.reminders', href: '/reminders', icon: BellRing, group: 'plan', parent: 'calendar' },
  { id: 'meetings', key: 'nav.meetings', href: '/meetings', icon: Users, group: 'plan', parent: 'calendar' },
  { id: 'explorer', key: 'nav.explorer', href: '/explorer', icon: FolderTree, group: 'knowledge' },
  { id: 'graph', key: 'nav.graph', href: '/graph', icon: Network, group: 'knowledge', parent: 'explorer' },
  { id: 'tags', key: 'nav.tags', href: '/tags', icon: Hash, group: 'knowledge', parent: 'explorer' },
  { id: 'ideas', key: 'nav.ideas', href: '/ideas', icon: Lightbulb, group: 'knowledge' },
  { id: 'assistant', key: 'nav.assistant', href: '/ai-assistant', icon: Bot, group: 'system' },
  { id: 'telegram', key: 'nav.telegram', href: '/telegram', icon: Send, group: 'system', parent: 'assistant' },
  { id: 'archive', key: 'nav.archive', href: '/archive', icon: Archive, group: 'system' },
  { id: 'developer', key: 'nav.developer', href: '/developer-center', icon: Code2, group: 'system' },
  { id: 'database', key: 'nav.database', href: '/database', icon: Database, group: 'system', parent: 'developer' },
  { id: 'docs', key: 'nav.docs', href: '/docs', icon: LifeBuoy, group: 'bottom' },
  { id: 'settings', key: 'nav.settings', href: '/settings', icon: Settings, group: 'bottom', locked: true },
];

/** Per-browser sidebar layout (Settings → Sidebar). */
export type SidebarPrefs = {
  /** Ids that are not shown at all (still reachable through the search). */
  hidden: string[];
  /** Sub-pages that get a row of their own instead of sitting under their parent. */
  promoted: string[];
  /** Top-level ids in the order the user arranged them; unknown ids keep their default place. */
  order: string[];
};

export const defaultSidebarPrefs: SidebarPrefs = { hidden: [], promoted: [], order: [] };
const storageKey = 'anamnesies.sidebar';
const changeEvent = 'anamnesies:sidebar';

export type ResolvedNavItem = NavItem & { children: NavItem[] };
export type ResolvedNavGroup = { id: NavGroupId; key: TranslationKey | null; items: ResolvedNavItem[] };

/** Is this item a row of its own (rather than folded under a visible parent)? */
export function isTopLevel(item: NavItem, prefs: SidebarPrefs): boolean {
  return !item.parent || prefs.promoted.includes(item.id) || prefs.hidden.includes(item.parent);
}

export function resolveNav(prefs: SidebarPrefs): ResolvedNavGroup[] {
  const visible = navItems.filter((item) => item.locked || !prefs.hidden.includes(item.id));
  const rank = (item: NavItem) => {
    const index = prefs.order.indexOf(item.id);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  return navGroupOrder.map((id) => ({
    id,
    key: navGroupKeys[id],
    items: visible
      .filter((item) => item.group === id && isTopLevel(item, prefs))
      // Array.prototype.sort is stable, so unranked items keep their default order.
      .sort((a, b) => rank(a) - rank(b))
      .map((item) => ({ ...item, children: visible.filter((child) => child.parent === item.id && !isTopLevel(child, prefs)) })),
  })).filter((group) => group.items.length > 0);
}

export function loadSidebarPrefs(): SidebarPrefs {
  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored ? { ...defaultSidebarPrefs, ...(JSON.parse(stored) as Partial<SidebarPrefs>) } : defaultSidebarPrefs;
  } catch {
    return defaultSidebarPrefs;
  }
}

/** The sidebar layout; every component using it updates as soon as the settings change it. */
export function useSidebarPrefs() {
  const [prefs, setPrefs] = useState<SidebarPrefs>(defaultSidebarPrefs);
  useEffect(() => {
    const sync = () => setPrefs(loadSidebarPrefs());
    sync();
    window.addEventListener(changeEvent, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(changeEvent, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const save = useCallback((next: SidebarPrefs) => {
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* storage unavailable */ }
    setPrefs(next);
    window.dispatchEvent(new Event(changeEvent));
  }, []);
  return [prefs, save] as const;
}
