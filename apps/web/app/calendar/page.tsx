'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, ChevronLeft, ChevronRight, MapPin, Plus, X } from 'lucide-react';

import { localeOf } from '@/lib/languages';
import { EventDialog } from '@/components/event-dialog';
import { ANY, FilterBar } from '@/components/filter-bar';
import { useI18n } from '@/components/i18n-provider';
import { MeetingDialog } from '@/components/meeting-dialog';
import { OpenFromQuery, useClearQueryId } from '@/components/open-from-query';
import { TaskDialog } from '@/components/task-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Segmented } from '@/components/ui/segmented';
import { PageSkeleton } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { colorOf } from '@/lib/appearance';
import { addDays, formatDate, fromDateKey, toDateKey, todayKey, weekdayNames } from '@/lib/dates';
import type { TranslationKey } from '@/lib/i18n';
import type { CalendarEvent, Meeting, Task } from '@/lib/types';
import { cn } from '@/lib/utils';

type Kind = 'event' | 'meeting' | 'task' | 'reminder';
type Entry = { key: string; id: string; kind: Kind; title: string; date: string; time: string | null; location: string | null; projectId: string | null };
type Rect = { left: number; top: number; width: number; height: number };

const NONE = '__none__';
const kindColors: Record<Kind, string> = { event: 'hsl(var(--info))', meeting: 'hsl(var(--brand))', task: 'hsl(var(--success))', reminder: 'hsl(var(--warning))' };
const kindLabels: Record<Kind, TranslationKey> = { event: 'entities.event', meeting: 'entities.meeting', task: 'entities.task', reminder: 'nav.reminders' };
const fg2 = 'text-[hsl(var(--fg-2)/var(--fg-2-a))]';
const HOUR = 46;

export default function CalendarPage() {
  return <Suspense fallback={<PageSkeleton />}><CalendarView /></Suspense>;
}

