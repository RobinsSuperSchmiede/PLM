'use client';

import { useRouter } from 'next/navigation';
import { useDeferredValue, useMemo, useState } from 'react';
import { CornerDownLeft, Hash, type LucideIcon, X } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useWorkspace } from '@/components/workspace-provider';
import { colorOf } from '@/lib/appearance';
import { formatDate, formatDateTime, toDateKey } from '@/lib/dates';
import { allEntities, entityColors, entityIcons, entityLabelKeys, type ResolvedEntity } from '@/lib/entities';
import { hasFilters, parseQuery } from '@/lib/search-query';
import type { EntityType, Language } from '@/lib/types';
import { cn } from '@/lib/utils';

export type SearchPage = { href: string; label: string; icon: LucideIcon };

const searchable: EntityType[] = ['note', 'task', 'project', 'event', 'meeting', 'knowledge', 'file', 'idea', 'folder'];
type Scope = 'all' | EntityType | 'tag';
/** Examples offered while the field is empty; a click writes them into the search. */
const hints = ['#', 'heute', 'gestern', 'woche', 'typ:notiz', 'typ:bild', 'von:telegram', 'von:mcp', '@'];

type Hit = { entity: ResolvedEntity; score: number; snippet: string | null };

/** Rank: exact title > title prefix > all words in title > words in text. Returns null for no match. */
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
  if (words.length && title === words.join(' ')) total += 40;
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
  return <>{text.split(pattern).map((part, index) => (index % 2 ? <mark key={index} className="rounded-sm bg-foreground/15 px-0.5 text-foreground">{part}</mark> : part))}</>;
}

const dayOf = (iso: string) => toDateKey(new Date(iso));

