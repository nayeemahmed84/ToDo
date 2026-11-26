import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../workers/reminder-cron/src/index';

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

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    FIREBASE_PROJECT_ID: 'demo-project',
    FIREBASE_CLIENT_EMAIL: 'worker@demo-project.iam.gserviceaccount.com',
    FIREBASE_PRIVATE_KEY: testPrivateKeyPem,
    REMINDER_RUN_SECRET: 'super-secret-operator-token',
    ...overrides,
  };
}

function mockEmptyReminderRun() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('oauth2.googleapis.com/token')) {
      return Response.json({ access_token: 'mock-access-token' });
    }
    if (url.includes(':runQuery')) {
      return Response.json([]);
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

describe('reminder worker /run endpoint protection', () => {
  it('rejects GET /run with 405 without calling external services', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await worker.fetch(new Request('https://worker.example/run', { method: 'GET' }), makeEnv());
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toContain('POST');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects POST /run without Authorization header with 401 and no side effects', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await worker.fetch(new Request('https://worker.example/run', { method: 'POST' }), makeEnv());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects POST /run when REMINDER_RUN_SECRET is not configured (fail-closed)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await worker.fetch(
      new Request('https://worker.example/run', {
        method: 'POST',
        headers: { Authorization: 'Bearer super-secret-operator-token' },
      }),
      makeEnv({ REMINDER_RUN_SECRET: undefined })
    );
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects POST /run with wrong secret or query parameter secret', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const wrongHeaderRes = await worker.fetch(
      new Request('https://worker.example/run', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-token' },
      }),
      makeEnv()
    );
    expect(wrongHeaderRes.status).toBe(401);

    const querySecretRes = await worker.fetch(
      new Request('https://worker.example/run?secret=super-secret-operator-token', {
        method: 'POST',
      }),
      makeEnv()
    );
    expect(querySecretRes.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('allows authorized POST /run with matching Bearer secret', async () => {
    const fetchSpy = mockEmptyReminderRun();
    const res = await worker.fetch(
      new Request('https://worker.example/run', {
        method: 'POST',
        headers: { Authorization: 'Bearer super-secret-operator-token' },
      }),
      makeEnv()
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ checked: 0, sent: 0 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does not leak internal credentials or errors on authorized /run failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Sensitive OAuth Error Details', { status: 500 })
    );
    const res = await worker.fetch(
      new Request('https://worker.example/run', {
        method: 'POST',
        headers: { Authorization: 'Bearer super-secret-operator-token' },
      }),
      makeEnv()
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Failed to process reminders' });
    expect(JSON.stringify(body)).not.toContain('Sensitive');
  });

  it('runs processDueReminders via scheduled handler without needing REMINDER_RUN_SECRET', async () => {
    const fetchSpy = mockEmptyReminderRun();
    const pending: Promise<unknown>[] = [];
    const ctx = {
      waitUntil(promise: Promise<unknown>) {
        pending.push(promise);
      },
    } as unknown as ExecutionContext;

    await worker.scheduled({} as ScheduledEvent, makeEnv({ REMINDER_RUN_SECRET: undefined }), ctx);
    expect(pending).toHaveLength(1);
    await expect(pending[0]).resolves.toMatchObject({ checked: 0, sent: 0 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
