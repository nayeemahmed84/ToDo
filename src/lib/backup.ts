import type { AppSettings } from '../components/SettingsModal';
import type { TodoGroup, TodoItem, TodoList } from '../types/todo';
import { createZipBytes, isZipBytes, readZipBytes } from './zipArchive';

export const BACKUP_SCHEMA_VERSION = 2;

export interface BackupAttachmentManifestEntry {
  id: string;
  name: string;
  size: number;
  type?: string;
  archivePath: string | null;
  missing: boolean;
}

export interface BackupManifestV2 {
  schemaVersion: 2;
  version: string;
  exportedAt: string;
  account: {
    uid: string;
    displayName: string | null;
    email: string | null;
  } | null;
  settings?: Partial<AppSettings>;
  uiState?: Record<string, unknown>;
  groups: Array<Partial<TodoGroup> & { id?: string }>;
  lists: Array<Partial<TodoList> & { id?: string; wasShared?: boolean }>;
  items: Array<Partial<TodoItem>>;
  attachments: BackupAttachmentManifestEntry[];
}

export interface ParsedBackupPackage {
  manifest: BackupManifestV2;
  attachmentBlobs: Map<string, Uint8Array>;
  warnings: string[];
  summary: {
    schemaVersion: number;
    exportedAt: string | null;
    groups: number;
    lists: number;
    activeItems: number;
    trashedItems: number;
    totalAttachments: number;
    restorableAttachments: number;
    missingAttachments: number;
  };
}

export type BackupImportMode = 'copy' | 'replace';

export interface PartialImportRecord {
  batchId: string;
  createdAtMs: number;
  groupIds: string[];
  listIds: string[];
  itemPaths: Array<{ listId: string; itemId: string }>;
  attachmentIds: string[];
}

export const LAST_IMPORT_BATCH_KEY = 'todo.lastPartialImportBatch';

export async function buildBackupArchive(params: {
  account: BackupManifestV2['account'];
  settings: AppSettings;
  uiState: Record<string, unknown>;
  groups: TodoGroup[];
  lists: TodoList[];
  items: TodoItem[]; // Includes BOTH active and trashed items
  readAttachmentBlob: (id: string) => Promise<Blob | null>;
  onProgress?: (info: {
    phase: 'attachments' | 'zip';
    current?: number;
    total?: number;
    detail: string;
  }) => void;
}): Promise<{
  zipBytes: Uint8Array;
  manifest: BackupManifestV2;
  missingAttachmentWarnings: string[];
}> {
  const { account, settings, uiState, groups, lists, items, readAttachmentBlob, onProgress } = params;
  const attachmentEntries: BackupAttachmentManifestEntry[] = [];
  const zipEntries: Array<{ name: string; data: Uint8Array }> = [];
  const seenAttachmentIds = new Set<string>();
  const missingAttachmentWarnings: string[] = [];

  const uniqueAttachments: Array<{ att: NonNullable<TodoItem['attachments']>[number]; itemText: string }> = [];
  for (const item of items) {
    for (const att of item.attachments ?? []) {
      if (!att?.id || seenAttachmentIds.has(att.id)) continue;
      seenAttachmentIds.add(att.id);
      uniqueAttachments.push({ att, itemText: item.text });
    }
  }

  for (let idx = 0; idx < uniqueAttachments.length; idx++) {
    const { att, itemText } = uniqueAttachments[idx];
    onProgress?.({
      phase: 'attachments',
      current: idx + 1,
      total: uniqueAttachments.length,
      detail: `Packaging attachment ${idx + 1}/${uniqueAttachments.length} (${att.name})…`,
    });
    let blob: Blob | null = null;
    try {
      blob = await readAttachmentBlob(att.id);
    } catch {
      blob = null;
    }
    if (blob) {
      const archivePath = `attachments/${att.id}`;
      const buf = new Uint8Array(await blob.arrayBuffer());
      zipEntries.push({ name: archivePath, data: buf });
      attachmentEntries.push({
        id: att.id,
        name: att.name,
        size: att.size ?? buf.byteLength,
        type: att.type || blob.type || undefined,
        archivePath,
        missing: false,
      });
    } else {
      attachmentEntries.push({
        id: att.id,
        name: att.name,
        size: att.size ?? 0,
        type: att.type,
        archivePath: null,
        missing: true,
      });
      missingAttachmentWarnings.push(`Missing local file for "${att.name}" (task "${itemText}")`);
    }
  }

  onProgress?.({
    phase: 'zip',
    detail: `Building ZIP archive (${items.length} tasks, ${zipEntries.length} file${zipEntries.length === 1 ? '' : 's'})…`,
  });

  const manifest: BackupManifestV2 = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    version: '0.2.0',
    exportedAt: new Date().toISOString(),
    account,
    settings,
    uiState,
    groups: groups.map((g) => ({ ...g })),
    lists: lists.map((l) => ({
      ...l,
      wasShared: Boolean(account?.uid && l.ownerUid !== account.uid),
    })),
    items: items.map((i) => ({ ...i })),
    attachments: attachmentEntries,
  };

  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  const zipBytes = createZipBytes([
    { name: 'backup.json', data: manifestBytes },
    ...zipEntries,
  ]);

  return { zipBytes, manifest, missingAttachmentWarnings };
}

