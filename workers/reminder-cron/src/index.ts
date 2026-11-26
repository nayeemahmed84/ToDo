export interface Env {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  REMINDER_RUN_SECRET?: string;
}

/**
 * Reminder delivery state model (stored on each item document):
 * - reminderNotified: boolean (false while pending/claimed/retrying; true once delivered)
 * - reminderStatus: 'pending' | 'claimed' | 'delivered' | 'retry'
 * - reminderClaimedAtMs: number | null (lease acquisition time)
 * - reminderClaimExpiresAtMs: number | null (lease expiration; expired claims recover automatically)
 * - reminderAttempts: number (retry count)
 * - reminderNextRetryAtMs: number | null (earliest timestamp for next retry)
 * - reminderLastError: string | null (short error code, never raw credentials/tokens)
 * - reminderDeliveredTokenIds: string[] (device token doc IDs that already accepted this reminder)
 *
 * Delivery policy: per-device at-least-once with deduplication via reminderDeliveredTokenIds.
 * If a worker crashes after FCM accepts a message but before Firestore records success, the lease
 * expires and a subsequent run retries; once recorded in reminderDeliveredTokenIds, that device is
 * skipped on retries for other failing devices.
 */
export const REMINDER_LEASE_MS = 2 * 60 * 1000; // 2 minutes
export const REMINDER_DEFAULT_PAGE_SIZE = 100;
export const REMINDER_DEFAULT_MAX_BATCHES = 10;
export const REMINDER_MAX_RETRY_ATTEMPTS = 8;

interface FirestoreFieldValue {
  stringValue?: string;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  nullValue?: null;
  arrayValue?: { values?: FirestoreFieldValue[] };
  referenceValue?: string;
}

interface FirestoreDocument {
  name: string;
  updateTime?: string;
  fields?: Record<string, FirestoreFieldValue>;
}

interface FirestoreRunQueryRow {
  document?: FirestoreDocument;
}

export interface ProcessDueRemindersOptions {
  nowMs?: number;
  pageSize?: number;
  maxBatches?: number;
  leaseDurationMs?: number;
}

export interface ProcessDueRemindersResult {
  checked: number;
  claimed: number;
  sent: number;
  delivered: number;
  retried: number;
  skipped: number;
  batches: number;
  hasMore: boolean;
}

export function computeRetryBackoffMs(attempts: number): number {
  const clamped = Math.max(1, Math.min(attempts, REMINDER_MAX_RETRY_ATTEMPTS));
  // 1m, 2m, 4m, 8m, 16m, 32m, 60m, 60m
  return Math.min(60 * 60 * 1000, Math.pow(2, clamped - 1) * 60 * 1000);
}

