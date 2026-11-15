'use client';

import { type FormEvent, useState } from 'react';

import { useI18n } from '@/components/i18n-provider';
import { ArchiveButton, ProjectSelect, RelationsPanel, TagInput, useEntityTags } from '@/components/knowledge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { todayKey } from '@/lib/dates';
import type { Meeting, MeetingStatus } from '@/lib/types';

const statuses: MeetingStatus[] = ['planned', 'done', 'cancelled'];

export function MeetingDialog({ meeting, onClose, defaultProjectId, defaultFolderId }: { meeting: Meeting | 'new' | null; onClose: () => void; defaultProjectId?: string; defaultFolderId?: string | null }) {
  const { t } = useI18n();
  const { create, update, setTags } = useWorkspace();
  const source = meeting && meeting !== 'new' ? meeting : null;
  const currentTags = useEntityTags('meeting', source?.id);
  const emptyForm = { title: '', date: todayKey(), time: '10:00', attendees: '', agenda: '', notes: '', status: 'planned' as MeetingStatus, project_id: (defaultProjectId ?? null) as string | null, tagList: [] as string[] };
  const [form, setForm] = useState(emptyForm);
  const [openFor, setOpenFor] = useState<Meeting | 'new' | null>(null);
  const [saving, setSaving] = useState(false);

  if (meeting !== openFor) {
    setOpenFor(meeting);
    if (meeting) {
      setForm(source ? {
        title: source.title,
        date: source.date,
        time: source.time ?? '',
        attendees: source.attendees ?? '',
        agenda: source.agenda ?? '',
        notes: source.notes ?? '',
        status: source.status,
        project_id: source.project_id,
        tagList: currentTags,
      } : emptyForm);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim() || !form.date) return;
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      date: form.date,
      time: form.time || null,
      attendees: form.attendees.trim() || null,
      agenda: form.agenda.trim() || null,
      notes: form.notes.trim() || null,
      status: form.status,
    };
    const result = source ? await update('meetings', source.id, { ...payload, project_id: form.project_id }) : await create('meetings', { ...payload, project_id: form.project_id, folder_id: defaultFolderId ?? null });
    if (result && (form.tagList.length || source)) await setTags('meeting', result.id, form.tagList);
    setSaving(false);
    if (result) onClose();
  }

  return (
    <Dialog open={meeting !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{source ? t('meetings.edit') : t('meetings.new')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <Field label={t('common.title')} htmlFor="meeting-title">
            <Input id="meeting-title" autoFocus value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('common.date')} htmlFor="meeting-date">
              <Input id="meeting-date" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
            </Field>
            <Field label={t('common.time')} htmlFor="meeting-time">
              <Input id="meeting-time" type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} />
            </Field>
            <Field label={t('common.status')}>
              <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as MeetingStatus })}>
                <SelectTrigger aria-label={t('common.status')}><SelectValue /></SelectTrigger>
                <SelectContent>{statuses.map((status) => <SelectItem key={status} value={status}>{t(`meetings.${status}`)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field label={t('meetings.attendees')} htmlFor="meeting-attendees" hint={t('meetings.attendeesHint')}>
            <Input id="meeting-attendees" value={form.attendees} onChange={(event) => setForm({ ...form, attendees: event.target.value })} />
          </Field>
          <Field label={t('meetings.agenda')} htmlFor="meeting-agenda">
            <Textarea id="meeting-agenda" rows={5} value={form.agenda} onChange={(event) => setForm({ ...form, agenda: event.target.value })} />
          </Field>
          <Field label={t('meetings.notes')} htmlFor="meeting-notes">
            <Textarea id="meeting-notes" rows={6} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('relations.project')}>
              <ProjectSelect value={form.project_id} onChange={(project_id) => setForm({ ...form, project_id })} />
            </Field>
            <Field label={t('relations.tags')}>
              <TagInput value={form.tagList} onChange={(tagList) => setForm({ ...form, tagList })} />
            </Field>
          </div>
          {source && <RelationsPanel type="meeting" id={source.id} compact className="border-t pt-5" />}
          <DialogFooter>
            {source && <div className="mr-auto"><ArchiveButton type="meeting" id={source.id} onArchived={onClose} label /></div>}
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving || !form.title.trim()}>{saving ? t('common.saving') : source ? t('common.save') : t('common.create')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
