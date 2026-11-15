'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, ArrowUpRight, Download, FileText, History, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { BarChart, BarList } from '@/components/charts';
import { useI18n } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CountUp, EmptyState, PageHeader, PageSkeleton, SearchInput } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { api, peek } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import { entityHref, entityIcons, entityLabelKeys, entityTypes } from '@/lib/entities';
import type { ActivityAction, EntityType, WarehouseAction, WarehouseEvent, WarehouseEvents, WarehouseHistory, WarehouseSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

const ANY = 'any';
const PAGE = 100;
const actions: ActivityAction[] = ['create', 'update', 'archive', 'restore', 'delete'];
const sources = ['app', 'mcp', 'telegram'] as const;
const fg2 = 'text-[hsl(var(--fg-2)/var(--fg-2-a))]';
type Tab = 'history' | 'inventory' | 'deleted';
type Filters = { q: string; type: string; action: string; source: string; from: string; to: string };
const noFilters: Filters = { q: '', type: ANY, action: ANY, source: ANY, from: '', to: '' };

const dotOf = (action: WarehouseAction) =>
  (action === 'create' ? 'bg-success' : action === 'delete' ? 'bg-destructive' : action === 'archive' ? 'bg-warning' : action === 'restore' ? 'bg-info' : 'bg-foreground/40');

function queryOf(filters: Filters, extra: Record<string, string | number> = {}) {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.type !== ANY) params.set('type', filters.type);
  if (filters.action !== ANY) params.set('action', filters.action);
  if (filters.source !== ANY) params.set('source', filters.source);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  for (const [key, value] of Object.entries(extra)) params.set(key, String(value));
  return params.toString();
}

export default function WarehousePage() {
  return <Suspense fallback={<PageSkeleton />}><Warehouse /></Suspense>;
}

