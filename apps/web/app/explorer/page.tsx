'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type MutableRefObject, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen, Check, ChevronRight, ExternalLink, FileText, Filter, Folder as FolderIcon, FolderOpen, FolderPlus, Hash, Image as ImageIcon, Inbox, LayoutGrid,
  Maximize2, Minimize2, MoreHorizontal, Network, NotebookPen, PanelLeft, Paperclip, Pin, PinOff, Plus, Star, StarOff, X,
} from 'lucide-react';

import { DotLoader } from '@/components/dot-loader';
import { FileDetails } from '@/components/explorer/files-view';
import { ArticleDialog } from '@/components/explorer/knowledge-view';
import { AttachmentsPanel, DropZone, PreviewOverlay, UploadButton, fileUrl, thumbnailUrl, useUpload } from '@/components/files';
import { useI18n } from '@/components/i18n-provider';
import { ArchiveButton, EntityTags, ProjectSelect, RelationsPanel, TagInput, useEntityTags } from '@/components/knowledge';
import { OpenFromQuery, useClearQueryId } from '@/components/open-from-query';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Segmented } from '@/components/ui/segmented';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DeleteButton, EmptyState, PageSkeleton, SearchInput } from '@/components/workspace-ui';
import { VirtualList } from '@/components/virtual-list';
import { useWorkspace } from '@/components/workspace-provider';
import { formatDateTime } from '@/lib/dates';
import { wikiLinks } from '@/lib/entities';
import type { TranslationKey } from '@/lib/i18n';
import { markdownToPlainText } from '@/lib/markdown';
import type { EntityType, Folder, KnowledgeArticle, Note, NoteSource, StoredFile } from '@/lib/types';
import { cn, formatBytes } from '@/lib/utils';

// TipTap is large: load the editor only when a page actually shows it.
const MarkdownEditor = dynamic(() => import('@/components/markdown-editor').then((module) => module.MarkdownEditor), {
  ssr: false,
  loading: () => <div className="min-h-[240px]" aria-hidden="true" />,
});

const ALL = 'all';
/** What the main pane shows: everything mixed, or one kind of content. */
const views = ['all', 'notes', 'docs', 'files', 'images'] as const;
type View = typeof views[number];
const viewLabels: Record<View, TranslationKey> = { all: 'explorer.everything', notes: 'nav.notes', docs: 'nav.knowledge', files: 'nav.files', images: 'nav.images' };
const UNFILED = 'unfiled';
const NONE = 'none';
const DRAG_TYPE = 'application/x-anamnesies';
const fg2 = 'text-[hsl(var(--fg-2)/var(--fg-2-a))]';

type Period = 'any' | '7' | '30' | '365';
type LinkFilter = 'any' | 'with' | 'without';
type Filters = { project: string; tag: string; period: Period; author: 'any' | NoteSource; links: LinkFilter };
const noFilters: Filters = { project: NONE, tag: NONE, period: 'any', author: 'any', links: 'any' };

export default function ExplorerPage() {
  return <Suspense fallback={<div className="p-8"><PageSkeleton /></div>}><Workspace /></Suspense>;
}

function sortFolders(folders: Folder[]) {
  return [...folders].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.position - b.position || a.name.localeCompare(b.name));
}

/** Folder ids of `id` and everything below it. */
function descendants(folders: Folder[], id: string): Set<string> {
  const result = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (folder.parent_id && result.has(folder.parent_id) && !result.has(folder.id)) {
        result.add(folder.id);
        grew = true;
      }
    }
  }
  return result;
}

function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored) setValue(JSON.parse(stored) as T);
    } catch { /* storage unavailable */ }
  }, [key]);
  const update = useCallback((next: T | ((current: T) => T)) => {
    setValue((current) => {
      const resolved = typeof next === 'function' ? (next as (current: T) => T)(current) : next;
      try {
        window.localStorage.setItem(key, JSON.stringify(resolved));
      } catch { /* storage unavailable */ }
      return resolved;
    });
  }, [key]);
  return [value, update] as const;
}

function isEmptyNote(note: Note | undefined, tagCount: number) {
  return Boolean(note && !note.title.trim() && !(note.content ?? '').trim() && !tagCount && !note.project_id);
}

