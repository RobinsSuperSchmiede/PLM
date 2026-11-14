'use client';

import { useMemo, useState } from 'react';
import { Download, Files, FolderKanban, Paperclip, X } from 'lucide-react';

import { AcceptedFilesHint } from '@/components/accepted-files-hint';
import { DropZone, FileKindIcon, FilePreview, PreviewOverlay, UploadButton, fileKinds, fileUrl, kindStyles, thumbnailUrl, useUpload } from '@/components/files';
import { useI18n } from '@/components/i18n-provider';
import { ArchiveButton, EntityTagEditor, ProjectSelect, RelationsPanel } from '@/components/knowledge';
import { OpenFromQuery, useClearQueryId } from '@/components/open-from-query';
import { PaneHeader, SidebarItem, SidebarSection, SplitLayout } from '@/components/split-layout';
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

type Sort = 'newest' | 'name' | 'size';
const NO_PROJECT = '__none__';

export default function FilesPage() {
  const { t, language } = useI18n();
  const { data, loading, update, remove } = useWorkspace();
  const { upload, busy } = useUpload();
  const [kind, setKind] = useState<FileKind | 'all'>('all');
  const [project, setProject] = useState<string | 'all'>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<StoredFile | null>(null);
  const clearQuery = useClearQueryId();

  const files = useMemo(() => {
    const term = query.trim().toLowerCase();
    return data.files
      .filter((file) => kind === 'all' || file.kind === kind)
      .filter((file) => project === 'all' || (project === NO_PROJECT ? !file.project_id : file.project_id === project))
      .filter((file) => !term || `${file.name} ${file.description ?? ''}`.toLowerCase().includes(term))
      .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'size' ? b.size - a.size : b.created_at.localeCompare(a.created_at)));
  }, [data.files, kind, project, query, sort]);

  if (loading) return <div className="p-8"><PageSkeleton /></div>;

  const selected = data.files.find((file) => file.id === selectedId) ?? null;
  const projectsWithFiles = data.projects.filter((item) => data.files.some((file) => file.project_id === item.id));
  const total = data.files.reduce((sum, file) => sum + file.size, 0);

  const sidebar = (
    <>
      <SidebarSection title={t('files.types')}>
        <SidebarItem active={kind === 'all'} onClick={() => setKind('all')} icon={<Files className="h-4 w-4" />} label={t('files.all')} count={data.files.length} />
        {fileKinds.map((value) => (
          <SidebarItem key={value} active={kind === value} onClick={() => setKind(value)} icon={<FileKindIcon kind={value} />} label={t(`files.kind_${value}`)}
            count={data.files.filter((file) => file.kind === value).length} />
        ))}
      </SidebarSection>
      <SidebarSection title={t('files.projects')}>
        <SidebarItem active={project === 'all'} onClick={() => setProject('all')} icon={<FolderKanban className="h-4 w-4" />} label={t('tags.allTypes')} />
        {projectsWithFiles.map((item) => (
          <SidebarItem key={item.id} active={project === item.id} onClick={() => setProject(item.id)} color={colorOf(item.name)} label={item.name}
            count={data.files.filter((file) => file.project_id === item.id).length} />
        ))}
        <SidebarItem active={project === NO_PROJECT} onClick={() => setProject(NO_PROJECT)} label={t('files.noProject')} color="hsl(var(--muted-foreground) / 0.5)"
          count={data.files.filter((file) => !file.project_id).length} />
      </SidebarSection>
      <p className="px-4 py-3 text-xs text-muted-foreground">{formatBytes(total)} · {data.files.length}</p>
    </>
  );

  return (
    <DropZone onFiles={(list) => void upload(list, { projectId: project !== 'all' && project !== NO_PROJECT ? project : null })}>
      <SplitLayout sidebar={sidebar}>
        <div className={cn('grid min-h-full', selected && 'xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_420px]')}>
          <div className="min-w-0">
            <PaneHeader
              title={kind === 'all' ? t('files.title') : t(`files.kind_${kind}`)}
              description={t('files.description', { count: files.length })}
              actions={(
                <>
                  <SearchInput value={query} onChange={setQuery} placeholder={t('files.search')} className="sm:w-64" />
                  <Select value={sort} onValueChange={(value) => setSort(value as Sort)}>
                    <SelectTrigger className="w-40" aria-label={t('files.sortNewest')}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">{t('files.sortNewest')}</SelectItem>
                      <SelectItem value="name">{t('files.sortName')}</SelectItem>
                      <SelectItem value="size">{t('files.sortSize')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <UploadButton onFiles={(list) => void upload(list, { projectId: project !== 'all' && project !== NO_PROJECT ? project : null })} busy={busy} />
                </>
              )}
            />
            {data.files.length === 0 ? (
              <div className="p-8"><EmptyState icon={Paperclip} title={t('files.empty')} description={t('files.emptyDesc')} /></div>
            ) : files.length === 0 ? (
              <div className="p-8"><EmptyState icon={Paperclip} title={t('files.noMatches')} /></div>
            ) : (
              <div role="table" className="px-2 py-2 sm:px-4">
                <div role="row" className={cn('hidden grid-cols-[minmax(0,1fr)_7rem_6rem_9rem] gap-4 px-3 py-2 text-xs font-medium text-muted-foreground', !selected && 'md:grid')}>
                  <span role="columnheader">{t('files.name')}</span><span role="columnheader">{t('files.projects')}</span>
                  <span role="columnheader" className="text-right">{t('files.size')}</span><span role="columnheader">{t('files.added')}</span>
                </div>
                {files.map((file) => {
                  const fileProject = data.projects.find((item) => item.id === file.project_id);
                  return (
                    <button key={file.id} type="button" role="row" onClick={() => setSelectedId(file.id)} onDoubleClick={() => setPreview(file)}
                      className={cn('lazy-row grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-lg px-3 py-2 text-left text-sm transition-colors', !selected && 'md:grid-cols-[minmax(0,1fr)_7rem_6rem_9rem]',
                        selectedId === file.id ? 'bg-brand/10' : 'hover:bg-accent/60')}>
                      <span className="flex min-w-0 items-center gap-3" role="cell">
                        {file.kind === 'image' ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumbnailUrl(file.id, 160)} alt="" loading="lazy" decoding="async" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                        ) : <FileKindIcon kind={file.kind} boxed />}
                        <span className="min-w-0"><span className="block truncate font-medium">{file.name}</span>
                          {file.description && <span className="block truncate text-xs text-muted-foreground">{file.description}</span>}</span>
                      </span>
                      <span role="cell" className={cn('hidden truncate text-xs', !selected && 'md:block')}>
                        {fileProject && <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: colorOf(fileProject.name) }} />{fileProject.name}</span>}
                      </span>
                      <span role="cell" className="text-right text-xs tabular-nums text-muted-foreground">{formatBytes(file.size)}</span>
                      <span role="cell" className={cn('hidden text-xs text-muted-foreground', !selected && 'md:block')}>{formatDateTime(file.created_at, language)}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <AcceptedFilesHint />
          </div>

          {selected && (
            <aside key={selected.id} className="border-t bg-card/40 duration-200 animate-in fade-in slide-in-from-right-2 xl:sticky xl:top-14 xl:h-[calc(100vh-3.5rem)] xl:overflow-y-auto xl:border-l xl:border-t-0">
              <FileDetails file={selected} onPreview={() => setPreview(selected)} onClose={() => { setSelectedId(null); clearQuery(); }}
                onSave={(patch) => void update('files', selected.id, patch)} onDelete={() => { void remove('files', selected.id); setSelectedId(null); }} />
            </aside>
          )}
        </div>
      </SplitLayout>
      <OpenFromQuery items={data.files} onOpen={(file) => setSelectedId(file.id)} />
      {preview && <PreviewOverlay file={preview} onClose={() => setPreview(null)} />}
    </DropZone>
  );
}

function FileDetails({ file, onPreview, onClose, onSave, onDelete }: {
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
