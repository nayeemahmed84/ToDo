import { describe, expect, it } from 'vitest';
import {
  buildNextRecurringItemPayload,
  getNextRepeatDate,
  shiftReminderToDate,
} from '../src/lib/recurrence';
import type { TodoItem } from '../src/types/todo';

describe('getNextRepeatDate', () => {
  it('advances daily, weekly, monthly, and yearly rules', () => {
    expect(getNextRepeatDate({ baseDate: '2026-11-26', rule: 'daily' })).toBe('2026-11-27');
    expect(getNextRepeatDate({ baseDate: '2026-11-26', rule: 'weekly' })).toBe('2026-12-03');
    expect(getNextRepeatDate({ baseDate: '2026-11-26', rule: 'monthly' })).toBe('2026-12-26');
    expect(getNextRepeatDate({ baseDate: '2026-11-26', rule: 'yearly' })).toBe('2027-11-26');
  });

  it('handles weekdays without returning the same date or weekends', () => {
    // 2026-11-26 is Thursday
    expect(getNextRepeatDate({ baseDate: '2026-11-26', rule: 'weekdays' })).toBe('2026-11-27'); // Friday
    expect(getNextRepeatDate({ baseDate: '2026-11-27', rule: 'weekdays' })).toBe('2026-11-30'); // Friday -> Monday
    expect(getNextRepeatDate({ baseDate: '2026-11-28', rule: 'weekdays' })).toBe('2026-11-30'); // Saturday -> Monday
    expect(getNextRepeatDate({ baseDate: '2026-11-29', rule: 'weekdays' })).toBe('2026-11-30'); // Sunday -> Monday
    expect(getNextRepeatDate({ baseDate: '2026-11-30', rule: 'weekdays' })).toBe('2026-12-01'); // Monday -> Tuesday
  });

  it('clamps month-end and leap-day dates cleanly without UTC drift', () => {
    expect(getNextRepeatDate({ baseDate: '2026-01-31', rule: 'monthly' })).toBe('2026-02-28');
    expect(getNextRepeatDate({ baseDate: '2024-01-31', rule: 'monthly' })).toBe('2024-02-29');
    expect(getNextRepeatDate({ baseDate: '2026-03-31', rule: 'monthly' })).toBe('2026-04-30');
    expect(getNextRepeatDate({ baseDate: '2024-02-29', rule: 'yearly' })).toBe('2025-02-28');
    expect(
      getNextRepeatDate({
        baseDate: '2024-02-29',
        rule: 'custom',
        custom: { interval: 4, unit: 'years', days: [] },
      })
    ).toBe('2028-02-29');
  });

  it('handles custom intervals for days, weeks (with selected weekdays), months, and years', () => {
    expect(
      getNextRepeatDate({
        baseDate: '2026-11-26',
        rule: 'custom',
        custom: { interval: 3, unit: 'days', days: [] },
      })
    ).toBe('2026-11-29');

    expect(
      getNextRepeatDate({
        baseDate: '2026-01-31',
        rule: 'custom',
        custom: { interval: 2, unit: 'months', days: [] },
      })
    ).toBe('2026-03-31');

    // Every 2 weeks on Mon(1), Wed(3), Fri(5)
    const biweeklyMWF = { interval: 2, unit: 'weeks' as const, days: [1, 3, 5] };
    // Mon 2026-11-23 -> Wed 2026-11-25 (same week)
    expect(getNextRepeatDate({ baseDate: '2026-11-23', rule: 'custom', custom: biweeklyMWF })).toBe('2026-11-25');
    // Wed 2026-11-25 -> Fri 2026-11-27 (same week)
    expect(getNextRepeatDate({ baseDate: '2026-11-25', rule: 'custom', custom: biweeklyMWF })).toBe('2026-11-27');
    // Fri 2026-11-27 -> Mon 2026-12-07 (2 weeks after Mon Nov 23)
    expect(getNextRepeatDate({ baseDate: '2026-11-27', rule: 'custom', custom: biweeklyMWF })).toBe('2026-12-07');

    // Every 1 week on Monday only: Mon 2026-11-23 -> Mon 2026-11-30
    expect(
      getNextRepeatDate({
        baseDate: '2026-11-23',
        rule: 'custom',
        custom: { interval: 1, unit: 'weeks', days: [1] },
      })
    ).toBe('2026-11-30');
  });

  it('uses referenceDate (completion date) when baseDate is missing', () => {
    expect(
      getNextRepeatDate({
        baseDate: null,
        rule: 'weekdays',
        referenceDate: '2026-11-27', // Friday
      })
    ).toBe('2026-11-30');

    expect(getNextRepeatDate({ baseDate: null, rule: 'none', referenceDate: '2026-11-27' })).toBeNull();
  });
});

describe('buildNextRecurringItemPayload', () => {
  it('preserves recurrence config, notes, category, assignment, and shifts reminder while resetting completion state', () => {
    const reminder = new Date(2026, 10, 27, 9, 30, 0, 0).getTime();
    const item: TodoItem = {
      id: 'task-1',
      listId: 'list-1',
      ownerUid: 'owner-1',
      text: 'Standup prep',
      done: false,
      important: true,
      myDayDate: '2026-11-27',
      dueDate: '2026-11-27',
      reminderAtMs: reminder,
      reminderNotified: true,
      repeat: 'custom',
      repeatCustom: { interval: 2, unit: 'weeks', days: [1, 3, 5] },
      assignedTo: 'member-1',
      attachments: [{ id: 'att-1', name: 'notes.pdf', size: 1234 }],
      category: 'purple',
      notes: 'Review blockers',
      steps: [
        { id: 's1', text: 'Check PRs', done: true },
        { id: 's2', text: 'Update board', done: true },
      ],
      createdAtMs: 1000,
    };

    const next = buildNextRecurringItemPayload({
      item,
      nextDue: '2026-12-07',
      creatorUid: 'member-1',
      creatorName: 'Alex',
      nowMs: 5000,
    });

    expect(next.dueDate).toBe('2026-12-07');
    expect(next.done).toBe(false);
    expect(next.completedAtMs).toBeNull();
    expect(next.myDayDate).toBeNull();
    expect(next.attachments).toEqual([]);
    expect(next.important).toBe(true);
    expect(next.repeat).toBe('custom');
    expect(next.repeatCustom).toEqual({ interval: 2, unit: 'weeks', days: [1, 3, 5] });
    expect(next.assignedTo).toBe('member-1');
    expect(next.category).toBe('purple');
    expect(next.notes).toBe('Review blockers');
    expect(next.steps).toEqual([
      { id: 's1', text: 'Check PRs', done: false },
      { id: 's2', text: 'Update board', done: false },
    ]);
    expect(next.reminderNotified).toBe(false);
    expect(next.reminderStatus).toBe('pending');
    expect(next.recurrenceSpawned).toBe(false);
    expect(next.reminderAtMs).toBe(shiftReminderToDate(reminder, '2026-12-07'));

    const shifted = new Date(next.reminderAtMs!);
    expect(shifted.getFullYear()).toBe(2026);
    expect(shifted.getMonth()).toBe(11); // December
    expect(shifted.getDate()).toBe(7);
    expect(shifted.getHours()).toBe(9);
    expect(shifted.getMinutes()).toBe(30);
  });
});