function Workspace() {
  const { t } = useI18n();
  const { data, loading, create, remove, tagAssignments } = useWorkspace();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [treeOpen, setTreeOpen] = useStoredState('notes.explorer', true);
  // On phones the tree is a panel above the content that opens on demand.
  const [mobileTree, setMobileTree] = useState(false);
  const [tabs, setTabs] = useStoredState<string[]>('notes.tabs', []);
  const [focus, setFocus] = useState(false);
  const [article, setArticle] = useState<KnowledgeArticle | 'new' | null>(null);
  const clearQuery = useClearQueryId();
  const activeId = searchParams.get('id');
  const scope = searchParams.get('folder') ?? ALL;
  const viewParam = searchParams.get('view') as View | null;
  // A folder only holds notes, so picking one implies the notes view.
  const view: View = scope !== ALL ? 'notes' : viewParam && views.includes(viewParam) ? viewParam : 'all';
  // Set by the active editor: saves pending changes, or deletes the note if it was never filled in.
  const beforeClose = useRef<(() => void) | undefined>(undefined);

  const go = useCallback((params: { view?: View; folder?: string | null; id?: string | null }) => {
    const next = new URLSearchParams();
    const folder = params.view ? null : params.folder === undefined ? (scope === ALL ? null : scope) : params.folder;
    // Leaving a folder (folder: null) lands on all notes; otherwise the current view stays.
    const nextView = params.view ?? (folder || params.folder === null ? 'notes' : view);
    if (folder && folder !== ALL) next.set('folder', folder);
    else if (nextView !== 'all') next.set('view', nextView);
    if (params.id) next.set('id', params.id);
    const query = next.toString();
    router.replace(query ? `/explorer?${query}` : '/explorer', { scroll: false });
  }, [router, scope, view]);

  // Every note that is opened (link, search, explorer) gets a tab.
  useEffect(() => {
    if (activeId && !tabs.includes(activeId) && data.notes.some((note) => note.id === activeId)) setTabs((current) => (current.includes(activeId) ? current : [...current, activeId]));
  }, [activeId, data.notes, setTabs, tabs]);

  // Drop tabs of notes that were deleted or archived elsewhere.
  useEffect(() => {
    if (loading) return;
    const existing = new Set(data.notes.map((note) => note.id));
    if (tabs.some((id) => !existing.has(id))) setTabs((current) => current.filter((id) => existing.has(id)));
  }, [data.notes, loading, setTabs, tabs]);

  const open = useCallback((id: string) => go({ id }), [go]);
  const categories = useMemo(() => Array.from(new Set(data.knowledge.map((entry) => entry.category).filter(Boolean) as string[])).sort(), [data.knowledge]);

  function closeTab(id: string) {
    if (id === activeId) beforeClose.current?.();
    else {
      const note = data.notes.find((entry) => entry.id === id);
      if (isEmptyNote(note, tagAssignments.filter((entry) => entry.entity_id === id).length)) void remove('notes', id);
    }
    const index = tabs.indexOf(id);
    const rest = tabs.filter((entry) => entry !== id);
    setTabs(rest);
    if (id === activeId) go({ id: rest[Math.min(index, rest.length - 1)] ?? null });
  }

  async function createNote(folderId?: string | null) {
    const folder = folderId !== undefined ? folderId : scope !== ALL && scope !== UNFILED ? scope : null;
    const note = await create('notes', { title: '', content: '', folder_id: folder });
    if (note) open(note.id);
  }

  if (loading) return <div className="p-8"><PageSkeleton /></div>;

  const active = data.notes.find((note) => note.id === activeId) ?? null;
  // The stored list can hold an id twice (two windows writing it); every note gets one tab.
  const openTabs = [...new Set(tabs)].map((id) => data.notes.find((note) => note.id === id)).filter((note): note is Note => Boolean(note));
  const toggleTree = () => { if (window.innerWidth < 1024) setMobileTree((value) => !value); else setTreeOpen(!treeOpen); };

  return (
    <div className="flex flex-col lg:h-[calc(100vh-3.5rem)] lg:flex-row">
      {(treeOpen || mobileTree) && !focus && (
        <aside className={cn('min-h-0 shrink-0 lg:h-full lg:w-[248px]', mobileTree ? 'duration-200 animate-in fade-in slide-in-from-top-1' : 'hidden lg:block', !treeOpen && 'lg:hidden')}
          onClick={(event) => { if ((event.target as HTMLElement).closest('[data-tree-item]')) setMobileTree(false); }}>
          <Tree scope={scope} view={active ? null : view} onSelectView={(next) => go({ view: next, id: null })}
            onSelectFolder={(folder) => go({ folder, id: null })} onCreateNote={(folderId) => void createNote(folderId)} />
        </aside>
      )}

      <section className={cn('flex min-h-[70vh] min-w-0 flex-1 flex-col lg:h-full lg:min-h-0', focus && 'fixed inset-0 z-50 bg-background duration-300 animate-in fade-in zoom-in-[0.99]')}>
        {openTabs.length > 0 && !focus && (
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto px-4 pt-3 [scrollbar-width:none] lg:px-2" role="tablist" aria-label={t('explorer.tabs')}>
            <TabButton active={!active} onClick={() => go({ id: null })} icon={LayoutGrid} label={t('explorer.overview')} />
            {openTabs.map((note) => (
              <TabButton key={note.id} active={note.id === activeId} onClick={() => open(note.id)} onClose={() => closeTab(note.id)}
                icon={FileText} label={note.title || t('common.untitled')} pinned={note.pinned} />
            ))}
          </div>
        )}

        {active ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <NoteEditor key={active.id} note={active} focus={focus} onToggleFocus={() => setFocus((value) => !value)} beforeClose={beforeClose}
              onGone={() => {
                setTabs((current) => current.filter((id) => id !== active.id));
                setFocus(false);
                go({ id: null });
              }} />
          </div>
        ) : (
          <Browser scope={scope} view={view} treeOpen={treeOpen} onToggleTree={toggleTree} onOpenNote={open} onOpenDocument={setArticle}
            onCreate={() => (view === 'docs' ? setArticle('new') : void createNote())}
            onSelectView={(next) => go({ view: next, id: null })} onSelectFolder={(folder) => go({ folder, id: null })} />
        )}
      </section>

      <OpenFromQuery items={data.knowledge} onOpen={setArticle} />
      <ArticleDialog article={article} categories={categories} onClose={() => { setArticle(null); clearQuery(); }} />
    </div>
  );
}

