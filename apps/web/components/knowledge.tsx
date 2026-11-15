'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { Archive, ArrowDownLeft, ArrowUpRight, Hash, Link2, Plus, Sparkles, X } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWorkspace } from '@/components/workspace-provider';
import { allEntities, contentTypes, entityIcons, entityLabelKeys, resolveEntity, wikiLinks, type ResolvedEntity } from '@/lib/entities';
import type { EntityRef, EntityType } from '@/lib/types';
import { colorOf, hueOf } from '@/lib/appearance';
import { cn } from '@/lib/utils';

const NONE = 'none';

/** Tag names of an entry. */
export function useEntityTags(type: EntityType, id: string | null | undefined): string[] {
  const { tags, tagAssignments } = useWorkspace();
  return useMemo(() => {
    if (!id) return [];
    const ids = new Set(tagAssignments.filter((entry) => entry.entity_type === type && entry.entity_id === id).map((entry) => entry.tag_id));
    return tags.filter((tag) => ids.has(tag.id)).map((tag) => tag.name);
  }, [id, tagAssignments, tags, type]);
}

/** `plain` renders text instead of a link, for chips that sit inside another link. */
export function TagChip({ name, onRemove, className, plain }: { name: string; onRemove?: () => void; className?: string; plain?: boolean }) {
  const { t } = useI18n();
  const label = <><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorOf(name) }} aria-hidden="true" />{name}</>;
  return (
    <span className={cn('inline-flex h-[22px] items-center gap-1 rounded-full bg-muted pl-2 text-[11px] font-medium text-[hsl(var(--fg-2)/var(--fg-2-a))] transition-colors duration-150', onRemove ? 'pr-0.5' : 'pr-2', className)}>
      {plain ? <span className="inline-flex items-center gap-1.5">{label}</span> : (
        <Link href={`/tags/${encodeURIComponent(name)}`} className="inline-flex items-center gap-1.5 hover:text-foreground" onClick={(event) => event.stopPropagation()}>{label}</Link>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} className="rounded-full p-0.5 hover:bg-accent hover:text-foreground" aria-label={t('tags.remove', { name })}>
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

/** Read-only list of an entry's tags. */
export function EntityTags({ type, id, className, limit = 4, plain }: { type: EntityType; id: string; className?: string; limit?: number; plain?: boolean }) {
  const names = useEntityTags(type, id);
  if (!names.length) return null;
  return (
    <span className={cn('flex flex-wrap gap-1', className)}>
      {names.slice(0, limit).map((name) => <TagChip key={name} name={name} plain={plain} />)}
      {names.length > limit && <span className="text-xs text-muted-foreground">+{names.length - limit}</span>}
    </span>
  );
}

/** Chips plus an inline input with autocomplete from all existing tags. */
export function TagInput({ value, onChange, className, autoFocus }: { value: string[]; onChange: (tags: string[]) => void; className?: string; autoFocus?: boolean }) {
  const { t } = useI18n();
  const { tags } = useWorkspace();
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const normalized = draft.trim().replace(/^#/, '').toLowerCase();
  const suggestions = tags.filter((tag) => !value.includes(tag.name) && tag.name.includes(normalized)).slice(0, 8);

  function add(name: string) {
    const clean = name.trim().replace(/^#/, '').toLowerCase();
    if (clean && !value.includes(clean)) onChange([...value, clean]);
    setDraft('');
    input.current?.focus();
  }

  return (
    <Popover open={open && (suggestions.length > 0 || Boolean(normalized))} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className={cn('flex min-h-10 flex-wrap items-center gap-1.5 rounded-2xl bg-field px-2 py-1.5 shadow-sm transition-shadow focus-within:border-ring/40 focus-within:ring-[3px] focus-within:ring-ring', className)}
          onClick={() => input.current?.focus()}
        >
          {value.map((name) => <TagChip key={name} name={name} onRemove={() => onChange(value.filter((entry) => entry !== name))} />)}
          <input
            ref={input}
            value={draft}
            autoFocus={autoFocus}
            onChange={(event) => {
              const next = event.target.value;
              if (/[,\s]$/.test(next) && next.trim()) add(next.slice(0, -1));
              else setDraft(next);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && normalized) {
                event.preventDefault();
                add(normalized);
              } else if (event.key === 'Backspace' && !draft && value.length) {
                onChange(value.slice(0, -1));
              }
            }}
            placeholder={value.length ? '' : t('tags.placeholder')}
            aria-label={t('relations.tags')}
            className="h-6 min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent className="w-64 p-1" onOpenAutoFocus={(event) => event.preventDefault()}>
        {suggestions.map((tag) => (
          <button key={tag.id} type="button" onClick={() => add(tag.name)} className="flex w-full items-center gap-2 rounded-full px-2.5 py-1.5 text-left text-[13px] hover:bg-accent">
            <Hash className="h-3.5 w-3.5" style={{ color: `hsl(${hueOf(tag.name)} 70% 55%)` }} />
            <span className="flex-1 truncate">{tag.name}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{tag.count}</span>
          </button>
        ))}
        {normalized && !tags.some((tag) => tag.name === normalized) && !value.includes(normalized) && (
          <button type="button" onClick={() => add(normalized)} className="flex w-full items-center gap-2 rounded-full px-2.5 py-1.5 text-left text-[13px] hover:bg-accent">
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            {t('tags.create', { name: normalized })}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Tag input that saves immediately (for existing entries). */
export function EntityTagEditor({ type, id, className }: { type: EntityType; id: string; className?: string }) {
  const { setTags } = useWorkspace();
  const names = useEntityTags(type, id);
  return <TagInput value={names} onChange={(next) => void setTags(type, id, next)} className={className} />;
}

export function ProjectSelect({ value, onChange, className }: { value: string | null; onChange: (projectId: string | null) => void; className?: string }) {
  const { t } = useI18n();
  const { data } = useWorkspace();
  return (
    <Select value={value ?? NONE} onValueChange={(next) => onChange(next === NONE ? null : next)}>
      <SelectTrigger aria-label={t('relations.project')} className={className}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{t('relations.noProject')}</SelectItem>
        {data.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** Searchable list of all content; used to create links. */
export function EntityPicker({ onSelect, exclude, children }: { onSelect: (entity: ResolvedEntity) => void; exclude?: EntityRef; children: React.ReactNode }) {
  const { t } = useI18n();
  const { data } = useWorkspace();
  const [open, setOpen] = useState(false);
  const entities = useMemo(() => (open ? allEntities(data) : []), [data, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Command>
          <CommandInput placeholder={t('relations.searchPlaceholder')} />
          <CommandList className="max-h-72">
            <CommandEmpty>{t('shell.noResults')}</CommandEmpty>
            {contentTypes.map((type) => {
              const items = entities.filter((entity) => entity.type === type && !(exclude && exclude.type === type && exclude.id === entity.id));
              if (!items.length) return null;
              const Icon = entityIcons[type];
              return (
                <CommandGroup key={type} heading={t(entityLabelKeys[type])}>
                  {items.map((entity) => (
                    <CommandItem key={entity.id} value={`${entity.title} ${entity.id}`} onSelect={() => { onSelect(entity); setOpen(false); }}>
                      <Icon className="text-muted-foreground" />
                      <span className="truncate">{entity.title || t('common.untitled')}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

type Relation = ResolvedEntity & { linkId?: string; via: 'link' | 'wiki' | 'project' | 'tags'; shared?: number };

/** Outgoing links, backlinks and related entries (same project or shared tags) of one entry. */
export function useRelations(type: EntityType, id: string) {
  const { data, links, tagAssignments } = useWorkspace();
  return useMemo(() => {
    const self = resolveEntity(data, type, id);
    const outgoing: Relation[] = [];
    const incoming: Relation[] = [];
    const seen = new Set<string>([`${type}:${id}`]);
    const push = (list: Relation[], entity: ResolvedEntity | null, extra: Omit<Relation, keyof ResolvedEntity>) => {
      if (!entity || seen.has(`${entity.type}:${entity.id}`)) return;
      seen.add(`${entity.type}:${entity.id}`);
      list.push({ ...entity, ...extra });
    };

    for (const link of links) {
      if (link.source_type === type && link.source_id === id) push(outgoing, resolveEntity(data, link.target_type, link.target_id), { linkId: link.id, via: 'link' });
      else if (link.target_type === type && link.target_id === id) push(incoming, resolveEntity(data, link.source_type, link.source_id), { linkId: link.id, via: 'link' });
    }

    // [[Wiki links]] between notes and documents, resolved by title.
    const linkable = [...data.notes.map((note) => ({ type: 'note' as const, item: note })), ...data.knowledge.map((doc) => ({ type: 'knowledge' as const, item: doc }))];
    const ownContent = type === 'note' ? data.notes.find((note) => note.id === id)?.content : type === 'knowledge' ? data.knowledge.find((doc) => doc.id === id)?.content : null;
    for (const title of wikiLinks(ownContent)) {
      const target = linkable.find((entry) => entry.item.title.trim().toLowerCase() === title);
      if (target) push(outgoing, resolveEntity(data, target.type, target.item.id), { via: 'wiki' });
    }
    const ownTitle = self?.title.trim().toLowerCase();
    if (ownTitle) {
      for (const entry of linkable) {
        if (wikiLinks(entry.item.content).includes(ownTitle)) push(incoming, resolveEntity(data, entry.type, entry.item.id), { via: 'wiki' });
      }
    }

    const related: Relation[] = [];
    const ownTags = new Set(tagAssignments.filter((entry) => entry.entity_type === type && entry.entity_id === id).map((entry) => entry.tag_id));
    if (ownTags.size) {
      const shared = new Map<string, { type: EntityType; id: string; count: number }>();
      for (const entry of tagAssignments) {
        if (!ownTags.has(entry.tag_id) || entry.entity_type === 'folder') continue;
        const key = `${entry.entity_type}:${entry.entity_id}`;
        const current = shared.get(key) ?? { type: entry.entity_type, id: entry.entity_id, count: 0 };
        shared.set(key, { ...current, count: current.count + 1 });
      }
      [...shared.values()].sort((a, b) => b.count - a.count).forEach((entry) => push(related, resolveEntity(data, entry.type, entry.id), { via: 'tags', shared: entry.count }));
    }
    const projectId = self && type !== 'project' ? self.projectId : null;
    if (projectId) {
      push(related, resolveEntity(data, 'project', projectId), { via: 'project' });
      allEntities(data).filter((entity) => entity.projectId === projectId && entity.type !== 'project')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6)
        .forEach((entity) => push(related, entity, { via: 'project' }));
    }
    return { outgoing, incoming, related: related.slice(0, 10) };
  }, [data, id, links, tagAssignments, type]);
}

export function RelationsPanel({ type, id, className, compact }: { type: EntityType; id: string; className?: string; compact?: boolean }) {
  const { t } = useI18n();
  const { addLink, removeLink } = useWorkspace();
  const { outgoing, incoming, related } = useRelations(type, id);
  const empty = !outgoing.length && !incoming.length && !related.length;

  return (
    <section className={cn('space-y-4', className)} aria-label={t('relations.title')}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4 text-muted-foreground" />{t('relations.title')}</h3>
        <EntityPicker exclude={{ type, id }} onSelect={(entity) => void addLink({ type, id }, entity)}>
          <Button type="button" variant="outline" size="sm"><Plus />{t('relations.add')}</Button>
        </EntityPicker>
      </div>
      {empty && <p className="text-sm text-muted-foreground">{t('relations.none')} {type === 'note' && t('relations.hint')}</p>}
      <div className={cn('grid gap-4', !compact && 'md:grid-cols-3')}>
        <RelationGroup icon={ArrowUpRight} title={t('relations.outgoing')} items={outgoing} onRemove={(linkId) => void removeLink(linkId)} />
        <RelationGroup icon={ArrowDownLeft} title={t('relations.incoming')} items={incoming} onRemove={(linkId) => void removeLink(linkId)} />
        <RelationGroup icon={Sparkles} title={t('relations.related')} items={related} />
      </div>
    </section>
  );
}

function RelationGroup({ icon: Icon, title, items, onRemove }: { icon: typeof Link2; title: string; items: Relation[]; onRemove?: (linkId: string) => void }) {
  const { t } = useI18n();
  if (!items.length) return null;
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="flex items-center gap-1.5 ds-label"><Icon className="h-3.5 w-3.5" />{title}<span className="tabular-nums">{items.length}</span></p>
      <ul className="space-y-1">
        {items.map((item) => {
          const ItemIcon = entityIcons[item.type];
          return (
            <li key={`${item.type}:${item.id}`} className="group flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 transition-colors duration-300 hover:bg-accent">
              <ItemIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Link href={item.href} className="min-w-0 flex-1">
                <span className="block truncate text-sm">{item.title || t('common.untitled')}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {t(entityLabelKeys[item.type])}
                  {item.via === 'wiki' && ` · ${t('relations.wiki')}`}
                  {item.via === 'project' && item.type !== 'project' && ` · ${t('relations.sameProject')}`}
                  {item.via === 'tags' && ` · ${t('relations.sharedTags', { count: item.shared ?? 1 })}`}
                </span>
              </Link>
              {item.linkId && onRemove && (
                <button type="button" onClick={() => onRemove(item.linkId as string)} aria-label={t('relations.remove')}
                  className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ArchiveButton({ type, id, onArchived, label = false, size = 'icon-sm' }: { type: EntityType; id: string; onArchived?: () => void; label?: boolean; size?: 'icon-sm' | 'sm' }) {
  const { t } = useI18n();
  const { archive } = useWorkspace();
  return (
    <Button
      type="button"
      variant="ghost"
      size={label ? 'sm' : size}
      className="text-muted-foreground hover:text-foreground"
      aria-label={t('archive.action')}
      title={t('archive.action')}
      onClick={async () => {
        if (await archive(type, id)) onArchived?.();
      }}
    >
      <Archive />
      {label && t('archive.action')}
    </Button>
  );
}
