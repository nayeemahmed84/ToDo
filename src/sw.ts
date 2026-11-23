/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

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
