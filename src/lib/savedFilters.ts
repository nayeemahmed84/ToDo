import type { SavedFilter, TaskPriority, TodoItem } from '../types/todo';

export interface SavedFilterContext {
  todayStr: string;
  incompleteItemIds: Set<string>;
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, (d || 1) + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function matchesSavedFilter(
  item: TodoItem,
  filter: SavedFilter,
  ctx: SavedFilterContext
): boolean {
  if (item.deletedAtMs) return false;
  if (!filter.includeCompleted && item.done) return false;

  if (filter.onlyImportant && !item.important) return false;
  if (filter.onlyMyDay && item.myDayDate !== ctx.todayStr) return false;

  if (filter.onlyBlocked) {
    const blockedCount = (item.blockedByIds ?? []).filter((id) => ctx.incompleteItemIds.has(id)).length;
    if (blockedCount === 0) return false;
  }

  if (filter.priorities && filter.priorities.length > 0) {
    if (!item.priority || !filter.priorities.includes(item.priority)) return false;
  }

  if (typeof filter.maxEstimateMinutes === 'number' && filter.maxEstimateMinutes > 0) {
    if (typeof item.estimateMinutes !== 'number' || item.estimateMinutes > filter.maxEstimateMinutes) {
      return false;
    }
  }

  if (filter.tags && filter.tags.length > 0) {
    const itemTags = new Set((item.tags ?? []).map((t) => t.toLowerCase()));
    const hasAll = filter.tags.every((t) => itemTags.has(t.toLowerCase()));
    if (!hasAll) return false;
  }

  if (filter.dueBucket && filter.dueBucket !== 'any') {
    const due = item.dueDate;
    if (filter.dueBucket === 'no-date') {
      if (due) return false;
    } else if (!due) {
      return false;
    } else if (filter.dueBucket === 'overdue') {
      if (due >= ctx.todayStr) return false;
    } else if (filter.dueBucket === 'today') {
      if (due !== ctx.todayStr) return false;
    } else if (filter.dueBucket === 'week') {
      const weekEnd = addDaysYmd(ctx.todayStr, 7);
      if (due < ctx.todayStr || due > weekEnd) return false;
    }
  }

  if (filter.query && filter.query.trim()) {
    const q = filter.query.trim().toLowerCase();
    const haystack = [
      item.text,
      item.notes || '',
      ...(item.tags ?? []),
      ...(item.steps ?? []).map((s) => s.text),
    ]
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  return true;
}

export function summarizeSavedFilter(filter: SavedFilter): string {
  const parts: string[] = [];
  if (filter.priorities?.length) {
    parts.push(filter.priorities.map((p) => p.toUpperCase()).join('/'));
  }
  if (filter.tags?.length) {
    parts.push(filter.tags.map((t) => `#${t}`).join(' '));
  }
  if (typeof filter.maxEstimateMinutes === 'number' && filter.maxEstimateMinutes > 0) {
    parts.push(`≤${filter.maxEstimateMinutes}m`);
  }
  if (filter.dueBucket && filter.dueBucket !== 'any') {
    const labels: Record<string, string> = {
      overdue: 'Overdue',
      today: 'Due today',
      week: 'Next 7 days',
      'no-date': 'No date',
    };
    parts.push(labels[filter.dueBucket] || filter.dueBucket);
  }
  if (filter.onlyBlocked) parts.push('Blocked');
  if (filter.onlyImportant) parts.push('Important');
  if (filter.onlyMyDay) parts.push('My Day');
  if (filter.query?.trim()) parts.push(`"${filter.query.trim()}"`);
  return parts.length > 0 ? parts.join(' · ') : 'All open tasks';
}

export const BUILTIN_FILTER_PRESETS: Array<Omit<SavedFilter, 'id' | 'createdAtMs'>> = [
  {
    title: 'High Priority',
    icon: '🔥',
    priorities: ['p1', 'p2'] as TaskPriority[],
    dueBucket: 'any',
  },
  {
    title: 'Quick Wins (≤15m)',
    icon: '⚡',
    maxEstimateMinutes: 15,
    dueBucket: 'any',
  },
  {
    title: 'Overdue Focus',
    icon: '⏰',
    dueBucket: 'overdue',
  },
  {
    title: 'Waiting / Blocked',
    icon: '⏳',
    onlyBlocked: true,
    dueBucket: 'any',
  },
];
