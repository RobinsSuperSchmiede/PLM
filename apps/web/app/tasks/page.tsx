'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Check, Circle, CircleDashed, ListFilter, Plus, Search, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PageHeader, PageSkeleton, SearchInput } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import type { TaskPriority, TaskStatus, WorkspaceTask } from '@/lib/workspace-data';

const statusNames: Record<TaskStatus, string> = { todo: 'To do', 'in-progress': 'In progress', done: 'Done' };

export default function TasksPage() {
  const { data, updateData, loading } = useWorkspace();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | TaskStatus>('all');
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');

  const visibleTasks = useMemo(() => data.tasks.filter((task) =>
    (filter === 'all' || task.status === filter) && task.title.toLowerCase().includes(query.toLowerCase()),
  ), [data.tasks, filter, query]);

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const task: WorkspaceTask = { id: `task-${Date.now()}`, title: trimmed, status: 'todo', priority, due: 'No date' };
    updateData((current) => ({ ...current, tasks: [task, ...current.tasks] }));
    setTitle('');
    setAdding(false);
  }

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        title="Tasks"
        description={`${data.tasks.filter((task) => task.status !== 'done').length} offene Aufgaben · lokal gespeichert`}
        action={<Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setAdding((value) => !value)}><Plus className="h-3.5 w-3.5" />New task</Button>}
      />
      {adding && (
        <form onSubmit={addTask} className="mb-4 flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row">
          <label className="sr-only" htmlFor="task-title">Task title</label>
          <input id="task-title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Task title…" className="h-8 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground" />
          <label className="sr-only" htmlFor="task-priority">Priority</label>
          <select id="task-priority" value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
            <option value="low">Low priority</option><option value="medium">Medium priority</option><option value="high">High priority</option>
          </select>
          <Button type="submit" size="sm" className="h-8 text-xs">Add task</Button>
        </form>
      )}

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1" aria-label="Filter tasks">
          {[['all', 'All'], ['todo', 'To do'], ['in-progress', 'In progress'], ['done', 'Done']].map(([value, label]) => (
            <Button key={value} variant={filter === value ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2.5 text-[11px]" onClick={() => setFilter(value as typeof filter)}>{label}</Button>
          ))}
        </div>
        <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" /><SearchInput value={query} onChange={setQuery} placeholder="Search tasks" /></div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="hidden grid-cols-[minmax(0,1fr)_135px_110px_90px_32px] items-center gap-3 border-b border-border px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
          <span>Task</span><span>Status</span><span>Priority</span><span>Due</span><span />
        </div>
        {visibleTasks.map((task) => {
          const StatusIcon = task.status === 'done' ? Check : task.status === 'in-progress' ? CircleDashed : Circle;
          return (
            <div key={task.id} className="grid grid-cols-[minmax(0,1fr)_32px] items-center gap-3 border-b border-border/70 px-3 py-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_135px_110px_90px_32px] sm:px-4">
              <div className="min-w-0">
                <p className={`truncate text-xs font-medium ${task.status === 'done' ? 'text-muted-foreground line-through' : ''}`}>{task.title}</p>
                <p className="mt-1 text-[10px] text-muted-foreground sm:hidden">{statusNames[task.status]} · {task.priority} · {task.due}</p>
              </div>
              <label className="sr-only" htmlFor={`status-${task.id}`}>Status: {task.title}</label>
              <div className="hidden items-center gap-1.5 sm:flex">
                <StatusIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <label className="sr-only" htmlFor={`desktop-status-${task.id}`}>Status: {task.title}</label>
                <select id={`desktop-status-${task.id}`} value={task.status} onChange={(event) => updateData((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: event.target.value as TaskStatus } : item) }))} className="h-7 rounded-md border border-input bg-background px-1.5 text-[10px] text-muted-foreground">
                  <option value="todo">To do</option><option value="in-progress">In progress</option><option value="done">Done</option>
                </select>
              </div>
              <span className="hidden text-[11px] capitalize text-muted-foreground sm:block">{task.priority}</span>
              <span className="hidden text-[11px] text-muted-foreground sm:block">{task.due}</span>
              <div className="flex items-center gap-1">
                <select
                  id={`status-${task.id}`}
                  value={task.status}
                  onChange={(event) => updateData((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: event.target.value as TaskStatus } : item) }))}
                  aria-label={`Status ändern: ${task.title}`}
                  className="h-7 max-w-24 rounded-md border border-input bg-background px-1 text-[10px] sm:hidden"
                ><option value="todo">To do</option><option value="in-progress">In progress</option><option value="done">Done</option></select>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" aria-label={`Delete ${task.title}`} onClick={() => updateData((current) => ({ ...current, tasks: current.tasks.filter((item) => item.id !== task.id) }))}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          );
        })}
        {visibleTasks.length === 0 && <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center"><ListFilter className="h-4 w-4 text-muted-foreground" /><p className="text-xs text-muted-foreground">No tasks match this view.</p></div>}
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground"><Search className="h-3 w-3" />Search and status filters apply instantly.</p>
    </div>
  );
}
