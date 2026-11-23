export type SyncStatus = 'online' | 'offline' | 'syncing' | 'synced';

interface TopBarProps {
  onToggleSidebar: () => void;
  syncStatus?: SyncStatus;
}

export function TopBar({ onToggleSidebar, syncStatus = 'online' }: TopBarProps) {
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
    </header>
  );
}
