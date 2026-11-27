import { describe, expect, it } from 'vitest';
import { buildRestoredItemPayload } from '../src/lib/backupRestore';
import { matchesSavedFilter, summarizeSavedFilter } from '../src/lib/savedFilters';
import { buildWorkerIcsCalendar, handleIcalFeedRequest } from '../workers/reminder-cron/src/index';
import type { SavedFilter, TodoItem } from '../src/types/todo';

function makeItem(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: 't1',
    listId: 'l1',
    ownerUid: 'u1',
    text: 'Ship release',
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

describe('backup restore parity', () => {
  it('preserves priority, estimates, tags, focus stats, comments, activity, and remaps blockedByIds', () => {
    const itemIdMap = new Map<string, string>([
      ['old-blocker-1', 'new-blocker-1'],
      ['old-blocker-2', 'new-blocker-2'],
    ]);

    const payload = buildRestoredItemPayload({
      item: {
        id: 'old-task',
        text: 'Prepare demo',
        priority: 'p1',
        estimateMinutes: 45,
        tags: ['work', 'launch'],
        blockedByIds: ['old-blocker-1', 'missing-id', 'old-blocker-2'],
        focusMinutes: 50,
        focusSessions: 2,
        comments: [
          { id: 'c1', text: 'Looks good', authorUid: 'u1', authorName: 'Nayeem', createdAtMs: 1000 },
        ],
        activity: [
          { id: 'a1', text: 'Created task', actorName: 'Nayeem', createdAtMs: 900 },
        ],
      },
      targetListId: 'new-list-1',
      ownerUid: 'u1',
      batchId: 'batch-1',
      remappedAttachments: [],
      itemIdMap,
    });

    expect(payload.priority).toBe('p1');
    expect(payload.estimateMinutes).toBe(45);
    expect(payload.tags).toEqual(['work', 'launch']);
    expect(payload.blockedByIds).toEqual(['new-blocker-1', 'new-blocker-2']);
    expect(payload.focusMinutes).toBe(50);
    expect(payload.focusSessions).toBe(2);
    expect((payload.comments as Array<{ text: string }>)[0].text).toBe('Looks good');
    expect((payload.activity as Array<{ text: string }>)[0].text).toBe('Created task');
  });
});

describe('saved smart filters', () => {
  const ctx = {
    todayStr: '2026-11-27',
    incompleteItemIds: new Set(['blocker-1', 't1', 't2']),
  };

  it('filters by priority, tag, max effort, due bucket, and blocked state', () => {
    const flt: SavedFilter = {
      id: 'f1',
      title: 'Quick Work P1',
      priorities: ['p1', 'p2'],
      tags: ['work'],
      maxEstimateMinutes: 30,
      dueBucket: 'today',
      createdAtMs: 1000,
    };

    const matching = makeItem({
      id: 't1',
      priority: 'p1',
      tags: ['work', 'frontend'],
      estimateMinutes: 25,
      dueDate: '2026-11-27',
    });
    const tooLong = makeItem({
      id: 't2',
      priority: 'p1',
      tags: ['work'],
      estimateMinutes: 60,
      dueDate: '2026-11-27',
    });
    const wrongTag = makeItem({
      id: 't3',
      priority: 'p2',
      tags: ['personal'],
      estimateMinutes: 15,
      dueDate: '2026-11-27',
    });

    expect(matchesSavedFilter(matching, flt, ctx)).toBe(true);
    expect(matchesSavedFilter(tooLong, flt, ctx)).toBe(false);
    expect(matchesSavedFilter(wrongTag, flt, ctx)).toBe(false);
    expect(summarizeSavedFilter(flt)).toContain('P1/P2');
    expect(summarizeSavedFilter(flt)).toContain('#work');
    expect(summarizeSavedFilter(flt)).toContain('≤30m');
  });

  it('matches blocked tasks when onlyBlocked is enabled', () => {
    const flt: SavedFilter = {
      id: 'f2',
      title: 'Blocked',
      onlyBlocked: true,
      createdAtMs: 1000,
    };
    const blocked = makeItem({ id: 't1', blockedByIds: ['blocker-1'] });
    const unblocked = makeItem({ id: 't2', blockedByIds: ['completed-task'] });

    expect(matchesSavedFilter(blocked, flt, ctx)).toBe(true);
    expect(matchesSavedFilter(unblocked, flt, ctx)).toBe(false);
  });
});

describe('worker live iCal feed', () => {
  it('generates valid RFC 5545 VCALENDAR output for all-day and timed tasks', () => {
    const ics = buildWorkerIcsCalendar(
      [
        { id: 'task-1', text: 'Pay rent', dueDate: '2026-12-01', priority: 'p1', notes: 'Line 1\nLine 2' },
        {
          id: 'task-2',
          text: 'Doctor visit',
          dueDate: '2026-12-02',
          reminderAtMs: Date.UTC(2026, 11, 2, 15, 30, 0),
        },
      ],
      Date.UTC(2026, 10, 27, 12, 0, 0)
    );

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('X-WR-CALNAME:To Do Tasks');
    expect(ics).toContain('UID:task-1@todo-pwa');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261201');
    expect(ics).toContain('DTEND;VALUE=DATE:20261202');
    expect(ics).toContain('PRIORITY:1');
    expect(ics).toContain('DESCRIPTION:Line 1\\nLine 2');
    expect(ics).toContain('DTSTART:20261202T153000Z');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('rejects malformed or missing tokens with 400', async () => {
    const req = new Request('https://worker.example/ical?token=short');
    const res = await handleIcalFeedRequest(req, {
      FIREBASE_PROJECT_ID: 'demo',
      FIREBASE_CLIENT_EMAIL: 'svc@demo.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: 'unused',
    });
    expect(res.status).toBe(400);
  });
});
