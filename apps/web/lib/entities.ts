import {
  BookOpen, CalendarDays, CheckSquare2, FileText, Paperclip, Folder as FolderIcon, FolderKanban, Lightbulb, Users, type LucideIcon,
} from 'lucide-react';

import type { TranslationKey } from '@/lib/i18n';
import { markdownToPlainText } from '@/lib/markdown';
import type { Collections, EntityRef, EntityType, ResourceName } from '@/lib/types';

const resources: Record<EntityType, ResourceName> = {
  note: 'notes',
  task: 'tasks',
  event: 'events',
  meeting: 'meetings',
  project: 'projects',
  knowledge: 'knowledge',
  idea: 'ideas',
  folder: 'folders',
  file: 'files',
};

export const entityTypes = Object.keys(resources) as EntityType[];

/** Types that show up as content (folders only structure notes). */
export const contentTypes: EntityType[] = ['note', 'task', 'event', 'meeting', 'project', 'knowledge', 'idea'];

export const entityIcons: Record<EntityType, LucideIcon> = {
  note: FileText,
  task: CheckSquare2,
  event: CalendarDays,
  meeting: Users,
  project: FolderKanban,
  knowledge: BookOpen,
  idea: Lightbulb,
  folder: FolderIcon,
  file: Paperclip,
};

export const entityLabelKeys: Record<EntityType, TranslationKey> = {
  note: 'entities.note',
  task: 'entities.task',
  event: 'entities.event',
  meeting: 'entities.meeting',
  project: 'entities.project',
  knowledge: 'entities.knowledge',
  idea: 'entities.idea',
  folder: 'entities.folder',
  file: 'entities.file',
};

/** Accent per type, used for graph nodes and small markers (CSS color values). */
export const entityColors: Record<EntityType | 'tag', string> = {
  note: 'hsl(var(--info))',
  task: 'hsl(var(--success))',
  event: 'hsl(var(--warning))',
  meeting: 'hsl(var(--brand))',
  project: 'hsl(var(--destructive))',
  knowledge: 'hsl(190 75% 42%)',
  idea: 'hsl(48 90% 48%)',
  folder: 'hsl(var(--muted-foreground))',
  file: 'hsl(330 75% 60%)',
  tag: 'hsl(var(--muted-foreground))',
};

export function resourceOf(type: EntityType): ResourceName {
  return resources[type];
}

export type ResolvedEntity = EntityRef & { title: string; preview: string; projectId: string | null; updatedAt: string; href: string; date?: string };

export function resolveEntity(data: Collections, type: EntityType, id: string): ResolvedEntity | null {
  const item = (data[resources[type]] as { id: string }[]).find((entry) => entry.id === id);
  return item ? describe(type, item as never) : null;
}

export function allEntities(data: Collections, types: EntityType[] = contentTypes): ResolvedEntity[] {
  return types.flatMap((type) => (data[resources[type]] as never[]).map((item) => describe(type, item)));
}

function describe(type: EntityType, item: Record<string, unknown> & { id: string; updated_at: string }): ResolvedEntity {
  const text = (key: string) => (typeof item[key] === 'string' ? (item[key] as string) : '');
  const title = type === 'project' || type === 'folder' || type === 'file' ? text('name') : text('title');
  const preview = {
    note: text('content'), task: text('description'), event: text('description'), meeting: text('agenda'),
    project: text('description'), knowledge: text('content'), idea: text('description'), folder: '', file: text('description'),
  }[type];
  return {
    type,
    id: item.id,
    title,
    preview: markdownToPlainText(preview),
    projectId: (item.project_id as string | null | undefined) ?? (type === 'project' ? item.id : null),
    updatedAt: item.updated_at,
    href: entityHref(type, item.id, text('date')),
    date: text('date') || text('due_date') || undefined,
  };
}

export function entityHref(type: EntityType, id: string, date?: string): string {
  switch (type) {
    case 'note': return `/notes?id=${id}`;
    case 'task': return `/tasks?id=${id}`;
    case 'event': return date ? `/calendar?date=${date}&id=${id}` : `/calendar?id=${id}`;
    case 'meeting': return `/meetings?id=${id}`;
    case 'project': return `/projects/${id}`;
    case 'knowledge': return `/knowledge?id=${id}`;
    case 'idea': return `/ideas?id=${id}`;
    case 'folder': return `/notes?folder=${id}`;
    case 'file': return `/files?id=${id}`;
  }
}

/** [[Wiki links]] in Markdown, as written in notes (Obsidian style). */
export function wikiLinks(markdown: string | null | undefined): string[] {
  if (!markdown) return [];
  const titles = new Set<string>();
  for (const match of markdown.matchAll(/\\?\[\\?\[([^\]\n|]+?)(?:\|[^\]\n]*)?\\?\]\\?\]/g)) titles.add(match[1].trim().toLowerCase());
  return [...titles];
}
