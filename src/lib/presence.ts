export type TypingContext = 'add-task' | 'task-notes' | 'task-comment';

export interface ListPresencePeer {
  uid: string;
  displayName: string;
  photoURL: string | null;
  lastActiveAtMs: number;
  typingContext: TypingContext | null;
  typingTaskId: string | null;
  typingUpdatedAtMs: number | null;
}

export const PRESENCE_TTL_MS = 60_000;
export const TYPING_TTL_MS = 6_000;
export const HEARTBEAT_INTERVAL_MS = 25_000;
export const TYPING_IDLE_CLEAR_MS = 4_000;
export const TYPING_THROTTLE_MS = 1_500;

export function filterActivePeers(
  peers: ListPresencePeer[],
  currentUid: string | null | undefined,
  nowMs: number = Date.now()
): ListPresencePeer[] {
  return peers
    .filter(
      (peer) =>
        peer.uid !== currentUid &&
        Number.isFinite(peer.lastActiveAtMs) &&
        nowMs - peer.lastActiveAtMs <= PRESENCE_TTL_MS
    )
    .sort((a, b) => b.lastActiveAtMs - a.lastActiveAtMs);
}

export function isPeerActivelyTyping(
  peer: ListPresencePeer,
  nowMs: number = Date.now()
): boolean {
  if (!peer.typingContext || !peer.typingUpdatedAtMs) return false;
  return nowMs - peer.typingUpdatedAtMs <= TYPING_TTL_MS;
}

export function getTypingPeers(
  peers: ListPresencePeer[],
  options: { context?: TypingContext; taskId?: string } = {},
  nowMs: number = Date.now()
): ListPresencePeer[] {
  return peers.filter((peer) => {
    if (!isPeerActivelyTyping(peer, nowMs)) return false;
    if (options.context && peer.typingContext !== options.context) return false;
    if (options.taskId !== undefined && peer.typingTaskId !== options.taskId) return false;
    return true;
  });
}

function firstNameOf(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return 'Someone';
  return trimmed.split(/\s+/)[0] || 'Someone';
}

export function formatTypingLabel(
  typingPeers: ListPresencePeer[],
  contextOverride?: TypingContext
): string | null {
  if (typingPeers.length === 0) return null;
  const names = typingPeers.map((p) => firstNameOf(p.displayName));
  const ctx = contextOverride ?? typingPeers[0].typingContext;

  const verbSingular =
    ctx === 'add-task'
      ? 'is adding a task'
      : ctx === 'task-notes'
        ? 'is editing notes'
        : ctx === 'task-comment'
          ? 'is writing a comment'
          : 'is typing';

  const verbPlural =
    ctx === 'add-task'
      ? 'are adding tasks'
      : ctx === 'task-notes'
        ? 'are editing notes'
        : ctx === 'task-comment'
          ? 'are writing comments'
          : 'are typing';

  if (names.length === 1) {
    return `${names[0]} ${verbSingular}…`;
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]} ${verbPlural}…`;
  }
  return `${names[0]}, ${names[1]}, and ${names.length - 2} other${names.length - 2 === 1 ? '' : 's'} ${verbPlural}…`;
}

export function getPeerInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
