'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type MutableRefObject, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, ChevronRight, FileText, Filter, Folder as FolderIcon, FolderOpen, FolderPlus, Inbox, LayoutGrid, Maximize2, Minimize2, MoreHorizontal,
  NotebookPen, PanelLeft, Pin, PinOff, Plus, Star, StarOff, X,
} from 'lucide-react';

import { DotLoader } from '@/components/dot-loader';
import { AttachmentsPanel, fileUrl, useUpload } from '@/components/files';
import { useI18n } from '@/components/i18n-provider';
import { ArchiveButton, EntityTags, ProjectSelect, RelationsPanel, TagInput, useEntityTags } from '@/components/knowledge';
import { MarkdownEditor } from '@/components/markdown-editor';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DeleteButton, EmptyState, PageSkeleton, SearchInput } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { colorOf } from '@/lib/appearance';
import { formatDateTime } from '@/lib/dates';
import { wikiLinks } from '@/lib/entities';
import { markdownToPlainText } from '@/lib/markdown';
import type { Folder, Note, NoteSource } from '@/lib/types';
import { cn } from '@/lib/utils';

const ALL = 'all';
const UNFILED = 'unfiled';
const NONE = 'none';
const DRAG_TYPE = 'application/x-anamnesies';

type Period = 'any' | '7' | '30' | '365';
type LinkFilter = 'any' | 'with' | 'without';
type Filters = { project: string; tag: string; period: Period; author: 'any' | NoteSource; links: LinkFilter };
const noFilters: Filters = { project: NONE, tag: NONE, period: 'any', author: 'any', links: 'any' };

export default function NotesPage() {
  return <Suspense fallback={<div className="p-8"><PageSkeleton /></div>}><NotesWorkspace /></Suspense>;
}

function sortFolders(folders: Folder[]) {
  return [...folders].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.position - b.position || a.name.localeCompare(b.name));
}

function sortNotes(notes: Note[]) {
  return [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.title || '￿').localeCompare(b.title || '￿'));
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

