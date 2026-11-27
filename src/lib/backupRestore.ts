import type { TaskActivity, TaskComment, TaskPriority, TodoItem } from '../types/todo';

export interface RestoredAttachment {
  id: string;
  name: string;
  size: number;
  type?: string;
  missing?: boolean;
  driveFileId?: string;
}

const VALID_PRIORITIES = new Set<TaskPriority>(['p1', 'p2', 'p3', 'p4']);

export function sanitizePriority(value: unknown): TaskPriority | null {
  return typeof value === 'string' && VALID_PRIORITIES.has(value as TaskPriority)
    ? (value as TaskPriority)
    : null;
}

export function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

export function sanitizeComments(value: unknown): TaskComment[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is TaskComment => {
      if (!entry || typeof entry !== 'object') return false;
      const candidate = entry as Partial<TaskComment>;
      return typeof candidate.id === 'string' && typeof candidate.text === 'string';
    })
    .map((c) => ({
      id: c.id,
      text: c.text,
      authorUid: typeof c.authorUid === 'string' ? c.authorUid : '',
      authorName: typeof c.authorName === 'string' ? c.authorName : 'User',
      createdAtMs: typeof c.createdAtMs === 'number' ? c.createdAtMs : Date.now(),
    }));
}

export function sanitizeActivity(value: unknown): TaskActivity[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is TaskActivity => {
      if (!entry || typeof entry !== 'object') return false;
      const candidate = entry as Partial<TaskActivity>;
      return typeof candidate.id === 'string' && typeof candidate.text === 'string';
    })
    .map((a) => ({
      id: a.id,
      text: a.text,
      actorName: typeof a.actorName === 'string' ? a.actorName : 'User',
      createdAtMs: typeof a.createdAtMs === 'number' ? a.createdAtMs : Date.now(),
    }));
}

export function buildRestoredItemPayload(params: {
  item: Partial<TodoItem>;
  targetListId: string;
  ownerUid: string;
  batchId: string;
  remappedAttachments: RestoredAttachment[];
  itemIdMap: Map<string, string>;
}): Record<string, unknown> {
  const { item, targetListId, ownerUid, batchId, remappedAttachments, itemIdMap } = params;
  const remappedBlockedByIds = sanitizeStringArray(item.blockedByIds)
    .map((oldId) => itemIdMap.get(oldId))
    .filter((newId): newId is string => Boolean(newId));

  return {
    listId: targetListId,
    ownerUid,
    text: item.text || 'Untitled task',
    done: Boolean(item.done),
    important: Boolean(item.important),
    priority: sanitizePriority(item.priority),
    estimateMinutes:
      typeof item.estimateMinutes === 'number' && Number.isFinite(item.estimateMinutes) && item.estimateMinutes > 0
        ? item.estimateMinutes
        : null,
    tags: sanitizeStringArray(item.tags),
    blockedByIds: remappedBlockedByIds,
    focusMinutes:
      typeof item.focusMinutes === 'number' && Number.isFinite(item.focusMinutes) && item.focusMinutes >= 0
        ? item.focusMinutes
        : 0,
    focusSessions:
      typeof item.focusSessions === 'number' && Number.isFinite(item.focusSessions) && item.focusSessions >= 0
        ? item.focusSessions
        : 0,
    comments: sanitizeComments(item.comments),
    activity: sanitizeActivity(item.activity),
    myDayDate: item.myDayDate ?? null,
    dueDate: item.dueDate ?? null,
    reminderAtMs: item.reminderAtMs ?? null,
    reminderNotified: typeof item.reminderNotified === 'boolean' ? item.reminderNotified : false,
    reminderStatus: item.reminderAtMs ? (item.reminderNotified ? 'delivered' : 'pending') : null,
    repeat: item.repeat ?? 'none',
    repeatCustom: item.repeatCustom ?? null,
    recurrenceSpawned: Boolean(item.recurrenceSpawned),
    assignedTo: null,
    category: item.category ?? null,
    notes: item.notes ?? '',
    steps: Array.isArray(item.steps) ? item.steps : [],
    attachments: remappedAttachments,
    sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : Date.now(),
    createdAtMs: item.createdAtMs ?? Date.now(),
    updatedAtMs: typeof item.updatedAtMs === 'number' ? item.updatedAtMs : null,
    createdByName: typeof item.createdByName === 'string' ? item.createdByName : null,
    updatedByUid: typeof item.updatedByUid === 'string' ? item.updatedByUid : null,
    updatedByName: typeof item.updatedByName === 'string' ? item.updatedByName : null,
    completedAtMs: item.completedAtMs ?? null,
    deletedAtMs: item.deletedAtMs ?? null,
    importBatchId: batchId,
  };
}
