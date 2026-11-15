'use client';

import { type FormEvent, useState } from 'react';

import { useI18n } from '@/components/i18n-provider';
import { TagInput, useEntityTags } from '@/components/knowledge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import type { Project, ProjectStatus } from '@/lib/types';

export const projectStatusVariant = { active: 'success', on_hold: 'warning', completed: 'secondary' } as const;
const statuses: ProjectStatus[] = ['active', 'on_hold', 'completed'];

export function ProjectDialog({ project, onClose, onCreated, defaultFolderId }: { project: Project | 'new' | null; onClose: () => void; onCreated?: (project: Project) => void; defaultFolderId?: string | null }) {
  const { t } = useI18n();
  const { create, update, setTags } = useWorkspace();
  const source = project && project !== 'new' ? project : null;
  const currentTags = useEntityTags('project', source?.id);
  const [form, setForm] = useState({ name: '', description: '', status: 'active' as ProjectStatus, tags: [] as string[] });
  const [openFor, setOpenFor] = useState<Project | 'new' | null>(null);
  const [saving, setSaving] = useState(false);

  if (project !== openFor) {
    setOpenFor(project);
    if (project) setForm({ name: source?.name ?? '', description: source?.description ?? '', status: source?.status ?? 'active', tags: currentTags });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = { name: form.name.trim(), description: form.description.trim() || null, status: form.status };
    const result = source ? await update('projects', source.id, payload) : await create('projects', { ...payload, folder_id: defaultFolderId ?? null });
    if (result && (form.tags.length || source)) await setTags('project', result.id, form.tags);
    setSaving(false);
    if (result) {
      onClose();
      if (!source) onCreated?.(result);
    }
  }

  return (
    <Dialog open={project !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{source ? t('projects.edit') : t('projects.new')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <Field label={t('projects.name')} htmlFor="project-name">
            <Input id="project-name" autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </Field>
          <Field label={t('common.description')} htmlFor="project-description">
            <Textarea id="project-description" rows={6} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </Field>
          <Field label={t('common.status')}>
            <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as ProjectStatus })}>
              <SelectTrigger aria-label={t('common.status')}><SelectValue /></SelectTrigger>
              <SelectContent>{statuses.map((status) => <SelectItem key={status} value={status}>{t(`projects.${status}`)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label={t('relations.tags')}>
            <TagInput value={form.tags} onChange={(tags) => setForm({ ...form, tags })} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving || !form.name.trim()}>{saving ? t('common.saving') : source ? t('common.save') : t('common.create')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
