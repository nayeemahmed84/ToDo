import { describe, expect, it } from 'vitest';
import { normalizeSearchText, scoreTextMatch, scoreTodoItemMatch } from '../src/lib/search';
import type { TodoItem } from '../types/todo';

function makeItem(overrides: Partial<TodoItem>): TodoItem {
  return {
    id: 'item-1',
    listId: 'list-1',
    ownerUid: 'u1',
    text: 'Default task',
    done: false,
    important: false,
    myDayDate: null,
    dueDate: null,
    category: null,
    notes: '',
    steps: [],
    createdAtMs: 1000,
    ...overrides,
  };
}

describe('search normalization and ranking', () => {
  it('normalizes diacritics, punctuation, and casing', () => {
    expect(normalizeSearchText("Café — Don't forget!")).toBe('cafe dont forget');
  });

  it('ranks exact > prefix > substring > fuzzy typo matches', () => {
    const exact = scoreTextMatch('Groceries', 'groceries');
    const prefix = scoreTextMatch('Groceries list', 'groceries');
    const substring = scoreTextMatch('Weekly groceries run', 'groceries');
    const typo = scoreTextMatch('Groceries', 'grocereis');

    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(typo);
    expect(typo).toBeGreaterThan(0);
  });

  it('ranks title matches above step matches, notes matches, and cross-field matches', () => {
    const titleMatch = makeItem({ id: 't1', text: 'Quarterly budget review' });
    const stepMatch = makeItem({
      id: 't2',
      text: 'Finance chores',
      steps: [{ id: 's1', text: 'Quarterly budget review', done: false }],
    });
    const notesMatch = makeItem({
      id: 't3',
      text: 'Admin',
      notes: 'Quarterly budget review',
    });
    const crossFieldMatch = makeItem({
      id: 't4',
      text: 'Quarterly plan',
      notes: 'Review numbers',
    });

    const sTitle = scoreTodoItemMatch(titleMatch, 'quarterly budget');
    const sStep = scoreTodoItemMatch(stepMatch, 'quarterly budget');
    const sNotes = scoreTodoItemMatch(notesMatch, 'quarterly budget');
    const sCross = scoreTodoItemMatch(crossFieldMatch, 'quarterly budget', 'Budget');

    expect(sTitle).toBeGreaterThan(sStep);
    expect(sStep).toBeGreaterThan(sNotes);
    expect(sNotes).toBeGreaterThan(sCross);
    expect(sCross).toBeGreaterThan(0);
  });

  it('returns 0 for empty queries or non-matching tasks', () => {
    const item = makeItem({ text: 'Walk the dog' });
    expect(scoreTodoItemMatch(item, '')).toBe(0);
    expect(scoreTodoItemMatch(item, 'spaceship')).toBe(0);
  });
});
