import { GoogleAuthProvider, reauthenticateWithPopup, signInWithPopup, type User } from 'firebase/auth';
import { auth } from './firebase';

export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_TOKEN_STORAGE_KEY = 'todo.gdrive.session.v1';
const ROOT_FOLDER_NAME = 'ToDo PWA';
const ATTACHMENTS_FOLDER_NAME = 'Attachments';
const BACKUPS_FOLDER_NAME = 'Backups';

interface StoredDriveSession {
  accessToken: string;
  expiresAtMs: number;
}

export interface DriveBackupFile {
  id: string;
  name: string;
  size: number;
  modifiedTime: string;
}

let memorySession: StoredDriveSession | null = null;
const folderIdCache = new Map<string, string>();

function readStoredSession(): StoredDriveSession | null {
  if (memorySession && memorySession.expiresAtMs > Date.now()) {
    return memorySession;
  }
  try {
    const raw = sessionStorage.getItem(DRIVE_TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDriveSession>;
    if (
      typeof parsed.accessToken === 'string' &&
      parsed.accessToken.length > 0 &&
      typeof parsed.expiresAtMs === 'number' &&
      parsed.expiresAtMs > Date.now()
    ) {
      memorySession = { accessToken: parsed.accessToken, expiresAtMs: parsed.expiresAtMs };
      return memorySession;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export function setDriveAccessToken(accessToken: string, ttlMs = 50 * 60 * 1000): void {
  const session: StoredDriveSession = {
    accessToken,
    expiresAtMs: Date.now() + ttlMs,
  };
  memorySession = session;
  try {
    sessionStorage.setItem(DRIVE_TOKEN_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore storage errors
  }
}

export function getDriveAccessToken(): string | null {
  return readStoredSession()?.accessToken ?? null;
}

export function isDriveSessionActive(): boolean {
  return getDriveAccessToken() !== null;
}

export function clearDriveSession(): void {
  memorySession = null;
  folderIdCache.clear();
  try {
    sessionStorage.removeItem(DRIVE_TOKEN_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

/**
 * Prompts Google OAuth popup with `drive.file` scope (access only to files created by this app).
 */
export async function connectGoogleDrive(currentUser?: User | null): Promise<string> {
  const provider = new GoogleAuthProvider();
  provider.addScope(GOOGLE_DRIVE_SCOPE);
  if (currentUser?.email) {
    provider.setCustomParameters({ login_hint: currentUser.email });
  }

  const user = currentUser ?? auth.currentUser;
  const result = user
    ? await reauthenticateWithPopup(user, provider)
    : await signInWithPopup(auth, provider);

  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken;
  if (!accessToken) {
    throw new Error('Google did not return a Drive access token. Please try connecting again.');
  }
  setDriveAccessToken(accessToken);
  return accessToken;
}

export async function ensureDriveAccessToken(currentUser?: User | null): Promise<string> {
  const existing = getDriveAccessToken();
  if (existing) return existing;
  return connectGoogleDrive(currentUser);
}

async function driveFetch(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    clearDriveSession();
    throw new Error('Google Drive session expired. Please reconnect Google Drive and try again.');
  }
  return res;
}

async function findOrCreateFolder(
  token: string,
  name: string,
  parentId?: string
): Promise<string> {
  const cacheKey = `${parentId ?? 'root'}/${name}`;
  const cached = folderIdCache.get(cacheKey);
  if (cached) return cached;

  const escapedName = name.replace(/'/g, "\\'");
  const parentClause = parentId ? ` and '${parentId}' in parents` : '';
  const q = `mimeType='application/vnd.google-apps.folder' and name='${escapedName}' and trashed=false${parentClause}`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`;

  const searchRes = await driveFetch(token, searchUrl);
  if (!searchRes.ok) {
    const text = await searchRes.text();
    throw new Error(`Google Drive folder lookup failed (${searchRes.status}): ${text.slice(0, 160)}`);
  }
  const searchData = (await searchRes.json()) as { files?: Array<{ id: string }> };
  const existingId = searchData.files?.[0]?.id;
  if (existingId) {
    folderIdCache.set(cacheKey, existingId);
    return existingId;
  }

  const createRes = await driveFetch(token, 'https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Google Drive folder creation failed (${createRes.status}): ${text.slice(0, 160)}`);
  }
  const created = (await createRes.json()) as { id: string };
  folderIdCache.set(cacheKey, created.id);
  return created.id;
}

export async function ensureAppDriveFolder(
  token: string,
  subfolder: 'Attachments' | 'Backups'
): Promise<string> {
  const rootId = await findOrCreateFolder(token, ROOT_FOLDER_NAME);
  return findOrCreateFolder(
    token,
    subfolder === 'Attachments' ? ATTACHMENTS_FOLDER_NAME : BACKUPS_FOLDER_NAME,
    rootId
  );
}

export function buildMultipartDrivePayload(params: {
  metadata: Record<string, unknown>;
  fileBytes: Uint8Array;
  mimeType: string;
  boundary?: string;
}): { body: Uint8Array; contentType: string } {
  const boundary = params.boundary ?? `todo_drive_${Date.now().toString(36)}`;
  const encoder = new TextEncoder();
  const metaPart = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(params.metadata)}\r\n`
  );
  const fileHeader = encoder.encode(
    `--${boundary}\r\nContent-Type: ${params.mimeType || 'application/octet-stream'}\r\n\r\n`
  );
  const closing = encoder.encode(`\r\n--${boundary}--`);

  const totalLength = metaPart.byteLength + fileHeader.byteLength + params.fileBytes.byteLength + closing.byteLength;
  const body = new Uint8Array(totalLength);
  let offset = 0;
  body.set(metaPart, offset);
  offset += metaPart.byteLength;
  body.set(fileHeader, offset);
  offset += fileHeader.byteLength;
  body.set(params.fileBytes, offset);
  offset += params.fileBytes.byteLength;
  body.set(closing, offset);

  return {
    body,
    contentType: `multipart/related; boundary=${boundary}`,
  };
}

export async function uploadFileToDrive(params: {
  token: string;
  blob: Blob;
  fileName: string;
  mimeType?: string;
  folder: 'Attachments' | 'Backups';
  onProgress?: (percent: number) => void;
}): Promise<DriveBackupFile> {
  const folderId = await ensureAppDriveFolder(params.token, params.folder);
  const mimeType = params.mimeType || params.blob.type || 'application/octet-stream';
  const fileBytes = new Uint8Array(await params.blob.arrayBuffer());
  const { body, contentType } = buildMultipartDrivePayload({
    metadata: {
      name: params.fileName,
      parents: [folderId],
    },
    fileBytes,
    mimeType,
  });

  const bodyBuffer = new Uint8Array(body.byteLength);
  bodyBuffer.set(body);

  const uploadUrl =
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,modifiedTime';

  let uploaded: {
    id: string;
    name: string;
    size?: string;
    modifiedTime?: string;
  };

  if (params.onProgress && typeof XMLHttpRequest !== 'undefined') {
    uploaded = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl, true);
      xhr.setRequestHeader('Authorization', `Bearer ${params.token}`);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && evt.total > 0) {
          const pct = Math.max(0, Math.min(100, Math.round((evt.loaded / evt.total) * 100)));
          params.onProgress?.(pct);
        }
      };
      xhr.onload = () => {
        if (xhr.status === 401) {
          clearDriveSession();
          reject(new Error('Google Drive session expired. Please reconnect Google Drive and try again.'));
          return;
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(`Google Drive upload failed (${xhr.status}): ${(xhr.responseText || '').slice(0, 160)}`));
          return;
        }
        try {
          params.onProgress?.(100);
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('Invalid response from Google Drive upload.'));
        }
      };
      xhr.onerror = () => reject(new Error('Network error during Google Drive upload.'));
      xhr.send(bodyBuffer);
    });
  } else {
    const res = await driveFetch(params.token, uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: bodyBuffer,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Drive upload failed (${res.status}): ${text.slice(0, 160)}`);
    }
    uploaded = (await res.json()) as {
      id: string;
      name: string;
      size?: string;
      modifiedTime?: string;
    };
  }

  return {
    id: uploaded.id,
    name: uploaded.name,
    size: Number(uploaded.size ?? fileBytes.byteLength),
    modifiedTime: uploaded.modifiedTime ?? new Date().toISOString(),
  };
}

export async function downloadFileFromDrive(token: string, fileId: string): Promise<Blob> {
  const res = await driveFetch(
    token,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`
  );
  if (!res.ok) {
    throw new Error(`Google Drive download failed (${res.status})`);
  }
  return res.blob();
}

export async function deleteFileFromDrive(token: string, fileId: string): Promise<void> {
  const res = await driveFetch(
    token,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    { method: 'DELETE' }
  );
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Google Drive delete failed (${res.status}): ${text.slice(0, 140)}`);
  }
}

export async function findDriveFileByName(
  token: string,
  fileName: string,
  folder: 'Attachments' | 'Backups'
): Promise<string | null> {
  const folderId = await ensureAppDriveFolder(token, folder);
  const escaped = fileName.replace(/'/g, "\\'");
  const q = `'${folderId}' in parents and name='${escaped}' and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`;
  const res = await driveFetch(token, url);
  if (!res.ok) return null;
  const data = (await res.json()) as { files?: Array<{ id: string }> };
  return data.files?.[0]?.id ?? null;
}

export function getDriveFileViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

export function getDriveFileDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?id=${encodeURIComponent(fileId)}&export=download`;
}

/**
 * Grants read-only Google Drive access to each collaborator email silently
 * (`sendNotificationEmail=false` so no notification emails are sent).
 */
export async function shareDriveFileSilently(
  token: string,
  fileId: string,
  emails: string[]
): Promise<{ shared: number; failed: number }> {
  const uniqueEmails = Array.from(
    new Set(
      emails
        .map((e) => e.trim().toLowerCase())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    )
  );
  if (uniqueEmails.length === 0) return { shared: 0, failed: 0 };

  let shared = 0;
  let failed = 0;
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false`;

  for (const emailAddress of uniqueEmails) {
    try {
      const res = await driveFetch(token, url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'user',
          role: 'reader',
          emailAddress,
        }),
      });
      if (res.ok) {
        shared += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }
  return { shared, failed };
}

export async function listDriveBackups(token: string): Promise<DriveBackupFile[]> {
  const folderId = await ensureAppDriveFolder(token, 'Backups');
  const q = `'${folderId}' in parents and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&orderBy=modifiedTime desc&pageSize=20&fields=files(id,name,size,modifiedTime)`;
  const res = await driveFetch(token, url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to list Google Drive backups (${res.status}): ${text.slice(0, 160)}`);
  }
  const data = (await res.json()) as {
    files?: Array<{ id: string; name: string; size?: string; modifiedTime?: string }>;
  };
  return (data.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    size: Number(f.size ?? 0),
    modifiedTime: f.modifiedTime ?? '',
  }));
}
