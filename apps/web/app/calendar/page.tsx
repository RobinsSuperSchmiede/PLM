'use client';

import { useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, Pencil, Plus, Users } from 'lucide-react';

import { EventDialog } from '@/components/event-dialog';
import { ANY, FilterBar } from '@/components/filter-bar';
import { useI18n } from '@/components/i18n-provider';
import { ArchiveButton, ProjectSelect, RelationsPanel, TagInput, useEntityTags } from '@/components/knowledge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { DeleteButton, EmptyState, Field, PageHeader, PageSkeleton } from '@/components/workspace-ui';
import { OpenFromQuery, useClearQueryId } from '@/components/open-from-query';
import { useWorkspace } from '@/components/workspace-provider';
import { addDays, formatDate, formatMonth, fromDateKey, toDateKey, todayKey, weekdayNames } from '@/lib/dates';
import type { CalendarEvent } from '@/lib/types';
import { colorOf } from '@/lib/appearance';
import { cn } from '@/lib/utils';

type Entry = { id: string; title: string; date: string; time: string | null; location: string | null; kind: 'event' | 'meeting'; projectId: string | null; source?: CalendarEvent };

const NONE = '__none__';

export default function CalendarPage() {
  return <Suspense fallback={<PageSkeleton />}><CalendarView /></Suspense>;
}

