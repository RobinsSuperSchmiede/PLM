'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BellRing, Bot, Check, CheckCheck, Clock3, FileText, Plus, Repeat, Send, Users } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { PageSkeleton } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { api, peek } from '@/lib/api';
import { colorOf } from '@/lib/appearance';
import { addDays, formatDate, formatDateTime, fromDateKey, relativeDay, toDateKey, todayKey } from '@/lib/dates';
import { entityHref, entityIcons, entityLabelKeys } from '@/lib/entities';
import type { ActivityEntry, Reminder, Task } from '@/lib/types';
import { cn } from '@/lib/utils';

const fg2 = 'text-[hsl(var(--fg-2)/var(--fg-2-a))]';
const feedPath = '/activity?limit=200';
const seenKey = 'anamnesies.today.seen';
const rowClass = 'flex h-9 items-center gap-3 rounded-full px-2 transition-colors duration-300 hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring';

type AgendaKind = 'event' | 'meeting' | 'reminder';
type AgendaEntry = { id: string; title: string; date: string; time: string | null; kind: AgendaKind; projectId: string | null };
const agendaIcon = { event: Clock3, meeting: Users, reminder: BellRing };
const agendaHref = (entry: AgendaEntry) => (entry.kind === 'meeting' ? `/meetings?id=${entry.id}` : entry.kind === 'reminder' ? '/reminders' : `/calendar?date=${entry.date}`);

/** Does a recurring reminder come up on this day? remind_at holds its next occurrence, which fixes weekday and day of month. */
function occursOn(reminder: Reminder, key: string) {
  if (reminder.done || reminder.repeat === 'none') return false;
  const day = fromDateKey(key);
  const anchor = fromDateKey(reminder.remind_at.slice(0, 10));
  switch (reminder.repeat) {
    case 'daily': return true;
    case 'weekdays': return day.getDay() >= 1 && day.getDay() <= 5;
    case 'weekly': return day.getDay() === anchor.getDay();
    case 'monthly': return day.getDate() === anchor.getDate();
  }
}

/** Server timestamps without zone are UTC. */
const parseUtc = (value: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);

const byPriority = (a: Task, b: Task) => Number(b.priority === 'high') - Number(a.priority === 'high');

