'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type MutableRefObject, type ReactNode, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight, ArrowUpRight, BookOpen, CalendarDays, Check, CheckSquare2, ChevronRight, Columns2, ExternalLink, FileText, Filter, Folder as FolderIcon, FolderKanban, FolderOpen,
  FolderPlus, Hash, History, Image as ImageIcon, Inbox, LayoutGrid, Lightbulb, ListTree, Maximize2, Minimize2, MoreHorizontal, Network, NotebookPen, PanelLeft, Paperclip, Pin,
  PinOff, Plus, Star, StarOff, Users, X,
} from 'lucide-react';

import { DotLoader } from '@/components/dot-loader';
import { EventDialog } from '@/components/event-dialog';
import { FileDetails } from '@/components/explorer/files-view';
import { ArticleDialog } from '@/components/explorer/knowledge-view';
import { AttachmentsPanel, DropZone, PreviewOverlay, UploadButton, fileUrl, thumbnailUrl, useUpload } from '@/components/files';
import { useI18n } from '@/components/i18n-provider';
import { IdeaDialog, ideaStatusKeys } from '@/components/idea-dialog';
import { ArchiveButton, EntityTags, ProjectSelect, RelationsPanel, TagInput, useEntityTags } from '@/components/knowledge';
import { MeetingDialog } from '@/components/meeting-dialog';
import { OpenFromQuery, useClearQueryId } from '@/components/open-from-query';
import { ProjectDialog } from '@/components/project-dialog';
import { TaskDialog, statusKeys as taskStatusKeys } from '@/components/task-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Segmented } from '@/components/ui/segmented';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { clamp, ResizeHandle } from '@/components/resize-handle';
import { DeleteButton, EmptyState, PageSkeleton, SearchInput } from '@/components/workspace-ui';
import { VirtualList } from '@/components/virtual-list';
import { useWorkspace } from '@/components/workspace-provider';
import { formatDate, formatDateTime, todayKey } from '@/lib/dates';
import { entityLabelKeys, wikiLinks } from '@/lib/entities';
import type { TranslationKey } from '@/lib/i18n';
import { markdownToPlainText } from '@/lib/markdown';
import type { CalendarEvent, Collections, EntityType, Folder, Idea, KnowledgeArticle, Meeting, Note, NoteSource, Project, ResourceName, StoredFile, Task } from '@/lib/types';
import { cn, formatBytes } from '@/lib/utils';

// TipTap is large: load the editor only when a page actually shows it.
const MarkdownEditor = dynamic(() => import('@/components/markdown-editor').then((module) => module.MarkdownEditor), {
  ssr: false,
  loading: () => <div className="min-h-[240px]" aria-hidden="true" />,
});

const ALL = 'all';
/** What the main pane shows: everything mixed, or one kind of content. */
const views = ['all', 'notes', 'docs', 'files', 'images', 'tasks', 'projects', 'meetings', 'events', 'ideas'] as const;
type View = typeof views[number];
const viewLabels: Record<View, TranslationKey> = {
  all: 'explorer.everything', notes: 'nav.notes', docs: 'nav.knowledge', files: 'nav.files', images: 'nav.images',
  tasks: 'nav.tasks', projects: 'nav.projects', meetings: 'nav.meetings', events: 'xp.events', ideas: 'nav.ideas',
};
/** The planning views also have a page of their own (board, calendar, ...). */
const viewPages: Partial<Record<View, string>> = { tasks: '/tasks', projects: '/projects', meetings: '/meetings', events: '/calendar', ideas: '/ideas' };
const UNFILED = 'unfiled';
/** Key of a new folder or note that is still waiting for its name. */
const DRAFT = 'draft';
const NONE = 'none';
const DRAG_TYPE = 'application/x-anamnesies';
/** Set as well when a note is dragged: types (unlike the data) can be read during dragover. */
const NOTE_DRAG_TYPE = 'application/x-anamnesies-note';
/** Width of the explorer tree and share of the left note in the split view: defaults and limits. */
const TREE_WIDTH = 248;
const TREE_MIN = 180;
const TREE_MAX = 520;
const SPLIT_MIN = 0.2;

function setDragPayload(event: React.DragEvent, payload: { kind: ItemKind | 'folder'; id: string }) {
  event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload));
  if (payload.kind === 'note') event.dataTransfer.setData(NOTE_DRAG_TYPE, payload.id);
  event.dataTransfer.effectAllowed = 'move';
}
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

/** Everything except folders can be filed in a folder. */
type ItemKind = 'note' | 'doc' | 'file' | 'task' | 'project' | 'meeting' | 'event' | 'idea';
const tagType: Record<ItemKind, EntityType> = { note: 'note', doc: 'knowledge', file: 'file', task: 'task', project: 'project', meeting: 'meeting', event: 'event', idea: 'idea' };
const resourceOfKind: Record<ItemKind, ResourceName> = { note: 'notes', doc: 'knowledge', file: 'files', task: 'tasks', project: 'projects', meeting: 'meetings', event: 'events', idea: 'ideas' };
const kindOfView: Partial<Record<View, ItemKind>> = { notes: 'note', docs: 'doc', files: 'file', images: 'file', tasks: 'task', projects: 'project', meetings: 'meeting', events: 'event', ideas: 'idea' };
const itemKinds = Object.keys(resourceOfKind) as ItemKind[];

/** Number of entries of every kind in each folder, sub-folders included. */
function useFolderCounts(data: Collections) {
  return useMemo(() => {
    const direct = new Map<string, number>();
    for (const kind of itemKinds) {
      for (const item of data[resourceOfKind[kind]] as { folder_id: string | null }[]) if (item.folder_id) direct.set(item.folder_id, (direct.get(item.folder_id) ?? 0) + 1);
    }
    const total = new Map<string, number>();
    for (const folder of data.folders) {
      let sum = 0;
      descendants(data.folders, folder.id).forEach((id) => { sum += direct.get(id) ?? 0; });
      total.set(folder.id, sum);
    }
    return total;
  }, [data]);
}

