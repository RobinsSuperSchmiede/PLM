'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, BellRing, ChevronRight, Clock3, Pin, Plus, Users } from 'lucide-react';

import { DashboardInsights } from '@/components/dashboard-insights';
import { useI18n } from '@/components/i18n-provider';
import { ProjectCover } from '@/components/project-cover';
import { projectStatusVariant } from '@/components/project-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { PageSkeleton } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { addDays, formatDate, relativeDay, toDateKey, todayKey } from '@/lib/dates';
import type { Project } from '@/lib/types';
import { cn } from '@/lib/utils';

const fg2 = 'text-[hsl(var(--fg-2)/var(--fg-2-a))]';
const CARD_MIN = 228; // px – narrowest project card in the first row
const CARD_GAP = 12;

type AgendaItem = { id: string; title: string; date: string; time: string | null; kind: 'meeting' | 'event' | 'reminder'; href: string };

export default function DashboardPage() {
  const { t, language } = useI18n();
  const { data, loading, create, update } = useWorkspace();
  const [quickTitle, setQuickTitle] = useState('');
  const [greeting, setGreeting] = useState<'morning' | 'afternoon' | 'evening'>('afternoon');

  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 11 ? 'morning' : hour < 18 ? 'afternoon' : 'evening');
  }, []);

  if (loading) return <PageSkeleton />;

  const today = todayKey();
  const dayLabels = { today: t('common.today'), tomorrow: t('common.tomorrow'), yesterday: t('common.yesterday') };
  const inWeek = toDateKey(addDays(new Date(), 7));

  // --- Tasks: overdue first, then today; high priority on top.
  const openTasks = data.tasks.filter((task) => task.status !== 'done');
  const byPriority = (a: { priority: string }, b: { priority: string }) => Number(b.priority === 'high') - Number(a.priority === 'high');
  const overdueTasks = openTasks.filter((task) => task.due_date && task.due_date < today).sort((a, b) => a.due_date!.localeCompare(b.due_date!) || byPriority(a, b));
  const todayTasks = openTasks.filter((task) => task.due_date === today).sort(byPriority);
  const doneToday = data.tasks.filter((task) => task.status === 'done' && task.updated_at.slice(0, 10) === today && task.due_date && task.due_date <= today).length;
  const todayTotal = todayTasks.length + overdueTasks.length + doneToday;
  const todayPercent = todayTotal ? Math.round((doneToday / todayTotal) * 100) : 0;

  // --- Meetings and events: left over from earlier days, today, the next seven days.
  const agenda: AgendaItem[] = [
    ...data.meetings.filter((item) => item.status === 'planned').map((item) => ({ id: item.id, title: item.title, date: item.date, time: item.time, kind: 'meeting' as const, href: `/meetings?id=${item.id}` })),
    ...data.events.map((item) => ({ id: item.id, title: item.title, date: item.date, time: item.time, kind: 'event' as const, href: `/calendar?date=${item.date}` })),
    ...data.reminders.filter((item) => !item.done).map((item) => ({ id: item.id, title: item.text, date: item.remind_at.slice(0, 10), time: item.remind_at.slice(11, 16), kind: 'reminder' as const, href: '/reminders' })),
  ].sort((a, b) => `${a.date}${a.time ?? ''}`.localeCompare(`${b.date}${b.time ?? ''}`));
  // Events simply pass; only meetings and reminders that were never closed count as left over.
  const leftover = agenda.filter((item) => item.date < today && item.kind !== 'event').reverse().slice(0, 5);
  const todayAgenda = agenda.filter((item) => item.date === today);
  const upcoming = agenda.filter((item) => item.date > today && item.date <= inWeek).slice(0, 8);

  // --- Projects for the first row: pinned ones; without any, the active ones changed last.
  const pinnedProjects = data.projects.filter((project) => project.pinned).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const rowProjects = pinnedProjects.length ? pinnedProjects
    : data.projects.filter((project) => project.status === 'active').sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const facts = [
    { href: '/tasks', label: t('home.tasksDue', { count: todayTasks.length + overdueTasks.length }), alert: overdueTasks.length > 0 },
    { href: '/meetings', label: t('home.eventsToday', { count: todayAgenda.length }) },
    { href: '/tasks', label: t('home.tasksOpen', { count: openTasks.length }) },
  ];

  async function quickAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;
    setQuickTitle('');
    await create('tasks', { title, due_date: today });
  }

  const taskRow = (task: (typeof openTasks)[number], overdue: boolean) => (
    <div key={task.id} className="row-enter flex h-9 items-center gap-3 rounded-full px-2 transition-colors duration-300 hover:bg-accent">
      <Checkbox checked={false} onCheckedChange={() => void update('tasks', task.id, { status: 'done' })} aria-label={`${t('overview.markDone')}: ${task.title}`} />
      <Link href={`/tasks?id=${task.id}`} className="min-w-0 flex-1 truncate text-[13px] hover:underline">{task.title}</Link>
      {task.priority === 'high' && <Badge variant="destructive">{t('tasks.high')}</Badge>}
      {task.project_id && <ProjectDot projectId={task.project_id} />}
      {overdue && task.due_date && <span className="shrink-0 font-mono text-[11px] tabular-nums text-destructive">{relativeDay(task.due_date, language, dayLabels)}</span>}
    </div>
  );

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

      {/* Row 1: pinned projects, as many as fit in one row. */}
      <ProjectRow projects={rowProjects} title={pinnedProjects.length ? t('overview.pinnedProjects') : t('overview.projects')} hint={pinnedProjects.length ? null : t('overview.noPinned')} />

      {/* Row 2: today's tasks on the left, meetings and events on the right. */}
      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">{t('overview.todayTodos')}</CardTitle>
              <CardDescription>{todayTotal ? t('overview.doneToday', { count: doneToday }) : t('overview.todayTodosDesc')}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild><Link href="/tasks">{t('dashboard.viewAll')}<ArrowRight /></Link></Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {todayTotal > 0 && (
              <div className="h-1 overflow-hidden rounded-full bg-muted" role="meter" aria-valuenow={todayPercent} aria-valuemin={0} aria-valuemax={100} aria-label={t('overview.doneToday', { count: doneToday })}>
                <div className="h-full rounded-full bg-success transition-[width] duration-700 ease-ds" style={{ width: `${todayPercent}%` }} />
              </div>
            )}
            {overdueTasks.length > 0 && (
              <div className="space-y-0.5">
                <p className="ds-label px-2 pb-1 text-destructive">{t('overview.overdue')} · {overdueTasks.length}</p>
                {overdueTasks.slice(0, 6).map((task) => taskRow(task, true))}
                {overdueTasks.length > 6 && <Link href="/tasks" className="block px-2 pt-1 text-xs text-muted-foreground hover:text-foreground">+{overdueTasks.length - 6}</Link>}
              </div>
            )}
            <div className="space-y-0.5">
              <p className="ds-label px-2 pb-1">{t('overview.dueToday')} · {todayTasks.length}</p>
              {todayTasks.map((task) => taskRow(task, false))}
              {todayTasks.length === 0 && <p className={cn('px-2 py-1.5 text-[13px]', fg2)}>{t('dashboard.allDone')}</p>}
            </div>
            <form onSubmit={quickAdd} className="flex gap-2 pt-1">
              <Input value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} placeholder={t('dashboard.quickAdd')} aria-label={t('dashboard.quickAdd')} />
              <Button type="submit" size="icon" variant="secondary" aria-label={t('tasks.new')} disabled={!quickTitle.trim()}><Plus /></Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">{t('overview.meetings')}</CardTitle>
              <CardDescription>{t('overview.meetingsDesc')}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild><Link href="/meetings">{t('dashboard.viewAll')}<ArrowRight /></Link></Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {leftover.length > 0 && (
              <AgendaGroup label={`${t('overview.leftover')} · ${leftover.length}`} tone="warning" items={leftover} showDay dayLabels={dayLabels} />
            )}
            <AgendaGroup label={t('overview.today')} items={todayAgenda} empty={t('overview.nothingToday')} dayLabels={dayLabels} />
            <AgendaGroup label={t('overview.upcoming')} items={upcoming} empty={t('overview.noUpcoming')} showDay dayLabels={dayLabels} />
          </CardContent>
        </Card>
      </section>

      <DashboardInsights />
    </div>
  );
}

