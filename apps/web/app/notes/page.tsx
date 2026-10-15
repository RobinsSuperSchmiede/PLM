'use client';

import { useMemo, useState } from 'react';
import { FileText, NotebookPen, Plus, Search, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader, PageSkeleton, SearchInput } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import type { WorkspaceNote } from '@/lib/workspace-data';

export default function NotesPage() {
  const { data, updateData, loading } = useWorkspace();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(data.notes[0]?.id ?? null);

  const notes = useMemo(() => data.notes.filter((note) =>
    `${note.title} ${note.body}`.toLowerCase().includes(query.toLowerCase()),
  ), [data.notes, query]);
  const selected = notes.find((note) => note.id === selectedId) ?? notes[0] ?? null;

  function createNote() {
    const note: WorkspaceNote = { id: `note-${Date.now()}`, title: 'Untitled', body: '', updatedAt: 'Just now' };
    updateData((current) => ({ ...current, notes: [note, ...current.notes] }));
    setSelectedId(note.id);
  }

  function updateNote(noteId: string, changes: Partial<WorkspaceNote>) {
    updateData((current) => ({ ...current, notes: current.notes.map((note) => note.id === noteId ? { ...note, ...changes, updatedAt: 'Just now' } : note) }));
  }

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader title="Notes" description={`${data.notes.length} notes · simple local-first capture`} action={<Button size="sm" className="h-8 gap-1.5 text-xs" onClick={createNote}><Plus className="h-3.5 w-3.5" />New note</Button>} />
      <div className="grid min-h-[420px] overflow-hidden rounded-lg border border-border bg-card md:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="border-b border-border md:border-b-0 md:border-r" aria-label="Notes list">
          <div className="border-b border-border p-2.5">
            <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" /><SearchInput value={query} onChange={setQuery} placeholder="Search notes" /></div>
          </div>
          <div className="max-h-[240px] overflow-y-auto p-1.5 md:max-h-[520px]">
            {notes.map((note) => (
              <button key={note.id} onClick={() => setSelectedId(note.id)} aria-pressed={selected?.id === note.id} className={`w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent ${selected?.id === note.id ? 'bg-accent' : ''}`}>
                <span className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="truncate text-xs font-medium">{note.title || 'Untitled'}</span></span>
                <span className="mt-1 block truncate pl-[22px] text-[10px] text-muted-foreground">{note.body || 'No content yet'}</span>
                <span className="mt-1 block pl-[22px] text-[9px] text-muted-foreground">{note.updatedAt}</span>
              </button>
            ))}
          </div>
        </aside>
        <section className="flex min-h-[350px] flex-col">
          {selected ? (
            <>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><NotebookPen className="h-3.5 w-3.5" />{selected.updatedAt}</div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => { updateData((current) => ({ ...current, notes: current.notes.filter((note) => note.id !== selected.id) })); setSelectedId(null); }} aria-label="Delete note"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
              <label className="sr-only" htmlFor="note-title">Note title</label>
              <input id="note-title" value={selected.title} onChange={(event) => updateNote(selected.id, { title: event.target.value })} placeholder="Untitled" className="mx-5 mt-5 bg-transparent text-lg font-semibold tracking-tight outline-none placeholder:text-muted-foreground" />
              <label className="sr-only" htmlFor="note-body">Note content</label>
              <textarea id="note-body" value={selected.body} onChange={(event) => updateNote(selected.id, { body: event.target.value })} placeholder="Start writing…" className="mx-5 mb-5 mt-3 min-h-64 flex-1 resize-y bg-transparent text-sm leading-6 text-muted-foreground outline-none placeholder:text-muted-foreground/70" />
              <div className="border-t border-border px-5 py-2 text-[10px] text-muted-foreground">Plain text · Rich text editing can be added later</div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-5"><EmptyState title="No note selected" description={data.notes.length ? 'Choose a note from the list to view and edit it.' : 'Create a note to start capturing ideas.'} action={!data.notes.length && <Button size="sm" variant="outline" onClick={createNote}>Create a note</Button>} /></div>
          )}
        </section>
      </div>
    </div>
  );
}
