import { useEffect, useRef, useState } from 'react';
import { isIosNonStandalone, isNotificationApiSupported } from '../lib/notifications';
import type { BackupImportMode, ParsedBackupPackage } from '../lib/backup';
import type { ListTemplate, SavedFilter } from '../types/todo';
import { buildIcalFeedUrls, getIcalWorkerBaseUrl } from '../lib/icalFeed';
import { isDriveSessionActive, type DriveBackupFile } from '../lib/googleDrive';
import { AppSelect } from './AppSelect';

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
  listTemplates?: ListTemplate[];
  savedFilters?: SavedFilter[];
  icalFeedToken?: string | null;
  googleDriveConnected?: boolean;
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
  onExportJson: (
    onProgress?: (status: { percent: number; detail: string }) => void
  ) => Promise<{ items: number; trashedItems: number; warnings: string[] }>;
  onInspectBackup: (file: File) => Promise<ParsedBackupPackage>;
  onImportBackup: (
    pkg: ParsedBackupPackage,
    mode: BackupImportMode,
    onProgress?: (status: string) => void
  ) => Promise<{ lists: number; items: number; groups: number; attachments: number; missingAttachments: number }>;
  onRollbackPartialImport: () => Promise<number>;
  hasPartialImport: boolean;
  onExportIcs?: () => number;
  onGenerateIcalFeed?: () => Promise<string>;
  onRevokeIcalFeed?: () => Promise<void>;
  onConnectGoogleDrive?: () => Promise<void>;
  onDisconnectGoogleDrive?: () => void;
  onBackupToGoogleDrive?: (
    onProgress?: (status: { percent: number; detail: string }) => void
  ) => Promise<{ fileName: string; items: number; trashedItems: number; warnings: string[] }>;
  onListGoogleDriveBackups?: () => Promise<DriveBackupFile[]>;
  onInspectGoogleDriveBackup?: (fileId: string) => Promise<ParsedBackupPackage>;
  focusSectionId?: string | null;
  focusToken?: number;
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

