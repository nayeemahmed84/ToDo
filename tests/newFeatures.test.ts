import { describe, expect, it } from 'vitest';
import { parseTaskInput } from '../src/lib/parseTaskInput';
import { generateIcsCalendar } from '../src/lib/ical';
import { toggleMarkdownChecklistLine } from '../src/lib/markdown';
import { markdownToEditorHtml } from '../src/lib/richNotes';
import { scoreTodoItemMatch } from '../src/lib/search';
import type { TodoItem, TodoList } from '../src/types/todo';

function makeItem(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: 't1',
    listId: 'l1',
    ownerUid: 'u1',
    text: 'Sample task',
    done: false,
    important: false,
    myDayDate: null,
    dueDate: null,
    category: null,
    notes: '',
    steps: [],
    createdAtMs: 1700000000000,
    ...overrides,
  };
}

describe('parseTaskInput metadata extraction', () => {
  it('extracts #tags, !priority, and ~effort alongside natural-language dates', () => {
    const refDate = new Date(2026, 10, 27, 10, 0, 0); // Fri Nov 27 2026
    const res = parseTaskInput('Prepare Q4 deck #work #slides !p1 ~1.5h tomorrow at 9am', refDate);
    expect(res.hasMatch).toBe(true);
    expect(res.title).toBe('Prepare Q4 deck');
    expect(res.tags).toEqual(['work', 'slides']);
    expect(res.priority).toBe('p1');
    expect(res.estimateMinutes).toBe(90);
    expect(res.dueDate).toBe('2026-11-28');
    expect(res.reminderAtMs).not.toBeNull();
  });

  it('deduplicates #tags and maps !urgent / !med aliases', () => {
    const res = parseTaskInput('Fix login bug #Auth #auth !urgent ~25m');
    expect(res.tags).toEqual(['auth']);
    expect(res.priority).toBe('p1');
    expect(res.estimateMinutes).toBe(25);
    expect(res.title).toBe('Fix login bug');
  });
});

describe('generateIcsCalendar', () => {
  const lists: TodoList[] = [{ id: 'l1', title: 'Work', ownerUid: 'u1' }];

  it('generates RFC 5545 VEVENTs for open scheduled tasks and skips done/deleted', () => {
    const items: TodoItem[] = [
      makeItem({
        id: 'open-allday',
        text: 'Submit taxes, form 1040',
        dueDate: '2026-12-01',
        priority: 'p1',
        tags: ['finance'],
        notes: 'Bring W-2',
      }),
      makeItem({
        id: 'open-timed',
        text: 'Standup',
        dueDate: '2026-12-01',
        reminderAtMs: Date.UTC(2026, 11, 1, 15, 0, 0),
        estimateMinutes: 30,
      }),
      makeItem({ id: 'done-task', text: 'Done', dueDate: '2026-12-01', done: true }),
      makeItem({ id: 'trashed-task', text: 'Trashed', dueDate: '2026-12-01', deletedAtMs: 1700000001000 }),
    ];

    const ics = generateIcsCalendar(items, lists, new Date(Date.UTC(2026, 10, 27, 12, 0, 0)));
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('END:VCALENDAR\r\n');
    expect(ics).toContain('UID:open-allday@todo-pwa.local');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261201');
    expect(ics).toContain('DTEND;VALUE=DATE:20261202');
    expect(ics).toContain('SUMMARY:Submit taxes\\, form 1040');
    expect(ics).toContain('PRIORITY:1');
    expect(ics).toContain('CATEGORIES:Work,finance');
    expect(ics).toContain('UID:open-timed@todo-pwa.local');
    expect(ics).toContain('DTSTART:20261201T150000Z');
    expect(ics).toContain('DTEND:20261201T153000Z');
    expect(ics).not.toContain('done-task');
    expect(ics).not.toContain('trashed-task');
  });
});

describe('toggleMarkdownChecklistLine', () => {
  it('toggles a specific checklist line between unchecked and checked', () => {
    const md = '# Plan\n- [ ] First item\n- [x] Second item';
    const toggled1 = toggleMarkdownChecklistLine(md, 1);
    expect(toggled1).toBe('# Plan\n- [x] First item\n- [x] Second item');
    const toggled2 = toggleMarkdownChecklistLine(toggled1, 2);
    expect(toggled2).toBe('# Plan\n- [x] First item\n- [ ] Second item');
  });
});

describe('scoreTodoItemMatch with tags and comments', () => {
  it('matches tasks by tag and by comment body', () => {
    const item = makeItem({
      text: 'Prepare release',
      tags: ['devops', 'launch'],
      comments: [
        { id: 'c1', text: 'Coordinate with QA team', authorUid: 'u1', authorName: 'Alex', createdAtMs: 1 },
      ],
    });
    expect(scoreTodoItemMatch(item, 'devops')).toBeGreaterThan(0);
    expect(scoreTodoItemMatch(item, 'coordinate qa')).toBeGreaterThan(0);
  });
});

describe('markdownToEditorHtml', () => {
  it('converts bold, italic, code, links, bullets, and checklists into WYSIWYG HTML', () => {
    const html = markdownToEditorHtml('**Bold** *italic* `code`\n- Bullet\n- [x] Done\n- [ ] Todo');
    expect(html).toContain('<strong>Bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<ul><li>Bullet</li></ul>');
    expect(html).toContain('rn-check-item is-checked');
    expect(html).toContain('checked');
    expect(html).toContain('Todo');
  });
});