function TabButton({ active, onClick, onClose, icon: Icon, label, pinned }: {
  active: boolean;
  onClick: () => void;
  onClose?: () => void;
  icon: typeof FileText;
  label: string;
  pinned?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && (event.preventDefault(), onClick())}
      onAuxClick={(event) => { if (event.button === 1 && onClose) { event.preventDefault(); onClose(); } }}
      title={label}
      className={cn(
        'group flex h-7 max-w-[13rem] shrink-0 cursor-pointer items-center gap-2 rounded-full px-3 text-[13px] transition-[background-color,color,box-shadow] duration-300 ease-ds animate-in fade-in slide-in-from-left-1 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
        active ? 'ds-glass font-medium text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      {pinned && <Pin className="h-3 w-3 shrink-0 opacity-60" />}
      {onClose && (
        <button type="button" onClick={(event) => { event.stopPropagation(); onClose(); }} aria-label={`${t('explorer.closeTab')}: ${label}`}
          className={cn('-mr-1.5 rounded-full p-0.5 transition-opacity hover:bg-foreground/10', active ? 'opacity-70' : 'opacity-0 group-hover:opacity-70')}>
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// --- Browser: folders, notes, documents, files and images as one grid ---------------------------

type Entry = { key: string; id: string; title: string; at: string; size: number; projectId: string | null; pinned: boolean } & (
  | { kind: 'folder'; folder: Folder; count: number }
  | { kind: 'note'; note: Note }
  | { kind: 'doc'; doc: KnowledgeArticle }
  | { kind: 'file'; file: StoredFile });
type Layout = 'grid' | 'list';
type Sort = 'updated' | 'name' | 'size';

const tagType: Record<'note' | 'doc' | 'file', EntityType> = { note: 'note', doc: 'knowledge', file: 'file' };

/** Small type marker on a thumbnail, as in a file manager. */
function badgeOf(entry: Entry): { label: string; className: string } {
  if (entry.kind === 'folder') return { label: '', className: '' };
  if (entry.kind === 'note') return { label: 'MD', className: 'bg-foreground text-background' };
  if (entry.kind === 'doc') return { label: 'DOK', className: 'bg-[#0E7C86]' };
  return {
    image: { label: 'IMG', className: 'bg-black/55' },
    pdf: { label: 'PDF', className: 'bg-[#C8331F]' },
    document: { label: 'DOC', className: 'bg-[#2558D9]' },
    spreadsheet: { label: 'XLS', className: 'bg-[#16784A]' },
    presentation: { label: 'PPT', className: 'bg-[#B8551A]' },
  }[entry.file.kind];
}

function Browser({ scope, view, treeOpen, onToggleTree, onOpenNote, onOpenDocument, onCreate, onSelectView, onSelectFolder }: {
  scope: string;
  view: View;
  treeOpen: boolean;
  onToggleTree: () => void;
  onOpenNote: (id: string) => void;
  onOpenDocument: (doc: KnowledgeArticle) => void;
  onCreate: () => void;
  onSelectView: (view: View) => void;
  onSelectFolder: (folder: string | null) => void;
}) {
  const { t, language } = useI18n();
  const { data, update, remove, links, tags, tagAssignments } = useWorkspace();
  const { upload, busy } = useUpload();
  const clearQuery = useClearQueryId();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(noFilters);
  const [layout, setLayout] = useStoredState<Layout>('explorer.layout', 'grid');
  const [sort, setSort] = useStoredState<Sort>('explorer.sort', 'updated');
  const [selected, setSelected] = useState<string | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);

  const inFolder = scope !== ALL && scope !== UNFILED;
  const scopeIds = useMemo(() => (inFolder ? descendants(data.folders, scope) : null), [data.folders, inFolder, scope]);

  const linkedNotes = useMemo(() => {
    const ids = new Set<string>();
    if (filters.links === 'any') return ids;
    for (const link of links) {
      if (link.source_type === 'note') ids.add(link.source_id);
      if (link.target_type === 'note') ids.add(link.target_id);
    }
    const titles = new Map(data.notes.map((note) => [note.title.trim().toLowerCase(), note.id]));
    for (const note of data.notes) {
      for (const title of wikiLinks(note.content)) {
        const target = titles.get(title);
        if (target) {
          ids.add(note.id);
          ids.add(target);
        }
      }
    }
    return ids;
  }, [data.notes, filters.links, links]);

  const entries = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = (text: string) => !term || text.toLowerCase().includes(term);
    const tagId = filters.tag !== NONE ? tags.find((tag) => tag.name === filters.tag)?.id : undefined;
    const tagged = tagId ? new Set(tagAssignments.filter((entry) => entry.tag_id === tagId).map((entry) => `${entry.entity_type}:${entry.entity_id}`)) : null;
    const since = filters.period === 'any' ? '' : new Date(Date.now() - Number(filters.period) * 86_400_000).toISOString();
    // Filters that only notes can answer hide everything else.
    const notesOnly = filters.author !== 'any' || filters.links !== 'any';
    const keep = (kind: 'note' | 'doc' | 'file', id: string, projectId: string | null, at: string) =>
      (filters.project === NONE || projectId === filters.project) && (!tagged || tagged.has(`${tagType[kind]}:${id}`)) && (!since || at >= since) && (kind === 'note' || !notesOnly);

    const list: Entry[] = [];
    if (view === 'all' || view === 'notes') {
      for (const note of data.notes) {
        if (scope === UNFILED ? note.folder_id : scopeIds && !(note.folder_id && scopeIds.has(note.folder_id))) continue;
        if (!matches(`${note.title} ${note.content ?? ''}`) || !keep('note', note.id, note.project_id, note.updated_at)) continue;
        if (filters.author !== 'any' && (note.source ?? 'app') !== filters.author) continue;
        if (filters.links !== 'any' && (filters.links === 'with') !== linkedNotes.has(note.id)) continue;
        list.push({ kind: 'note', key: `note:${note.id}`, id: note.id, title: note.title, at: note.updated_at, size: (note.content ?? '').length, projectId: note.project_id, pinned: note.pinned, note });
      }
    }
    if (view === 'all' || view === 'docs') {
      for (const doc of data.knowledge) {
        if (!matches(`${doc.title} ${doc.content ?? ''} ${doc.category ?? ''}`) || !keep('doc', doc.id, doc.project_id, doc.updated_at)) continue;
        list.push({ kind: 'doc', key: `doc:${doc.id}`, id: doc.id, title: doc.title, at: doc.updated_at, size: (doc.content ?? '').length, projectId: doc.project_id, pinned: false, doc });
      }
    }
    if (view === 'all' || view === 'files' || view === 'images') {
      for (const file of data.files) {
        if (view === 'images' && file.kind !== 'image') continue;
        if (!matches(`${file.name} ${file.description ?? ''}`) || !keep('file', file.id, file.project_id, file.updated_at)) continue;
        list.push({ kind: 'file', key: `file:${file.id}`, id: file.id, title: file.name, at: file.updated_at, size: file.size, projectId: file.project_id, pinned: false, file });
      }
    }
    list.sort((a, b) => Number(b.pinned) - Number(a.pinned)
      || (sort === 'name' ? (a.title || '￿').localeCompare(b.title || '￿') : sort === 'size' ? b.size - a.size : b.at.localeCompare(a.at)));

    // Sub-folders come first, like in a file manager (not while searching: results are flat).
    const folders: Entry[] = [];
    if (view === 'notes' && scope !== UNFILED && !term) {
      const parent = inFolder ? scope : null;
      for (const folder of sortFolders(data.folders.filter((entry) => (entry.parent_id ?? null) === parent))) {
        const inside = descendants(data.folders, folder.id);
        folders.push({ kind: 'folder', key: `folder:${folder.id}`, id: folder.id, title: folder.name, at: folder.updated_at, size: 0, projectId: null, pinned: folder.pinned, folder,
          count: data.notes.filter((note) => note.folder_id && inside.has(note.folder_id)).length });
      }
    }
    return [...folders, ...list];
  }, [data.files, data.folders, data.knowledge, data.notes, filters, inFolder, linkedNotes, query, scope, scopeIds, sort, tagAssignments, tags, view]);

  const fileEntries = useMemo(() => entries.flatMap((entry) => (entry.kind === 'file' ? [entry.file] : [])), [entries]);
  const current = entries.find((entry) => entry.key === selected) ?? null;
  const viewerIndex = viewer ? fileEntries.findIndex((file) => file.id === viewer) : -1;
  const activeFilters = (Object.keys(noFilters) as (keyof Filters)[]).filter((key) => filters[key] !== noFilters[key]).length;
  const count = entries.filter((entry) => entry.kind !== 'folder').length;

  function openEntry(entry: Entry) {
    if (entry.kind === 'folder') onSelectFolder(entry.id);
    else if (entry.kind === 'note') onOpenNote(entry.id);
    else if (entry.kind === 'doc') onOpenDocument(entry.doc);
    else setViewer(entry.id);
  }

  const pick = (entry: Entry) => (entry.kind === 'folder' ? onSelectFolder(entry.id) : setSelected(entry.key === selected ? null : entry.key));
  const folderTrail: Folder[] = [];
  for (let folder = data.folders.find((entry) => entry.id === scope); folder; folder = data.folders.find((entry) => entry.id === folder?.parent_id)) folderTrail.unshift(folder);
  const crumbs: { label: string; onClick?: () => void }[] = [
    { label: t('nav.explorer'), onClick: () => onSelectView('all') },
    ...(view !== 'all' ? [{ label: t(viewLabels[view]), onClick: () => onSelectView(view) }] : []),
    ...(scope === UNFILED ? [{ label: t('explorer.unfiled') }] : folderTrail.map((folder) => ({ label: folder.name, onClick: () => onSelectFolder(folder.id) }))),
  ];
  const projectOf = (id: string | null) => data.projects.find((project) => project.id === id)?.name;
  const metaOf = (entry: Entry) => (entry.kind === 'folder' ? t('explorer.entries', { count: entry.count })
    : entry.kind === 'file' ? `${formatBytes(entry.size)} · ${formatDateTime(entry.at, language)}`
    : `${entry.kind === 'doc' ? entry.doc.category || t('entities.knowledge') : projectOf(entry.projectId) ?? t('entities.note')} · ${formatDateTime(entry.at, language)}`);

  return (
    <DropZone onFiles={(list) => void upload(list)} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={cn('flex min-h-0 flex-1 flex-col gap-4 px-4 pb-3 pt-4 transition-[padding] duration-500 ease-ds lg:pl-2 lg:pr-6', current && 'xl:pr-[372px]')}>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <Button variant="ghost" size="icon" onClick={onToggleTree} aria-label={t('explorer.toggle')} aria-pressed={treeOpen} className="text-muted-foreground"><PanelLeft /></Button>
          <nav aria-label={t('ui.breadcrumbs')} className={cn('flex min-w-0 items-center gap-1.5 text-[13px]', fg2)}>
            {crumbs.map((crumb, index) => (
              <span key={index} className="flex min-w-0 items-center gap-1.5">
                {index > 0 && <span className="text-muted-foreground">/</span>}
                {index === crumbs.length - 1 ? <b className="truncate font-semibold text-foreground">{crumb.label}</b>
                  : <button type="button" onClick={crumb.onClick} className="truncate rounded-sm transition-colors duration-300 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring">{crumb.label}</button>}
              </span>
            ))}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder={t('explorer.filter')} className="sm:w-48" />
            <NoteFilters filters={filters} onChange={setFilters} active={activeFilters} />
            <Select value={sort} onValueChange={(value) => setSort(value as Sort)}>
              <SelectTrigger className="w-[9.5rem]" aria-label={t('filters.sortUpdated')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">{t('filters.sortUpdated')}</SelectItem>
                <SelectItem value="name">{t('files.sortName')}</SelectItem>
                <SelectItem value="size">{t('files.sortSize')}</SelectItem>
              </SelectContent>
            </Select>
            <Segmented value={layout} onChange={setLayout} label={t('explorer.layout')} options={[{ value: 'grid', label: t('explorer.grid') }, { value: 'list', label: t('explorer.list') }]} />
            <UploadButton onFiles={(list) => void upload(list)} busy={busy} variant="outline" />
            <Button onClick={onCreate}><Plus />{view === 'docs' ? t('knowledge.new') : t('notes.new')}</Button>
          </div>
        </div>

        <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2" onClick={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          {entries.length === 0 ? (
            <EmptyState icon={query || activeFilters ? Filter : LayoutGrid} className="mt-10"
              title={query || activeFilters ? t('explorer.noResults') : t('explorer.everythingEmpty')}
              description={query || activeFilters ? undefined : t('explorer.everythingEmptyDesc')}
              action={query || activeFilters ? <Button variant="outline" onClick={() => { setFilters(noFilters); setQuery(''); }}>{t('explorer.clearFilters')}</Button> : undefined} />
          ) : layout === 'grid' ? (
            // Only the cards on screen are rendered, however many entries there are.
            <VirtualList items={entries} keyOf={(entry) => entry.key} estimateSize={190} gap={6}
              columns={(width) => (width >= 1700 ? 7 : width >= 1400 ? 6 : width >= 1100 ? 5 : width >= 820 ? 4 : width >= 560 ? 3 : 2)}
              renderItem={(entry) => (
                <button type="button" draggable={entry.kind === 'note' || entry.kind === 'folder'} aria-pressed={entry.key === selected}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: entry.kind, id: entry.id }));
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onClick={() => pick(entry)} onDoubleClick={() => openEntry(entry)}
                  onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); openEntry(entry); } }}
                  className={cn('group flex w-full min-w-0 flex-col gap-2 rounded-[18px] p-2 text-left transition-[background-color,box-shadow] duration-300 ease-ds focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
                    entry.key === selected ? 'ds-glass' : 'hover:bg-accent')}>
                  <Thumb entry={entry} />
                  <span className="block min-w-0 px-1 pb-0.5">
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      <span className="truncate">{entry.title || t('common.untitled')}</span>
                      {entry.pinned && <Pin className="h-3 w-3 shrink-0 fill-current opacity-60" />}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{metaOf(entry)}</span>
                  </span>
                </button>
              )} />
          ) : (
            <VirtualList items={entries} keyOf={(entry) => entry.key} estimateSize={38} gap={2}
              renderItem={(entry) => {
                const badge = badgeOf(entry);
                return (
                  <button type="button" aria-pressed={entry.key === selected} onClick={() => pick(entry)} onDoubleClick={() => openEntry(entry)}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); openEntry(entry); } }}
                    className={cn('grid h-[38px] w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-full px-2.5 text-left text-[13px] transition-[background-color,box-shadow] duration-300 ease-ds focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring sm:grid-cols-[28px_minmax(0,1fr)_9rem_9rem]',
                      entry.key === selected ? 'ds-glass' : 'hover:bg-accent')}>
                    {entry.kind === 'folder' ? <FolderIcon className="mx-auto h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
                      : <span className={cn('flex h-6 w-6 items-center justify-center rounded-[7px] text-[7px] font-bold tracking-[0.02em] text-white', badge.className)}>{badge.label}</span>}
                    <span className="flex min-w-0 items-center gap-1.5 font-medium">
                      <span className="truncate">{entry.title || t('common.untitled')}</span>
                      {entry.pinned && <Pin className="h-3 w-3 shrink-0 fill-current opacity-60" />}
                    </span>
                    <span className={cn('hidden truncate text-xs sm:block', fg2)}>
                      {entry.kind === 'folder' ? t('explorer.entries', { count: entry.count }) : entry.kind === 'file' ? formatBytes(entry.size) : entry.kind === 'doc' ? entry.doc.category || t('entities.knowledge') : projectOf(entry.projectId) ?? t('entities.note')}
                    </span>
                    <span className={cn('font-mono text-[11px] tabular-nums', fg2)}>{formatDateTime(entry.at, language)}</span>
                  </button>
                );
              }} />
          )}
        </div>

        <div className="flex justify-between gap-4 text-[11px] text-muted-foreground">
          <span>{t('explorer.entries', { count })}</span>
          <span className="hidden sm:inline">{t('explorer.hint')}</span>
        </div>
      </div>

      <aside aria-label={t('explorer.preview')} aria-hidden={!current}
        className={cn('ds-menu fixed inset-x-3 bottom-20 top-16 z-30 flex flex-col overflow-y-auto rounded-[22px] transition-[transform,opacity] duration-500 ease-ds lg:absolute lg:inset-x-auto lg:bottom-3 lg:right-3 lg:top-3 lg:w-[340px]',
          current ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-[calc(100%+2rem)] opacity-0')}>
        {current && current.kind !== 'folder' && (
          <Preview key={current.key} entry={current} meta={metaOf(current)} project={projectOf(current.projectId)}
            onClose={() => { setSelected(null); clearQuery(); }} onOpen={() => openEntry(current)}
            onSaveFile={(patch) => void update('files', current.id, patch)}
            onDelete={() => { void remove(current.kind === 'note' ? 'notes' : current.kind === 'doc' ? 'knowledge' : 'files', current.id); setSelected(null); }}
            onTogglePin={() => current.kind === 'note' && void update('notes', current.id, { pinned: !current.note.pinned })} />
        )}
      </aside>

      <OpenFromQuery items={data.files} onOpen={(file) => setSelected(`file:${file.id}`)} />
      {viewerIndex >= 0 && (
        <PreviewOverlay file={fileEntries[viewerIndex]} onClose={() => setViewer(null)}
          onPrevious={viewerIndex > 0 ? () => setViewer(fileEntries[viewerIndex - 1].id) : undefined}
          onNext={viewerIndex < fileEntries.length - 1 ? () => setViewer(fileEntries[viewerIndex + 1].id) : undefined} />
      )}
    </DropZone>
  );
}

