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
import type { TranslationKey } from '@/lib/i18n';
import type { Idea, IdeaStatus } from '@/lib/types';

export const ideaStatuses: IdeaStatus[] = ['new', 'exploring', 'planned', 'archived'];
export const ideaStatusKeys: Record<IdeaStatus, TranslationKey> = { new: 'ideas.new_status', exploring: 'ideas.exploring', planned: 'ideas.planned', archived: 'ideas.archived' };
const statuses = ideaStatuses;
const statusKeys = ideaStatusKeys;

export function IdeaDialog({ idea, onClose, defaultFolderId }: { idea: Idea | 'new' | null; onClose: () => void; defaultFolderId?: string | null }) {
  const { t } = useI18n();
  const { create, update, setTags } = useWorkspace();
  const source = idea && idea !== 'new' ? idea : null;
  const currentTags = useEntityTags('idea', source?.id);
  const [form, setForm] = useState({ title: '', description: '', tags: '', status: 'new' as IdeaStatus, project_id: null as string | null, tagList: [] as string[] });
  const [openFor, setOpenFor] = useState<Idea | 'new' | null>(null);
  const [saving, setSaving] = useState(false);

  if (idea !== openFor) {
    setOpenFor(idea);
    if (idea) setForm({ title: source?.title ?? '', description: source?.description ?? '', tags: source?.tags ?? '', status: source?.status ?? 'new', project_id: source?.project_id ?? null, tagList: currentTags.length ? currentTags : (source?.tags ?? '').split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean) });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    const payload = { title: form.title.trim(), description: form.description.trim() || null, tags: form.tagList.join(', ') || null, status: form.status };
    const result = source ? await update('ideas', source.id, { ...payload, project_id: form.project_id }) : await create('ideas', { ...payload, project_id: form.project_id, folder_id: defaultFolderId ?? null });
    if (result && (form.tagList.length || source)) await setTags('idea', result.id, form.tagList);
    setSaving(false);
    if (result) onClose();
  }

  return (
    <Dialog open={idea !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{source ? t('ideas.edit') : t('ideas.new')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <Field label={t('common.title')} htmlFor="idea-title">
            <Input id="idea-title" autoFocus value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
          </Field>
          <Field label={t('common.description')} htmlFor="idea-description">
            <Textarea id="idea-description" rows={6} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </Field>
          <div className="grid gap-4">
            <Field label={t('common.status')}>
              <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as IdeaStatus })}>
                <SelectTrigger aria-label={t('common.status')}><SelectValue /></SelectTrigger>
                <SelectContent>{statuses.map((status) => <SelectItem key={status} value={status}>{t(statusKeys[status])}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('relations.project')}>
              <ProjectSelect value={form.project_id} onChange={(project_id) => setForm({ ...form, project_id })} />
            </Field>
            <Field label={t('relations.tags')}>
              <TagInput value={form.tagList} onChange={(tagList) => setForm({ ...form, tagList })} />
            </Field>
          </div>
          {source && <RelationsPanel type="idea" id={source.id} compact className="border-t pt-5" />}
          <DialogFooter>
            {source && <div className="mr-auto"><ArchiveButton type="idea" id={source.id} onArchived={onClose} label /></div>}
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving || !form.title.trim()}>{saving ? t('common.saving') : source ? t('common.save') : t('common.create')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
