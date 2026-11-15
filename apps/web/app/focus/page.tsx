'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import {
  ArrowRight, BookOpen, Bot, CalendarDays, FileText, Folder as FolderIcon, Lightbulb, ListChecks, NotebookPen, Paperclip, Pin, Plus, Send, Star, Users,
} from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { ideaStatusKeys } from '@/components/idea-dialog';
import { projectStatusVariant } from '@/components/project-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { EmptyState, PageHeader, PageSkeleton } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { colorOf } from '@/lib/appearance';
import { formatDate, formatDateTime, relativeDay, todayKey } from '@/lib/dates';
import { markdownToPlainText } from '@/lib/markdown';
import type { Project, Task, WorkspaceList } from '@/lib/types';
import { cn } from '@/lib/utils';

const fg2 = 'text-[hsl(var(--fg-2)/var(--fg-2-a))]';
const linkRow = 'flex items-center gap-2.5 rounded-full px-2 py-1.5 text-[13px] transition-colors duration-300 hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring';

const byDue = (a: Task, b: Task) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || Number(b.priority === 'high') - Number(a.priority === 'high');

export default function FocusPage() {
  const { t } = useI18n();
  const { data, loading } = useWorkspace();

  if (loading) return <PageSkeleton />;

  const projects = data.projects.filter((project) => project.pinned).sort((a, b) => a.name.localeCompare(b.name));
  const notes = data.notes.filter((note) => note.pinned).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const lists = data.lists.filter((list) => list.pinned);
  const folders = data.folders.filter((folder) => folder.pinned || folder.favorite).sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
  const highTasks = data.tasks.filter((task) => task.status !== 'done' && task.priority === 'high').sort(byDue);
  const ideas = data.ideas.filter((idea) => idea.status === 'exploring' || idea.status === 'planned').sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  return (
    <div>
      <PageHeader title={t('focus.title')} description={t('focus.description')} />

      {/* Pinned projects, each with what is open, what comes next and what was written. */}
      <SectionTitle icon={Pin} label={t('focus.projects')} count={projects.length} href="/projects" />
      {projects.length ? (
        <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => <ProjectCard key={project.id} project={project} />)}
        </div>
      ) : (
        <EmptyState icon={Pin} title={t('focus.noProjects')} description={t('focus.noProjectsDesc')}
          action={<Button variant="outline" asChild><Link href="/projects">{t('focus.toProjects')}<ArrowRight /></Link></Button>} />
      )}

      <section className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><NotebookPen className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />{t('focus.notes')}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {notes.slice(0, 8).map((note) => (
              <Link key={note.id} href={`/explorer?id=${note.id}`} className="block rounded-2xl bg-muted p-3 transition-colors duration-300 hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
                <p className="flex items-center gap-1.5 text-[13px] font-medium">
                  <span className="truncate">{note.title || t('common.untitled')}</span>
                  {note.source === 'telegram' ? <Send className="h-3 w-3 shrink-0 opacity-60" /> : note.source === 'mcp' ? <Bot className="h-3 w-3 shrink-0 opacity-60" /> : null}
                </p>
                <p className={cn('mt-1 line-clamp-2 text-xs leading-relaxed', fg2)}>{markdownToPlainText((note.content ?? '').slice(0, 300)) || t('notes.noContent')}</p>
              </Link>
            ))}
            {notes.length > 8 && <Link href="/explorer?view=notes" className="block px-2 text-xs text-muted-foreground hover:text-foreground">{t('focus.more', { count: notes.length - 8 })}</Link>}
            {notes.length === 0 && <p className={cn('text-[13px]', fg2)}>{t('focus.noNotes')}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base"><ListChecks className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />{t('focus.lists')}</CardTitle>
            <Button variant="ghost" size="icon-sm" asChild aria-label={t('nav.lists')}><Link href="/lists"><ArrowRight /></Link></Button>
          </CardHeader>
          <CardContent className="space-y-5">
            {lists.map((list) => <PinnedList key={list.id} list={list} />)}
            {lists.length === 0 && <p className={cn('text-[13px]', fg2)}>{t('focus.noLists')}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base"><FolderIcon className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />{t('focus.folders')}</CardTitle>
            <CardDescription>{t('focus.foldersDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {folders.map((folder) => {
              const items = [
                ...data.notes.filter((note) => note.folder_id === folder.id).map((note) => ({ key: `n${note.id}`, title: note.title || t('common.untitled'), at: note.updated_at, href: `/explorer?id=${note.id}`, icon: FileText })),
                ...data.knowledge.filter((doc) => doc.folder_id === folder.id).map((doc) => ({ key: `d${doc.id}`, title: doc.title, at: doc.updated_at, href: `/explorer?view=docs&id=${doc.id}`, icon: BookOpen })),
                ...data.files.filter((file) => file.folder_id === folder.id).map((file) => ({ key: `f${file.id}`, title: file.name, at: file.updated_at, href: `/explorer?folder=${folder.id}`, icon: Paperclip })),
              ].sort((a, b) => b.at.localeCompare(a.at));
              return (
                <div key={folder.id}>
                  <Link href={`/explorer?folder=${folder.id}`} className="flex items-center gap-2 rounded-full px-2 py-1 text-[13px] font-medium transition-colors duration-300 hover:bg-accent">
                    <FolderIcon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                    <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                    {folder.favorite && <Star className="h-3 w-3 shrink-0 fill-current text-warning" />}
                    {folder.pinned && <Pin className="h-3 w-3 shrink-0 opacity-60" />}
                    <span className="shrink-0 font-mono text-[10px] font-normal text-muted-foreground">{items.length}</span>
                  </Link>
                  {items.slice(0, 3).map((item) => (
                    <Link key={item.key} href={item.href} className={cn(linkRow, 'ml-4 py-1', fg2)}>
                      <item.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
                      <span className="truncate">{item.title}</span>
                    </Link>
                  ))}
                </div>
              );
            })}
            {folders.length === 0 && <p className={cn('text-[13px]', fg2)}>{t('focus.noFolders')}</p>}
          </CardContent>
        </Card>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">{t('focus.highPriority')}</CardTitle>
            <CardDescription>{t('focus.highPriorityDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-0.5">
            {highTasks.slice(0, 8).map((task) => <TaskRow key={task.id} task={task} showProject />)}
            {highTasks.length > 8 && <Link href="/tasks" className="block px-2 pt-1 text-xs text-muted-foreground hover:text-foreground">{t('focus.more', { count: highTasks.length - 8 })}</Link>}
            {highTasks.length === 0 && <p className={cn('px-2 text-[13px]', fg2)}>{t('focus.noHigh')}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">{t('focus.ideas')}</CardTitle>
            <CardDescription>{t('focus.ideasDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-0.5">
            {ideas.slice(0, 8).map((idea) => (
              <Link key={idea.id} href={`/ideas?id=${idea.id}`} className={linkRow}>
                <Lightbulb className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                <span className="min-w-0 flex-1 truncate">{idea.title}</span>
                <Badge variant="secondary">{t(ideaStatusKeys[idea.status])}</Badge>
              </Link>
            ))}
            {ideas.length === 0 && <p className={cn('px-2 text-[13px]', fg2)}>{t('focus.noIdeas')}</p>}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function SectionTitle({ icon: Icon, label, count, href }: { icon: typeof Pin; label: string; count: number; href: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />{label}<span className="font-mono text-xs font-normal text-muted-foreground">{count}</span></h2>
      <Button variant="ghost" size="icon-sm" asChild aria-label={label}><Link href={href}><ArrowRight /></Link></Button>
    </div>
  );
}

function TaskRow({ task, showProject }: { task: Task; showProject?: boolean }) {
  const { t, language } = useI18n();
  const { data, update } = useWorkspace();
  const today = todayKey();
  const project = showProject && task.project_id ? data.projects.find((entry) => entry.id === task.project_id) : null;
  const dayLabels = { today: t('common.today'), tomorrow: t('common.tomorrow'), yesterday: t('common.yesterday') };
  return (
    <div className="row-enter flex h-8 items-center gap-2.5 rounded-full px-2 transition-colors duration-300 hover:bg-accent">
      <Checkbox checked={false} onCheckedChange={() => void update('tasks', task.id, { status: 'done' })} aria-label={`${t('tasks.done')}: ${task.title}`} />
      <Link href={`/tasks?id=${task.id}`} className="min-w-0 flex-1 truncate text-[13px] hover:underline">{task.title}</Link>
      {project && <span className="hidden max-w-[8rem] shrink-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground sm:flex"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorOf(project.name) }} />{project.name}</span>}
      {task.due_date && <span className={cn('shrink-0 font-mono text-[11px] tabular-nums', task.due_date < today ? 'text-destructive' : 'text-muted-foreground')}>{relativeDay(task.due_date, language, dayLabels)}</span>}
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const { t, language } = useI18n();
  const { data, update } = useWorkspace();
  const today = todayKey();
  const tasks = data.tasks.filter((task) => task.project_id === project.id);
  const open = tasks.filter((task) => task.status !== 'done').sort(byDue);
  const percent = tasks.length ? Math.round(((tasks.length - open.length) / tasks.length) * 100) : 0;
  const next = [
    ...data.events.filter((event) => event.project_id === project.id && event.date >= today).map((event) => ({ id: event.id, title: event.title, date: event.date, time: event.time, href: `/calendar?date=${event.date}`, icon: CalendarDays })),
    ...data.meetings.filter((meeting) => meeting.project_id === project.id && meeting.status === 'planned' && meeting.date >= today).map((meeting) => ({ id: meeting.id, title: meeting.title, date: meeting.date, time: meeting.time, href: `/meetings?id=${meeting.id}`, icon: Users })),
  ].sort((a, b) => `${a.date}${a.time ?? ''}`.localeCompare(`${b.date}${b.time ?? ''}`))[0];
  const notes = data.notes.filter((note) => note.project_id === project.id).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const docs = data.knowledge.filter((doc) => doc.project_id === project.id).length;
  const files = data.files.filter((file) => file.project_id === project.id).length;

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
        <Link href={`/projects/${project.id}`} className="min-w-0 space-y-1.5">
          <CardTitle className="flex items-center gap-2 truncate text-base hover:underline"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorOf(project.name) }} />{project.name}</CardTitle>
          <Badge variant={projectStatusVariant[project.status]}>{t(`projects.${project.status}`)}</Badge>
        </Link>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-pressed title={t('focus.unpin')} aria-label={`${t('focus.unpin')}: ${project.name}`}
          onClick={() => void update('projects', project.id, { pinned: false })}><Pin className="fill-current text-foreground" /></Button>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t('focus.openTasks', { count: open.length })}</span>
            <span className="tabular-nums">{percent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-success transition-[width] duration-700 ease-ds" style={{ width: `${percent}%` }} /></div>
        </div>

        <div className="-mx-2 space-y-0.5">
          {open.slice(0, 5).map((task) => <TaskRow key={task.id} task={task} />)}
          {open.length > 5 && <Link href={`/projects/${project.id}`} className="block px-2 pt-1 text-xs text-muted-foreground hover:text-foreground">{t('focus.more', { count: open.length - 5 })}</Link>}
          {open.length === 0 && <p className={cn('px-2 text-[13px]', fg2)}>{t('focus.noOpen')}</p>}
        </div>

        {next && (
          <Link href={next.href} className="flex items-center gap-2.5 rounded-2xl bg-muted px-3 py-2 text-[13px] transition-colors duration-300 hover:bg-accent">
            <next.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} />
            <span className="min-w-0 flex-1 truncate">{next.title}</span>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{formatDate(next.date, language)}{next.time ? ` ${next.time}` : ''}</span>
          </Link>
        )}

        {notes.length > 0 && (
          <div>
            <p className="ds-label pb-1">{t('focus.recentNotes')}</p>
            <div className="-mx-2">
              {notes.slice(0, 3).map((note) => (
                <Link key={note.id} href={`/explorer?id=${note.id}`} className={cn(linkRow, 'py-1')}>
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                  <span className="min-w-0 flex-1 truncate">{note.title || t('common.untitled')}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatDateTime(note.updated_at, language)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-auto flex gap-4 pt-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" />{notes.length}</span>
          <span className="inline-flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{docs}</span>
          <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />{files}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function PinnedList({ list }: { list: WorkspaceList }) {
  const { t } = useI18n();
  const { listItems } = useWorkspace();
  const [text, setText] = useState('');
  const open = list.items.filter((item) => !item.done);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText('');
    await listItems.add(list.id, value);
  }

  return (
    <div>
      <Link href={`/lists?id=${list.id}`} className="flex items-center justify-between px-2 pb-1 text-[13px] font-medium hover:underline">
        <span className="truncate">{list.title}</span>
        <span className="font-mono text-[11px] font-normal text-muted-foreground">{list.items.length - open.length}/{list.items.length}</span>
      </Link>
      {open.slice(0, 6).map((item) => (
        <label key={item.id} className="flex items-center gap-2.5 rounded-full px-2 py-1 text-[13px] transition-colors duration-300 hover:bg-accent">
          <Checkbox checked={false} onCheckedChange={() => void listItems.update(list.id, item.id, { done: true })} />
          <span className="truncate">{item.text}</span>
        </label>
      ))}
      {open.length > 6 && <Link href={`/lists?id=${list.id}`} className="block px-2 text-xs text-muted-foreground hover:text-foreground">{t('focus.more', { count: open.length - 6 })}</Link>}
      {open.length === 0 && <p className={cn('px-2 text-xs', fg2)}>{t('focus.listDone')}</p>}
      <form onSubmit={add} className="flex gap-1.5 px-1 pt-1">
        <Input value={text} onChange={(event) => setText(event.target.value)} placeholder={t('focus.addItem')} aria-label={t('focus.addItem')} className="h-8" />
        <Button type="submit" size="icon-sm" variant="secondary" disabled={!text.trim()} aria-label={t('common.add')}><Plus /></Button>
      </form>
    </div>
  );
}
