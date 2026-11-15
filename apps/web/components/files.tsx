'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Download, FileImage, FileSpreadsheet, FileText, FileType2, Paperclip, Presentation, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import { DotLoader } from '@/components/dot-loader';
import { useI18n } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/workspace-provider';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import type { EntityRef, FileKind, StoredFile } from '@/lib/types';
import { cn, formatBytes } from '@/lib/utils';

export const fileKinds: FileKind[] = ['image', 'pdf', 'document', 'spreadsheet', 'presentation'];
export const acceptedFiles = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx';

export const kindStyles: Record<FileKind, { icon: typeof FileText; color: string }> = {
  image: { icon: FileImage, color: 'hsl(330 75% 58%)' },
  pdf: { icon: FileType2, color: 'hsl(0 78% 58%)' },
  document: { icon: FileText, color: 'hsl(217 91% 58%)' },
  spreadsheet: { icon: FileSpreadsheet, color: 'hsl(152 62% 42%)' },
  presentation: { icon: Presentation, color: 'hsl(24 92% 54%)' },
};

export function fileUrl(id: string, download = false) {
  return `/api/v1/files/${id}/content${download ? '?download=true' : ''}`;
}

/** Small WebP preview of an image (longest edge `size` px); lists and galleries use it instead of the original. */
export function thumbnailUrl(id: string, size: 160 | 320 | 640 | 1280 = 320) {
  return `/api/v1/files/${id}/thumbnail?size=${size}`;
}

export function FileKindIcon({ kind, className, boxed }: { kind: FileKind; className?: string; boxed?: boolean }) {
  const { icon: Icon, color } = kindStyles[kind];
  if (!boxed) return <Icon className={cn('h-4 w-4 shrink-0', className)} style={{ color }} />;
  return (
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', className)} style={{ background: `color-mix(in srgb, ${color} 15%, transparent)` }}>
      <Icon className="h-[18px] w-[18px]" style={{ color }} />
    </span>
  );
}

/** Uploads files; optionally links them to an entry (note, task, project) right away. */
export function useUpload() {
  const { t } = useI18n();
  const { insert, reloadOrganization } = useWorkspace();
  const [busy, setBusy] = useState(false);

  const upload = useCallback(async (list: FileList | File[], options: { attach?: EntityRef; projectId?: string | null } = {}) => {
    const files = Array.from(list);
    if (!files.length) return [];
    setBusy(true);
    const done: StoredFile[] = [];
    try {
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        if (options.projectId) form.append('project_id', options.projectId);
        if (options.attach) {
          form.append('attach_type', options.attach.type);
          form.append('attach_id', options.attach.id);
        }
        const response = await fetch('/api/v1/files', { method: 'POST', body: form });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const detail = payload && typeof payload === 'object' && 'detail' in payload ? String((payload as { detail: unknown }).detail) : response.statusText;
          throw new ApiError(`${file.name}: ${detail}`, response.status);
        }
        insert('files', payload as StoredFile);
        done.push(payload as StoredFile);
      }
      if (options.attach) await reloadOrganization();
      toast.success(t('files.uploaded', { count: done.length }));
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
    return done;
  }, [insert, reloadOrganization, t]);

  return { upload, busy };
}

/** Wraps an area so files can be dropped onto it. */
export function DropZone({ onFiles, children, className, label }: { onFiles: (files: FileList) => void; children: React.ReactNode; className?: string; label?: string }) {
  const { t } = useI18n();
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  return (
    <div
      className={cn('relative', className)}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        depth.current += 1;
        setOver(true);
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setOver(false);
      }}
      onDragOver={(event) => event.dataTransfer.types.includes('Files') && event.preventDefault()}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        depth.current = 0;
        setOver(false);
        onFiles(event.dataTransfer.files);
      }}
    >
      {children}
      {over && (
        <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-[16px] bg-popover text-center outline-dashed outline-[1.5px] -outline-offset-[1.5px] outline-foreground/20 backdrop-blur-surface duration-300 animate-in fade-in">
          <Upload className="h-6 w-6" />
          <p className="text-sm font-medium">{label ?? t('files.drop')}</p>
          <p className="text-xs text-muted-foreground">{t('files.dropHint')}</p>
        </div>
      )}
    </div>
  );
}

export function UploadButton({ onFiles, busy, size = 'default', variant = 'default', label }: {
  onFiles: (files: FileList) => void;
  busy?: boolean;
  size?: 'default' | 'sm';
  variant?: 'default' | 'outline';
  label?: string;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={input} type="file" multiple accept={acceptedFiles} className="hidden"
        onChange={(event) => { if (event.target.files?.length) onFiles(event.target.files); event.target.value = ''; }} />
      <Button type="button" size={size} variant={variant} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <DotLoader size={14} /> : <Upload />}{busy ? t('files.uploading') : label ?? t('files.upload')}
      </Button>
    </>
  );
}