/** Thumbnail of an entry: the image itself, or a small sheet that hints at the kind of content. */
function Thumb({ entry, large }: { entry: Entry; large?: boolean }) {
  const badge = badgeOf(entry);
  const lift = 'transition-transform duration-300 ease-ds group-hover:-translate-y-0.5';
  const sheet = 'shadow-[0_2px_10px_rgba(0,0,0,.12)]';
  let body: React.ReactNode;
  if (entry.kind === 'folder') {
    // The 3D folder of the design system; its sheets rise on hover (see .f3d in globals.css).
    const sheetLines = Array.from({ length: 6 }, (_, index) => <i key={index} />);
    body = (
      <span className="f3d" aria-hidden="true">
        <span className="f-back" />
        {['c1', 'c2', 'c3'].map((name) => <span key={name} className={`f-card ${name}`}>{sheetLines}</span>)}
        <span className="f-flap" />
      </span>
    );
  } else if (entry.kind === 'file' && entry.file.kind === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    body = <img src={thumbnailUrl(entry.id, 640)} alt={entry.file.description ?? ''} loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" />;
  } else if (entry.kind === 'file' && entry.file.kind === 'spreadsheet') {
    body = (
      <span className={cn('grid h-[66%] w-[76%] grid-cols-4 overflow-hidden rounded-[4px] bg-white', sheet, lift)} style={{ gridAutoRows: '1fr' }}>
        {Array.from({ length: 20 }, (_, index) => <span key={index} className={cn('shadow-[inset_-1px_-1px_0_#E3E3E8]', index < 4 && 'bg-[#E8F3EC]')} />)}
      </span>
    );
  } else if (entry.kind === 'file' && entry.file.kind === 'presentation') {
    body = (
      <span className={cn('relative aspect-video w-[78%] overflow-hidden rounded-[4px] bg-white', sheet, lift)}>
        <span className="absolute left-[10%] top-[16%] h-[9%] w-[46%] rounded-[2px] bg-[#3A3A42]" />
        <span className="absolute left-[10%] top-[32%] h-[5%] w-[34%] rounded-[2px] bg-[#C8C8CE]" />
        <span className="absolute -bottom-[18%] right-[8%] aspect-square w-[42%] rounded-full bg-[#F3A15F]" />
      </span>
    );
  } else {
    // Notes and documents show their first lines; PDFs and Office files a neutral page.
    const content = entry.kind === 'note' ? entry.note.content : entry.kind === 'doc' ? entry.doc.content : null;
    const text = content ? markdownToPlainText(content.slice(0, large ? 1400 : 500)) : '';
    const dark = entry.kind === 'note';
    body = (
      <span className={cn('mt-[10%] flex h-[86%] flex-col self-start overflow-hidden rounded-t-[4px] px-[6%] pt-[7%]', large ? 'w-[70%]' : 'w-[58%]', sheet, lift, dark ? 'bg-[#1B1B1F] text-[#C9C9D0]' : 'bg-white text-[#3A3A42]')}>
        {entry.kind === 'file' ? (
          <span className="flex flex-col gap-[7px]">{[62, 100, 100, 70, 100, 100, 70].map((width, index) => (
            <span key={index} className={cn('rounded-[2px]', index === 0 ? 'h-[5px] bg-[#8E8E96]' : 'h-[3px] bg-[#DADADF]')} style={{ width: `${width}%` }} />
          ))}</span>
        ) : (
          <>
            <span className={cn('truncate font-semibold leading-tight', large ? 'text-[10px]' : 'text-[7px]')}>{entry.title}</span>
            <span className={cn('mt-1 whitespace-pre-line opacity-70', large ? 'text-[8px] leading-[1.6]' : 'text-[5.5px] leading-[1.6]')}>{text}</span>
          </>
        )}
      </span>
    );
  }
  return (
    <span className={cn('relative flex w-full items-center justify-center overflow-hidden bg-field', large ? 'aspect-[4/3] rounded-[14px]' : 'aspect-[4/3] rounded-xl')}>
      {body}
      {badge.label && <span className={cn('absolute bottom-2 left-2 rounded-[6px] px-1.5 py-0.5 text-[9px] font-semibold leading-[1.4] tracking-[0.04em] text-white', badge.className)}>{badge.label}</span>}
    </span>
  );
}

