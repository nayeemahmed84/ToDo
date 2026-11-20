export type SmartListId =
  | 'my-day'
  | 'important'
  | 'planned'
  | 'assigned-to-me'
  | 'flagged-email'
  | 'tasks'
  | 'all'
  | 'completed';

export type ViewSelection =
  | { type: 'smart'; id: SmartListId }
  | { type: 'list'; id: string };

export interface TodoGroup {
  id: string;
  title: string;
  ownerUid: string;
  collapsed?: boolean;
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
  groupId?: string | null;
  color?: string;
  createdAt?: unknown;
}

export type RepeatRule = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly' | 'custom';
export type SortOption = 'position' | 'importance' | 'dueDate' | 'myDay' | 'alphabetical' | 'created';

export type CategoryColor = 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'yellow';

export interface TodoItem {
  id: string;
  listId: string;
  ownerUid: string;
  text: string;
  done: boolean;
  important: boolean;
  myDayDate: string | null; // YYYY-MM-DD
  dueDate: string | null;   // YYYY-MM-DD
  reminderAtMs?: number | null;
  repeat?: RepeatRule;
  repeatCustom?: { interval: number; unit: 'days' | 'weeks' | 'months' | 'years'; days: number[] } | null;
  assignedTo?: string | null;
  attachments?: { id: string; name: string; size: number; type?: string }[];
  category: CategoryColor | null;
  notes: string;
  steps: TodoStep[];
  createdAtMs: number;
  updatedAtMs?: number | null;
  completedAtMs?: number | null;
}
