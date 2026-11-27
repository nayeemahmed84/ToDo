export type SmartListId =
  | 'my-day'
  | 'important'
  | 'planned'
  | 'assigned-to-me'
  | 'tasks'
  | 'all'
  | 'completed'
  | 'trash';

export type ViewSelection =
  | { type: 'smart'; id: SmartListId }
  | { type: 'list'; id: string };

export interface TodoGroup {
  id: string;
  title: string;
  ownerUid: string;
  icon?: string | null;
  collapsed?: boolean;
  sortOrder?: number;
}

export interface TodoStep {
  id: string;
  text: string;
  done: boolean;
}

export interface TodoList {
  id: string;
  title: string;
  ownerUid: string;
  isDefaultTasksList?: boolean;
  icon?: string | null;
  groupId?: string | null;
  color?: string;
  background?: 'coast' | 'field' | 'plain' | 'none';
  backgroundImageUrl?: string | null;
  backgroundImagePath?: string | null;
  customBackgroundActive?: boolean;
  memberUids?: string[];
  sortOrder?: number;
  createdAt?: unknown;
}

export type RepeatRule = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly' | 'custom';
export type SortOption = 'position' | 'importance' | 'priority' | 'dueDate' | 'myDay' | 'alphabetical' | 'created';

export type CategoryColor = 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'yellow';
export type TaskPriority = 'p1' | 'p2' | 'p3' | 'p4';

export interface TaskComment {
  id: string;
  text: string;
  authorUid: string;
  authorName: string;
  createdAtMs: number;
}

export interface TaskActivity {
  id: string;
  text: string;
  actorName: string;
  createdAtMs: number;
}

export interface ListTemplateTask {
  text: string;
  notes?: string;
  priority?: TaskPriority | null;
  estimateMinutes?: number | null;
  tags?: string[];
  steps?: { text: string }[];
}

export interface ListTemplate {
  id: string;
  title: string;
  icon?: string | null;
  color?: string;
  background?: TodoList['background'];
  tasks: ListTemplateTask[];
  createdAtMs: number;
}

export interface TodoItem {
  id: string;
  listId: string;
  ownerUid: string;
  text: string;
  done: boolean;
  important: boolean;
  priority?: TaskPriority | null;
  estimateMinutes?: number | null;
  tags?: string[];
  blockedByIds?: string[];
  focusMinutes?: number;
  focusSessions?: number;
  comments?: TaskComment[];
  activity?: TaskActivity[];
  myDayDate: string | null; // YYYY-MM-DD
  dueDate: string | null;   // YYYY-MM-DD
  reminderAtMs?: number | null;
  reminderNotified?: boolean;
  reminderStatus?: 'pending' | 'claimed' | 'delivered' | 'retry' | null;
  reminderClaimedAtMs?: number | null;
  reminderClaimExpiresAtMs?: number | null;
  reminderAttempts?: number;
  reminderNextRetryAtMs?: number | null;
  reminderLastError?: string | null;
  reminderDeliveredTokenIds?: string[];
  repeat?: RepeatRule;
  repeatCustom?: { interval: number; unit: 'days' | 'weeks' | 'months' | 'years'; days: number[] } | null;
  recurrenceSpawned?: boolean;
  assignedTo?: string | null;
  attachments?: { id: string; name: string; size: number; type?: string; missing?: boolean }[];
  category: CategoryColor | null;
  notes: string;
  steps: TodoStep[];
  sortOrder?: number;
  createdAtMs: number;
  updatedAtMs?: number | null;
  createdByName?: string | null;
  updatedByUid?: string | null;
  updatedByName?: string | null;
  completedAtMs?: number | null;
  deletedAtMs?: number | null;
  deletedByUid?: string | null;
  deletedByName?: string | null;
}