function NotesWorkspace() {
  const { t } = useI18n();
  const { data, loading, create, remove, tagAssignments } = useWorkspace();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [explorerOpen, setExplorerOpen] = useStoredState('notes.explorer', true);
  // On phones the explorer is a panel above the content that opens on demand.
  const [mobileExplorer, setMobileExplorer] = useState(false);
  const [tabs, setTabs] = useStoredState<string[]>('notes.tabs', []);
  const [focus, setFocus] = useState(false);
  const activeId = searchParams.get('id');
  const scope = searchParams.get('folder') ?? ALL;
  // Set by the active editor: saves pending changes, or deletes the note if it was never filled in.
  const beforeClose = useRef<() => void>();

  const go = useCallback((params: { folder?: string | null; id?: string | null }) => {
    const next = new URLSearchParams();
    const folder = params.folder === undefined ? (scope === ALL ? null : scope) : params.folder;
    if (folder && folder !== ALL) next.set('folder', folder);
    if (params.id) next.set('id', params.id);
    const query = next.toString();
    router.replace(query ? `/notes?${query}` : '/notes', { scroll: false });
  }, [router, scope]);

  // Every note that is opened (link, search, explorer) gets a tab.
  useEffect(() => {
    if (activeId && !tabs.includes(activeId) && data.notes.some((note) => note.id === activeId)) setTabs((current) => [...current, activeId]);
  }, [activeId, data.notes, setTabs, tabs]);

  // Drop tabs of notes that were deleted or archived elsewhere.
  useEffect(() => {
    if (loading) return;
    const existing = new Set(data.notes.map((note) => note.id));
    if (tabs.some((id) => !existing.has(id))) setTabs((current) => current.filter((id) => existing.has(id)));
  }, [data.notes, loading, setTabs, tabs]);

  const open = useCallback((id: string) => go({ id }), [go]);

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
  const openTabs = tabs.map((id) => data.notes.find((note) => note.id === id)).filter((note): note is Note => Boolean(note));

  return (
    <div className={cn('grid lg:h-[calc(100vh-3.5rem)]', explorerOpen && !focus && 'lg:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[310px_minmax(0,1fr)]')}>
      {(explorerOpen || mobileExplorer) && !focus && (
        <aside className={cn('min-h-0 border-b bg-[hsl(var(--sidebar))]/60 lg:h-full lg:border-b-0 lg:border-r', mobileExplorer ? 'duration-200 animate-in fade-in slide-in-from-top-1' : 'hidden lg:block', !explorerOpen && 'lg:hidden')}
          onClick={(event) => { if ((event.target as HTMLElement).closest('li > button')) setMobileExplorer(false); }}>
          <Explorer scope={scope} activeId={activeId} onSelectFolder={(folder) => go({ folder, id: null })} onOpenNote={open} onCreateNote={(folderId) => void createNote(folderId)} />
        </aside>
      )}

      <section className={cn('flex min-h-[70vh] min-w-0 flex-col overflow-hidden lg:h-full lg:min-h-0', focus && 'fixed inset-0 z-50 bg-background duration-300 animate-in fade-in zoom-in-[0.99]')}>
        <div className="flex shrink-0 items-stretch border-b bg-[hsl(var(--sidebar))]/40">
          {!focus && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" onClick={() => { if (window.innerWidth < 1024) setMobileExplorer((value) => !value); else setExplorerOpen(!explorerOpen); }}
                  aria-label={t('explorer.toggle')} aria-pressed={explorerOpen}
                  className="flex shrink-0 items-center border-r px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                  <PanelLeft className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t('explorer.toggle')}</TooltipContent>
            </Tooltip>
          )}
          <div className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label={t('explorer.tabs')}>
            <TabButton active={!active} onClick={() => go({ id: null })} icon={LayoutGrid} label={t('explorer.overview')} />
            {openTabs.map((note) => (
              <TabButton key={note.id} active={note.id === activeId} onClick={() => open(note.id)} onClose={() => closeTab(note.id)}
                icon={FileText} label={note.title || t('common.untitled')} pinned={note.pinned} />
            ))}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={() => void createNote()} aria-label={t('notes.new')}
                className="flex shrink-0 items-center border-l px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <Plus className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('notes.new')}</TooltipContent>
          </Tooltip>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {active ? (
            <NoteEditor key={active.id} note={active} focus={focus} onToggleFocus={() => setFocus((value) => !value)} beforeClose={beforeClose}
              onGone={() => {
                setTabs((current) => current.filter((id) => id !== active.id));
                setFocus(false);
                go({ id: null });
              }} />
          ) : (
            <Overview scope={scope} onOpen={open} onCreate={() => void createNote()} />
          )}
        </div>
      </section>
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
        'group relative flex h-10 max-w-[13rem] shrink-0 cursor-pointer items-center gap-2 border-r px-3 text-sm transition-colors duration-200 animate-in fade-in slide-in-from-left-1',
        active ? 'bg-background text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
      )}
    >
      <span aria-hidden="true" className={cn('absolute inset-x-0 top-0 h-0.5 bg-info transition-transform duration-300 ease-[var(--ease-out)]', active ? 'scale-x-100' : 'scale-x-0')} />
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      {pinned && <Pin className="h-3 w-3 shrink-0 opacity-60" />}
      {onClose && (
        <button type="button" onClick={(event) => { event.stopPropagation(); onClose(); }} aria-label={`${t('explorer.closeTab')}: ${label}`}
          className={cn('-mr-1 rounded p-0.5 transition-opacity hover:bg-muted', active ? 'opacity-70' : 'opacity-0 group-hover:opacity-70')}>
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// --- Overview (all notes as cards, with filters) ------------------------------------------------

function Overview({ scope, onOpen, onCreate }: { scope: string; onOpen: (id: string) => void; onCreate: () => void }) {
  const { t, language } = useI18n();
  const { data, update, links, tags, tagAssignments } = useWorkspace();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(noFilters);

  const linkedNotes = useMemo(() => {
    const ids = new Set<string>();
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
  }, [data.notes, links]);

  const scopeIds = useMemo(() => (scope !== ALL && scope !== UNFILED ? descendants(data.folders, scope) : null), [data.folders, scope]);

  const notes = useMemo(() => {
    const term = query.trim().toLowerCase();
    const tagId = filters.tag !== NONE ? tags.find((tag) => tag.name === filters.tag)?.id : undefined;
    const tagged = tagId ? new Set(tagAssignments.filter((entry) => entry.tag_id === tagId && entry.entity_type === 'note').map((entry) => entry.entity_id)) : null;
    const since = filters.period === 'any' ? '' : new Date(Date.now() - Number(filters.period) * 86_400_000).toISOString();
    return data.notes
      .filter((note) => (scope === UNFILED ? !note.folder_id : scopeIds ? note.folder_id !== null && scopeIds.has(note.folder_id) : true))
      .filter((note) => !term || `${note.title} ${note.content ?? ''}`.toLowerCase().includes(term))
      .filter((note) => filters.project === NONE || note.project_id === filters.project)
      .filter((note) => !tagged || tagged.has(note.id))
      .filter((note) => !since || note.updated_at >= since)
      .filter((note) => filters.author === 'any' || (note.source ?? 'app') === filters.author)
      .filter((note) => filters.links === 'any' || (filters.links === 'with') === linkedNotes.has(note.id))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));
  }, [data.notes, filters, linkedNotes, query, scope, scopeIds, tagAssignments, tags]);

  // Render in pages so hundreds of notes stay fast.
  const [limit, setLimit] = useState(60);
  useEffect(() => setLimit(60), [query, filters, scope]);

  const activeFilters = (Object.keys(noFilters) as (keyof Filters)[]).filter((key) => filters[key] !== noFilters[key]).length;
  const folder = data.folders.find((entry) => entry.id === scope);
  const heading = scope === UNFILED ? t('explorer.unfiled') : folder?.name ?? t('explorer.allNotes');

  return (
    <div className="p-5 sm:p-6">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
          <p className="text-sm text-muted-foreground">{t('notes.description', { count: notes.length })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder={t('notes.search')} className="sm:w-72" />
          <NoteFilters filters={filters} onChange={setFilters} active={activeFilters} />
          <Button onClick={onCreate}><Plus />{t('notes.new')}</Button>
        </div>
      </div>

      {data.notes.length === 0 ? (
        <EmptyState icon={NotebookPen} title={t('notes.empty')} description={t('notes.emptyDesc')} action={<Button variant="outline" onClick={onCreate}><Plus />{t('notes.new')}</Button>} />
      ) : notes.length === 0 ? (
        <EmptyState icon={Filter} title={t('explorer.noResults')} action={activeFilters || query ? <Button variant="outline" onClick={() => { setFilters(noFilters); setQuery(''); }}>{t('explorer.clearFilters')}</Button> : undefined} />
      ) : (
        <>
          <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {notes.slice(0, limit).map((note) => <NoteCard key={note.id} note={note} language={language} onOpen={() => onOpen(note.id)} onTogglePin={() => void update('notes', note.id, { pinned: !note.pinned })} />)}
          </div>
          {notes.length > limit && (
            <div className="mt-6 flex justify-center"><Button variant="outline" onClick={() => setLimit(limit + 60)}>+{Math.min(60, notes.length - limit)}</Button></div>
          )}
        </>
      )}
    </div>
  );
}

function NoteCard({ note, language, onOpen, onTogglePin }: { note: Note; language: 'de' | 'en'; onOpen: () => void; onTogglePin: () => void }) {
  const { t } = useI18n();
  const { data } = useWorkspace();
  const preview = markdownToPlainText(note.content);
  const folder = data.folders.find((item) => item.id === note.folder_id);
  const project = data.projects.find((item) => item.id === note.project_id);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: 'note', id: note.id }));
        event.dataTransfer.effectAllowed = 'move';
      }}
      onClick={onOpen}
      onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && (event.preventDefault(), onOpen())}
      className="lazy-card group relative flex min-h-44 cursor-pointer flex-col rounded-xl border border-transparent bg-muted/30 p-4 text-left transition-colors duration-200 hover:border-border hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {(project || folder) && <span className="absolute left-0 top-4 h-6 w-[3px] rounded-r-full" style={{ background: colorOf(project?.name ?? folder?.name ?? '') }} aria-hidden="true" />}
      <div className="flex items-start gap-2">
        <span className="line-clamp-2 flex-1 font-semibold tracking-tight">{note.title || t('common.untitled')}</span>
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onTogglePin(); }}
          aria-label={note.pinned ? t('explorer.unpinNote') : t('explorer.pinNote')}
          className={cn('-mr-1 -mt-1 rounded-md p-1 text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground', note.pinned ? 'opacity-100' : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100')}
        >
          <Pin className={cn('h-4 w-4', note.pinned && 'fill-current text-foreground')} />
        </button>
      </div>
      <span className={cn('mt-2 line-clamp-4 flex-1 whitespace-pre-line text-sm leading-6 text-muted-foreground', !preview && 'italic opacity-70')}>
        {preview || t('notes.noContent')}
      </span>
      <EntityTags type="note" id={note.id} className="mt-3" limit={3} />
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {folder && <span className="inline-flex items-center gap-1"><FolderIcon className="h-3 w-3" />{folder.name}</span>}
        {project && <span className="inline-flex items-center gap-1 font-medium" style={{ color: colorOf(project.name) }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: colorOf(project.name) }} />{project.name}</span>}
        <span className="ml-auto">{formatDateTime(note.updated_at, language)}</span>
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

// --- Explorer: folders and notes as a file tree -------------------------------------------------

function Explorer({ scope, activeId, onSelectFolder, onOpenNote, onCreateNote }: {
  scope: string;
  activeId: string | null;
  onSelectFolder: (folder: string | null) => void;
  onOpenNote: (id: string) => void;
  onCreateNote: (folderId: string | null) => void;
}) {
  const { t } = useI18n();
  const { data, create, update } = useWorkspace();
  const [expanded, setExpanded] = useStoredState<string[]>('notes.expanded', []);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const hoverTimer = useRef<number>();

  const term = filter.trim().toLowerCase();
  const notesByFolder = useMemo(() => {
    const map = new Map<string | null, Note[]>();
    for (const note of data.notes) {
      if (term && !(note.title || '').toLowerCase().includes(term)) continue;
      const key = note.folder_id ?? null;
      map.set(key, [...(map.get(key) ?? []), note]);
    }
    for (const [key, list] of map) map.set(key, sortNotes(list));
    return map;
  }, [data.notes, term]);

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

  // The active note's folders are expanded so it is visible in the tree.
  useEffect(() => {
    const note = data.notes.find((entry) => entry.id === activeId);
    if (!note?.folder_id) return;
    const path: string[] = [];
    let current = data.folders.find((folder) => folder.id === note.folder_id);
    while (current) {
      path.push(current.id);
      current = data.folders.find((folder) => folder.id === current?.parent_id);
    }
    if (path.some((id) => !expanded.includes(id))) setExpanded((list) => [...new Set([...list, ...path])]);
  }, [activeId, data.folders, data.notes, expanded, setExpanded]);

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

  const pinnedNotes = data.notes.filter((note) => note.pinned).slice(0, 8);
  const favorites = sortFolders(data.folders.filter((folder) => folder.favorite));

  const renderNotes = (folderId: string | null, depth: number) => (notesByFolder.get(folderId) ?? []).map((note) => (
    <NoteRow key={note.id} note={note} depth={depth} active={note.id === activeId} onOpen={() => onOpenNote(note.id)} />
  ));

  const renderFolder = (folder: Folder, depth: number): React.ReactNode => {
    const children = childrenOf(folder.id);
    const open = expanded.includes(folder.id) || Boolean(term);
    const hasContent = children.length > 0 || (notesByFolder.get(folder.id)?.length ?? 0) > 0;
    if (term && !hasContent && !folder.name.toLowerCase().includes(term)) return null;
    return (
      <li key={folder.id}>
        <FolderRow
          folder={folder}
          depth={depth}
          count={counts.get(folder.id) ?? 0}
          active={scope === folder.id}
          open={open}
          hasChildren={hasContent}
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
        <div className={cn('grid transition-[grid-template-rows] duration-200 ease-[var(--ease-out)]', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
          <ul className="overflow-hidden">
            {open && (
              <>
                {children.map((child) => renderFolder(child, depth + 1))}
                {renderNotes(folder.id, depth + 1)}
                {!hasContent && <li className="py-1 text-xs italic text-muted-foreground" style={{ paddingLeft: (depth + 1) * 14 + 30 }}>{t('explorer.empty')}</li>}
              </>
            )}
          </ul>
        </div>
      </li>
    );
  };

  return (
    <div className="flex h-full max-h-[60vh] flex-col overflow-hidden lg:max-h-none">
      <div className="flex items-center gap-1 border-b px-3 py-2">
        <p className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('explorer.title')}</p>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={() => void newFolder(null)} aria-label={t('explorer.newFolder')}><FolderPlus /></Button>
          </TooltipTrigger>
          <TooltipContent>{t('explorer.newFolder')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={() => onCreateNote(null)} aria-label={t('notes.new')}><Plus /></Button>
          </TooltipTrigger>
          <TooltipContent>{t('notes.new')}</TooltipContent>
        </Tooltip>
      </div>
      <div className="border-b p-2">
        <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t('explorer.filterTree')} aria-label={t('explorer.filterTree')}
          className="h-8 w-full rounded-md bg-muted/60 px-2.5 text-sm outline-none ring-ring/20 transition-shadow placeholder:text-muted-foreground focus:ring-2" />
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-2">
        <ul className="space-y-0.5">
          <ScopeRow icon={NotebookPen} label={t('explorer.allNotes')} count={data.notes.length} active={scope === ALL} onClick={() => onSelectFolder(null)} />
          <ScopeRow icon={Inbox} label={t('explorer.unfiled')} count={data.notes.filter((note) => !note.folder_id).length} active={scope === UNFILED}
            onClick={() => onSelectFolder(UNFILED)} dropActive={dropTarget === UNFILED} dropProps={dropProps(null, UNFILED)} />
        </ul>

        {!term && pinnedNotes.length > 0 && (
          <ExplorerSection title={t('explorer.pinned')}>
            {pinnedNotes.map((note) => <NoteRow key={note.id} note={note} depth={0} active={note.id === activeId} onOpen={() => onOpenNote(note.id)} />)}
          </ExplorerSection>
        )}

        {!term && favorites.length > 0 && (
          <ExplorerSection title={t('explorer.favorites')}>
            {favorites.map((folder) => (
              <ScopeRow key={folder.id} icon={Star} label={folder.name} count={counts.get(folder.id) ?? 0} active={scope === folder.id} onClick={() => onSelectFolder(folder.id)} />
            ))}
          </ExplorerSection>
        )}

        <ExplorerSection title={t('explorer.folders')}>
          {childrenOf(null).map((folder) => renderFolder(folder, 0))}
          {renderNotes(null, 0)}
        </ExplorerSection>
      </div>
      <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">{t('explorer.dragHint')}</p>
    </div>
  );
}

function ExplorerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="space-y-px">{children}</ul>
    </div>
  );
}