export function GlobalSearch({ open, onOpenChange, pages }: { open: boolean; onOpenChange: (open: boolean) => void; pages: SearchPage[] }) {
  const { t, language } = useI18n();
  const router = useRouter();
  const { data, tags, tagAssignments } = useWorkspace();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const deferred = useDeferredValue(query);
  const parsed = useMemo(() => parseQuery(deferred), [deferred]);
  const { words } = parsed;
  const filtering = hasFilters(parsed);
  const searching = words.length > 0 || filtering;

  const index = useMemo(() => (open ? allEntities(data, searchable) : []), [data, open]);

  // Lookups for the operators (#tag, @project, von:…, typ:bild).
  const lookups = useMemo(() => {
    const tagNames = new Map(tags.map((tag) => [tag.id, tag.name.toLowerCase()]));
    const entityTags = new Map<string, string[]>();
    if (open) {
      for (const entry of tagAssignments) {
        const name = tagNames.get(entry.tag_id);
        const key = `${entry.entity_type}:${entry.entity_id}`;
        if (name) entityTags.set(key, [...(entityTags.get(key) ?? []), name]);
      }
    }
    return {
      entityTags,
      projects: new Map(data.projects.map((project) => [project.id, project.name.toLowerCase()])),
      noteSources: new Map(data.notes.map((note) => [note.id, note.source ?? 'app'])),
      images: new Set(data.files.filter((file) => file.kind === 'image').map((file) => file.id)),
    };
  }, [data.files, data.notes, data.projects, open, tagAssignments, tags]);

  const matches = useMemo(() => {
    if (!searching) return [] as Hit[];
    const { range } = parsed;
    const result: Hit[] = [];
    for (const entity of index) {
      if (parsed.types.length && !parsed.types.some((type) => (type === 'image' ? entity.type === 'file' && lookups.images.has(entity.id) : entity.type === type))) continue;
      if (parsed.sources.length && !(entity.type === 'note' && parsed.sources.includes(lookups.noteSources.get(entity.id) ?? 'app'))) continue;
      if (parsed.tags.length) {
        const own = lookups.entityTags.get(`${entity.type}:${entity.id}`) ?? [];
        if (!parsed.tags.every((tag) => own.some((name) => name.startsWith(tag)))) continue;
      }
      if (parsed.projects.length) {
        const name = entity.projectId ? lookups.projects.get(entity.projectId) : undefined;
        if (!name || !parsed.projects.every((part) => name.includes(part))) continue;
      }
      // A day matches the entry's own date (event, meeting, due date) or the day it was created or changed.
      if (range && ![entity.date, dayOf(entity.updatedAt), dayOf(entity.createdAt)].some((day) => day && day >= range.from && day <= range.to)) continue;
      const hit = score(entity, words);
      if (hit) result.push(hit);
    }
    return result.sort((a, b) => b.score - a.score);
  }, [index, lookups, parsed, searching, words]);

  const hits = useMemo(() => {
    if (!searching) {
      return [...index].filter((entity) => entity.type !== 'folder').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8)
        .map((entity) => ({ entity, score: 0, snippet: entity.preview.slice(0, 110) || null }));
    }
    return matches.filter((hit) => scope === 'all' || scope === 'tag' || hit.entity.type === scope).slice(0, scope === 'all' ? 60 : 100);
  }, [index, matches, scope, searching]);

  const counts = useMemo(() => {
    const result = new Map<Scope, number>();
    for (const hit of matches) result.set(hit.entity.type, (result.get(hit.entity.type) ?? 0) + 1);
    return result;
  }, [matches]);

  // Tags are suggested for a "#…" being typed as well as for plain words.
  const tagTerms = [...parsed.tags, ...words];
  const tagHits = useMemo(() => (tagTerms.length ? tags.filter((tag) => tagTerms.some((term) => tag.name.toLowerCase().includes(term))).slice(0, 8) : query.trim() === '#' ? tags.slice(0, 12) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tags, deferred]);
  const pageHits = useMemo(() => (words.length && !filtering ? pages.filter((page) => words.every((word) => page.label.toLowerCase().includes(word))) : []), [filtering, pages, words]);

  // The operators found in the query, shown as chips that can be removed one by one.
  const tokens = query.split(/\s+/).filter(Boolean);
  const chips = tokens.filter((token) => hasFilters(parseQuery(token)));
  const removeToken = (token: string) => setQuery(tokens.filter((entry) => entry !== token).join(' '));

  function go(href: string) {
    onOpenChange(false);
    setQuery('');
    router.push(href);
  }

  /** Picking a suggested tag completes the "#…" being typed; without one it opens the tag page. */
  function pickTag(name: string) {
    const typing = tokens.findIndex((token) => token.startsWith('#') && name.toLowerCase().startsWith(token.slice(1).toLowerCase()) && token.slice(1).toLowerCase() !== name.toLowerCase());
    if (typing < 0) return go(`/tags/${encodeURIComponent(name)}`);
    setQuery(`${tokens.map((token, index) => (index === typing ? `#${name}` : token)).join(' ')} `);
  }

  const grouped = scope === 'all' && searching
    ? searchable.map((type) => ({ type, items: hits.filter((hit) => hit.entity.type === type).slice(0, 8) })).filter((group) => group.items.length)
    : [{ type: null, items: hits }];
  const chipClass = (active: boolean) => cn('flex h-[22px] shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs transition-[background-color,color] duration-300 ease-ds focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
    active ? 'bg-primary font-medium text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="center" hideClose aria-describedby={undefined}
        className="top-[10vh] max-w-2xl translate-y-0 gap-0 overflow-hidden p-0 data-[state=open]:slide-in-from-top-2">
        <DialogTitle className="sr-only">{t('shell.searchTitle')}</DialogTitle>
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input]]:h-14 [&_[cmdk-input]]:text-base">
          <CommandInput value={query} onValueChange={setQuery} placeholder={t('search.placeholder')} />

          {/* Empty field: what the search understands. Otherwise: the active operators. */}
          <div className="flex flex-wrap items-center gap-1 px-3 pt-2">
            {chips.length > 0 ? chips.map((token) => (
              <button key={token} type="button" onClick={() => removeToken(token)} className={chipClass(true)} aria-label={`${t('search.removeFilter')}: ${token}`}>
                {token}<X className="h-3 w-3" />
              </button>
            )) : (
              <>
                <span className="ds-label pr-1">{t('search.try')}</span>
                {hints.map((hint) => (
                  <button key={hint} type="button" onClick={() => setQuery(`${query.trim()} ${hint}${hint.length > 1 ? ' ' : ''}`.trimStart())} className={cn(chipClass(false), 'font-mono text-[11px]')}>
                    {hint === '#' ? '#tag' : hint === '@' ? t('search.hintProject') : hint}
                  </button>
                ))}
                <span className="ds-label pl-1 font-mono">14.11. · 2026-11 · {t('search.hintRange')}</span>
              </>
            )}
          </div>

          <div className="flex gap-1 overflow-x-auto border-b px-3 py-2 [scrollbar-width:none]">
            {(['all', ...searchable.filter((type) => type !== 'folder'), 'tag'] as Scope[]).map((value) => {
              const count = value === 'all' ? matches.length : value === 'tag' ? tagHits.length : counts.get(value);
              return (
                <button key={value} type="button" onClick={() => setScope(value)} aria-pressed={scope === value} className={chipClass(scope === value)}>
                  {value !== 'all' && value !== 'tag' && <span className="h-1.5 w-1.5 rounded-full" style={{ background: entityColors[value] }} />}
                  {value === 'all' ? t('search.all') : value === 'tag' ? t('search.tags') : t(entityLabelKeys[value])}
                  {searching && count ? <span className="tabular-nums opacity-60">{count}</span> : null}
                </button>
              );
            })}
          </div>

          <CommandList className="max-h-[min(60vh,560px)]">
            <CommandEmpty className="py-10 text-center text-sm text-muted-foreground">{t('search.empty', { query })}</CommandEmpty>
            {!searching && <CommandGroup heading={t('search.recent')}>{hits.map((hit) => <ResultItem key={`${hit.entity.type}:${hit.entity.id}`} hit={hit} words={words} language={language} onSelect={go} tags={lookups.entityTags.get(`${hit.entity.type}:${hit.entity.id}`)} />)}</CommandGroup>}

            {searching && scope !== 'tag' && grouped.map((group) => (
              <CommandGroup key={group.type ?? 'all'} heading={group.type ? `${t(entityLabelKeys[group.type])} · ${counts.get(group.type) ?? 0}` : undefined}>
                {group.items.map((hit) => <ResultItem key={`${hit.entity.type}:${hit.entity.id}`} hit={hit} words={words} language={language} onSelect={go} tags={lookups.entityTags.get(`${hit.entity.type}:${hit.entity.id}`)} />)}
              </CommandGroup>
            ))}

            {(scope === 'all' || scope === 'tag') && tagHits.length > 0 && (
              <CommandGroup heading={t('search.tags')}>
                {tagHits.map((tag) => (
                  <CommandItem key={tag.id} value={`tag:${tag.name}`} onSelect={() => pickTag(tag.name)}>
                    <Hash style={{ color: colorOf(tag.name) }} />
                    <span className="flex-1">#<Highlight text={tag.name} words={tagTerms} /></span>
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
            <span><kbd className="ds-kbd">↑</kbd> <kbd className="ds-kbd">↓</kbd> {t('search.navigate')}</span>
            <span><kbd className="ds-kbd"><CornerDownLeft className="inline h-3 w-3" /></kbd> {t('search.open')}</span>
            <span><kbd className="ds-kbd">Esc</kbd> {t('search.close')}</span>
            {searching && <span className="ml-auto">{t('search.results', { count: matches.length })}</span>}
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function ResultItem({ hit, words, language, onSelect, tags }: { hit: Hit; words: string[]; language: Language; onSelect: (href: string) => void; tags?: string[] }) {
  const { t } = useI18n();
  const Icon = entityIcons[hit.entity.type];
  return (
    <CommandItem value={`${hit.entity.type}:${hit.entity.id}`} onSelect={() => onSelect(hit.entity.href)} className="items-start gap-3 py-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${entityColors[hit.entity.type]} 16%, transparent)` }}>
        <Icon className="h-4 w-4" style={{ color: entityColors[hit.entity.type] }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate"><Highlight text={hit.entity.title || t('common.untitled')} words={words} /></span>
          {tags?.slice(0, 3).map((tag) => <span key={tag} className="shrink-0 text-[11px] font-normal text-muted-foreground">#{tag}</span>)}
        </span>
        {hit.snippet && <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground"><Highlight text={hit.snippet} words={words} /></span>}
      </span>
      <span className="shrink-0 text-right font-mono text-[11px] text-muted-foreground">
        {hit.entity.date ? formatDate(hit.entity.date, language, { day: 'numeric', month: 'short', year: 'numeric' }) : formatDateTime(hit.entity.updatedAt, language)}
      </span>
    </CommandItem>
  );
}
