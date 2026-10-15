export type TaskStatus = 'todo' | 'in-progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export type WorkspaceTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due: string;
};

export type WorkspaceEvent = {
  id: string;
  title: string;
  date: string;
  time: string;
};

export type WorkspaceNote = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
};

export type WorkspaceList = {
  id: string;
  title: string;
  category: string;
  items: { id: string; text: string; done: boolean }[];
};

export type DatabaseRecord = {
  id: string;
  name: string;
  status: string;
  updated: string;
};

export type WorkspaceData = {
  tasks: WorkspaceTask[];
  events: WorkspaceEvent[];
  notes: WorkspaceNote[];
  lists: WorkspaceList[];
  records: DatabaseRecord[];
};

export const toLocalDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);

export const initialWorkspaceData: WorkspaceData = {
  tasks: [
    { id: 'task-1', title: 'Finalize the product roadmap', status: 'in-progress', priority: 'high', due: 'Today' },
    { id: 'task-2', title: 'Review workspace structure', status: 'todo', priority: 'medium', due: 'Tomorrow' },
    { id: 'task-3', title: 'Capture research findings', status: 'done', priority: 'low', due: 'Yesterday' },
  ],
  events: [
    { id: 'event-1', title: 'Weekly planning', date: toLocalDateKey(new Date()), time: '09:30' },
    { id: 'event-2', title: 'Focus session', date: toLocalDateKey(new Date()), time: '13:00' },
    { id: 'event-3', title: 'Project review', date: toLocalDateKey(tomorrow), time: '10:00' },
  ],
  notes: [
    { id: 'note-1', title: 'Product direction', body: 'Keep the workspace focused, calm, and useful.', updatedAt: 'Today' },
    { id: 'note-2', title: 'Research notes', body: 'Ideas and findings to revisit during planning.', updatedAt: 'Yesterday' },
  ],
  lists: [
    { id: 'list-1', title: 'Weekly priorities', category: 'Planning', items: [{ id: 'item-1', text: 'Review project goals', done: false }, { id: 'item-2', text: 'Prepare the next sprint', done: true }, { id: 'item-3', text: 'Clear the inbox', done: false }] },
    { id: 'list-2', title: 'Reading list', category: 'Personal', items: [{ id: 'item-4', text: 'Designing Data-Intensive Applications', done: false }, { id: 'item-5', text: 'The Shape of Design', done: false }] },
  ],
  records: [
    { id: 'row-1', name: 'Workspace', status: 'Active', updated: 'Today' },
    { id: 'row-2', name: 'Product roadmap', status: 'In progress', updated: 'Yesterday' },
    { id: 'row-3', name: 'Research archive', status: 'Review', updated: 'Oct 10' },
  ],
};

export const workspaceStorageKey = 'plm-workspace-data';