function CalendarView() {
  const { t, language } = useI18n();
  const { data, loading, update } = useWorkspace();
  const searchParams = useSearchParams();
  const clearQuery = useClearQueryId();
  const [view, setView] = useState<'month' | 'week'>('month');
  const [anchor, setAnchor] = useState(() => fromDateKey(todayKey()));
  // The day whose details are open, and the tile it grows out of.
  const [detail, setDetail] = useState<{ date: string; from: Rect | null } | null>(null);
  const [event, setEvent] = useState<CalendarEvent | 'new' | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [newDate, setNewDate] = useState(todayKey());
  const [kind, setKind] = useState(ANY);
  const [project, setProject] = useState(ANY);

  // Links from the search or the dashboard (?date=…) open that day directly.
  useEffect(() => {
    const date = searchParams.get('date');
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setAnchor(fromDateKey(date));
      setDetail({ date, from: null });
    }
  }, [searchParams]);

  const days = useMemo(() => {
    const first = view === 'week' ? new Date(anchor) : new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const weeks = view === 'week' ? 1 : Math.ceil((Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1) / 7);
    return Array.from({ length: weeks * 7 }, (_, index) => addDays(first, index));
  }, [anchor, view]);

  const byDate = useMemo(() => {
    const entries: Entry[] = [
      ...data.events.map((item) => ({ key: `event:${item.id}`, id: item.id, kind: 'event' as const, title: item.title, date: item.date, time: item.time, location: item.location, projectId: item.project_id })),
      ...data.meetings.filter((item) => item.status !== 'cancelled').map((item) => ({ key: `meeting:${item.id}`, id: item.id, kind: 'meeting' as const, title: item.title, date: item.date, time: item.time, location: null, projectId: item.project_id })),
      ...data.tasks.filter((item) => item.due_date && item.status !== 'done').map((item) => ({ key: `task:${item.id}`, id: item.id, kind: 'task' as const, title: item.title, date: item.due_date!, time: null, location: null, projectId: item.project_id })),
      ...data.reminders.filter((item) => !item.done).map((item) => ({ key: `reminder:${item.id}`, id: item.id, kind: 'reminder' as const, title: item.text, date: item.remind_at.slice(0, 10), time: item.remind_at.slice(11, 16), location: null, projectId: null })),
    ];
    const map = new Map<string, Entry[]>();
    entries
      .filter((entry) => kind === ANY || entry.kind === kind)
      .filter((entry) => project === ANY || (project === NONE ? !entry.projectId : entry.projectId === project))
      // Timed entries in order, then everything without a time.
      .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99') || a.title.localeCompare(b.title))
      .forEach((entry) => map.set(entry.date, [...(map.get(entry.date) ?? []), entry]));
    return map;
  }, [data.events, data.meetings, data.reminders, data.tasks, kind, project]);

  const projectNames = useMemo(() => new Map(data.projects.map((item) => [item.id, item.name])), [data.projects]);
  // Entries are colored by project; entries without a project use the color of their kind.
  const colorFor = (entry: Entry) => (entry.projectId && projectNames.get(entry.projectId) ? colorOf(projectNames.get(entry.projectId)!) : kindColors[entry.kind]);

  if (loading) return <PageSkeleton />;

  const today = todayKey();
  const month = anchor.getMonth();
  const shown = days.filter((day) => view === 'week' || day.getMonth() === month).reduce((sum, day) => sum + (byDate.get(toDateKey(day))?.length ?? 0), 0);
  const perTile = view === 'week' ? 9 : days.length > 35 ? 2 : 3;

  function step(amount: number) {
    const next = new Date(anchor);
    if (view === 'month') next.setMonth(anchor.getMonth() + amount, 1);
    else next.setDate(anchor.getDate() + amount * 7);
    setAnchor(next);
  }

  function openEntry(entry: Entry) {
    if (entry.kind === 'event') setEvent(data.events.find((item) => item.id === entry.id) ?? null);
    if (entry.kind === 'meeting') setMeeting(data.meetings.find((item) => item.id === entry.id) ?? null);
    if (entry.kind === 'task') setTask(data.tasks.find((item) => item.id === entry.id) ?? null);
  }

  function showDay(date: string, from: Rect | null) {
    const next = fromDateKey(date);
    if (next.getMonth() !== anchor.getMonth() || next.getFullYear() !== anchor.getFullYear()) setAnchor(next);
    setDetail({ date, from });
  }

  return (
    <div className="flex flex-col gap-3.5 lg:h-[calc(100vh-3.5rem-4rem)]">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <h1 className="text-[26px] font-semibold capitalize leading-none tracking-[-0.02em]">
          {anchor.toLocaleDateString(localeOf(language), { month: 'long' })} <span className="font-medium text-muted-foreground">{anchor.getFullYear()}</span>
        </h1>
        <div className="ds-glass ml-1 flex gap-0.5 rounded-full p-[3px]" role="toolbar" aria-label={t('calendar.title')}>
          <Button variant="ghost" size="icon-sm" aria-label={t('calendar.previous')} onClick={() => step(-1)}><ChevronLeft /></Button>
          <Button variant="ghost" size="icon-sm" aria-label={t('calendar.next')} onClick={() => step(1)}><ChevronRight /></Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAnchor(fromDateKey(today))}>{t('calendar.today')}</Button>
        <span className="ds-label">{t('calendar.count', { count: shown })}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <FilterBar
            filters={[
              { key: 'kind', label: t('filters.kind'), value: kind, onChange: setKind, options: (Object.keys(kindLabels) as Kind[]).map((value) => ({ value, label: t(kindLabels[value]), color: kindColors[value] })) },
              { key: 'project', label: t('filters.project'), value: project, onChange: setProject,
                options: [...data.projects.map((item) => ({ value: item.id, label: item.name, color: colorOf(item.name) })), { value: NONE, label: t('filters.noProject') }] },
            ]}
          />
          <Segmented value={view} onChange={setView} label={t('calendar.title')} options={[{ value: 'month', label: t('calendar.month') }, { value: 'week', label: t('calendar.week') }]} />
          <Button onClick={() => { setNewDate(today); setEvent('new'); }}><Plus />{t('calendar.new')}</Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {weekdayNames(language).map((day) => <span key={day} className="ds-label px-3">{day}</span>)}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-7 gap-1.5" style={{ gridTemplateRows: `repeat(${days.length / 7}, minmax(0, 1fr))` }}>
        {days.map((day) => {
          const key = toDateKey(day);
          const entries = byDate.get(key) ?? [];
          const outside = view === 'month' && day.getMonth() !== month;
          const weekend = day.getDay() === 0 || day.getDay() === 6;
          return (
            <button key={key} type="button"
              onClick={(click) => { const rect = click.currentTarget.getBoundingClientRect(); showDay(key, { left: rect.left, top: rect.top, width: rect.width, height: rect.height }); }}
              aria-label={`${formatDate(key, language, { weekday: 'long', day: 'numeric', month: 'long' })}, ${t('calendar.count', { count: entries.length })}`}
              className={cn('flex min-h-[64px] min-w-0 cursor-zoom-in flex-col gap-1 overflow-hidden rounded-2xl px-1.5 pb-2 pt-2.5 text-left transition-[background-color,transform,box-shadow,opacity] duration-300 ease-ds hover:-translate-y-px focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring sm:min-h-[92px] sm:pl-3 sm:pr-2.5',
                outside ? 'text-muted-foreground hover:bg-accent' : 'bg-card shadow-sm hover:shadow-md', detail?.date === key && 'opacity-0')}>
              <span className={cn('-mt-[3px] inline-flex h-6 min-w-6 items-center justify-center self-start rounded-full px-1.5 text-[13px] font-medium sm:-ml-1.5',
                key === today ? 'bg-primary font-semibold text-primary-foreground' : weekend && fg2)}>
                {day.getDate()}
              </span>
              {entries.slice(0, perTile).map((entry) => (
                <span key={entry.key} className={cn('flex min-w-0 items-center gap-1.5 text-[11px] leading-[1.35]', fg2)}>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorFor(entry) }} />
                  {entry.time && <span className="hidden shrink-0 font-mono text-[10px] text-muted-foreground sm:inline">{entry.time}</span>}
                  <span className="hidden truncate sm:inline">{entry.title}</span>
                </span>
              ))}
              {entries.length > perTile && <span className="hidden pl-3 text-[10px] text-muted-foreground sm:inline">{t('calendar.more', { count: entries.length - perTile })}</span>}
            </button>
          );
        })}
      </div>

      {detail && (
        <DayDetail key={detail.from ? 'tile' : 'direct'} date={detail.date} from={detail.from} entries={byDate.get(detail.date) ?? []} colorFor={colorFor}
          projectName={(id) => (id ? projectNames.get(id) : undefined)}
          onStep={(amount) => showDay(toDateKey(addDays(fromDateKey(detail.date), amount)), null)}
          onClose={() => { setDetail(null); clearQuery(); }}
          onOpen={openEntry}
          onNew={() => { setNewDate(detail.date); setEvent('new'); }}
          onDone={(id) => void update('tasks', id, { status: 'done' })} />
      )}

      <OpenFromQuery items={data.events} onOpen={setEvent} />
      <EventDialog event={event} defaultDate={newDate} onClose={() => { setEvent(null); clearQuery(); }} />
      <MeetingDialog meeting={meeting} onClose={() => setMeeting(null)} />
      <TaskDialog task={task} onClose={() => setTask(null)} />
    </div>
  );
}