/** Details of the selected entry, floating on the right. Files keep their full editing form. */
function Preview({ entry, meta, project, onClose, onOpen, onSaveFile, onDelete, onTogglePin }: {
  entry: Exclude<Entry, { kind: 'folder' }>;
  meta: string;
  project: string | undefined;
  onClose: () => void;
  onOpen: () => void;
  onSaveFile: (patch: Partial<StoredFile>) => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  const { t, language } = useI18n();
  const { data } = useWorkspace();
  if (entry.kind === 'file') return <FileDetails file={entry.file} onPreview={onOpen} onClose={onClose} onSave={onSaveFile} onDelete={onDelete} />;

  const badge = badgeOf(entry);
  const content = entry.kind === 'note' ? entry.note.content : entry.doc.content;
  const words = markdownToPlainText(content).split(/\s+/).filter(Boolean).length;
  const folder = entry.kind === 'note' ? data.folders.find((item) => item.id === entry.note.folder_id)?.name : undefined;
  const rows: [string, React.ReactNode][] = [
    [t('explorer.kind'), entry.kind === 'note' ? t('entities.note') : t('entities.knowledge')],
    [t('explorer.length'), t('explorer.words', { count: words })],
    [t('common.updated'), formatDateTime(entry.at, language)],
    ...(entry.kind === 'note' ? [[t('relations.folder'), folder ?? t('relations.noFolder')] as [string, React.ReactNode]] : []),
    ...(entry.kind === 'doc' && entry.doc.category ? [[t('knowledge.category'), entry.doc.category] as [string, React.ReactNode]] : []),
    ...(project ? [[t('relations.project'), project] as [string, React.ReactNode]] : []),
    ...(entry.kind === 'note' && entry.note.source && entry.note.source !== 'app' ? [[t('explorer.author'), t(`explorer.author_${entry.note.source}`)] as [string, React.ReactNode]] : []),
  ];

  return (
    <div className="flex min-h-full flex-col gap-3.5 p-3">
      <div className="flex items-center gap-2 pl-1.5">
        <span className={cn('rounded-[6px] px-1.5 py-0.5 text-[9px] font-semibold leading-[1.4] tracking-[0.04em] text-white', badge.className)}>{badge.label}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" title={meta}>{entry.title || t('common.untitled')}</span>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('notes.close')}><X /></Button>
      </div>
      <button type="button" onClick={onOpen} className="group rounded-[14px] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring" aria-label={t('explorer.open')}>
        <Thumb entry={entry} large />
      </button>
      <dl className="px-1">
        {rows.map(([label, value], index) => (
          <div key={label} className={cn('flex justify-between gap-3 px-1 py-1.5 text-xs', index < rows.length - 1 && 'border-b')}>
            <dt className="shrink-0 text-muted-foreground">{label}</dt><dd className="truncate text-right">{value}</dd>
          </div>
        ))}
      </dl>
      <EntityTags type={entry.kind === 'note' ? 'note' : 'knowledge'} id={entry.id} className="px-2" limit={8} />
      <div className="mt-auto flex items-center gap-1.5">
        {entry.kind === 'note' && (
          <Button variant="outline" size="icon" onClick={onTogglePin} aria-pressed={entry.note.pinned} aria-label={entry.note.pinned ? t('explorer.unpinNote') : t('explorer.pinNote')}>
            <Pin className={cn(entry.note.pinned && 'fill-current')} />
          </Button>
        )}
        {entry.kind === 'doc' && entry.doc.source_url && (
          <Button variant="outline" size="icon" asChild><a href={entry.doc.source_url} target="_blank" rel="noreferrer noopener" aria-label={t('knowledge.source')}><ExternalLink /></a></Button>
        )}
        <ArchiveButton type={entry.kind === 'note' ? 'note' : 'knowledge'} id={entry.id} onArchived={onClose} />
        <DeleteButton name={entry.title || t('common.untitled')} onConfirm={onDelete} />
        <Button className="ml-auto flex-1" onClick={onOpen}>{t('explorer.open')}</Button>
      </div>
    </div>
  );
}

function NoteFilters({ filters, onChange, active }: { filters: Filters; onChange: (filters: Filters) => void; active: number }) {
  const { t } = useI18n();
  const { data, tags } = useWorkspace();
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => onChange({ ...filters, [key]: value });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Filter />{t('explorer.filters')}
          {active > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] tabular-nums text-primary-foreground">{active}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 p-4">
        <FilterSelect label={t('explorer.project')} value={filters.project} onChange={(value) => set('project', value)}
          options={[{ value: NONE, label: t('explorer.any') }, ...data.projects.map((project) => ({ value: project.id, label: project.name }))]} />
        <FilterSelect label={t('explorer.tag')} value={filters.tag} onChange={(value) => set('tag', value)}
          options={[{ value: NONE, label: t('explorer.any') }, ...tags.map((tag) => ({ value: tag.name, label: `#${tag.name}` }))]} />
        <FilterSelect label={t('explorer.period')} value={filters.period} onChange={(value) => set('period', value as Period)}
          options={[{ value: 'any', label: t('explorer.anyTime') }, { value: '7', label: t('explorer.last7') }, { value: '30', label: t('explorer.last30') }, { value: '365', label: t('explorer.last365') }]} />
        <FilterSelect label={t('explorer.author')} value={filters.author} onChange={(value) => set('author', value as Filters['author'])}
          options={[{ value: 'any', label: t('explorer.any') }, ...(['app', 'telegram', 'mcp'] as const).map((source) => ({ value: source, label: t(`explorer.author_${source}`) }))]} />
        <FilterSelect label={t('explorer.links')} value={filters.links} onChange={(value) => set('links', value as LinkFilter)}
          options={[{ value: 'any', label: t('explorer.any') }, { value: 'with', label: t('explorer.withLinks') }, { value: 'without', label: t('explorer.withoutLinks') }]} />
        {active > 0 && <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange(noFilters)}><X />{t('explorer.clearFilters')}</Button>}
      </PopoverContent>
    </Popover>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9" aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

// --- Tree: the kinds of content and the note folders ----------------------------------------------

function Tree({ scope, view, onSelectView, onSelectFolder, onCreateNote }: {
  scope: string;
  /** The view shown in the main pane, or null while a note is open. */
  view: View | null;
  onSelectView: (view: View) => void;
  onSelectFolder: (folder: string | null) => void;
  onCreateNote: (folderId: string | null) => void;
}) {
  const { t } = useI18n();
  const { data, create, update } = useWorkspace();
  const [expanded, setExpanded] = useStoredState<string[]>('notes.expanded', []);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);

  const counts = useMemo(() => {
    const direct = new Map<string, number>();
    for (const note of data.notes) if (note.folder_id) direct.set(note.folder_id, (direct.get(note.folder_id) ?? 0) + 1);
    const total = new Map<string, number>();
    for (const folder of data.folders) {
      let sum = 0;
      descendants(data.folders, folder.id).forEach((id) => { sum += direct.get(id) ?? 0; });
      total.set(folder.id, sum);
    }
    return total;
  }, [data.folders, data.notes]);

  // The current folder and the ones above it are expanded, so it is visible with its sub-folders.
  useEffect(() => {
    const path: string[] = [];
    let current = data.folders.find((folder) => folder.id === scope);
    while (current) {
      path.push(current.id);
      current = data.folders.find((folder) => folder.id === current?.parent_id);
    }
    if (path.some((id) => !expanded.includes(id))) setExpanded((list) => [...new Set([...list, ...path])]);
  }, [data.folders, expanded, scope, setExpanded]);

  const childrenOf = (parent: string | null) => sortFolders(data.folders.filter((folder) => (folder.parent_id ?? null) === parent));
  const toggle = (id: string) => setExpanded((list) => (list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id]));

  async function newFolder(parentId: string | null) {
    const folder = await create('folders', { name: t('explorer.newFolder'), parent_id: parentId, position: data.folders.length });
    if (!folder) return;
    if (parentId) setExpanded((list) => [...new Set([...list, parentId])]);
    setRenaming(folder.id);
  }

  function drop(event: React.DragEvent, folderId: string | null) {
    event.preventDefault();
    window.clearTimeout(hoverTimer.current);
    setDropTarget(null);
    try {
      const payload = JSON.parse(event.dataTransfer.getData(DRAG_TYPE)) as { kind: 'note' | 'folder'; id: string };
      if (payload.kind === 'note') void update('notes', payload.id, { folder_id: folderId });
      if (payload.kind === 'folder' && payload.id !== folderId && !(folderId && descendants(data.folders, payload.id).has(folderId))) {
        void update('folders', payload.id, { parent_id: folderId });
      }
      if (folderId) setExpanded((list) => [...new Set([...list, folderId])]);
    } catch { /* not one of ours */ }
  }

  const dropProps = (folderId: string | null, key: string) => ({
    onDragOver: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
      event.preventDefault();
      if (dropTarget !== key) {
        setDropTarget(key);
        // Hovering a closed folder while dragging opens it, like a file manager.
        window.clearTimeout(hoverTimer.current);
        if (folderId && !expanded.includes(folderId)) hoverTimer.current = window.setTimeout(() => setExpanded((list) => [...new Set([...list, folderId])]), 650);
      }
    },
    onDragLeave: () => setDropTarget((current) => (current === key ? null : current)),
    onDrop: (event: React.DragEvent) => drop(event, folderId),
  });

  const renderFolder = (folder: Folder, depth: number): React.ReactNode => {
    const children = childrenOf(folder.id);
    const open = expanded.includes(folder.id);
    return (
      <li key={folder.id}>
        <FolderRow
          folder={folder}
          depth={depth}
          count={counts.get(folder.id) ?? 0}
          active={scope === folder.id}
          open={open}
          hasChildren={children.length > 0}
          renaming={renaming === folder.id}
          dropActive={dropTarget === folder.id}
          dropProps={dropProps(folder.id, folder.id)}
          onToggle={() => toggle(folder.id)}
          onSelect={() => onSelectFolder(folder.id)}
          onRename={(name) => { setRenaming(null); if (name && name !== folder.name) void update('folders', folder.id, { name }); }}
          onStartRename={() => setRenaming(folder.id)}
          onNewSubfolder={() => void newFolder(folder.id)}
          onNewNote={() => onCreateNote(folder.id)}
          onDeleted={() => scope === folder.id && onSelectFolder(null)}
        />
        {open && children.length > 0 && <ul className="mt-0.5 space-y-0.5">{children.map((child) => renderFolder(child, depth + 1))}</ul>}
      </li>
    );
  };

  const images = data.files.filter((file) => file.kind === 'image').length;
  const kinds: { view: View; icon: typeof Inbox; count: number }[] = [
    { view: 'all', icon: LayoutGrid, count: data.notes.length + data.knowledge.length + data.files.length },
    { view: 'notes', icon: NotebookPen, count: data.notes.length },
    { view: 'docs', icon: BookOpen, count: data.knowledge.length },
    { view: 'files', icon: Paperclip, count: data.files.length },
    { view: 'images', icon: ImageIcon, count: images },
  ];
  const bytes = data.files.reduce((sum, file) => sum + file.size, 0);

  return (
    <div className="flex h-full max-h-[60vh] flex-col overflow-hidden px-3 pb-4 pt-4 lg:max-h-none lg:pl-5">
      <div className="flex items-center justify-between pb-3 pl-1.5 pr-0.5">
        <span className="text-[13px] font-semibold tracking-[-0.01em]">{t('explorer.title')}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={() => void newFolder(null)} aria-label={t('explorer.newFolder')}><FolderPlus /></Button>
          </TooltipTrigger>
          <TooltipContent>{t('explorer.newFolder')}</TooltipContent>
        </Tooltip>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <ul className="space-y-0.5">
          {kinds.map((kind) => (
            <TreeItem key={kind.view} icon={kind.icon} label={t(viewLabels[kind.view])} count={kind.count} active={view === kind.view && scope === ALL} onClick={() => onSelectView(kind.view)} />
          ))}
        </ul>

        <p className="ds-label px-1.5 pb-1.5 pt-5">{t('explorer.folders')}</p>
        <ul className="space-y-0.5">
          {childrenOf(null).map((folder) => renderFolder(folder, 0))}
          <TreeItem icon={Inbox} label={t('explorer.unfiled')} count={data.notes.filter((note) => !note.folder_id).length} active={scope === UNFILED}
            onClick={() => onSelectFolder(UNFILED)} dropActive={dropTarget === UNFILED} dropProps={dropProps(null, UNFILED)} />
        </ul>

        <p className="ds-label px-1.5 pb-1.5 pt-5">{t('explorer.views')}</p>
        <ul className="space-y-0.5">
          {([['/graph', Network, 'nav.graph'], ['/tags', Hash, 'nav.tags']] as const).map(([href, Icon, key]) => (
            <li key={href}>
              <Link href={href} className={cn('flex h-[26px] items-center gap-[7px] rounded-full pl-1.5 pr-2.5 text-[13px] transition-colors duration-300 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring', fg2)}>
                <span className="w-3" /><Icon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.6} />{t(key)}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex justify-between px-1.5 pt-3 text-[11px] text-muted-foreground">
        <span>{t('nav.files')}</span><span className="font-mono">{formatBytes(bytes)}</span>
      </div>
    </div>
  );
}

function TreeItem({ icon: Icon, label, count, active, onClick, dropActive, dropProps }: {
  icon: typeof Inbox;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  dropActive?: boolean;
  dropProps?: React.HTMLAttributes<HTMLButtonElement>;
}) {
  return (
    <li>
      <button type="button" data-tree-item onClick={onClick} aria-current={active ? 'true' : undefined} {...dropProps}
        className={cn('flex h-[26px] w-full items-center gap-[7px] rounded-full pl-1.5 pr-2.5 text-left text-[13px] transition-[background-color,color,box-shadow] duration-300 ease-ds focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
          active ? 'ds-glass font-medium text-foreground' : cn(fg2, 'hover:bg-accent hover:text-foreground'), dropActive && 'bg-info/10 text-foreground ring-1 ring-info')}>
        <span className="w-3 shrink-0" />
        <Icon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.6} />
        <span className="flex-1 truncate">{label}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{count}</span>
      </button>
    </li>
  );
}

