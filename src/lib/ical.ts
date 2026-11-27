import type { TodoItem, TodoList } from '../types/todo';

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function formatUtcTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function nextYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}`;
}

function mapPriorityToIcs(priority?: TodoItem['priority']): number | null {
  switch (priority) {
    case 'p1':
      return 1;
    case 'p2':
      return 3;
    case 'p3':
      return 5;
    case 'p4':
      return 9;
    default:
      return null;
  }
}

export function generateIcsCalendar(items: TodoItem[], lists: TodoList[], now = new Date()): string {
  const listTitleById = new Map(lists.map((l) => [l.id, l.title]));
  const dtStamp = formatUtcTimestamp(now);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ToDo PWA//Tasks Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:To Do Tasks',
  ];

  const scheduled = items.filter((item) => !item.deletedAtMs && !item.done && (item.dueDate || item.reminderAtMs));

  for (const item of scheduled) {
    const uid = `${item.id}@todo-pwa.local`;
    const listTitle = listTitleById.get(item.listId) ?? 'Tasks';
    const descParts: string[] = [`List: ${listTitle}`];
    if (item.notes?.trim()) {
      descParts.push(item.notes.trim());
    }
    if (item.steps?.length) {
      descParts.push(
        item.steps.map((s) => `${s.done ? '[x]' : '[ ]'} ${s.text}`).join('\n')
      );
    }
    if (item.estimateMinutes) {
      descParts.push(`Estimated effort: ${item.estimateMinutes} min`);
    }

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${dtStamp}`);

    if (item.reminderAtMs) {
      const start = new Date(item.reminderAtMs);
      const durationMs = Math.max(15, item.estimateMinutes ?? 30) * 60 * 1000;
      const end = new Date(item.reminderAtMs + durationMs);
      lines.push(`DTSTART:${formatUtcTimestamp(start)}`);
      lines.push(`DTEND:${formatUtcTimestamp(end)}`);
    } else if (item.dueDate) {
      const compact = item.dueDate.replace(/-/g, '');
      lines.push(`DTSTART;VALUE=DATE:${compact}`);
      lines.push(`DTEND;VALUE=DATE:${nextYmd(item.dueDate)}`);
    }

    lines.push(`SUMMARY:${escapeIcsText(item.text)}`);
    if (descParts.length) {
      lines.push(`DESCRIPTION:${escapeIcsText(descParts.join('\n\n'))}`);
    }
    const categories = [listTitle, ...(item.tags ?? [])];
    if (categories.length) {
      lines.push(`CATEGORIES:${categories.map(escapeIcsText).join(',')}`);
    }
    const icsPriority = mapPriorityToIcs(item.priority);
    if (icsPriority !== null) {
      lines.push(`PRIORITY:${icsPriority}`);
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

export function downloadIcsFile(items: TodoItem[], lists: TodoList[]): number {
  const scheduledCount = items.filter((i) => !i.deletedAtMs && !i.done && (i.dueDate || i.reminderAtMs)).length;
  const content = generateIcsCalendar(items, lists);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `todo-tasks-${new Date().toISOString().slice(0, 10)}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return scheduledCount;
}
