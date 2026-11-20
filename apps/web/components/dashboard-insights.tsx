'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bot, FileText, Pin, Send } from 'lucide-react';

import { BarChart, Donut, Heatmap, Sparkline, type BarDatum } from '@/components/charts';
import { DotLoader } from '@/components/dot-loader';
import { useI18n } from '@/components/i18n-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Segmented } from '@/components/ui/segmented';
import { useWorkspace } from '@/components/workspace-provider';
import { api, peek } from '@/lib/api';
import { addDays, formatDate, formatDateTime, toDateKey } from '@/lib/dates';
import { entityHref, entityIcons, entityLabelKeys } from '@/lib/entities';
import { markdownToPlainText } from '@/lib/markdown';
import type { ActivityAction, ActivityEntry, EntityType, Stats } from '@/lib/types';
import { cn, formatBytes } from '@/lib/utils';

type Period = 'day' | 'week' | 'month';
type FeedScope = 'all' | 'agent';
const actions: ActivityAction[] = ['create', 'update', 'archive', 'restore', 'delete'];
const actionKeys = { create: 'insights.created', update: 'insights.updated', archive: 'insights.archived', restore: 'insights.restored', delete: 'insights.deleted' } as const;
const feedPath = '/activity?limit=120';
const fg2 = 'text-[hsl(var(--fg-2)/var(--fg-2-a))]';

function sum(day: Partial<Record<string, number>> | undefined) {
  return Object.values(day ?? {}).reduce<number>((total, value) => total + (value ?? 0), 0);
}

function mondayOf(date: Date) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return copy;
}

