export interface SharedFileRecord {
  name: string;
  type: string;
  size: number;
  blob: Blob;
}

export interface IncomingSharePayload {
  title: string;
  note: string;
  url?: string;
  files?: SharedFileRecord[];
  receivedAtMs: number;
}

const SHARE_DB_NAME = 'todo-pwa-share-target';
const SHARE_DB_VERSION = 1;
const SHARE_STORE_NAME = 'pending';
const PENDING_KEY = 'latest';

/**
 * Pure parser that turns raw Web Share Target fields (title, text, url)
 * into a clean task title and optional markdown-friendly note.
 */
export function normalizeShareFields(fields: {
  title?: string | null;
  text?: string | null;
  url?: string | null;
  fileNames?: string[];
}): { title: string; note: string; url?: string } {
  const rawTitle = (fields.title || '').trim();
  const rawText = (fields.text || '').trim();
  const rawUrl = (fields.url || '').trim();
  const firstFileName = fields.fileNames?.find((n) => n.trim())?.trim() || '';

  // Some Android apps put the URL inside `text` instead of `url`.
  const extractedUrl = rawUrl || rawText.match(/https?:\/\/[^\s]+/i)?.[0] || '';

  const firstLineOfText = rawText.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '';
  const title =
    rawTitle ||
    (firstLineOfText && firstLineOfText !== extractedUrl ? firstLineOfText.slice(0, 140) : '') ||
    (firstFileName ? `Review ${firstFileName}` : '') ||
    extractedUrl ||
    'Shared item';

  const noteParts: string[] = [];
  if (rawText && rawText !== title) {
    noteParts.push(rawText);
  }
  if (
    extractedUrl &&
    !noteParts.some((p) => p.includes(extractedUrl)) &&
    !title.includes(extractedUrl)
  ) {
    noteParts.push(extractedUrl);
  }

  return {
    title: title.slice(0, 240),
    note: noteParts.join('\n\n'),
    ...(extractedUrl ? { url: extractedUrl } : {}),
  };
}

function openShareDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const req = indexedDB.open(SHARE_DB_NAME, SHARE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SHARE_STORE_NAME)) {
        db.createObjectStore(SHARE_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open share target DB'));
  });
}

export async function saveIncomingSharePayload(payload: IncomingSharePayload): Promise<void> {
  const db = await openShareDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SHARE_STORE_NAME, 'readwrite');
      tx.objectStore(SHARE_STORE_NAME).put(payload, PENDING_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to store share payload'));
    });
  } finally {
    db.close();
  }
}

export async function consumeIncomingSharePayload(): Promise<IncomingSharePayload | null> {
  if (typeof indexedDB === 'undefined') return null;
  let db: IDBDatabase | null = null;
  try {
    db = await openShareDb();
    const record = await new Promise<IncomingSharePayload | null>((resolve, reject) => {
      const tx = db!.transaction(SHARE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(SHARE_STORE_NAME);
      const getReq = store.get(PENDING_KEY);
      getReq.onsuccess = () => {
        const value = (getReq.result as IncomingSharePayload | undefined) ?? null;
        if (value) {
          store.delete(PENDING_KEY);
        }
        resolve(value);
      };
      getReq.onerror = () => reject(getReq.error ?? new Error('Failed to read share payload'));
    });
    return record;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

export function formatSharedFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
