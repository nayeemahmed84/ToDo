export type SyncStatus = 'online' | 'offline' | 'syncing' | 'synced';

interface TopBarProps {
  onToggleSidebar: () => void;
  syncStatus?: SyncStatus;
  canInstall?: boolean;
  onInstallClick?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenInsights?: () => void;
  onOpenTemplates?: () => void;
}

export function TopBar({
  onToggleSidebar,
  syncStatus = 'online',
  canInstall = false,
  onInstallClick,
  onOpenCommandPalette,
  onOpenInsights,
  onOpenTemplates,
}: TopBarProps) {
  return (
    <header className="top-bar">
      <button
        type="button"
        className="top-bar-menu-btn"
        onClick={onToggleSidebar}
        aria-label="Open navigation"
        title="Open navigation"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>
      <div className="top-bar-brand" aria-label="To Do">
        <span className="top-bar-mark" aria-hidden="true">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="m4 12.5 5 5L20 6" />
          </svg>
        </span>
        <span className="top-bar-wordmark">To Do</span>
      </div>
      <div className="top-bar-spacer" />
      <div className="top-bar-quick-actions">
        {onOpenCommandPalette && (
          <button
            type="button"
            className="top-bar-action-btn"
            onClick={onOpenCommandPalette}
            title="Command Palette (Ctrl+K)"
            aria-label="Open Command Palette"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span className="top-bar-action-kbd">⌘K</span>
          </button>
        )}
        {onOpenInsights && (
          <button
            type="button"
            className="top-bar-action-btn"
            onClick={onOpenInsights}
            title="Daily Review & Productivity Insights"
            aria-label="Open Daily Review and Insights"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </button>
        )}
        {onOpenTemplates && (
          <button
            type="button"
            className="top-bar-action-btn"
            onClick={onOpenTemplates}
            title="List Templates & Checklists"
            aria-label="Open List Templates"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
          </button>
        )}
      </div>
      {syncStatus !== 'online' && (
        <div
          className={`top-bar-sync-pill status-${syncStatus}`}
          role="status"
          aria-live="polite"
          title={
            syncStatus === 'offline'
              ? 'You are offline. Changes are saved locally and will sync when you reconnect.'
              : syncStatus === 'syncing'
                ? 'Syncing offline changes…'
                : 'All changes synced'
          }
        >
          <span className="top-bar-sync-dot" aria-hidden="true" />
          <span>
            {syncStatus === 'offline'
              ? 'Offline · Saved locally'
              : syncStatus === 'syncing'
                ? 'Syncing…'
                : 'Synced'}
          </span>
        </div>
      )}
      {canInstall && onInstallClick && (
        <button
          type="button"
          className="top-bar-install-btn"
          onClick={onInstallClick}
          title="Install To Do as an app on this device"
          aria-label="Install app"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Install</span>
        </button>
      )}
    </header>
  );
}
