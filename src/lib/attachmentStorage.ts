import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { TodoItem, TodoList } from '../types/todo';
import {
  deleteFileFromDrive,
  downloadFileFromDrive,
  ensureDriveAccessToken,
  findDriveFileByName,
  getDriveAccessToken,
  shareDriveFileSilently,
  uploadFileToDrive,
} from './googleDrive';

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

export interface DriveAttachmentRef {
  id: string;
  name?: string;
  driveFileId?: string;
  uploadedByUid?: string;
}

/**
 * Fetches Google email addresses for all collaborators on a list (excluding `excludeUid`).
 */
export async function fetchListCollaboratorEmails(
  list: Pick<TodoList, 'ownerUid' | 'memberUids'>,
  excludeUid?: string
): Promise<string[]> {
  const uids = Array.from(
    new Set([list.ownerUid, ...(list.memberUids ?? [])].filter((uid) => Boolean(uid) && uid !== excludeUid))
  );
  if (uids.length === 0) return [];
  const emails: string[] = [];
  await Promise.all(
    uids.map(async (uid) => {
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        const email = snap.exists() ? (snap.data()?.email as string | undefined) : undefined;
        if (typeof email === 'string' && email.includes('@')) {
          emails.push(email.trim().toLowerCase());
        }
      } catch {
        // ignore profile lookup errors
      }
    })
  );
  return Array.from(new Set(emails));
}

/**
 * Uploads an attachment to the user's Google Drive (`ToDo PWA/Attachments/`) if a Drive session
 * is active (or interactive=true). If `shareWithEmails` is provided, silently grants read access
 * (`sendNotificationEmail=false`) to all shared-list collaborators.
 */
export async function uploadAttachmentToDrive(params: {
  blob: Blob;
  fileName: string;
  contentType?: string;
  interactive?: boolean;
  shareWithEmails?: string[];
  onProgress?: (percent: number) => void;
}): Promise<string | null> {
  try {
    const token = params.interactive
      ? await ensureDriveAccessToken()
      : getDriveAccessToken();
    if (!token) return null;
    const uploaded = await uploadFileToDrive({
      token,
      blob: params.blob,
      fileName: params.fileName,
      mimeType: params.contentType,
      folder: 'Attachments',
      onProgress: params.onProgress,
    });
    if (params.shareWithEmails && params.shareWithEmails.length > 0) {
      await shareDriveFileSilently(token, uploaded.id, params.shareWithEmails);
    }
    return uploaded.id;
  } catch {
    return null;
  }
}

/**
 * Silently grants read-only Google Drive access to all collaborators on a shared list for all
 * existing Drive-backed attachments uploaded by the current user (no notification emails sent).
 */
export async function syncListDrivePermissions(params: {
  list: Pick<TodoList, 'id' | 'ownerUid' | 'memberUids'>;
  items: TodoItem[];
  currentUid: string;
  extraEmails?: string[];
  interactive?: boolean;
}): Promise<{
  totalFiles: number;
  filesShared: number;
  collaboratorCount: number;
}> {
  const driveAttachments = params.items
    .filter((i) => i.listId === params.list.id && !i.deletedAtMs)
    .flatMap((i) => i.attachments ?? [])
    .filter((att) => Boolean(att.driveFileId) && (!att.uploadedByUid || att.uploadedByUid === params.currentUid));

  const uniqueFileIds = Array.from(
    new Set(driveAttachments.map((a) => a.driveFileId!).filter(Boolean))
  );
  if (uniqueFileIds.length === 0) {
    return { totalFiles: 0, filesShared: 0, collaboratorCount: 0 };
  }

  const fetchedEmails = await fetchListCollaboratorEmails(params.list, params.currentUid);
  const allEmails = Array.from(
    new Set([
      ...fetchedEmails,
      ...(params.extraEmails ?? []).map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@')),
    ])
  );
  if (allEmails.length === 0) {
    return { totalFiles: uniqueFileIds.length, filesShared: 0, collaboratorCount: 0 };
  }

  const token = params.interactive
    ? await ensureDriveAccessToken()
    : getDriveAccessToken();
  if (!token) {
    return { totalFiles: uniqueFileIds.length, filesShared: 0, collaboratorCount: allEmails.length };
  }

  let filesShared = 0;
  for (const fileId of uniqueFileIds) {
    const res = await shareDriveFileSilently(token, fileId, allEmails);
    if (res.shared > 0) filesShared += 1;
  }

  return {
    totalFiles: uniqueFileIds.length,
    filesShared,
    collaboratorCount: allEmails.length,
  };
}

/**
 * Reads an attachment from local IndexedDB cache first; if missing locally and `driveFileId`
 * is present, fetches it from Google Drive and caches it locally in IndexedDB.
 */
export async function getAttachmentBlobWithDrive(
  att: DriveAttachmentRef,
  options: { interactive?: boolean } = {}
): Promise<Blob | null> {
  try {
    const local = await getAttachmentBlob(att.id);
    if (local) return local;
  } catch {
    // fall through to Drive
  }

  if (!att.driveFileId) return null;

  try {
    const token = options.interactive
      ? await ensureDriveAccessToken()
      : getDriveAccessToken();
    if (!token) return null;
    const blob = await downloadFileFromDrive(token, att.driveFileId);
    void saveAttachmentBlob(att.id, blob).catch(() => {});
    return blob;
  } catch {
    return null;
  }
}

/**
 * Deletes an attachment from local IndexedDB and from Google Drive (by driveFileId, or falling
 * back to `${id}-${name}` inside `ToDo PWA/Attachments`).
 * Returns `{ driveDeleted, driveError }` so callers can surface any Drive cleanup issues.
 */
export async function deleteAttachmentWithDrive(
  att: DriveAttachmentRef,
  options: { interactive?: boolean } = {}
): Promise<{ driveDeleted: boolean; driveError?: string }> {
  try {
    await deleteAttachmentBlob(att.id);
  } catch {
    // ignore local delete errors
  }

  let token = getDriveAccessToken();
  if (!token && options.interactive && att.driveFileId) {
    try {
      token = await ensureDriveAccessToken();
    } catch (err) {
      return {
        driveDeleted: false,
        driveError: err instanceof Error ? err.message : 'Google Drive session expired.',
      };
    }
  }
  if (!token) {
    return {
      driveDeleted: false,
      ...(att.driveFileId ? { driveError: 'Google Drive is not connected; file remains in Drive.' } : {}),
    };
  }

  try {
    let targetId = att.driveFileId ?? null;
    if (!targetId && att.name) {
      targetId = await findDriveFileByName(token, `${att.id}-${att.name}`, 'Attachments');
    }
    if (!targetId) {
      return { driveDeleted: false };
    }
    await deleteFileFromDrive(token, targetId);
    return { driveDeleted: true };
  } catch (err) {
    return {
      driveDeleted: false,
      driveError: err instanceof Error ? err.message : 'Failed to delete file from Google Drive.',
    };
  }
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
  try {
    const mod = await import('heic2any');
    const heic2any = mod.default;
    const converted = await heic2any({ blob, toType: 'image/jpeg', quality: 0.85 });
    return Array.isArray(converted) ? converted[0] : converted;
  } catch {
    return blob;
  }
}
