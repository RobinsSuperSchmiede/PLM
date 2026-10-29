'use client';

import { type FormEvent, useState } from 'react';
import { Lightbulb, Pencil, Plus } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { ArchiveButton, ProjectSelect, RelationsPanel, TagInput, useEntityTags } from '@/components/knowledge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { DeleteButton, EmptyState, Field, PageHeader, PageSkeleton } from '@/components/workspace-ui';
import { OpenFromQuery, useClearQueryId } from '@/components/open-from-query';
import { useWorkspace } from '@/components/workspace-provider';
import type { TranslationKey } from '@/lib/i18n';
import type { Idea, IdeaStatus } from '@/lib/types';

const statuses: IdeaStatus[] = ['new', 'exploring', 'planned', 'archived'];
const statusKeys: Record<IdeaStatus, TranslationKey> = { new: 'ideas.new_status', exploring: 'ideas.exploring', planned: 'ideas.planned', archived: 'ideas.archived' };
const statusVariant = { new: 'default', exploring: 'warning', planned: 'success', archived: 'secondary' } as const;

export default function IdeasPage() {
  const { t } = useI18n();
  const { data, loading, update, remove } = useWorkspace();
  const [filter, setFilter] = useState<'all' | IdeaStatus>('all');
  const [editing, setEditing] = useState<Idea | 'new' | null>(null);
  const clearQuery = useClearQueryId();

  if (loading) return <PageSkeleton />;

  const ideas = data.ideas.filter((idea) => (filter === 'all' ? idea.status !== 'archived' : idea.status === filter));

  return (
    <div>
      <PageHeader title={t('ideas.title')} description={t('ideas.description')} action={<Button onClick={() => setEditing('new')}><Plus />{t('ideas.new')}</Button>} />
      <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">{t('common.all')}</TabsTrigger>
          {statuses.map((status) => <TabsTrigger key={status} value={status}>{t(statusKeys[status])}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      {ideas.length ? (
        <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {ideas.map((idea) => (
            <Card key={idea.id} className="card-hover flex flex-col">
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
                <CardTitle className="text-base leading-snug">{idea.title}</CardTitle>
                <div className="-mr-2 -mt-1 flex shrink-0">
                  <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`${t('common.edit')}: ${idea.title}`} onClick={() => setEditing(idea)}><Pencil /></Button>
                  <DeleteButton name={idea.title} onConfirm={() => void remove('ideas', idea.id)} />
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                {idea.description && <CardDescription className="line-clamp-4 whitespace-pre-line">{idea.description}</CardDescription>}
                {idea.tags && <div className="flex flex-wrap gap-1">{idea.tags.split(',').map((tag) => tag.trim()).filter(Boolean).map((tag) => <Badge key={tag} variant="outline">#{tag}</Badge>)}</div>}
              </CardContent>
              <CardFooter>
                <Select value={idea.status} onValueChange={(value) => void update('ideas', idea.id, { status: value as IdeaStatus })}>
                  <SelectTrigger className="h-8 w-auto gap-2 border-0 bg-transparent px-0 shadow-none focus:ring-0" aria-label={t('common.status')}>
                    <Badge variant={statusVariant[idea.status]}>{t(statusKeys[idea.status])}</Badge>
                  </SelectTrigger>
                  <SelectContent>{statuses.map((status) => <SelectItem key={status} value={status}>{t(statusKeys[status])}</SelectItem>)}</SelectContent>
                </Select>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={Lightbulb} title={t('ideas.empty')} description={t('ideas.emptyDesc')} action={<Button variant="outline" onClick={() => setEditing('new')}><Plus />{t('ideas.new')}</Button>} />
      )}

      <OpenFromQuery items={data.ideas} onOpen={setEditing} />
      <IdeaDialog idea={editing} onClose={() => { setEditing(null); clearQuery(); }} />
    </div>
  );
}

function IdeaDialog({ idea, onClose }: { idea: Idea | 'new' | null; onClose: () => void }) {
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
    const result = source ? await update('ideas', source.id, { ...payload, project_id: form.project_id }) : await create('ideas', { ...payload, project_id: form.project_id });
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
