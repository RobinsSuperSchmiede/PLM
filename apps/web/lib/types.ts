export type Entity = {
  id: string;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
};

/** Entries that can belong to a project; the project acts as their workspace. */
type ProjectScoped = { project_id: string | null };

export type ProjectStatus = 'active' | 'on_hold' | 'completed';
export type Project = Entity & { name: string; description: string | null; status: ProjectStatus };

export type TaskStatus = 'todo' | 'in-progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';
export type Task = Entity & {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  project_id: string | null;
};

export type CalendarEvent = Entity & ProjectScoped & {
  title: string;
  date: string;
  time: string | null;
  location: string | null;
  description: string | null;
};

export type MeetingStatus = 'planned' | 'done' | 'cancelled';
export type Meeting = Entity & ProjectScoped & {
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
export type StoredFile = Entity & { name: string; content_type: string; size: number; kind: FileKind; description: string | null; project_id: string | null };

export type Folder = Entity & { name: string; parent_id: string | null; position: number; pinned: boolean; favorite: boolean };

export type ListItem = Entity & { text: string; done: boolean; position: number };
export type WorkspaceList = Entity & { title: string; category: string; items: ListItem[] };

export type IdeaStatus = 'new' | 'exploring' | 'planned' | 'archived';
export type Idea = Entity & ProjectScoped & { title: string; description: string | null; status: IdeaStatus; tags: string | null };

export type KnowledgeArticle = Entity & ProjectScoped & {
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

export type Language = 'de' | 'en';
export type ThemePreference = 'light' | 'dark' | 'system';
export type SmtpSecurity = 'none' | 'starttls' | 'ssl';

export type AppSettings = {
  language: Language;
  theme: ThemePreference;
  custom_domain: string | null;
  mcp_domain: string | null;
  use_https: boolean;
  mcp_enabled: boolean;
  mcp_require_token: boolean;
  mcp_token: string | null;
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

export type SettingsUpdate = Partial<Omit<AppSettings, 'smtp_password_set' | 'app_url' | 'mcp_url' | 'mcp_local_url' | 'mcp_token'>> & {
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
