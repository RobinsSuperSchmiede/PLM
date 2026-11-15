'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BellRing, Bot, Clock3, FileText, Pin, Plus, Send, Users } from 'lucide-react';

import { DashboardInsights } from '@/components/dashboard-insights';
import { useI18n } from '@/components/i18n-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { PageSkeleton } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { api, peek } from '@/lib/api';
import { colorOf } from '@/lib/appearance';
import { addDays, formatDate, formatDateTime, relativeDay, toDateKey, todayKey } from '@/lib/dates';
import { entityHref, entityIcons, entityLabelKeys } from '@/lib/entities';
import { markdownToPlainText } from '@/lib/markdown';
import type { ActivityEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

const fg2 = 'text-[hsl(var(--fg-2)/var(--fg-2-a))]';
const feedPath = '/activity?limit=200';
type FeedScope = 'agent' | 'all';
type AgendaKind = 'event' | 'meeting' | 'reminder';

export default function DashboardPage() {
  const { t, language } = useI18n();
  const { data, loading, create, update } = useWorkspace();
  const [quickTitle, setQuickTitle] = useState('');
  const [activity, setActivity] = useState<ActivityEntry[]>(() => peek<ActivityEntry[]>(feedPath) ?? []);
  const [feedScope, setFeedScope] = useState<FeedScope>('agent');
  const [greeting, setGreeting] = useState<'morning' | 'afternoon' | 'evening'>('afternoon');

  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 11 ? 'morning' : hour < 18 ? 'afternoon' : 'evening');
  }, []);

  // What was added or changed, reloaded whenever the workspace data changes (e.g. the agent wrote something).
  useEffect(() => {
    api.get<ActivityEntry[]>(feedPath).then(setActivity).catch(() => undefined);
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

  if (loading) return <PageSkeleton />;

  const today = todayKey();
  const dayLabels = { today: t('common.today'), tomorrow: t('common.tomorrow'), yesterday: t('common.yesterday') };
  const openTasks = data.tasks.filter((task) => task.status !== 'done');
  const dueTasks = openTasks.filter((task) => task.due_date && task.due_date <= today)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!) || Number(b.priority === 'high') - Number(a.priority === 'high'));
  const nextTasks = openTasks.filter((task) => !task.due_date || task.due_date > today)
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || Number(b.priority === 'high') - Number(a.priority === 'high'));
  const focusTasks = [...dueTasks, ...nextTasks].slice(0, Math.max(5, Math.min(dueTasks.length, 8)));

  const agenda: { id: string; title: string; date: string; time: string | null; kind: AgendaKind; projectId: string | null }[] = [
    ...data.events.map((item) => ({ id: item.id, title: item.title, date: item.date, time: item.time, kind: 'event' as const, projectId: item.project_id })),
    ...data.meetings.filter((item) => item.status === 'planned').map((item) => ({ id: item.id, title: item.title, date: item.date, time: item.time, kind: 'meeting' as const, projectId: item.project_id })),
    ...data.reminders.filter((item) => !item.done).map((item) => ({ id: item.id, title: item.text, date: item.remind_at.slice(0, 10), time: item.remind_at.slice(11, 16), kind: 'reminder' as const, projectId: null })),
  ].filter((entry) => entry.date >= today).sort((a, b) => `${a.date}${a.time ?? ''}`.localeCompare(`${b.date}${b.time ?? ''}`));
  const todayAgenda = agenda.filter((entry) => entry.date === today);
  const nextEntry = agenda.find((entry) => entry.date > today);
  const agendaHref = (entry: (typeof agenda)[number]) => (entry.kind === 'meeting' ? `/meetings?id=${entry.id}` : entry.kind === 'reminder' ? '/reminders' : `/calendar?date=${entry.date}`);
  const agendaIcon = { event: Clock3, meeting: Users, reminder: BellRing };

  const week = Array.from({ length: 7 }, (_, index) => {
    const key = toDateKey(addDays(new Date(), index));
    return { key, entries: agenda.filter((entry) => entry.date === key), tasks: openTasks.filter((task) => task.due_date === key).length };
  });

  const agentFeed = feed.filter((entry) => entry.source !== 'app');
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const agentToday = agentFeed.filter((entry) => entry.at >= since).length;
  const shownFeed = (feedScope === 'agent' && agentFeed.length ? agentFeed : feed).slice(0, 12);

  const pinned = data.notes.filter((note) => note.pinned).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const recent = [...data.notes].filter((note) => !note.pinned).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const notes = [...pinned.slice(0, 4), ...recent].slice(0, 8);
  const projects = data.projects.filter((project) => project.status === 'active').map((project) => {
    const tasks = data.tasks.filter((task) => task.project_id === project.id);
    const done = tasks.filter((task) => task.status === 'done').length;
    return { project, open: tasks.length - done, percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
  }).sort((a, b) => b.open - a.open).slice(0, 6);

  const facts = [
    { href: '/calendar', label: t('home.eventsToday', { count: todayAgenda.length }) },
    { href: '/tasks', label: t('home.tasksDue', { count: dueTasks.length }), alert: dueTasks.some((task) => task.due_date! < today) },
    { href: '/explorer', label: t('home.agentNew', { count: agentToday }) },
    { href: '/tasks', label: t('home.tasksOpen', { count: openTasks.length }) },
  ];

  async function quickAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;
    setQuickTitle('');
    await create('tasks', { title, due_date: today });
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-[28px] font-semibold leading-none tracking-[-0.02em]">{t(`dashboard.${greeting}`)}</h1>
          <p className="text-sm capitalize text-muted-foreground">{formatDate(today, language, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {facts.map((fact) => (
            <Link key={fact.label} href={fact.href}
              className={cn('ds-glass inline-flex h-7 items-center gap-2 rounded-full px-3 text-xs transition-[background-color,box-shadow] duration-300 ease-ds hover:bg-glass-hover hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring', fact.alert && 'text-destructive')}>
              {fact.label}
            </Link>
          ))}
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-5">
        {/* Today: what is scheduled and what is due. */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">{t('common.today')}</CardTitle>
              <CardDescription>{t('home.todayDesc')}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild><Link href={`/calendar?date=${today}`}>{t('nav.calendar')}<ArrowRight /></Link></Button>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <div className="space-y-0.5">
              <p className="ds-label px-2 pb-1.5">{t('home.schedule')}</p>
              {todayAgenda.map((entry) => {
                const Icon = agendaIcon[entry.kind];
                return (
                  <Link key={`${entry.kind}:${entry.id}`} href={agendaHref(entry)} className="flex h-9 items-center gap-3 rounded-full px-2 transition-colors duration-300 hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
                    <span className="w-10 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{entry.time ?? '—'}</span>
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{entry.title}</span>
                  </Link>
                );
              })}
              {todayAgenda.length === 0 && (
                <p className={cn('px-2 py-2 text-[13px]', fg2)}>
                  {t('calendar.nothing')}
                  {nextEntry && <Link href={agendaHref(nextEntry)} className="mt-1 block text-xs text-muted-foreground hover:text-foreground">{t('home.next')}: {nextEntry.title} · {relativeDay(nextEntry.date, language, dayLabels)}{nextEntry.time ? ` ${nextEntry.time}` : ''}</Link>}
                </p>
              )}
            </div>
            <div className="space-y-0.5">
              <p className="ds-label flex justify-between px-2 pb-1.5"><span>{t('home.due')}</span><Link href="/tasks" className="hover:text-foreground">{t('dashboard.viewAll')}</Link></p>
              {focusTasks.map((task) => {
                const overdue = task.due_date !== null && task.due_date < today;
                return (
                  <div key={task.id} className="row-enter flex h-9 items-center gap-3 rounded-full px-2 transition-colors duration-300 hover:bg-accent">
                    <Checkbox checked={false} onCheckedChange={() => void update('tasks', task.id, { status: 'done' })} aria-label={`${t('tasks.done')}: ${task.title}`} />
                    <Link href={`/tasks?id=${task.id}`} className="min-w-0 flex-1 truncate text-[13px] hover:underline">{task.title}</Link>
                    {task.priority === 'high' && <Badge variant="destructive">{t('tasks.high')}</Badge>}
                    {task.due_date && <span className={cn('shrink-0 font-mono text-[11px] tabular-nums', overdue ? 'text-destructive' : 'text-muted-foreground')}>{relativeDay(task.due_date, language, dayLabels)}</span>}
                  </div>
                );
              })}
              {focusTasks.length === 0 && <p className={cn('px-2 py-2 text-[13px]', fg2)}>{t('dashboard.allDone')}</p>}
              <form onSubmit={quickAdd} className="flex gap-2 pt-2">
                <Input value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} placeholder={t('dashboard.quickAdd')} aria-label={t('dashboard.quickAdd')} />
                <Button type="submit" size="icon" variant="secondary" aria-label={t('tasks.new')} disabled={!quickTitle.trim()}><Plus /></Button>
              </form>
            </div>
          </CardContent>
        </Card>

        {/* What the agent (MCP) and the Telegram bot added, newest first. */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">{t('home.feed')}</CardTitle>
              <CardDescription>{t('home.feedDesc')}</CardDescription>
            </div>
            <Segmented value={feedScope} onChange={setFeedScope} label={t('home.feed')} options={[{ value: 'agent', label: t('home.agent') }, { value: 'all', label: t('common.all') }]} />
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
                      {t(entityLabelKeys[entry.entity_type])} · {t(`activity.${entry.action}`)}{entry.source !== 'app' && ` · ${t(`activity.via_${entry.source as 'app'}`)}`}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{formatDateTime(entry.at, language)}</span>
                </Link>
              );
            })}
            {shownFeed.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t('projectHub.noActivity')}</p>}
            {feedScope === 'agent' && agentFeed.length === 0 && feed.length > 0 && <p className="px-2 pt-2 text-xs text-muted-foreground">{t('home.noAgent')}</p>}
          </CardContent>
        </Card>
      </section>

      {/* The next seven days as calendar tiles. */}
      <section className="mt-6 grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
        {week.map(({ key, entries, tasks }) => (
          <Link key={key} href={`/calendar?date=${key}`}
            className="flex min-h-[104px] min-w-0 flex-col gap-1 rounded-2xl bg-card px-3 pb-2.5 pt-2.5 shadow-sm transition-[transform,box-shadow] duration-300 ease-ds hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
            <span className="flex items-center gap-2">
              <span className={cn('-ml-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[13px] font-medium', key === today && 'bg-primary font-semibold text-primary-foreground')}>{Number(key.slice(8))}</span>
              <span className="ds-label capitalize">{key === today ? t('common.today') : formatDate(key, language, { weekday: 'short' })}</span>
            </span>
            {entries.slice(0, 3).map((entry) => (
              <span key={`${entry.kind}:${entry.id}`} className={cn('flex min-w-0 items-center gap-1.5 text-[11px] leading-[1.35]', fg2)}>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />
                {entry.time && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{entry.time}</span>}
                <span className="truncate">{entry.title}</span>
              </span>
            ))}
            {(entries.length > 3 || tasks > 0) && (
              <span className="mt-auto pl-3 text-[10px] text-muted-foreground">
                {[entries.length > 3 && t('calendar.more', { count: entries.length - 3 }), tasks > 0 && t('home.tasksDue', { count: tasks })].filter(Boolean).join(' · ')}
              </span>
            )}
          </Link>
        ))}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">{t('home.notes')}</CardTitle>
              <CardDescription>{t('home.notesDesc')}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild><Link href="/explorer?view=notes">{t('dashboard.viewAll')}<ArrowRight /></Link></Button>
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
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('dashboard.noNotes')}</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">{t('dashboard.activeProjects')}</CardTitle>
              <CardDescription>{t('home.projectsDesc')}</CardDescription>
            </div>
            <Button variant="ghost" size="icon-sm" asChild aria-label={t('nav.projects')}><Link href="/projects"><ArrowRight /></Link></Button>
          </CardHeader>
          <CardContent className="space-y-0.5">
            {projects.map(({ project, open, percent }) => (
              <Link key={project.id} href={`/projects/${project.id}`} className="flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors duration-300 hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorOf(project.name) }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{project.name}</span>
                  <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-foreground/60" style={{ width: `${percent}%` }} /></span>
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{t('home.tasksOpen', { count: open })}</span>
              </Link>
            ))}
            {projects.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t('home.noProjects')}</p>}
          </CardContent>
        </Card>
      </section>

      <DashboardInsights />
    </div>
  );
}
