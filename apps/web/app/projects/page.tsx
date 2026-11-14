'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, FileText, FolderKanban, Pencil, Plus } from 'lucide-react';

import { ANY, FilterBar } from '@/components/filter-bar';
import { useI18n } from '@/components/i18n-provider';
import { ArchiveButton, EntityTags } from '@/components/knowledge';
import { ProjectDialog, projectStatusVariant } from '@/components/project-dialog';
import { TaskDialog } from '@/components/task-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DeleteButton, EmptyState, PageHeader, PageSkeleton, SearchInput } from '@/components/workspace-ui';
import { colorOf } from '@/lib/appearance';
import { projectStatusColors } from '@/lib/colors';
import { useWorkspace } from '@/components/workspace-provider';
import type { Project } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function ProjectsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { data, loading, update, remove } = useWorkspace();
  const [editing, setEditing] = useState<Project | 'new' | null>(null);
  const [taskFor, setTaskFor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState(ANY);
  const [tag, setTag] = useState(ANY);
  const [sort, setSort] = useState('updated');
  const { tags, tagAssignments } = useWorkspace();

  const progress = useMemo(() => {
    const result = new Map<string, number>();
    for (const project of data.projects) {
      const tasks = data.tasks.filter((task) => task.project_id === project.id);
      result.set(project.id, tasks.length ? tasks.filter((task) => task.status === 'done').length / tasks.length : 0);
    }
    return result;
  }, [data.projects, data.tasks]);

  const projects = useMemo(() => {
    const term = query.trim().toLowerCase();
    const tagged = tag !== ANY ? new Set(tagAssignments.filter((entry) => entry.tag_id === tag && entry.entity_type === 'project').map((entry) => entry.entity_id)) : null;
    return data.projects
      .filter((project) => status === ANY || project.status === status)
      .filter((project) => !tagged || tagged.has(project.id))
      .filter((project) => !term || `${project.name} ${project.description ?? ''}`.toLowerCase().includes(term))
      .sort((a, b) => (sort === 'title' ? a.name.localeCompare(b.name) : sort === 'progress' ? (progress.get(b.id) ?? 0) - (progress.get(a.id) ?? 0) : b.updated_at.localeCompare(a.updated_at)));
  }, [data.projects, progress, query, sort, status, tag, tagAssignments]);

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader title={t('projects.title')} description={t('projects.description')} action={<Button onClick={() => setEditing('new')}><Plus />{t('projects.new')}</Button>} />

      {data.projects.length > 0 && (
        <FilterBar className="mb-5"
          filters={[
            { key: 'status', label: t('filters.status'), value: status, onChange: setStatus,
              options: (['active', 'on_hold', 'completed'] as const).map((value) => ({ value, label: t(`projects.${value}`), color: projectStatusColors[value] })) },
            { key: 'tag', label: t('filters.tag'), value: tag, onChange: setTag,
              options: tags.filter((entry) => tagAssignments.some((item) => item.tag_id === entry.id && item.entity_type === 'project')).map((entry) => ({ value: entry.id, label: `#${entry.name}`, color: colorOf(entry.name) })) },
          ]}
          sort={{ value: sort, onChange: setSort, options: [
            { value: 'updated', label: t('filters.sortUpdated') }, { value: 'title', label: t('filters.sortTitle') }, { value: 'progress', label: t('filters.sortProgress') },
          ] }}
        >
          <SearchInput value={query} onChange={setQuery} placeholder={t('search.trigger')} className="sm:w-64 [&_input]:h-8 [&_input]:rounded-full" />
        </FilterBar>
      )}

      {data.projects.length ? (
        <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {projects.map((project) => {
            const tasks = data.tasks.filter((task) => task.project_id === project.id);
            const done = tasks.filter((task) => task.status === 'done').length;
            const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
            const notes = data.notes.filter((note) => note.project_id === project.id).length;
            const schedule = data.events.filter((event) => event.project_id === project.id).length + data.meetings.filter((meeting) => meeting.project_id === project.id).length;
            return (
              <Card key={project.id} className="flex flex-col overflow-hidden transition-shadow duration-200 ease-ds hover:shadow-md">
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                  <Link href={`/projects/${project.id}`} className="min-w-0 space-y-1.5">
                    <CardTitle className="flex items-center gap-2 truncate text-base hover:underline"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorOf(project.name) }} aria-hidden="true" />{project.name}</CardTitle>
                    <Badge variant={projectStatusVariant[project.status]}>{t(`projects.${project.status}`)}</Badge>
                  </Link>
                  <div className="flex shrink-0">
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`${t('common.edit')}: ${project.name}`} onClick={() => setEditing(project)}><Pencil /></Button>
                    <ArchiveButton type="project" id={project.id} />
                    <DeleteButton name={project.name} onConfirm={() => void remove('projects', project.id)} />
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-4">
                  {project.description && <CardDescription className="line-clamp-3">{project.description}</CardDescription>}
                  <EntityTags type="project" id={project.id} />
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{tasks.length ? t('projects.progress', { done, total: tasks.length }) : t('projects.noTasks')}</span>
                      <span className="tabular-nums">{percent}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-success transition-[width] duration-700 ease-ds" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    {tasks.filter((task) => task.status !== 'done').slice(0, 4).map((task) => (
                      <label key={task.id} className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted/50">
                        <Checkbox checked={task.status === 'done'} onCheckedChange={(checked) => void update('tasks', task.id, { status: checked ? 'done' : 'todo' })} />
                        <span className={cn('truncate', task.status === 'done' && 'text-muted-foreground line-through')}>{task.title}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" />{notes}</span>
                    <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{schedule}</span>
                  </div>
                </CardContent>
                <CardFooter className="gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setTaskFor(project.id)}><Plus />{t('tasks.new')}</Button>
                  <Button size="sm" className="flex-1" asChild><Link href={`/projects/${project.id}`}>{t('projectHub.open')}<ArrowRight /></Link></Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={FolderKanban} title={t('projects.empty')} description={t('projects.emptyDesc')} action={<Button variant="outline" onClick={() => setEditing('new')}><Plus />{t('projects.new')}</Button>} />
      )}

      <ProjectDialog project={editing} onClose={() => setEditing(null)} onCreated={(project) => router.push(`/projects/${project.id}`)} />
      <TaskDialog task={taskFor ? 'new' : null} defaultProjectId={taskFor ?? undefined} onClose={() => setTaskFor(null)} />
    </div>
  );
}
