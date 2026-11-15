'use client';

import { type FormEvent, useState } from 'react';

import { useI18n } from '@/components/i18n-provider';
import { AttachmentsPanel } from '@/components/files';
import { ArchiveButton, RelationsPanel, TagInput, useEntityTags } from '@/components/knowledge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import type { TranslationKey } from '@/lib/i18n';
import type { Task, TaskPriority, TaskStatus } from '@/lib/types';

export const statusKeys: Record<TaskStatus, TranslationKey> = { todo: 'tasks.todo', 'in-progress': 'tasks.inProgress', done: 'tasks.done' };
export const priorityKeys: Record<TaskPriority, TranslationKey> = { low: 'tasks.low', medium: 'tasks.medium', high: 'tasks.high' };

const NO_PROJECT = 'none';

export function TaskDialog({ task, onClose, defaultProjectId, defaultFolderId }: { task: Task | 'new' | null; onClose: () => void; defaultProjectId?: string; defaultFolderId?: string | null }) {
  const { t } = useI18n();
  const { data, create, update, setTags } = useWorkspace();
  const isNew = task === 'new';
  const source = task && task !== 'new' ? task : null;
  const currentTags = useEntityTags('task', source?.id);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium' as TaskPriority, status: 'todo' as TaskStatus, due_date: '', project_id: NO_PROJECT, tags: [] as string[] });
  const [openFor, setOpenFor] = useState<Task | 'new' | null>(null);
  const [saving, setSaving] = useState(false);

  if (task !== openFor) {
    setOpenFor(task);
    if (task) {
      setForm({
        title: source?.title ?? '',
        description: source?.description ?? '',
        priority: source?.priority ?? 'medium',
        status: source?.status ?? 'todo',
        due_date: source?.due_date ?? '',
        project_id: source?.project_id ?? defaultProjectId ?? NO_PROJECT,
        tags: currentTags,
      });
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      priority: form.priority,
      status: form.status,
      due_date: form.due_date || null,
      project_id: form.project_id === NO_PROJECT ? null : form.project_id,
    };
    const result = isNew ? await create('tasks', { ...payload, folder_id: defaultFolderId ?? null }) : source ? await update('tasks', source.id, payload) : null;
    if (result && (form.tags.length || source)) await setTags('task', result.id, form.tags);
    setSaving(false);
    if (result) onClose();
  }

  return (
    <Dialog open={task !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isNew ? t('tasks.new') : t('tasks.edit')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <Field label={t('common.title')} htmlFor="task-title">
            <Input id="task-title" autoFocus value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={t('tasks.placeholder')} required />
          </Field>
          <Field label={t('common.description')} htmlFor="task-description">
            <Textarea id="task-description" rows={5} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('common.priority')}>
              <Select value={form.priority} onValueChange={(value) => setForm({ ...form, priority: value as TaskPriority })}>
                <SelectTrigger aria-label={t('common.priority')}><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(priorityKeys) as TaskPriority[]).map((value) => <SelectItem key={value} value={value}>{t(priorityKeys[value])}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label={t('common.status')}>
              <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as TaskStatus })}>
                <SelectTrigger aria-label={t('common.status')}><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(statusKeys) as TaskStatus[]).map((value) => <SelectItem key={value} value={value}>{t(statusKeys[value])}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label={t('tasks.dueDate')} htmlFor="task-due">
              <Input id="task-due" type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} />
            </Field>
            <Field label={t('tasks.project')}>
              <Select value={form.project_id} onValueChange={(value) => setForm({ ...form, project_id: value })}>
                <SelectTrigger aria-label={t('tasks.project')}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROJECT}>{t('tasks.noProject')}</SelectItem>
                  {data.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label={t('relations.tags')}>
            <TagInput value={form.tags} onChange={(tags) => setForm({ ...form, tags })} />
          </Field>
          {source && <AttachmentsPanel type="task" id={source.id} projectId={source.project_id} className="border-t pt-5" />}
          {source && <RelationsPanel type="task" id={source.id} compact className="border-t pt-5" />}
          <DialogFooter>
            {source && <div className="mr-auto"><ArchiveButton type="task" id={source.id} onArchived={onClose} label /></div>}
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving || !form.title.trim()}>{saving ? t('common.saving') : isNew ? t('common.create') : t('common.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