function assertArrayOfObjects(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Invalid backup format: "${fieldName}" must be an array.`);
  }
  for (let i = 0; i < value.length; i++) {
    if (!value[i] || typeof value[i] !== 'object' || Array.isArray(value[i])) {
      throw new Error(`Invalid backup format: "${fieldName}[${i}]" must be an object.`);
    }
  }
  return value as Array<Record<string, unknown>>;
}

export function validateAndMigrateBackupManifest(
  raw: unknown,
  attachmentBlobs: Map<string, Uint8Array> = new Map()
): ParsedBackupPackage {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid backup file: root JSON must be an object.');
  }
  const obj = raw as Record<string, unknown>;

  let sourceVersion = 1;
  if ('schemaVersion' in obj && obj.schemaVersion !== undefined) {
    if (typeof obj.schemaVersion !== 'number' || !Number.isInteger(obj.schemaVersion) || obj.schemaVersion < 1) {
      throw new Error('Invalid backup file: schemaVersion must be a positive integer.');
    }
    if (obj.schemaVersion > BACKUP_SCHEMA_VERSION) {
      throw new Error(
        `Unsupported backup version (v${obj.schemaVersion}). Update ToDo PWA before importing this file.`
      );
    }
    sourceVersion = obj.schemaVersion;
  }

  const groups = assertArrayOfObjects(obj.groups, 'groups') as BackupManifestV2['groups'];
  const lists = assertArrayOfObjects(obj.lists, 'lists') as BackupManifestV2['lists'];
  const items = assertArrayOfObjects(obj.items, 'items') as BackupManifestV2['items'];
  const extraTrashed = assertArrayOfObjects(obj.trashedItems, 'trashedItems') as BackupManifestV2['items'];
  const allItems = [...items, ...extraTrashed];

  if (obj.settings !== undefined && (typeof obj.settings !== 'object' || obj.settings === null || Array.isArray(obj.settings))) {
    throw new Error('Invalid backup format: "settings" must be an object.');
  }

  const hasAnySection =
    obj.groups !== undefined ||
    obj.lists !== undefined ||
    obj.items !== undefined ||
    obj.trashedItems !== undefined ||
    obj.settings !== undefined;

  if (!hasAnySection) {
    throw new Error('Invalid backup file: no groups, lists, tasks, or settings found.');
  }

  const rawAttachments = assertArrayOfObjects(obj.attachments, 'attachments') as unknown as BackupAttachmentManifestEntry[];
  const attachmentEntryById = new Map<string, BackupAttachmentManifestEntry>();
  for (const entry of rawAttachments) {
    if (typeof entry.id === 'string') {
      attachmentEntryById.set(entry.id, entry);
    }
  }

  const warnings: string[] = [];
  let totalAttachments = 0;
  let restorableAttachments = 0;
  let missingAttachments = 0;
  const countedAttIds = new Set<string>();

  for (const item of allItems) {
    if (item.attachments !== undefined && !Array.isArray(item.attachments)) {
      throw new Error('Invalid backup format: task "attachments" must be an array.');
    }
    for (const att of item.attachments ?? []) {
      if (!att?.id || countedAttIds.has(att.id)) continue;
      countedAttIds.add(att.id);
      totalAttachments++;
      const manifestEntry = attachmentEntryById.get(att.id);
      const hasBlob = Boolean(
        manifestEntry?.archivePath && attachmentBlobs.has(manifestEntry.archivePath)
      );
      if (hasBlob) {
        restorableAttachments++;
      } else {
        missingAttachments++;
        warnings.push(`Attachment "${att.name || att.id}" has no file data in this backup and will be marked unavailable.`);
      }
    }
  }

  const activeItems = allItems.filter((i) => !i.deletedAtMs).length;
  const trashedItems = allItems.filter((i) => Boolean(i.deletedAtMs)).length;

  const manifest: BackupManifestV2 = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    version: typeof obj.version === 'string' ? obj.version : '0.1.0',
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    account: (obj.account as BackupManifestV2['account']) ?? null,
    settings: obj.settings as Partial<AppSettings> | undefined,
    uiState: obj.uiState as Record<string, unknown> | undefined,
    groups,
    lists,
    items: allItems,
    attachments: rawAttachments,
  };

  return {
    manifest,
    attachmentBlobs,
    warnings,
    summary: {
      schemaVersion: sourceVersion,
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : null,
      groups: groups.length,
      lists: lists.length,
      activeItems,
      trashedItems,
      totalAttachments,
      restorableAttachments,
      missingAttachments,
    },
  };
}

export async function parseBackupBytes(bytes: Uint8Array): Promise<ParsedBackupPackage> {
  if (isZipBytes(bytes)) {
    const entries = readZipBytes(bytes);
    const manifestBytes = entries.get('backup.json');
    if (!manifestBytes) {
      throw new Error('Invalid backup archive: missing backup.json manifest.');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(manifestBytes));
    } catch {
      throw new Error('Invalid backup archive: backup.json is not valid JSON.');
    }
    return validateAndMigrateBackupManifest(parsed, entries);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('Invalid backup file: expected a .zip archive or valid .json file.');
  }
  return validateAndMigrateBackupManifest(parsed, new Map());
}
