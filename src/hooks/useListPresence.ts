import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  filterActivePeers,
  getTypingPeers,
  HEARTBEAT_INTERVAL_MS,
  ListPresencePeer,
  TYPING_IDLE_CLEAR_MS,
  TYPING_THROTTLE_MS,
  TypingContext,
} from '../lib/presence';

interface UseListPresenceParams {
  listId: string | null;
  enabled: boolean;
  user: {
    uid: string;
    displayName: string | null;
    email: string | null;
    photoURL: string | null;
  } | null;
}

export function useListPresence({ listId, enabled, user }: UseListPresenceParams) {
  const [rawPeers, setRawPeers] = useState<ListPresencePeer[]>([]);
  const [tickNow, setTickNow] = useState<number>(() => Date.now());
  const typingStateRef = useRef<{
    context: TypingContext | null;
    taskId: string | null;
    lastSentAtMs: number;
  }>({ context: null, taskId: null, lastSentAtMs: 0 });
  const idleTimerRef = useRef<number | null>(null);

  const writePresence = useCallback(
    async (
      targetListId: string,
      typingContext: TypingContext | null,
      typingTaskId: string | null
    ) => {
      if (!db || !user) return;
      const now = Date.now();
      const presenceRef = doc(db, 'lists', targetListId, 'presence', user.uid);
      try {
        await setDoc(
          presenceRef,
          {
            uid: user.uid,
            displayName: user.displayName || user.email?.split('@')[0] || 'Collaborator',
            photoURL: user.photoURL || null,
            lastActiveAtMs: now,
            typingContext,
            typingTaskId,
            typingUpdatedAtMs: typingContext ? now : null,
          },
          { merge: true }
        );
      } catch {
        // Ignore transient offline or permission errors (e.g. while leaving a list)
      }
    },
    [user]
  );

  // Subscribe to collaborators' presence and maintain heartbeat while viewing a shared list
  useEffect(() => {
    if (!db || !enabled || !listId || !user) {
      setRawPeers([]);
      return;
    }

    const activeListId = listId;
    const presenceCol = collection(db, 'lists', activeListId, 'presence');
    const unsub = onSnapshot(
      presenceCol,
      (snap) => {
        const peers: ListPresencePeer[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            uid: String(data.uid || d.id),
            displayName: String(data.displayName || 'Collaborator'),
            photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
            lastActiveAtMs: Number(data.lastActiveAtMs || 0),
            typingContext:
              data.typingContext === 'add-task' ||
              data.typingContext === 'task-notes' ||
              data.typingContext === 'task-comment'
                ? data.typingContext
                : null,
            typingTaskId: typeof data.typingTaskId === 'string' ? data.typingTaskId : null,
            typingUpdatedAtMs:
              typeof data.typingUpdatedAtMs === 'number' ? data.typingUpdatedAtMs : null,
          };
        });
        setRawPeers(peers);
        setTickNow(Date.now());
      },
      () => {
        setRawPeers([]);
      }
    );

    // Send immediate heartbeat
    void writePresence(activeListId, null, null);

    // Periodic heartbeat while tab is visible
    const heartbeatId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void writePresence(
          activeListId,
          typingStateRef.current.context,
          typingStateRef.current.taskId
        );
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Freshness re-check so stale peers & typing indicators expire promptly
    const freshnessId = window.setInterval(() => {
      setTickNow(Date.now());
    }, 5_000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void writePresence(activeListId, null, null);
      } else if (typingStateRef.current.context) {
        typingStateRef.current = { context: null, taskId: null, lastSentAtMs: 0 };
        void writePresence(activeListId, null, null);
      }
    };

    const cleanupPresence = () => {
      if (!db || !user) return;
      void deleteDoc(doc(db, 'lists', activeListId, 'presence', user.uid)).catch(() => {});
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', cleanupPresence);

    return () => {
      unsub();
      window.clearInterval(heartbeatId);
      window.clearInterval(freshnessId);
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      typingStateRef.current = { context: null, taskId: null, lastSentAtMs: 0 };
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', cleanupPresence);
      cleanupPresence();
    };
  }, [enabled, listId, user, writePresence]);

  const reportTyping = useCallback(
    (context: TypingContext | null, taskId: string | null = null) => {
      if (!enabled || !listId || !user) return;

      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }

      if (!context) {
        if (typingStateRef.current.context !== null) {
          typingStateRef.current = { context: null, taskId: null, lastSentAtMs: 0 };
          void writePresence(listId, null, null);
        }
        return;
      }

      const now = Date.now();
      const sameTarget =
        typingStateRef.current.context === context &&
        typingStateRef.current.taskId === taskId;

      if (!sameTarget || now - typingStateRef.current.lastSentAtMs >= TYPING_THROTTLE_MS) {
        typingStateRef.current = { context, taskId, lastSentAtMs: now };
        void writePresence(listId, context, taskId);
      }

      idleTimerRef.current = window.setTimeout(() => {
        idleTimerRef.current = null;
        if (typingStateRef.current.context !== null) {
          typingStateRef.current = { context: null, taskId: null, lastSentAtMs: 0 };
          void writePresence(listId, null, null);
        }
      }, TYPING_IDLE_CLEAR_MS);
    },
    [enabled, listId, user, writePresence]
  );

  const activePeers = useMemo(
    () => filterActivePeers(rawPeers, user?.uid, tickNow),
    [rawPeers, user?.uid, tickNow]
  );

  const typingInListPeers = useMemo(
    () => getTypingPeers(activePeers, { context: 'add-task' }, tickNow),
    [activePeers, tickNow]
  );

  const getTypingPeersForTask = useCallback(
    (taskId: string) => getTypingPeers(activePeers, { taskId }, tickNow),
    [activePeers, tickNow]
  );

  return {
    activePeers,
    typingInListPeers,
    getTypingPeersForTask,
    reportTyping,
  };
}