function ProjectDot({ projectId }: { projectId: string }) {
  const { data } = useWorkspace();
  const project = data.projects.find((item) => item.id === projectId);
  if (!project) return null;
  return <span className="hidden max-w-[120px] shrink-0 truncate rounded-full bg-muted px-2 text-[11px] leading-5 text-muted-foreground sm:inline">{project.name}</span>;
}

function AgendaGroup({ label, items, empty, tone, showDay, dayLabels }: {
  label: string;
  items: AgendaItem[];
  empty?: string;
  tone?: 'warning';
  showDay?: boolean;
  dayLabels: { today: string; tomorrow: string; yesterday: string };
}) {
  const { language } = useI18n();
  const icons = { meeting: Users, event: Clock3, reminder: BellRing };
  return (
    <div className="space-y-0.5">
      <p className={cn('ds-label px-2 pb-1', tone === 'warning' && 'text-warning')}>{label}</p>
      {items.map((item) => {
        const Icon = icons[item.kind];
        return (
          <Link key={`${item.kind}:${item.id}`} href={item.href} className="flex h-9 items-center gap-3 rounded-full px-2 transition-colors duration-300 hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
            <span className="w-[72px] shrink-0 truncate font-mono text-[11px] tabular-nums text-muted-foreground">
              {showDay ? relativeDay(item.date, language, dayLabels) : item.time ?? '—'}
            </span>
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} />
            <span className="min-w-0 flex-1 truncate text-[13px]">{item.title}</span>
            {showDay && item.time && <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{item.time}</span>}
          </Link>
        );
      })}
      {items.length === 0 && empty && <p className={cn('px-2 py-1.5 text-[13px]', fg2)}>{empty}</p>}
    </div>
  );
}

