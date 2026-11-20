import { useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';

export interface AppSettings {
  confirmBeforeDelete: boolean;
  addNewTasksOnTop: boolean;
  moveStarredToTop: boolean;
  playCompletionSound: boolean;
  reminderNotifications: boolean;
  themeMode: 'light' | 'dark' | 'system';
  themeModeExplicit: boolean;
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
  themeMode: 'dark',
  themeModeExplicit: false,
  smartImportant: true,
  smartPlanned: false,
  smartAll: true,
  smartCompleted: true,
  smartFlaggedEmail: true,
  smartAssignedToMe: false,
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
  user,
  settings,
  onUpdateSettings,
  onExportJson,
  onImportJson,
  onClose,
}: SettingsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copiedId, setCopiedId] = useState(false);

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
          <SettingBlock label="Flagged email">
            <Toggle label="Flagged email" checked={settings.smartFlaggedEmail} onChange={(v) => onUpdateSettings({ smartFlaggedEmail: v })} />
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

        <section style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '1rem 0 0', fontSize: '1.25rem', fontWeight: 700 }}>Connected apps</h3>
          <SettingBlock label="Planner">
            <Toggle label="Planner" checked={settings.connectedPlanner} onChange={(v) => onUpdateSettings({ connectedPlanner: v })} />
          </SettingBlock>
          <SettingBlock label="Flagged email">
            <Toggle label="Flagged email" checked={settings.connectedFlaggedEmail} onChange={(v) => onUpdateSettings({ connectedFlaggedEmail: v })} />
          </SettingBlock>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '1rem 0 0', fontSize: '1.25rem', fontWeight: 700 }}>Notifications</h3>
          <SettingBlock label="Email">
            <Toggle label="Email notifications" checked={settings.notifyEmailShare} onChange={(v) => onUpdateSettings({ notifyEmailShare: v })} />
          </SettingBlock>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '1rem 0 0', fontSize: '1.25rem', fontWeight: 700 }}>About</h3>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-2)', padding: '12px 0' }}>
            Version: ToDo PWA v0.1.0
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '12px 0' }}>
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
      </aside>
    </div>
  );
}