/** Files an entry in a folder (null: top level); a folder cannot be moved into itself. */
function useMove() {
  const { data, update } = useWorkspace();
  return useCallback((kind: ItemKind | 'folder', id: string, folderId: string | null) => {
    if (kind === 'folder') {
      if (id !== folderId && !(folderId && descendants(data.folders, id).has(folderId))) void update('folders', id, { parent_id: folderId });
    } else void update(resourceOfKind[kind], id, { folder_id: folderId } as never);
  }, [data.folders, update]);
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
  const [treeWidth, setTreeWidth] = useStoredState('notes.treeWidth', TREE_WIDTH);
  const [splitRatio, setSplitRatio] = useStoredState('notes.splitRatio', 0.5);
  // Starting point of a drag on a pane edge: tree width in pixels, or split share and container width.
  const resizeFrom = useRef({ value: 0, width: 1 });
  // On phones the tree is a panel above the content that opens on demand.
  const [mobileTree, setMobileTree] = useState(false);
  const [tabs, setTabs] = useStoredState<string[]>('notes.tabs', []);
  const [focus, setFocus] = useState(false);
  const [article, setArticle] = useState<KnowledgeArticle | 'new' | null>(null);
  const [previewFile, setPreviewFile] = useState<StoredFile | null>(null);
  const clearQuery = useClearQueryId();
  const activeId = searchParams.get('id');
  // Second note shown beside the active one (split view).
  const splitParam = searchParams.get('split');
  const splitId = activeId && splitParam !== activeId ? splitParam : null;
  const scope = searchParams.get('folder') ?? ALL;
  const viewParam = searchParams.get('view') as View | null;
  // A folder holds every kind of entry, so inside one the view is always "everything".
  const view: View = scope !== ALL ? 'all' : viewParam && views.includes(viewParam) ? viewParam : 'all';
  // Set by the active editor: saves pending changes, or deletes the note if it was never filled in.
  const beforeClose = useRef<(() => void) | undefined>(undefined);
  const splitBeforeClose = useRef<(() => void) | undefined>(undefined);

  const go = useCallback((params: { view?: View; folder?: string | null; id?: string | null; split?: string | null }) => {
    const next = new URLSearchParams();
    const folder = params.view ? null : params.folder === undefined ? (scope === ALL ? null : scope) : params.folder;
    // Leaving a folder (folder: null) lands on the top level; otherwise the current view stays.
    const nextView = params.view ?? (folder || params.folder === null ? 'all' : view);
    if (folder && folder !== ALL) next.set('folder', folder);
    else if (nextView !== 'all') next.set('view', nextView);
    const id = params.id === undefined ? activeId : params.id;
    if (id) next.set('id', id);
    // The split side stays while a note is open; it needs a different note on the left.
    const split = params.split === undefined ? splitId : params.split;
    if (id && split && split !== id) next.set('split', split);
    const query = next.toString();
    router.replace(query ? `/explorer?${query}` : '/explorer', { scroll: false });
  }, [activeId, router, scope, splitId, view]);

  // Every note that is opened (link, search, explorer, split view) gets a tab.
  useEffect(() => {
    for (const id of [activeId, splitId]) {
      if (id && !tabs.includes(id) && data.notes.some((note) => note.id === id)) setTabs((current) => (current.includes(id) ? current : [...current, id]));
    }
  }, [activeId, splitId, data.notes, setTabs, tabs]);

  // Drop tabs of notes that were deleted or archived elsewhere.
  useEffect(() => {
    if (loading) return;
    const existing = new Set(data.notes.map((note) => note.id));
    if (tabs.some((id) => !existing.has(id))) setTabs((current) => current.filter((id) => existing.has(id)));
  }, [data.notes, loading, setTabs, tabs]);

  const open = useCallback((id: string) => go({ id }), [go]);
  // Shows a note on the right; without an open note it simply opens.
  const openBeside = useCallback((id: string) => (activeId && activeId !== id ? go({ split: id }) : go({ id })), [activeId, go]);
  /** A note dropped on the editor: right half opens it beside, left half replaces the left note. */
  const dropNote = useCallback((id: string, side: DropSide) => {
    if (side === 'right') {
      if (id !== activeId) go({ split: id });
      else if (splitId) go({ id: splitId, split: activeId });
    } else if (id === splitId) {
      go({ id, split: activeId });
    } else if (id !== activeId) {
      go({ id });
    }
  }, [activeId, go, splitId]);
  const categories = useMemo(() => Array.from(new Set(data.knowledge.map((entry) => entry.category).filter(Boolean) as string[])).sort(), [data.knowledge]);

  function closeTab(id: string) {
    if (id === activeId) beforeClose.current?.();
    else if (id === splitId) splitBeforeClose.current?.();
    else {
      const note = data.notes.find((entry) => entry.id === id);
      if (isEmptyNote(note, tagAssignments.filter((entry) => entry.entity_id === id).length)) void remove('notes', id);
    }
    const index = tabs.indexOf(id);
    const rest = tabs.filter((entry) => entry !== id);
    setTabs(rest);
    if (id === activeId) {
      // With a split open, its note moves to the left instead of a random tab.
      if (splitId) go({ id: splitId, split: null });
      else go({ id: rest[Math.min(index, rest.length - 1)] ?? null });
    } else if (id === splitId) go({ split: null });
  }

  // Clicking the tab of the right-hand note swaps the sides.
  function selectTab(id: string) {
    if (id === splitId && activeId) go({ id, split: activeId });
    else go({ id });
  }

  async function createNote(folderId?: string | null, title = '') {
    const folder = folderId !== undefined ? folderId : scope !== ALL && scope !== UNFILED ? scope : null;
    const note = await create('notes', { title, content: '', folder_id: folder });
    if (note) open(note.id);
  }

  if (loading) return <div className="p-8"><PageSkeleton /></div>;

  const active = data.notes.find((note) => note.id === activeId) ?? null;
  const splitNote = active && splitId ? data.notes.find((note) => note.id === splitId) ?? null : null;
  // The stored list can hold an id twice (two windows writing it); every note gets one tab.
  const openTabs = [...new Set(tabs)].map((id) => data.notes.find((note) => note.id === id)).filter((note): note is Note => Boolean(note));
  const toggleTree = () => { if (window.innerWidth < 1024) setMobileTree((value) => !value); else setTreeOpen(!treeOpen); };
  const ratio = clamp(splitRatio, SPLIT_MIN, 1 - SPLIT_MIN);

  return (
    <div className="flex flex-col lg:h-[calc(100vh-3.5rem)] lg:flex-row">
      {(treeOpen || mobileTree) && !focus && (
        <aside className={cn('relative min-h-0 shrink-0 lg:h-full lg:w-[var(--tree-w)]', mobileTree ? 'duration-200 animate-in fade-in slide-in-from-top-1' : 'hidden lg:block', !treeOpen && 'lg:hidden')}
          style={{ '--tree-w': `${clamp(treeWidth, TREE_MIN, TREE_MAX)}px` } as React.CSSProperties}
          onClick={(event) => { if ((event.target as HTMLElement).closest('[data-tree-item]')) setMobileTree(false); }}>
          <Tree scope={scope} view={active ? null : view} openIds={[activeId, splitId]} onSelectView={(next) => go({ view: next, id: null })}
            onSelectFolder={(folder) => go({ folder, id: null })} onCreateNote={(folderId, title) => void createNote(folderId, title)}
            onOpenNote={open} onOpenBeside={openBeside} onOpenDocument={setArticle} onOpenFile={setPreviewFile} />
          <ResizeHandle className="-right-1 hidden lg:block"
            onResizeStart={() => { resizeFrom.current = { value: clamp(treeWidth, TREE_MIN, TREE_MAX), width: 1 }; }}
            onResize={(delta) => setTreeWidth(clamp(resizeFrom.current.value + delta, TREE_MIN, TREE_MAX))}
            onReset={() => setTreeWidth(TREE_WIDTH)} />
        </aside>
      )}

      <section className={cn('flex min-h-[70vh] min-w-0 flex-1 flex-col lg:h-full lg:min-h-0', focus && 'fixed inset-0 z-50 bg-background duration-300 animate-in fade-in zoom-in-[0.99]')}>
        {openTabs.length > 0 && !focus && (
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto px-4 pt-3 [scrollbar-width:none] lg:px-2" role="tablist" aria-label={t('explorer.tabs')}>
            {/* With a note open the overview's toolbar is gone, so the tree toggle sits here. */}
            {active && (
              <Button variant="ghost" size="icon-sm" onClick={toggleTree} aria-label={t('explorer.toggle')} title={t('explorer.toggle')} aria-pressed={treeOpen}
                className="shrink-0 text-muted-foreground"><PanelLeft /></Button>
            )}
            <TabButton active={!active} onClick={() => go({ id: null })} icon={LayoutGrid} label={t('explorer.overview')} />
            {openTabs.map((note) => (
              <TabButton key={note.id} dragId={note.id} active={note.id === activeId} secondary={note.id === splitNote?.id} onClick={() => selectTab(note.id)} onClose={() => closeTab(note.id)}
                onOpenBeside={note.id !== activeId && note.id !== splitNote?.id && active ? () => openBeside(note.id) : undefined}
                icon={FileText} label={note.title || t('common.untitled')} pinned={note.pinned} />
            ))}
          </div>
        )}

        {active ? (
          <SplitDropArea onDropNote={dropNote} className={cn('min-h-0 flex-1', splitNote ? 'flex flex-col lg:grid lg:divide-x' : 'overflow-y-auto')}
            style={splitNote ? { gridTemplateColumns: `minmax(0,${ratio}fr) minmax(0,${1 - ratio}fr)` } : undefined}>
            <div className={cn(splitNote && 'min-h-[60vh] min-w-0 overflow-y-auto lg:min-h-0')}>
              <NoteEditor key={active.id} note={active} focus={focus} compact={Boolean(splitNote)} onToggleFocus={() => setFocus((value) => !value)} beforeClose={beforeClose}
                actions={!splitNote && <SplitPicker activeId={active.id} tabIds={openTabs.map((note) => note.id)} onPick={openBeside} />}
                onGone={() => {
                  setTabs((current) => current.filter((id) => id !== active.id));
                  setFocus(false);
                  go(splitNote ? { id: splitNote.id, split: null } : { id: null });
                }} />
            </div>
            {splitNote && (
              // The border between both notes can be dragged; a double click splits them evenly again.
              <ResizeHandle className="hidden -translate-x-1/2 lg:block" style={{ left: `${ratio * 100}%` }}
                onResizeStart={(handle) => { resizeFrom.current = { value: ratio, width: handle.parentElement?.clientWidth || 1 }; }}
                onResize={(delta) => setSplitRatio(clamp(resizeFrom.current.value + delta / resizeFrom.current.width, SPLIT_MIN, 1 - SPLIT_MIN))}
                onReset={() => setSplitRatio(0.5)} />
            )}
            {splitNote && (
              <div className="min-h-[60vh] min-w-0 overflow-y-auto border-t lg:min-h-0 lg:border-t-0">
                <NoteEditor key={splitNote.id} note={splitNote} focus={focus} compact secondary onToggleFocus={() => setFocus((value) => !value)} beforeClose={splitBeforeClose}
                  actions={(
                    <>
                      <IconAction label={t('split.swap')} onClick={() => go({ id: splitNote.id, split: active.id })}><ArrowLeftRight /></IconAction>
                      <IconAction label={t('split.close')} onClick={() => { splitBeforeClose.current?.(); go({ split: null }); }}><X /></IconAction>
                    </>
                  )}
                  onGone={() => {
                    setTabs((current) => current.filter((id) => id !== splitNote.id));
                    go({ split: null });
                  }} />
              </div>
            )}
          </SplitDropArea>
        ) : (
          <Browser scope={scope} view={view} treeOpen={treeOpen} onToggleTree={toggleTree} onOpenNote={open} onOpenDocument={setArticle}
            onCreateNote={(title) => void createNote(undefined, title)} onCreateDocument={() => setArticle('new')}
            onSelectView={(next) => go({ view: next, id: null })} onSelectFolder={(folder) => go({ folder, id: null })} />
        )}
      </section>

      <OpenFromQuery items={data.knowledge} onOpen={setArticle} />
      {previewFile && <PreviewOverlay file={previewFile} onClose={() => setPreviewFile(null)} />}
      <ArticleDialog article={article} categories={categories} defaultFolderId={scope !== ALL && scope !== UNFILED ? scope : null} onClose={() => { setArticle(null); clearQuery(); }} />
    </div>
  );
}

