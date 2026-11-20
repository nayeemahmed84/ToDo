export type SmartListId = 'my-day' | 'important' | 'planned' | 'tasks';

export type ViewSelection =
  | { type: 'smart'; id: SmartListId }
  | { type: 'list'; id: string };

export interface TodoStep {
  id: string;
  text: string;
  done: boolean;
}

export interface TodoList {
  id: string;
  title: string;
  ownerUid: string;
  color?: string;
  createdAt?: unknown;
}

export type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export type SortOption = 'created' | 'importance' | 'dueDate' | 'alphabetical';

export interface TodoItem {
  id: string;
  listId: string;
  ownerUid: string;
  text: string;
  done: boolean;
  important: boolean;
  myDayDate: string | null; // YYYY-MM-DD
  dueDate: string | null;   // YYYY-MM-DD
  repeat?: RepeatRule;
  notes: string;
  steps: TodoStep[];
  createdAtMs: number;
  completedAtMs?: number | null;
}
