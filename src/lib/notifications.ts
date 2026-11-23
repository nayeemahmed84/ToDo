import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  Messaging,
  onMessage,
} from 'firebase/messaging';
import { app, auth, db, isFirebaseConfigured } from './firebase';

const TOKEN_ID_STORAGE_KEY = 'todo-fcm-token-id';
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
const NOTIFY_WORKER_URL = (import.meta.env.VITE_NOTIFY_WORKER_URL as string | undefined)?.replace(/\/+$/, '');

export type NotificationSetupStatus =
  | 'granted'
  | 'denied'
  | 'default'
  | 'unsupported'
  | 'missing-vapid';

let messagingPromise: Promise<Messaging | null> | null = null;

async function getMessagingInstance(): Promise<Messaging | null> {
  if (!isFirebaseConfigured || typeof window === 'undefined') return null;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return null;
  }
  if (!messagingPromise) {
    messagingPromise = isSupported()
      .then((supported) => (supported ? getMessaging(app) : null))
      .catch(() => null);
  }
  return messagingPromise;
}

function getPlatformLabel(): string {
  const ua = navigator.userAgent || '';
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const prefix = isStandalone ? 'pwa' : 'web';
  if (/iPhone|iPad|iPod/i.test(ua)) return `${prefix}-ios`;
  if (/Android/i.test(ua)) return `${prefix}-android`;
  if (/Mac/i.test(ua)) return `${prefix}-mac`;
  if (/Windows/i.test(ua)) return `${prefix}-windows`;
  return `${prefix}-other`;
}

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function isNotificationApiSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator
  );
}

export function isIosNonStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isIos && !isStandalone;
}

export async function registerDevicePushToken(
  uid: string
): Promise<NotificationSetupStatus> {
  if (!isNotificationApiSupported()) return 'unsupported';
  if (Notification.permission !== 'granted') {
    return Notification.permission;
  }
  if (!VAPID_KEY || VAPID_KEY.includes('PASTE_YOUR')) {
    return 'missing-vapid';
  }

  const messaging = await getMessagingInstance();
  if (!messaging) return 'unsupported';

  const serviceWorkerRegistration = await navigator.serviceWorker.ready;
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration,
  });
  if (!token) return 'unsupported';

  const tokenId = await hashToken(token);
  await setDoc(
    doc(db, 'users', uid, 'fcmTokens', tokenId),
    {
      token,
      platform: getPlatformLabel(),
      updatedAtMs: Date.now(),
    },
    { merge: true }
  );
  localStorage.setItem(TOKEN_ID_STORAGE_KEY, tokenId);
  return 'granted';
}

export async function requestAndEnableNotifications(
  uid: string
): Promise<NotificationSetupStatus> {
  if (!isNotificationApiSupported()) return 'unsupported';

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();

  if (permission !== 'granted') {
    return permission;
  }

  return registerDevicePushToken(uid);
}

export async function unregisterDevicePushToken(uid: string): Promise<void> {
  const tokenId = localStorage.getItem(TOKEN_ID_STORAGE_KEY);
  if (tokenId) {
    try {
      await deleteDoc(doc(db, 'users', uid, 'fcmTokens', tokenId));
    } catch {
      // Ignore cleanup failures when offline
    }
    localStorage.removeItem(TOKEN_ID_STORAGE_KEY);
  }

  const messaging = await getMessagingInstance();
  if (messaging) {
    try {
      await deleteToken(messaging);
    } catch {
      // Ignore if no token existed
    }
  }
}

export async function showLocalNotification(
  title: string,
  body: string,
  taskId?: string
): Promise<void> {
  if (!isNotificationApiSupported() || Notification.permission !== 'granted') {
    return;
  }
  const options: NotificationOptions = {
    body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: taskId ? `todo-reminder-${taskId}` : 'todo-reminder',
    data: { url: '/', taskId: taskId ?? null },
  };
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, options);
  } catch {
    new Notification(title, options);
  }
}

export async function subscribeForegroundMessages(): Promise<() => void> {
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};

  return onMessage(messaging, (payload) => {
    const title =
      payload.data?.title || payload.notification?.title || 'ToDo Reminder';
    const body =
      payload.data?.body ||
      payload.notification?.body ||
      'You have a scheduled task reminder.';
    const taskId = payload.data?.taskId;
    void showLocalNotification(title, body, taskId);
  });
}

export async function notifyListCollaborators(params: {
  listId: string;
  itemId?: string;
  action: 'completed' | 'reopened' | 'added';
  text: string;
}): Promise<void> {
  if (!NOTIFY_WORKER_URL || !auth.currentUser) return;
  try {
    const idToken = await auth.currentUser.getIdToken();
    await fetch(`${NOTIFY_WORKER_URL}/notify-share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(params),
    });
  } catch {
    // Non-blocking: ignore offline or network errors
  }
}