function Warehouse() {
  const { t, language } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>('history');
  const [summary, setSummary] = useState<WarehouseSummary | null>(() => peek<WarehouseSummary>('/warehouse/summary') ?? null);
  const [filters, setFilters] = useState<Filters>(noFilters);
  const [applied, setApplied] = useState<Filters>(noFilters);
  const [events, setEvents] = useState<WarehouseEvents | null>(null);
  const [deleted, setDeleted] = useState<WarehouseEvent[] | null>(null);
  const [deletedQuery, setDeletedQuery] = useState('');
  const [version, setVersion] = useState(0);

  const openType = searchParams.get('type') as EntityType | null;
  const openId = searchParams.get('id');
  const open = (type: EntityType, id: string) => router.replace(`/warehouse?type=${type}&id=${id}`, { scroll: false });
  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  // Typing does not send a request per key stroke.
  useEffect(() => {
    const timer = window.setTimeout(() => setApplied(filters), 250);
    return () => window.clearTimeout(timer);
  }, [filters]);

  useEffect(() => { void api.get<WarehouseSummary>('/warehouse/summary').then(setSummary).catch(() => undefined); }, [version]);
  useEffect(() => {
    let current = true;
    void api.get<WarehouseEvents>(`/warehouse/events?${queryOf(applied, { limit: PAGE })}`).then((result) => { if (current) setEvents(result); }).catch(() => { if (current) setEvents({ total: 0, items: [] }); });
    return () => { current = false; };
  }, [applied, version]);
  useEffect(() => {
    if (tab !== 'deleted') return;
    void api.get<WarehouseEvent[]>('/warehouse/deleted').then(setDeleted).catch(() => setDeleted([]));
  }, [tab, version]);

  const months = useMemo(() => {
    const result: { key: string; label: string; value: number }[] = [];
    const now = new Date();
    for (let back = 11; back >= 0; back -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - back, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const counts = summary?.months[key] ?? {};
      result.push({ key, label: date.toLocaleDateString(language, { month: 'short' }), value: Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0) });
    }
    return result;
  }, [language, summary]);

  if (!summary) return <PageSkeleton />;

  const types = entityTypes.filter((type) => summary.by_type[type]);
  const totals = types.reduce((sum, type) => ({
    tracked: sum.tracked + summary.by_type[type].active + summary.by_type[type].archived + summary.by_type[type].deleted,
    deleted: sum.deleted + summary.by_type[type].deleted,
  }), { tracked: 0, deleted: 0 });
  const sourceLabel = (source: string) => (['app', 'mcp', 'telegram', 'system'].includes(source) ? t(`activity.via_${source as 'app'}`) : source);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const filtered = (Object.keys(noFilters) as (keyof Filters)[]).some((key) => filters[key] !== noFilters[key]);

  async function loadMore() {
    if (!events) return;
    const more = await api.get<WarehouseEvents>(`/warehouse/events?${queryOf(applied, { limit: PAGE, offset: events.items.length })}`);
    setEvents({ total: more.total, items: [...events.items, ...more.items] });
  }

  const facts: [string, React.ReactNode][] = [
    [t('warehouse.events'), <CountUp key="events" value={summary.events} />],
    [t('warehouse.versions'), <CountUp key="versions" value={summary.versions} />],
    [t('warehouse.tracked'), <CountUp key="tracked" value={totals.tracked} />],
    [t('warehouse.deleted'), <CountUp key="deleted" value={totals.deleted} />],
    [t('warehouse.since'), summary.first_at ? new Date(summary.first_at).toLocaleDateString(language, { day: 'numeric', month: 'short', year: 'numeric' }) : '–'],
  ];
  const visibleDeleted = (deleted ?? []).filter((entry) => !deletedQuery.trim() || (entry.title ?? '').toLowerCase().includes(deletedQuery.trim().toLowerCase()));

  return (
    <div>
      <PageHeader title={t('warehouse.title')} description={t('warehouse.description')}
        action={(
          <>
            <Button variant="outline" asChild><a href={`/api/v1/warehouse/export?${queryOf(applied, { format: 'csv' })}`} download><Download />{t('warehouse.exportCsv')}</a></Button>
            <Button variant="outline" asChild><a href={`/api/v1/warehouse/export?${queryOf(applied, { format: 'json' })}`} download><Download />{t('warehouse.exportJson')}</a></Button>
          </>
        )} />

      <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {facts.map(([label, value]) => (
          <div key={label} className="rounded-[18px] bg-card p-[18px] shadow-sm">
            <dt className="ds-label">{label}</dt>
            <dd className="mt-2 text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented value={tab} onChange={setTab} label={t('warehouse.title')}
          options={[{ value: 'history', label: t('warehouse.tabHistory') }, { value: 'inventory', label: t('warehouse.tabInventory') }, { value: 'deleted', label: t('warehouse.tabDeleted') }]} />
        <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" asChild><Link href="/archive"><Archive />{t('warehouse.archiveLink')}</Link></Button>
      </div>

      {tab === 'history' && (
        <div className="space-y-5">
          <div className="rounded-[18px] bg-card p-[18px] shadow-sm">
            <p className="ds-label mb-4">{t('warehouse.perMonth')}</p>
            <BarChart data={months} height={96} ariaLabel={t('warehouse.perMonth')} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={filters.q} onChange={(value) => set('q', value)} placeholder={t('warehouse.search')} className="sm:w-80" />
            <FilterSelect label={t('warehouse.allTypes')} value={filters.type} onChange={(value) => set('type', value)}
              options={types.map((type) => ({ value: type, label: t(entityLabelKeys[type]) }))} />
            <FilterSelect label={t('warehouse.allActions')} value={filters.action} onChange={(value) => set('action', value)}
              options={actions.map((action) => ({ value: action, label: t(`activity.${action}`) }))} />
            <FilterSelect label={t('warehouse.allSources')} value={filters.source} onChange={(value) => set('source', value)}
              options={sources.map((source) => ({ value: source, label: sourceLabel(source) }))} />
            <Input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => set('from', event.target.value)} aria-label={t('warehouse.from')} className="h-9 w-[9.5rem]" />
            <Input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => set('to', event.target.value)} aria-label={t('warehouse.to')} className="h-9 w-[9.5rem]" />
            {filtered && <Button variant="ghost" size="sm" onClick={() => setFilters(noFilters)}>{t('filters.reset')}</Button>}
          </div>

          {!events ? <PageSkeleton /> : events.items.length === 0 ? <EmptyState icon={History} title={t('warehouse.empty')} /> : (
            <>
              <ul className="space-y-0.5">
                {events.items.map((entry) => <EventRow key={entry.id} entry={entry} sourceLabel={sourceLabel} onOpen={() => open(entry.entity_type, entry.entity_id)} />)}
              </ul>
              <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                <span>{t('warehouse.shown', { count: events.items.length, total: events.total })}</span>
                {events.items.length < events.total && <Button variant="outline" size="sm" onClick={() => void loadMore()}>{t('warehouse.more')}</Button>}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'inventory' && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="rounded-[18px] bg-card p-[18px] shadow-sm">
            <div className="grid grid-cols-[minmax(0,1fr)_repeat(4,4.5rem)] gap-x-2 px-2.5 pb-2 text-right">
              <span className="ds-label text-left">{t('warehouse.type')}</span>
              {[t('warehouse.active'), t('warehouse.archived'), t('warehouse.deleted'), t('warehouse.events')].map((label) => <span key={label} className="ds-label truncate">{label}</span>)}
            </div>
            <ul className="space-y-0.5">
              {types.map((type) => {
                const Icon = entityIcons[type];
                const row = summary.by_type[type];
                return (
                  <li key={type}>
                    <button type="button" onClick={() => { setFilters({ ...noFilters, type }); setTab('history'); }}
                      className="grid h-[38px] w-full grid-cols-[minmax(0,1fr)_repeat(4,4.5rem)] items-center gap-x-2 rounded-full px-2.5 text-right text-[13px] transition-colors duration-300 ease-ds hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
                      <span className="flex min-w-0 items-center gap-2.5 text-left font-medium"><Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.6} /><span className="truncate">{t(entityLabelKeys[type])}</span></span>
                      {[row.active, row.archived, row.deleted, row.events].map((value, index) => <span key={index} className={cn('font-mono text-xs tabular-nums', value ? fg2 : 'text-muted-foreground/50')}>{value.toLocaleString(language)}</span>)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="space-y-5">
            <div className="rounded-[18px] bg-card p-[18px] shadow-sm">
              <p className="ds-label mb-4">{t('warehouse.bySource')}</p>
              <BarList items={Object.entries(summary.by_source).sort((a, b) => b[1] - a[1]).map(([source, value]) => ({ label: sourceLabel(source), value }))} />
            </div>
            <div className="rounded-[18px] bg-card p-[18px] shadow-sm">
              <p className="ds-label mb-4">{t('warehouse.byAction')}</p>
              <BarList items={actions.map((action) => ({ label: t(`activity.${action}`), value: summary.by_action[action] ?? 0 })).sort((a, b) => b.value - a.value)} />
            </div>
          </div>
        </div>
      )}

      {tab === 'deleted' && (
        deleted === null ? <PageSkeleton /> : deleted.length === 0 ? <EmptyState icon={Trash2} title={t('warehouse.noDeleted')} description={t('warehouse.noDeletedDesc')} /> : (
          <div className="space-y-4">
            <SearchInput value={deletedQuery} onChange={setDeletedQuery} placeholder={t('common.search')} className="sm:w-80" />
            <ul className="space-y-0.5">
              {visibleDeleted.map((entry) => <EventRow key={entry.id} entry={entry} sourceLabel={sourceLabel} onOpen={() => open(entry.entity_type, entry.entity_id)} />)}
            </ul>
          </div>
        )
      )}

      <HistoryDialog type={openType} id={openId} sourceLabel={sourceLabel} onChanged={refresh} onClose={() => router.replace('/warehouse', { scroll: false })} />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-[10rem]" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{label}</SelectItem>
        {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** One thing that happened: what, to which entry, through which channel and when. */
function EventRow({ entry, sourceLabel, onOpen }: { entry: WarehouseEvent; sourceLabel: (source: string) => string; onOpen: () => void }) {
  const { t, language } = useI18n();
  const Icon = entityIcons[entry.entity_type] ?? FileText;
  return (
    <li>
      <button type="button" onClick={onOpen}
        className="grid h-[38px] w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3 rounded-full px-2.5 text-left text-[13px] transition-colors duration-300 ease-ds hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring md:grid-cols-[18px_minmax(0,1.2fr)_minmax(0,1fr)_5.5rem_9rem]">
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
        <span className={cn('truncate font-medium', entry.action === 'delete' && 'text-muted-foreground line-through')}>{entry.title || t('common.untitled')}</span>
        <span className={cn('hidden min-w-0 items-center gap-2 text-xs md:flex', fg2)}>
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotOf(entry.action))} />
          <span className="shrink-0">{t(`activity.${entry.action}`)}</span>
          {entry.changed && entry.changed.length > 0 && <span className="truncate font-mono text-[11px] text-muted-foreground">{entry.changed.join(', ')}</span>}
        </span>
        <span className="hidden text-xs text-muted-foreground md:block">{sourceLabel(entry.source)}</span>
        <span className={cn('text-right font-mono text-[11px] tabular-nums', fg2)}>{formatDateTime(entry.at, language)}</span>
      </button>
    </li>
  );
}

function show(value: unknown, empty: string): string {
  if (value === null || value === undefined || value === '') return empty;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** Everything the warehouse knows about one entry: its changes, its earlier versions, and the way back. */
function HistoryDialog({ type, id, sourceLabel, onChanged, onClose }: {
  type: EntityType | null;
  id: string | null;
  sourceLabel: (source: string) => string;
  onChanged: () => void;
  onClose: () => void;
}) {
  const { t, language } = useI18n();
  const { reload, data } = useWorkspace();
  const [history, setHistory] = useState<WarehouseHistory | null>(null);
  const [missing, setMissing] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setHistory(null);
    setMissing(false);
    setExpanded(null);
    if (!type || !id) return;
    let current = true;
    void api.get<WarehouseHistory>(`/warehouse/entities/${type}/${id}`).then((result) => { if (current) setHistory(result); }).catch(() => { if (current) setMissing(true); });
    return () => { current = false; };
  }, [id, type]);

  async function restore(eventId?: number) {
    if (!history) return;
    setBusy(true);
    try {
      const next = await api.post<WarehouseHistory>(`/warehouse/entities/${history.type}/${history.id}/restore${eventId ? `?event_id=${eventId}` : ''}`);
      setHistory(next);
      toast.success(eventId ? t('warehouse.reverted') : t('warehouse.restored', { name: history.title || t('common.untitled') }));
      await reload();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const empty = t('warehouse.emptyValue');
  /** Folders and projects are shown by name instead of by id. */
  const display = (field: string, value: unknown) => {
    const list = field === 'folder_id' || field === 'parent_id' ? data.folders : field === 'project_id' ? data.projects : null;
    return list?.find((item) => item.id === value)?.name ?? show(value, empty);
  };
  const Icon = history ? entityIcons[history.type] ?? FileText : History;
  const date = history?.snapshot && typeof history.snapshot.date === 'string' ? history.snapshot.date : undefined;

  return (
    <Dialog open={Boolean(type && id)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.6} />
            <span className="truncate">{history ? history.title || t('common.untitled') : t('warehouse.tabHistory')}</span>
          </DialogTitle>
        </DialogHeader>

        {missing ? <p className="py-8 text-center text-sm text-muted-foreground">{t('warehouse.noHistory')}</p> : !history ? <PageSkeleton /> : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="ds-glass inline-flex h-6 items-center gap-1.5 rounded-full px-2.5">
                <span className={cn('h-1.5 w-1.5 rounded-full', history.state === 'active' ? 'bg-success' : history.state === 'archived' ? 'bg-warning' : 'bg-destructive')} />
                {t(`warehouse.state_${history.state}`)}
              </span>
              <span className="text-muted-foreground">{t(entityLabelKeys[history.type])}</span>
              <span className="ml-auto flex gap-2">
                {history.state !== 'deleted' && (
                  <Button variant="outline" size="sm" asChild><Link href={entityHref(history.type, history.id, date)}><ArrowUpRight />{t('warehouse.openEntry')}</Link></Button>
                )}
                {history.restorable && <Button size="sm" disabled={busy} onClick={() => void restore()}><RotateCcw />{t('warehouse.restore')}</Button>}
              </span>
            </div>
            {history.state === 'deleted' && !history.restorable && history.type === 'file' && <p className="text-xs text-muted-foreground">{t('warehouse.fileGone')}</p>}

            <ol className="relative space-y-4 pl-4 before:absolute before:inset-y-1 before:left-0 before:w-px before:bg-border">
              {history.timeline.map((entry, index) => {
                const changes = Object.entries(entry.changes ?? {});
                return (
                  <li key={entry.id} className="relative">
                    <span className={cn('absolute -left-[20px] top-1.5 h-2 w-2 rounded-full ring-2 ring-background', dotOf(entry.action))} />
                    <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-medium">{t(`activity.${entry.action}`)}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(entry.at, language)} · {sourceLabel(entry.source)}</span>
                    </div>
                    {changes.length > 0 && (
                      <dl className="mt-2 space-y-1.5 rounded-xl bg-muted/60 p-3 text-xs">
                        {changes.map(([field, [before, after]]) => (
                          <div key={field} className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
                            <dt className="font-mono text-[11px] text-muted-foreground">{field}</dt>
                            <dd className="min-w-0 whitespace-pre-wrap break-words">
                              <span className="text-muted-foreground line-through decoration-foreground/30">{display(field, before).slice(0, 280)}</span>
                              <span className="px-1.5 text-muted-foreground">→</span>
                              <span>{display(field, after).slice(0, 280)}</span>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {entry.snapshot && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>
                          {expanded === entry.id ? t('warehouse.hideVersion') : t('warehouse.showVersion')}
                        </Button>
                        {history.state !== 'deleted' && index > 0 && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" disabled={busy} onClick={() => void restore(entry.id)}>
                            <RotateCcw />{t('warehouse.restoreVersion')}
                          </Button>
                        )}
                      </div>
                    )}
                    {expanded === entry.id && entry.snapshot && (
                      <dl className="mt-2 max-h-72 space-y-1.5 overflow-y-auto rounded-xl bg-field p-3 text-xs">
                        {Object.entries(entry.snapshot).filter(([field]) => field !== 'id' && field !== 'storage_key').map(([field, value]) => (
                          <div key={field} className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
                            <dt className="font-mono text-[11px] text-muted-foreground">{field}</dt>
                            <dd className={cn('min-w-0 whitespace-pre-wrap break-words', (value === null || value === '') && 'text-muted-foreground')}>{display(field, value)}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
