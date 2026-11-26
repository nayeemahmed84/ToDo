import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  isPermanentInvalidTokenError,
  processDueReminders,
  type Env,
} from '../workers/reminder-cron/src/index';

let testPrivateKeyPem = '';

beforeAll(() => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  testPrivateKeyPem = privateKey;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeEnv(): Env {
  return {
    FIREBASE_PROJECT_ID: 'demo-project',
    FIREBASE_CLIENT_EMAIL: 'worker@demo-project.iam.gserviceaccount.com',
    FIREBASE_PRIVATE_KEY: testPrivateKeyPem,
  };
}

function makeItemDoc(
  id: string,
  extraFields: Record<string, unknown> = {},
  updateTime = '2026-11-26T10:00:00.000Z'
) {
  return {
    document: {
      name: `projects/demo-project/databases/(default)/documents/lists/list-1/items/${id}`,
      updateTime,
      fields: {
        ownerUid: { stringValue: 'user-1' },
        listId: { stringValue: 'list-1' },
        text: { stringValue: `Task ${id}` },
        done: { booleanValue: false },
        reminderNotified: { booleanValue: false },
        reminderAtMs: { integerValue: '1000000' },
        ...extraFields,
      },
    },
  };
}

describe('isPermanentInvalidTokenError', () => {
  it('identifies UNREGISTERED and invalid registration token errors only', () => {
    expect(
      isPermanentInvalidTokenError(
        404,
        JSON.stringify({
          error: {
            code: 404,
            status: 'NOT_FOUND',
            details: [{ errorCode: 'UNREGISTERED' }],
          },
        })
      )
    ).toBe(true);

    expect(
      isPermanentInvalidTokenError(
        400,
        JSON.stringify({
          error: {
            code: 400,
            status: 'INVALID_ARGUMENT',
            message: 'The registration token is not a valid FCM registration token',
          },
        })
      )
    ).toBe(true);

    // Generic 400 (e.g. malformed payload) must NOT delete token
    expect(
      isPermanentInvalidTokenError(
        400,
        JSON.stringify({
          error: {
            code: 400,
            status: 'INVALID_ARGUMENT',
            message: 'Invalid message payload field',
          },
        })
      )
    ).toBe(false);

    // Transient 503 must NOT delete token
    expect(isPermanentInvalidTokenError(503, JSON.stringify({ error: { status: 'UNAVAILABLE' } }))).toBe(false);
  });
});

describe('processDueReminders reliability', () => {
  it('keeps reminder retryable when user has no device tokens', async () => {
    const patches: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('oauth2.googleapis.com/token')) {
        return Response.json({ access_token: 'tok' });
      }
      if (url.includes(':runQuery')) {
        return Response.json([makeItemDoc('task-empty-tokens')]);
      }
      if (url.includes('/fcmTokens')) {
        return Response.json({ documents: [] });
      }
      if (init?.method === 'PATCH') {
        patches.push({ url, body: JSON.parse(String(init.body)) });
        return Response.json({});
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await processDueReminders(makeEnv(), { nowMs: 2_000_000 });
    expect(result).toMatchObject({ checked: 1, claimed: 1, sent: 0, delivered: 0, retried: 1 });

    const finalPatch = patches[patches.length - 1].body.fields as Record<string, Record<string, unknown>>;
    expect(finalPatch.reminderNotified).toEqual({ booleanValue: false });
    expect(finalPatch.reminderStatus).toEqual({ stringValue: 'retry' });
    expect(finalPatch.reminderLastError).toEqual({ stringValue: 'NO_DEVICE_TOKENS' });
  });

  it('keeps reminder retryable when token lookup fails transiently', async () => {
    const patches: Array<{ body: Record<string, unknown> }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'tok' });
      if (url.includes(':runQuery')) return Response.json([makeItemDoc('task-token-503')]);
      if (url.includes('/fcmTokens')) return new Response('Service Unavailable', { status: 503 });
      if (init?.method === 'PATCH') {
        patches.push({ body: JSON.parse(String(init.body)) });
        return Response.json({});
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await processDueReminders(makeEnv(), { nowMs: 2_000_000 });
    expect(result).toMatchObject({ checked: 1, claimed: 1, sent: 0, delivered: 0, retried: 1 });
    const finalPatch = patches[patches.length - 1].body.fields as Record<string, Record<string, unknown>>;
    expect(finalPatch.reminderNotified).toEqual({ booleanValue: false });
    expect(finalPatch.reminderLastError).toEqual({ stringValue: 'TOKEN_LOOKUP_503' });
  });

  it('handles mixed token success, UNREGISTERED removal, generic 400 retention, and per-device dedup on retry', async () => {
    const deletedUrls: string[] = [];
    const sentTokens: string[] = [];
    const patches: Array<{ body: Record<string, unknown> }> = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'tok' });
      if (url.includes(':runQuery')) return Response.json([makeItemDoc('task-mixed')]);
      if (url.includes('/fcmTokens') && (!init?.method || init.method === 'GET')) {
        return Response.json({
          documents: [
            { name: 'projects/demo-project/databases/(default)/documents/users/user-1/fcmTokens/tok-ok', fields: { token: { stringValue: 'fcm-ok' } } },
            { name: 'projects/demo-project/databases/(default)/documents/users/user-1/fcmTokens/tok-dead', fields: { token: { stringValue: 'fcm-dead' } } },
            { name: 'projects/demo-project/databases/(default)/documents/users/user-1/fcmTokens/tok-transient', fields: { token: { stringValue: 'fcm-transient' } } },
            { name: 'projects/demo-project/databases/(default)/documents/users/user-1/fcmTokens/tok-generic-400', fields: { token: { stringValue: 'fcm-generic-400' } } },
          ],
        });
      }
      if (url.includes('messages:send')) {
        const body = JSON.parse(String(init?.body)) as { message: { token: string } };
        sentTokens.push(body.message.token);
        if (body.message.token === 'fcm-ok') return Response.json({ name: 'msg/1' });
        if (body.message.token === 'fcm-dead') {
          return new Response(
            JSON.stringify({ error: { code: 404, status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }),
            { status: 404 }
          );
        }
        if (body.message.token === 'fcm-generic-400') {
          return new Response(
            JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Payload too large' } }),
            { status: 400 }
          );
        }
        return new Response('Internal error', { status: 503 });
      }
      if (init?.method === 'DELETE') {
        deletedUrls.push(url);
        return Response.json({});
      }
      if (init?.method === 'PATCH') {
        patches.push({ body: JSON.parse(String(init.body)) });
        return Response.json({});
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await processDueReminders(makeEnv(), { nowMs: 2_000_000 });
    expect(result).toMatchObject({ checked: 1, claimed: 1, sent: 1, delivered: 0, retried: 1 });
    // Only the UNREGISTERED token was deleted; generic 400 and 503 tokens were NOT deleted
    expect(deletedUrls).toHaveLength(1);
    expect(deletedUrls[0]).toContain('tok-dead');

    // Final patch recorded tok-ok as already delivered so retries won't re-notify it
    const finalPatch = patches[patches.length - 1].body.fields as Record<string, unknown>;
    expect(finalPatch.reminderNotified).toEqual({ booleanValue: false });
    expect(finalPatch.reminderStatus).toEqual({ stringValue: 'retry' });
    expect(finalPatch.reminderDeliveredTokenIds).toEqual({
      arrayValue: { values: [{ stringValue: 'tok-ok' }] },
    });

    // Simulate second run where tok-ok is already in reminderDeliveredTokenIds and remaining device succeeds
    sentTokens.length = 0;
    patches.length = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'tok' });
      if (url.includes(':runQuery')) {
        return Response.json([
          makeItemDoc('task-mixed', {
            reminderStatus: { stringValue: 'retry' },
            reminderDeliveredTokenIds: { arrayValue: { values: [{ stringValue: 'tok-ok' }] } },
            reminderNextRetryAtMs: { integerValue: '2060000' },
          }),
        ]);
      }
      if (url.includes('/fcmTokens')) {
        return Response.json({
          documents: [
            { name: 'projects/demo-project/databases/(default)/documents/users/user-1/fcmTokens/tok-ok', fields: { token: { stringValue: 'fcm-ok' } } },
            { name: 'projects/demo-project/databases/(default)/documents/users/user-1/fcmTokens/tok-transient', fields: { token: { stringValue: 'fcm-transient' } } },
          ],
        });
      }
      if (url.includes('messages:send')) {
        const body = JSON.parse(String(init?.body)) as { message: { token: string } };
        sentTokens.push(body.message.token);
        return Response.json({ name: 'msg/2' });
      }
      if (init?.method === 'PATCH') {
        patches.push({ body: JSON.parse(String(init.body)) });
        return Response.json({});
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const retryResult = await processDueReminders(makeEnv(), { nowMs: 2_100_000 });
    expect(retryResult).toMatchObject({ checked: 1, claimed: 1, sent: 1, delivered: 1, retried: 0 });
    // tok-ok was NOT re-notified!
    expect(sentTokens).toEqual(['fcm-transient']);
    const deliveredPatch = patches[patches.length - 1].body.fields as Record<string, unknown>;
    expect(deliveredPatch.reminderNotified).toEqual({ booleanValue: true });
    expect(deliveredPatch.reminderStatus).toEqual({ stringValue: 'delivered' });
  });

  it('skips active claims and recovers expired claims automatically', async () => {
    const sentForTasks: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'tok' });
      if (url.includes(':runQuery')) {
        return Response.json([
          makeItemDoc('task-active-claim', {
            reminderStatus: { stringValue: 'claimed' },
            reminderClaimExpiresAtMs: { integerValue: '2500000' }, // still valid at nowMs=2000000
          }),
          makeItemDoc('task-expired-claim', {
            reminderStatus: { stringValue: 'claimed' },
            reminderClaimExpiresAtMs: { integerValue: '1900000' }, // expired at nowMs=2000000
          }),
        ]);
      }
      if (url.includes('/fcmTokens')) {
        return Response.json({
          documents: [
            { name: 'projects/demo-project/databases/(default)/documents/users/user-1/fcmTokens/tok-1', fields: { token: { stringValue: 'fcm-1' } } },
          ],
        });
      }
      if (url.includes('messages:send')) {
        const body = JSON.parse(String(init?.body)) as { message: { data: { taskId: string } } };
        sentForTasks.push(body.message.data.taskId);
        return Response.json({ name: 'msg/1' });
      }
      if (init?.method === 'PATCH') return Response.json({});
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await processDueReminders(makeEnv(), { nowMs: 2_000_000 });
    expect(result).toMatchObject({ checked: 2, claimed: 1, sent: 1, delivered: 1, skipped: 1 });
    expect(sentForTasks).toEqual(['task-expired-claim']);
  });

  it('paginates across multiple batches so >100 due tasks are processed without starvation', async () => {
    let queryCount = 0;
    const seenCursors: unknown[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'tok' });
      if (url.includes(':runQuery')) {
        const body = JSON.parse(String(init?.body)) as { structuredQuery: { startAt?: unknown } };
        seenCursors.push(body.structuredQuery.startAt ?? null);
        queryCount++;
        if (queryCount === 1) {
          return Response.json([makeItemDoc('task-1'), makeItemDoc('task-2')]);
        }
        if (queryCount === 2) {
          return Response.json([makeItemDoc('task-3')]);
        }
        return Response.json([]);
      }
      if (url.includes('/fcmTokens')) {
        return Response.json({
          documents: [
            { name: 'projects/demo-project/databases/(default)/documents/users/user-1/fcmTokens/tok-1', fields: { token: { stringValue: 'fcm-1' } } },
          ],
        });
      }
      if (url.includes('messages:send')) return Response.json({ name: 'msg/ok' });
      if (init?.method === 'PATCH') return Response.json({});
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await processDueReminders(makeEnv(), {
      nowMs: 2_000_000,
      pageSize: 2,
      maxBatches: 5,
    });
    expect(result).toMatchObject({
      checked: 3,
      claimed: 3,
      sent: 3,
      delivered: 3,
      batches: 2,
      hasMore: false,
    });
    expect(seenCursors[0]).toBeNull();
    expect(seenCursors[1]).toEqual({
      values: [
        { integerValue: '1000000' },
        { referenceValue: 'projects/demo-project/databases/(default)/documents/lists/list-1/items/task-2' },
      ],
      before: false,
    });
  });
});
