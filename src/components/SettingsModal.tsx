import { useRef, useState } from 'react';
import { User } from 'firebase/auth';

export interface AppSettings {
  confirmBeforeDelete: boolean;
  addNewTasksOnTop: boolean;
  moveStarredToTop: boolean;
  playCompletionSound: boolean;
  reminderNotifications: boolean;
  themeMode: 'light' | 'dark' | 'system';
  smartImportant: boolean;
  smartPlanned: boolean;
  smartAll: boolean;
  smartCompleted: boolean;
  smartFlaggedEmail: boolean;
  smartAssignedToMe: boolean;
  autoHideEmptySmartLists: boolean;
  showDueTodayInMyDay: boolean;
  connectedPlanner: boolean;
  connectedFlaggedEmail: boolean;
  notifyEmailShare: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  confirmBeforeDelete: false,
  addNewTasksOnTop: false,
  moveStarredToTop: true,
  playCompletionSound: true,
  reminderNotifications: true,
  themeMode: 'system',
  smartImportant: true,
  smartPlanned: true,
  smartAll: true,
  smartCompleted: true,
  smartFlaggedEmail: true,
  smartAssignedToMe: true,
  autoHideEmptySmartLists: true,
  showDueTodayInMyDay: true,
  connectedPlanner: true,
  connectedFlaggedEmail: true,
  notifyEmailShare: true,
};

interface SettingsModalProps {
  user: User;
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onExportJson: () => void;
  onImportJson: (file: File) => Promise<void>;
  onClose: () => void;
}

export function SettingsModal({
  user,
  settings,
  onUpdateSettings,
  onExportJson,
  onImportJson,
  onClose,
}: SettingsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copiedId, setCopiedId] = useState(false);

  const toggleRow = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.88rem', cursor: 'pointer' }}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          padding: '1.25rem',
          width: '440px',
          maxWidth: '92vw',
          maxHeight: '85vh',
          overflowY: 'auto',
          background: 'var(--surface)',
          color: 'var(--text)',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-menu)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Settings</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>

        <section style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-2)' }}>General</h3>
          {toggleRow('Confirm before deleting', settings.confirmBeforeDelete, (v) => onUpdateSettings({ confirmBeforeDelete: v }))}
          {toggleRow('Add new tasks on top', settings.addNewTasksOnTop, (v) => onUpdateSettings({ addNewTasksOnTop: v }))}
          {toggleRow('Move starred tasks to top', settings.moveStarredToTop, (v) => onUpdateSettings({ moveStarredToTop: v }))}
          {toggleRow('Play completion sound', settings.playCompletionSound, (v) => onUpdateSettings({ playCompletionSound: v }))}
          {toggleRow('Turn on reminder notifications', settings.reminderNotifications, (v) => onUpdateSettings({ reminderNotifications: v }))}
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.88rem' }}>
            <span>Theme</span>
            <select
              value={settings.themeMode}
              onChange={(e) => onUpdateSettings({ themeMode: e.target.value as AppSettings['themeMode'] })}
              style={{ padding: '4px 8px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px' }}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </label>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-2)' }}>Smart lists</h3>
          {toggleRow('Important', settings.smartImportant, (v) => onUpdateSettings({ smartImportant: v }))}
          {toggleRow('Planned', settings.smartPlanned, (v) => onUpdateSettings({ smartPlanned: v }))}
          {toggleRow('All', settings.smartAll, (v) => onUpdateSettings({ smartAll: v }))}
          {toggleRow('Completed', settings.smartCompleted, (v) => onUpdateSettings({ smartCompleted: v }))}
          {toggleRow('Flagged email', settings.smartFlaggedEmail, (v) => onUpdateSettings({ smartFlaggedEmail: v }))}
          {toggleRow('Assigned to me', settings.smartAssignedToMe, (v) => onUpdateSettings({ smartAssignedToMe: v }))}
          {toggleRow('Auto-hide empty smart lists', settings.autoHideEmptySmartLists, (v) => onUpdateSettings({ autoHideEmptySmartLists: v }))}
          {toggleRow("Show 'Due Today' tasks in My Day", settings.showDueTodayInMyDay, (v) => onUpdateSettings({ showDueTodayInMyDay: v }))}
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-2)' }}>Connected apps</h3>
          {toggleRow('Planner', settings.connectedPlanner, (v) => onUpdateSettings({ connectedPlanner: v }))}
          {toggleRow('Flagged email', settings.connectedFlaggedEmail, (v) => onUpdateSettings({ connectedFlaggedEmail: v }))}
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-2)' }}>Notifications</h3>
          {toggleRow('Email (Get notified when a list is shared with you)', settings.notifyEmailShare, (v) => onUpdateSettings({ notifyEmailShare: v }))}
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-2)' }}>About</h3>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Version: ToDo PWA v0.1.0</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" className="chip-btn" onClick={onExportJson}>
              Export your info
            </button>
            <button type="button" className="chip-btn" onClick={() => fileInputRef.current?.click()}>
              Import JSON backup
            </button>
            <button
              type="button"
              className="chip-btn"
              onClick={() => {
                navigator.clipboard?.writeText(JSON.stringify({ sessionId: 'local-session', userId: user.uid }));
                setCopiedId(true);
                setTimeout(() => setCopiedId(false), 2000);
              }}
            >
              {copiedId ? 'Copied!' : 'Copy Session and User ID'}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                await onImportJson(f);
                e.target.value = '';
              }
            }}
          />
        </section>
      </div>
    </div>
  );
}
