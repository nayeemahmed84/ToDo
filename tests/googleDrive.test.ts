import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildMultipartDrivePayload,
  clearDriveSession,
  deleteFileFromDrive,
  downloadFileFromDrive,
  getDriveAccessToken,
  getDriveFileDownloadUrl,
  getDriveFileViewUrl,
  isDriveSessionActive,
  listDriveBackups,
  setDriveAccessToken,
  shareDriveFileSilently,
  uploadFileToDrive,
} from '../src/lib/googleDrive';

describe('googleDrive client', () => {
  afterEach(() => {
    clearDriveSession();
    vi.unstubAllGlobals();
  });

  it('tracks in-memory access token session with expiry', () => {
    expect(isDriveSessionActive()).toBe(false);
    expect(getDriveAccessToken()).toBeNull();

    setDriveAccessToken('tok-123', 60_000);
    expect(isDriveSessionActive()).toBe(true);
    expect(getDriveAccessToken()).toBe('tok-123');

    clearDriveSession();
    expect(isDriveSessionActive()).toBe(false);
  });

  it('builds a valid multipart/related Drive upload payload', () => {
    const fileBytes = new TextEncoder().encode('hello world');
    const { body, contentType } = buildMultipartDrivePayload({
      metadata: { name: 'note.txt', parents: ['folder-1'] },
      fileBytes,
      mimeType: 'text/plain',
      boundary: 'test_boundary',
    });

    expect(contentType).toBe('multipart/related; boundary=test_boundary');
    const decoded = new TextDecoder().decode(body);
    expect(decoded).toContain('--test_boundary\r\nContent-Type: application/json; charset=UTF-8');
    expect(decoded).toContain('"name":"note.txt"');
    expect(decoded).toContain('Content-Type: text/plain\r\n\r\nhello world\r\n--test_boundary--');
  });

  it('creates app folders, uploads, lists, downloads, and deletes Drive files', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('drive/v3/files?q=') && url.includes('ToDo%20PWA')) {
        return new Response(JSON.stringify({ files: [{ id: 'root-folder' }] }), { status: 200 });
      }
      if (url.includes('drive/v3/files?q=') && url.includes('Backups')) {
        return new Response(JSON.stringify({ files: [] }), { status: 200 });
      }
      if (url === 'https://www.googleapis.com/drive/v3/files?fields=id' && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'backups-folder' }), { status: 200 });
      }
      if (url.includes('upload/drive/v3/files?uploadType=multipart') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 'file-99',
            name: 'todo-backup.zip',
            size: '1234',
            modifiedTime: '2026-11-27T16:00:00.000Z',
          }),
          { status: 200 }
        );
      }
      if (url.includes('backups-folder') && url.includes('orderBy=modifiedTime')) {
        return new Response(
          JSON.stringify({
            files: [{ id: 'file-99', name: 'todo-backup.zip', size: '1234', modifiedTime: '2026-11-27T16:00:00.000Z' }],
          }),
          { status: 200 }
        );
      }
      if (url.includes('/files/file-99?alt=media')) {
        return new Response('zip-bytes', { status: 200 });
      }
      if (url.includes('/files/file-99') && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      return new Response('Not found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const uploaded = await uploadFileToDrive({
      token: 'tok-abc',
      blob: new Blob(['zip-bytes'], { type: 'application/zip' }),
      fileName: 'todo-backup.zip',
      mimeType: 'application/zip',
      folder: 'Backups',
    });
    expect(uploaded.id).toBe('file-99');
    expect(uploaded.size).toBe(1234);

    const listed = await listDriveBackups('tok-abc');
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toBe('todo-backup.zip');

    const downloaded = await downloadFileFromDrive('tok-abc', 'file-99');
    expect(await downloaded.text()).toBe('zip-bytes');

    await expect(deleteFileFromDrive('tok-abc', 'file-99')).resolves.toBeUndefined();
  });

  it('silently shares a Drive file with deduplicated collaborator emails without sending email notifications', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: String(input),
          body: JSON.parse(String(init?.body ?? '{}')),
        });
        return new Response(JSON.stringify({ id: 'perm-1' }), { status: 200 });
      })
    );

    const res = await shareDriveFileSilently('tok-abc', 'file-42', [
      'Alice@Example.com',
      'alice@example.com',
      'bob@example.com',
      'not-an-email',
    ]);

    expect(res).toEqual({ shared: 2, failed: 0 });
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain('/files/file-42/permissions?sendNotificationEmail=false');
    expect(calls[0].body).toEqual({
      type: 'user',
      role: 'reader',
      emailAddress: 'alice@example.com',
    });
    expect(calls[1].body).toEqual({
      type: 'user',
      role: 'reader',
      emailAddress: 'bob@example.com',
    });
    expect(getDriveFileViewUrl('file-42')).toBe('https://drive.google.com/file/d/file-42/view');
    expect(getDriveFileDownloadUrl('file-42')).toBe(
      'https://drive.google.com/uc?id=file-42&export=download'
    );
  });
});
