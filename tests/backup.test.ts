import { describe, expect, it } from 'vitest';
import {
  BACKUP_SCHEMA_VERSION,
  buildBackupArchive,
  parseBackupBytes,
} from '../src/lib/backup';
import { DEFAULT_SETTINGS } from '../src/components/SettingsModal';
import type { TodoGroup, TodoItem, TodoList } from '../src/types/todo';

describe('backup archive round trip and validation', () => {
  it('exports and parses groups, lists, active and trashed items, settings, and attachment bytes', async () => {
    const groups: TodoGroup[] = [
      { id: 'g1', title: 'Work', ownerUid: 'u1', collapsed: false, sortOrder: 1 },
    ];
    const lists: TodoList[] = [
      { id: 'l1', title: 'Projects', ownerUid: 'u1', groupId: 'g1', color: 'purple', sortOrder: 1 },
      { id: 'l-shared', title: 'Shared Team', ownerUid: 'other-user', memberUids: ['u1'] },
    ];
    const items: TodoItem[] = [
      {
        id: 'i1',
        listId: 'l1',
        ownerUid: 'u1',
        text: 'Active task with file',
        done: false,
        important: true,
        myDayDate: '2026-11-26',
        dueDate: '2026-11-27',
        reminderAtMs: 1795700000000,
        reminderNotified: false,
        repeat: 'weekdays',
        category: 'blue',
        notes: 'Important note',
        steps: [{ id: 's1', text: 'Step 1', done: false }],
        attachments: [
          { id: 'att-present', name: 'spec.txt', size: 11, type: 'text/plain' },
          { id: 'att-missing', name: 'gone.pdf', size: 500, type: 'application/pdf' },
        ],
        createdAtMs: 1000,
      },
      {
        id: 'i2',
        listId: 'l1',
        ownerUid: 'u1',
        text: 'Trashed task',
        done: false,
        important: false,
        myDayDate: null,
        dueDate: null,
        category: null,
        notes: '',
        steps: [],
        createdAtMs: 2000,
        deletedAtMs: 3000,
      },
    ];

    const fileBytes = new TextEncoder().encode('hello world');
    const { zipBytes, missingAttachmentWarnings } = await buildBackupArchive({
      account: { uid: 'u1', displayName: 'Naiem', email: 'naiem@example.com' },
      settings: DEFAULT_SETTINGS,
      uiState: { collapsedLists: ['l1'] },
      groups,
      lists,
      items,
      readAttachmentBlob: async (id) => {
        if (id === 'att-present') return new Blob([fileBytes], { type: 'text/plain' });
        return null;
      },
    });

    expect(missingAttachmentWarnings).toHaveLength(1);
    expect(missingAttachmentWarnings[0]).toContain('gone.pdf');

    const parsed = await parseBackupBytes(zipBytes);
    expect(parsed.manifest.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(parsed.summary).toMatchObject({
      schemaVersion: 2,
      groups: 1,
      lists: 2,
      activeItems: 1,
      trashedItems: 1,
      totalAttachments: 2,
      restorableAttachments: 1,
      missingAttachments: 1,
    });
    expect(parsed.manifest.lists.find((l) => l.id === 'l-shared')?.wasShared).toBe(true);
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]).toContain('gone.pdf');

    const restoredBytes = parsed.attachmentBlobs.get('attachments/att-present');
    expect(restoredBytes).toBeDefined();
    expect(new TextDecoder().decode(restoredBytes!)).toBe('hello world');
  });

  it('migrates legacy v1 JSON backups and reports missing attachment bytes', async () => {
    const legacyJson = JSON.stringify({
      version: '0.1.0',
      exportedAt: '2026-10-01T00:00:00.000Z',
      lists: [{ id: 'old-l1', title: 'Legacy List' }],
      items: [
        {
          id: 'old-i1',
          listId: 'old-l1',
          text: 'Legacy task',
          attachments: [{ id: 'old-att', name: 'photo.jpg', size: 100 }],
        },
      ],
    });

    const parsed = await parseBackupBytes(new TextEncoder().encode(legacyJson));
    expect(parsed.summary.schemaVersion).toBe(1);
    expect(parsed.summary.lists).toBe(1);
    expect(parsed.summary.activeItems).toBe(1);
    expect(parsed.summary.missingAttachments).toBe(1);
    expect(parsed.warnings[0]).toContain('photo.jpg');
  });

  it('rejects unsupported future schema versions and malformed files before writes', async () => {
    await expect(
      parseBackupBytes(new TextEncoder().encode('not-json'))
    ).rejects.toThrow(/Invalid backup file/);

    await expect(
      parseBackupBytes(
        new TextEncoder().encode(JSON.stringify({ schemaVersion: 99, lists: [] }))
      )
    ).rejects.toThrow(/Unsupported backup version/);

    await expect(
      parseBackupBytes(
        new TextEncoder().encode(JSON.stringify({ lists: 'not-an-array' }))
      )
    ).rejects.toThrow(/must be an array/);

    await expect(
      parseBackupBytes(new TextEncoder().encode(JSON.stringify({ foo: 'bar' })))
    ).rejects.toThrow(/no groups, lists, tasks, or settings/i);
  });
});
