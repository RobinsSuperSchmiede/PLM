'use client';

import { useMemo, useState } from 'react';
import { ImageIcon, Pin } from 'lucide-react';
import { toast } from 'sonner';

import { PreviewOverlay, thumbnailUrl, UploadButton, useUpload } from '@/components/files';
import { useI18n } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/workspace-provider';
import { colorOf } from '@/lib/appearance';
import type { Project, StoredFile } from '@/lib/types';
import { cn } from '@/lib/utils';

/** All images of a project: uploaded with the project, attached to it, or website screenshots. */
export function useProjectImages(projectId: string): StoredFile[] {
  const { data, links } = useWorkspace();
  return useMemo(() => {
    const linked = new Set<string>();
    for (const link of links) {
      if (link.source_type === 'project' && link.source_id === projectId && link.target_type === 'file') linked.add(link.target_id);
      if (link.target_type === 'project' && link.target_id === projectId && link.source_type === 'file') linked.add(link.source_id);
    }
    return data.files
      .filter((file) => file.kind === 'image' && (file.project_id === projectId || linked.has(file.id)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [data.files, links, projectId]);
}

/** The cover image of a project, or a soft placeholder in the project's color. */
export function ProjectCover({ project, className, size = 640 }: { project: Project; className?: string; size?: 320 | 640 | 1280 }) {
  const [broken, setBroken] = useState(false);
  if (project.cover_file_id && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={thumbnailUrl(project.cover_file_id, size)} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)}
        className={cn('block w-full bg-muted object-cover', className)} />
    );
  }
  const color = colorOf(project.name);
  return (
    <div aria-hidden="true" className={cn('block w-full', className)}
      style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${color} 22%, transparent), color-mix(in srgb, ${color} 6%, transparent))` }} />
  );
}

/** Images of the project with a pin to choose the cover. */
export function ProjectImagesPanel({ project }: { project: Project }) {
  const { t } = useI18n();
  const { update } = useWorkspace();
  const images = useProjectImages(project.id);
  const { upload, busy } = useUpload();
  const [preview, setPreview] = useState<StoredFile | null>(null);

  async function toggleCover(file: StoredFile) {
    const next = project.cover_file_id === file.id ? null : file.id;
    if (await update('projects', project.id, { cover_file_id: next })) toast.success(next ? t('cover.coverSet') : t('cover.coverRemoved'));
  }

  return (
    <section aria-label={t('cover.images')} className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><ImageIcon className="h-4 w-4 text-muted-foreground" />{t('cover.images')}
            {images.length > 0 && <span className="text-xs font-normal text-muted-foreground">{images.length}</span>}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('cover.imagesDesc')}</p>
        </div>
        <UploadButton onFiles={(files) => void upload(files, { attach: { type: 'project', id: project.id }, projectId: project.id })} busy={busy} size="sm" variant="outline" />
      </div>
      {images.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('cover.noImages')}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
          {images.map((file) => {
            const isCover = project.cover_file_id === file.id;
            return (
              <li key={file.id} className={cn('group relative overflow-hidden rounded-2xl bg-muted', isCover && 'ring-2 ring-foreground ring-offset-2 ring-offset-background')}>
                <button type="button" onClick={() => setPreview(file)} className="block w-full" aria-label={file.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbnailUrl(file.id, 320)} alt="" loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover transition-transform duration-700 ease-ds group-hover:scale-[1.03]" />
                </button>
                {isCover && <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">{t('cover.isCover')}</span>}
                <Button type="button" variant="secondary" size="icon-sm" onClick={() => void toggleCover(file)}
                  aria-pressed={isCover} aria-label={`${isCover ? t('cover.removeCover') : t('cover.setCover')}: ${file.name}`} title={isCover ? t('cover.removeCover') : t('cover.setCover')}
                  className={cn('absolute right-2 top-2 bg-popover/90 backdrop-blur transition-opacity', isCover ? 'opacity-100' : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100')}>
                  <Pin className={cn(isCover && 'fill-current')} />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {preview && <PreviewOverlay file={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}
