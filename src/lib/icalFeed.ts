import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export function getIcalWorkerBaseUrl(): string | null {
  const raw = (import.meta.env.VITE_NOTIFY_WORKER_URL as string | undefined)?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

export function buildIcalFeedUrls(token: string): { httpsUrl: string; webcalUrl: string } | null {
  const base = getIcalWorkerBaseUrl();
  if (!base || !token) return null;
  const httpsUrl = `${base}/ical?token=${encodeURIComponent(token)}`;
  const webcalUrl = httpsUrl.replace(/^https?:\/\//i, 'webcal://');
  return { httpsUrl, webcalUrl };
}

export function generateIcalToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createOrRotateIcalFeed(
  ownerUid: string,
  previousToken?: string | null
): Promise<string> {
  const newToken = generateIcalToken();
  await setDoc(doc(db, 'icalFeeds', newToken), {
    ownerUid,
    createdAtMs: Date.now(),
  });
  if (previousToken && previousToken !== newToken) {
    try {
      await deleteDoc(doc(db, 'icalFeeds', previousToken));
    } catch {
      // ignore if previous token already deleted
    }
  }
  return newToken;
}

export async function revokeIcalFeed(token: string): Promise<void> {
  if (!token) return;
  try {
    await deleteDoc(doc(db, 'icalFeeds', token));
  } catch {
    // ignore if already deleted
  }
}
