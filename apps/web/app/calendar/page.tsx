'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader, PageSkeleton } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import type { WorkspaceEvent } from '@/lib/workspace-data';

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const prettyDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

export default function CalendarPage() {
  const { data, updateData, loading } = useWorkspace();
  const [view, setView] = useState<'month' | 'week'>('month');
  const [anchor, setAnchor] = useState(() => dayStart(new Date()));
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('09:00');

  const days = useMemo(() => {
    if (view === 'week') {
      const first = dayStart(anchor);
      first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
      return Array.from({ length: 7 }, (_, index) => {
        const day = new Date(first);
        day.setDate(first.getDate() + index);
        return day;
      });
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(first);
      day.setDate(first.getDate() + index);
      return day;
    });
  }, [anchor, view]);

  const selectedEvents = data.events.filter((event) => event.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time));

  function changePeriod(amount: number) {
    setAnchor((current) => {
      const next = new Date(current);
      if (view === 'month') next.setMonth(current.getMonth() + amount, 1);
      else next.setDate(current.getDate() + amount * 7);
      setSelectedDate(dateKey(next));
      return next;
    });
  }

  function addEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const newEvent: WorkspaceEvent = { id: `event-${Date.now()}`, title: trimmed, date: selectedDate, time };
    updateData((current) => ({ ...current, events: [...current.events, newEvent] }));
    setTitle('');
    setAdding(false);
  }

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader title="Calendar" description="A clear view of what is coming up." action={<Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setAdding((value) => !value)}><Plus className="h-3.5 w-3.5" />New event</Button>} />
      {adding && (
        <form onSubmit={addEvent} className="mb-4 flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row">
          <label htmlFor="event-title" className="sr-only">Event title</label>
          <input id="event-title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Event title…" className="h-8 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground" />
          <label htmlFor="event-time" className="sr-only">Event time</label>
          <input id="event-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          <Button type="submit" size="sm" className="h-8 text-xs">Add event</Button>
        </form>
      )}

      <section className="overflow-hidden rounded-lg border border-border bg-card" aria-label={`${view} calendar`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Previous period" onClick={() => changePeriod(-1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={() => { setAnchor(dayStart(new Date())); setSelectedDate(dateKey(new Date())); }}>Today</Button>
            <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Next period" onClick={() => changePeriod(1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
            <h2 className="ml-1 text-sm font-medium">{prettyDate(anchor)}</h2>
          </div>
          <div className="flex rounded-md border border-border p-0.5" aria-label="Calendar view">
            {(['month', 'week'] as const).map((item) => <Button key={item} variant={view === item ? 'secondary' : 'ghost'} size="sm" className="h-6 px-2.5 text-[10px] capitalize" onClick={() => setView(item)}>{item}</Button>)}
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-border">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div key={day} className="px-1 py-2 text-center text-[9px] font-medium uppercase tracking-wide text-muted-foreground sm:px-2 sm:text-[10px]">{day}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = dateKey(day);
            const matchingEvents = data.events.filter((event) => event.date === key);
            const outsideMonth = view === 'month' && day.getMonth() !== anchor.getMonth();
            return (
              <button key={key} onClick={() => setSelectedDate(key)} aria-pressed={selectedDate === key} className={`min-h-[74px] border-b border-r border-border/70 p-1 text-left transition-colors hover:bg-accent sm:min-h-[104px] sm:p-2 ${selectedDate === key ? 'bg-accent/70' : ''} ${outsideMonth ? 'opacity-35' : ''}`}>
                <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] ${key === dateKey(new Date()) ? 'bg-foreground font-semibold text-background' : 'text-muted-foreground'}`}>{day.getDate()}</span>
                <span className="mt-1 block space-y-0.5">
                  {matchingEvents.slice(0, 2).map((item) => <span key={item.id} className="block truncate rounded-sm bg-muted px-1 py-0.5 text-[8px] text-foreground sm:text-[9px]">{item.time} {item.title}</span>)}
                  {matchingEvents.length > 2 && <span className="block px-1 text-[8px] text-muted-foreground">+{matchingEvents.length - 2} more</span>}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-5">
        <div className="mb-2 flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 text-muted-foreground" /><h2 className="text-xs font-medium">{new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h2></div>
        {selectedEvents.length ? (
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {selectedEvents.map((event) => <div key={event.id} className="flex items-center gap-3 px-3 py-2.5"><Clock3 className="h-3.5 w-3.5 text-muted-foreground" /><span className="w-10 text-[11px] tabular-nums text-muted-foreground">{event.time}</span><span className="flex-1 text-xs">{event.title}</span><Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-muted-foreground" onClick={() => updateData((current) => ({ ...current, events: current.events.filter((item) => item.id !== event.id) }))}>Remove</Button></div>)}
          </div>
        ) : <EmptyState title="Nothing scheduled" description="Add an event for this day. Calendar data is stored locally and ready to connect to an MCP source." />}
      </section>
    </div>
  );
}