function CalendarView() {
  const { t, language } = useI18n();
  const { data, loading, remove } = useWorkspace();
  const searchParams = useSearchParams();
  const [view, setView] = useState<'month' | 'week'>('month');
  const [anchor, setAnchor] = useState(() => fromDateKey(todayKey()));
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [editing, setEditing] = useState<CalendarEvent | 'new' | null>(null);
  const [kind, setKind] = useState(ANY);
  const [project, setProject] = useState(ANY);
  const clearQuery = useClearQueryId();

  useEffect(() => {
    const date = searchParams.get('date');
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setSelectedDate(date);
      setAnchor(fromDateKey(date));
    }
  }, [searchParams]);

  const days = useMemo(() => {
    const first = view === 'week' ? new Date(anchor) : new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    return Array.from({ length: view === 'week' ? 7 : 42 }, (_, index) => addDays(first, index));
  }, [anchor, view]);

  const entriesByDate = useMemo(() => {
    const entries: Entry[] = [
      ...data.events.map((event) => ({ id: event.id, title: event.title, date: event.date, time: event.time, location: event.location, kind: 'event' as const, projectId: event.project_id, source: event })),
      ...data.meetings.filter((meeting) => meeting.status !== 'cancelled').map((meeting) => ({ id: meeting.id, title: meeting.title, date: meeting.date, time: meeting.time, location: null, kind: 'meeting' as const, projectId: meeting.project_id })),
    ];
    const map = new Map<string, Entry[]>();
    entries
      .filter((entry) => kind === ANY || entry.kind === kind)
      .filter((entry) => project === ANY || (project === NONE ? !entry.projectId : entry.projectId === project))
      .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
      .forEach((entry) => map.set(entry.date, [...(map.get(entry.date) ?? []), entry]));
    return map;
  }, [data.events, data.meetings, kind, project]);
  const projectNames = useMemo(() => new Map(data.projects.map((item) => [item.id, item.name])), [data.projects]);
  // Entries are colored by project; entries without a project use the type color.
  const entryColor = (entry: Entry) => (entry.projectId && projectNames.get(entry.projectId) ? colorOf(projectNames.get(entry.projectId)!) : entry.kind === 'meeting' ? 'hsl(var(--brand))' : 'hsl(var(--info))');

  if (loading) return <PageSkeleton />;

  const today = todayKey();
  const selectedEntries = entriesByDate.get(selectedDate) ?? [];

  function changePeriod(amount: number) {
    const next = new Date(anchor);
    if (view === 'month') next.setMonth(anchor.getMonth() + amount, 1);
    else next.setDate(anchor.getDate() + amount * 7);
    setAnchor(next);
    setSelectedDate(toDateKey(next));
  }

  return (
    <div>
      <PageHeader title={t('calendar.title')} description={t('calendar.description')} action={<Button onClick={() => setEditing('new')}><Plus />{t('calendar.new')}</Button>} />

      <FilterBar className="mb-4"
        filters={[
          { key: 'kind', label: t('filters.kind'), value: kind, onChange: setKind, options: [
            { value: 'event', label: t('filters.events'), color: 'hsl(var(--info))' }, { value: 'meeting', label: t('filters.meetings'), color: 'hsl(var(--brand))' },
          ] },
          { key: 'project', label: t('filters.project'), value: project, onChange: setProject,
            options: [...data.projects.map((item) => ({ value: item.id, label: item.name, color: colorOf(item.name) })), { value: NONE, label: t('filters.noProject') }] },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon-sm" aria-label={t('calendar.previous')} onClick={() => changePeriod(-1)}><ChevronLeft /></Button>
              <Button variant="outline" size="sm" onClick={() => { setAnchor(fromDateKey(today)); setSelectedDate(today); }}>{t('calendar.today')}</Button>
              <Button variant="outline" size="icon-sm" aria-label={t('calendar.next')} onClick={() => changePeriod(1)}><ChevronRight /></Button>
              <h2 className="ml-2 text-base font-semibold capitalize">{formatMonth(anchor, language)}</h2>
            </div>
            <Tabs value={view} onValueChange={(value) => setView(value as typeof view)}>
              <TabsList className="h-8">
                <TabsTrigger value="month" className="text-xs">{t('calendar.month')}</TabsTrigger>
                <TabsTrigger value="week" className="text-xs">{t('calendar.week')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {weekdayNames(language).map((day) => <div key={day} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">{day}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = toDateKey(day);
              const entries = entriesByDate.get(key) ?? [];
              const outside = view === 'month' && day.getMonth() !== anchor.getMonth();
              const selected = key === selectedDate;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDate(key)}
                  onDoubleClick={() => { setSelectedDate(key); setEditing('new'); }}
                  aria-pressed={selected}
                  aria-label={formatDate(key, language, { weekday: 'long', day: 'numeric', month: 'long' })}
                  className={cn(
                    'flex flex-col gap-1 border-b border-r p-1.5 text-left transition-colors hover:bg-accent/50 [&:nth-child(7n)]:border-r-0',
                    view === 'week' ? 'min-h-[240px] xl:min-h-[320px]' : 'min-h-[76px] sm:min-h-[110px] xl:min-h-[130px]',
                    selected && 'bg-accent/60',
                    outside && 'text-muted-foreground/50',
                  )}
                >
                  <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full text-xs', key === today && 'bg-brand font-semibold text-white')}>
                    {day.getDate()}
                  </span>
                  {entries.slice(0, view === 'week' ? 6 : 3).map((entry) => {
                    const color = entryColor(entry);
                    return (
                      <span key={entry.id} className="block truncate rounded-md border-l-2 px-1.5 py-0.5 text-[10px] text-foreground sm:text-[11px]"
                        style={{ borderLeftColor: color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
                        {entry.time && <span className="mr-1 tabular-nums opacity-70">{entry.time}</span>}{entry.title}
                      </span>
                    );
                  })}
                  {entries.length > (view === 'week' ? 6 : 3) && <span className="px-1 text-[10px] text-muted-foreground">{t('calendar.more', { count: entries.length - (view === 'week' ? 6 : 3) })}</span>}
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{formatDate(selectedDate, language, { weekday: 'long', day: 'numeric', month: 'long' })}</CardTitle>
            <Button variant="ghost" size="icon-sm" aria-label={t('calendar.new')} onClick={() => setEditing('new')}><Plus /></Button>
          </CardHeader>
          <CardContent className="stagger space-y-2">
            {selectedEntries.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 rounded-lg border border-l-[3px] p-3" style={{ borderLeftColor: entryColor(entry) }}>
                {entry.kind === 'meeting' ? <Users className="mt-0.5 h-4 w-4" style={{ color: entryColor(entry) }} /> : <Clock3 className="mt-0.5 h-4 w-4" style={{ color: entryColor(entry) }} />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{entry.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {entry.time && <span className="tabular-nums">{entry.time}</span>}
                    {entry.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{entry.location}</span>}
                    {entry.kind === 'meeting' && <Badge variant="brand" className="px-1.5 py-0 text-[10px]">{t('calendar.meeting')}</Badge>}
                    {entry.projectId && projectNames.get(entry.projectId) && <span>{projectNames.get(entry.projectId)}</span>}
                  </p>
                </div>
                {entry.source && (
                  <div className="flex">
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`${t('common.edit')}: ${entry.title}`} onClick={() => setEditing(entry.source!)}><Pencil /></Button>
                    <DeleteButton name={entry.title} onConfirm={() => void remove('events', entry.id)} />
                  </div>
                )}
              </div>
            ))}
            {selectedEntries.length === 0 && <EmptyState icon={CalendarDays} title={t('calendar.nothing')} description={t('calendar.nothingDesc')} className="min-h-40 border-0" />}
          </CardContent>
        </Card>
      </div>

      <OpenFromQuery items={data.events} onOpen={setEditing} />
      <EventDialog event={editing} defaultDate={selectedDate} onClose={() => { setEditing(null); clearQuery(); }} />
    </div>
  );
}
