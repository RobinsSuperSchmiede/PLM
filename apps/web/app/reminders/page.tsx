'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';
import { BellRing, Pencil, Plus, Repeat, Send } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DeleteButton, EmptyState, Field, PageHeader, PageSkeleton } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { api } from '@/lib/api';
import { addDays, relativeDay, toDateTimeKey } from '@/lib/dates';
import type { Reminder, RepeatRule, TelegramSettings } from '@/lib/types';
import { cn } from '@/lib/utils';

const repeatRules: RepeatRule[] = ['none', 'daily', 'weekdays', 'weekly', 'monthly'];

function presets() {
  const now = new Date();
  const at = (days: number, hours: number) => {
    const date = addDays(now, days);
    date.setHours(hours, 0, 0, 0);
    return date;
  };
  const tonight = at(0, 18);
  return [
    { key: 'reminders.inOneHour', value: toDateTimeKey(new Date(now.getTime() + 3_600_000)) },
    { key: 'reminders.tonight', value: toDateTimeKey(tonight > now ? tonight : at(1, 18)) },
    { key: 'reminders.tomorrowMorning', value: toDateTimeKey(at(1, 9)) },
    { key: 'reminders.nextWeek', value: toDateTimeKey(at(7, 9)) },
  ] as const;
}

export default function RemindersPage() {
  const { t } = useI18n();
  const { data, loading } = useWorkspace();
  const [editing, setEditing] = useState<Reminder | 'new' | null>(null);
  const [telegram, setTelegram] = useState<TelegramSettings | null>(null);

  useEffect(() => {
    api.get<TelegramSettings>('/telegram').then(setTelegram).catch(() => setTelegram(null));
  }, []);

  if (loading) return <PageSkeleton />;

  const upcoming = data.reminders.filter((reminder) => !reminder.done).sort((a, b) => a.remind_at.localeCompare(b.remind_at));
  const done = data.reminders.filter((reminder) => reminder.done).sort((a, b) => b.remind_at.localeCompare(a.remind_at));
  const ready = telegram?.enabled && telegram.linked;

  return (
    <div>
      <PageHeader
        title={t('reminders.title')}
        description={t('reminders.description')}
        action={<Button onClick={() => setEditing('new')}><Plus />{t('reminders.new')}</Button>}
      />

      {telegram && (ready ? (
        <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-success" /></span>
          {t('reminders.telegramReady', { name: telegram.chat_name ?? 'Telegram', bot: telegram.bot_username ?? 'bot' })}
          <span className="hidden sm:inline">· {t('reminders.timezoneHint', { timezone: telegram.timezone })}</span>
        </p>
      ) : (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center">
          <Send className="h-5 w-5 shrink-0 text-warning" />
          <div className="flex-1 text-sm">
            <p className="font-medium">{t('reminders.telegramMissing')}</p>
            <p className="text-muted-foreground">{t('reminders.telegramMissingDesc')}</p>
          </div>
          <Button size="sm" asChild><Link href="/settings?tab=telegram">{t('reminders.connect')}</Link></Button>
        </div>
      ))}

      <QuickAdd />

      <Tabs defaultValue="upcoming" className="mt-6">
        <TabsList>
          <TabsTrigger value="upcoming">{t('reminders.upcoming')}<span className="ml-1 text-xs tabular-nums text-muted-foreground">{upcoming.length}</span></TabsTrigger>
          <TabsTrigger value="done">{t('reminders.done')}<span className="ml-1 text-xs tabular-nums text-muted-foreground">{done.length}</span></TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming">
          {upcoming.length ? <ReminderList reminders={upcoming} onEdit={setEditing} /> : (
            <EmptyState icon={BellRing} title={t('reminders.empty')} description={t('reminders.emptyDesc')} />
          )}
        </TabsContent>
        <TabsContent value="done">
          {done.length ? <ReminderList reminders={done} onEdit={setEditing} /> : <EmptyState icon={BellRing} title={t('reminders.emptyDone')} />}
        </TabsContent>
      </Tabs>

      <ReminderDialog reminder={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function QuickAdd() {
  const { t } = useI18n();
  const { create } = useWorkspace();
  const [text, setText] = useState('');
  const [when, setWhen] = useState(() => presets()[2].value);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim() || !when) return;
    setSaving(true);
    const created = await create('reminders', { text: text.trim(), remind_at: when, repeat: 'none' });
    setSaving(false);
    if (created) setText('');
  }

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
        <Input value={text} onChange={(event) => setText(event.target.value)} placeholder={t('reminders.textPlaceholder')} aria-label={t('reminders.text')} className="flex-1" />
        <Input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} aria-label={t('reminders.when')} className="sm:w-56" required />
        <Button type="submit" disabled={saving || !text.trim()}><Plus />{t('common.add')}</Button>
      </form>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {presets().map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => setWhen(preset.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-all duration-200 hover:border-foreground/20 hover:bg-accent active:scale-95',
              when === preset.value ? 'border-foreground/30 bg-accent font-medium text-foreground' : 'text-muted-foreground',
            )}
          >
            {t(preset.key)}
          </button>
        ))}
      </div>
    </Card>
  );
}

