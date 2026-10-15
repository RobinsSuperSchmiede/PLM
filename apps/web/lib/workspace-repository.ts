import { initialWorkspaceData, type WorkspaceData, workspaceStorageKey } from '@/lib/workspace-data';

export interface WorkspaceRepository {
  load(): WorkspaceData | null;
  save(data: WorkspaceData): void;
}

export const localStorageWorkspaceRepository: WorkspaceRepository = {
  load() {
    const stored = window.localStorage.getItem(workspaceStorageKey);
    return stored ? { ...initialWorkspaceData, ...JSON.parse(stored) as WorkspaceData } : null;
  },
  save(data) {
    window.localStorage.setItem(workspaceStorageKey, JSON.stringify(data));
  },
};
