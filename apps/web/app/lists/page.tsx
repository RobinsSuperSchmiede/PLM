'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useMemo, useState } from 'react';
import { ListChecks, Plus, X } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DeleteButton, EmptyState, Field, PageHeader, PageSkeleton, SearchInput } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { cn } from '@/lib/utils';

export default function ListsPage() {
  return <Suspense fallback={<PageSkeleton />}><ListsView /></Suspense>;
}

function ListsView() {
  const { t } = useI18n();
  const { data, loading, remove, listItems } = useWorkspace();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [itemText, setItemText] = useState('');

  const lists = useMemo(() => data.lists.filter((list) =>
    `${list.title} ${list.category} ${list.items.map((item) => item.text).join(' ')}`.toLowerCase().includes(query.toLowerCase()),
  ), [data.lists, query]);
  const selected = data.lists.find((list) => list.id === searchParams.get('id')) ?? lists[0] ?? null;
  const select = (id: string | null) => router.replace(id ? `/lists?id=${id}` : '/lists', { scroll: false });

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = itemText.trim();
    if (!text || !selected) return;
    setItemText('');
    await listItems.add(selected.id, text);
  }

  if (loading) return <PageSkeleton />;

  const newListButton = <Button onClick={() => setCreating(true)}><Plus />{t('lists.new')}</Button>;

  return (
    <div>
      <PageHeader title={t('lists.title')} description={t('lists.description')} action={newListButton} />

      {data.lists.length === 0 ? (
        <EmptyState icon={ListChecks} title={t('lists.empty')} description={t('lists.emptyDesc')} action={<Button variant="outline" onClick={() => setCreating(true)}><Plus />{t('lists.new')}</Button>} />
      ) : (
        <Card className="grid overflow-hidden md:h-[calc(100vh-13rem)] md:min-h-[520px] md:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col">
            <div className="p-3 pb-1"><SearchInput value={query} onChange={setQuery} placeholder={t('lists.search')} className="sm:w-full" /></div>
            <div className="max-h-64 flex-1 space-y-0.5 overflow-y-auto p-2 md:max-h-none">
              {lists.map((list) => {
                const done = list.items.filter((item) => item.done).length;
                return (
                  <button key={list.id} type="button" onClick={() => select(list.id)} aria-current={selected?.id === list.id}
                    className={cn('w-full rounded-2xl px-3 py-2 text-left transition-[background-color,box-shadow,color,transform] duration-300 ease-ds hover:bg-accent active:scale-[0.99]', selected?.id === list.id && 'ds-glass')}>
                    <span className="flex items-center gap-2"><ListChecks className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="truncate text-sm font-medium">{list.title}</span></span>
                    <span className="mt-0.5 flex items-center justify-between pl-[22px] text-xs text-muted-foreground"><span>{list.category}</span><span className="tabular-nums">{done}/{list.items.length}</span></span>
                  </button>
                );
              })}
            </div>
          </aside>

          {selected ? (
            <section className="flex min-h-0 flex-col">
              <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{selected.title}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{selected.category}</Badge>
                    {t('lists.items', { done: selected.items.filter((item) => item.done).length, total: selected.items.length })}
                  </div>
                </div>
                <DeleteButton name={selected.title} onConfirm={() => { void remove('lists', selected.id); select(null); }} />
              </header>
              <div className="flex-1 space-y-0.5 overflow-y-auto p-3">
                {selected.items.map((item) => (
                  <div key={item.id} className="row-enter group flex items-center gap-3 rounded-full px-2.5 py-1.5 transition-colors duration-300 hover:bg-accent">
                    <Checkbox id={`item-${item.id}`} checked={item.done} onCheckedChange={(checked) => void listItems.update(selected.id, item.id, { done: checked === true })} />
                    <label htmlFor={`item-${item.id}`} className={cn('flex-1 cursor-pointer text-sm', item.done && 'text-muted-foreground line-through')}>{item.text}</label>
                    <Button variant="ghost" size="icon-sm" className="h-7 w-7 text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                      aria-label={`${t('common.delete')}: ${item.text}`} onClick={() => void listItems.remove(selected.id, item.id)}><X /></Button>
                  </div>
                ))}
                {selected.items.length === 0 && <p className="px-2 py-10 text-center text-sm text-muted-foreground">{t('lists.emptyList')}</p>}
              </div>
              <form onSubmit={addItem} className="flex gap-2 p-3">
                <Input value={itemText} onChange={(event) => setItemText(event.target.value)} placeholder={t('lists.addItem')} aria-label={t('lists.addItem')} />
                <Button type="submit" variant="secondary" disabled={!itemText.trim()}><Plus />{t('common.add')}</Button>
              </form>
            </section>
          ) : (
            <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">{t('shell.noResults')}</div>
          )}
        </Card>
      )}

      <CreateListDialog open={creating} onClose={() => setCreating(false)} onCreated={select} />
    </div>
  );
}

function CreateListDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useI18n();
  const { create } = useWorkspace();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    const list = await create('lists', { title: title.trim(), category: category.trim() || 'General' });
    if (!list) return;
    setTitle('');
    setCategory('');
    onCreated(list.id);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('lists.new')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <Field label={t('common.title')} htmlFor="list-title">
            <Input id="list-title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} required />
          </Field>
          <Field label={t('lists.category')} htmlFor="list-category">
            <Input id="list-category" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="General" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={!title.trim()}>{t('common.create')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