export function isPermanentInvalidTokenError(status: number, bodyText: string): boolean {
  if (status !== 400 && status !== 404) return false;
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: {
        message?: string;
        status?: string;
        details?: Array<{ errorCode?: string }>;
      };
    };
    const errorCodes = (parsed.error?.details ?? [])
      .map((d) => d.errorCode)
      .filter((c): c is string => Boolean(c));
    if (errorCodes.includes('UNREGISTERED')) {
      return true;
    }
    const msg = (parsed.error?.message ?? '').toLowerCase();
    if (
      status === 400 &&
      (parsed.error?.status === 'INVALID_ARGUMENT' || errorCodes.includes('INVALID_ARGUMENT')) &&
      (msg.includes('registration token') || msg.includes('not a valid fcm'))
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function getNumericField(fields: Record<string, FirestoreFieldValue>, key: string): number | null {
  const v = fields[key];
  if (!v) return null;
  if (typeof v.doubleValue === 'number') return v.doubleValue;
  if (typeof v.integerValue === 'string') {
    const parsed = Number(v.integerValue);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getStringArrayField(fields: Record<string, FirestoreFieldValue>, key: string): string[] {
  const values = fields[key]?.arrayValue?.values ?? [];
  return values.map((v) => v.stringValue).filter((s): s is string => Boolean(s));
}

function toFirestoreStringArray(values: string[]): FirestoreFieldValue {
  return {
    arrayValue: {
      values: values.map((s) => ({ stringValue: s })),
    },
  };
}

function logReminderEvent(event: Record<string, unknown>): void {
  console.log(JSON.stringify(event));
}

async function timingSafeEqualStrings(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const bytesA = new Uint8Array(hashA);
  const bytesB = new Uint8Array(hashB);
  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) {
    diff |= bytesA[i] ^ bytesB[i];
  }
  return diff === 0;
}

async function isAuthorizedManualRun(request: Request, env: Env): Promise<boolean> {
  const configuredSecret = env.REMINDER_RUN_SECRET?.trim();
  if (!configuredSecret) return false;
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return false;
  const suppliedSecret = authHeader.slice(7).trim();
  if (!suppliedSecret) return false;
  return timingSafeEqualStrings(suppliedSecret, configuredSecret);
}

function base64UrlEncode(input: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const cleaned = pem.trim().replace(/^["']|["']$/g, '');
  const normalized = cleaned.replace(/\\n/g, '\n');
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/[^A-Za-z0-9+/=]/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function getGoogleAccessToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64UrlEncode(
    JSON.stringify({
      iss: env.FIREBASE_CLIENT_EMAIL,
      scope:
        'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${claim}`;
  const key = await importPrivateKey(env.FIREBASE_PRIVATE_KEY);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${base64UrlEncode(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`OAuth token error: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function patchDocumentFields(
  accessToken: string,
  docName: string,
  fields: Record<string, FirestoreFieldValue>,
  updateTimePrecondition?: string
): Promise<Response> {
  const params = new URLSearchParams();
  for (const key of Object.keys(fields)) {
    params.append('updateMask.fieldPaths', key);
  }
  if (updateTimePrecondition) {
    params.set('currentDocument.updateTime', updateTimePrecondition);
  }
  return fetch(`https://firestore.googleapis.com/v1/${docName}?${params.toString()}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });
}

export async function processDueReminders(
  env: Env,
  options: ProcessDueRemindersOptions = {}
): Promise<ProcessDueRemindersResult> {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    throw new Error(
      'Missing required secrets: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY'
    );
  }
  const accessToken = await getGoogleAccessToken(env);
  const projectId = env.FIREBASE_PROJECT_ID;
  const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const nowMs = options.nowMs ?? Date.now();
  const pageSize = Math.max(1, options.pageSize ?? REMINDER_DEFAULT_PAGE_SIZE);
  const maxBatches = Math.max(1, options.maxBatches ?? REMINDER_DEFAULT_MAX_BATCHES);
  const leaseDurationMs = options.leaseDurationMs ?? REMINDER_LEASE_MS;

  let checked = 0;
  let claimed = 0;
  let sentCount = 0;
  let deliveredCount = 0;
  let retriedCount = 0;
  let skippedCount = 0;
  let batches = 0;
  let hasMore = false;
  let cursor: { reminderAtMs: FirestoreFieldValue; docName: string } | null = null;

  for (let batchIndex = 0; batchIndex < maxBatches; batchIndex++) {
    const structuredQuery: Record<string, unknown> = {
      from: [{ collectionId: 'items', allDescendants: true }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'done' },
                op: 'EQUAL',
                value: { booleanValue: false },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'reminderNotified' },
                op: 'EQUAL',
                value: { booleanValue: false },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'reminderAtMs' },
                op: 'LESS_THAN_OR_EQUAL',
                value: { integerValue: String(nowMs) },
              },
            },
          ],
        },
      },
      orderBy: [
        { field: { fieldPath: 'reminderAtMs' }, direction: 'ASCENDING' },
        { field: { fieldPath: '__name__' }, direction: 'ASCENDING' },
      ],
      limit: pageSize,
    };

    if (cursor) {
      structuredQuery.startAt = {
        values: [cursor.reminderAtMs, { referenceValue: cursor.docName }],
        before: false,
      };
    }

    const queryRes = await fetch(`${firestoreBase}:runQuery`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ structuredQuery }),
    });

    if (!queryRes.ok) {
      throw new Error(`Firestore runQuery failed: ${queryRes.status} ${await queryRes.text()}`);
    }

    batches++;
    const rows = (await queryRes.json()) as FirestoreRunQueryRow[];
    const docs = rows.map((r) => r.document).filter((d): d is FirestoreDocument => Boolean(d));
    checked += docs.length;

    if (docs.length === 0) {
      break;
    }

    const lastDoc = docs[docs.length - 1];
    const lastReminderField = lastDoc.fields?.reminderAtMs;
    if (lastReminderField) {
      cursor = { reminderAtMs: lastReminderField, docName: lastDoc.name };
    }

    for (const doc of docs) {
      const fields = doc.fields ?? {};
      const taskId = doc.name.split('/').pop() || '';

      if (getNumericField(fields, 'deletedAtMs') !== null) {
        skippedCount++;
        continue;
      }

      const ownerUid = fields.ownerUid?.stringValue;
      if (!ownerUid) {
        skippedCount++;
        continue;
      }

      const nextRetryAtMs = getNumericField(fields, 'reminderNextRetryAtMs');
      if (nextRetryAtMs !== null && nextRetryAtMs > nowMs) {
        skippedCount++;
        continue;
      }

      const status = fields.reminderStatus?.stringValue;
      const claimExpiresAtMs = getNumericField(fields, 'reminderClaimExpiresAtMs');
      if (status === 'claimed' && claimExpiresAtMs !== null && claimExpiresAtMs > nowMs) {
        skippedCount++;
        continue;
      }

      // Acquire lease atomically using document updateTime precondition when available
      const claimRes = await patchDocumentFields(
        accessToken,
        doc.name,
        {
          reminderStatus: { stringValue: 'claimed' },
          reminderClaimedAtMs: { integerValue: String(nowMs) },
          reminderClaimExpiresAtMs: { integerValue: String(nowMs + leaseDurationMs) },
        },
        doc.updateTime
      );
      if (!claimRes.ok) {
        skippedCount++;
        logReminderEvent({ event: 'reminder_claim_skipped', taskId, status: claimRes.status });
        continue;
      }
      claimed++;

      const text = fields.text?.stringValue || 'You have a scheduled task reminder.';
      const listId = fields.listId?.stringValue || '';
      const prevAttempts = getNumericField(fields, 'reminderAttempts') ?? 0;
      const previouslyDelivered = new Set(getStringArrayField(fields, 'reminderDeliveredTokenIds'));

      let tokensRes: Response;
      try {
        tokensRes = await fetch(`${firestoreBase}/users/${ownerUid}/fcmTokens`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch {
        const nextAttempts = prevAttempts + 1;
        await patchDocumentFields(accessToken, doc.name, {
          reminderNotified: { booleanValue: false },
          reminderStatus: { stringValue: 'retry' },
          reminderClaimExpiresAtMs: { nullValue: null },
          reminderAttempts: { integerValue: String(nextAttempts) },
          reminderNextRetryAtMs: { integerValue: String(nowMs + computeRetryBackoffMs(nextAttempts)) },
          reminderLastError: { stringValue: 'TOKEN_LOOKUP_NETWORK_ERROR' },
        });
        retriedCount++;
        logReminderEvent({ event: 'reminder_retry', taskId, reason: 'TOKEN_LOOKUP_NETWORK_ERROR', attempts: nextAttempts });
        continue;
      }

      if (!tokensRes.ok) {
        const nextAttempts = prevAttempts + 1;
        await patchDocumentFields(accessToken, doc.name, {
          reminderNotified: { booleanValue: false },
          reminderStatus: { stringValue: 'retry' },
          reminderClaimExpiresAtMs: { nullValue: null },
          reminderAttempts: { integerValue: String(nextAttempts) },
          reminderNextRetryAtMs: { integerValue: String(nowMs + computeRetryBackoffMs(nextAttempts)) },
          reminderLastError: { stringValue: `TOKEN_LOOKUP_${tokensRes.status}` },
        });
        retriedCount++;
        logReminderEvent({ event: 'reminder_retry', taskId, reason: `TOKEN_LOOKUP_${tokensRes.status}`, attempts: nextAttempts });
        continue;
      }

      const tokensData = (await tokensRes.json()) as {
        documents?: Array<{ name: string; fields?: { token?: { stringValue?: string } } }>;
      };

      const tokenDocs = (tokensData.documents ?? []).filter((td) => Boolean(td.fields?.token?.stringValue));
      if (tokenDocs.length === 0) {
        const nextAttempts = prevAttempts + 1;
        await patchDocumentFields(accessToken, doc.name, {
          reminderNotified: { booleanValue: false },
          reminderStatus: { stringValue: 'retry' },
          reminderClaimExpiresAtMs: { nullValue: null },
          reminderAttempts: { integerValue: String(nextAttempts) },
          reminderNextRetryAtMs: { integerValue: String(nowMs + computeRetryBackoffMs(nextAttempts)) },
          reminderLastError: { stringValue: 'NO_DEVICE_TOKENS' },
        });
        retriedCount++;
        logReminderEvent({ event: 'reminder_retry', taskId, reason: 'NO_DEVICE_TOKENS', attempts: nextAttempts });
        continue;
      }

      const deliveredIds = new Set(previouslyDelivered);
      let transientFailures = 0;
      let invalidTokensRemoved = 0;
      let lastFcmError = '';

      for (const tokenDoc of tokenDocs) {
        const tokenId = tokenDoc.name.split('/').pop() || tokenDoc.name;
        if (deliveredIds.has(tokenId)) {
          continue;
        }
        const fcmToken = tokenDoc.fields!.token!.stringValue!;

        let fcmRes: Response;
        try {
          fcmRes = await fetch(
            `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                message: {
                  token: fcmToken,
                  data: {
                    title: 'Task Reminder',
                    body: text,
                    taskId,
                    listId,
                    url: '/',
                  },
                  webpush: {
                    headers: { Urgency: 'high' },
                  },
                },
              }),
            }
          );
        } catch {
          transientFailures++;
          lastFcmError = 'FCM_NETWORK_ERROR';
          continue;
        }

        if (fcmRes.ok) {
          sentCount++;
          deliveredIds.add(tokenId);
        } else {
          const errText = await fcmRes.text();
          if (isPermanentInvalidTokenError(fcmRes.status, errText)) {
            invalidTokensRemoved++;
            await fetch(`https://firestore.googleapis.com/v1/${tokenDoc.name}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${accessToken}` },
            });
          } else {
            transientFailures++;
            lastFcmError = `FCM_HTTP_${fcmRes.status}`;
          }
        }
      }

      const deliveredList = Array.from(deliveredIds);
      const nextAttempts = prevAttempts + 1;

      if (deliveredList.length > 0 && (transientFailures === 0 || nextAttempts >= REMINDER_MAX_RETRY_ATTEMPTS)) {
        await patchDocumentFields(accessToken, doc.name, {
          reminderNotified: { booleanValue: true },
          reminderStatus: { stringValue: 'delivered' },
          reminderClaimExpiresAtMs: { nullValue: null },
          reminderNextRetryAtMs: { nullValue: null },
          reminderLastError: { nullValue: null },
          reminderDeliveredTokenIds: toFirestoreStringArray(deliveredList),
        });
        deliveredCount++;
        logReminderEvent({
          event: 'reminder_delivered',
          taskId,
          deliveredDevices: deliveredList.length,
          invalidTokensRemoved,
        });
      } else {
        const reason =
          deliveredList.length > 0
            ? 'PARTIAL_FCM_FAILURE'
            : transientFailures > 0
              ? lastFcmError || 'FCM_SEND_FAILED'
              : 'ALL_TOKENS_INVALID';
        await patchDocumentFields(accessToken, doc.name, {
          reminderNotified: { booleanValue: false },
          reminderStatus: { stringValue: 'retry' },
          reminderClaimExpiresAtMs: { nullValue: null },
          reminderAttempts: { integerValue: String(nextAttempts) },
          reminderNextRetryAtMs: { integerValue: String(nowMs + computeRetryBackoffMs(nextAttempts)) },
          reminderLastError: { stringValue: reason },
          reminderDeliveredTokenIds: toFirestoreStringArray(deliveredList),
        });
        retriedCount++;
        logReminderEvent({
          event: 'reminder_retry',
          taskId,
          reason,
          attempts: nextAttempts,
          deliveredDevices: deliveredList.length,
          transientFailures,
          invalidTokensRemoved,
        });
      }
    }

    if (docs.length < pageSize) {
      hasMore = false;
      break;
    }
    hasMore = batchIndex === maxBatches - 1;
  }

  return {
    checked,
    claimed,
    sent: sentCount,
    delivered: deliveredCount,
    retried: retriedCount,
    skipped: skippedCount,
    batches,
    hasMore,
  };
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function verifyFirebaseIdToken(
  idToken: string,
  projectId: string
): Promise<{ uid: string; name: string }> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid ID token format');

  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0]))) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]))) as {
    iss?: string;
    aud?: string;
    sub?: string;
    exp?: number;
    name?: string;
    email?: string;
  };

  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unsupported token algorithm');
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Invalid token issuer');
  }
  if (payload.aud !== projectId) throw new Error('Invalid token audience');
  if (!payload.sub) throw new Error('Missing token subject');
  if (!payload.exp || payload.exp <= now) throw new Error('Token expired');

  const jwksRes = await fetch(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
  );
  if (!jwksRes.ok) throw new Error('Failed to fetch Google JWKs');
  const jwks = (await jwksRes.json()) as { keys: Array<JsonWebKey & { kid?: string }> };
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Matching JWK not found');

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const sigBytes = base64UrlDecode(parts[2]);
  const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, sigBytes, signedData);
  if (!valid) throw new Error('Invalid token signature');

  return {
    uid: payload.sub,
    name: payload.name || payload.email?.split('@')[0] || 'A collaborator',
  };
}