type DropSide = 'left' | 'right';

/**
 * Editor area that takes notes dragged from the tree, the tabs, the overview or the split picker.
 * While a note is dragged over it, two halves appear: left = open here, right = open beside.
 * Listens in the capture phase so the editor itself does not insert the dragged note as text.
 */
function SplitDropArea({ onDropNote, className, style, children }: { onDropNote: (id: string, side: DropSide) => void; className?: string; style?: React.CSSProperties; children: ReactNode }) {
  const { t } = useI18n();
  const [side, setSide] = useState<DropSide | null>(null);

  // A drag that ends somewhere else (Escape, outside the window) must not leave the overlay behind.
  useEffect(() => {
    if (!side) return;
    const clear = () => setSide(null);
    window.addEventListener('dragend', clear);
    window.addEventListener('drop', clear);
    return () => {
      window.removeEventListener('dragend', clear);
      window.removeEventListener('drop', clear);
    };
  }, [side]);

  const sideOf = (event: React.DragEvent<HTMLDivElement>): DropSide => {
    const rect = event.currentTarget.getBoundingClientRect();
    // On narrow screens the split view is stacked, so the halves are top and bottom.
    const stacked = window.innerWidth < 1024;
    return (stacked ? event.clientY - rect.top > rect.height / 2 : event.clientX - rect.left > rect.width / 2) ? 'right' : 'left';
  };
  const isNote = (event: React.DragEvent) => event.dataTransfer.types.includes(NOTE_DRAG_TYPE);

  return (
    <div
      className={cn('relative', className)}
      style={style}
      onDragOverCapture={(event) => {
        if (!isNote(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const next = sideOf(event);
        setSide((current) => (current === next ? current : next));
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSide(null);
      }}
      onDropCapture={(event) => {
        if (!isNote(event)) return;
        event.preventDefault();
        event.stopPropagation();
        const target = sideOf(event);
        setSide(null);
        const id = event.dataTransfer.getData(NOTE_DRAG_TYPE);
        if (id) onDropNote(id, target);
      }}
    >
      {children}
      {side && (
        <div className="pointer-events-none absolute inset-0 z-20 grid grid-rows-2 gap-2 p-2 duration-150 animate-in fade-in lg:grid-cols-2 lg:grid-rows-1" aria-hidden="true">
          {(['left', 'right'] as const).map((half) => (
            <div key={half} className={cn('flex items-center justify-center rounded-2xl border-2 border-dashed transition-colors duration-150',
              side === half ? 'border-brand bg-brand/10' : 'border-border bg-background/50')}>
              <span className={cn('ds-glass flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-medium shadow-sm', side === half ? 'text-foreground' : 'text-muted-foreground')}>
                {half === 'right' ? <Columns2 className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                {half === 'right' ? t('split.dropRight') : t('split.dropLeft')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabButton({ active, secondary, onClick, onClose, onOpenBeside, icon: Icon, label, pinned, dragId }: {
  active: boolean;
  /** Note id: the tab can be dragged onto the editor to open the note on one side. */
  dragId?: string;
  /** Shown on the right side of the split view. */
  secondary?: boolean;
  onClick: () => void;
  onClose?: () => void;
  onOpenBeside?: () => void;
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
      draggable={Boolean(dragId)}
      onDragStart={dragId ? (event) => setDragPayload(event, { kind: 'note', id: dragId }) : undefined}
      onClick={onClick}
      onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && (event.preventDefault(), onClick())}
      onAuxClick={(event) => { if (event.button === 1 && onClose) { event.preventDefault(); onClose(); } }}
      // Shift-click opens the note on the right side.
      onClickCapture={(event) => { if (event.shiftKey && onOpenBeside) { event.preventDefault(); event.stopPropagation(); onOpenBeside(); } }}
      title={onOpenBeside ? `${label} · Shift: ${t('split.open')}` : label}
      className={cn(
        'group flex h-7 max-w-[13rem] shrink-0 cursor-pointer items-center gap-2 rounded-full px-3 text-[13px] transition-[background-color,color,box-shadow] duration-300 ease-ds animate-in fade-in slide-in-from-left-1 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
        active ? 'ds-glass font-medium text-foreground' : secondary ? 'bg-accent text-foreground ring-1 ring-border' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {secondary ? <Columns2 className="h-3.5 w-3.5 shrink-0" /> : <Icon className="h-3.5 w-3.5 shrink-0" />}
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

type Entry = { key: string; id: string; title: string; at: string; size: number; projectId: string | null; folderId: string | null; pinned: boolean } & (
  | { kind: 'folder'; folder: Folder; count: number }
  | { kind: 'note'; note: Note }
  | { kind: 'doc'; doc: KnowledgeArticle }
  | { kind: 'file'; file: StoredFile }
  | { kind: 'task'; task: Task }
  | { kind: 'project'; project: Project }
  | { kind: 'meeting'; meeting: Meeting }
  | { kind: 'event'; event: CalendarEvent }
  | { kind: 'idea'; idea: Idea });
type ItemEntry = Exclude<Entry, { kind: 'folder' }>;
type DialogState =
  | { kind: 'task'; item: Task | 'new' } | { kind: 'project'; item: Project | 'new' } | { kind: 'meeting'; item: Meeting | 'new' }
  | { kind: 'event'; item: CalendarEvent | 'new' } | { kind: 'idea'; item: Idea | 'new' } | null;
type Layout = 'grid' | 'list';
type Sort = 'updated' | 'name' | 'size';

/** Small type marker on a thumbnail, as in a file manager. */
function badgeOf(entry: Entry): { label: string; className: string } {
  if (entry.kind === 'folder') return { label: '', className: '' };
  if (entry.kind === 'note') return { label: 'MD', className: 'bg-foreground text-background' };
  if (entry.kind === 'doc') return { label: 'DOK', className: 'bg-[#0E7C86]' };
  if (entry.kind === 'task') return { label: 'TODO', className: entry.task.status === 'done' ? 'bg-[#6B6B73]' : 'bg-[#2E7D5B]' };
  if (entry.kind === 'project') return { label: 'PRJ', className: 'bg-[#A2452E]' };
  if (entry.kind === 'meeting') return { label: 'MEET', className: 'bg-[#5B53C9]' };
  if (entry.kind === 'event') return { label: 'CAL', className: 'bg-[#B07A12]' };
  if (entry.kind === 'idea') return { label: 'IDEE', className: 'bg-[#8A7A0C]' };
  return {
    image: { label: 'IMG', className: 'bg-black/55' },
    pdf: { label: 'PDF', className: 'bg-[#C8331F]' },
    document: { label: 'DOC', className: 'bg-[#2558D9]' },
    spreadsheet: { label: 'XLS', className: 'bg-[#16784A]' },
    presentation: { label: 'PPT', className: 'bg-[#B8551A]' },
  }[entry.file.kind];
}

/** The text of an entry: what the thumbnail shows and what the filter searches. */
function bodyOf(entry: ItemEntry): string {
  switch (entry.kind) {
    case 'note': return entry.note.content ?? '';
    case 'doc': return entry.doc.content ?? '';
    case 'file': return entry.file.description ?? '';
    case 'task': return entry.task.description ?? '';
    case 'project': return entry.project.description ?? '';
    case 'meeting': return [entry.meeting.attendees, entry.meeting.agenda, entry.meeting.notes].filter(Boolean).join('\n\n');
    case 'event': return [entry.event.location, entry.event.description].filter(Boolean).join('\n\n');
    case 'idea': return entry.idea.description ?? '';
  }
}

function Browser({ scope, view, treeOpen, onToggleTree, onOpenNote, onOpenDocument, onCreateNote, onCreateDocument, onSelectView, onSelectFolder }: {
  scope: string;
  view: View;
  treeOpen: boolean;
  onToggleTree: () => void;
  onOpenNote: (id: string) => void;
  onOpenDocument: (doc: KnowledgeArticle) => void;
  onCreateNote: (title: string) => void;
  onCreateDocument: () => void;
  onSelectView: (view: View) => void;
  onSelectFolder: (folder: string | null) => void;
}) {
  const { t, language } = useI18n();
  const { data, create, update, remove, links, tags, tagAssignments } = useWorkspace();
  const { upload, busy } = useUpload();
  const clearQuery = useClearQueryId();
  const router = useRouter();
  const move = useMove();
  const folderCounts = useFolderCounts(data);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dropFolder, setDropFolder] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(noFilters);
  const [layout, setLayout] = useStoredState<Layout>('explorer.layout', 'grid');
  const [sort, setSort] = useStoredState<Sort>('explorer.sort', 'updated');
  const [selected, setSelected] = useState<string | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  // A new folder or note waits for its name, typed under its icon like in a file manager.
  const [draft, setDraft] = useState<'folder' | 'note' | null>(null);
  const activeFilters = (Object.keys(noFilters) as (keyof Filters)[]).filter((key) => filters[key] !== noFilters[key]).length;

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
    const keep = (kind: ItemKind, id: string, projectId: string | null, at: string) =>
      (filters.project === NONE || projectId === filters.project) && (!tagged || tagged.has(`${tagType[kind]}:${id}`)) && (!since || at >= since) && (kind === 'note' || !notesOnly);
    const known = new Set(data.folders.map((folder) => folder.id));
    // Like a file manager: a folder shows what lies directly in it and the top level what is not filed.
    // Searching and filtering look through everything below, and the views per kind list every entry.
    const flat = Boolean(term) || activeFilters > 0;
    const placed = (folderId: string | null) => {
      const folder = folderId && known.has(folderId) ? folderId : null;
      if (scope === UNFILED) return !folder;
      if (scopeIds) return Boolean(folder) && (flat ? scopeIds.has(folder as string) : folder === scope);
      return view !== 'all' || flat || !folder;
    };
    const wanted = (kind: ItemKind) => view === 'all' || kindOfView[view] === kind;

    const list: Entry[] = [];
    const add = (entry: ItemEntry) => {
      if (!placed(entry.folderId) || !matches(`${entry.title} ${bodyOf(entry)}`) || !keep(entry.kind, entry.id, entry.projectId, entry.at)) return;
      list.push(entry);
    };
    if (wanted('note')) {
      for (const note of data.notes) {
        if (filters.author !== 'any' && (note.source ?? 'app') !== filters.author) continue;
        if (filters.links !== 'any' && (filters.links === 'with') !== linkedNotes.has(note.id)) continue;
        add({ kind: 'note', key: `note:${note.id}`, id: note.id, title: note.title, at: note.updated_at, size: (note.content ?? '').length, projectId: note.project_id, folderId: note.folder_id, pinned: note.pinned, note });
      }
    }
    if (wanted('doc')) {
      for (const doc of data.knowledge) {
        add({ kind: 'doc', key: `doc:${doc.id}`, id: doc.id, title: doc.title, at: doc.updated_at, size: (doc.content ?? '').length, projectId: doc.project_id, folderId: doc.folder_id, pinned: false, doc });
      }
    }
    if (wanted('file')) {
      for (const file of data.files) {
        if (view === 'images' && file.kind !== 'image') continue;
        add({ kind: 'file', key: `file:${file.id}`, id: file.id, title: file.name, at: file.updated_at, size: file.size, projectId: file.project_id, folderId: file.folder_id, pinned: false, file });
      }
    }
    if (wanted('task')) {
      for (const task of data.tasks) add({ kind: 'task', key: `task:${task.id}`, id: task.id, title: task.title, at: task.updated_at, size: (task.description ?? '').length, projectId: task.project_id, folderId: task.folder_id, pinned: false, task });
    }
    if (wanted('project')) {
      for (const project of data.projects) add({ kind: 'project', key: `project:${project.id}`, id: project.id, title: project.name, at: project.updated_at, size: (project.description ?? '').length, projectId: project.id, folderId: project.folder_id, pinned: false, project });
    }
    if (wanted('meeting')) {
      for (const meeting of data.meetings) add({ kind: 'meeting', key: `meeting:${meeting.id}`, id: meeting.id, title: meeting.title, at: meeting.updated_at, size: (meeting.notes ?? meeting.agenda ?? '').length, projectId: meeting.project_id, folderId: meeting.folder_id, pinned: false, meeting });
    }
    if (wanted('event')) {
      for (const event of data.events) add({ kind: 'event', key: `event:${event.id}`, id: event.id, title: event.title, at: event.updated_at, size: (event.description ?? '').length, projectId: event.project_id, folderId: event.folder_id, pinned: false, event });
    }
    if (wanted('idea')) {
      for (const idea of data.ideas) add({ kind: 'idea', key: `idea:${idea.id}`, id: idea.id, title: idea.title, at: idea.updated_at, size: (idea.description ?? '').length, projectId: idea.project_id, folderId: idea.folder_id, pinned: false, idea });
    }
    list.sort((a, b) => Number(b.pinned) - Number(a.pinned)
      || (sort === 'name' ? (a.title || '\uffff').localeCompare(b.title || '\uffff') : sort === 'size' ? b.size - a.size : b.at.localeCompare(a.at)));

    // Sub-folders come first, like in a file manager (not while searching: results are flat).
    const folders: Entry[] = [];
    if (view === 'all' && scope !== UNFILED && !flat) {
      const parent = inFolder ? scope : null;
      for (const folder of sortFolders(data.folders.filter((entry) => (entry.parent_id ?? null) === parent))) {
        folders.push({ kind: 'folder', key: `folder:${folder.id}`, id: folder.id, title: folder.name, at: folder.updated_at, size: 0, projectId: null, folderId: folder.parent_id, pinned: folder.pinned, folder,
          count: folderCounts.get(folder.id) ?? 0 });
      }
    }
    return [...folders, ...list];
  }, [activeFilters, data, filters, folderCounts, inFolder, linkedNotes, query, scope, scopeIds, sort, tagAssignments, tags, view]);

  const fileEntries = useMemo(() => entries.flatMap((entry) => (entry.kind === 'file' ? [entry.file] : [])), [entries]);
  const current = entries.find((entry) => entry.key === selected) ?? null;
  const viewerIndex = viewer ? fileEntries.findIndex((file) => file.id === viewer) : -1;
  const count = entries.filter((entry) => entry.kind !== 'folder').length;
  const folderForNew = inFolder ? scope : null;

  function openEntry(entry: Entry) {
    if (entry.kind === 'folder') onSelectFolder(entry.id);
    else if (entry.kind === 'note') onOpenNote(entry.id);
    else if (entry.kind === 'doc') onOpenDocument(entry.doc);
    else if (entry.kind === 'file') setViewer(entry.id);
    else if (entry.kind === 'project') router.push(`/projects/${entry.id}`);
    else if (entry.kind === 'task') setDialog({ kind: 'task', item: entry.task });
    else if (entry.kind === 'meeting') setDialog({ kind: 'meeting', item: entry.meeting });
    else if (entry.kind === 'event') setDialog({ kind: 'event', item: entry.event });
    else setDialog({ kind: 'idea', item: entry.idea });
  }

  function commitDraft(name: string | null) {
    const kind = draft;
    setDraft(null);
    if (name === null || !kind) return;
    if (kind === 'folder') void create('folders', { name: name || t('explorer.newFolder'), parent_id: folderForNew, position: data.folders.length });
    else onCreateNote(name);
  }

  const draftEntry: Entry | null = !draft ? null : draft === 'folder'
    ? { kind: 'folder', key: DRAFT, id: DRAFT, title: '', at: '', size: 0, projectId: null, folderId: folderForNew, pinned: false, folder: { id: DRAFT, name: '' } as Folder, count: 0 }
    : { kind: 'note', key: DRAFT, id: DRAFT, title: '', at: '', size: 0, projectId: null, folderId: folderForNew, pinned: false, note: { id: DRAFT, title: '', content: '' } as Note };
  const shown = draftEntry ? [draftEntry, ...entries] : entries;
  const draftName = (className?: string) => (
    <NameInput initial={draft === 'folder' ? t('explorer.newFolder') : ''} placeholder={draft === 'folder' ? t('explorer.folderName') : t('common.untitled')}
      label={draft === 'folder' ? t('explorer.folderName') : t('common.title')} onDone={commitDraft} className={className} />
  );

  /** Folder tiles take dragged entries, like the folders in the tree. */
  const folderDrop = (entry: Entry) => (entry.kind !== 'folder' ? {} : {
    onDragOver: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
      event.preventDefault();
      setDropFolder(entry.id);
    },
    onDragLeave: () => setDropFolder((current) => (current === entry.id ? null : current)),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setDropFolder(null);
      try {
        const payload = JSON.parse(event.dataTransfer.getData(DRAG_TYPE)) as { kind: ItemKind | 'folder'; id: string };
        move(payload.kind, payload.id, entry.id);
      } catch { /* not one of ours */ }
    },
  });

  const pick = (entry: Entry) => (entry.kind === 'folder' ? onSelectFolder(entry.id) : setSelected(entry.key === selected ? null : entry.key));
  const folderTrail: Folder[] = [];
  for (let folder = data.folders.find((entry) => entry.id === scope); folder; folder = data.folders.find((entry) => entry.id === folder?.parent_id)) folderTrail.unshift(folder);
  const crumbs: { label: string; onClick?: () => void }[] = [
    { label: t('nav.explorer'), onClick: () => onSelectView('all') },
    ...(view !== 'all' ? [{ label: t(viewLabels[view]), onClick: () => onSelectView(view) }] : []),
    ...(scope === UNFILED ? [{ label: t('explorer.unfiled') }] : folderTrail.map((folder) => ({ label: folder.name, onClick: () => onSelectFolder(folder.id) }))),
  ];
  const projectOf = (id: string | null) => data.projects.find((project) => project.id === id)?.name;
  const when = (date: string, time: string | null) => `${formatDate(date, language, { day: 'numeric', month: 'short', year: 'numeric' })}${time ? ` · ${time}` : ''}`;
  /** The second line of an entry: what kind it is and the one fact that matters most for that kind. */
  const subOf = (entry: Entry): string => {
    switch (entry.kind) {
      case 'folder': return t('explorer.entries', { count: entry.count });
      case 'file': return formatBytes(entry.size);
      case 'doc': return entry.doc.category || t('entities.knowledge');
      case 'note': return projectOf(entry.projectId) ?? t('entities.note');
      case 'task': return `${t(taskStatusKeys[entry.task.status])}${entry.task.due_date ? ` · ${formatDate(entry.task.due_date, language)}` : ''}`;
      case 'project': return `${t('entities.project')} · ${t(`projects.${entry.project.status}`)}`;
      case 'meeting': return when(entry.meeting.date, entry.meeting.time);
      case 'event': return when(entry.event.date, entry.event.time);
      case 'idea': return `${t('entities.idea')} · ${t(ideaStatusKeys[entry.idea.status])}`;
    }
  };
  const dated = (entry: Entry) => entry.kind === 'meeting' || entry.kind === 'event';
  const metaOf = (entry: Entry) => (entry.kind === 'folder' || dated(entry) ? subOf(entry) : `${subOf(entry)} · ${formatDateTime(entry.at, language)}`);
  const page = viewPages[view];

  return (
    <DropZone onFiles={(list) => void upload(list)} className="flex min-h-0 flex-1 flex-col overflow-clip">
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
            {page && <Button variant="outline" asChild><Link href={page}><ArrowUpRight />{t('xp.fullPage')}</Link></Button>}
            <UploadButton onFiles={(list) => void upload(list)} busy={busy} variant="outline" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button><Plus />{t('xp.new')}</Button></DropdownMenuTrigger>
              {/* The name field of a new entry keeps the focus when the menu closes. */}
              <DropdownMenuContent align="end" className="w-48" onCloseAutoFocus={(event) => { if (draft) event.preventDefault(); }}>
                <DropdownMenuItem onSelect={() => setDraft('note')}><NotebookPen />{t('entities.note')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={onCreateDocument}><BookOpen />{t('entities.knowledge')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDialog({ kind: 'task', item: 'new' })}><CheckSquare2 />{t('entities.task')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDialog({ kind: 'project', item: 'new' })}><FolderKanban />{t('entities.project')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDialog({ kind: 'meeting', item: 'new' })}><Users />{t('entities.meeting')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDialog({ kind: 'event', item: 'new' })}><CalendarDays />{t('entities.event')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDialog({ kind: 'idea', item: 'new' })}><Lightbulb />{t('entities.idea')}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setDraft('folder')}><FolderPlus />{t('entities.folder')}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2" onClick={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          {shown.length === 0 ? (
            <EmptyState icon={query || activeFilters ? Filter : LayoutGrid} className="mt-10"
              title={query || activeFilters ? t('explorer.noResults') : t('explorer.everythingEmpty')}
              description={query || activeFilters ? undefined : t('explorer.everythingEmptyDesc')}
              action={query || activeFilters ? <Button variant="outline" onClick={() => { setFilters(noFilters); setQuery(''); }}>{t('explorer.clearFilters')}</Button> : undefined} />
          ) : layout === 'grid' ? (
            // Only the cards on screen are rendered, however many entries there are.
            <VirtualList items={shown} keyOf={(entry) => entry.key} estimateSize={190} gap={6}
              columns={(width) => (width >= 1700 ? 7 : width >= 1400 ? 6 : width >= 1100 ? 5 : width >= 820 ? 4 : width >= 560 ? 3 : 2)}
              renderItem={(entry) => entry.key === DRAFT ? (
                <div className="flex w-full min-w-0 flex-col gap-2 rounded-[18px] p-2 ds-glass">
                  <Thumb entry={entry} />
                  {draftName('h-6 text-xs font-medium')}
                </div>
              ) : (
                <button type="button" draggable aria-pressed={entry.key === selected} {...folderDrop(entry)}
                  onDragStart={(event) => {
                    setDragPayload(event, { kind: entry.kind, id: entry.id });
                  }}
                  onClick={() => pick(entry)} onDoubleClick={() => openEntry(entry)}
                  onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); openEntry(entry); } }}
                  className={cn('group flex w-full min-w-0 flex-col gap-2 rounded-[18px] p-2 text-left transition-[background-color,box-shadow] duration-300 ease-ds focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
                    entry.key === selected ? 'ds-glass' : 'hover:bg-accent', dropFolder === entry.id && 'bg-info/10 ring-1 ring-info')}>
                  <Thumb entry={entry} />
                  <span className="block min-w-0 px-1 pb-0.5">
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      <span className={cn('truncate', entry.kind === 'task' && entry.task.status === 'done' && 'text-muted-foreground line-through')}>{entry.title || t('common.untitled')}</span>
                      {entry.pinned && <Pin className="h-3 w-3 shrink-0 fill-current opacity-60" />}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{metaOf(entry)}</span>
                  </span>
                </button>
              )} />
          ) : (
            <VirtualList items={shown} keyOf={(entry) => entry.key} estimateSize={38} gap={2}
              renderItem={(entry) => {
                if (entry.key === DRAFT) {
                  return (
                    <div className="ds-glass grid h-[38px] w-full grid-cols-[28px_minmax(0,1fr)] items-center gap-3 rounded-full px-2.5">
                      {draft === 'folder' ? <FolderIcon className="mx-auto h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
                        : <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-foreground text-[7px] font-bold tracking-[0.02em] text-background">MD</span>}
                      {draftName('h-7 max-w-sm text-[13px] font-medium')}
                    </div>
                  );
                }
                const badge = badgeOf(entry);
                return (
                  <button type="button" draggable aria-pressed={entry.key === selected} onClick={() => pick(entry)} onDoubleClick={() => openEntry(entry)} {...folderDrop(entry)}
                    onDragStart={(event) => {
                      setDragPayload(event, { kind: entry.kind, id: entry.id });
                    }}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); openEntry(entry); } }}
                    className={cn('grid h-[38px] w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-full px-2.5 text-left text-[13px] transition-[background-color,box-shadow] duration-300 ease-ds focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring sm:grid-cols-[28px_minmax(0,1fr)_9rem_9rem]',
                      entry.key === selected ? 'ds-glass' : 'hover:bg-accent', dropFolder === entry.id && 'bg-info/10 ring-1 ring-info')}>
                    {entry.kind === 'folder' ? <FolderIcon className="mx-auto h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
                      : <span className={cn('flex h-6 w-6 items-center justify-center rounded-[7px] text-[7px] font-bold tracking-[0.02em] text-white', badge.className)}>{badge.label}</span>}
                    <span className="flex min-w-0 items-center gap-1.5 font-medium">
                      <span className="truncate">{entry.title || t('common.untitled')}</span>
                      {entry.pinned && <Pin className="h-3 w-3 shrink-0 fill-current opacity-60" />}
                    </span>
                    <span className={cn('hidden truncate text-xs sm:block', fg2)}>
                      {subOf(entry)}
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
          <Preview key={current.key} entry={current} meta={metaOf(current)} sub={subOf(current)} project={current.kind === 'project' ? undefined : projectOf(current.projectId)}
            onMove={(folderId) => move(current.kind, current.id, folderId)}
            onClose={() => { setSelected(null); clearQuery(); }} onOpen={() => openEntry(current)}
            onSaveFile={(patch) => void update('files', current.id, patch)}
            onDelete={() => { void remove(resourceOfKind[current.kind], current.id); setSelected(null); }}
            onTogglePin={() => current.kind === 'note' && void update('notes', current.id, { pinned: !current.note.pinned })} />
        )}
      </aside>

      <OpenFromQuery items={data.files} onOpen={(file) => setSelected(`file:${file.id}`)} />
      {viewerIndex >= 0 && (
        <PreviewOverlay file={fileEntries[viewerIndex]} onClose={() => setViewer(null)}
          onPrevious={viewerIndex > 0 ? () => setViewer(fileEntries[viewerIndex - 1].id) : undefined}
          onNext={viewerIndex < fileEntries.length - 1 ? () => setViewer(fileEntries[viewerIndex + 1].id) : undefined} />
      )}
      <TaskDialog task={dialog?.kind === 'task' ? dialog.item : null} onClose={() => setDialog(null)} defaultFolderId={folderForNew} />
      <ProjectDialog project={dialog?.kind === 'project' ? dialog.item : null} onClose={() => setDialog(null)} defaultFolderId={folderForNew} />
      <MeetingDialog meeting={dialog?.kind === 'meeting' ? dialog.item : null} onClose={() => setDialog(null)} defaultFolderId={folderForNew} />
      <EventDialog event={dialog?.kind === 'event' ? dialog.item : null} defaultDate={todayKey()} onClose={() => setDialog(null)} defaultFolderId={folderForNew} />
      <IdeaDialog idea={dialog?.kind === 'idea' ? dialog.item : null} onClose={() => setDialog(null)} defaultFolderId={folderForNew} />
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
    const content = entry.kind === 'file' ? null : bodyOf(entry);
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
function Preview({ entry, meta, sub, project, onClose, onOpen, onSaveFile, onDelete, onTogglePin, onMove }: {
  entry: ItemEntry;
  meta: string;
  sub: string;
  project: string | undefined;
  onClose: () => void;
  onOpen: () => void;
  onSaveFile: (patch: Partial<StoredFile>) => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onMove: (folderId: string | null) => void;
}) {
  const { t, language } = useI18n();
  const { data } = useWorkspace();
  const folderSelect = (
    <Select value={entry.folderId && data.folders.some((folder) => folder.id === entry.folderId) ? entry.folderId : NONE} onValueChange={(value) => onMove(value === NONE ? null : value)}>
      <SelectTrigger className="h-8 w-[11rem] text-xs" aria-label={t('relations.folder')}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{t('relations.noFolder')}</SelectItem>
        {folderOptions(data.folders).map(({ folder, depth }) => <SelectItem key={folder.id} value={folder.id}>{`${'  '.repeat(depth)}${folder.name}`}</SelectItem>)}
      </SelectContent>
    </Select>
  );
  if (entry.kind === 'file') {
    return (
      <>
        <FileDetails file={entry.file} onPreview={onOpen} onClose={onClose} onSave={onSaveFile} onDelete={onDelete} />
        <div className="flex items-center justify-between gap-3 px-4 pb-4 text-xs"><span className="text-muted-foreground">{t('relations.folder')}</span>{folderSelect}</div>
      </>
    );
  }

  const badge = badgeOf(entry);
  const text = entry.kind === 'note' || entry.kind === 'doc';
  const words = markdownToPlainText(bodyOf(entry)).split(/\s+/).filter(Boolean).length;
  const rows: [string, React.ReactNode][] = [
    [t('explorer.kind'), t(entityLabelKeys[tagType[entry.kind]])],
    ...(text ? [[t('explorer.length'), t('explorer.words', { count: words })] as [string, React.ReactNode]] : [[t('common.status'), sub] as [string, React.ReactNode]]),
    ...(entry.kind === 'task' ? [[t('tasks.dueDate'), entry.task.due_date ? formatDate(entry.task.due_date, language, { day: 'numeric', month: 'short', year: 'numeric' }) : t('tasks.noDue')] as [string, React.ReactNode]] : []),
    [t('common.updated'), formatDateTime(entry.at, language)],
    ...(entry.kind === 'doc' && entry.doc.category ? [[t('knowledge.category'), entry.doc.category] as [string, React.ReactNode]] : []),
    ...(project ? [[t('relations.project'), project] as [string, React.ReactNode]] : []),
    ...(entry.kind === 'note' && entry.note.source && entry.note.source !== 'app' ? [[t('explorer.author'), t(`explorer.author_${entry.note.source}`)] as [string, React.ReactNode]] : []),
    [t('relations.folder'), folderSelect],
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
          <div key={label} className={cn('flex min-h-8 items-center justify-between gap-3 px-1 py-1.5 text-xs', index < rows.length - 1 && 'border-b')}>
            <dt className="shrink-0 text-muted-foreground">{label}</dt><dd className="truncate text-right">{value}</dd>
          </div>
        ))}
      </dl>
      <EntityTags type={tagType[entry.kind]} id={entry.id} className="px-2" limit={8} />
      <div className="mt-auto flex items-center gap-1.5">
        {entry.kind === 'note' && (
          <Button variant="outline" size="icon" onClick={onTogglePin} aria-pressed={entry.note.pinned} aria-label={entry.note.pinned ? t('explorer.unpinNote') : t('explorer.pinNote')}>
            <Pin className={cn(entry.note.pinned && 'fill-current')} />
          </Button>
        )}
        {entry.kind === 'doc' && entry.doc.source_url && (
          <Button variant="outline" size="icon" asChild><a href={entry.doc.source_url} target="_blank" rel="noreferrer noopener" aria-label={t('knowledge.source')}><ExternalLink /></a></Button>
        )}
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground" asChild>
          <Link href={`/warehouse?type=${tagType[entry.kind]}&id=${entry.id}`} aria-label={t('xp.history')} title={t('xp.history')}><History /></Link>
        </Button>
        <ArchiveButton type={tagType[entry.kind]} id={entry.id} onArchived={onClose} />
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

function Tree({ scope, view, openIds, onSelectView, onSelectFolder, onCreateNote, onOpenNote, onOpenBeside, onOpenDocument, onOpenFile }: {
  scope: string;
  /** The view shown in the main pane, or null while a note is open. */
  view: View | null;
  /** Notes shown in the editor (left and right side). */
  openIds: (string | null)[];
  onSelectView: (view: View) => void;
  onSelectFolder: (folder: string | null) => void;
  onCreateNote: (folderId: string | null, title: string) => void;
  onOpenNote: (id: string) => void;
  onOpenBeside: (id: string) => void;
  onOpenDocument: (doc: KnowledgeArticle) => void;
  onOpenFile: (file: StoredFile) => void;
}) {
  const { t } = useI18n();
  const { data, create, update } = useWorkspace();
  // A new folder or note shows up as a row with a name field first; it is created once named.
  const [draft, setDraft] = useState<{ kind: 'folder' | 'note'; parentId: string | null } | null>(null);
  const move = useMove();
  const counts = useFolderCounts(data);
  const [expanded, setExpanded] = useStoredState<string[]>('notes.expanded', []);
  // Notes, documents and files are listed inside their folders, like a file manager.
  const [showFiles, setShowFiles] = useStoredState('notes.treeFiles', true);
  const [showAll, setShowAll] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);

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
  const filesByFolder = useMemo(() => {
    const result = new Map<string, TreeFile[]>();
    if (!showFiles) return result;
    const add = (folderId: string | null, entry: TreeFile) => {
      if (!folderId) return;
      const list = result.get(folderId);
      if (list) list.push(entry);
      else result.set(folderId, [entry]);
    };
    for (const note of data.notes) add(note.folder_id, { kind: 'note', id: note.id, title: note.title || t('common.untitled'), pinned: note.pinned, note });
    for (const doc of data.knowledge) add(doc.folder_id, { kind: 'doc', id: doc.id, title: doc.title || t('common.untitled'), pinned: false, doc });
    for (const file of data.files) add(file.folder_id, { kind: 'file', id: file.id, title: file.name, pinned: false, file });
    const order = { note: 0, doc: 1, file: 2 };
    result.forEach((list) => list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || order[a.kind] - order[b.kind] || a.title.localeCompare(b.title)));
    return result;
  }, [data.files, data.knowledge, data.notes, showFiles, t]);
  const toggle = (id: string) => setExpanded((list) => (list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id]));

  function startDraft(kind: 'folder' | 'note', parentId: string | null) {
    if (parentId) setExpanded((list) => [...new Set([...list, parentId])]);
    setDraft({ kind, parentId });
  }

  function commitDraft(name: string | null) {
    const current = draft;
    setDraft(null);
    if (name === null || !current) return;
    if (current.kind === 'folder') void create('folders', { name: name || t('explorer.newFolder'), parent_id: current.parentId, position: data.folders.length });
    else onCreateNote(current.parentId, name);
  }

  const draftRow = (depth: number) => draft && (
    <li className="flex h-[26px] items-center gap-[7px] pr-1" style={{ paddingLeft: `${depth * 14 + 2}px` }}>
      <span className="w-4 shrink-0" />
      {draft.kind === 'folder' ? <FolderIcon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.6} /> : <FileText className="h-[14px] w-[14px] shrink-0 opacity-80" strokeWidth={1.6} />}
      <NameInput initial={draft.kind === 'folder' ? t('explorer.newFolder') : ''} placeholder={draft.kind === 'folder' ? t('explorer.folderName') : t('common.untitled')}
        label={draft.kind === 'folder' ? t('explorer.folderName') : t('common.title')} onDone={commitDraft} className="h-6 text-[13px]" />
    </li>
  );

  function drop(event: React.DragEvent, folderId: string | null) {
    event.preventDefault();
    window.clearTimeout(hoverTimer.current);
    setDropTarget(null);
    try {
      const payload = JSON.parse(event.dataTransfer.getData(DRAG_TYPE)) as { kind: ItemKind | 'folder'; id: string };
      move(payload.kind, payload.id, folderId);
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
    const files = filesByFolder.get(folder.id) ?? [];
    const open = expanded.includes(folder.id);
    const limit = showAll.includes(folder.id) ? files.length : 25;
    return (
      <li key={folder.id}>
        <FolderRow
          folder={folder}
          depth={depth}
          count={counts.get(folder.id) ?? 0}
          active={scope === folder.id}
          open={open}
          hasChildren={children.length + files.length > 0 || draft?.parentId === folder.id}
          renaming={renaming === folder.id}
          dropActive={dropTarget === folder.id}
          dropProps={dropProps(folder.id, folder.id)}
          onToggle={() => toggle(folder.id)}
          onSelect={() => onSelectFolder(folder.id)}
          onRename={(name) => { setRenaming(null); if (name && name !== folder.name) void update('folders', folder.id, { name }); }}
          onStartRename={() => setRenaming(folder.id)}
          onNewSubfolder={() => startDraft('folder', folder.id)}
          onNewNote={() => startDraft('note', folder.id)}
          onDeleted={() => scope === folder.id && onSelectFolder(null)}
        />
        {open && (children.length + files.length > 0 || draft?.parentId === folder.id) && (
          <ul className="mt-0.5 space-y-0.5">
            {draft?.parentId === folder.id && draftRow(depth + 1)}
            {children.map((child) => renderFolder(child, depth + 1))}
            {files.slice(0, limit).map((entry) => (
              <FileRow key={`${entry.kind}:${entry.id}`} entry={entry} depth={depth + 1} active={openIds.includes(entry.id)}
                onOpen={() => (entry.kind === 'note' ? onOpenNote(entry.id) : entry.kind === 'doc' ? onOpenDocument(entry.doc) : onOpenFile(entry.file))}
                onOpenBeside={entry.kind === 'note' ? () => onOpenBeside(entry.id) : undefined} />
            ))}
            {files.length > limit && (
              <li>
                <button type="button" onClick={() => setShowAll((list) => [...list, folder.id])} style={{ paddingLeft: `${(depth + 1) * 14 + 24}px` }}
                  className="h-[24px] w-full rounded-full text-left text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground">
                  {t('split.more', { count: files.length - limit })}
                </button>
              </li>
            )}
          </ul>
        )}
      </li>
    );
  };

  const images = data.files.filter((file) => file.kind === 'image').length;
  const total = itemKinds.reduce((sum, kind) => sum + data[resourceOfKind[kind]].length, 0);
  const kinds: { view: View; icon: typeof Inbox; count: number }[] = [
    { view: 'notes', icon: NotebookPen, count: data.notes.length },
    { view: 'docs', icon: BookOpen, count: data.knowledge.length },
    { view: 'files', icon: Paperclip, count: data.files.length },
    { view: 'images', icon: ImageIcon, count: images },
  ];
  const planning: typeof kinds = [
    { view: 'tasks', icon: CheckSquare2, count: data.tasks.length },
    { view: 'projects', icon: FolderKanban, count: data.projects.length },
    { view: 'meetings', icon: Users, count: data.meetings.length },
    { view: 'events', icon: CalendarDays, count: data.events.length },
    { view: 'ideas', icon: Lightbulb, count: data.ideas.length },
  ];
  const bytes = data.files.reduce((sum, file) => sum + file.size, 0);

  return (
    <div className="flex h-full max-h-[60vh] flex-col overflow-hidden px-3 pb-4 pt-4 lg:max-h-none lg:pl-5">
      <div className="flex items-center justify-between pb-3 pl-1.5 pr-0.5">
        <span className="mr-auto text-[13px] font-semibold tracking-[-0.01em]">{t('explorer.title')}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" className={cn('text-muted-foreground', showFiles && 'text-foreground')} onClick={() => setShowFiles(!showFiles)}
              aria-pressed={showFiles} aria-label={showFiles ? t('split.hideFiles') : t('split.showFiles')}><ListTree /></Button>
          </TooltipTrigger>
          <TooltipContent>{showFiles ? t('split.hideFiles') : t('split.showFiles')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={() => startDraft('folder', null)} aria-label={t('explorer.newFolder')}><FolderPlus /></Button>
          </TooltipTrigger>
          <TooltipContent>{t('explorer.newFolder')}</TooltipContent>
        </Tooltip>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {/* The top level doubles as the place to drop entries that should leave their folder. */}
        <ul className="space-y-0.5">
          <TreeItem icon={LayoutGrid} label={t('explorer.everything')} count={total} active={view === 'all' && scope === ALL} onClick={() => onSelectView('all')}
            dropActive={dropTarget === UNFILED} dropProps={dropProps(null, UNFILED)} />
          {draft && draft.parentId === null && draftRow(1)}
          {childrenOf(null).map((folder) => renderFolder(folder, 1))}
        </ul>

        {([['xp.content', kinds], ['xp.planning', planning]] as const).map(([label, group]) => (
          <div key={label}>
            <p className="ds-label px-1.5 pb-1.5 pt-5">{t(label)}</p>
            <ul className="space-y-0.5">
              {group.map((kind) => (
                <TreeItem key={kind.view} icon={kind.icon} label={t(viewLabels[kind.view])} count={kind.count} active={view === kind.view && scope === ALL} onClick={() => onSelectView(kind.view)} />
              ))}
            </ul>
          </div>
        ))}

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

type TreeFile = { id: string; title: string; pinned: boolean } & (
  | { kind: 'note'; note: Note } | { kind: 'doc'; doc: KnowledgeArticle } | { kind: 'file'; file: StoredFile });

function FileRow({ entry, depth, active, onOpen, onOpenBeside }: { entry: TreeFile; depth: number; active: boolean; onOpen: () => void; onOpenBeside?: () => void }) {
  const { t } = useI18n();
  const Icon = entry.kind === 'note' ? FileText : entry.kind === 'doc' ? BookOpen : entry.file.kind === 'image' ? ImageIcon : Paperclip;
  return (
    <li
      draggable
      onDragStart={(event) => {
        setDragPayload(event, { kind: entry.kind, id: entry.id });
      }}
      className={cn('group flex h-[26px] items-center gap-[3px] rounded-full pr-1 text-[13px] transition-[background-color,color,box-shadow] duration-300 ease-ds',
        active ? 'ds-glass font-medium text-foreground' : cn(fg2, 'hover:bg-accent hover:text-foreground'))}
      style={{ paddingLeft: `${depth * 14 + 2}px` }}
    >
      <span className="w-4 shrink-0" />
      <button type="button" data-tree-item onClick={(event) => (event.shiftKey && onOpenBeside ? onOpenBeside() : onOpen())} title={entry.title}
        className="flex min-w-0 flex-1 items-center gap-[7px] text-left focus-visible:outline-none">
        <Icon className="h-[14px] w-[14px] shrink-0 opacity-80" strokeWidth={1.6} />
        <span className="truncate">{entry.title}</span>
        {entry.pinned && <Pin className="h-3 w-3 shrink-0 opacity-60" />}
      </button>
      {onOpenBeside && (
        <button type="button" data-tree-item onClick={onOpenBeside} aria-label={`${t('split.open')}: ${entry.title}`} title={t('split.open')}
          className="hidden h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-foreground/10 group-hover:flex">
          <Columns2 className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
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
        <DropdownMenuContent align="start" className="w-52" onCloseAutoFocus={(event) => event.preventDefault()}>
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

/**
 * Name field of a new folder or note, like in a file manager: focused with the text selected, Enter or
 * clicking elsewhere creates the entry, Escape drops it. `onDone(null)` means cancelled.
 */
function NameInput({ initial, placeholder, label, onDone, className }: {
  initial: string;
  placeholder: string;
  label: string;
  onDone: (name: string | null) => void;
  className?: string;
}) {
  const [value, setValue] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const shownAt = useRef(0);

  useEffect(() => {
    shownAt.current = Date.now();
    // After the menu that started it has closed and handed back the focus.
    const frame = window.requestAnimationFrame(() => { input.current?.focus(); input.current?.select(); });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };

  return (
    <input
      ref={input}
      value={value}
      placeholder={placeholder}
      aria-label={label}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') { event.preventDefault(); finish(value.trim()); }
        if (event.key === 'Escape') { event.preventDefault(); finish(null); }
      }}
      onBlur={() => {
        // A focus change right after it appeared (a closing menu) is not the user leaving the field.
        if (Date.now() - shownAt.current < 400) { window.setTimeout(() => input.current?.focus(), 0); return; }
        finish(value.trim());
      }}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn('w-full min-w-0 rounded-md bg-field px-1.5 text-foreground shadow-sm outline-none ring-2 ring-ring/30 placeholder:text-muted-foreground', className)}
    />
  );
}

// --- Editor (inline in the main pane) -----------------------------------------------------------

function folderOptions(folders: Folder[], parent: string | null = null, depth = 0): { folder: Folder; depth: number }[] {
  return sortFolders(folders.filter((folder) => (folder.parent_id ?? null) === parent))
    .flatMap((folder) => [{ folder, depth }, ...folderOptions(folders, folder.id, depth + 1)]);
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={onClick} aria-label={label}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Picks the note for the right side of the split view: an open tab or any note by title. */
function SplitPicker({ activeId, tabIds, onPick }: { activeId: string; tabIds: string[]; onPick: (id: string) => void }) {
  const { t } = useI18n();
  const { data } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  const tabs = tabIds.filter((id) => id !== activeId).map((id) => data.notes.find((note) => note.id === id)).filter((note): note is Note => Boolean(note));
  const results = term
    ? data.notes.filter((note) => note.id !== activeId && (note.title || '').toLowerCase().includes(term)).slice(0, 20)
    : [...data.notes].filter((note) => note.id !== activeId && !tabIds.includes(note.id)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 10);
  const pick = (id: string) => { setOpen(false); setQuery(''); onPick(id); };
  const item = (note: Note) => (
    <button key={note.id} type="button" onClick={() => pick(note.id)} draggable
      onDragStart={(event) => { setDragPayload(event, { kind: 'note', id: note.id }); window.setTimeout(() => setOpen(false), 0); }}
      className="flex w-full items-center gap-2 rounded-full px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none">
      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{note.title || t('common.untitled')}</span>
    </button>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={t('split.open')}><Columns2 /></Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('split.open')}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72 p-2">
        <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">{t('split.choose')}</p>
        <p className="px-2 pb-2 text-xs text-muted-foreground">{t('split.dragHint')}</p>
        <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('split.search')} aria-label={t('split.search')} className="h-8"
          onKeyDown={(event) => { if (event.key === 'Enter' && results[0]) pick(results[0].id); }} />
        <div className="mt-2 max-h-72 overflow-y-auto">
          {!term && tabs.length > 0 && (
            <>
              <p className="ds-label px-2 pb-1 pt-1">{t('split.openTabs')}</p>
              {tabs.map(item)}
              <p className="ds-label px-2 pb-1 pt-3">{t('split.all')}</p>
            </>
          )}
          {results.map(item)}
          {results.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">{t('split.none')}</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NoteEditor({ note, focus, compact, secondary, actions, onToggleFocus, beforeClose, onGone }: {
  note: Note;
  focus: boolean;
  /** Half-width layout for the split view. */
  compact?: boolean;
  /** Extra buttons in the toolbar (split view). */
  actions?: ReactNode;
  /** Right side of the split view: leaves Escape to the left editor, so focus mode is not toggled twice. */
  secondary?: boolean;
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
    if (!focus || secondary) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onToggleFocus();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, onToggleFocus, secondary]);

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
        {actions}
      </div>

      <div className={cn('mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pb-24 pt-10 sm:px-10 sm:pt-12', compact && 'px-5 pt-6 sm:px-8 sm:pt-8', focus && !compact && 'max-w-[46rem] pt-16 sm:pt-24')}>
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
          className={cn('w-full resize-none bg-transparent text-3xl font-semibold leading-tight tracking-tight outline-none [field-sizing:content] placeholder:text-muted-foreground/40', compact ? 'sm:text-[30px]' : 'sm:text-[40px]')}
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
          className={cn('mt-8 flex-1 leading-8', compact ? 'text-[15px] leading-7' : 'text-[17px]')}
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
