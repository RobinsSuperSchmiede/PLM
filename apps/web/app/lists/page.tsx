'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Check, ListChecks, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader, PageSkeleton, SearchInput } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import type { WorkspaceList } from '@/lib/workspace-data';

export default function ListsPage() {
  const { data, updateData, loading } = useWorkspace();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(data.lists[0]?.id ?? null);
  const [addingList, setAddingList] = useState(false);
  const [listTitle, setListTitle] = useState('');
  const [category, setCategory] = useState('');
  const [itemText, setItemText] = useState('');

  const lists = useMemo(() => data.lists.filter((list) =>
    `${list.title} ${list.category} ${list.items.map((item) => item.text).join(' ')}`.toLowerCase().includes(query.toLowerCase()),
  ), [data.lists, query]);
  const selected = lists.find((list) => list.id === selectedId) ?? lists[0] ?? null;

  function createList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = listTitle.trim();
    if (!trimmed) return;
    const list: WorkspaceList = { id: `list-${Date.now()}`, title: trimmed, category: category.trim() || 'Uncategorized', items: [] };
    updateData((current) => ({ ...current, lists: [list, ...current.lists] }));
    setSelectedId(list.id);
    setListTitle('');
    setCategory('');
    setAddingList(false);
  }

  function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = itemText.trim();
    if (!trimmed || !selected) return;
    const item = { id: `item-${Date.now()}`, text: trimmed, done: false };
    updateData((current) => ({ ...current, lists: current.lists.map((list) => list.id === selected.id ? { ...list, items: [...list.items, item] } : list) }));
    setItemText('');
  }

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader title="Lists" description="Organize checklists, ideas, and structured content." action={<Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setAddingList((value) => !value)}><Plus className="h-3.5 w-3.5" />New list</Button>} />
      {addingList && <form onSubmit={createList} className="mb-4 flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row"><label htmlFor="list-title" className="sr-only">List title</label><input id="list-title" autoFocus value={listTitle} onChange={(event) => setListTitle(event.target.value)} placeholder="List title…" className="h-8 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground" /><label htmlFor="list-category" className="sr-only">Category</label><input id="list-category" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Category" className="h-8 rounded-md border border-input bg-background px-2 text-xs" /><Button type="submit" size="sm" className="h-8 text-xs">Create list</Button></form>}

      <div className="grid min-h-[420px] overflow-hidden rounded-lg border border-border bg-card md:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="border-b border-border md:border-b-0 md:border-r" aria-label="List collection">
          <div className="border-b border-border p-2.5"><SearchInput value={query} onChange={setQuery} placeholder="Search lists and items" /></div>
          <div className="max-h-[240px] overflow-y-auto p-1.5 md:max-h-[520px]">
            {lists.map((list) => (
              <button key={list.id} onClick={() => setSelectedId(list.id)} aria-pressed={selected?.id === list.id} className={`w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent ${selected?.id === list.id ? 'bg-accent' : ''}`}>
                <span className="flex items-center gap-2"><ListChecks className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="truncate text-xs font-medium">{list.title}</span></span>
                <span className="mt-1 flex items-center justify-between pl-[22px] text-[10px] text-muted-foreground"><span>{list.category}</span><span>{list.items.filter((item) => item.done).length}/{list.items.length}</span></span>
              </button>
            ))}
          </div>
        </aside>
        <section className="flex min-h-[350px] flex-col">
          {selected ? (
            <>
              <header className="flex items-center justify-between border-b border-border px-4 py-3"><div><p className="text-sm font-medium">{selected.title}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{selected.category} · {selected.items.length} items</p></div><Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" aria-label="Delete list" onClick={() => { updateData((current) => ({ ...current, lists: current.lists.filter((list) => list.id !== selected.id) })); setSelectedId(null); }}><Trash2 className="h-3.5 w-3.5" /></Button></header>
              <div className="flex-1 p-2">
                {selected.items.map((item) => <div key={item.id} className="group flex items-center gap-2 rounded-md px-2 py-2 hover:bg-accent/70">
                  <button type="button" aria-label={`${item.done ? 'Uncheck' : 'Check'} ${item.text}`} aria-pressed={item.done} onClick={() => updateData((current) => ({ ...current, lists: current.lists.map((list) => list.id === selected.id ? { ...list, items: list.items.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry) } : list) }))} className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${item.done ? 'border-foreground bg-foreground text-background' : 'border-muted-foreground text-transparent'}`}>{item.done && <Check className="h-3 w-3" />}</button>
                  <span className={`flex-1 text-xs ${item.done ? 'text-muted-foreground line-through' : ''}`}>{item.text}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Delete ${item.text}`} onClick={() => updateData((current) => ({ ...current, lists: current.lists.map((list) => list.id === selected.id ? { ...list, items: list.items.filter((entry) => entry.id !== item.id) } : list) }))}><Trash2 className="h-3 w-3" /></Button>
                </div>)}
                {selected.items.length === 0 && <div className="px-2 py-7"><EmptyState title="A fresh list" description="Add checklist items or plain text to get started." /></div>}
              </div>
              <form onSubmit={addItem} className="flex items-center gap-2 border-t border-border p-3"><Plus className="h-3.5 w-3.5 text-muted-foreground" /><label htmlFor="new-list-item" className="sr-only">Add a list item</label><input id="new-list-item" value={itemText} onChange={(event) => setItemText(event.target.value)} placeholder="Add an item…" className="h-8 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground" /><Button type="submit" variant="outline" size="sm" className="h-7 text-[10px]">Add item</Button></form>
            </>
          ) : <div className="flex flex-1 items-center justify-center p-5"><EmptyState title="No lists found" description={data.lists.length ? 'Try another search, or create a new list.' : 'Create a list to collect checklists and structured content.'} action={!data.lists.length && <Button size="sm" variant="outline" onClick={() => setAddingList(true)}>Create a list</Button>} /></div>}
        </section>
      </div>
    </div>
  );
}
