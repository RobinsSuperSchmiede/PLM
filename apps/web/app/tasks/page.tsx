'use client';

import { useMemo, useState } from 'react';
import { CalendarClock, CheckSquare2, ChevronDown, Pencil, Plus } from 'lucide-react';

import { ANY, FilterBar } from '@/components/filter-bar';
import { useI18n } from '@/components/i18n-provider';
import { EntityTags } from '@/components/knowledge';
import { OpenFromQuery, useClearQueryId } from '@/components/open-from-query';
import { TaskDialog, priorityKeys, statusKeys } from '@/components/task-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DeleteButton, EmptyState, PageHeader, PageSkeleton, SearchInput } from '@/components/workspace-ui';
import { VirtualList } from '@/components/virtual-list';
import { useWorkspace } from '@/components/workspace-provider';
import { colorOf } from '@/lib/appearance';
import { addDays, relativeDay, toDateKey, todayKey } from '@/lib/dates';
import { priorityColors, statusColors } from '@/lib/colors';
import type { Task, TaskPriority, TaskStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

type Sort = 'due' | 'priority' | 'created' | 'updated' | 'title';
const priorityRank: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
const NO_PROJECT = '__none__';

export default function TasksPage() {
  const { t, language } = useI18n();
  const { data, loading, update, remove, tags, tagAssignments } = useWorkspace();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string>(ANY);
  const [priority, setPriority] = useState<string>(ANY);
  const [project, setProject] = useState<string>(ANY);
  const [tag, setTag] = useState<string>(ANY);
  const [due, setDue] = useState<string>(ANY);
  const [sort, setSort] = useState<Sort>('due');
  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  const clearQuery = useClearQueryId();

  const projects = useMemo(() => new Map(data.projects.map((item) => [item.id, item])), [data.projects]);
  const today = todayKey();

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const weekEnd = toDateKey(addDays(new Date(), 7));
    const tagged = tag !== ANY ? new Set(tagAssignments.filter((entry) => entry.tag_id === tag && entry.entity_type === 'task').map((entry) => entry.entity_id)) : null;
    return data.tasks
      .filter((task) => status === ANY || (status === 'open' ? task.status !== 'done' : task.status === status))
      .filter((task) => priority === ANY || task.priority === priority)
      .filter((task) => project === ANY || (project === NO_PROJECT ? !task.project_id : task.project_id === project))
      .filter((task) => !tagged || tagged.has(task.id))
      .filter((task) => {
        if (due === ANY) return true;
        if (due === 'none') return !task.due_date;
        if (!task.due_date) return false;
        if (due === 'overdue') return task.status !== 'done' && task.due_date < today;
        if (due === 'today') return task.due_date === today;
        if (due === 'week') return task.due_date >= today && task.due_date <= weekEnd;
        return task.due_date > weekEnd;
      })
      .filter((task) => !term || `${task.title} ${task.description ?? ''}`.toLowerCase().includes(term))
      .sort((a, b) => {
        if (sort === 'priority') return priorityRank[a.priority] - priorityRank[b.priority] || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
        if (sort === 'created') return b.created_at.localeCompare(a.created_at);
        if (sort === 'updated') return b.updated_at.localeCompare(a.updated_at);
        if (sort === 'title') return a.title.localeCompare(b.title);
        return Number(a.status === 'done') - Number(b.status === 'done') || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
      });
  }, [data.tasks, due, priority, project, query, sort, status, tag, tagAssignments, today]);

  if (loading) return <PageSkeleton />;

  const dayLabels = { today: t('common.today'), tomorrow: t('common.tomorrow'), yesterday: t('common.yesterday') };
  const open = data.tasks.filter((task) => task.status !== 'done');
  const overdue = open.filter((task) => task.due_date && task.due_date < today).length;
  const summary = [
    { key: 'open', label: t('tasks.todo'), value: data.tasks.filter((task) => task.status === 'todo').length, color: statusColors.todo, onClick: () => setStatus('todo') },
    { key: 'progress', label: t('tasks.inProgress'), value: data.tasks.filter((task) => task.status === 'in-progress').length, color: statusColors['in-progress'], onClick: () => setStatus('in-progress') },
    { key: 'overdue', label: t('filters.dueOverdue'), value: overdue, color: priorityColors.high, onClick: () => { setStatus(ANY); setDue('overdue'); } },
    { key: 'done', label: t('tasks.done'), value: data.tasks.filter((task) => task.status === 'done').length, color: statusColors.done, onClick: () => setStatus('done') },
  ];

  return (
    <div>
      <PageHeader
        title={t('tasks.title')}
        description={t('tasks.description', { count: open.length })}
        action={<Button onClick={() => setEditing('new')}><Plus />{t('tasks.new')}</Button>}
      />

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {summary.map((item) => (
          <button key={item.key} type="button" onClick={item.onClick}
            className="group flex items-center gap-3 rounded-[18px] bg-card px-4 py-3 text-left shadow-sm transition-[transform,box-shadow] duration-300 ease-ds hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
            <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
            <span>
              <span className="block text-xl font-semibold leading-tight tracking-[-0.02em] tabular-nums">{item.value}</span>
              <span className="block text-xs text-muted-foreground">{item.label}</span>
            </span>
          </button>
        ))}
      </div>

      <FilterBar
        className="mb-4"
        filters={[
          { key: 'status', label: t('filters.status'), value: status, onChange: setStatus, options: [
            { value: 'open', label: `${t('tasks.todo')} + ${t('tasks.inProgress')}` },
            ...(Object.keys(statusKeys) as TaskStatus[]).map((value) => ({ value, label: t(statusKeys[value]), color: statusColors[value] })),
          ] },
          { key: 'priority', label: t('filters.priority'), value: priority, onChange: setPriority,
            options: (['high', 'medium', 'low'] as TaskPriority[]).map((value) => ({ value, label: t(priorityKeys[value]), color: priorityColors[value] })) },
          { key: 'due', label: t('filters.due'), value: due, onChange: setDue, options: [
            { value: 'overdue', label: t('filters.dueOverdue'), color: priorityColors.high }, { value: 'today', label: t('filters.dueToday') },
            { value: 'week', label: t('filters.dueWeek') }, { value: 'later', label: t('filters.dueLater') }, { value: 'none', label: t('filters.dueNone') },
          ] },
          { key: 'project', label: t('filters.project'), value: project, onChange: setProject,
            options: [...data.projects.map((item) => ({ value: item.id, label: item.name, color: colorOf(item.name) })), { value: NO_PROJECT, label: t('filters.noProject') }] },
          { key: 'tag', label: t('filters.tag'), value: tag, onChange: setTag,
            options: tags.filter((entry) => entry.count).map((entry) => ({ value: entry.id, label: `#${entry.name}`, color: colorOf(entry.name) })) },
        ]}
        sort={{ value: sort, onChange: (value) => setSort(value as Sort), options: [
          { value: 'due', label: t('filters.sortDue') }, { value: 'priority', label: t('filters.sortPriority') }, { value: 'created', label: t('filters.sortCreated') },
          { value: 'updated', label: t('filters.sortUpdated') }, { value: 'title', label: t('filters.sortTitle') },
        ] }}
      >
        <SearchInput value={query} onChange={setQuery} placeholder={t('tasks.search')} className="sm:w-64 [&_input]:h-8 [&_input]:rounded-full" />
      </FilterBar>

      {filtered.length ? (
        <>
          <p className="mb-2 px-1 text-xs text-muted-foreground">{t('filters.showing', { shown: filtered.length, total: data.tasks.length })}</p>
          <VirtualList items={filtered} keyOf={(task) => task.id} estimateSize={54} gap={2} renderItem={(task) => {
              const done = task.status === 'done';
              const late = !done && task.due_date !== null && task.due_date < today;
              const taskProject = task.project_id ? projects.get(task.project_id) : undefined;
              return (
                <div className="group relative flex items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors duration-300 hover:bg-accent">
                  <Checkbox checked={done} onCheckedChange={(checked) => void update('tasks', task.id, { status: checked ? 'done' : 'todo' })} aria-label={`${t('tasks.done')}: ${task.title}`} />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(task)}>
                    <p className={cn('truncate text-[13px] font-medium transition-colors duration-200', done && 'text-muted-foreground line-through')}>{task.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {taskProject && <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: colorOf(taskProject.name) }} />{taskProject.name}</span>}
                      {task.due_date && (
                        <span className={cn('inline-flex items-center gap-1', late && 'font-medium text-destructive')}>
                          <CalendarClock className="h-3 w-3" />{late ? `${t('tasks.overdue')} · ` : ''}{relativeDay(task.due_date, language, dayLabels)}
                        </span>
                      )}
                      <EntityTags type="task" id={task.id} limit={3} plain className="[&>span]:h-5" />
                    </p>
                  </button>
                  <span className={cn('hidden w-14 text-right text-xs md:inline', task.priority === 'high' && !done ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                    {t(priorityKeys[task.priority])}
                  </span>
                  <StatusSelect status={task.status} onChange={(value) => void update('tasks', task.id, { status: value })} />
                  <Button variant="ghost" size="icon-sm" className="text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100" aria-label={`${t('common.edit')}: ${task.title}`} onClick={() => setEditing(task)}><Pencil /></Button>
                  <DeleteButton name={task.title} onConfirm={() => void remove('tasks', task.id)} />
                </div>
              );
            }} />
        </>
      ) : (
        <EmptyState icon={CheckSquare2} title={t('tasks.empty')} description={t('tasks.emptyDesc')} action={<Button variant="outline" onClick={() => setEditing('new')}><Plus />{t('tasks.new')}</Button>} />
      )}

      <OpenFromQuery items={data.tasks} onOpen={setEditing} />
      <TaskDialog task={editing} onClose={() => { setEditing(null); clearQuery(); }} />
    </div>
  );
}

