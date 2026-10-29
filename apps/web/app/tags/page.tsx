'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Hash, Pencil } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { DeleteButton, EmptyState, PageHeader, PageSkeleton, SearchInput } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { api } from '@/lib/api';
import { entityIcons, entityLabelKeys } from '@/lib/entities';
import type { EntityType, Tag } from '@/lib/types';

export default function TagsPage() {
  const { t } = useI18n();
  const { loading, tags, tagAssignments, reloadOrganization } = useWorkspace();
  const [query, setQuery] = useState('');

  const visible = useMemo(() => tags
    .filter((tag) => tag.count > 0 || !query)
    .filter((tag) => tag.name.includes(query.trim().toLowerCase().replace(/^#/, '')))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)), [query, tags]);
  const max = Math.max(1, ...tags.map((tag) => tag.count));

  if (loading) return <PageSkeleton />;

  async function rename(tag: Tag) {
    const name = window.prompt(t('tags.renamePrompt'), tag.name)?.trim();
    if (!name || name === tag.name) return;
    try {
      await api.patch(`/tags/${tag.id}`, { name });
      await reloadOrganization();
    } catch (failure) {
      window.alert(failure instanceof Error ? failure.message : String(failure));
    }
  }

  async function remove(tag: Tag) {
    await api.delete(`/tags/${tag.id}`);
    await reloadOrganization();
  }

  return (
    <div>
      <PageHeader title={t('tags.title')} description={t('tags.description', { count: tags.length })}
        action={tags.length > 0 ? <SearchInput value={query} onChange={setQuery} placeholder={t('tags.search')} className="sm:w-72" /> : undefined} />

      {tags.length === 0 ? (
        <EmptyState icon={Hash} title={t('tags.empty')} description={t('tags.emptyDesc')} />
      ) : (
        <>
          <div className="mb-8 flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-xl border bg-card p-6">
            {visible.map((tag) => (
              <Link key={tag.id} href={`/tags/${encodeURIComponent(tag.name)}`}
                className="text-muted-foreground transition-colors duration-200 hover:text-foreground"
                style={{ fontSize: `${0.85 + (tag.count / max) * 0.9}rem`, fontWeight: tag.count / max > 0.5 ? 600 : 500 }}>
                #{tag.name}
              </Link>
            ))}
          </div>
          <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visible.map((tag) => {
              const types = tagAssignments.filter((entry) => entry.tag_id === tag.id).reduce<Partial<Record<EntityType, number>>>((acc, entry) => {
                acc[entry.entity_type] = (acc[entry.entity_type] ?? 0) + 1;
                return acc;
              }, {});
              return (
                <div key={tag.id} className="card-hover group flex items-center gap-3 rounded-xl border bg-card p-4">
                  <Link href={`/tags/${encodeURIComponent(tag.name)}`} className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-medium"><Hash className="h-4 w-4 text-muted-foreground" />{tag.name}</p>
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {(Object.entries(types) as [EntityType, number][]).map(([type, count]) => {
                        const Icon = entityIcons[type];
                        return <span key={type} className="inline-flex items-center gap-1" title={t(entityLabelKeys[type])}><Icon className="h-3 w-3" />{count}</span>;
                      })}
                      {!tag.count && t('tags.items', { count: 0 })}
                    </p>
                  </Link>
                  <Button variant="ghost" size="icon-sm" className="text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100" onClick={() => void rename(tag)} aria-label={`${t('tags.rename')}: ${tag.name}`}><Pencil /></Button>
                  <DeleteButton name={`#${tag.name}`} onConfirm={() => void remove(tag)} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
