'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { ArrowRight, BellRing, CalendarDays, CheckSquare2, Clock3, FileText, FolderKanban, Lightbulb, Plus, Users } from 'lucide-react';

import { DashboardInsights } from '@/components/dashboard-insights';
import { useI18n } from '@/components/i18n-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { CountUp, PageHeader, PageSkeleton } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { markdownToPlainText } from '@/lib/markdown';
import { addDays, formatDate, formatDateTime, relativeDay, toDateKey, todayKey } from '@/lib/dates';

export default function DashboardPage() {
  const { t, language } = useI18n();
  const { data, loading, create, update } = useWorkspace();
  const [quickTitle, setQuickTitle] = useState('');

  if (loading) return <PageSkeleton />;

  const today = todayKey();
  const inAWeek = toDateKey(addDays(new Date(), 7));
  const openTasks = data.tasks.filter((task) => task.status !== 'done');
  const dueToday = openTasks.filter((task) => task.due_date && task.due_date <= today).length;
  const focusTasks = [...openTasks]
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || b.created_at.localeCompare(a.created_at))
    .slice(0, 6);
  const agenda = [
    ...data.events.map((event) => ({ id: event.id, title: event.title, date: event.date, time: event.time, kind: 'event' as const })),
    ...data.meetings.filter((meeting) => meeting.status === 'planned').map((meeting) => ({ id: meeting.id, title: meeting.title, date: meeting.date, time: meeting.time, kind: 'meeting' as const })),
    ...data.reminders.filter((reminder) => !reminder.done).map((reminder) => ({ id: reminder.id, title: reminder.text, date: reminder.remind_at.slice(0, 10), time: reminder.remind_at.slice(11, 16), kind: 'reminder' as const })),
  ]
    .filter((entry) => entry.date >= today)
    .sort((a, b) => `${a.date}${a.time ?? ''}`.localeCompare(`${b.date}${b.time ?? ''}`));
  const recentNotes = [...data.notes].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 4);
  const hour = new Date().getHours();
  const greeting = hour < 11 ? t('dashboard.morning') : hour < 18 ? t('dashboard.afternoon') : t('dashboard.evening');
  const dayLabels = { today: t('common.today'), tomorrow: t('common.tomorrow'), yesterday: t('common.yesterday') };

  const stats = [
    { label: t('dashboard.openTasks'), value: openTasks.length, note: t('dashboard.dueToday', { count: dueToday }), icon: CheckSquare2, href: '/tasks' },
    { label: t('dashboard.upcomingEvents'), value: agenda.filter((entry) => entry.date <= inAWeek).length, note: t('dashboard.next7Days'), icon: CalendarDays, href: '/calendar' },
    { label: t('dashboard.activeProjects'), value: data.projects.filter((project) => project.status === 'active').length, note: t('dashboard.ofTotal', { count: data.projects.length }), icon: FolderKanban, href: '/projects' },
    { label: t('dashboard.ideas'), value: data.ideas.filter((idea) => idea.status !== 'archived').length, note: t('dashboard.capturedIdeas'), icon: Lightbulb, href: '/ideas' },
  ];

  async function quickAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;
    setQuickTitle('');
    await create('tasks', { title });
  }

  return (
    <div>
      <PageHeader title={greeting} description={`${formatDate(today, language, { weekday: 'long', day: 'numeric', month: 'long' })} · ${t('dashboard.subtitle')}`} />

      <section className="stagger grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map(({ label, value, note, icon: Icon, href }) => (
          <Link key={href} href={href} className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="card-hover h-full">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardDescription className="font-medium">{label}</CardDescription>
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground"><Icon className="h-3.5 w-3.5" /></span>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl"><CountUp value={value} /></p>
                <p className="mt-1 text-xs text-muted-foreground">{note}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="text-base">{t('dashboard.focus')}</CardTitle>
              <CardDescription>{t('dashboard.focusDesc')}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild><Link href="/tasks">{t('dashboard.viewAll')}<ArrowRight /></Link></Button>
          </CardHeader>
          <CardContent className="space-y-1">
            <form onSubmit={quickAdd} className="mb-3 flex gap-2">
              <Input value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} placeholder={t('dashboard.quickAdd')} aria-label={t('dashboard.quickAdd')} />
              <Button type="submit" size="icon" variant="secondary" aria-label={t('tasks.new')} disabled={!quickTitle.trim()}><Plus /></Button>
            </form>
            {focusTasks.map((task) => {
              const overdue = task.due_date !== null && task.due_date < today;
              return (
                <div key={task.id} className="row-enter flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50">
                  <Checkbox checked={false} onCheckedChange={() => void update('tasks', task.id, { status: 'done' })} aria-label={`${t('tasks.done')}: ${task.title}`} />
                  <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
                  {task.priority === 'high' && <Badge variant="destructive">{t('tasks.high')}</Badge>}
                  {task.due_date && (
                    <span className={overdue ? 'text-xs font-medium text-destructive' : 'text-xs text-muted-foreground'}>
                      {relativeDay(task.due_date, language, dayLabels)}
                    </span>
                  )}
                </div>
              );
            })}
            {focusTasks.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t('dashboard.allDone')}</p>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="text-base">{t('dashboard.upcoming')}</CardTitle>
              <CardDescription>{t('dashboard.upcomingDesc')}</CardDescription>
            </div>
            <Button variant="ghost" size="icon-sm" asChild aria-label={t('nav.calendar')}><Link href="/calendar"><CalendarDays /></Link></Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {agenda.slice(0, 6).map((entry) => (
              <Link key={entry.id} href={entry.kind === 'meeting' ? '/meetings' : entry.kind === 'reminder' ? '/reminders' : `/calendar?date=${entry.date}`} className="group flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  {entry.kind === 'meeting' ? <Users className="h-4 w-4 text-muted-foreground" /> : entry.kind === 'reminder' ? <BellRing className="h-4 w-4 text-muted-foreground" /> : <Clock3 className="h-4 w-4 text-muted-foreground" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{entry.title}</p>
                  <p className="text-xs text-muted-foreground">{relativeDay(entry.date, language, dayLabels)}{entry.time ? ` · ${entry.time}` : ''}</p>
                </div>
              </Link>
            ))}
            {agenda.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t('dashboard.noUpcoming')}</p>}
          </CardContent>
        </Card>
      </section>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">{t('dashboard.recentNotes')}</CardTitle>
            <CardDescription>{t('dashboard.recentNotesDesc')}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild><Link href="/notes">{t('dashboard.viewAll')}<ArrowRight /></Link></Button>
        </CardHeader>
        <CardContent>
          {recentNotes.length ? (
            <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {recentNotes.map((note) => (
                <Link key={note.id} href={`/notes?id=${note.id}`} className="card-hover rounded-lg border bg-background/50 p-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="truncate text-sm font-medium">{note.title || t('common.untitled')}</p>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{markdownToPlainText(note.content) || t('notes.noContent')}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">{formatDateTime(note.updated_at, language)}</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('dashboard.noNotes')}</p>
          )}
        </CardContent>
      </Card>

      <DashboardInsights />
    </div>
  );
}