/**
 * Status picker of a row. Until it is used it is a plain button that looks the same; the Radix select
 * (with its own state, listeners and collection) is mounted on the first click or key press, opens at once
 * and then stays, so keyboard focus is never lost.
 */
function StatusSelect({ status, onChange }: { status: TaskStatus; onChange: (status: TaskStatus) => void }) {
  const { t } = useI18n();
  const [active, setActive] = useState(false);
  const trigger = 'hidden h-8 w-[130px] gap-1.5 rounded-full text-xs sm:flex';
  const dot = <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: statusColors[status] }} />;

  if (!active) {
    return (
      <button type="button" aria-label={t('common.status')} aria-haspopup="listbox"
        onPointerDown={(event) => { if (event.button === 0) { event.preventDefault(); setActive(true); } }}
        onKeyDown={(event) => { if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setActive(true); } }}
        className={cn('ds-glass items-center justify-between px-3.5 text-left text-foreground transition-[background-color,box-shadow] duration-200 ease-ds hover:bg-glass-hover hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring', trigger)}>
        <span className="flex min-w-0 items-center gap-1.5">{dot}<span className="truncate">{t(statusKeys[status])}</span></span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
    );
  }

  return (
    <Select value={status} defaultOpen onValueChange={(value) => onChange(value as TaskStatus)}>
      <SelectTrigger className={trigger} aria-label={t('common.status')}>
        {dot}<SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(statusKeys) as TaskStatus[]).map((value) => <SelectItem key={value} value={value}>{t(statusKeys[value])}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
