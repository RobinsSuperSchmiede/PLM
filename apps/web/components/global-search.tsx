'use client';

import { useRouter } from 'next/navigation';
import { useDeferredValue, useMemo, useState } from 'react';
import { CornerDownLeft, Hash, type LucideIcon } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useWorkspace } from '@/components/workspace-provider';
import { colorOf } from '@/lib/appearance';
import { formatDateTime } from '@/lib/dates';
import { allEntities, entityColors, entityIcons, entityLabelKeys, type ResolvedEntity } from '@/lib/entities';
import type { EntityType } from '@/lib/types';
import { cn } from '@/lib/utils';

export type SearchPage = { href: string; label: string; icon: LucideIcon };

const searchable: EntityType[] = ['note', 'task', 'project', 'event', 'meeting', 'knowledge', 'file', 'idea', 'folder'];
type Scope = 'all' | EntityType | 'tag';

type Hit = { entity: ResolvedEntity; score: number; snippet: string | null };

/** Rank: exact title > title prefix > all words in title > words in text. Returns 0 for no match. */
function score(entity: ResolvedEntity, words: string[]): Hit | null {
  const title = entity.title.toLowerCase();
  const text = entity.preview.toLowerCase();
  let total = 0;
  let snippetAt = -1;
  for (const word of words) {
    const inTitle = title.indexOf(word);
    if (inTitle >= 0) {
      total += inTitle === 0 ? 30 : 18;
      continue;
    }
    const inText = text.indexOf(word);
    if (inText < 0) return null;
    total += 6;
    if (snippetAt < 0) snippetAt = inText;
  }
  if (title === words.join(' ')) total += 40;
  // Recently edited entries rank slightly higher.
  total += Math.max(0, 8 - (Date.now() - Date.parse(entity.updatedAt)) / 86_400_000 / 15);
  const snippet = snippetAt >= 0
    ? `${snippetAt > 30 ? '…' : ''}${entity.preview.slice(Math.max(0, snippetAt - 30), snippetAt + 90)}`
    : entity.preview.slice(0, 110) || null;
  return { entity, score: total, snippet };
}