const hours = (time: string) => Number(time.slice(0, 2)) + Number(time.slice(3, 5)) / 60;
const clock = (value: number) => `${String(Math.floor(value)).padStart(2, '0')}:${String(Math.round((value % 1) * 60)).padStart(2, '0')}`;

/** One day in detail: it grows out of its tile into a panel with a timeline and everything without a time. */
function DayDetail({ date, from, entries, colorFor, projectName, onStep, onClose, onOpen, onNew, onDone }: {
  date: string;
  from: Rect | null;
  entries: Entry[];
  colorFor: (entry: Entry) => string;
  projectName: (id: string | null) => string | undefined;
  onStep: (amount: number) => void;
  onClose: () => void;
  onOpen: (entry: Entry) => void;
  onNew: () => void;
  onDone: (taskId: string) => void;
}) {
  const { t, language } = useI18n();
  const [open, setOpen] = useState(!from);
  const closing = useRef<number | undefined>(undefined);
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });
  // The key handler is registered once; it reaches the current callbacks through this ref.
  const actions = useRef({ close: () => {}, onStep });

  useEffect(() => {
    const measure = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    measure();
    // Two frames, so the panel is painted at its tile before it starts to grow.
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
    const onKey = (event: KeyboardEvent) => {
      // Dialogs opened from here handle their own keys.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      if (event.key === 'Escape') actions.current.close();
      if (event.key === 'ArrowLeft') actions.current.onStep(-1);
      if (event.key === 'ArrowRight') actions.current.onStep(1);
    };
    window.addEventListener('resize', measure);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(closing.current);
      window.removeEventListener('resize', measure);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  function close() {
    if (!from) return onClose();
    setOpen(false);
    closing.current = window.setTimeout(onClose, 380);
  }
  actions.current = { close, onStep };

  const width = Math.min(820, viewport.width - 24);
  const height = Math.min(700, viewport.height - 96);
  const target: Rect = { left: (viewport.width - width) / 2, top: Math.max(64, (viewport.height - height) / 2 + 12), width, height };
  const box = open || !from ? target : from;

  const timed = entries.filter((entry) => entry.time);
  const untimed = entries.filter((entry) => !entry.time);
  const start = Math.min(7, ...timed.map((entry) => Math.floor(hours(entry.time!))));
  const end = Math.max(21, ...timed.map((entry) => Math.ceil(hours(entry.time!) + 1)));
  // Entries that overlap share the width: each takes the first lane that is free again.
  const lanes: number[] = [];
  const blocks = timed.map((entry) => {
    const at = hours(entry.time!);
    const duration = entry.kind === 'reminder' ? 0.5 : 1;
    let lane = lanes.findIndex((free) => free <= at);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = at + duration;
    return { entry, at, duration, lane };
  });
  const laneCount = Math.max(1, lanes.length);
  const day = fromDateKey(date);
  const now = new Date();
  const nowAt = now.getHours() + now.getMinutes() / 60;
  const summary = timed.length ? `${t('calendar.count', { count: timed.length })} · ${timed[0].time}–${clock(Math.min(24, hours(timed[timed.length - 1].time!) + 1))}` : t('calendar.nothing');

  return (
    <>
      <div className={cn('fixed inset-0 z-40 bg-[rgba(40,40,46,.28)] backdrop-blur-[20px] transition-opacity duration-300 ease-ds', open ? 'opacity-100' : 'opacity-0')} onClick={close} aria-hidden="true" />
      <div role="dialog" aria-label={formatDate(date, language, { weekday: 'long', day: 'numeric', month: 'long' })}
        className="ds-menu fixed z-[41] overflow-hidden transition-[left,top,width,height,border-radius] duration-[380ms] ease-ds"
        style={{ left: box.left, top: box.top, width: box.width, height: box.height, borderRadius: open ? 24 : 16 }}>
        <div className={cn('absolute left-0 top-0 flex flex-col gap-4 px-5 py-5 transition-opacity duration-300 ease-ds sm:px-6', open ? 'opacity-100' : 'opacity-0')} style={{ width: target.width, height: target.height }}>
          <div className="flex items-start gap-4">
            <div className="flex items-baseline gap-3.5">
              <span className="text-[54px] font-semibold leading-[.9] tracking-[-0.04em]">{day.getDate()}</span>
              <div className="flex flex-col gap-[3px]">
                <span className="text-base font-semibold capitalize">{formatDate(date, language, { weekday: 'long' })}</span>
                <span className={cn('text-xs capitalize', fg2)}>{formatDate(date, language, { month: 'long', year: 'numeric' })}</span>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="ds-glass flex gap-0.5 rounded-full p-[3px]" role="toolbar" aria-label={t('calendar.day')}>
                <Button variant="ghost" size="icon-sm" aria-label={t('calendar.previous')} onClick={() => onStep(-1)}><ChevronLeft /></Button>
                <Button variant="ghost" size="icon-sm" aria-label={t('calendar.next')} onClick={() => onStep(1)}><ChevronRight /></Button>
              </div>
              <Button variant="outline" size="sm" onClick={onNew}><Plus />{t('entities.event')}</Button>
              <Button size="icon-sm" aria-label={t('notes.close')} onClick={close}><X /></Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="ds-glass inline-flex h-[22px] items-center rounded-full px-2.5 text-xs">{summary}</span>
            {untimed.length > 0 && <span className="ds-glass inline-flex h-[22px] items-center rounded-full px-2.5 text-xs">{t('calendar.untimed', { count: untimed.length })}</span>}
          </div>

          <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2">
            {untimed.length > 0 && (
              <ul className="mb-4 space-y-1">
                {untimed.map((entry) => (
                  <li key={entry.key} className="flex h-9 items-center gap-2.5 rounded-full pl-3 pr-3.5 text-[13px]" style={{ background: `color-mix(in srgb, ${colorFor(entry)} 16%, transparent)` }}>
                    {entry.kind === 'task'
                      ? <Checkbox checked={false} onCheckedChange={() => onDone(entry.id)} aria-label={`${t('tasks.done')}: ${entry.title}`} />
                      : <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorFor(entry) }} />}
                    <button type="button" onClick={() => onOpen(entry)} className="min-w-0 flex-1 truncate text-left font-medium hover:underline">{entry.title}</button>
                    <span className={cn('shrink-0 text-xs', fg2)}>{projectName(entry.projectId) ?? t(kindLabels[entry.kind])}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="relative" style={{ height: (end - start) * HOUR + 8 }}>
              {Array.from({ length: end - start + 1 }, (_, index) => (
                <div key={index} className="absolute inset-x-0" style={{ top: index * HOUR }}>
                  <span className="absolute inset-x-0 h-px bg-border" />
                  <span className="absolute left-0 -mt-[7px] w-11 bg-transparent font-mono text-[10px] text-muted-foreground">{clock(start + index)}</span>
                </div>
              ))}
              {blocks.map(({ entry, at, duration, lane }) => {
                const body = (
                  <>
                    <b className="truncate text-xs font-semibold">{entry.title}</b>
                    <span className={cn('flex items-center gap-1.5 truncate text-[11px]', fg2)}>
                      {entry.kind === 'reminder' && <BellRing className="h-3 w-3 shrink-0" />}
                      {entry.time} – {clock(at + duration)}
                      {entry.location && <><MapPin className="h-3 w-3 shrink-0" />{entry.location}</>}
                      {entry.kind !== 'event' && <span>· {projectName(entry.projectId) ?? t(kindLabels[entry.kind])}</span>}
                    </span>
                  </>
                );
                const className = 'absolute flex flex-col justify-start gap-px overflow-hidden rounded-xl px-3 py-1.5 text-left transition-transform duration-300 ease-ds hover:translate-x-0.5 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring';
                const style = {
                  top: (at - start) * HOUR + 1, height: duration * HOUR - 3,
                  left: `calc(56px + (100% - 56px) * ${lane / laneCount})`, width: `calc((100% - 56px) / ${laneCount} - 4px)`,
                  background: `color-mix(in srgb, ${colorFor(entry)} 20%, transparent)`,
                };
                return entry.kind === 'reminder'
                  ? <Link key={entry.key} href="/reminders" className={className} style={style}>{body}</Link>
                  : <button key={entry.key} type="button" onClick={() => onOpen(entry)} className={className} style={style}>{body}</button>;
              })}
              {date === todayKey() && nowAt >= start && nowAt <= end && (
                <span className="absolute left-12 right-0 h-0.5 rounded-[1px] bg-[#FF3B30] before:absolute before:-left-1 before:-top-[3px] before:h-2 before:w-2 before:rounded-full before:bg-[#FF3B30]" style={{ top: (nowAt - start) * HOUR }} aria-hidden="true" />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
