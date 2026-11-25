const DB_NAME = 'todo-attachments-db';
const STORE_NAME = 'files';
const DB_VERSION = 1;

function openAttachmentsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAttachmentBlob(id: string, blob: Blob): Promise<void> {
  const db = await openAttachmentsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAttachmentBlob(id: string): Promise<Blob | null> {
  const db = await openAttachmentsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteAttachmentBlob(id: string): Promise<void> {
  const db = await openAttachmentsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? '';
  const dotIdx = base.lastIndexOf('.');
  const rawExt = dotIdx > 0 ? base.slice(dotIdx + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let hash = '';
  for (let i = 0; i < 8; i++) {
    hash += chars[bytes[i] % chars.length];
  }
  return rawExt ? `${hash}.${rawExt}` : hash;
}

export function isHeicFile(name: string, type?: string): boolean {
  const lower = name.toLowerCase();
  return (
    type === 'image/heic' ||
    type === 'image/heif' ||
    lower.endsWith('.heic') ||
    lower.endsWith('.heif')
  );
}

export function isImageFile(name: string, type?: string): boolean {
  if (type?.startsWith('image/')) return true;
  const lower = name.toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.heic', '.heif'].some((ext) =>
    lower.endsWith(ext)
  );
}

export async function getPreviewableBlob(blob: Blob, name: string, type?: string): Promise<Blob> {
  if (!isHeicFile(name, type)) return blob;
  const heic2anyModule = await import('heic2any');
  const heic2any = heic2anyModule.default;
  const converted = await heic2any({
    blob,
    toType: 'image/jpeg',
    quality: 0.85,
  });
  return Array.isArray(converted) ? converted[0] : converted;
}