function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  const pattern = new RegExp(`(${words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return <>{text.split(pattern).map((part, index) => (index % 2 ? <mark key={index} className="rounded-sm bg-brand/25 px-0.5 text-foreground">{part}</mark> : part))}</>;
}

export function GlobalSearch({ open, onOpenChange, pages }: { open: boolean; onOpenChange: (open: boolean) => void; pages: SearchPage[] }) {
  const { t, language } = useI18n();
  const router = useRouter();
  const { data, tags } = useWorkspace();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const deferred = useDeferredValue(query);
  const words = useMemo(() => deferred.toLowerCase().split(/\s+/).filter(Boolean), [deferred]);

  const index = useMemo(() => (open ? allEntities(data, searchable) : []), [data, open]);

  const hits = useMemo(() => {
    if (!words.length) {
      return [...index].filter((entity) => entity.type !== 'folder').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8)
        .map((entity) => ({ entity, score: 0, snippet: entity.preview.slice(0, 110) || null }));
    }
    const result: Hit[] = [];
    for (const entity of index) {
      if (scope !== 'all' && scope !== entity.type) continue;
      const hit = score(entity, words);
      if (hit) result.push(hit);
    }
    return result.sort((a, b) => b.score - a.score).slice(0, scope === 'all' ? 40 : 80);
  }, [index, scope, words]);

  const tagHits = useMemo(() => (words.length ? tags.filter((tag) => words.every((word) => tag.name.includes(word.replace(/^#/, '')))).slice(0, 8) : []), [tags, words]);
  const pageHits = useMemo(() => (words.length ? pages.filter((page) => words.every((word) => page.label.toLowerCase().includes(word))) : pages.slice(0, 0)), [pages, words]);

  const counts = useMemo(() => {
    const result = new Map<Scope, number>();
    if (!words.length) return result;
    for (const entity of index) if (score(entity, words)) result.set(entity.type, (result.get(entity.type) ?? 0) + 1);
    return result;
  }, [index, words]);

  function go(href: string) {
    onOpenChange(false);
    setQuery('');
    router.push(href);
  }

  const grouped = scope === 'all' && words.length
    ? searchable.map((type) => ({ type, items: hits.filter((hit) => hit.entity.type === type).slice(0, 6) })).filter((group) => group.items.length)
    : [{ type: null, items: hits }];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="center" hideClose aria-describedby={undefined}
        className="top-[12vh] max-w-2xl translate-y-0 gap-0 overflow-hidden p-0 data-[state=open]:slide-in-from-top-2">
        <DialogTitle className="sr-only">{t('shell.searchTitle')}</DialogTitle>
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input]]:h-14 [&_[cmdk-input]]:text-base">
          <CommandInput value={query} onValueChange={setQuery} placeholder={t('search.placeholder')} />
          <div className="flex gap-1 overflow-x-auto border-b px-3 py-2 [scrollbar-width:none]">
            {(['all', ...searchable.filter((type) => type !== 'folder'), 'tag'] as Scope[]).map((value) => {
              const count = value === 'all' ? hits.length : value === 'tag' ? tagHits.length : counts.get(value);
              return (
                <button key={value} type="button" onClick={() => setScope(value)} aria-pressed={scope === value}
                  className={cn('flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                    scope === value ? 'border-brand/40 bg-brand/10 font-medium text-foreground' : 'text-muted-foreground hover:bg-accent')}>
                  {value !== 'all' && value !== 'tag' && <span className="h-1.5 w-1.5 rounded-full" style={{ background: entityColors[value] }} />}
                  {value === 'all' ? t('search.all') : value === 'tag' ? t('search.tags') : t(entityLabelKeys[value])}
                  {words.length > 0 && count ? <span className="tabular-nums opacity-60">{count}</span> : null}
                </button>
              );
            })}
          </div>
          <CommandList className="max-h-[min(60vh,560px)]">
            <CommandEmpty className="py-10 text-center text-sm text-muted-foreground">{t('search.empty', { query })}</CommandEmpty>
            {!words.length && <CommandGroup heading={t('search.recent')}>{hits.map((hit) => <ResultItem key={`${hit.entity.type}:${hit.entity.id}`} hit={hit} words={words} language={language} onSelect={go} />)}</CommandGroup>}

            {words.length > 0 && scope !== 'tag' && grouped.map((group) => (
              <CommandGroup key={group.type ?? 'all'} heading={group.type ? t(entityLabelKeys[group.type]) : undefined}>
                {group.items.map((hit) => <ResultItem key={`${hit.entity.type}:${hit.entity.id}`} hit={hit} words={words} language={language} onSelect={go} />)}
              </CommandGroup>
            ))}

            {(scope === 'all' || scope === 'tag') && tagHits.length > 0 && (
              <CommandGroup heading={t('search.tags')}>
                {tagHits.map((tag) => (
                  <CommandItem key={tag.id} value={`tag:${tag.name}`} onSelect={() => go(`/tags/${encodeURIComponent(tag.name)}`)}>
                    <Hash style={{ color: colorOf(tag.name) }} />
                    <span className="flex-1">#<Highlight text={tag.name} words={words} /></span>
                    <span className="text-xs text-muted-foreground">{t('tags.items', { count: tag.count })}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {scope === 'all' && pageHits.length > 0 && (
              <CommandGroup heading={t('search.pages')}>
                {pageHits.map((page) => (
                  <CommandItem key={page.href} value={`page:${page.href}`} onSelect={() => go(page.href)}>
                    <page.icon className="text-muted-foreground" />{page.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          <div className="flex items-center gap-4 border-t px-3 py-2 text-[11px] text-muted-foreground">
            <span><kbd className="rounded border bg-muted px-1">↑</kbd> <kbd className="rounded border bg-muted px-1">↓</kbd> {t('search.navigate')}</span>
            <span><kbd className="rounded border bg-muted px-1"><CornerDownLeft className="inline h-3 w-3" /></kbd> {t('search.open')}</span>
            <span><kbd className="rounded border bg-muted px-1">Esc</kbd> {t('search.close')}</span>
            {words.length > 0 && <span className="ml-auto">{t('search.results', { count: hits.length })}</span>}
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function ResultItem({ hit, words, language, onSelect }: { hit: Hit; words: string[]; language: 'de' | 'en'; onSelect: (href: string) => void }) {
  const { t } = useI18n();
  const Icon = entityIcons[hit.entity.type];
  return (
    <CommandItem value={`${hit.entity.type}:${hit.entity.id}`} onSelect={() => onSelect(hit.entity.href)} className="items-start gap-3 py-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ background: `color-mix(in srgb, ${entityColors[hit.entity.type]} 16%, transparent)` }}>
        <Icon className="h-4 w-4" style={{ color: entityColors[hit.entity.type] }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium"><Highlight text={hit.entity.title || t('common.untitled')} words={words} /></span>
        {hit.snippet && <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground"><Highlight text={hit.snippet} words={words} /></span>}
      </span>
      <span className="shrink-0 text-[11px] text-muted-foreground">{formatDateTime(hit.entity.updatedAt, language)}</span>
    </CommandItem>
  );
}
