'use client';

import Link from 'next/link';
import { ArrowRight, CalendarDays, CheckSquare2, Clock3, FileText, ListChecks, Plus, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PageHeader, PageSkeleton } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { toLocalDateKey } from '@/lib/workspace-data';

const quickLinks = [
  { label: 'Create a task', href: '/tasks', icon: CheckSquare2, hint: 'Add something to your list' },
  { label: 'Open calendar', href: '/calendar', icon: CalendarDays, hint: 'Plan your next days' },
  { label: 'Write a note', href: '/notes', icon: FileText, hint: 'Capture a thought' },
  { label: 'Manage a list', href: '/lists', icon: ListChecks, hint: 'Keep things organized' },
];

export default function DashboardPage() {
  const { data, loading } = useWorkspace();
  if (loading) return <PageSkeleton />;

  const openTasks = data.tasks.filter((task) => task.status !== 'done').length;
  const today = toLocalDateKey(new Date());
  const upcoming = data.events.filter((event) => event.date >= today).length;
  const stats = [
    { label: 'Open tasks', value: openTasks, note: `${data.tasks.filter((task) => task.due === 'Today' && task.status !== 'done').length} due today`, icon: CheckSquare2, href: '/tasks' },
    { label: 'Upcoming events', value: upcoming, note: 'In your calendar', icon: CalendarDays, href: '/calendar' },
    { label: 'Notes', value: data.notes.length, note: 'Saved locally', icon: FileText, href: '/notes' },
    { label: 'Lists', value: data.lists.length, note: 'Across your workspace', icon: ListChecks, href: '/lists' },
  ];

  return (
    <div>
      <PageHeader title="Good morning" description="A quiet overview of your workspace." />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workspace statistics">
        {stats.map(({ label, value, note, icon: Icon, href }) => (
          <Link key={label} href={href} className="group rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/60">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground"><span>{label}</span><Icon className="h-3.5 w-3.5" /></div>
            <p className="mt-4 text-2xl font-semibold tabular-nums tracking-tight">{value.toString().padStart(2, '0')}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{note}</p>
          </Link>
        ))}
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(270px,1fr)]">
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div><h2 className="text-xs font-medium">Recent tasks</h2><p className="mt-0.5 text-[10px] text-muted-foreground">Pick up where you left off</p></div>
            <Link href="/tasks" className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">View all <ArrowRight className="h-3 w-3" /></Link>
          </div>
          {data.tasks.filter((task) => task.status !== 'done').slice(0, 4).map((task) => (
            <Link key={task.id} href="/tasks" className="flex items-center gap-3 border-b border-border/70 px-4 py-3 last:border-0 hover:bg-accent/40">
              <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/60" />
              <span className="min-w-0 flex-1 truncate text-xs">{task.title}</span>
              <span className="text-[10px] capitalize text-muted-foreground">{task.priority}</span>
              <span className="hidden text-[10px] text-muted-foreground sm:inline">{task.due}</span>
            </Link>
          ))}
          {openTasks === 0 && <p className="px-4 py-8 text-center text-xs text-muted-foreground">All caught up. No open tasks.</p>}
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3"><h2 className="text-xs font-medium">Quick access</h2><p className="mt-0.5 text-[10px] text-muted-foreground">Jump into your workspace</p></div>
          <div className="grid grid-cols-2 gap-2 p-3">
            {quickLinks.map(({ label, href, icon: Icon, hint }) => <Link key={href} href={href} className="rounded-md border border-border/80 p-2.5 transition-colors hover:bg-accent"><Icon className="mb-3 h-4 w-4 text-muted-foreground" /><span className="block text-[11px] font-medium">{label}</span><span className="mt-1 block text-[9px] text-muted-foreground">{hint}</span></Link>)}
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3"><div><h2 className="text-xs font-medium">Upcoming</h2><p className="mt-0.5 text-[10px] text-muted-foreground">Your next calendar entries</p></div><Link href="/calendar" aria-label="Open calendar" className="text-muted-foreground hover:text-foreground"><CalendarDays className="h-4 w-4" /></Link></div>
          {data.events.filter((event) => event.date >= today).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).slice(0, 3).map((event) => <div key={event.id} className="flex items-center gap-3 border-b border-border/70 px-4 py-2.5 last:border-0"><Clock3 className="h-3.5 w-3.5 text-muted-foreground" /><span className="flex-1 truncate text-xs">{event.title}</span><span className="text-[10px] text-muted-foreground">{new Date(`${event.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {event.time}</span></div>)}
          {data.events.length === 0 && <p className="px-4 py-7 text-center text-xs text-muted-foreground">No upcoming events.</p>}
        </div>
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3"><div><h2 className="text-xs font-medium">Recent activity</h2><p className="mt-0.5 text-[10px] text-muted-foreground">Recently updated notes</p></div><Sparkles className="h-3.5 w-3.5 text-muted-foreground" /></div>
          {data.notes.slice(0, 3).map((note) => <Link key={note.id} href="/notes" className="flex items-center gap-3 border-b border-border/70 px-4 py-2.5 last:border-0 hover:bg-accent/40"><FileText className="h-3.5 w-3.5 text-muted-foreground" /><span className="flex-1 truncate text-xs">{note.title}</span><span className="text-[10px] text-muted-foreground">{note.updatedAt}</span></Link>)}
          {data.notes.length === 0 && <div className="flex flex-col items-center py-6"><p className="text-xs text-muted-foreground">Your activity will appear here.</p><Link href="/notes" className="mt-2 inline-flex items-center gap-1 text-[10px] hover:underline"><Plus className="h-3 w-3" />Create a note</Link></div>}
        </div>
      </section>

      <div className="mt-4 flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3 sm:flex-row sm:items-center">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted"><Sparkles className="h-3.5 w-3.5 text-muted-foreground" /></span>
        <p className="flex-1 text-[11px] text-muted-foreground"><span className="font-medium text-foreground">Private by default.</span> Workspace data is saved in this browser and ready for future MCP integrations.</p>
        <Button variant="outline" size="sm" className="h-7 text-[10px]" asChild><Link href="/database">Browse database</Link></Button>
      </div>
    </div>
  );
}
