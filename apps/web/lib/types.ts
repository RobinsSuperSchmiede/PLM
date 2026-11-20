export type Entity = {
  id: string;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
};

/** Entries that can belong to a project; the project acts as their workspace. */
type ProjectScoped = { project_id: string | null };
/** Entries that can be filed in an explorer folder. */
type FolderScoped = { folder_id: string | null };

export type ProjectStatus = 'active' | 'on_hold' | 'completed';
export type Project = Entity & FolderScoped & { name: string; description: string | null; status: ProjectStatus; pinned: boolean; cover_file_id: string | null };

export type TaskStatus = 'todo' | 'in-progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';
export type Task = Entity & FolderScoped & {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  project_id: string | null;
};

export type CalendarEvent = Entity & ProjectScoped & FolderScoped & {
  title: string;
  date: string;
  time: string | null;
  location: string | null;
  description: string | null;
};

export type MeetingStatus = 'planned' | 'done' | 'cancelled';
export type Meeting = Entity & ProjectScoped & FolderScoped & {
  title: string;
  date: string;
  time: string | null;
  attendees: string | null;
  agenda: string | null;
  notes: string | null;
  status: MeetingStatus;
};

export type NoteSource = 'app' | 'telegram' | 'mcp';
export type Note = Entity & ProjectScoped & {
  title: string;
  content: string | null;
  folder_id: string | null;
  pinned: boolean;
  source: NoteSource;
};

export type FileKind = 'image' | 'pdf' | 'document' | 'spreadsheet' | 'presentation';
/** A web page attached to a project (browser extension or added by hand), with an optional screenshot. */
export type Website = Entity & {
  url: string;
  title: string;
  description: string | null;
  favicon_url: string | null;
  project_id: string | null;
  screenshot_id: string | null;
};

/** A sticky note the browser extension shows on a web page. */
export type WebNote = Entity & {
  url: string;
  origin: string;
  scope: 'page' | 'site';
  page_title: string | null;
  text: string;
  color: string;
  minimized: boolean;
  pinned: boolean;
  project_id: string | null;
};

export type StoredFile = Entity & FolderScoped & { name: string; content_type: string; size: number; kind: FileKind; description: string | null; project_id: string | null };

export type Folder = Entity & { name: string; parent_id: string | null; position: number; pinned: boolean; favorite: boolean };

export type ListItem = Entity & { text: string; done: boolean; position: number };
export type WorkspaceList = Entity & { title: string; category: string; pinned: boolean; items: ListItem[] };

export type IdeaStatus = 'new' | 'exploring' | 'planned' | 'archived';
export type Idea = Entity & ProjectScoped & FolderScoped & { title: string; description: string | null; status: IdeaStatus; tags: string | null };

export type KnowledgeArticle = Entity & ProjectScoped & FolderScoped & {
  title: string;
  content: string | null;
  category: string | null;
  source_url: string | null;
};

export type DbRecord = Entity & { name: string; status: string };

export type RepeatRule = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly';
/** remind_at is local wall-clock time (YYYY-MM-DDTHH:MM:SS) in the timezone configured for notifications. */
export type Reminder = Entity & { text: string; remind_at: string; repeat: RepeatRule; done: boolean; last_sent_at: string | null };

export type TelegramSettings = {
  enabled: boolean;
  token_set: boolean;
  bot_username: string | null;
  linked: boolean;
  chat_name: string | null;
  link_code: string;
  link_url: string | null;
  commands_enabled: boolean;
  timezone: string;
  daily_digest: boolean;
  digest_time: string;
  event_reminder_minutes: number;
  login_2fa: boolean;
};

export type TelegramUpdate = Partial<Pick<TelegramSettings, 'enabled' | 'commands_enabled' | 'timezone' | 'daily_digest' | 'digest_time' | 'event_reminder_minutes' | 'login_2fa'>> & {
  bot_token?: string;
};

export type Language = 'de' | 'en' | 'zh' | 'es' | 'pt' | 'ja';
export type ThemePreference = 'light' | 'dark' | 'system';
export type SmtpSecurity = 'none' | 'starttls' | 'ssl';

export type AppSettings = {
  language: Language;
  theme: ThemePreference;
  onboarding_done: boolean;
  custom_domain: string | null;
  mcp_domain: string | null;
  use_https: boolean;
  mcp_enabled: boolean;
  mcp_require_token: boolean;
  mcp_token: string | null;
  browser_token: string | null;
  smtp_host: string | null;
  smtp_port: number;
  smtp_username: string | null;
  smtp_password_set: boolean;
  smtp_security: SmtpSecurity;
  email_from_name: string | null;
  email_from_address: string | null;
  app_url: string | null;
  mcp_url: string;
  mcp_local_url: string;
};

export type SettingsUpdate = Partial<Omit<AppSettings, 'smtp_password_set' | 'app_url' | 'mcp_url' | 'mcp_local_url' | 'mcp_token' | 'browser_token'>> & {
  smtp_password?: string;
};