function SettingBlock({
  id,
  highlighted = false,
  label,
  children,
}: {
  id?: string;
  highlighted?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-setting-id={id}
      className={`setting-block ${highlighted ? 'command-highlight' : ''}`}
      style={{ padding: '14px 0', borderBottom: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '8px' }}
    >
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
  onExportIcs,
  onGenerateIcalFeed,
  onRevokeIcalFeed,
  onConnectGoogleDrive,
  onDisconnectGoogleDrive,
  onBackupToGoogleDrive,
  onListGoogleDriveBackups,
  onInspectGoogleDriveBackup,
  focusSectionId = null,
  focusToken = 0,
  onClose,
}: SettingsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [highlightedSettingId, setHighlightedSettingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [icalBusy, setIcalBusy] = useState(false);
  const [icalCopied, setIcalCopied] = useState(false);
  const [driveSessionActive, setDriveSessionActive] = useState<boolean>(() => isDriveSessionActive());
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveBackups, setDriveBackups] = useState<DriveBackupFile[] | null>(null);
  const [localExportProgress, setLocalExportProgress] = useState<{ percent: number; detail: string } | null>(null);
  const [driveBackupProgress, setDriveBackupProgress] = useState<{ percent: number; detail: string } | null>(null);
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

  useEffect(() => {
    if (!focusSectionId) return;
    setHighlightedSettingId(focusSectionId);
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

    const scrollTargetIntoPanel = () => {
      const panel = panelRef.current;
      const root = panel ?? document;
      const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(focusSectionId)
        : focusSectionId.replace(/["\\]/g, '\\$&');
      const el = root.querySelector<HTMLElement>(`[data-setting-id="${escaped}"]`);
      if (!el) return;
      if (panel) {
        const panelRect = panel.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const desiredTop = panel.scrollTop + (elRect.top - panelRect.top) - Math.max(24, (panel.clientHeight - elRect.height) / 2);
        panel.scrollTo({ top: Math.max(0, desiredTop), behavior });
      } else {
        el.scrollIntoView({ behavior, block: 'center', inline: 'nearest' });
      }
    };

    const rafId = window.requestAnimationFrame(() => {
      scrollTargetIntoPanel();
    });
    const settleTimer = window.setTimeout(scrollTargetIntoPanel, 220);
    const clearTimer = window.setTimeout(() => {
      setHighlightedSettingId(null);
    }, 1800);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(settleTimer);
      window.clearTimeout(clearTimer);
    };
  }, [focusSectionId, focusToken]);

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <aside
        ref={panelRef}
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

        <section
          data-setting-id="general"
          className={highlightedSettingId === 'general' ? 'command-highlight' : undefined}
          style={{ display: 'flex', flexDirection: 'column' }}
        >
          <h3 style={{ margin: '0.5rem 0 0', fontSize: '1.25rem', fontWeight: 700 }}>General</h3>
          <SettingBlock id="confirm-delete" highlighted={highlightedSettingId === 'confirm-delete'} label="Confirm before deleting">
            <Toggle label="Confirm before deleting" checked={settings.confirmBeforeDelete} onChange={(v) => onUpdateSettings({ confirmBeforeDelete: v })} />
          </SettingBlock>
          <SettingBlock id="add-on-top" highlighted={highlightedSettingId === 'add-on-top'} label="Add new tasks on top">
            <Toggle label="Add new tasks on top" checked={settings.addNewTasksOnTop} onChange={(v) => onUpdateSettings({ addNewTasksOnTop: v })} />
          </SettingBlock>
          <SettingBlock id="move-starred" highlighted={highlightedSettingId === 'move-starred'} label="Move starred tasks to top">
            <Toggle label="Move starred tasks to top" checked={settings.moveStarredToTop} onChange={(v) => onUpdateSettings({ moveStarredToTop: v })} />
          </SettingBlock>
          <SettingBlock id="completion-sound" highlighted={highlightedSettingId === 'completion-sound'} label="Play completion sound">
            <Toggle label="Play completion sound" checked={settings.playCompletionSound} onChange={(v) => onUpdateSettings({ playCompletionSound: v })} />
          </SettingBlock>
          <SettingBlock id="reminder-notifications" highlighted={highlightedSettingId === 'reminder-notifications'} label="Turn on reminder notifications">
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
          <SettingBlock id="theme" highlighted={highlightedSettingId === 'theme'} label="Theme">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '220px' }}>
              <AppSelect
                ariaLabel="App Theme"
                value={settings.themeMode}
                options={[
                  { value: 'light', label: 'Light', description: 'Crisp classic light surface' },
                  { value: 'dark', label: 'Dark', description: 'Low-glare dark workspace' },
                  { value: 'glass-light', label: 'iOS Glass Light', description: 'Frosted translucent light' },
                  { value: 'glass-dark', label: 'iOS Glass Dark', description: 'Frosted translucent dark' },
                  { value: 'system', label: 'System', description: 'Match OS appearance' },
                ]}
                onChange={(val) => onUpdateSettings({ themeMode: val as AppSettings['themeMode'] })}
              />
            </div>
          </SettingBlock>
        </section>

        <section
          data-setting-id="smart-lists"
          className={highlightedSettingId === 'smart-lists' ? 'command-highlight' : undefined}
          style={{ display: 'flex', flexDirection: 'column' }}
        >
          <h3 style={{ margin: '1rem 0 0', fontSize: '1.25rem', fontWeight: 700 }}>Smart lists</h3>
          <SettingBlock id="smart-important" highlighted={highlightedSettingId === 'smart-important'} label="Important">
            <Toggle label="Important" checked={settings.smartImportant} onChange={(v) => onUpdateSettings({ smartImportant: v })} />
          </SettingBlock>
          <SettingBlock id="smart-planned" highlighted={highlightedSettingId === 'smart-planned'} label="Planned">
            <Toggle label="Planned" checked={settings.smartPlanned} onChange={(v) => onUpdateSettings({ smartPlanned: v })} />
          </SettingBlock>
          <SettingBlock id="smart-all" highlighted={highlightedSettingId === 'smart-all'} label="All">
            <Toggle label="All" checked={settings.smartAll} onChange={(v) => onUpdateSettings({ smartAll: v })} />
          </SettingBlock>
          <SettingBlock id="smart-completed" highlighted={highlightedSettingId === 'smart-completed'} label="Completed">
            <Toggle label="Completed" checked={settings.smartCompleted} onChange={(v) => onUpdateSettings({ smartCompleted: v })} />
          </SettingBlock>
          <SettingBlock id="smart-assigned" highlighted={highlightedSettingId === 'smart-assigned'} label="Assigned to me">
            <Toggle label="Assigned to me" checked={settings.smartAssignedToMe} onChange={(v) => onUpdateSettings({ smartAssignedToMe: v })} />
          </SettingBlock>
          <SettingBlock id="auto-hide-smart" highlighted={highlightedSettingId === 'auto-hide-smart'} label="Auto-hide empty smart lists">
            <Toggle label="Auto-hide empty smart lists" checked={settings.autoHideEmptySmartLists} onChange={(v) => onUpdateSettings({ autoHideEmptySmartLists: v })} />
          </SettingBlock>
          <SettingBlock id="due-today-my-day" highlighted={highlightedSettingId === 'due-today-my-day'} label="Show 'Due Today' tasks in My Day">
            <Toggle label="Show Due Today in My Day" checked={settings.showDueTodayInMyDay} onChange={(v) => onUpdateSettings({ showDueTodayInMyDay: v })} />
          </SettingBlock>
        </section>

        <section className="settings-section-group">
          <div className="settings-section-heading">
            <h3>Data &amp; Backups</h3>
          </div>

          {backupFeedback && (
            <div className={`settings-banner ${backupFeedback.kind}`} role="status">
              <span className="settings-banner-icon" aria-hidden="true">
                {backupFeedback.kind === 'success' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                )}
              </span>
              <div className="settings-banner-body">
                <div>{backupFeedback.text}</div>
                {backupFeedback.warnings && backupFeedback.warnings.length > 0 && (
                  <div className="settings-banner-warnings">
                    {backupFeedback.warnings.slice(0, 4).map((w, idx) => (
                      <div key={idx}>• {w}</div>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="settings-banner-close"
                aria-label="Dismiss message"
                onClick={() => setBackupFeedback(null)}
              >
                ×
              </button>
            </div>
          )}

          {/* Local Backup Card */}
          <div data-setting-id="local-backup" className={`settings-card ${highlightedSettingId === 'local-backup' ? 'command-highlight' : ''}`}>
            <div className="settings-card-header">
              <div className="settings-card-icon-wrap">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <path d="M12 18v-6" />
                  <path d="m9 15 3 3 3-3" />
                </svg>
              </div>
              <div className="settings-card-heading">
                <div className="settings-card-title">Local Backup</div>
                <div className="settings-card-desc">
                  Export or restore a complete <code>.zip</code> archive of your lists, tasks, and attachments.
                </div>
              </div>
            </div>

            <div className="settings-btn-grid">
              <button
                type="button"
                className="settings-btn primary"
                disabled={exporting || importing}
                onClick={async () => {
                  setExporting(true);
                  setBackupFeedback(null);
                  setLocalExportProgress({ percent: 5, detail: 'Starting local backup…' });
                  try {
                    const res = await onExportJson(setLocalExportProgress);
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
                    setLocalExportProgress(null);
                  }
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>{exporting ? 'Exporting…' : 'Export backup'}</span>
              </button>
              <button
                type="button"
                className="settings-btn"
                disabled={importing || exporting}
                onClick={() => fileInputRef.current?.click()}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>{importing ? (importProgress || 'Importing…') : 'Import .zip / .json'}</span>
              </button>
            </div>

            {localExportProgress && (
              <div className="detail-upload-progress" style={{ margin: 0 }} role="status" aria-live="polite">
                <div className="detail-upload-progress-row">
                  <span className="detail-upload-progress-label">{localExportProgress.detail}</span>
                  <span className="detail-upload-progress-pct">{localExportProgress.percent}%</span>
                </div>
                <div className="detail-upload-progress-track">
                  <div
                    className="detail-upload-progress-fill"
                    style={{ width: `${localExportProgress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {preflight && (
              <div className="settings-preflight-box">
                <div className="settings-preflight-title">Backup preview (v{preflight.summary.schemaVersion})</div>
                <div className="settings-preflight-meta">
                  {preflight.summary.groups} folder(s) · {preflight.summary.lists} list(s) · {preflight.summary.activeItems} active task(s) · {preflight.summary.trashedItems} in Trash · {preflight.summary.restorableAttachments}/{preflight.summary.totalAttachments} attachment(s)
                </div>
                {preflight.warnings.length > 0 && (
                  <div className="settings-preflight-warnings">
                    {preflight.warnings.slice(0, 5).map((w, idx) => (
                      <div key={idx}>• {w}</div>
                    ))}
                    {preflight.warnings.length > 5 && <div>• …and {preflight.warnings.length - 5} more warning(s)</div>}
                  </div>
                )}
                <div className="settings-preflight-radios">
                  <label>
                    <input
                      type="radio"
                      name="backup-import-mode"
                      checked={importMode === 'copy'}
                      onChange={() => setImportMode('copy')}
                    />
                    <span>Import as copies (keep existing data)</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="backup-import-mode"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                    />
                    <span>Replace my account data (deletes owned lists &amp; tasks first)</span>
                  </label>
                </div>
                <div className="settings-preflight-actions">
                  <button
                    type="button"
                    className="settings-btn compact"
                    disabled={importing}
                    onClick={() => setPreflight(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="settings-btn primary compact"
                    disabled={importing}
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
              <div className="settings-partial-warning">
                <span>A previous import stopped partway through.</span>
                <button
                  type="button"
                  className="settings-btn compact"
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
                  Clean up
                </button>
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
          </div>

          {/* Google Drive Cloud Card */}
          {onConnectGoogleDrive && (
            <div data-setting-id="google-drive" className={`settings-card ${highlightedSettingId === 'google-drive' ? 'command-highlight' : ''}`}>
              <div className="settings-card-header">
                <div className="settings-card-icon-wrap drive">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
                  </svg>
                </div>
                <div className="settings-card-heading">
                  <div className="settings-card-title-row">
                    <span className="settings-card-title">Google Drive Sync</span>
                    <span
                      className={`settings-status-pill ${
                        driveSessionActive ? 'connected' : settings.googleDriveConnected ? 'warn' : 'idle'
                      }`}
                    >
                      <span className="settings-status-dot" aria-hidden="true" />
                      {driveSessionActive
                        ? 'Connected'
                        : settings.googleDriveConnected
                          ? 'Reconnect'
                          : 'Not connected'}
                    </span>
                  </div>
                  <div className="settings-card-desc">
                    Store attachments &amp; cloud backups privately in <code>ToDo PWA/</code> on your Google Drive.
                  </div>
                </div>
              </div>

              {!driveSessionActive && !settings.googleDriveConnected ? (
                <button
                  type="button"
                  className="settings-btn primary full"
                  disabled={driveBusy}
                  onClick={async () => {
                    setDriveBusy(true);
                    setBackupFeedback(null);
                    try {
                      await onConnectGoogleDrive();
                      setDriveSessionActive(true);
                      setBackupFeedback({
                        kind: 'success',
                        text: 'Google Drive connected. Attachments and cloud backups will save to ToDo PWA/ in your Drive.',
                      });
                    } catch (err) {
                      setBackupFeedback({
                        kind: 'error',
                        text: err instanceof Error ? err.message : 'Failed to connect Google Drive.',
                      });
                    } finally {
                      setDriveBusy(false);
                    }
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
                  </svg>
                  <span>{driveBusy ? 'Connecting…' : 'Connect Google Drive'}</span>
                </button>
              ) : (
                <>
                  <div className="settings-btn-grid">
                    {onBackupToGoogleDrive && (
                      <button
                        type="button"
                        className="settings-btn primary"
                        disabled={driveBusy || exporting || importing}
                        onClick={async () => {
                          setDriveBusy(true);
                          setBackupFeedback(null);
                          setDriveBackupProgress({ percent: 5, detail: 'Starting Google Drive backup…' });
                          try {
                            const res = await onBackupToGoogleDrive(setDriveBackupProgress);
                            setDriveSessionActive(true);
                            setBackupFeedback({
                              kind: 'success',
                              text: `Saved "${res.fileName}" to Google Drive (${res.items} tasks, ${res.trashedItems} in Trash).`,
                              warnings: res.warnings.length > 0 ? res.warnings : undefined,
                            });
                          } catch (err) {
                            setBackupFeedback({
                              kind: 'error',
                              text: err instanceof Error ? err.message : 'Failed to save backup to Google Drive.',
                            });
                          } finally {
                            setDriveBusy(false);
                            setDriveBackupProgress(null);
                          }
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                          <path d="M12 12v9" />
                          <path d="m16 16-4-4-4 4" />
                        </svg>
                        <span>{driveBackupProgress ? `Backing up (${driveBackupProgress.percent}%)` : driveBusy ? 'Working…' : 'Save backup'}</span>
                      </button>
                    )}
                    {onListGoogleDriveBackups && (
                      <button
                        type="button"
                        className="settings-btn"
                        disabled={driveBusy || importing}
                        onClick={async () => {
                          setDriveBusy(true);
                          setBackupFeedback(null);
                          try {
                            const files = await onListGoogleDriveBackups();
                            setDriveSessionActive(true);
                            setDriveBackups(files);
                            if (files.length === 0) {
                              setBackupFeedback({
                                kind: 'success',
                                text: 'No backups found in ToDo PWA/Backups on Google Drive yet.',
                              });
                            }
                          } catch (err) {
                            setBackupFeedback({
                              kind: 'error',
                              text: err instanceof Error ? err.message : 'Failed to load Google Drive backups.',
                            });
                          } finally {
                            setDriveBusy(false);
                          }
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                          <path d="M12 12v9" />
                          <path d="m8 17 4 4 4-4" />
                        </svg>
                        <span>Restore from Drive</span>
                      </button>
                    )}
                  </div>

                  {driveBackupProgress && (
                    <div className="detail-upload-progress" style={{ margin: 0 }} role="status" aria-live="polite">
                      <div className="detail-upload-progress-row">
                        <span className="detail-upload-progress-label">{driveBackupProgress.detail}</span>
                        <span className="detail-upload-progress-pct">{driveBackupProgress.percent}%</span>
                      </div>
                      <div className="detail-upload-progress-track">
                        <div
                          className="detail-upload-progress-fill"
                          style={{ width: `${driveBackupProgress.percent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="settings-card-footer-links">
                    <button
                      type="button"
                      className="settings-link-btn"
                      disabled={driveBusy}
                      onClick={async () => {
                        setDriveBusy(true);
                        setBackupFeedback(null);
                        try {
                          await onConnectGoogleDrive();
                          setDriveSessionActive(true);
                          setBackupFeedback({
                            kind: 'success',
                            text: 'Google Drive session refreshed.',
                          });
                        } catch (err) {
                          setBackupFeedback({
                            kind: 'error',
                            text: err instanceof Error ? err.message : 'Failed to reconnect Google Drive.',
                          });
                        } finally {
                          setDriveBusy(false);
                        }
                      }}
                    >
                      Reconnect Drive
                    </button>
                    {onDisconnectGoogleDrive && (
                      <>
                        <span className="settings-footer-dot" aria-hidden="true">·</span>
                        <button
                          type="button"
                          className="settings-link-btn danger"
                          disabled={driveBusy}
                          onClick={() => {
                            onDisconnectGoogleDrive();
                            setDriveSessionActive(false);
                            setDriveBackups(null);
                            setBackupFeedback({ kind: 'success', text: 'Disconnected Google Drive.' });
                          }}
                        >
                          Disconnect
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}

              {driveBackups && driveBackups.length > 0 && onInspectGoogleDriveBackup && (
                <div className="settings-drive-list">
                  <div className="settings-drive-list-label">Recent Drive backups</div>
                  {driveBackups.map((f) => (
                    <div key={f.id} className="settings-drive-item">
                      <div className="settings-drive-item-info">
                        <div className="settings-drive-item-name">{f.name}</div>
                        <div className="settings-drive-item-meta">
                          {Math.max(1, Math.round(f.size / 1024))} KB
                          {f.modifiedTime ? ` · ${new Date(f.modifiedTime).toLocaleString()}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="settings-btn compact"
                        disabled={driveBusy || importing}
                        onClick={async () => {
                          setDriveBusy(true);
                          setBackupFeedback(null);
                          try {
                            const parsed = await onInspectGoogleDriveBackup(f.id);
                            setPreflight(parsed);
                            setImportMode('copy');
                            setDriveBackups(null);
                          } catch (err) {
                            setBackupFeedback({
                              kind: 'error',
                              text: err instanceof Error ? err.message : 'Failed to load backup from Google Drive.',
                            });
                          } finally {
                            setDriveBusy(false);
                          }
                        }}
                      >
                        Inspect
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {onExportIcs && (
          <section className="settings-section-group">
            <div className="settings-section-heading">
              <h3>Calendar &amp; Live Feed</h3>
            </div>
            <div className="settings-card settings-card-stacked">
              <div data-setting-id="ics-export" className={`settings-card-row ${highlightedSettingId === 'ics-export' ? 'command-highlight' : ''}`}>
                <div className="settings-card-header">
                  <div className="settings-card-icon-wrap calendar">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <div className="settings-card-heading">
                    <div className="settings-card-title">One-time .ics Export</div>
                    <div className="settings-card-desc">
                      Download scheduled tasks for Google Calendar, Apple Calendar, or Outlook.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="settings-btn"
                  onClick={() => {
                    const count = onExportIcs();
                    setBackupFeedback({
                      kind: 'success',
                      text: count > 0
                        ? `Exported ${count} scheduled task(s) to .ics calendar file.`
                        : 'Exported empty .ics file (no open tasks with due dates).',
                    });
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Download .ics</span>
                </button>
              </div>

              {onGenerateIcalFeed && (
                <div data-setting-id="live-feed" className={`settings-card-row ${highlightedSettingId === 'live-feed' ? 'command-highlight' : ''}`}>
                  <div className="settings-card-header">
                    <div className="settings-card-icon-wrap feed">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 11a9 9 0 0 1 9 9" />
                        <path d="M4 4a16 16 0 0 1 16 16" />
                        <circle cx="5" cy="19" r="1" />
                      </svg>
                    </div>
                    <div className="settings-card-heading">
                      <div className="settings-card-title">Live Subscription (webcal)</div>
                      <div className="settings-card-desc">
                        Private token feed that keeps your external calendar automatically in sync.
                      </div>
                    </div>
                  </div>
                  {!getIcalWorkerBaseUrl() ? (
                    <div className="settings-muted-note">
                      Configure <code>VITE_NOTIFY_WORKER_URL</code> to enable live calendar subscriptions.
                    </div>
                  ) : settings.icalFeedToken ? (
                    (() => {
                      const urls = buildIcalFeedUrls(settings.icalFeedToken);
                      if (!urls) return null;
                      return (
                        <div className="settings-feed-box">
                          <div className="settings-url-row">
                            <input
                              type="text"
                              readOnly
                              className="settings-url-input"
                              value={urls.httpsUrl}
                              aria-label="Live iCal subscription URL"
                              onFocus={(e) => e.currentTarget.select()}
                            />
                            <button
                              type="button"
                              className="settings-btn compact"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(urls.httpsUrl);
                                  setIcalCopied(true);
                                  setTimeout(() => setIcalCopied(false), 2000);
                                } catch {
                                  // ignore clipboard errors
                                }
                              }}
                            >
                              {icalCopied ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                          <div className="settings-card-footer-links">
                            <a href={urls.webcalUrl} className="settings-link-btn accent">
                              Open in Calendar (webcal)
                            </a>
                            <span className="settings-footer-dot" aria-hidden="true">·</span>
                            <button
                              type="button"
                              className="settings-link-btn"
                              disabled={icalBusy}
                              onClick={async () => {
                                setIcalBusy(true);
                                try {
                                  await onGenerateIcalFeed();
                                } finally {
                                  setIcalBusy(false);
                                }
                              }}
                            >
                              Rotate link
                            </button>
                            {onRevokeIcalFeed && (
                              <>
                                <span className="settings-footer-dot" aria-hidden="true">·</span>
                                <button
                                  type="button"
                                  className="settings-link-btn danger"
                                  disabled={icalBusy}
                                  onClick={async () => {
                                    setIcalBusy(true);
                                    try {
                                      await onRevokeIcalFeed();
                                    } finally {
                                      setIcalBusy(false);
                                    }
                                  }}
                                >
                                  Revoke
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <button
                      type="button"
                      className="settings-btn"
                      disabled={icalBusy}
                      onClick={async () => {
                        setIcalBusy(true);
                        try {
                          await onGenerateIcalFeed();
                        } finally {
                          setIcalBusy(false);
                        }
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                      <span>{icalBusy ? 'Generating…' : 'Generate live feed link'}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        <footer className="settings-about-footer">
          <div className="settings-about-brand">
            <span className="settings-about-mark" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m4 12.5 5 5L20 6" />
              </svg>
            </span>
            <span className="settings-about-name">ToDo PWA</span>
            <span className="settings-about-badge">v0.1.0</span>
          </div>
          <span className="settings-about-sub">Offline-first · Free-tier sync</span>
        </footer>
      </aside>
    </div>
  );
}