export function FilePreview({ file, className }: { file: StoredFile; className?: string }) {
  const { t } = useI18n();
  if (file.kind === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={fileUrl(file.id)} alt={file.name} className={cn('max-h-full max-w-full rounded-lg object-contain', className)} />;
  }
  if (file.kind === 'pdf') return <iframe src={fileUrl(file.id)} title={file.name} className={cn('h-full min-h-[480px] w-full rounded-[14px] bg-white', className)} />;
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 rounded-[18px] p-10 text-center outline-dashed outline-[1.5px] -outline-offset-[1.5px] outline-foreground/15', className)}>
      <FileKindIcon kind={file.kind} boxed className="h-14 w-14" />
      <p className="max-w-xs text-sm text-muted-foreground">{t('files.noPreview')}</p>
      <Button variant="outline" size="sm" asChild><a href={fileUrl(file.id, true)}><Download />{t('files.download')}</a></Button>
    </div>
  );
}

/** Files linked to an entry, with upload by button or drag and drop. */
export function AttachmentsPanel({ type, id, projectId, className }: { type: EntityRef['type']; id: string; projectId?: string | null; className?: string }) {
  const { t, language } = useI18n();
  const { data, links, removeLink } = useWorkspace();
  const { upload, busy } = useUpload();
  const [preview, setPreview] = useState<StoredFile | null>(null);

  const attached = useMemo(() => links
    .map((link) => {
      if (link.source_type === type && link.source_id === id && link.target_type === 'file') return { linkId: link.id, fileId: link.target_id };
      if (link.target_type === type && link.target_id === id && link.source_type === 'file') return { linkId: link.id, fileId: link.source_id };
      return null;
    })
    .filter((entry): entry is { linkId: string; fileId: string } => entry !== null)
    .map((entry) => ({ ...entry, file: data.files.find((file) => file.id === entry.fileId) }))
    .filter((entry): entry is { linkId: string; fileId: string; file: StoredFile } => Boolean(entry.file)), [data.files, id, links, type]);

  const add = (files: FileList) => void upload(files, { attach: { type, id }, projectId });

  return (
    <DropZone onFiles={add} className={className}>
      <section aria-label={t('files.attachments')} className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Paperclip className="h-4 w-4 text-muted-foreground" />{t('files.attachments')}
            {attached.length > 0 && <span className="text-xs font-normal text-muted-foreground">{attached.length}</span>}</h3>
          <UploadButton onFiles={add} busy={busy} size="sm" variant="outline" label={t('files.attach')} />
        </div>
        {attached.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('files.noAttachments')}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {attached.map(({ linkId, file }) => (
              <li key={linkId} className="group flex items-center gap-3 rounded-2xl bg-muted p-2 pr-2.5 transition-colors duration-300 hover:bg-accent">
                <button type="button" onClick={() => setPreview(file)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  {file.kind === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbnailUrl(file.id, 160)} alt="" loading="lazy" decoding="async" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
                  ) : <FileKindIcon kind={file.kind} boxed />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{file.name}</span>
                    <span className="block text-[11px] text-muted-foreground">{formatBytes(file.size)} · {formatDateTime(file.created_at, language)}</span>
                  </span>
                </button>
                <a href={fileUrl(file.id, true)} className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100" aria-label={`${t('files.download')}: ${file.name}`}><Download className="h-3.5 w-3.5" /></a>
                <button type="button" onClick={() => void removeLink(linkId)} className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100" aria-label={`${t('files.detach')}: ${file.name}`}><X className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {preview && <PreviewOverlay file={preview} onClose={() => setPreview(null)} />}
    </DropZone>
  );
}

/** Full-screen preview with download. */
export function PreviewOverlay({ file, onClose, onPrevious, onNext }: { file: StoredFile; onClose: () => void; onPrevious?: () => void; onNext?: () => void }) {
  const { t, language } = useI18n();
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm duration-200 animate-in fade-in" role="dialog" aria-label={file.name}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
        if (event.key === 'ArrowLeft') onPrevious?.();
        if (event.key === 'ArrowRight') onNext?.();
      }}
      tabIndex={-1} ref={(element) => element?.focus()}>
      <div className="flex items-center gap-3 px-5 py-3 text-white">
        <FileKindIcon kind={file.kind} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-white/60">{formatBytes(file.size)} · {formatDateTime(file.created_at, language)}</p>
        </div>
        <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white" asChild><a href={fileUrl(file.id, true)}><Download />{t('files.download')}</a></Button>
        <Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/10 hover:text-white" onClick={onClose} aria-label={t('notes.close')}><X /></Button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4" onClick={(event) => event.target === event.currentTarget && onClose()}>
        {onPrevious && <button type="button" onClick={onPrevious} aria-label={t('files.previous')} className="absolute left-4 rounded-full bg-white/10 px-3 py-2 text-white hover:bg-white/20">‹</button>}
        <FilePreview file={file} className={file.kind === 'pdf' ? 'max-w-5xl' : 'max-h-[85vh]'} />
        {onNext && <button type="button" onClick={onNext} aria-label={t('files.next')} className="absolute right-4 rounded-full bg-white/10 px-3 py-2 text-white hover:bg-white/20">›</button>}
      </div>
    </div>
  );
}
