import { describe, expect, it } from 'vitest';
import { parseTaskInput } from '../src/lib/parseTaskInput';

// Fixed local reference clock: Thursday, Nov 26, 2026 at 10:00:00 local time
const FIXED_NOW = new Date(2026, 10, 26, 10, 0, 0, 0);

describe('parseTaskInput', () => {
  it('parses relative dates and times into dueDate and reminderAtMs', () => {
    const res = parseTaskInput('Call mom tomorrow at 3:30pm', FIXED_NOW);
    expect(res.hasMatch).toBe(true);
    expect(res.title).toBe('Call mom');
    expect(res.dueDate).toBe('2026-11-27');
    expect(res.repeat).toBeNull();
    expect(res.reminderAtMs).toBe(new Date(2026, 10, 27, 15, 30, 0, 0).getTime());
  });

  it('parses recurring weekday and named-day phrases', () => {
    const weekday = parseTaskInput('Morning standup every weekday at 9am', FIXED_NOW);
    expect(weekday.title).toBe('Morning standup');
    expect(weekday.repeat).toBe('weekdays');
    expect(weekday.reminderAtMs).toBe(new Date(2026, 10, 27, 9, 0, 0, 0).getTime());

    const monday = parseTaskInput('Team sync every Monday at 10:15am', FIXED_NOW);
    expect(monday.title).toBe('Team sync');
    expect(monday.repeat).toBe('weekly');
    expect(monday.dueDate).toBe('2026-11-30');
    expect(monday.reminderAtMs).toBe(new Date(2026, 10, 30, 10, 15, 0, 0).getTime());
  });

  it('parses explicit ISO and month-day dates', () => {
    const iso = parseTaskInput('File taxes by 2027-04-15', FIXED_NOW);
    expect(iso.title).toBe('File taxes');
    expect(iso.dueDate).toBe('2027-04-15');
    expect(iso.reminderAtMs).toBeNull();

    const monthDay = parseTaskInput('Dentist on Dec 15 at 9:00', FIXED_NOW);
    expect(monthDay.title).toBe('Dentist');
    expect(monthDay.dueDate).toBe('2026-12-15');
    expect(monthDay.reminderAtMs).toBe(new Date(2026, 11, 15, 9, 0, 0, 0).getTime());
  });

  it('schedules time-only inputs for today when future, or tomorrow when past', () => {
    const laterToday = parseTaskInput('Stretch at 4pm', FIXED_NOW);
    expect(laterToday.dueDate).toBe('2026-11-26');
    expect(laterToday.reminderAtMs).toBe(new Date(2026, 10, 26, 16, 0, 0, 0).getTime());

    const earlierToday = parseTaskInput('Take vitamins at 8am', FIXED_NOW);
    expect(earlierToday.dueDate).toBe('2026-11-27');
    expect(earlierToday.reminderAtMs).toBe(new Date(2026, 10, 27, 8, 0, 0, 0).getTime());
  });

  it('leaves plain task text untouched when no schedule phrase is present', () => {
    const plain = parseTaskInput('Buy coffee beans', FIXED_NOW);
    expect(plain).toEqual({
      title: 'Buy coffee beans',
      dueDate: null,
      reminderAtMs: null,
      repeat: null,
      hasMatch: false,
    });
  });
});
