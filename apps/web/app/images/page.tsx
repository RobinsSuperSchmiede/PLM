'use client';

import { useMemo, useState } from 'react';
import { FolderKanban, Image as ImageIcon } from 'lucide-react';

import { DropZone, PreviewOverlay, UploadButton, fileUrl, useUpload } from '@/components/files';
import { useI18n } from '@/components/i18n-provider';
import { PaneHeader, SidebarItem, SidebarSection, SplitLayout } from '@/components/split-layout';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState, PageSkeleton, SearchInput } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { colorOf } from '@/lib/appearance';
import { formatDate, toDateKey } from '@/lib/dates';

type Sort = 'newest' | 'oldest' | 'name';
const NO_PROJECT = '__none__';
const PAGE = 60;

export default function ImagesPage() {
  const { t, language } = useI18n();
  const { data, loading } = useWorkspace();
  const { upload, busy } = useUpload();
  const [project, setProject] = useState<string | 'all'>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [open, setOpen] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const images = useMemo(() => {
    const term = query.trim().toLowerCase();
    return data.files
      .filter((file) => file.kind === 'image')
      .filter((file) => project === 'all' || (project === NO_PROJECT ? !file.project_id : file.project_id === project))
      .filter((file) => !term || `${file.name} ${file.description ?? ''}`.toLowerCase().includes(term))
      .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'oldest' ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at)));
  }, [data.files, project, query, sort]);

  if (loading) return <div className="p-8"><PageSkeleton /></div>;

  const all = data.files.filter((file) => file.kind === 'image');
  const projects = data.projects.filter((item) => all.some((file) => file.project_id === item.id));
  const projectId = project !== 'all' && project !== NO_PROJECT ? project : null;
  // Group by month for a calmer timeline.
  const groups = new Map<string, typeof images>();
  for (const image of images.slice(0, limit)) {
    const key = sort === 'name' ? '' : image.created_at.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), image]);
  }

  return (
    <DropZone onFiles={(list) => void upload(Array.from(list).filter((file) => file.type.startsWith('image/')), { projectId })}>
      <SplitLayout sidebar={(
        <SidebarSection title={t('files.projects')}>
          <SidebarItem active={project === 'all'} onClick={() => setProject('all')} icon={<FolderKanban className="h-4 w-4" />} label={t('tags.allTypes')} count={all.length} />
          {projects.map((item) => (
            <SidebarItem key={item.id} active={project === item.id} onClick={() => setProject(item.id)} color={colorOf(item.name)} label={item.name}
              count={all.filter((file) => file.project_id === item.id).length} />
          ))}
          <SidebarItem active={project === NO_PROJECT} onClick={() => setProject(NO_PROJECT)} label={t('files.noProject')} color="hsl(var(--muted-foreground) / 0.5)"
            count={all.filter((file) => !file.project_id).length} />
        </SidebarSection>
      )}>
        <PaneHeader
          title={t('files.imagesTitle')}
          description={t('files.imagesDescription', { count: images.length })}
          actions={(
            <>
              <SearchInput value={query} onChange={setQuery} placeholder={t('files.search')} className="sm:w-64" />
              <Select value={sort} onValueChange={(value) => setSort(value as Sort)}>
                <SelectTrigger className="w-40" aria-label={t('files.sortNewest')}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">{t('files.sortNewest')}</SelectItem>
                  <SelectItem value="oldest">{t('files.sortOldest')}</SelectItem>
                  <SelectItem value="name">{t('files.sortName')}</SelectItem>
                </SelectContent>
              </Select>
              <UploadButton onFiles={(list) => void upload(list, { projectId })} busy={busy} />
            </>
          )}
        />
        {images.length === 0 ? (
          <div className="p-8"><EmptyState icon={ImageIcon} title={all.length ? t('files.noMatches') : t('files.imagesEmpty')} description={all.length ? undefined : t('files.imagesEmptyDesc')} /></div>
        ) : (
          <div className="space-y-8 px-5 py-6 sm:px-8">
            {[...groups.entries()].map(([month, items]) => (
              <section key={month}>
                {month && <h2 className="mb-3 text-sm font-medium text-muted-foreground">{formatDate(toDateKey(new Date(`${month}-01T12:00:00`)), language, { month: 'long', year: 'numeric' })}</h2>}
                <div className="columns-2 gap-3 sm:columns-3 xl:columns-4 2xl:columns-5">
                  {items.map((image) => (
                    <button key={image.id} type="button" onClick={() => setOpen(images.indexOf(image))}
                      className="group relative mb-3 block w-full overflow-hidden rounded-xl bg-muted/40 [break-inside:avoid] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fileUrl(image.id)} alt={image.description ?? image.name} loading="lazy" decoding="async"
                        className="w-full transition-transform duration-500 ease-[var(--ease-out)] group-hover:scale-[1.03]" />
                      <span className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/70 to-transparent p-3 text-left text-xs text-white transition-transform duration-300 ease-[var(--ease-out)] group-hover:translate-y-0">
                        {image.name}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {images.length > limit && (
              <div className="flex justify-center"><button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setLimit(limit + PAGE)}>+{Math.min(PAGE, images.length - limit)}</button></div>
            )}
          </div>
        )}
      </SplitLayout>
      {open !== null && images[open] && (
        <PreviewOverlay file={images[open]} onClose={() => setOpen(null)}
          onPrevious={open > 0 ? () => setOpen(open - 1) : undefined} onNext={open < images.length - 1 ? () => setOpen(open + 1) : undefined} />
      )}
    </DropZone>
  );
}
