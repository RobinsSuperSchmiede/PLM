'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';

import { useI18n } from '@/components/i18n-provider';
import { api, ApiError } from '@/lib/api';
import { resourceOf } from '@/lib/entities';
import type {
  AppSettings, Collections, EntityLink, EntityRef, EntityType, ListItem, ResourceItem, ResourceName, SettingsUpdate, Tag, TagAssignment, WorkspaceList,
} from '@/lib/types';

const emptyCollections: Collections = {
  projects: [],
  tasks: [],
  events: [],
  meetings: [],
  notes: [],
  lists: [],
  ideas: [],
  knowledge: [],
  records: [],
  reminders: [],
  folders: [],
  files: [],
};

const resourceNames = Object.keys(emptyCollections) as ResourceName[];

// The last loaded workspace is kept in this browser so pages render instantly on the next visit,
// then the server data replaces it (stale-while-revalidate).
const snapshotKey = 'anamnesies.snapshot.v1';
type Snapshot = { data: Collections; tags: Tag[]; tagAssignments: TagAssignment[]; links: EntityLink[] };

function readSnapshot(): Snapshot | null {
  try {
    const raw = window.localStorage.getItem(snapshotKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot;
    return { ...parsed, data: { ...emptyCollections, ...parsed.data } };
  } catch {
    return null;
  }
}

function writeSnapshot(snapshot: Snapshot) {
  try {
    window.localStorage.setItem(snapshotKey, JSON.stringify(snapshot));
  } catch { /* quota exceeded or storage unavailable – the cache is optional */ }
}

type WorkspaceContextValue = {
  data: Collections;
  settings: AppSettings | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  create: <R extends ResourceName>(resource: R, payload: Partial<ResourceItem<R>>) => Promise<ResourceItem<R> | null>;
  update: <R extends ResourceName>(resource: R, id: string, patch: Partial<ResourceItem<R>>) => Promise<ResourceItem<R> | null>;
  remove: (resource: ResourceName, id: string) => Promise<boolean>;
  listItems: {
    add: (listId: string, text: string) => Promise<void>;
    update: (listId: string, itemId: string, patch: Partial<Pick<ListItem, 'text' | 'done'>>) => Promise<void>;
    remove: (listId: string, itemId: string) => Promise<void>;
  };
  saveSettings: (patch: SettingsUpdate) => Promise<AppSettings | null>;
  setSettings: (settings: AppSettings) => void;
  tags: Tag[];
  tagAssignments: TagAssignment[];
  links: EntityLink[];
  /** Replace the tags of an entry; unknown tag names are created. */
  setTags: (type: EntityType, id: string, names: string[]) => Promise<void>;
  addLink: (source: EntityRef, target: EntityRef) => Promise<void>;
  removeLink: (id: string) => Promise<void>;
  /** Move an entry to the archive; it disappears from the normal views. */
  archive: (type: EntityType, id: string) => Promise<boolean>;
  /** Bring an archived entry back and reload its collection. */
  restore: (type: EntityType, id: string) => Promise<boolean>;
  reloadOrganization: () => Promise<void>;
  /** Add an entry that was created outside the generic create() (e.g. a file upload). */
  insert: <R extends ResourceName>(resource: R, item: ResourceItem<R>) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function errorMessage(error: unknown) {
  return error instanceof ApiError || error instanceof Error ? error.message : String(error);
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { t, setLanguage } = useI18n();
  const { setTheme } = useTheme();
  const [data, setData] = useState<Collections>(emptyCollections);
  const dataRef = useRef<Collections>(emptyCollections);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tags, setTagList] = useState<Tag[]>([]);
  const [tagAssignments, setTagAssignments] = useState<TagAssignment[]>([]);
  const [links, setLinks] = useState<EntityLink[]>([]);

  const commit = useCallback((update: (current: Collections) => Collections) => {
    dataRef.current = update(dataRef.current);
    setData(dataRef.current);
  }, []);

  const applySettings = useCallback((next: AppSettings) => {
    setSettings(next);
    setLanguage(next.language);
    setTheme(next.theme);
  }, [setLanguage, setTheme]);

  const reloadOrganization = useCallback(async () => {
    const [loadedTags, loadedAssignments, loadedLinks] = await Promise.all([
      api.get<Tag[]>('/tags'),
      api.get<TagAssignment[]>('/tags/assignments'),
      api.get<EntityLink[]>('/links'),
    ]);
    setTagList(loadedTags);
    setTagAssignments(loadedAssignments);
    setLinks(loadedLinks);
  }, []);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [collections, loadedSettings] = await Promise.all([
        Promise.all(resourceNames.map((name) => api.get<Collections[typeof name]>(`/${name}`))),
        api.get<AppSettings>('/settings'),
        reloadOrganization(),
      ]);
      const next = Object.fromEntries(resourceNames.map((name, index) => [name, collections[index]])) as Collections;
      commit(() => next);
      applySettings(loadedSettings);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [applySettings, commit, reloadOrganization]);

  useEffect(() => {
    const snapshot = readSnapshot();
    if (snapshot) {
      commit(() => snapshot.data);
      setTagList(snapshot.tags);
      setTagAssignments(snapshot.tagAssignments);
      setLinks(snapshot.links);
      setLoading(false);
    }
    void reload();
  }, [commit, reload]);

  // Persist the current state shortly after changes settle.
  useEffect(() => {
    if (loading || error) return;
    const timeout = window.setTimeout(() => writeSnapshot({ data, tags, tagAssignments: tagAssignments, links }), 1500);
    return () => window.clearTimeout(timeout);
  }, [data, error, links, loading, tagAssignments, tags]);

  const reportError = useCallback((failure: unknown) => {
    toast.error(t('common.errorSaving', { message: errorMessage(failure) }));
  }, [t]);

  const create = useCallback<WorkspaceContextValue['create']>(async (resource, payload) => {
    try {
      const created = await api.post<ResourceItem<typeof resource>>(`/${resource}`, payload);
      commit((current) => ({ ...current, [resource]: [created, ...current[resource]] }));
      return created;
    } catch (failure) {
      reportError(failure);
      return null;
    }
  }, [commit, reportError]);

  const update = useCallback<WorkspaceContextValue['update']>(async (resource, id, patch) => {
    const previous = dataRef.current[resource];
    // Optimistic update so the UI responds instantly; reverted on failure.
    commit((current) => ({
      ...current,
      [resource]: (current[resource] as ResourceItem<typeof resource>[]).map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
    try {
      const saved = await api.patch<ResourceItem<typeof resource>>(`/${resource}/${id}`, patch);
      commit((current) => ({
        ...current,
        [resource]: (current[resource] as ResourceItem<typeof resource>[]).map((item) => (item.id === id ? { ...saved, ...pendingFields(item, saved, patch) } : item)),
      }));
      return saved;
    } catch (failure) {
      commit((current) => ({ ...current, [resource]: previous }));
      reportError(failure);
      return null;
    }
  }, [commit, reportError]);

  const reloadResource = useCallback(async (resource: ResourceName) => {
    const items = await api.get<Collections[typeof resource]>(`/${resource}`);
    commit((current) => ({ ...current, [resource]: items }));
  }, [commit]);

  const remove = useCallback<WorkspaceContextValue['remove']>(async (resource, id) => {
    const previous = dataRef.current[resource];
    commit((current) => ({ ...current, [resource]: (current[resource] as { id: string }[]).filter((item) => item.id !== id) }));
    try {
      await api.delete(`/${resource}/${id}`);
      // The server drops tags and links of deleted entries and detaches their contents.
      setTagAssignments((current) => current.filter((entry) => entry.entity_id !== id));
      setLinks((current) => current.filter((entry) => entry.source_id !== id && entry.target_id !== id));
      if (resource === 'folders') await Promise.all([reloadResource('folders'), reloadResource('notes')]);
      if (resource === 'projects') await Promise.all(['tasks', 'notes', 'events', 'meetings', 'knowledge', 'ideas'].map((name) => reloadResource(name as ResourceName)));
      return true;
    } catch (failure) {
      commit((current) => ({ ...current, [resource]: previous }));
      reportError(failure);
      return false;
    }
  }, [commit, reloadResource, reportError]);

  const replaceList = useCallback((list: WorkspaceList) => {
    commit((current) => ({ ...current, lists: current.lists.map((entry) => (entry.id === list.id ? list : entry)) }));
  }, [commit]);

  const listItems = useMemo<WorkspaceContextValue['listItems']>(() => ({
    add: async (listId, text) => {
      try {
        replaceList(await api.post<WorkspaceList>(`/lists/${listId}/items`, { text }));
      } catch (failure) {
        reportError(failure);
      }
    },
    update: async (listId, itemId, patch) => {
      const previous = dataRef.current.lists.find((list) => list.id === listId);
      if (previous) replaceList({ ...previous, items: previous.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)) });
      try {
        replaceList(await api.patch<WorkspaceList>(`/lists/${listId}/items/${itemId}`, patch));
      } catch (failure) {
        if (previous) replaceList(previous);
        reportError(failure);
      }
    },
    remove: async (listId, itemId) => {
      const previous = dataRef.current.lists.find((list) => list.id === listId);
      if (previous) replaceList({ ...previous, items: previous.items.filter((item) => item.id !== itemId) });
      try {
        replaceList(await api.delete<WorkspaceList>(`/lists/${listId}/items/${itemId}`));
      } catch (failure) {
        if (previous) replaceList(previous);
        reportError(failure);
      }
    },
  }), [replaceList, reportError]);

  const saveSettings = useCallback<WorkspaceContextValue['saveSettings']>(async (patch) => {
    try {
      const saved = await api.patch<AppSettings>('/settings', patch);
      applySettings(saved);
      return saved;
    } catch (failure) {
      reportError(failure);
      return null;
    }
  }, [applySettings, reportError]);

  const setTags = useCallback<WorkspaceContextValue['setTags']>(async (type, id, names) => {
    try {
      const result = await api.put<{ tags: Tag[]; assignments: TagAssignment[] }>(`/tags/entity/${type}/${id}`, { tags: names });
      setTagList(result.tags);
      setTagAssignments((current) => [...current.filter((entry) => !(entry.entity_type === type && entry.entity_id === id)), ...result.assignments]);
    } catch (failure) {
      reportError(failure);
    }
  }, [reportError]);

  const addLink = useCallback<WorkspaceContextValue['addLink']>(async (source, target) => {
    try {
      const link = await api.post<EntityLink>('/links', { source_type: source.type, source_id: source.id, target_type: target.type, target_id: target.id });
      setLinks((current) => (current.some((entry) => entry.id === link.id) ? current : [...current, link]));
    } catch (failure) {
      reportError(failure);
    }
  }, [reportError]);

  const removeLink = useCallback<WorkspaceContextValue['removeLink']>(async (id) => {
    setLinks((current) => current.filter((entry) => entry.id !== id));
    try {
      await api.delete(`/links/${id}`);
    } catch (failure) {
      reportError(failure);
      void reloadOrganization();
    }
  }, [reloadOrganization, reportError]);

  const archive = useCallback<WorkspaceContextValue['archive']>(async (type, id) => {
    const resource = resourceOf(type);
    const previous = dataRef.current[resource];
    commit((current) => ({ ...current, [resource]: (current[resource] as { id: string }[]).filter((item) => item.id !== id) }));
    try {
      await api.post(`/archive/${type}/${id}`);
      // Archiving a folder also archives its notes and subfolders.
      if (type === 'folder') await Promise.all([reloadResource('folders'), reloadResource('notes')]);
      toast.success(t('archive.archivedToast'));
      return true;
    } catch (failure) {
      commit((current) => ({ ...current, [resource]: previous }));
      reportError(failure);
      return false;
    }
  }, [commit, reloadResource, reportError, t]);

  const restore = useCallback<WorkspaceContextValue['restore']>(async (type, id) => {
    try {
      await api.post(`/archive/${type}/${id}/restore`);
      await reloadResource(resourceOf(type));
      if (type === 'folder') await reloadResource('notes');
      return true;
    } catch (failure) {
      reportError(failure);
      return false;
    }
  }, [reloadResource, reportError]);

  const insert = useCallback<WorkspaceContextValue['insert']>((resource, item) => {
    commit((current) => ({ ...current, [resource]: [item, ...(current[resource] as { id: string }[]).filter((entry) => entry.id !== item.id)] }));
  }, [commit]);

  const value = useMemo(
    () => ({
      data, settings, loading, error, reload, create, update, remove, listItems, saveSettings, setSettings: applySettings,
      tags, tagAssignments, links, setTags, addLink, removeLink, archive, restore, reloadOrganization, insert,
    }),
    [data, settings, loading, error, reload, create, update, remove, listItems, saveSettings, applySettings,
      tags, tagAssignments, links, setTags, addLink, removeLink, archive, restore, reloadOrganization, insert],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

/**
 * Keep fields the user changed locally after this request was sent (e.g. while typing in a note),
 * so a slower server response does not overwrite newer input.
 */
function pendingFields<T extends object>(local: T, saved: T, patch: Partial<T>): Partial<T> {
  const pending: Partial<T> = {};
  for (const key of Object.keys(patch) as (keyof T)[]) {
    if (local[key] !== patch[key] && local[key] !== saved[key]) pending[key] = local[key];
  }
  return pending;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return context;
}
