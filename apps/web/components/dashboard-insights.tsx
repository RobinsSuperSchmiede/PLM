'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { ActivityList } from '@/components/activity-list';
import { BarChart, BarList, Heatmap, type BarDatum } from '@/components/charts';
import { DotLoader } from '@/components/dot-loader';
import { useI18n } from '@/components/i18n-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useWorkspace } from '@/components/workspace-provider';
import { api, peek } from '@/lib/api';
import { formatDate, toDateKey } from '@/lib/dates';
import { entityLabelKeys } from '@/lib/entities';
import type { ActivityAction, ActivityEntry, EntityType, Stats } from '@/lib/types';
import { cn, formatBytes } from '@/lib/utils';

type Period = 'day' | 'week' | 'month';
const actions: ActivityAction[] = ['create', 'update', 'archive', 'restore', 'delete'];
const actionKeys = { create: 'insights.created', update: 'insights.updated', archive: 'insights.archived', restore: 'insights.restored', delete: 'insights.deleted' } as const;

function sum(day: Partial<Record<string, number>> | undefined) {
  return Object.values(day ?? {}).reduce<number>((total, value) => total + (value ?? 0), 0);
}

function mondayOf(date: Date) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return copy;
}

export function DashboardInsights() {
  const { t, language } = useI18n();
  const { data } = useWorkspace();
  const [stats, setStats] = useState<Stats | null>(() => peek<Stats>('/stats') ?? null);
  const [recent, setRecent] = useState<ActivityEntry[]>(() => peek<ActivityEntry[]>('/activity?limit=12') ?? []);
  const [online, setOnline] = useState(true);
  const [period, setPeriod] = useState<Period>('day');

  useEffect(() => {
    const load = () => {
      api.get<Stats>('/stats').then((next) => { setStats(next); setOnline(true); }).catch(() => setOnline(false));
      api.get<ActivityEntry[]>('/activity?limit=12').then(setRecent).catch(() => undefined);
    };
    load();
    const interval = window.setInterval(load, 60_000);
    return () => window.clearInterval(interval);
  }, [data]);

  const trend = useMemo<BarDatum[]>(() => {
    if (!stats) return [];
    const today = new Date();
    if (period === 'day') {
      return Array.from({ length: 30 }, (_, index) => {
        const day = new Date(today);
        day.setDate(day.getDate() - 29 + index);
        const key = toDateKey(day);
        return { key, label: formatDate(key, language, { day: 'numeric', month: 'numeric' }), value: sum(stats.activity[key]), tooltip: formatDate(key, language, { weekday: 'short', day: 'numeric', month: 'short' }) };
      });
    }
    if (period === 'week') {
      const thisWeek = mondayOf(today);
      return Array.from({ length: 12 }, (_, index) => {
        const start = new Date(thisWeek);
        start.setDate(start.getDate() - (11 - index) * 7);
        let value = 0;
        for (let offset = 0; offset < 7; offset += 1) {
          const day = new Date(start);
          day.setDate(day.getDate() + offset);
          value += sum(stats.activity[toDateKey(day)]);
        }
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
    return <div className="mt-12 flex h-64 items-center justify-center rounded-xl bg-muted"><DotLoader size={36} label={t('common.loading')} className="text-muted-foreground" /></div>;
  }

  const last30 = new Date();
  last30.setDate(last30.getDate() - 30);
  const since = toDateKey(last30);
  const totals = actions.reduce<Record<ActivityAction, number>>((acc, action) => {
    acc[action] = Object.entries(stats.activity).filter(([day]) => day >= since).reduce((total, [, day]) => total + (day[action] ?? 0), 0);
    return acc;
  }, { create: 0, update: 0, archive: 0, restore: 0, delete: 0 });
  const heatDays = Object.fromEntries(Object.entries(stats.activity).map(([day, value]) => [day, sum(value)]));
  const archivedTotal = Object.values(stats.archived).reduce((total, value) => total + value, 0);
  const restoresTotal = Object.values(stats.activity).reduce((total, day) => total + (day.restore ?? 0), 0);
  const archiveWeeks: BarDatum[] = Array.from({ length: 12 }, (_, index) => {
    const start = mondayOf(new Date());
    start.setDate(start.getDate() - (11 - index) * 7);
    let value = 0;
    for (let offset = 0; offset < 7; offset += 1) {
      const day = new Date(start);
      day.setDate(day.getDate() + offset);
      value += stats.activity[toDateKey(day)]?.archive ?? 0;
    }
    const key = toDateKey(start);
    return { key, label: formatDate(key, language, { day: 'numeric', month: 'numeric' }), value };
  });
  const apiDays: BarDatum[] = Array.from({ length: 14 }, (_, index) => {
    const day = new Date();
    day.setDate(day.getDate() - 13 + index);
    const key = toDateKey(day);
    const entry = stats.api_calls[key] ?? {};
    return { key, label: formatDate(key, language, { day: 'numeric', month: 'numeric' }), value: (entry.api ?? 0) + (entry.mcp ?? 0), tooltip: `API ${entry.api ?? 0} · MCP ${entry.mcp ?? 0}` };
  });
  const apiTotal = apiDays.reduce((total, day) => total + day.value, 0);
  const tasksTotal = stats.counts.task;
  const taskPercent = tasksTotal ? Math.round((stats.tasks_done / tasksTotal) * 100) : 0;
  const usage: { type: EntityType; href: string }[] = [
    { type: 'note', href: '/explorer?view=notes' }, { type: 'task', href: '/tasks' }, { type: 'event', href: '/calendar' },
    { type: 'project', href: '/projects' }, { type: 'knowledge', href: '/explorer?view=docs' }, { type: 'meeting', href: '/meetings' },
  ];

  const apiSplit = apiDays.reduce((acc, day) => {
    const entry = stats.api_calls[day.key] ?? {};
    return { api: acc.api + (entry.api ?? 0), mcp: acc.mcp + (entry.mcp ?? 0) };
  }, { api: 0, mcp: 0 });
  const number = (value: number) => value.toLocaleString(language);

  return (
    <div className="mt-12 space-y-6">
      {/* The one main chart: a year of what was added and changed. */}
      <Card>
        <CardHeader className="flex flex-col gap-4 space-y-0 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">{t('insights.heatmap')}</CardTitle>
            <CardDescription>{t('insights.heatmapDesc')}</CardDescription>
          </div>
          <div className="space-y-2">
            <p className="ds-label">{t('insights.activity')}</p>
            <dl className="flex flex-wrap gap-x-6 gap-y-2">
              {actions.map((action) => (
                <div key={action}>
                  <dt className="text-xs text-muted-foreground">{t(actionKeys[action])}</dt>
                  <dd className="font-mono text-[15px] tabular-nums">{number(totals[action])}</dd>
                </div>
              ))}
            </dl>
          </div>
        </CardHeader>
        <CardContent>
          <Heatmap days={heatDays} cell={13} legend={{ less: t('insights.less'), more: t('insights.more') }}
            tooltip={(date, count) => t('insights.changesOn', { count, date: formatDate(date, language, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) })} />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">{t('insights.trends')}</CardTitle>
              <CardDescription>{t('insights.changes', { count: number(trend.reduce((total, entry) => total + entry.value, 0)) })}</CardDescription>
            </div>
            <div className="flex gap-0.5 rounded-full ds-glass p-[3px]" role="tablist">
              {(['day', 'week', 'month'] as const).map((value) => (
                <button key={value} type="button" role="tab" aria-selected={period === value} onClick={() => setPeriod(value)}
                  className={cn('h-[22px] rounded-full px-2.5 text-xs font-book transition-[background-color,box-shadow,color] duration-200 ease-ds', period === value ? 'bg-seg text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                  {t(value === 'day' ? 'insights.perDay' : value === 'week' ? 'insights.perWeek' : 'insights.perMonth')}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="pt-2"><BarChart data={trend} height={180} ariaLabel={t('insights.trends')} /></CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-baseline justify-between space-y-0">
            <CardTitle className="text-base">{t('insights.usage')}</CardTitle>
            <Link href="/tags" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
              {t('insights.tagsLinks', { tags: number(stats.counts.tag), links: number(stats.counts.link) })}
            </Link>
          </CardHeader>
          <CardContent>
            <ul className="-mx-2">
              {usage.map(({ type, href }) => (
                <li key={type}>
                  <Link href={href} className="flex h-8 items-center justify-between gap-3 rounded-md px-2 text-[13px] transition-colors hover:bg-accent">
                    <span>{t(entityLabelKeys[type])}</span>
                    <span className="flex items-baseline gap-2 tabular-nums">
                      {stats.archived[type] > 0 && <span className="text-xs text-muted-foreground">+{number(stats.archived[type])} {t('insights.archived').toLowerCase()}</span>}
                      <span className="font-mono">{number(stats.counts[type])}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">{t('projectHub.activity')}</CardTitle></CardHeader>
          <CardContent className="max-h-[280px] overflow-y-auto"><ActivityList entries={recent} /></CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">{t('insights.archive')}</CardTitle>
            <CardDescription>{t('insights.archiveDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Row label={t('insights.archived')} value={number(archivedTotal)} href="/archive" />
            <Row label={t('insights.restored')} value={number(restoresTotal)} />
            <Row label={t('insights.archiveGrowth')} value={number(archiveWeeks.reduce((total, week) => total + week.value, 0))} />
            <div className="my-3 h-px bg-border" />
            <Row label={t('insights.apiCalls')} value={number(apiTotal)} href="/developer-center" />
            <Row label="API" value={number(apiSplit.api)} muted />
            <Row label="MCP" value={number(apiSplit.mcp)} muted />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">{t('insights.system')}</CardTitle>
            <CardDescription className="flex items-center gap-2">
              <span className={cn('h-1.5 w-1.5 rounded-full', online ? 'bg-success' : 'bg-destructive')} aria-hidden="true" />
              {online ? t('insights.synced', { time: new Date(stats.generated_at).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' }) }) : t('insights.offline')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Row label={t('insights.dbSize')} value={`${formatBytes(stats.database.size)} · ${stats.database.engine}`} href="/database" />
            <Row label={t('insights.taskProgress')} value={`${taskPercent} %`} />
            <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand" style={{ width: `${taskPercent}%` }} /></div>
            <Row label={t('insights.telegramUsage')} value={t('insights.telegramMessages', { incoming: number(stats.telegram.total_in), outgoing: number(stats.telegram.total_out) })} href="/telegram" />
            <p className="pt-1 text-xs text-muted-foreground">{stats.scheduler_enabled ? t('insights.schedulerOn') : t('insights.schedulerOff')}</p>
            <div className="pt-3">
              <p className="ds-label mb-2">{t('insights.bySource')}</p>
              <BarList items={Object.entries(stats.activity_by_source).sort((a, b) => b[1] - a[1]).map(([source, value]) => ({ label: t(`activity.via_${source as 'app'}`), value }))} />
            </div>
          </CardContent>
        </Card>
      </div>
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
