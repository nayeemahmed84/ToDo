/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// SPA navigation fallback so deep links (e.g. /tasks/important, /tasks/planned) boot offline.
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
        maxEntries: 80,
        maxAgeSeconds: 30 * 24 * 60 * 60,
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
  const title = payload.title || 'ToDo Reminder';
  const body = payload.body || 'You have a scheduled task reminder.';
  const url = payload.url || '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: payload.taskId ? `todo-reminder-${payload.taskId}` : 'todo-reminder',
      data: {
        url,
        taskId: payload.taskId ?? null,
        listId: payload.listId ?? null,
      },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data as { url?: string } | undefined)?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});
