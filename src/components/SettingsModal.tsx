import { useEffect, useRef, useState } from 'react';
import { isIosNonStandalone, isNotificationApiSupported } from '../lib/notifications';
import type { BackupImportMode, ParsedBackupPackage } from '../lib/backup';

export interface AppSettings {
  confirmBeforeDelete: boolean;
  addNewTasksOnTop: boolean;
  moveStarredToTop: boolean;
  playCompletionSound: boolean;
  reminderNotifications: boolean;
  themeMode: 'light' | 'dark' | 'glass-light' | 'glass-dark' | 'system';
  themeModeExplicit: boolean;
  smartImportant: boolean;
  smartPlanned: boolean;
  smartAll: boolean;
  smartCompleted: boolean;
  smartAssignedToMe: boolean;
  autoHideEmptySmartLists: boolean;
  showDueTodayInMyDay: boolean;
  mutedListIds: string[];
  smartThemes?: Record<string, { color?: string; background?: string; customBackgroundUrl?: string | null }>;
  customBackgrounds?: Array<{ id: string; url: string; path?: string | null }>;
  hiddenThemeColors?: string[];
  hiddenBackgrounds?: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  confirmBeforeDelete: false,
  addNewTasksOnTop: false,
  moveStarredToTop: true,
  playCompletionSound: true,
  reminderNotifications: true,
  themeMode: 'dark',
  themeModeExplicit: false,
  smartImportant: true,
  smartPlanned: false,
  smartAll: true,
  smartCompleted: true,
  smartAssignedToMe: false,
  autoHideEmptySmartLists: true,
  showDueTodayInMyDay: true,
  mutedListIds: [],
  smartThemes: {},
};