function NoteRow({ note, depth, active, onOpen }: { note: Note; depth: number; active: boolean; onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <li>
      <button
        type="button"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: 'note', id: note.id }));
          event.dataTransfer.effectAllowed = 'move';
        }}
        onClick={onOpen}
        className={cn(
          'relative flex h-7 w-full items-center gap-2 rounded-md pr-2 text-left text-[13px] transition-colors duration-150',
          active ? 'bg-info/10 font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
        )}
        style={{ paddingLeft: depth * 14 + 30 }}
      >
        {active && <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-info" aria-hidden="true" />}
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{note.title || t('common.untitled')}</span>
        {note.pinned && <Pin className="ml-auto h-3 w-3 shrink-0 opacity-60" />}
      </button>
    </li>
  );
}

function ScopeRow({ icon: Icon, label, count, active, onClick, dropActive, dropProps }: {
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
      <button
        type="button"
        onClick={onClick}
        {...dropProps}
        className={cn(
          'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors',
          active ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
          dropActive && 'bg-info/10 ring-1 ring-info',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
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
        'group flex h-8 items-center gap-1 rounded-md pr-1 text-sm transition-colors duration-150',
        active ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
        dropActive && 'bg-info/10 text-foreground ring-1 ring-info',
      )}
      style={{ paddingLeft: `${depth * 14 + 4}px` }}
    >
      <button type="button" onClick={onToggle} aria-label={folder.name} aria-expanded={open}
        className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-background', !hasChildren && 'opacity-30')}>
        <ChevronRight className={cn('h-3.5 w-3.5 transition-transform duration-200 ease-[var(--ease-out)]', open && 'rotate-90')} />
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
          className="h-6 min-w-0 flex-1 rounded border bg-background px-1.5 text-sm text-foreground outline-none ring-2 ring-ring/20"
        />
      ) : (
        <button type="button" onClick={() => { onToggle(); onSelect(); }} onDoubleClick={onStartRename} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <Icon className={cn('h-4 w-4 shrink-0 transition-colors', open && 'text-info')} />
          <span className="truncate">{folder.name}</span>
          {folder.pinned && <Pin className="h-3 w-3 shrink-0 opacity-60" />}
          {folder.favorite && <Star className="h-3 w-3 shrink-0 fill-current text-warning" />}
        </button>
      )}
      <span className="text-xs tabular-nums text-muted-foreground group-hover:hidden">{count || ''}</span>
      <button type="button" onClick={onNewNote} aria-label={t('explorer.newNoteHere')}
        className="hidden h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-background group-hover:flex">
        <Plus className="h-3.5 w-3.5" />
      </button>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={t('explorer.options', { name: folder.name })}
            className="hidden h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-background group-hover:flex data-[state=open]:flex">
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
        <p className="mr-auto flex min-w-0 items-center gap-2 truncate text-xs text-muted-foreground">
          {busy ? <DotLoader size={14} className="text-info" /> : <Check className="h-3.5 w-3.5 shrink-0 text-success" />}
          <span className="truncate">{busy ? t('common.saving') : `${t('common.updated')} ${formatDateTime(note.updated_at, language)}`}</span>
          <span className="hidden sm:inline">· {t('explorer.words', { count: words })}</span>
        </p>
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
          className="w-full resize-none bg-transparent text-3xl font-bold leading-tight tracking-tight outline-none [field-sizing:content] placeholder:text-muted-foreground/40 sm:text-[40px]"
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
