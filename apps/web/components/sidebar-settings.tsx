'use client';

import { ArrowDown, ArrowUp, CornerDownRight, RotateCcw } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { type NavItem, type SidebarPrefs, defaultSidebarPrefs, isTopLevel, navGroupKeys, navGroupOrder, navItems, useSidebarPrefs } from '@/lib/navigation';
import { cn } from '@/lib/utils';

const toggled = (list: string[], id: string, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((entry) => entry !== id));

/** Settings → Sidebar: show or hide pages, fold sub-pages under their parent, and reorder the rows. */
export function SidebarSettings() {
  const { t } = useI18n();
  const [prefs, save] = useSidebarPrefs();
  const set = (patch: Partial<SidebarPrefs>) => save({ ...prefs, ...patch });

  const rank = (item: NavItem) => {
    const index = prefs.order.indexOf(item.id);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };

  /** Swaps a top-level row with its neighbour inside the same group. */
  function move(group: NavItem[], index: number, by: -1 | 1) {
    const ids = group.map((item) => item.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    // Every row gets an explicit rank, grouped rows first in their new order.
    const rest = navItems.map((item) => item.id).filter((id) => !ids.includes(id)).sort((a, b) => rank(navItems.find((item) => item.id === a)!) - rank(navItems.find((item) => item.id === b)!));
    set({ order: [...ids, ...rest] });
  }

  return (
    <Card className="max-w-3xl">
      <CardContent className="space-y-6 p-5">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{t('sidebar.title')}</p>
          <p className="text-sm text-muted-foreground">{t('sidebar.description')}</p>
        </div>

        {navGroupOrder.map((groupId) => {
          const members = navItems.filter((item) => item.group === groupId);
          const top = members.filter((item) => isTopLevel(item, prefs)).sort((a, b) => rank(a) - rank(b));
          const shownTop = top.filter((item) => !prefs.hidden.includes(item.id));
          const groupKey = navGroupKeys[groupId];
          return (
            <div key={groupId} className="space-y-1">
              {groupKey && <p className="ds-label px-1 pb-1">{t(groupKey)}</p>}
              <ul className="divide-y rounded-xl bg-muted/50">
                {top.map((item) => {
                  const position = shownTop.indexOf(item);
                  const nested = members.filter((child) => child.parent === item.id && !isTopLevel(child, prefs));
                  return (
                    <li key={item.id}>
                      <Row item={item} prefs={prefs} set={set}
                        onUp={position > 0 ? () => move(shownTop, position, -1) : undefined}
                        onDown={position >= 0 && position < shownTop.length - 1 ? () => move(shownTop, position, 1) : undefined} />
                      {nested.map((child) => <Row key={child.id} item={child} prefs={prefs} set={set} nested />)}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        <Button variant="outline" onClick={() => save(defaultSidebarPrefs)}><RotateCcw />{t('sidebar.reset')}</Button>
      </CardContent>
    </Card>
  );
}

function Row({ item, prefs, set, nested, onUp, onDown }: {
  item: NavItem;
  prefs: SidebarPrefs;
  set: (patch: Partial<SidebarPrefs>) => void;
  nested?: boolean;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const { t } = useI18n();
  const name = t(item.key);
  const shown = item.locked || !prefs.hidden.includes(item.id);
  const parent = navItems.find((entry) => entry.id === item.parent);
  // A sub-page whose parent is hidden already stands on its own; the switch would do nothing.
  const canFold = parent && !prefs.hidden.includes(parent.id);

  return (
    <div className={cn('flex min-h-11 items-center gap-3 px-3 py-1.5', nested && 'pl-6', !shown && 'opacity-55')}>
      {nested && <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} aria-hidden="true" />}
      <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.6} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-[13px]">{name}</span>

      {canFold && shown && (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground" title={t('sidebar.ownRowHint', { parent: t(parent.key) })}>
          <span className="hidden sm:inline">{t('sidebar.ownRow')}</span>
          <Switch checked={prefs.promoted.includes(item.id)} aria-label={`${t('sidebar.ownRow')}: ${name}`}
            onCheckedChange={(on) => set({ promoted: toggled(prefs.promoted, item.id, on) })} />
        </label>
      )}
      {!nested && (
        <span className="flex">
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground" disabled={!onUp} onClick={onUp} aria-label={t('sidebar.moveUp', { name })}><ArrowUp /></Button>
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground" disabled={!onDown} onClick={onDown} aria-label={t('sidebar.moveDown', { name })}><ArrowDown /></Button>
        </span>
      )}
      {item.locked
        ? <span className="w-[4.5rem] text-right text-xs text-muted-foreground">{t('sidebar.always')}</span>
        : <Switch checked={shown} aria-label={t('sidebar.show', { name })} onCheckedChange={(on) => set({ hidden: toggled(prefs.hidden, item.id, !on) })} />}
    </div>
  );
}
