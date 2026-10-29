'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Activity, Archive, Database, Radio, Send, Server } from 'lucide-react';

import { ActivityList } from '@/components/activity-list';
import { BarChart, BarList, Heatmap, type BarDatum } from '@/components/charts';
import { DotLoader } from '@/components/dot-loader';
import { useI18n } from '@/components/i18n-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CountUp } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { api } from '@/lib/api';
import { formatDate, toDateKey } from '@/lib/dates';
import { entityIcons, entityLabelKeys } from '@/lib/entities';
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
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<ActivityEntry[]>([]);
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
    return <div className="mt-6 flex h-64 items-center justify-center rounded-xl border border-dashed"><DotLoader size={36} label={t('common.loading')} className="text-info" /></div>;
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
    { type: 'note', href: '/notes' }, { type: 'task', href: '/tasks' }, { type: 'event', href: '/calendar' },
    { type: 'project', href: '/projects' }, { type: 'knowledge', href: '/knowledge' }, { type: 'meeting', href: '/meetings' },
  ];

  return (
    <div className="mt-8 space-y-6">
      <section aria-labelledby="usage-heading">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="usage-heading" className="text-sm font-semibold text-muted-foreground">{t('insights.usage')}</h2>
          <Link href="/tags" className="text-xs text-muted-foreground hover:text-foreground">{t('insights.tagsLinks', { tags: stats.counts.tag, links: stats.counts.link })}</Link>
        </div>
        <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {usage.map(({ type, href }) => {
            const Icon = entityIcons[type];
            return (
              <Link key={type} href={href} className="card-hover rounded-xl border bg-card p-4">
                <p className="flex items-center justify-between text-xs font-medium text-muted-foreground">{t(entityLabelKeys[type])}<Icon className="h-3.5 w-3.5" /></p>
                <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight"><CountUp value={stats.counts[type]} /></p>
                {stats.archived[type] > 0 && <p className="mt-0.5 text-[11px] text-muted-foreground">+{stats.archived[type]} {t('insights.archived').toLowerCase()}</p>}
              </Link>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="mb-3 text-sm font-semibold text-muted-foreground">{t('insights.activity')}</h2>
        <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {actions.map((action) => (
            <Card key={action} className="p-4">
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className={cn('h-2 w-2 rounded-full', action === 'create' ? 'bg-success' : action === 'delete' ? 'bg-destructive' : action === 'archive' ? 'bg-warning' : 'bg-info')} />
                {t(actionKeys[action])}
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight"><CountUp value={totals[action]} /></p>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-muted-foreground" />{t('insights.trends')}</CardTitle>
              <CardDescription>{t('insights.changes', { count: trend.reduce((total, entry) => total + entry.value, 0) })}</CardDescription>
            </div>
            <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist">
              {(['day', 'week', 'month'] as const).map((value) => (
                <button key={value} type="button" role="tab" aria-selected={period === value} onClick={() => setPeriod(value)}
                  className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition-all', period === value ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
                  {t(value === 'day' ? 'insights.perDay' : value === 'week' ? 'insights.perWeek' : 'insights.perMonth')}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="pt-4"><BarChart data={trend} height={170} ariaLabel={t('insights.trends')} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{t('projectHub.activity')}</CardTitle></CardHeader>
          <CardContent className="max-h-[260px] overflow-y-auto"><ActivityList entries={recent} /></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('insights.heatmap')}</CardTitle>
          <CardDescription>{t('insights.heatmapDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Heatmap days={heatDays} legend={{ less: t('insights.less'), more: t('insights.more') }}
            tooltip={(date, count) => t('insights.changesOn', { count, date: formatDate(date, language, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) })} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Archive className="h-4 w-4 text-muted-foreground" />{t('insights.archive')}</CardTitle>
            <CardDescription>{t('insights.archiveDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-6">
              <div><p className="text-2xl font-semibold tabular-nums"><CountUp value={archivedTotal} /></p><p className="text-xs text-muted-foreground">{t('insights.archived')}</p></div>
              <div><p className="text-2xl font-semibold tabular-nums"><CountUp value={restoresTotal} /></p><p className="text-xs text-muted-foreground">{t('insights.restored')}</p></div>
            </div>
            <div>
              <p className="mb-2 text-xs text-muted-foreground">{t('insights.archiveGrowth')}</p>
              <BarChart data={archiveWeeks} height={70} ariaLabel={t('insights.archiveGrowth')} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Server className="h-4 w-4 text-muted-foreground" />{t('insights.apiCalls')}</CardTitle>
            <CardDescription>{apiTotal.toLocaleString(language)} {t('insights.total')}</CardDescription>
          </CardHeader>
          <CardContent><BarChart data={apiDays} height={110} ariaLabel={t('insights.apiCalls')} /></CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Send className="h-4 w-4 text-muted-foreground" />{t('insights.telegramUsage')}</CardTitle>
            <CardDescription>{stats.telegram.connected ? t('insights.connected') : t('insights.disconnected')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">{t('insights.telegramMessages', { incoming: stats.telegram.total_in, outgoing: stats.telegram.total_out })}</p>
            <p className="text-xs text-muted-foreground">{t('insights.bySource')}</p>
            <BarList items={Object.entries(stats.activity_by_source).sort((a, b) => b[1] - a[1]).map(([source, value]) => ({ label: t(`activity.via_${source as 'app'}`), value }))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4 text-muted-foreground" />{t('insights.system')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label={t('insights.dbSize')} value={`${formatBytes(stats.database.size)} · ${stats.database.engine}`} href="/database" />
            <Row label={t('insights.taskProgress')} value={`${taskPercent}%`} />
            <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-success transition-[width] duration-700" style={{ width: `${taskPercent}%` }} /></div>
            <div className="flex items-center gap-2 pt-1">
              <Radio className={cn('h-4 w-4', online ? 'text-success' : 'text-destructive')} />
              <span>{online ? t('insights.synced', { time: new Date(stats.generated_at).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' }) }) : t('insights.offline')}</span>
            </div>
            <p className="text-xs text-muted-foreground">{stats.scheduler_enabled ? t('insights.schedulerOn') : t('insights.schedulerOff')}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      {href ? <Link href={href} className="font-medium tabular-nums hover:underline">{value}</Link> : <span className="font-medium tabular-nums">{value}</span>}
    </div>
  );
}
