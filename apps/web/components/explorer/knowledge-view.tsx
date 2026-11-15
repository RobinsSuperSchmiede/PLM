'use client';

import dynamic from 'next/dynamic';
import { type FormEvent, useMemo, useState } from 'react';
import { BookOpen, ExternalLink, Pencil, Plus } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { ANY, FilterBar } from '@/components/filter-bar';
import { ArchiveButton, EntityTags, ProjectSelect, RelationsPanel, TagInput, useEntityTags } from '@/components/knowledge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DeleteButton, EmptyState, Field, PageHeader, PageSkeleton, SearchInput } from '@/components/workspace-ui';
import { OpenFromQuery, useClearQueryId } from '@/components/open-from-query';
import { VirtualList } from '@/components/virtual-list';
import { useWorkspace } from '@/components/workspace-provider';
import { colorOf } from '@/lib/appearance';
import { formatDateTime } from '@/lib/dates';
import { markdownToPlainText } from '@/lib/markdown';
import type { KnowledgeArticle } from '@/lib/types';
import { cn } from '@/lib/utils';

// TipTap is large: load the editor only when a page actually shows it.
const MarkdownEditor = dynamic(() => import('@/components/markdown-editor').then((module) => module.MarkdownEditor), {
  ssr: false,
  loading: () => <div className="min-h-[240px]" aria-hidden="true" />,
});

const NONE = '__none__';

/** Editor for a document (knowledge article); opened from the explorer. */
export function ArticleDialog({ article, categories, onClose, defaultProjectId, defaultFolderId }: { article: KnowledgeArticle | 'new' | null; categories: string[]; onClose: () => void; defaultProjectId?: string; defaultFolderId?: string | null }) {
  const { t } = useI18n();
  const { create, update, setTags } = useWorkspace();
  const source = article && article !== 'new' ? article : null;
  const currentTags = useEntityTags('knowledge', source?.id);
  const [form, setForm] = useState({ title: '', category: '', source_url: '', content: '', project_id: null as string | null, tagList: [] as string[] });
  const [openFor, setOpenFor] = useState<KnowledgeArticle | 'new' | null>(null);
  const [saving, setSaving] = useState(false);

  if (article !== openFor) {
    setOpenFor(article);
    if (article) setForm({ title: source?.title ?? '', category: source?.category ?? '', source_url: source?.source_url ?? '', content: source?.content ?? '', project_id: source?.project_id ?? defaultProjectId ?? null, tagList: currentTags });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      category: form.category.trim() || null,
      source_url: form.source_url.trim() || null,
      content: form.content.trim() || null,
    };
    const result = source ? await update('knowledge', source.id, { ...payload, project_id: form.project_id }) : await create('knowledge', { ...payload, project_id: form.project_id, folder_id: defaultFolderId ?? null });
    if (result && (form.tagList.length || source)) await setTags('knowledge', result.id, form.tagList);
    setSaving(false);
    if (result) onClose();
  }

  return (
    <Dialog open={article !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent variant="wide">
        <DialogHeader><DialogTitle>{source ? t('knowledge.edit') : t('knowledge.new')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <Field label={t('common.title')} htmlFor="article-title">
            <Input id="article-title" autoFocus value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('knowledge.category')} htmlFor="article-category">
              <Input id="article-category" list="knowledge-categories" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
              <datalist id="knowledge-categories">{categories.map((name) => <option key={name} value={name} />)}</datalist>
            </Field>
            <Field label={t('knowledge.source')} htmlFor="article-source">
              <Input id="article-source" type="url" value={form.source_url} onChange={(event) => setForm({ ...form, source_url: event.target.value })} placeholder="https://" />
            </Field>
          </div>
          <Field label={t('knowledge.content')} className="flex flex-1 flex-col">
            <MarkdownEditor
              key={openFor === 'new' ? 'new' : openFor?.id}
              value={form.content}
              onChange={(content) => setForm((current) => ({ ...current, content }))}
              placeholder={t('notes.startWriting')}
              label={t('knowledge.content')}
              className="min-h-[360px] flex-1 rounded-lg bg-field shadow-sm px-4 py-3 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-foreground/20 focus-within:border-foreground/30 focus-within:ring-[3px] focus-within:ring-ring"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('relations.project')}>
              <ProjectSelect value={form.project_id} onChange={(project_id) => setForm({ ...form, project_id })} />
            </Field>
            <Field label={t('relations.tags')}>
              <TagInput value={form.tagList} onChange={(tagList) => setForm({ ...form, tagList })} />
            </Field>
          </div>
          {source && <RelationsPanel type="knowledge" id={source.id} compact className="border-t pt-5" />}
          <DialogFooter>
            {source && <div className="mr-auto"><ArchiveButton type="knowledge" id={source.id} onArchived={onClose} label /></div>}
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving || !form.title.trim()}>{saving ? t('common.saving') : source ? t('common.save') : t('common.create')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