/** One row of project cards. Only as many as fit are shown; the arrow leads to the rest. */
function ProjectRow({ projects, title, hint }: { projects: Project[]; title: string; hint: string | null }) {
  const { t } = useI18n();
  const { data } = useWorkspace();
  const row = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);

  useLayoutEffect(() => {
    const element = row.current;
    if (!element) return;
    const measure = () => setColumns(Math.max(1, Math.floor((element.clientWidth + CARD_GAP) / (CARD_MIN + CARD_GAP))));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const shown = projects.slice(0, columns);
  const hidden = projects.length - shown.length;

  return (
    <section aria-label={title}>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Pin className="h-3.5 w-3.5 text-muted-foreground" />{title}
          {hint && <span className="text-xs font-normal text-muted-foreground">· {hint}</span>}</h2>
        {(hidden > 0 || projects.length === 0) && (
          <Link href="/projects" className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            {t('overview.moreProjects')}{hidden > 0 && <span className="font-mono tabular-nums">+{hidden}</span>}<ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <div ref={row} className="grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: CARD_GAP }}>
        {shown.map((project) => {
          const tasks = data.tasks.filter((task) => task.project_id === project.id);
          const done = tasks.filter((task) => task.status === 'done').length;
          const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
          return (
            <Link key={project.id} href={`/projects/${project.id}`}
              className="card-hover group flex min-w-0 flex-col overflow-hidden rounded-2xl bg-card shadow-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
              <div className="overflow-hidden"><ProjectCover project={project} size={640} className="aspect-[16/7] transition-transform duration-700 ease-ds group-hover:scale-[1.03]" /></div>
              <div className="flex flex-1 flex-col gap-2 p-3.5">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-medium">{project.name}</span>
                  <Badge variant={projectStatusVariant[project.status]}>{t(`projects.${project.status}`)}</Badge>
                </div>
                {project.description && <p className={cn('line-clamp-1 text-xs', fg2)}>{project.description}</p>}
                <div className="mt-auto space-y-1 pt-1">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{tasks.length ? t('projects.progress', { done, total: tasks.length }) : t('projects.noTasks')}</span>
                    <span className="font-mono tabular-nums">{percent}%</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-success" style={{ width: `${percent}%` }} /></div>
                </div>
              </div>
            </Link>
          );
        })}
        {projects.length === 0 && (
          <Link href="/projects" className="col-span-full flex h-24 items-center justify-center rounded-2xl text-sm text-muted-foreground outline-dashed outline-[1.5px] -outline-offset-[1.5px] outline-foreground/15 hover:text-foreground">
            {t('home.noProjects')}
          </Link>
        )}
      </div>
    </section>
  );
}