export type DomainCheck = { domain: string; resolves: boolean; addresses: string[]; points_to_local: boolean };

export type Overview = { database: string; tables: Record<string, number> };

export type Collections = {
  projects: Project[];
  tasks: Task[];
  events: CalendarEvent[];
  meetings: Meeting[];
  notes: Note[];
  lists: WorkspaceList[];
  ideas: Idea[];
  knowledge: KnowledgeArticle[];
  records: DbRecord[];
  reminders: Reminder[];
  folders: Folder[];
  files: StoredFile[];
  websites: Website[];
};

export type ResourceName = keyof Collections;
export type ResourceItem<R extends ResourceName> = Collections[R][number];

/** Entry types that can be tagged, linked, archived and shown in the graph. */
export type EntityType = 'note' | 'task' | 'event' | 'meeting' | 'project' | 'knowledge' | 'idea' | 'folder' | 'file';
export type EntityRef = { type: EntityType; id: string };

export type Tag = { id: string; name: string; color: string | null; count: number };
export type TagAssignment = { tag_id: string; entity_type: EntityType; entity_id: string };
export type EntityLink = { id: string; source_type: EntityType; source_id: string; target_type: EntityType; target_id: string; created_at: string };

export type ArchivedItem = { type: EntityType; id: string; title: string; preview: string | null; archived_at: string; project_id: string | null };

export type ActivityAction = 'create' | 'update' | 'archive' | 'restore' | 'delete';
export type ActivityEntry = {
  id: number;
  at: string;
  action: ActivityAction;
  entity_type: EntityType;
  entity_id: string;
  title: string | null;
  project_id: string | null;
  source: string;
};

/** One row of the data warehouse: something that happened to an entry. */
export type WarehouseAction = ActivityAction | 'snapshot';
export type WarehouseEvent = {
  id: number;
  at: string;
  action: WarehouseAction;
  entity_type: EntityType;
  entity_id: string;
  title: string | null;
  project_id: string | null;
  source: string;
  has_snapshot: boolean;
  /** Names of the changed fields (lists) … */
  changed?: string[];
  /** … or the changes themselves with old and new value, and the entry as it was afterwards (history of one entry). */
  changes?: Record<string, [unknown, unknown]>;
  snapshot?: Record<string, unknown> | null;
  restorable?: boolean;
};
export type WarehouseEvents = { total: number; items: WarehouseEvent[] };
export type WarehouseHistory = {
  type: EntityType;
  id: string;
  title: string | null;
  state: 'active' | 'archived' | 'deleted';
  restorable: boolean;
  snapshot: Record<string, unknown> | null;
  timeline: WarehouseEvent[];
};
export type WarehouseSummary = {
  generated_at: string;
  first_at: string | null;
  events: number;
  versions: number;
  by_type: Record<EntityType, { active: number; archived: number; deleted: number; events: number }>;
  by_action: Partial<Record<ActivityAction, number>>;
  by_source: Record<string, number>;
  months: Record<string, Partial<Record<ActivityAction, number>>>;
};

export type TelegramLogEntry = {
  id: number;
  at: string;
  direction: 'in' | 'out';
  text: string;
  entity_type: EntityType | null;
  entity_id: string | null;
  project_id: string | null;
};

export type Stats = {
  generated_at: string;
  counts: Record<EntityType | 'reminder' | 'tag' | 'link', number>;
  archived: Record<EntityType, number>;
  tasks_done: number;
  activity: Record<string, Partial<Record<ActivityAction, number>>>;
  activity_by_type: Partial<Record<EntityType, number>>;
  activity_by_source: Record<string, number>;
  api_calls: Record<string, Partial<Record<'api' | 'mcp', number>>>;
  telegram: { connected: boolean; bot_username: string | null; days: Record<string, Partial<Record<'in' | 'out', number>>>; total_in: number; total_out: number };
  database: { engine: string; size: number | null };
  storage: { files: number; files_archived: number };
  task_status: Partial<Record<TaskStatus, number>>;
  meeting_status: Partial<Record<MeetingStatus, number>>;
  /** Entries created per day (last 60 days), by type. */
  created: Record<string, Partial<Record<EntityType, number>>>;
  web: { notes: number; websites: number };
  scheduler_enabled: boolean;
};

export type DbColumn = {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  primary_key: boolean;
  unique: boolean;
  indexed: boolean;
  foreign_key: DbForeignKey | null;
};
export type DbForeignKey = { column: string; references_table: string; references_column: string };
export type DbTable = { name: string; rows: number; size: number | null; columns: DbColumn[]; foreign_keys: DbForeignKey[]; last_change: string | null; changes_7d: number };
export type DbSchema = { engine: string; size: number | null; tables: DbTable[]; total_rows: number };
export type DbRows = { columns: string[]; rows: Record<string, unknown>[]; total: number };
