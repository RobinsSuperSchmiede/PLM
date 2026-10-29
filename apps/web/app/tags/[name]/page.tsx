'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowLeft, Hash } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { EntityTags } from '@/components/knowledge';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader, PageSkeleton } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { formatDateTime } from '@/lib/dates';
import { contentTypes, entityIcons, entityLabelKeys, resolveEntity, type ResolvedEntity } from '@/lib/entities';
import type { EntityType } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function TagPage() {
  const { t, language } = useI18n();
  const params = useParams<{ name: string }>();
  const name = decodeURIComponent(params.name ?? '').toLowerCase();
  const { data, loading, tags, tagAssignments } = useWorkspace();
  const [type, setType] = useState<EntityType | 'all'>('all');
  const tag = tags.find((entry) => entry.name === name);

  const items = useMemo(() => {
    if (!tag) return [];
    return tagAssignments
      .filter((entry) => entry.tag_id === tag.id)
      .map((entry) => resolveEntity(data, entry.entity_type, entry.entity_id))
      .filter((entry): entry is ResolvedEntity => entry !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [data, tag, tagAssignments]);

  if (loading) return <PageSkeleton />;

  const counts = contentTypes.map((entry) => ({ type: entry, count: items.filter((item) => item.type === entry).length })).filter((entry) => entry.count);
  const visible = type === 'all' ? items : items.filter((item) => item.type === type);

  return (
    <div>
      <PageHeader
        title={`#${name}`}
        description={tag ? t('tags.items', { count: items.length }) : t('tags.notFound')}
        action={<Button variant="outline" asChild><Link href="/tags"><ArrowLeft />{t('tags.title')}</Link></Button>}
      />

      {counts.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-1.5" role="tablist">
          {[{ type: 'all' as const, count: items.length }, ...counts].map((entry) => (
            <button key={entry.type} type="button" role="tab" aria-selected={type === entry.type} onClick={() => setType(entry.type)}
              className={cn('rounded-full border px-3 py-1 text-xs transition-all duration-200 active:scale-95',
                type === entry.type ? 'border-foreground/30 bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent')}>
              {entry.type === 'all' ? t('tags.allTypes') : t(entityLabelKeys[entry.type])} <span className="tabular-nums opacity-70">{entry.count}</span>
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState icon={Hash} title={tag ? t('tags.items', { count: 0 }) : t('tags.notFound')} />
      ) : (
        <div className="stagger grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {visible.map((item) => {
            const Icon = entityIcons[item.type];
            return (
              <Link key={`${item.type}:${item.id}`} href={item.href} className="card-hover flex flex-col rounded-xl border bg-card p-4">
                <span className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{t(entityLabelKeys[item.type])}<span className="ml-auto">{formatDateTime(item.updatedAt, language)}</span></span>
                <span className="mt-2 truncate font-medium">{item.title || t('common.untitled')}</span>
                {item.preview && <span className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.preview}</span>}
                <EntityTags type={item.type} id={item.id} className="mt-3" plain />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
