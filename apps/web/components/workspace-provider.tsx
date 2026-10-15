'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { initialWorkspaceData, type WorkspaceData, workspaceStorageKey } from '@/lib/workspace-data';
import { localStorageWorkspaceRepository } from '@/lib/workspace-repository';

type WorkspaceContextValue = {
  data: WorkspaceData;
  updateData: (update: (current: WorkspaceData) => WorkspaceData) => void;
  storageError: string | null;
  loading: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState(initialWorkspaceData);
  const dataRef = useRef(initialWorkspaceData);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorageWorkspaceRepository.load();
      if (stored) {
        dataRef.current = stored;
        setData(stored);
      }
    } catch {
      setStorageError('Lokale Workspace-Daten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateData = useCallback((update: (current: WorkspaceData) => WorkspaceData) => {
    const next = update(dataRef.current);
    dataRef.current = next;
    setData(next);
    try {
      localStorageWorkspaceRepository.save(next);
      setStorageError(null);
    } catch {
      setStorageError('Änderungen konnten nicht lokal gespeichert werden.');
    }
  }, []);

  useEffect(() => {
    const syncFromStorage = (event: StorageEvent) => {
      if (event.key !== workspaceStorageKey) return;
      try {
        const next = event.newValue ? { ...initialWorkspaceData, ...JSON.parse(event.newValue) as WorkspaceData } : initialWorkspaceData;
        dataRef.current = next;
        setData(next);
        setStorageError(null);
      } catch {
        setStorageError('Lokale Workspace-Daten konnten nicht synchronisiert werden.');
      }
    };
    window.addEventListener('storage', syncFromStorage);
    return () => window.removeEventListener('storage', syncFromStorage);
  }, []);

  const value = useMemo(() => ({ data, updateData, storageError, loading }), [data, updateData, storageError, loading]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return context;
}