interface SettingsModalProps {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onExportJson: () => Promise<{ items: number; trashedItems: number; warnings: string[] }>;
  onInspectBackup: (file: File) => Promise<ParsedBackupPackage>;
  onImportBackup: (
    pkg: ParsedBackupPackage,
    mode: BackupImportMode,
    onProgress?: (status: string) => void
  ) => Promise<{ lists: number; items: number; groups: number; attachments: number; missingAttachments: number }>;
  onRollbackPartialImport: () => Promise<number>;
  hasPartialImport: boolean;
  onClose: () => void;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="setting-toggle" style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: 'var(--color-text-2)' }}>
      <button
        type="button"
        className={`toggle-pill ${checked ? 'on' : ''}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-knob" />
      </button>
      <span>{checked ? 'On' : 'Off'}</span>
    </div>
  );
}

function SettingBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="setting-block" style={{ padding: '14px 0', borderBottom: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text)' }}>{label}</div>
      {children}
    </div>
  );
}

export function SettingsModal({
  settings,
  onUpdateSettings,
  onExportJson,
  onInspectBackup,
  onImportBackup,
  onRollbackPartialImport,
  hasPartialImport,
  onClose,
}: SettingsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<ParsedBackupPackage | null>(null);
  const [importMode, setImportMode] = useState<BackupImportMode>('copy');
  const [backupFeedback, setBackupFeedback] = useState<{ kind: 'success' | 'error'; text: string; warnings?: string[] } | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <aside
        className="settings-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '525px',
          maxWidth: '100vw',
          height: '100%',
          background: 'var(--color-sidebar-bg)',
          borderLeft: '1px solid var(--color-border)',
          padding: '1.5rem 1.75rem',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 700 }}>Settings</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>

        <section style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '0.5rem 0 0', fontSize: '1.25rem', fontWeight: 700 }}>General</h3>
          <SettingBlock label="Confirm before deleting">
            <Toggle label="Confirm before deleting" checked={settings.confirmBeforeDelete} onChange={(v) => onUpdateSettings({ confirmBeforeDelete: v })} />
          </SettingBlock>
          <SettingBlock label="Add new tasks on top">
            <Toggle label="Add new tasks on top" checked={settings.addNewTasksOnTop} onChange={(v) => onUpdateSettings({ addNewTasksOnTop: v })} />
          </SettingBlock>
          <SettingBlock label="Move starred tasks to top">
            <Toggle label="Move starred tasks to top" checked={settings.moveStarredToTop} onChange={(v) => onUpdateSettings({ moveStarredToTop: v })} />
          </SettingBlock>
          <SettingBlock label="Play completion sound">
            <Toggle label="Play completion sound" checked={settings.playCompletionSound} onChange={(v) => onUpdateSettings({ playCompletionSound: v })} />
          </SettingBlock>
          <SettingBlock label="Turn on reminder notifications">
            <Toggle label="Turn on reminder notifications" checked={settings.reminderNotifications} onChange={(v) => onUpdateSettings({ reminderNotifications: v })} />
            {settings.reminderNotifications && isIosNonStandalone() && (
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-2)', marginTop: '6px' }}>
                On iPhone/iPad, install this app via Share → Add to Home Screen to receive push notifications.
              </div>
            )}
            {settings.reminderNotifications && isNotificationApiSupported() && Notification.permission === 'denied' && (
              <div style={{ fontSize: '0.78rem', color: '#ef4444', marginTop: '6px' }}>
                Notifications are blocked in your browser or OS settings. Allow them for this site to receive reminders.
              </div>
            )}
          </SettingBlock>
          <SettingBlock label="Theme">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <select
                value={settings.themeMode}
                onChange={(e) => onUpdateSettings({ themeMode: e.target.value as AppSettings['themeMode'] })}
                style={{ padding: '6px 10px', fontSize: '0.85rem', background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '4px', width: '120px' }}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="glass-light">iOS Glass Light</option>
                <option value="glass-dark">iOS Glass Dark</option>
                <option value="system">System</option>
              </select>
            </div>
          </SettingBlock>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '1rem 0 0', fontSize: '1.25rem', fontWeight: 700 }}>Smart lists</h3>
          <SettingBlock label="Important">
            <Toggle label="Important" checked={settings.smartImportant} onChange={(v) => onUpdateSettings({ smartImportant: v })} />
          </SettingBlock>
          <SettingBlock label="Planned">
            <Toggle label="Planned" checked={settings.smartPlanned} onChange={(v) => onUpdateSettings({ smartPlanned: v })} />
          </SettingBlock>
          <SettingBlock label="All">
            <Toggle label="All" checked={settings.smartAll} onChange={(v) => onUpdateSettings({ smartAll: v })} />
          </SettingBlock>
          <SettingBlock label="Completed">
            <Toggle label="Completed" checked={settings.smartCompleted} onChange={(v) => onUpdateSettings({ smartCompleted: v })} />
          </SettingBlock>
          <SettingBlock label="Assigned to me">
            <Toggle label="Assigned to me" checked={settings.smartAssignedToMe} onChange={(v) => onUpdateSettings({ smartAssignedToMe: v })} />
          </SettingBlock>
          <SettingBlock label="Auto-hide empty smart lists">
            <Toggle label="Auto-hide empty smart lists" checked={settings.autoHideEmptySmartLists} onChange={(v) => onUpdateSettings({ autoHideEmptySmartLists: v })} />
          </SettingBlock>
          <SettingBlock label="Show 'Due Today' tasks in My Day">
            <Toggle label="Show Due Today in My Day" checked={settings.showDueTodayInMyDay} onChange={(v) => onUpdateSettings({ showDueTodayInMyDay: v })} />
          </SettingBlock>
        </section>

        <section className="settings-about-section">
          <h3 className="settings-about-title">About</h3>
          <div className="settings-about-version">
            Version: ToDo PWA v0.1.0
          </div>
          <div className="settings-about-actions">
            <button
              type="button"
              className="settings-action-btn primary"
              disabled={exporting || importing}
              onClick={async () => {
                setExporting(true);
                setBackupFeedback(null);
                try {
                  const res = await onExportJson();
                  setBackupFeedback({
                    kind: 'success',
                    text: `Full backup exported (${res.items} tasks including ${res.trashedItems} in Trash).`,
                    warnings: res.warnings.length > 0 ? res.warnings : undefined,
                  });
                } catch (err) {
                  setBackupFeedback({
                    kind: 'error',
                    text: err instanceof Error ? err.message : 'Failed to export backup.',
                  });
                } finally {
                  setExporting(false);
                }
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>{exporting ? 'Exporting…' : 'Export everything'}</span>
            </button>
            <button
              type="button"
              className="settings-action-btn"
              disabled={importing || exporting}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>{importing ? (importProgress || 'Importing…') : 'Import backup (.zip / .json)'}</span>
            </button>
          </div>
          {preflight && (
            <div
              style={{
                marginTop: '10px',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg)',
                fontSize: '0.82rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ fontWeight: 600 }}>Backup preflight (v{preflight.summary.schemaVersion})</div>
              <div style={{ color: 'var(--color-text-2)' }}>
                {preflight.summary.groups} folder(s), {preflight.summary.lists} list(s), {preflight.summary.activeItems} active task(s), {preflight.summary.trashedItems} trashed task(s), {preflight.summary.restorableAttachments}/{preflight.summary.totalAttachments} attachment file(s) ready.
              </div>
              {preflight.warnings.length > 0 && (
                <div style={{ color: '#f59e0b', fontSize: '0.78rem' }}>
                  {preflight.warnings.slice(0, 5).map((w, idx) => (
                    <div key={idx}>• {w}</div>
                  ))}
                  {preflight.warnings.length > 5 && <div>• …and {preflight.warnings.length - 5} more warning(s)</div>}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="backup-import-mode"
                    checked={importMode === 'copy'}
                    onChange={() => setImportMode('copy')}
                  />
                  <span>Import as copies (keep existing data)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="backup-import-mode"
                    checked={importMode === 'replace'}
                    onChange={() => setImportMode('replace')}
                  />
                  <span>Replace my account data (deletes your owned lists &amp; tasks first)</span>
                </label>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="chip-btn"
                  disabled={importing}
                  onClick={() => setPreflight(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="chip-btn"
                  disabled={importing}
                  style={{ background: 'var(--color-accent)', color: 'var(--color-text-inverse)' }}
                  onClick={async () => {
                    setImporting(true);
                    setImportProgress('Starting import…');
                    setBackupFeedback(null);
                    try {
                      const summary = await onImportBackup(preflight, importMode, setImportProgress);
                      setPreflight(null);
                      setBackupFeedback({
                        kind: 'success',
                        text: `Imported ${summary.groups} folder(s), ${summary.lists} list(s), ${summary.items} task(s), and ${summary.attachments} attachment file(s).${summary.missingAttachments > 0 ? ` (${summary.missingAttachments} attachment file(s) were unavailable.)` : ''}`,
                      });
                    } catch (err) {
                      setBackupFeedback({
                        kind: 'error',
                        text: err instanceof Error ? err.message : 'Failed to import backup.',
                      });
                    } finally {
                      setImporting(false);
                      setImportProgress(null);
                    }
                  }}
                >
                  {importing ? 'Importing…' : 'Start import'}
                </button>
              </div>
            </div>
          )}
          {hasPartialImport && !importing && (
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '0.8rem', color: '#f59e0b' }}>
              <span>A previous import stopped partway through.</span>
              <button
                type="button"
                className="chip-btn"
                onClick={async () => {
                  setImporting(true);
                  try {
                    const removed = await onRollbackPartialImport();
                    setBackupFeedback({
                      kind: 'success',
                      text: `Removed ${removed} partially imported record(s).`,
                    });
                  } catch (err) {
                    setBackupFeedback({
                      kind: 'error',
                      text: err instanceof Error ? err.message : 'Failed to remove partial import.',
                    });
                  } finally {
                    setImporting(false);
                  }
                }}
              >
                Remove partial import
              </button>
            </div>
          )}
          {backupFeedback && (
            <div className={`settings-backup-feedback ${backupFeedback.kind}`} role="status">
              <div>{backupFeedback.text}</div>
              {backupFeedback.warnings && backupFeedback.warnings.length > 0 && (
                <div style={{ marginTop: '4px', fontSize: '0.76rem', opacity: 0.9 }}>
                  {backupFeedback.warnings.slice(0, 4).map((w, idx) => (
                    <div key={idx}>• {w}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip,application/json,.json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBackupFeedback(null);
              try {
                const parsed = await onInspectBackup(f);
                setPreflight(parsed);
                setImportMode('copy');
              } catch (err) {
                setPreflight(null);
                setBackupFeedback({
                  kind: 'error',
                  text: err instanceof Error ? err.message : 'Invalid backup file.',
                });
              } finally {
                e.target.value = '';
              }
            }}
          />
        </section>
      </aside>
    </div>
  );
}
