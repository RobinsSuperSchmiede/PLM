'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import {
  Archive, ArrowLeft, BookOpen, CalendarDays, CheckSquare2, Clock3, FileText, FolderKanban, MessageCircle, Pencil, Plus, RotateCcw, Users,
} from 'lucide-react';

import { ActivityList } from '@/components/activity-list';
import { EventDialog } from '@/components/event-dialog';
import { AttachmentsPanel } from '@/components/files';
import { useI18n } from '@/components/i18n-provider';
import { ArchiveButton, EntityTagEditor, EntityTags, RelationsPanel } from '@/components/knowledge';
import { MeetingDialog } from '@/components/meeting-dialog';
import { ProjectDialog, projectStatusVariant } from '@/components/project-dialog';
import { TaskDialog, priorityKeys } from '@/components/task-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { CountUp, EmptyState, PageSkeleton } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { api } from '@/lib/api';
import { formatDateTime, relativeDay, todayKey } from '@/lib/dates';
import { entityHref, entityIcons, entityLabelKeys } from '@/lib/entities';
import { markdownToPlainText } from '@/lib/markdown';
import type { ActivityEntry, ArchivedItem, Task, TelegramLogEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

const tabs = ['overview', 'tasks', 'notes', 'schedule', 'documents', 'telegram', 'archive'] as const;
type Tab = (typeof tabs)[number];

export default function ProjectWorkspacePage() {
  return <Suspense fallback={<PageSkeleton />}><ProjectWorkspace /></Suspense>;
}

function ProjectWorkspace() {
  const { t, language } = useI18n();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { data, loading, create, update } = useWorkspace();
  const tab = (tabs.includes(searchParams.get('tab') as Tab) ? searchParams.get('tab') : 'overview') as Tab;
  const project = data.projects.find((item) => item.id === params.id);
  const [editing, setEditing] = useState(false);
  const [task, setTask] = useState<Task | 'new' | null>(null);
  const [newEvent, setNewEvent] = useState(false);
  const [newMeeting, setNewMeeting] = useState(false);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [telegram, setTelegram] = useState<TelegramLogEntry[]>([]);
  const [archived, setArchived] = useState<ArchivedItem[]>([]);
  const { restore } = useWorkspace();

  const scoped = useMemo(() => {
    const id = params.id;
    return {
      tasks: data.tasks.filter((item) => item.project_id === id),
      notes: data.notes.filter((item) => item.project_id === id).sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
      events: data.events.filter((item) => item.project_id === id),
      meetings: data.meetings.filter((item) => item.project_id === id),
      documents: data.knowledge.filter((item) => item.project_id === id),
      ideas: data.ideas.filter((item) => item.project_id === id),
    };
  }, [data, params.id]);

  useEffect(() => {
    if (!params.id) return;
    api.get<ActivityEntry[]>(`/activity?project_id=${params.id}&limit=30`).then(setActivity).catch(() => setActivity([]));
    api.get<TelegramLogEntry[]>(`/telegram/messages?project_id=${params.id}`).then(setTelegram).catch(() => setTelegram([]));
    api.get<ArchivedItem[]>('/archive').then((items) => setArchived(items.filter((item) => item.project_id === params.id))).catch(() => setArchived([]));
  }, [params.id, data]);

  if (loading) return <PageSkeleton />;
  if (!project) {
    return <EmptyState icon={FolderKanban} title={t('projectHub.notFound')} description={t('projectHub.notFoundDesc')} action={<Button variant="outline" asChild><Link href="/projects"><ArrowLeft />{t('projectHub.back')}</Link></Button>} />;
  }

  const today = todayKey();
  const done = scoped.tasks.filter((item) => item.status === 'done');
  const open = scoped.tasks.filter((item) => item.status !== 'done').sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
  const percent = scoped.tasks.length ? Math.round((done.length / scoped.tasks.length) * 100) : 0;
  const schedule = [
    ...scoped.events.map((item) => ({ id: item.id, type: 'event' as const, title: item.title, date: item.date, time: item.time })),
    ...scoped.meetings.map((item) => ({ id: item.id, type: 'meeting' as const, title: item.title, date: item.date, time: item.time })),
  ].sort((a, b) => `${a.date}${a.time ?? ''}`.localeCompare(`${b.date}${b.time ?? ''}`));
  const upcoming = schedule.filter((item) => item.date >= today);
  const past = schedule.filter((item) => item.date < today).reverse();
  const dayLabels = { today: t('common.today'), tomorrow: t('common.tomorrow'), yesterday: t('common.yesterday') };
  const slug = project.name.replace(/[^0-9A-Za-zÄÖÜäöüß]/g, '');
  const setTab = (next: Tab) => router.replace(next === 'overview' ? `/projects/${project.id}` : `/projects/${project.id}?tab=${next}`, { scroll: false });

  async function newNote() {
    const note = await create('notes', { title: '', content: '', project_id: project!.id });
    if (note) router.push(`/explorer?id=${note.id}`);
  }

  async function newDocument() {
    const doc = await create('knowledge', { title: t('projectHub.newDocument'), project_id: project!.id });
    if (doc) router.push(`/explorer?view=docs&id=${doc.id}`);
  }

  const counts: Record<Tab, number | null> = {
    overview: null, tasks: open.length, notes: scoped.notes.length, schedule: upcoming.length, documents: scoped.documents.length,
    telegram: telegram.length, archive: archived.length,
  };

  const kpis = [
    { label: t('projectHub.progress'), value: percent, suffix: '%', icon: CheckSquare2 },
    { label: t('projectHub.openTasks'), value: open.length, icon: CheckSquare2 },
    { label: t('projectHub.notes'), value: scoped.notes.length, icon: FileText },
    { label: t('projectHub.schedule'), value: upcoming.length, icon: CalendarDays },
    { label: t('projectHub.documents'), value: scoped.documents.length, icon: BookOpen },
    { label: t('projectHub.telegram'), value: telegram.length, icon: MessageCircle },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-[28px]">{project.name}</h1>
            <Badge variant={projectStatusVariant[project.status]}>{t(`projects.${project.status}`)}</Badge>
          </div>
          {project.description && <p className="max-w-3xl text-sm text-muted-foreground">{project.description}</p>}
          <EntityTagEditor type="project" id={project.id} className="max-w-xl border-transparent bg-transparent px-0 hover:bg-accent/40" />
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}><Pencil />{t('common.edit')}</Button>
          <ArchiveButton type="project" id={project.id} label onArchived={() => router.push('/projects')} />
          <Button onClick={() => setTask('new')}><Plus />{t('tasks.new')}</Button>
        </div>
      </div>

      <div className="ds-glass no-scrollbar mb-6 inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full p-[3px]" role="tablist">
        {tabs.map((value) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}
            className={cn('flex h-[22px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-book transition-[background-color,box-shadow,color] duration-600 ease-ds focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
              tab === value ? 'bg-seg text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {t(`projectHub.${value}`)}
            {counts[value] !== null && counts[value]! > 0 && <span className="font-mono text-[10px] tabular-nums opacity-70">{counts[value]}</span>}
          </button>
        ))}
      </div>

      <div key={tab} className="duration-300 animate-in fade-in slide-in-from-bottom-1">
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {kpis.map(({ label, value, suffix, icon: Icon }) => (
                <Card key={label} className="p-4">
                  <p className="flex items-center justify-between text-xs font-medium text-muted-foreground">{label}<Icon className="h-3.5 w-3.5" /></p>
                  <p className="mt-2 text-2xl font-medium tabular-nums"><CountUp value={value} />{suffix}</p>
                </Card>
              ))}
            </div>
            <Card className="p-5">
              <div className="mb-2 flex justify-between text-sm">
                <span className="font-medium">{t('projectHub.progress')}</span>
                <span className="text-muted-foreground">{scoped.tasks.length ? t('projects.progress', { done: done.length, total: scoped.tasks.length }) : t('projects.noTasks')}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-success transition-[width] duration-700 ease-ds" style={{ width: `${percent}%` }} />
              </div>
            </Card>

            <div className="grid gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">{t('projectHub.openTasks')}</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setTab('tasks')}>{t('dashboard.viewAll')}</Button>
                </CardHeader>
                <CardContent><TaskList tasks={open.slice(0, 8)} onOpen={setTask} /></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">{t('projectHub.activity')}</CardTitle></CardHeader>
                <CardContent><ActivityList entries={activity.slice(0, 10)} /></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">{t('projectHub.upcoming')}</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setTab('schedule')}>{t('dashboard.viewAll')}</Button>
                </CardHeader>
                <CardContent><ScheduleList items={upcoming.slice(0, 6)} dayLabels={dayLabels} /></CardContent>
              </Card>
              <Card className="xl:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">{t('projectHub.notes')}</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => void newNote()}><Plus />{t('projectHub.newNote')}</Button>
                </CardHeader>
                <CardContent><NoteGrid notes={scoped.notes.slice(0, 4)} /></CardContent>
              </Card>
            </div>
            <Card className="p-5"><AttachmentsPanel type="project" id={project.id} projectId={project.id} /></Card>
            <Card className="p-5"><RelationsPanel type="project" id={project.id} /></Card>
          </div>
        )}

        {tab === 'tasks' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">{t('projectHub.openTasks')} <span className="text-muted-foreground">{open.length}</span></CardTitle>
                <Button size="sm" onClick={() => setTask('new')}><Plus />{t('tasks.new')}</Button>
              </CardHeader>
              <CardContent><TaskList tasks={open} onOpen={setTask} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">{t('projectHub.doneTasks')} <span className="text-muted-foreground">{done.length}</span></CardTitle></CardHeader>
              <CardContent><TaskList tasks={done} onOpen={setTask} /></CardContent>
            </Card>
          </div>
        )}

        {tab === 'notes' && (
          <div className="space-y-4">
            <div className="flex justify-end"><Button onClick={() => void newNote()}><Plus />{t('projectHub.newNote')}</Button></div>
            <NoteGrid notes={scoped.notes} wide />
          </div>
        )}

        {tab === 'schedule' && (
          <div className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setNewMeeting(true)}><Users />{t('meetings.new')}</Button>
              <Button onClick={() => setNewEvent(true)}><Plus />{t('projectHub.newEvent')}</Button>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card><CardHeader><CardTitle className="text-base">{t('projectHub.upcoming')}</CardTitle></CardHeader><CardContent><ScheduleList items={upcoming} dayLabels={dayLabels} /></CardContent></Card>
              <Card><CardHeader><CardTitle className="text-base">{t('projectHub.past')}</CardTitle></CardHeader><CardContent><ScheduleList items={past} dayLabels={dayLabels} /></CardContent></Card>
            </div>
          </div>
        )}

        {tab === 'documents' && (
          <div className="space-y-4">
            <div className="flex justify-end"><Button onClick={() => void newDocument()}><Plus />{t('projectHub.newDocument')}</Button></div>
            {scoped.documents.length ? (
              <div className="stagger grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {scoped.documents.map((doc) => (
                  <Link key={doc.id} href={entityHref('knowledge', doc.id)} className="card-hover rounded-xl bg-card shadow-sm p-4">
                    <p className="flex items-center gap-2 font-medium"><BookOpen className="h-4 w-4 text-muted-foreground" />{doc.title}</p>
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{markdownToPlainText(doc.content) || t('notes.noContent')}</p>
                    <EntityTags type="knowledge" id={doc.id} className="mt-3" plain />
                  </Link>
                ))}
              </div>
            ) : <EmptyState icon={BookOpen} title={t('projectHub.noItems')} />}
          </div>
        )}

        {tab === 'telegram' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('projectHub.telegram')}</CardTitle>
              <CardDescription>{t('projectHub.telegramHint', { slug })}</CardDescription>
            </CardHeader>
            <CardContent>
              {telegram.length ? (
                <ul className="space-y-2">
                  {telegram.map((entry) => (
                    <li key={entry.id} className={cn('flex', entry.direction === 'in' ? 'justify-end' : 'justify-start')}>
                      <div className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', entry.direction === 'in' ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted')}>
                        <p className="whitespace-pre-wrap">{entry.text}</p>
                        <p className="mt-1 text-[10px] opacity-60">{formatDateTime(entry.at, language)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="py-6 text-center text-sm text-muted-foreground">{t('projectHub.noTelegram')}</p>}
            </CardContent>
          </Card>
        )}

        {tab === 'archive' && (
          archived.length ? (
            <Card className="divide-y overflow-hidden">
              {archived.map((item) => {
                const Icon = entityIcons[item.type];
                return (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.title || t('common.untitled')}</p>
                      <p className="text-xs text-muted-foreground">{t(entityLabelKeys[item.type])} · {t('archive.archivedAt', { date: formatDateTime(item.archived_at, language) })}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={async () => { if (await restore(item.type, item.id)) setArchived((list) => list.filter((entry) => entry.id !== item.id)); }}>
                      <RotateCcw />{t('archive.restore')}
                    </Button>
                  </div>
                );
              })}
            </Card>
          ) : <EmptyState icon={Archive} title={t('projectHub.noArchive')} />
        )}
      </div>

      <ProjectDialog project={editing ? project : null} onClose={() => setEditing(false)} />
      <TaskDialog task={task} defaultProjectId={project.id} onClose={() => setTask(null)} />
      <EventDialog event={newEvent ? 'new' : null} defaultDate={today} defaultProjectId={project.id} onClose={() => setNewEvent(false)} />
      <MeetingDialog meeting={newMeeting ? 'new' : null} defaultProjectId={project.id} onClose={() => setNewMeeting(false)} />
    </div>
  );

  function TaskList({ tasks, onOpen }: { tasks: Task[]; onOpen: (task: Task) => void }) {
    if (!tasks.length) return <p className="py-6 text-center text-sm text-muted-foreground">{t('projectHub.noItems')}</p>;
    return (
      <div className="space-y-0.5">
        {tasks.map((item) => {
          const overdue = item.status !== 'done' && item.due_date !== null && item.due_date < today;
          return (
            <div key={item.id} className="row-enter flex items-center gap-3 rounded-full px-2.5 py-1.5 transition-colors duration-300 hover:bg-accent">
              <Checkbox checked={item.status === 'done'} onCheckedChange={(checked) => void update('tasks', item.id, { status: checked ? 'done' : 'todo' })} aria-label={item.title} />
              <button type="button" className={cn('min-w-0 flex-1 truncate text-left text-sm', item.status === 'done' && 'text-muted-foreground line-through')} onClick={() => onOpen(item)}>{item.title}</button>
              {item.priority === 'high' && item.status !== 'done' && <Badge variant="destructive">{t(priorityKeys.high)}</Badge>}
              {item.due_date && <span className={cn('text-xs', overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}>{relativeDay(item.due_date, language, dayLabels)}</span>}
            </div>
          );
        })}
      </div>
    );
  }

  function NoteGrid({ notes, wide }: { notes: typeof scoped.notes; wide?: boolean }) {
    if (!notes.length) return <EmptyState icon={FileText} title={t('projectHub.noItems')} className="min-h-32 border-0 bg-transparent" />;
    return (
      <div className={cn('stagger grid gap-3 sm:grid-cols-2', wide && 'xl:grid-cols-3 2xl:grid-cols-4')}>
        {notes.map((note) => (
          <Link key={note.id} href={`/explorer?id=${note.id}`} className="rounded-2xl bg-muted p-3.5 transition-colors duration-300 hover:bg-accent">
            <p className="truncate text-sm font-medium">{note.title || t('common.untitled')}</p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{markdownToPlainText(note.content) || t('notes.noContent')}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">{formatDateTime(note.updated_at, language)}</p>
          </Link>
        ))}
      </div>
    );
  }
}

function ScheduleList({ items, dayLabels }: { items: { id: string; type: 'event' | 'meeting'; title: string; date: string; time: string | null }[]; dayLabels: { today: string; tomorrow: string; yesterday: string } }) {
  const { t, language } = useI18n();
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground">{t('projectHub.noItems')}</p>;
  return (
    <div className="space-y-1">
      {items.map((item) => (
        <Link key={item.id} href={entityHref(item.type, item.id, item.date)} className="flex items-center gap-3 rounded-2xl px-2 py-1.5 transition-colors duration-300 hover:bg-accent">
          <span className="ds-glass flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
            {item.type === 'meeting' ? <Users className="h-4 w-4 text-muted-foreground" /> : <Clock3 className="h-4 w-4 text-muted-foreground" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{item.title}</span>
            <span className="block text-xs text-muted-foreground">{relativeDay(item.date, language, dayLabels)}{item.time ? ` · ${item.time}` : ''}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