/** Everything below the first two rows of the home page: key figures, notes, what is new, trends, system. */
export function DashboardInsights() {
  const { t, language } = useI18n();
  const { data } = useWorkspace();
  const [stats, setStats] = useState<Stats | null>(() => peek<Stats>('/stats') ?? null);
  const [activity, setActivity] = useState<ActivityEntry[]>(() => peek<ActivityEntry[]>(feedPath) ?? []);
  const [online, setOnline] = useState(true);
  const [period, setPeriod] = useState<Period>('day');
  const [feedScope, setFeedScope] = useState<FeedScope>('all');

  useEffect(() => {
    const load = () => {
      api.get<Stats>('/stats').then((next) => { setStats(next); setOnline(true); }).catch(() => setOnline(false));
      api.get<ActivityEntry[]>(feedPath).then(setActivity).catch(() => undefined);
    };
    load();
    const interval = window.setInterval(load, 60_000);
    return () => window.clearInterval(interval);
  }, [data]);

  // One row per entry: the latest change, marked as new if it was created within the loaded window.
  const feed = useMemo(() => {
    const seen = new Map<string, ActivityEntry & { created: boolean }>();
    for (const entry of activity) {
      if (entry.action === 'delete') continue;
      const key = `${entry.entity_type}:${entry.entity_id}`;
      const known = seen.get(key);
      if (known) known.created ||= entry.action === 'create';
      else seen.set(key, { ...entry, created: entry.action === 'create' });
    }
    return [...seen.values()];
  }, [activity]);

  const trend = useMemo<BarDatum[]>(() => {
    if (!stats) return [];
    const today = new Date();
    if (period === 'day') {
      return Array.from({ length: 30 }, (_, index) => {
        const key = toDateKey(addDays(today, index - 29));
        return { key, label: formatDate(key, language, { day: 'numeric', month: 'numeric' }), value: sum(stats.activity[key]), tooltip: formatDate(key, language, { weekday: 'short', day: 'numeric', month: 'short' }) };
      });
    }
    if (period === 'week') {
      const thisWeek = mondayOf(today);
      return Array.from({ length: 12 }, (_, index) => {
        const start = addDays(thisWeek, -(11 - index) * 7);
        let value = 0;
        for (let offset = 0; offset < 7; offset += 1) value += sum(stats.activity[toDateKey(addDays(start, offset))]);
        const key = toDateKey(start);
        return { key, label: formatDate(key, language, { day: 'numeric', month: 'numeric' }), value };
      });
    }
    return Array.from({ length: 12 }, (_, index) => {
      const month = new Date(today.getFullYear(), today.getMonth() - 11 + index, 1);
      const prefix = toDateKey(month).slice(0, 7);
      const value = Object.entries(stats.activity).filter(([day]) => day.startsWith(prefix)).reduce((total, [, actionsOfDay]) => total + sum(actionsOfDay), 0);
      return { key: prefix, label: month.toLocaleDateString(language, { month: 'short' }), value, tooltip: month.toLocaleDateString(language, { month: 'long', year: 'numeric' }) };
    });
  }, [language, period, stats]);

  if (!stats) {
    return <div className="mt-10 flex h-64 items-center justify-center rounded-xl bg-muted"><DotLoader size={36} label={t('common.loading')} className="text-muted-foreground" /></div>;
  }

  const number = (value: number) => value.toLocaleString(language);
  const today = new Date();
  const lastDays = (count: number) => Array.from({ length: count }, (_, index) => toDateKey(addDays(today, index - count + 1)));
  const week = lastDays(7);
  const createdOf = (type: EntityType, days: string[]) => days.reduce((total, day) => total + (stats.created[day]?.[type] ?? 0), 0);
  const createdSeries = (type: EntityType) => lastDays(14).map((day) => stats.created[day]?.[type] ?? 0);

  // --- Key figures
  const sevenDaysAgo = toDateKey(addDays(today, -6));
  const doneWeek = data.tasks.filter((task) => task.status === 'done' && task.updated_at.slice(0, 10) >= sevenDaysAgo).length;
  const openTasks = data.tasks.filter((task) => task.status !== 'done').length;
  const activeProjects = data.projects.filter((project) => project.status === 'active').length;
  const storageTotal = (stats.database.size ?? 0) + stats.storage.files + stats.storage.files_archived;
  const kpis = [
    { label: t('overview.kpiOpenTasks'), value: number(openTasks), href: '/tasks', delta: createdOf('task', week), series: createdSeries('task') },
    { label: t('overview.kpiDoneWeek'), value: number(doneWeek), href: '/tasks' },
    { label: t('overview.kpiNotes'), value: number(stats.counts.note), href: '/explorer?view=notes', delta: createdOf('note', week), series: createdSeries('note') },
    { label: t('overview.kpiProjects'), value: number(activeProjects), href: '/projects', delta: createdOf('project', week) },
    { label: t('overview.kpiWebsites'), value: number(data.websites.length), href: '/projects' },
    { label: t('overview.kpiStorage'), value: formatBytes(storageTotal), href: '/database' },
  ];

  // --- Notes: pinned first, then recently edited
  const pinnedNotes = data.notes.filter((note) => note.pinned).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const recentNotes = data.notes.filter((note) => !note.pinned).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const notes = [...pinnedNotes.slice(0, 4), ...recentNotes].slice(0, 6);

  const agentFeed = feed.filter((entry) => entry.source !== 'app');
  const shownFeed = (feedScope === 'agent' ? agentFeed : feed).slice(0, 8);

  // --- Charts
  const taskSlices = [
    { key: 'todo', label: t('overview.todo'), value: stats.task_status.todo ?? 0, color: 'var(--chart-1)', href: '/tasks' },
    { key: 'in-progress', label: t('overview.inProgress'), value: stats.task_status['in-progress'] ?? 0, color: 'var(--chart-2)', href: '/tasks' },
    { key: 'done', label: t('overview.done'), value: stats.task_status.done ?? 0, color: 'var(--chart-3)', href: '/tasks' },
  ];
  const taskTotal = taskSlices.reduce((total, slice) => total + slice.value, 0);
  const storageSlices = [
    { key: 'db', label: t('overview.database'), value: stats.database.size ?? 0, display: formatBytes(stats.database.size ?? 0), color: 'var(--chart-1)', href: '/database' },
    { key: 'files', label: t('overview.files'), value: stats.storage.files, display: formatBytes(stats.storage.files), color: 'var(--chart-2)', href: '/explorer?view=files' },
    { key: 'archive', label: t('overview.archivedFiles'), value: stats.storage.files_archived, display: formatBytes(stats.storage.files_archived), color: 'var(--chart-3)', href: '/archive' },
  ];
  const contentTypes: { type: EntityType; href: string }[] = [
    { type: 'project', href: '/projects' }, { type: 'task', href: '/tasks' }, { type: 'note', href: '/explorer?view=notes' },
    { type: 'knowledge', href: '/explorer?view=docs' }, { type: 'meeting', href: '/meetings' }, { type: 'event', href: '/calendar' },
    { type: 'idea', href: '/ideas' }, { type: 'file', href: '/explorer?view=files' },
  ];
  const archivedTotal = Object.values(stats.archived).reduce((total, value) => total + value, 0);
  const last30 = toDateKey(addDays(today, -30));
  const totals = actions.reduce<Record<ActivityAction, number>>((acc, action) => {
    acc[action] = Object.entries(stats.activity).filter(([day]) => day >= last30).reduce((total, [, day]) => total + (day[action] ?? 0), 0);
    return acc;
  }, { create: 0, update: 0, archive: 0, restore: 0, delete: 0 });
  const heatDays = Object.fromEntries(Object.entries(stats.activity).map(([day, value]) => [day, sum(value)]));
  const apiDays = lastDays(14).reduce((acc, day) => {
    const entry = stats.api_calls[day] ?? {};
    return { api: acc.api + (entry.api ?? 0), mcp: acc.mcp + (entry.mcp ?? 0) };
  }, { api: 0, mcp: 0 });

  return (
    <div className="mt-10 space-y-6">
      {/* Key figures */}
      <section className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" aria-label={t('insights.usage')}>
        {kpis.map((kpi) => (
          <Link key={kpi.label} href={kpi.href} className="card-hover flex min-w-0 flex-col justify-between gap-2 rounded-2xl bg-card p-4 shadow-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
            <span className="truncate text-xs font-medium text-muted-foreground">{kpi.label}</span>
            <span className="flex items-end justify-between gap-2">
              <span className="font-mono text-[22px] font-medium leading-none tabular-nums">{kpi.value}</span>
              {kpi.series && <Sparkline values={kpi.series} width={64} height={24} />}
            </span>
            <span className="h-4 text-[11px] text-muted-foreground">{kpi.delta ? t('overview.thisWeek', { count: kpi.delta }) : ''}</span>
          </Link>
        ))}
      </section>

      {/* Notes and what is new */}
      <section className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">{t('overview.importantNotes')}</CardTitle>
              <CardDescription>{t('overview.importantNotesDesc')}</CardDescription>
            </div>
            <Link href="/explorer?view=notes" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">{t('dashboard.viewAll')}<ArrowRight className="h-3.5 w-3.5" /></Link>
          </CardHeader>
          <CardContent>
            {notes.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {notes.map((note) => (
                  <Link key={note.id} href={`/explorer?id=${note.id}`} className="rounded-2xl bg-muted p-3.5 transition-colors duration-300 hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
                    <p className="flex items-center gap-1.5 text-[13px] font-medium">
                      <span className="truncate">{note.title || t('common.untitled')}</span>
                      {note.pinned && <Pin className="h-3 w-3 shrink-0 fill-current opacity-60" />}
                    </p>
                    <p className={cn('mt-1.5 line-clamp-2 text-xs leading-relaxed', fg2)}>{markdownToPlainText((note.content ?? '').slice(0, 400)) || t('notes.noContent')}</p>
                    <p className="mt-2 flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {note.source === 'telegram' ? <Send className="h-3 w-3" strokeWidth={1.6} /> : note.source === 'mcp' ? <Bot className="h-3 w-3" strokeWidth={1.6} /> : null}
                      {formatDateTime(note.updated_at, language)}
                    </p>
                  </Link>
                ))}
              </div>
            ) : <p className="py-6 text-center text-sm text-muted-foreground">{t('dashboard.noNotes')}</p>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">{t('overview.newest')}</CardTitle>
              <CardDescription>{t('overview.newestDesc')}</CardDescription>
            </div>
            <Segmented value={feedScope} onChange={setFeedScope} label={t('overview.newest')} options={[{ value: 'all', label: t('common.all') }, { value: 'agent', label: t('home.agent') }]} />
          </CardHeader>
          <CardContent className="space-y-0.5">
            {shownFeed.map((entry) => {
              const Icon = entityIcons[entry.entity_type] ?? FileText;
              const Source = entry.source === 'telegram' ? Send : entry.source === 'mcp' ? Bot : null;
              return (
                <Link key={entry.id} href={entityHref(entry.entity_type, entry.entity_id)} className="flex items-center gap-3 rounded-2xl px-2 py-1.5 transition-colors duration-300 hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
                  <span className="ds-glass flex h-7 w-7 shrink-0 items-center justify-center rounded-full"><Icon className="h-3.5 w-3.5" strokeWidth={1.6} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[13px]">
                      <span className="truncate">{entry.title || t('common.untitled')}</span>
                      {entry.created && <span className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-medium leading-4 text-primary-foreground">{t('home.new')}</span>}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      {Source && <Source className="h-3 w-3" strokeWidth={1.6} />}
                      {t(entityLabelKeys[entry.entity_type])} · {t(`activity.${entry.action}`)}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{formatDateTime(entry.at, language)}</span>
                </Link>
              );
            })}
            {shownFeed.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{feedScope === 'agent' ? t('home.noAgent') : t('projectHub.noActivity')}</p>}
          </CardContent>
        </Card>
      </section>

      {/* Trends and task status */}
      <section className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">{t('insights.trends')}</CardTitle>
              <CardDescription>{t('insights.changes', { count: number(trend.reduce((total, entry) => total + entry.value, 0)) })}</CardDescription>
            </div>
            <Segmented value={period} onChange={setPeriod} label={t('insights.trends')}
              options={[{ value: 'day', label: t('insights.perDay') }, { value: 'week', label: t('insights.perWeek') }, { value: 'month', label: t('insights.perMonth') }]} />
          </CardHeader>
          <CardContent className="pt-2"><BarChart data={trend} height={170} ariaLabel={t('insights.trends')} /></CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">{t('overview.taskStatus')}</CardTitle>
            <CardDescription>{t('overview.taskStatusDesc', { percent: taskTotal ? Math.round(((stats.task_status.done ?? 0) / taskTotal) * 100) : 0 })}</CardDescription>
          </CardHeader>
          <CardContent>
            <Donut slices={taskSlices} totalLabel={t('overview.taskStatus')} emptyLabel={t('overview.noData')} shareLabel={t('overview.share')} />
          </CardContent>
        </Card>
      </section>

      {/* Activity calendar */}
      <Card>
        <CardHeader className="flex flex-col gap-4 space-y-0 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">{t('insights.heatmap')}</CardTitle>
            <CardDescription>{t('insights.heatmapDesc')}</CardDescription>
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-2">
            {actions.map((action) => (
              <div key={action}>
                <dt className="text-xs text-muted-foreground">{t(actionKeys[action])}</dt>
                <dd className="font-mono text-[15px] tabular-nums">{number(totals[action])}</dd>
              </div>
            ))}
          </dl>
        </CardHeader>
        <CardContent>
          <Heatmap days={heatDays} fit legend={{ less: t('insights.less'), more: t('insights.more') }}
            tooltip={(date, count) => t('insights.changesOn', { count, date: formatDate(date, language, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) })} />
        </CardContent>
      </Card>

      {/* System: storage, content table, archive and usage */}
      <section className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">{t('overview.storage')}</CardTitle>
            <CardDescription>{t('overview.storageDesc', { total: formatBytes(storageTotal) })} · {stats.database.engine}</CardDescription>
          </CardHeader>
          <CardContent>
            <Donut slices={storageSlices} total={formatBytes(storageTotal)} totalLabel={t('overview.storage')} emptyLabel={t('overview.noData')} shareLabel={t('overview.share')} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">{t('overview.content')}</CardTitle>
            <CardDescription>{t('overview.contentDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground">
                  <th className="pb-1.5 font-medium">{t('overview.type')}</th>
                  <th className="pb-1.5 text-right font-medium">{t('overview.active')}</th>
                  <th className="pb-1.5 text-right font-medium">{t('overview.archived')}</th>
                  <th className="w-20 pb-1.5" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {contentTypes.map(({ type, href }) => {
                  const max = Math.max(1, ...contentTypes.map((entry) => stats.counts[entry.type]));
                  return (
                    <tr key={type} className="border-t border-border/60">
                      <td className="py-1.5"><Link href={href} className="hover:underline">{t(entityLabelKeys[type])}</Link></td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{number(stats.counts[type])}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">{stats.archived[type] ? number(stats.archived[type]) : '–'}</td>
                      <td className="py-1.5 pl-3">
                        <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground/40" style={{ width: `${(stats.counts[type] / max) * 100}%` }} /></div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">{t('overview.system')}</CardTitle>
            <CardDescription className="flex items-center gap-2">
              <span className={cn('h-1.5 w-1.5 rounded-full', online ? 'bg-success' : 'bg-destructive')} aria-hidden="true" />
              {online ? t('insights.synced', { time: new Date(stats.generated_at).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' }) }) : t('insights.offline')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Row label={t('insights.archived')} value={number(archivedTotal)} href="/archive" />
            <Row label={t('overview.archivedFiles')} value={formatBytes(stats.storage.files_archived)} href="/archive" muted />
            <div className="my-2 h-px bg-border" />
            <Row label={t('insights.apiCalls')} value={number(apiDays.api + apiDays.mcp)} href="/developer-center" />
            <Row label="API" value={number(apiDays.api)} muted />
            <Row label="MCP" value={number(apiDays.mcp)} muted />
            <div className="my-2 h-px bg-border" />
            <Row label={t('insights.telegramUsage')} value={t('insights.telegramMessages', { incoming: number(stats.telegram.total_in), outgoing: number(stats.telegram.total_out) })} href="/telegram" />
            <Row label={t('websites.extensionTitle')} value={`${number(stats.web.websites)} · ${number(stats.web.notes)}`} href="/settings?tab=browser" />
            <p className="pt-1 text-xs text-muted-foreground">{stats.scheduler_enabled ? t('insights.schedulerOn') : t('insights.schedulerOff')}</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Row({ label, value, href, muted }: { label: string; value: string; href?: string; muted?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 text-[13px]', muted && 'pl-3 text-xs')}>
      <span className="text-muted-foreground">{label}</span>
      {href ? (
        <Link href={href} className="font-mono tabular-nums transition-colors hover:text-muted-foreground">{value}</Link>
      ) : (
        <span className={cn('font-mono tabular-nums', muted && 'text-muted-foreground')}>{value}</span>
      )}
    </div>
  );
}
