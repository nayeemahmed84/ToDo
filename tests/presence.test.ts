import { describe, expect, it } from 'vitest';
import {
  filterActivePeers,
  formatTypingLabel,
  getPeerInitials,
  getTypingPeers,
  isPeerActivelyTyping,
  ListPresencePeer,
  PRESENCE_TTL_MS,
  TYPING_TTL_MS,
} from '../src/lib/presence';

const NOW = 1_700_000_000_000;

function makePeer(overrides: Partial<ListPresencePeer>): ListPresencePeer {
  return {
    uid: 'user-a',
    displayName: 'Alex Morgan',
    photoURL: null,
    lastActiveAtMs: NOW - 5_000,
    typingContext: null,
    typingTaskId: null,
    typingUpdatedAtMs: null,
    ...overrides,
  };
}

describe('Shared list live presence & typing helpers', () => {
  it('filters out self and stale peers beyond PRESENCE_TTL_MS', () => {
    const peers = [
      makePeer({ uid: 'me', displayName: 'Current User', lastActiveAtMs: NOW - 1_000 }),
      makePeer({ uid: 'fresh', displayName: 'Sam Lee', lastActiveAtMs: NOW - 10_000 }),
      makePeer({ uid: 'stale', displayName: 'Old Peer', lastActiveAtMs: NOW - PRESENCE_TTL_MS - 1 }),
    ];

    const active = filterActivePeers(peers, 'me', NOW);
    expect(active.map((p) => p.uid)).toEqual(['fresh']);
  });

  it('detects active typing and filters by context and taskId', () => {
    const peers = [
      makePeer({
        uid: 'p1',
        displayName: 'Alex Morgan',
        typingContext: 'add-task',
        typingTaskId: null,
        typingUpdatedAtMs: NOW - 1_000,
      }),
      makePeer({
        uid: 'p2',
        displayName: 'Sam Lee',
        typingContext: 'task-notes',
        typingTaskId: 'task-42',
        typingUpdatedAtMs: NOW - 2_000,
      }),
      makePeer({
        uid: 'p3',
        displayName: 'Expired Typer',
        typingContext: 'task-notes',
        typingTaskId: 'task-42',
        typingUpdatedAtMs: NOW - TYPING_TTL_MS - 100,
      }),
    ];

    expect(isPeerActivelyTyping(peers[0], NOW)).toBe(true);
    expect(isPeerActivelyTyping(peers[2], NOW)).toBe(false);

    expect(getTypingPeers(peers, { context: 'add-task' }, NOW).map((p) => p.uid)).toEqual(['p1']);
    expect(getTypingPeers(peers, { taskId: 'task-42' }, NOW).map((p) => p.uid)).toEqual(['p2']);
  });

  it('formats natural typing labels for 1, 2, and 3+ collaborators', () => {
    const p1 = makePeer({ uid: '1', displayName: 'Alex Morgan', typingContext: 'add-task' });
    const p2 = makePeer({ uid: '2', displayName: 'Sam Lee', typingContext: 'add-task' });
    const p3 = makePeer({ uid: '3', displayName: 'Jordan', typingContext: 'task-comment' });
    const p4 = makePeer({ uid: '4', displayName: 'Taylor', typingContext: 'task-comment' });

    expect(formatTypingLabel([])).toBeNull();
    expect(formatTypingLabel([p1])).toBe('Alex is adding a task…');
    expect(formatTypingLabel([p1, p2])).toBe('Alex and Sam are adding tasks…');
    expect(formatTypingLabel([p3, p4, p1], 'task-comment')).toBe(
      'Jordan, Taylor, and 1 other are writing comments…'
    );
  });

  it('computes clean initials for avatars', () => {
    expect(getPeerInitials('Alex Morgan')).toBe('AM');
    expect(getPeerInitials('Alex')).toBe('AL');
    expect(getPeerInitials('   ')).toBe('?');
  });
});
