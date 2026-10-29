'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { useI18n } from '@/components/i18n-provider';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, PageHeader, PageSkeleton, SearchInput } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import { contentTypes, entityIcons, entityLabelKeys } from '@/lib/entities';
import { markdownToPlainText } from '@/lib/markdown';
import type { ArchivedItem, EntityType } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function ArchivePage() {
  const { t, language } = useI18n();
  const { data, restore, reloadOrganization } = useWorkspace();
  const [items, setItems] = useState<ArchivedItem[] | null>(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<EntityType | 'all'>('all');
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(() => api.get<ArchivedItem[]>('/archive').then(setItems).catch(() => setItems([])), []);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (items ?? [])
      .filter((item) => type === 'all' || item.type === type)
      .filter((item) => !term || `${item.title} ${item.preview ?? ''}`.toLowerCase().includes(term));
  }, [items, query, type]);

  if (items === null) return <PageSkeleton />;

  const current = visible.find((item) => item.id === selected) ?? visible[0];
  const typesPresent = [...contentTypes, 'folder' as const].filter((entry) => items.some((item) => item.type === entry));
  const projectName = (id: string | null) => data.projects.find((project) => project.id === id)?.name;

  async function restoreItem(item: ArchivedItem) {
    if (await restore(item.type, item.id)) {
      toast.success(t('archive.restored', { name: item.title || t('common.untitled') }));
      void load();
    }
  }

  async function deleteItem(item: ArchivedItem) {
    await api.delete(`/archive/${item.type}/${item.id}`);
    toast.success(t('common.deleted'));
    void reloadOrganization();
    void load();
  }

  return (
    <div>
      <PageHeader title={t('archive.title')} description={t('archive.description')}
        action={items.length > 0 ? <SearchInput value={query} onChange={setQuery} placeholder={t('archive.search')} className="sm:w-72" /> : undefined} />

      {items.length === 0 ? (
        <EmptyState icon={Archive} title={t('archive.empty')} description={t('archive.emptyDesc')} />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-1.5" role="tablist">
            {(['all', ...typesPresent] as const).map((entry) => (
              <button key={entry} type="button" role="tab" aria-selected={type === entry} onClick={() => setType(entry)}
                className={cn('rounded-full border px-3 py-1 text-xs transition-all duration-200 active:scale-95',
                  type === entry ? 'border-foreground/30 bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent')}>
                {entry === 'all' ? t('tags.allTypes') : t(entityLabelKeys[entry])}
                <span className="ml-1 tabular-nums opacity-70">{entry === 'all' ? items.length : items.filter((item) => item.type === entry).length}</span>
              </button>
            ))}
          </div>

          {visible.length === 0 ? <EmptyState icon={Archive} title={t('archive.noMatches')} /> : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <Card className="divide-y self-start overflow-hidden">
                {visible.map((item) => {
                  const Icon = entityIcons[item.type];
                  return (
                    <button key={`${item.type}:${item.id}`} type="button" onClick={() => setSelected(item.id)}
                      className={cn('row-enter flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50', current?.id === item.id && 'bg-accent')}>
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.title || t('common.untitled')}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {t(entityLabelKeys[item.type])}{projectName(item.project_id) && ` · ${projectName(item.project_id)}`} · {formatDateTime(item.archived_at, language)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </Card>

              {current && (
                <Card key={current.id} className="self-start p-6 duration-200 animate-in fade-in lg:sticky lg:top-20">
                  <p className="text-xs text-muted-foreground">{t(entityLabelKeys[current.type])} · {t('archive.archivedAt', { date: formatDateTime(current.archived_at, language) })}</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">{current.title || t('common.untitled')}</h2>
                  <p className="mt-4 max-h-[50vh] overflow-y-auto whitespace-pre-line text-sm leading-6 text-muted-foreground">
                    {markdownToPlainText(current.preview) || t('archive.noPreview')}
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2 border-t pt-4">
                    <Button onClick={() => void restoreItem(current)}><RotateCcw />{t('archive.restore')}</Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" className="text-destructive hover:text-destructive"><Trash2 />{t('archive.deletePermanently')}</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('common.confirmDeleteTitle')}</AlertDialogTitle>
                          <AlertDialogDescription>{t('archive.confirmDelete', { name: current.title || t('common.untitled') })}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => void deleteItem(current)}>{t('archive.deletePermanently')}</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
