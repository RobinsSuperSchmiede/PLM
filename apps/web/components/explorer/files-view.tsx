'use client';

import { useMemo, useState } from 'react';
import { Download, Paperclip, X } from 'lucide-react';

import { AcceptedFilesHint } from '@/components/accepted-files-hint';
import { DropZone, FileKindIcon, FilePreview, PreviewOverlay, UploadButton, fileKinds, fileUrl, kindStyles, thumbnailUrl, useUpload } from '@/components/files';
import { useI18n } from '@/components/i18n-provider';
import { ArchiveButton, EntityTagEditor, ProjectSelect, RelationsPanel } from '@/components/knowledge';
import { OpenFromQuery, useClearQueryId } from '@/components/open-from-query';
import { PaneHeader } from '@/components/split-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DeleteButton, EmptyState, PageSkeleton, SearchInput } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { colorOf } from '@/lib/appearance';
import { formatDateTime } from '@/lib/dates';
import type { FileKind, StoredFile } from '@/lib/types';
import { cn, formatBytes } from '@/lib/utils';

/** Everything about one file: preview, name, description, project, tags, relations. Shown in the explorer preview. */
export function FileDetails({ file, onPreview, onClose, onSave, onDelete }: {
  file: StoredFile;
  onPreview: () => void;
  onClose: () => void;
  onSave: (patch: Partial<StoredFile>) => void;
  onDelete: () => void;
}) {
  const { t, language } = useI18n();
  const [name, setName] = useState(file.name);
  const [description, setDescription] = useState(file.description ?? '');
  const { color } = kindStyles[file.kind];

  return (
    <div className="space-y-5 p-5">
      <div className="flex items-start gap-3">
        <FileKindIcon kind={file.kind} boxed />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium" style={{ color }}>{t(`files.kind_${file.kind}`)} · {formatBytes(file.size)}</p>
          <p className="truncate font-semibold">{file.name}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('notes.close')}><X /></Button>
      </div>
      <button type="button" onClick={onPreview} className="flex h-56 w-full items-center justify-center overflow-hidden rounded-lg bg-muted transition-colors hover:bg-muted/60">
        {file.kind === 'image' || file.kind === 'pdf' ? <FilePreview file={file} className={file.kind === 'pdf' ? 'pointer-events-none min-h-0' : 'max-h-56'} /> : <FileKindIcon kind={file.kind} boxed className="h-16 w-16" />}
      </button>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={onPreview}>{t('files.open')}</Button>
        <Button variant="outline" asChild><a href={fileUrl(file.id, true)}><Download />{t('files.download')}</a></Button>
      </div>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="file-name">{t('files.name')}</label>
          <Input id="file-name" value={name} onChange={(event) => setName(event.target.value)} onBlur={() => name.trim() && name !== file.name && onSave({ name: name.trim() })} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="file-description">{t('files.descriptionLabel')}</label>
          <Textarea id="file-description" rows={3} className="min-h-[80px]" value={description} onChange={(event) => setDescription(event.target.value)}
            onBlur={() => description !== (file.description ?? '') && onSave({ description: description.trim() || null })} />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t('relations.project')}</p>
          <ProjectSelect value={file.project_id} onChange={(projectId) => onSave({ project_id: projectId })} />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t('relations.tags')}</p>
          <EntityTagEditor type="file" id={file.id} />
        </div>
        <p className="text-xs text-muted-foreground">{t('files.added')} {formatDateTime(file.created_at, language)}</p>
      </div>
      <RelationsPanel type="file" id={file.id} compact className="border-t pt-5" />
      <div className="flex gap-2 border-t pt-4">
        <ArchiveButton type="file" id={file.id} label onArchived={onClose} />
        <div className="ml-auto"><DeleteButton name={file.name} onConfirm={onDelete} size="sm" label={t('common.delete')} /></div>
      </div>
    </div>
  );
}