function FolderRow({ folder, depth, count, active, open, hasChildren, renaming, dropActive, dropProps, onToggle, onSelect, onRename, onStartRename, onNewSubfolder, onNewNote, onDeleted }: {
  folder: Folder;
  depth: number;
  count: number;
  active: boolean;
  open: boolean;
  hasChildren: boolean;
  renaming: boolean;
  dropActive: boolean;
  dropProps: React.HTMLAttributes<HTMLDivElement>;
  onToggle: () => void;
  onSelect: () => void;
  onRename: (name: string) => void;
  onStartRename: () => void;
  onNewSubfolder: () => void;
  onNewNote: () => void;
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  const { update, remove, archive } = useWorkspace();
  const [menuOpen, setMenuOpen] = useState(false);
  const [name, setName] = useState(folder.name);
  useEffect(() => setName(folder.name), [folder.name, renaming]);
  const Icon = open ? FolderOpen : FolderIcon;

  return (
    <div
      {...dropProps}
      draggable={!renaming}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: 'folder', id: folder.id }));
        event.dataTransfer.effectAllowed = 'move';
      }}
      onContextMenu={(event) => { event.preventDefault(); setMenuOpen(true); }}
      className={cn(
        'group flex h-[26px] items-center gap-[3px] rounded-full pr-1 text-[13px] transition-[background-color,color,box-shadow] duration-300 ease-ds',
        active ? 'ds-glass font-medium text-foreground' : cn(fg2, 'hover:bg-accent hover:text-foreground'),
        dropActive && 'bg-info/10 text-foreground ring-1 ring-info',
      )}
      style={{ paddingLeft: `${depth * 14 + 2}px` }}
    >
      <button type="button" onClick={onToggle} aria-label={folder.name} aria-expanded={open}
        className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-foreground/10', !hasChildren && 'opacity-30')}>
        <ChevronRight className={cn('h-3 w-3 transition-transform duration-300 ease-ds', open && 'rotate-90')} />
      </button>
      {renaming ? (
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={() => onRename(name.trim())}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') { setName(folder.name); onRename(folder.name); }
          }}
          aria-label={t('explorer.folderName')}
          className="h-6 min-w-0 flex-1 rounded bg-field shadow-sm px-1.5 text-sm text-foreground outline-none ring-2 ring-ring/20"
        />
      ) : (
        <button type="button" data-tree-item onClick={onSelect} onDoubleClick={onStartRename} className="flex min-w-0 flex-1 items-center gap-[7px] text-left">
          <Icon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.6} />
          <span className="truncate">{folder.name}</span>
          {folder.pinned && <Pin className="h-3 w-3 shrink-0 opacity-60" />}
          {folder.favorite && <Star className="h-3 w-3 shrink-0 fill-current text-warning" />}
        </button>
      )}
      <span className="pr-1.5 font-mono text-[10px] text-muted-foreground group-hover:hidden">{count || ''}</span>
      <button type="button" onClick={onNewNote} aria-label={t('explorer.newNoteHere')}
        className="hidden h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-foreground/10 group-hover:flex">
        <Plus className="h-3.5 w-3.5" />
      </button>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={t('explorer.options', { name: folder.name })}
            className="hidden h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-foreground/10 group-hover:flex data-[state=open]:flex">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuLabel className="truncate">{folder.name}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={onNewNote}><Plus />{t('explorer.newNoteHere')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={onNewSubfolder}><FolderPlus />{t('explorer.newSubfolder')}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onStartRename}>{t('explorer.rename')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void update('folders', folder.id, { favorite: !folder.favorite })}>
            {folder.favorite ? <StarOff /> : <Star />}{folder.favorite ? t('explorer.unfavorite') : t('explorer.favorite')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void update('folders', folder.id, { pinned: !folder.pinned })}>
            {folder.pinned ? <PinOff /> : <Pin />}{folder.pinned ? t('explorer.unpin') : t('explorer.pin')}
          </DropdownMenuItem>
          {folder.parent_id && <DropdownMenuItem onSelect={() => void update('folders', folder.id, { parent_id: null })}>{t('explorer.moveTo')}: {t('explorer.root')}</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={async () => { if (await archive('folder', folder.id)) onDeleted(); }}>{t('archive.action')}</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={async () => {
            if (window.confirm(t('explorer.deleteFolderText', { name: folder.name })) && await remove('folders', folder.id)) onDeleted();
          }}>{t('common.delete')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// --- Editor (inline in the main pane) -----------------------------------------------------------

function folderOptions(folders: Folder[], parent: string | null = null, depth = 0): { folder: Folder; depth: number }[] {
  return sortFolders(folders.filter((folder) => (folder.parent_id ?? null) === parent))
    .flatMap((folder) => [{ folder, depth }, ...folderOptions(folders, folder.id, depth + 1)]);
}

function NoteEditor({ note, focus, onToggleFocus, beforeClose, onGone }: {
  note: Note;
  focus: boolean;
  onToggleFocus: () => void;
  beforeClose: MutableRefObject<(() => void) | undefined>;
  onGone: () => void;
}) {
  const { t, language } = useI18n();
  const { data, update, remove, setTags } = useWorkspace();
  const { upload } = useUpload();
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content ?? '');
  const [state, setState] = useState<'idle' | 'pending' | 'saving' | 'saved'>('idle');
  const tagNames = useEntityTags('note', note.id);
  const latest = useRef({ title, content, dirty: false });
  latest.current.title = title;
  latest.current.content = content;

  const save = useCallback(async () => {
    const { title: nextTitle, content: nextContent } = latest.current;
    latest.current.dirty = false;
    setState('saving');
    const saved = await update('notes', note.id, { title: nextTitle.trim(), content: nextContent });
    setState(saved ? 'saved' : 'idle');
  }, [note.id, update]);

  useEffect(() => {
    if (title === note.title && content === (note.content ?? '')) return;
    latest.current.dirty = true;
    setState('pending');
    const timeout = window.setTimeout(() => void save(), 600);
    return () => window.clearTimeout(timeout);
    // Only react to local edits; server echoes are handled by the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content]);

  // Closing the tab: delete notes that were never filled in, otherwise save.
  beforeClose.current = () => {
    const { title: lastTitle, content: lastContent, dirty } = latest.current;
    latest.current.dirty = false;
    if (!lastTitle.trim() && !lastContent.trim() && !tagNames.length && !note.project_id) void remove('notes', note.id);
    else if (dirty) void save();
  };

  // Switching tabs or leaving the page still writes pending edits.
  useEffect(() => () => {
    if (latest.current.dirty) void save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!focus) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onToggleFocus();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, onToggleFocus]);

  const busy = state === 'saving' || state === 'pending';
  const words = markdownToPlainText(content).split(/\s+/).filter(Boolean).length;

  return (
    <div className="flex min-h-full flex-col duration-200 animate-in fade-in">
      <div className="sticky top-0 z-10 flex items-center gap-1 border-b bg-background/90 px-3 py-1.5 backdrop-blur sm:px-5">
        <div className="mr-auto flex min-w-0 items-center gap-2 truncate text-xs text-muted-foreground">
          {busy ? <DotLoader size={14} className="text-muted-foreground" /> : <Check className="h-3.5 w-3.5 shrink-0 text-success" />}
          <span className="truncate">{busy ? t('common.saving') : `${t('common.updated')} ${formatDateTime(note.updated_at, language)}`}</span>
          <span className="hidden sm:inline">· {t('explorer.words', { count: words })}</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={() => void update('notes', note.id, { pinned: !note.pinned })}
              aria-label={note.pinned ? t('explorer.unpinNote') : t('explorer.pinNote')} aria-pressed={note.pinned}>
              <Pin className={cn(note.pinned && 'fill-current text-foreground')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{note.pinned ? t('explorer.unpinNote') : t('explorer.pinNote')}</TooltipContent>
        </Tooltip>
        <ArchiveButton type="note" id={note.id} onArchived={onGone} />
        <DeleteButton name={note.title || t('common.untitled')} onConfirm={() => { latest.current.dirty = false; void remove('notes', note.id); onGone(); }} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={onToggleFocus} aria-label={focus ? t('explorer.exitFocus') : t('explorer.focus')} aria-pressed={focus}>
              {focus ? <Minimize2 /> : <Maximize2 />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{focus ? t('explorer.exitFocus') : t('explorer.focus')}</TooltipContent>
        </Tooltip>
      </div>

      <div className={cn('mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pb-24 pt-10 sm:px-10 sm:pt-12', focus && 'max-w-[46rem] pt-16 sm:pt-24')}>
        <textarea
          value={title}
          rows={1}
          onChange={(event) => setTitle(event.target.value.replace(/\n/g, ''))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              (event.currentTarget.parentElement?.querySelector('.ProseMirror') as HTMLElement | null)?.focus();
            }
          }}
          placeholder={t('common.untitled')}
          aria-label={t('common.title')}
          autoFocus={!note.title}
          className="w-full resize-none bg-transparent text-3xl font-semibold leading-tight tracking-tight outline-none [field-sizing:content] placeholder:text-muted-foreground/40 sm:text-[40px]"
        />

        {!focus && (
          <div className="mt-5 grid gap-x-4 gap-y-2 border-y py-3 text-sm sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-center" aria-label={t('explorer.properties')}>
            <span className="text-xs font-medium text-muted-foreground">{t('relations.folder')}</span>
            <Select value={note.folder_id ?? NONE} onValueChange={(value) => void update('notes', note.id, { folder_id: value === NONE ? null : value })}>
              <SelectTrigger className="h-8 border-transparent bg-transparent px-2 shadow-none hover:bg-accent sm:max-w-xs" aria-label={t('relations.folder')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('relations.noFolder')}</SelectItem>
                {folderOptions(data.folders).map(({ folder, depth }) => (
                  <SelectItem key={folder.id} value={folder.id}><span style={{ paddingLeft: depth * 12 }}>{folder.name}</span></SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs font-medium text-muted-foreground">{t('relations.project')}</span>
            <ProjectSelect value={note.project_id} onChange={(projectId) => void update('notes', note.id, { project_id: projectId })}
              className="h-8 border-transparent bg-transparent px-2 shadow-none hover:bg-accent sm:max-w-xs" />
            <span className="text-xs font-medium text-muted-foreground">{t('relations.tags')}</span>
            <TagInput value={tagNames} onChange={(names) => void setTags('note', note.id, names)} className="min-h-8 border-transparent bg-transparent px-1 py-1 hover:bg-accent/50" />
          </div>
        )}

        <MarkdownEditor
          value={content}
          onChange={setContent}
          placeholder={t('notes.startWriting')}
          autoFocus={Boolean(note.title)}
          label={t('notes.title')}
          className="mt-8 flex-1 text-[17px] leading-8"
          onUploadImage={async (file) => {
            const [stored] = await upload([file], { attach: { type: 'note', id: note.id }, projectId: note.project_id });
            return stored ? fileUrl(stored.id) : null;
          }}
        />

        {!focus && <AttachmentsPanel type="note" id={note.id} projectId={note.project_id} className="mt-16 border-t pt-8" />}
        {!focus && <RelationsPanel type="note" id={note.id} className="mt-10 border-t pt-8" />}
      </div>
    </div>
  );
}