async function sendFcmToUser(
  accessToken: string,
  projectId: string,
  uid: string,
  dataPayload: Record<string, string>
): Promise<number> {
  const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const tokensRes = await fetch(`${firestoreBase}/users/${uid}/fcmTokens`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!tokensRes.ok) return 0;

  const tokensData = (await tokensRes.json()) as {
    documents?: Array<{ name: string; fields?: { token?: { stringValue?: string } } }>;
  };

  let sent = 0;
  for (const tokenDoc of tokensData.documents ?? []) {
    const fcmToken = tokenDoc.fields?.token?.stringValue;
    if (!fcmToken) continue;

    const fcmRes = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: fcmToken,
            data: dataPayload,
            webpush: {
              headers: { Urgency: 'high' },
            },
          },
        }),
      }
    );

    if (fcmRes.ok) {
      sent++;
    } else {
      const errText = await fcmRes.text();
      if (isPermanentInvalidTokenError(fcmRes.status, errText)) {
        await fetch(`https://firestore.googleapis.com/v1/${tokenDoc.name}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }
    }
  }
  return sent;
}

async function notifyShareActivity(
  env: Env,
  actorUid: string,
  actorName: string,
  body: { listId?: string; itemId?: string; action?: string; text?: string }
): Promise<{ sent: number }> {
  const { listId, itemId = '', action = 'updated', text = 'a task' } = body;
  if (!listId) throw new Error('Missing listId');

  const accessToken = await getGoogleAccessToken(env);
  const projectId = env.FIREBASE_PROJECT_ID;
  const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  const listRes = await fetch(`${firestoreBase}/lists/${listId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) throw new Error('List not found');

  const listDoc = (await listRes.json()) as {
    fields?: {
      title?: { stringValue?: string };
      ownerUid?: { stringValue?: string };
      memberUids?: { arrayValue?: { values?: Array<{ stringValue?: string }> } };
    };
  };

  const listTitle = listDoc.fields?.title?.stringValue || 'Shared List';
  const ownerUid = listDoc.fields?.ownerUid?.stringValue;
  const memberUids = (listDoc.fields?.memberUids?.arrayValue?.values ?? [])
    .map((v) => v.stringValue)
    .filter((v): v is string => Boolean(v));

  const allMembers = Array.from(new Set([ownerUid, ...memberUids].filter((v): v is string => Boolean(v))));
  if (!allMembers.includes(actorUid)) {
    throw new Error('Forbidden: not a member of this list');
  }

  const recipients = allMembers.filter((uid) => uid !== actorUid);
  if (recipients.length === 0) return { sent: 0 };

  const verb =
    action === 'completed'
      ? 'completed'
      : action === 'reopened'
        ? 'reopened'
        : action === 'added'
          ? 'added'
          : 'updated';

  let sent = 0;
  for (const uid of recipients) {
    sent += await sendFcmToUser(accessToken, projectId, uid, {
      title: listTitle,
      body: `${actorName} ${verb}: ${text}`,
      taskId: itemId,
      listId,
      url: '/',
    });
  }
  return { sent };
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(processDueReminders(env));
  },
  async fetch(request: Request, env: Env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    if (url.pathname === '/run') {
      if (request.method !== 'POST') {
        return Response.json(
          { error: 'Method Not Allowed' },
          { status: 405, headers: { ...CORS_HEADERS, Allow: 'POST, OPTIONS' } }
        );
      }
      if (!(await isAuthorizedManualRun(request, env))) {
        return Response.json(
          { error: 'Unauthorized' },
          { status: 401, headers: CORS_HEADERS }
        );
      }
      try {
        const result = await processDueReminders(env);
        return Response.json(result, { headers: CORS_HEADERS });
      } catch {
        return Response.json(
          { error: 'Failed to process reminders' },
          { status: 500, headers: CORS_HEADERS }
        );
      }
    }
    if (url.pathname === '/notify-share' && request.method === 'POST') {
      try {
        const authHeader = request.headers.get('Authorization') || '';
        const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
        if (!idToken) {
          return Response.json({ error: 'Missing Bearer token' }, { status: 401, headers: CORS_HEADERS });
        }
        const actor = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID);
        const body = (await request.json()) as {
          listId?: string;
          itemId?: string;
          action?: string;
          text?: string;
        };
        const result = await notifyShareActivity(env, actor.uid, actor.name, body);
        return Response.json(result, { headers: CORS_HEADERS });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const status = msg.startsWith('Forbidden') ? 403 : 400;
        return Response.json({ error: msg }, { status, headers: CORS_HEADERS });
      }
    }
    return new Response('todo-reminder-cron worker is running', { headers: CORS_HEADERS });
  },
};
