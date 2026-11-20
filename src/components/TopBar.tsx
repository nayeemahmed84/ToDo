import { useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';

interface TopBarProps {
  user: User;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
}

export function TopBar({
  user,
  searchQuery,
  onSearchChange,
  onToggleSidebar,
  onOpenSettings,
  onSignOut,
}: TopBarProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setHelpOpen(false);
      }
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayName = user.displayName || 'User';
  const initials = (user.displayName || user.email || 'U')[0].toUpperCase();

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <button
          type="button"
          className="top-bar-icon-btn"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          title="Collapse/Expand menus"
        >
          ☰
        </button>
        <span className="top-bar-wordmark">ToDo PWA</span>
      </div>

      <div className="top-bar-center">
        <div className="top-bar-search">
          <span className="top-bar-search-icon" aria-hidden="true">
            🔍
          </span>
          <input
            type="search"
            placeholder="Search"
            aria-label="Search tasks"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="top-bar-search-clear"
              aria-label="Clear search"
              onClick={() => onSearchChange('')}
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="top-bar-right">
        <span
          className="top-bar-sync"
          title="Sync — Up to date"
          aria-label="Sync — Up to date"
        >
          ✓
        </span>

        <button
          type="button"
          className="top-bar-icon-btn"
          onClick={onOpenSettings}
          aria-label="Settings"
          title="Settings"
        >
          ⚙
        </button>

        <div className="top-bar-menu-wrap" ref={helpRef}>
          <button
            type="button"
            className="top-bar-icon-btn"
            onClick={() => setHelpOpen((v) => !v)}
            aria-label="Help & feedback"
            title="Help & feedback"
          >
            ?
          </button>
          {helpOpen && (
            <div className="top-bar-popover" role="dialog" aria-label="Help">
              <div className="top-bar-popover-row">Sync — Up to date</div>
              <button
                type="button"
                className="account-popover-item"
                onClick={() => {
                  setHelpOpen(false);
                  window.alert("What's new in ToDo PWA v0.1.0:\n• Smart lists including My Day, Important, Planned, All, Completed, Flagged email, and Assigned to me\n• List sharing with member management and invitation links\n• Custom recurrence, reminders, categories, and sorting");
                }}
              >
                What&apos;s new
              </button>
            </div>
          )}
        </div>

        <div className="top-bar-menu-wrap" ref={accountRef}>
          <button
            type="button"
            className="top-bar-avatar-btn"
            onClick={() => setAccountOpen((v) => !v)}
            aria-label={`Account manager for ${displayName}`}
            title={`Account manager for ${displayName}`}
          >
            {initials}
          </button>
          {accountOpen && (
            <div className="top-bar-popover account-popover" role="menu">
              <div className="account-popover-header">
                <div className="user-avatar">{initials}</div>
                <div className="user-meta">
                  <div className="user-name">{displayName}</div>
                  <div className="user-email">{user.email}</div>
                </div>
              </div>
              <div className="account-popover-divider" />
              <button
                type="button"
                className="account-popover-item"
                onClick={() => setAccountOpen(false)}
              >
                My profile
              </button>
              <button
                type="button"
                className="account-popover-item danger"
                onClick={() => {
                  setAccountOpen(false);
                  onSignOut();
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