function ReminderList({ reminders, onEdit }: { reminders: Reminder[]; onEdit: (reminder: Reminder) => void }) {
  const { t, language } = useI18n();
  const { update, remove } = useWorkspace();
  const now = toDateTimeKey(new Date());
  const dayLabels = { today: t('common.today'), tomorrow: t('common.tomorrow'), yesterday: t('common.yesterday') };

  return (
    <Card className="divide-y overflow-hidden">
      {reminders.map((reminder) => {
        const overdue = !reminder.done && reminder.remind_at.slice(0, 16) < now;
        return (
          <div key={reminder.id} className="row-enter group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
            <Checkbox
              checked={reminder.done}
              onCheckedChange={(checked) => void update('reminders', reminder.id, { done: checked === true })}
              aria-label={`${reminder.done ? t('reminders.reopen') : t('reminders.markDone')}: ${reminder.text}`}
            />
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onEdit(reminder)}>
              <p className={cn('truncate text-sm font-medium transition-colors duration-300', reminder.done && 'text-muted-foreground line-through')}>{reminder.text}</p>
              <p className={cn('mt-0.5 text-xs text-muted-foreground', overdue && 'font-medium text-destructive')}>
                {relativeDay(reminder.remind_at.slice(0, 10), language, dayLabels)} · {reminder.remind_at.slice(11, 16)}
                {overdue && ` · ${t('reminders.overdue')}`}
              </p>
            </button>
            {reminder.repeat !== 'none' && (
              <Badge variant="secondary" className="hidden gap-1 sm:inline-flex"><Repeat className="h-3 w-3" />{t(`reminders.${reminder.repeat}`)}</Badge>
            )}
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`${t('common.edit')}: ${reminder.text}`} onClick={() => onEdit(reminder)}><Pencil /></Button>
            <DeleteButton name={reminder.text} onConfirm={() => void remove('reminders', reminder.id)} />
          </div>
        );
      })}
    </Card>
  );
}

function ReminderDialog({ reminder, onClose }: { reminder: Reminder | 'new' | null; onClose: () => void }) {
  const { t } = useI18n();
  const { create, update } = useWorkspace();
  const source = reminder && reminder !== 'new' ? reminder : null;
  const [form, setForm] = useState({ text: '', remind_at: '', repeat: 'none' as RepeatRule });
  const [openFor, setOpenFor] = useState<Reminder | 'new' | null>(null);
  const [saving, setSaving] = useState(false);

  if (reminder !== openFor) {
    setOpenFor(reminder);
    if (reminder) {
      setForm(source
        ? { text: source.text, remind_at: source.remind_at.slice(0, 16), repeat: source.repeat }
        : { text: '', remind_at: presets()[2].value, repeat: 'none' });
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.text.trim() || !form.remind_at) return;
    setSaving(true);
    const payload = { text: form.text.trim(), remind_at: form.remind_at, repeat: form.repeat };
    // Rescheduling a sent reminder makes it pending again.
    const result = source ? await update('reminders', source.id, { ...payload, done: false }) : await create('reminders', payload);
    setSaving(false);
    if (result) onClose();
  }

  return (
    <Dialog open={reminder !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{source ? t('reminders.edit') : t('reminders.new')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <Field label={t('reminders.text')} htmlFor="reminder-text">
            <Input id="reminder-text" autoFocus value={form.text} onChange={(event) => setForm({ ...form, text: event.target.value })} placeholder={t('reminders.textPlaceholder')} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('reminders.when')} htmlFor="reminder-when">
              <Input id="reminder-when" type="datetime-local" value={form.remind_at} onChange={(event) => setForm({ ...form, remind_at: event.target.value })} required />
            </Field>
            <Field label={t('reminders.repeat')}>
              <Select value={form.repeat} onValueChange={(value) => setForm({ ...form, repeat: value as RepeatRule })}>
                <SelectTrigger aria-label={t('reminders.repeat')}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {repeatRules.map((rule) => <SelectItem key={rule} value={rule}>{t(`reminders.${rule}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {presets().map((preset) => (
              <Button key={preset.key} type="button" variant="outline" size="sm" className="h-7 rounded-full text-xs" onClick={() => setForm({ ...form, remind_at: preset.value })}>
                {t(preset.key)}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving}>{source ? t('common.save') : t('common.create')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
