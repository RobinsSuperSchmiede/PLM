'use client';

import { type FormEvent, useState } from 'react';

import { useI18n } from '@/components/i18n-provider';
import { ArchiveButton, ProjectSelect, RelationsPanel, TagInput, useEntityTags } from '@/components/knowledge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import type { CalendarEvent } from '@/lib/types';

export function EventDialog({ event, defaultDate, onClose, defaultProjectId, defaultFolderId }: { event: CalendarEvent | 'new' | null; defaultDate: string; onClose: () => void; defaultProjectId?: string; defaultFolderId?: string | null }) {
  const { t } = useI18n();
  const { create, update, setTags } = useWorkspace();
  const source = event && event !== 'new' ? event : null;
  const currentTags = useEntityTags('event', source?.id);
  const [form, setForm] = useState({ title: '', date: defaultDate, time: '09:00', location: '', description: '', project_id: null as string | null, tagList: [] as string[] });
  const [openFor, setOpenFor] = useState<CalendarEvent | 'new' | null>(null);
  const [saving, setSaving] = useState(false);

  if (event !== openFor) {
    setOpenFor(event);
    if (event) {
      setForm({
        title: source?.title ?? '',
        date: source?.date ?? defaultDate,
        time: source ? source.time ?? '' : '09:00',
        location: source?.location ?? '',
        description: source?.description ?? '',
        project_id: source?.project_id ?? defaultProjectId ?? null,
        tagList: currentTags,
      });
    }
  }

  async function submit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    if (!form.title.trim() || !form.date) return;
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      date: form.date,
      time: form.time || null,
      location: form.location.trim() || null,
      description: form.description.trim() || null,
    };
    const result = source ? await update('events', source.id, { ...payload, project_id: form.project_id }) : await create('events', { ...payload, project_id: form.project_id, folder_id: defaultFolderId ?? null });
    if (result && (form.tagList.length || source)) await setTags('event', result.id, form.tagList);
    setSaving(false);
    if (result) onClose();
  }

  return (
    <Dialog open={event !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{source ? t('calendar.edit') : t('calendar.new')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <Field label={t('common.title')} htmlFor="event-title">
            <Input id="event-title" autoFocus value={form.title} onChange={(changeEvent) => setForm({ ...form, title: changeEvent.target.value })} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('common.date')} htmlFor="event-date">
              <Input id="event-date" type="date" value={form.date} onChange={(changeEvent) => setForm({ ...form, date: changeEvent.target.value })} required />
            </Field>
            <Field label={t('common.time')} htmlFor="event-time">
              <Input id="event-time" type="time" value={form.time} onChange={(changeEvent) => setForm({ ...form, time: changeEvent.target.value })} />
            </Field>
          </div>
          <Field label={t('calendar.location')} htmlFor="event-location">
            <Input id="event-location" value={form.location} onChange={(changeEvent) => setForm({ ...form, location: changeEvent.target.value })} />
          </Field>
          <Field label={t('common.description')} htmlFor="event-description">
            <Textarea id="event-description" rows={5} value={form.description} onChange={(changeEvent) => setForm({ ...form, description: changeEvent.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('relations.project')}>
              <ProjectSelect value={form.project_id} onChange={(project_id) => setForm({ ...form, project_id })} />
            </Field>
            <Field label={t('relations.tags')}>
              <TagInput value={form.tagList} onChange={(tagList) => setForm({ ...form, tagList })} />
            </Field>
          </div>
          {source && <RelationsPanel type="event" id={source.id} compact className="border-t pt-5" />}
          <DialogFooter>
            {source && <div className="mr-auto"><ArchiveButton type="event" id={source.id} onArchived={onClose} label /></div>}
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving || !form.title.trim()}>{saving ? t('common.saving') : source ? t('common.save') : t('common.create')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
