import type { MeetingStatus, ProjectStatus, TaskPriority, TaskStatus } from '@/lib/types';

/** Semantic colors shared by lists, badges, the calendar and filters. */
export const priorityColors: Record<TaskPriority, string> = {
  high: 'hsl(var(--destructive))',
  medium: 'hsl(var(--warning))',
  low: 'hsl(var(--info))',
};

export const statusColors: Record<TaskStatus, string> = {
  todo: 'hsl(var(--muted-foreground))',
  'in-progress': 'hsl(var(--info))',
  done: 'hsl(var(--success))',
};

export const projectStatusColors: Record<ProjectStatus, string> = {
  active: 'hsl(var(--success))',
  on_hold: 'hsl(var(--warning))',
  completed: 'hsl(var(--muted-foreground))',
};

export const meetingStatusColors: Record<MeetingStatus, string> = {
  planned: 'hsl(var(--brand))',
  done: 'hsl(var(--success))',
  cancelled: 'hsl(var(--muted-foreground))',
};
