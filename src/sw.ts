/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

clientsClaim();

// Support graceful update activation when the user clicks "Reload" on the update toast.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// SPA navigation fallback so deep links (e.g. /tasks/important, /tasks/planned, /?action=new-task) boot offline.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/__/, /\/[^/?]+\.[^/]+$/],
  })
);

// Cache Firebase Storage / uploaded background & attachment images for offline viewing.
registerRoute(
  ({ request, url }) =>
    request.destination === 'image' ||
    url.hostname.includes('firebasestorage.googleapis.com') ||
    url.hostname.includes('storage.googleapis.com'),
  new CacheFirst({
    cacheName: 'todo-images-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  })
);

// Cache web fonts with StaleWhileRevalidate for instant offline typography.
registerRoute(
  ({ request }) => request.destination === 'font',
  new StaleWhileRevalidate({
    cacheName: 'todo-fonts-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 365 * 24 * 60 * 60,
      }),
    ],
  })
);

interface PushPayloadData {
  title?: string;
  body?: string;
  url?: string;
  taskId?: string;
  listId?: string;
}

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let raw: { notification?: PushPayloadData; data?: PushPayloadData } = {};
  try {
    raw = event.data.json();
  } catch {
    raw = { data: { title: 'Task Reminder', body: event.data.text() } };
  }

  const payload = raw.data ?? raw.notification ?? {};
  const title = payload.title || 'To Do Reminder';
  const body = payload.body || 'You have a scheduled task reminder.';
  const url = payload.url || '/';

  const actions = payload.taskId
    ? [
        { action: 'complete', title: '✓ Complete' },
        { action: 'snooze-15', title: 'Snooze 15m' },
        { action: 'snooze-60', title: 'Snooze 1h' },
      ]
    : [];

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: payload.taskId ? `todo-reminder-${payload.taskId}` : 'todo-reminder',
      data: {
        url,
        taskId: payload.taskId ?? null,
        listId: payload.listId ?? null,
      },
      ...(actions.length ? { actions } : {}),
    } as NotificationOptions)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = (event.notification.data as { url?: string; taskId?: string | null; listId?: string | null } | undefined) ?? {};
  const action = event.action || '';
  const taskId = data.taskId ?? null;
  const listId = data.listId ?? null;

  let targetUrl = data.url || '/';
  if (action === 'complete' && taskId) {
    targetUrl = `/?action=notif-complete&taskId=${encodeURIComponent(taskId)}${listId ? `&listId=${encodeURIComponent(listId)}` : ''}`;
  } else if ((action === 'snooze-15' || action === 'snooze-60') && taskId) {
    const mins = action === 'snooze-60' ? 60 : 15;
    targetUrl = `/?action=notif-snooze&minutes=${mins}&taskId=${encodeURIComponent(taskId)}${listId ? `&listId=${encodeURIComponent(listId)}` : ''}`;
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            if (!action) {
              await client.focus();
            }
            client.postMessage({
              type: action ? 'NOTIFICATION_ACTION' : 'OPEN_NOTIFICATION',
              action: action || null,
              url: targetUrl,
              taskId,
              listId,
            });
            return client;
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});
