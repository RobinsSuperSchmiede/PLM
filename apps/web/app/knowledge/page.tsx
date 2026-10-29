'use client';

import { type FormEvent, useMemo, useState } from 'react';
import { BookOpen, ExternalLink, Pencil, Plus } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { ANY, FilterBar, useIncremental } from '@/components/filter-bar';
import { ArchiveButton, EntityTags, ProjectSelect, RelationsPanel, TagInput, useEntityTags } from '@/components/knowledge';
import { MarkdownEditor } from '@/components/markdown-editor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DeleteButton, EmptyState, Field, PageHeader, PageSkeleton, SearchInput } from '@/components/workspace-ui';
import { OpenFromQuery, useClearQueryId } from '@/components/open-from-query';
import { useWorkspace } from '@/components/workspace-provider';
import { colorOf } from '@/lib/appearance';
import { formatDateTime } from '@/lib/dates';
import { markdownToPlainText } from '@/lib/markdown';
import type { KnowledgeArticle } from '@/lib/types';
import { cn } from '@/lib/utils';

const NONE = '__none__';

export default function KnowledgePage() {
  const { t, language } = useI18n();
  const { data, loading, remove, tags, tagAssignments } = useWorkspace();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ANY);
  const [project, setProject] = useState(ANY);
  const [tag, setTag] = useState(ANY);
  const [sort, setSort] = useState('updated');
  const [editing, setEditing] = useState<KnowledgeArticle | 'new' | null>(null);
  const clearQuery = useClearQueryId();

  const categories = useMemo(() => Array.from(new Set(data.knowledge.map((article) => article.category).filter(Boolean) as string[])).sort(), [data.knowledge]);
  const articles = useMemo(() => {
    const term = query.trim().toLowerCase();
    const tagged = tag !== ANY ? new Set(tagAssignments.filter((entry) => entry.tag_id === tag && entry.entity_type === 'knowledge').map((entry) => entry.entity_id)) : null;
    return data.knowledge
      .filter((article) => category === ANY || (category === NONE ? !article.category : article.category === category))
      .filter((article) => project === ANY || (project === NONE ? !article.project_id : article.project_id === project))
      .filter((article) => !tagged || tagged.has(article.id))
      .filter((article) => !term || `${article.title} ${article.content ?? ''} ${article.category ?? ''}`.toLowerCase().includes(term))
      .sort((a, b) => (sort === 'title' ? a.title.localeCompare(b.title) : sort === 'created' ? b.created_at.localeCompare(a.created_at) : b.updated_at.localeCompare(a.updated_at)));
  }, [category, data.knowledge, project, query, sort, tag, tagAssignments]);
  const { visible, marker } = useIncremental(articles, 45);

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader title={t('knowledge.title')} description={t('filters.showing', { shown: articles.length, total: data.knowledge.length })} action={<Button onClick={() => setEditing('new')}><Plus />{t('knowledge.new')}</Button>} />

      <FilterBar className="mb-5"
        filters={[
          { key: 'category', label: t('filters.category'), value: category, onChange: setCategory,
            options: [...categories.map((name) => ({ value: name, label: name, color: colorOf(name) })), { value: NONE, label: t('filters.noCategory') }] },
          { key: 'project', label: t('filters.project'), value: project, onChange: setProject,
            options: [...data.projects.map((item) => ({ value: item.id, label: item.name, color: colorOf(item.name) })), { value: NONE, label: t('filters.noProject') }] },
          { key: 'tag', label: t('filters.tag'), value: tag, onChange: setTag,
            options: tags.filter((entry) => entry.count).map((entry) => ({ value: entry.id, label: `#${entry.name}`, color: colorOf(entry.name) })) },
        ]}
        sort={{ value: sort, onChange: setSort, options: [
          { value: 'updated', label: t('filters.sortUpdated') }, { value: 'created', label: t('filters.sortCreated') }, { value: 'title', label: t('filters.sortTitle') },
        ] }}
      >
        <SearchInput value={query} onChange={setQuery} placeholder={t('knowledge.search')} className="sm:w-64 [&_input]:h-8 [&_input]:rounded-full" />
      </FilterBar>

      {articles.length ? (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {visible.map((article) => {
            const color = colorOf(article.category ?? article.title);
            return (
              <Card key={article.id} className="lazy-card card-hover relative overflow-hidden">
                <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} aria-hidden="true" />
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
                  <button type="button" className="min-w-0 space-y-1.5 text-left" onClick={() => setEditing(article)}>
                    <CardTitle className="text-base hover:underline">{article.title}</CardTitle>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded-md px-1.5 py-0.5 font-medium" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>{article.category || t('knowledge.uncategorized')}</span>
                      <span>{formatDateTime(article.updated_at, language)}</span>
                    </span>
                  </button>
                  <div className="-mr-2 -mt-1 flex shrink-0">
                    {article.source_url && (
                      <Button variant="ghost" size="icon-sm" className="text-muted-foreground" asChild>
                        <a href={article.source_url} target="_blank" rel="noreferrer noopener" aria-label={t('knowledge.source')}><ExternalLink /></a>
                      </Button>
                    )}
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`${t('common.edit')}: ${article.title}`} onClick={() => setEditing(article)}><Pencil /></Button>
                    <DeleteButton name={article.title} onConfirm={() => void remove('knowledge', article.id)} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {article.content && <p className={cn('line-clamp-4 whitespace-pre-line text-sm leading-6 text-muted-foreground')}>{markdownToPlainText(article.content)}</p>}
                  <EntityTags type="knowledge" id={article.id} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={BookOpen} title={t('knowledge.empty')} description={t('knowledge.emptyDesc')} action={<Button variant="outline" onClick={() => setEditing('new')}><Plus />{t('knowledge.new')}</Button>} />
      )}
      {marker}

      <OpenFromQuery items={data.knowledge} onOpen={setEditing} />
      <ArticleDialog article={editing} categories={categories} onClose={() => { setEditing(null); clearQuery(); }} />
    </div>
  );
}

function ArticleDialog({ article, categories, onClose, defaultProjectId }: { article: KnowledgeArticle | 'new' | null; categories: string[]; onClose: () => void; defaultProjectId?: string }) {
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
    const result = source ? await update('knowledge', source.id, { ...payload, project_id: form.project_id }) : await create('knowledge', { ...payload, project_id: form.project_id });
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
              className="min-h-[360px] flex-1 rounded-lg border border-input bg-background/60 px-4 py-3 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-foreground/20 focus-within:border-foreground/30 focus-within:ring-4 focus-within:ring-ring/10"
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
