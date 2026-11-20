interface TopBarProps {
  onToggleSidebar: () => void;
}

export function TopBar({ onToggleSidebar }: TopBarProps) {
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
    </header>
  );
}