export default function TodayPage() {
  const { t, language } = useI18n();
  const { data, loading, create, update } = useWorkspace();
  const [activity, setActivity] = useState<ActivityEntry[]>(() => peek<ActivityEntry[]>(feedPath) ?? []);
  const [seen, setSeen] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [allOverdue, setAllOverdue] = useState(false);

  useEffect(() => {
    try { setSeen(window.localStorage.getItem(seenKey)); } catch { /* storage unavailable */ }
  }, []);

  useEffect(() => {
    api.get<ActivityEntry[]>(feedPath).then(setActivity).catch(() => undefined);
  }, [data]);

  // Entries created since the last "mark as seen" (or in the last 48 h), one row per entry, without deleted ones.
  const news = useMemo(() => {
    const cutoff = seen ? new Date(seen).getTime() : Date.now() - 48 * 3_600_000;
    const deleted = new Set(activity.filter((entry) => entry.action === 'delete').map((entry) => `${entry.entity_type}:${entry.entity_id}`));
    const result = new Map<string, ActivityEntry>();
    for (const entry of activity) {
      const key = `${entry.entity_type}:${entry.entity_id}`;
      if (entry.action !== 'create' || deleted.has(key) || result.has(key)) continue;
      if (parseUtc(entry.at).getTime() > cutoff) result.set(key, entry);
    }
    return [...result.values()];
  }, [activity, seen]);

  if (loading) return <PageSkeleton />;

  const today = todayKey();
  const dayLabels = { today: t('common.today'), tomorrow: t('common.tomorrow'), yesterday: t('common.yesterday') };
  const openTasks = data.tasks.filter((task) => task.status !== 'done');
  const overdue = openTasks.filter((task) => task.due_date && task.due_date < today).sort((a, b) => a.due_date!.localeCompare(b.due_date!) || byPriority(a, b));
  const dueToday = openTasks.filter((task) => task.due_date === today).sort(byPriority);
  const undatedHigh = openTasks.filter((task) => !task.due_date && task.priority === 'high').slice(0, 5);
  const doneToday = data.tasks.filter((task) => task.status === 'done' && task.due_date === today).length;

  // Recurring reminders are kept out of the schedule and the next days: they get a section of their own.
  const agenda: AgendaEntry[] = [
    ...data.events.map((item) => ({ id: item.id, title: item.title, date: item.date, time: item.time, kind: 'event' as const, projectId: item.project_id })),
    ...data.meetings.filter((item) => item.status === 'planned').map((item) => ({ id: item.id, title: item.title, date: item.date, time: item.time, kind: 'meeting' as const, projectId: item.project_id })),
    ...data.reminders.filter((item) => !item.done && item.repeat === 'none').map((item) => ({ id: item.id, title: item.text, date: item.remind_at.slice(0, 10), time: item.remind_at.slice(11, 16), kind: 'reminder' as const, projectId: null })),
  ].sort((a, b) => `${a.date}${a.time ?? ''}`.localeCompare(`${b.date}${b.time ?? ''}`));
  const todayAgenda = agenda.filter((entry) => entry.date === today);

  const recurringAll = data.reminders.filter((item) => !item.done && item.repeat !== 'none');
  const recurringToday = recurringAll.filter((item) => occursOn(item, today))
    .map((item) => ({ item, time: item.remind_at.slice(11, 16), sent: Boolean(item.last_sent_at && toDateKey(parseUtc(item.last_sent_at)) === today) }))
    .sort((a, b) => a.time.localeCompare(b.time));

  const days = Array.from({ length: 7 }, (_, index) => {
    const key = toDateKey(addDays(new Date(), index + 1));
    return { key, entries: agenda.filter((entry) => entry.date === key), tasks: openTasks.filter((task) => task.due_date === key).sort(byPriority) };
  });
  const upcomingCount = days.reduce((sum, day) => sum + day.entries.length + day.tasks.length, 0);

  const projectName = (id: string | null) => (id ? data.projects.find((project) => project.id === id)?.name ?? null : null);

  const facts = [
    overdue.length > 0 && { label: t('today.overdue', { count: overdue.length }), alert: true },
    { label: t('today.dueToday', { count: dueToday.length }) },
    { label: t('home.eventsToday', { count: todayAgenda.length }) },
    news.length > 0 && { label: t('today.newCount', { count: news.length }) },
  ].filter(Boolean) as { label: string; alert?: boolean }[];

  async function quickAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;
    setQuickTitle('');
    await create('tasks', { title, due_date: today });
  }

  function markSeen() {
    const now = new Date().toISOString();
    try { window.localStorage.setItem(seenKey, now); } catch { /* storage unavailable */ }
    setSeen(now);
  }

  const taskRow = (task: Task, showDay: boolean) => {
    const late = task.due_date !== null && task.due_date < today;
    const project = projectName(task.project_id);
    return (
      <div key={task.id} className="row-enter flex h-9 items-center gap-3 rounded-full px-2 transition-colors duration-300 hover:bg-accent">
        <Checkbox checked={false} onCheckedChange={() => void update('tasks', task.id, { status: 'done' })} aria-label={`${t('tasks.done')}: ${task.title}`} />
        <Link href={`/tasks?id=${task.id}`} className="min-w-0 flex-1 truncate text-[13px] hover:underline">{task.title}</Link>
        {project && <span className="hidden max-w-[9rem] shrink-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground sm:flex"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorOf(project) }} />{project}</span>}
        {task.priority === 'high' && <Badge variant="destructive">{t('tasks.high')}</Badge>}
        {showDay && task.due_date && <span className={cn('shrink-0 font-mono text-[11px] tabular-nums', late ? 'text-destructive' : 'text-muted-foreground')}>{relativeDay(task.due_date, language, dayLabels)}</span>}
      </div>
    );
  };

  const agendaRow = (entry: AgendaEntry) => {
    const Icon = agendaIcon[entry.kind];
    return (
      <Link key={`${entry.kind}:${entry.id}`} href={agendaHref(entry)} className={rowClass}>
        <span className="w-10 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{entry.time ?? '—'}</span>
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} />
        <span className="min-w-0 flex-1 truncate text-[13px]">{entry.title}</span>
      </Link>
    );
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-[28px] font-semibold leading-none tracking-[-0.02em]">{t('today.title')}</h1>
          <p className="text-sm capitalize text-muted-foreground">{formatDate(today, language, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {facts.map((fact) => (
            <span key={fact.label} className={cn('ds-glass inline-flex h-7 items-center rounded-full px-3 text-xs', fact.alert && 'text-destructive')}>{fact.label}</span>
          ))}
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-5">
        {/* The main thing: what has to happen today. */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">{t('today.todo')}</CardTitle>
              <CardDescription>{t('today.todoDesc')}</CardDescription>
            </div>
            {doneToday > 0 && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><CheckCheck className="h-3.5 w-3.5 text-success" />{doneToday}</span>}
          </CardHeader>
          <CardContent className="space-y-0.5">
            {dueToday.map((task) => taskRow(task, false))}
            {dueToday.length === 0 && <p className={cn('flex items-center gap-2 px-2 py-2 text-[13px]', fg2)}><Check className="h-4 w-4 text-success" />{t('today.allDone')}</p>}
            {overdue.length > 0 && (
              <div className="pt-3">
                <p className="ds-label px-2 pb-1.5 text-destructive">{t('today.overdue', { count: overdue.length })}</p>
                {(allOverdue ? overdue : overdue.slice(0, 5)).map((task) => taskRow(task, true))}
                {overdue.length > 5 && (
                  <button type="button" onClick={() => setAllOverdue((value) => !value)} className="px-2 pt-1 text-xs text-muted-foreground hover:text-foreground">
                    {allOverdue ? t('today.showLess') : t('focus.more', { count: overdue.length - 5 })}
                  </button>
                )}
              </div>
            )}
            <form onSubmit={quickAdd} className="flex gap-2 pt-2">
              <Input value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} placeholder={t('today.quickAdd')} aria-label={t('today.quickAdd')} />
              <Button type="submit" size="icon" variant="secondary" aria-label={t('tasks.new')} disabled={!quickTitle.trim()}><Plus /></Button>
            </form>
            {undatedHigh.length > 0 && (
              <div className="pt-4">
                <p className="ds-label px-2 pb-1.5">{t('today.noDate')}</p>
                {undatedHigh.map((task) => taskRow(task, false))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <CardTitle className="text-base">{t('today.schedule')}</CardTitle>
              <Button variant="ghost" size="icon-sm" asChild aria-label={t('nav.calendar')}><Link href={`/calendar?date=${today}`}><ArrowRight /></Link></Button>
            </CardHeader>
            <CardContent className="space-y-0.5">
              {todayAgenda.map(agendaRow)}
              {todayAgenda.length === 0 && <p className={cn('px-2 py-2 text-[13px]', fg2)}>{t('today.noSchedule')}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base"><Repeat className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />{t('today.recurring')}</CardTitle>
                <CardDescription>{t('today.recurringDesc')}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-0.5">
              {recurringToday.map(({ item, time, sent }) => (
                <Link key={item.id} href="/reminders" className={cn(rowClass, sent && 'text-muted-foreground')}>
                  <span className="w-10 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{time}</span>
                  {sent ? <Check className="h-3.5 w-3.5 shrink-0 text-success" /> : <Repeat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} />}
                  <span className={cn('min-w-0 flex-1 truncate text-[13px]', sent && 'line-through')}>{item.text}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{sent ? t('today.sent') : t(`reminders.${item.repeat as 'daily'}`)}</span>
                </Link>
              ))}
              {recurringToday.length === 0 && <p className={cn('px-2 py-2 text-[13px]', fg2)}>{t('today.noRecurring')}</p>}
              {recurringAll.length > 0 && (
                <Link href="/reminders" className="block px-2 pt-2 text-xs text-muted-foreground hover:text-foreground">{t('today.allRecurring', { count: recurringAll.length })}</Link>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">{t('today.upcoming')}</CardTitle>
              <CardDescription>{t('today.upcomingDesc')}</CardDescription>
            </div>
            <Button variant="ghost" size="icon-sm" asChild aria-label={t('nav.calendar')}><Link href="/calendar"><ArrowRight /></Link></Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {days.map(({ key, entries, tasks }) => (
              <div key={key}>
                <p className="flex items-baseline gap-2 px-2 pb-1">
                  <span className="text-[13px] font-medium capitalize">{key === days[0].key ? dayLabels.tomorrow : formatDate(key, language, { weekday: 'long' })}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{formatDate(key, language)}</span>
                </p>
                {entries.map(agendaRow)}
                {tasks.map((task) => taskRow(task, false))}
                {entries.length + tasks.length === 0 && <p className="px-2 text-xs text-muted-foreground/70">{t('today.free')}</p>}
              </div>
            ))}
            {upcomingCount === 0 && <p className={cn('px-2 text-[13px]', fg2)}>{t('today.nothingUpcoming')}</p>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">{t('today.news')}</CardTitle>
              <CardDescription>{seen ? t('today.newsSince', { time: formatDateTime(seen, language) }) : t('today.newsRecent')}</CardDescription>
            </div>
            {news.length > 0 && <Button variant="ghost" size="sm" onClick={markSeen}><CheckCheck />{t('today.markSeen')}</Button>}
          </CardHeader>
          <CardContent className="space-y-0.5">
            {news.slice(0, 15).map((entry) => {
              const Icon = entityIcons[entry.entity_type] ?? FileText;
              const Source = entry.source === 'telegram' ? Send : entry.source === 'mcp' ? Bot : null;
              return (
                <Link key={entry.id} href={entityHref(entry.entity_type, entry.entity_id)} className="flex items-center gap-3 rounded-2xl px-2 py-1.5 transition-colors duration-300 hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
                  <span className="ds-glass flex h-7 w-7 shrink-0 items-center justify-center rounded-full"><Icon className="h-3.5 w-3.5" strokeWidth={1.6} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{entry.title || t('common.untitled')}</span>
                    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      {Source && <Source className="h-3 w-3" strokeWidth={1.6} />}
                      {t(entityLabelKeys[entry.entity_type])}{entry.source !== 'app' && ` · ${t(`activity.via_${entry.source as 'app'}`)}`}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{formatDateTime(parseUtc(entry.at).toISOString(), language)}</span>
                </Link>
              );
            })}
            {news.length > 15 && <p className="px-2 pt-1 text-xs text-muted-foreground">{t('focus.more', { count: news.length - 15 })}</p>}
            {news.length === 0 && <p className={cn('px-2 py-2 text-[13px]', fg2)}>{t('today.noNews')}</p>}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
