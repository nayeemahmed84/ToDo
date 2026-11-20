import { FormEvent, useState } from 'react';
import { User } from 'firebase/auth';
import { SmartListId, TodoList, ViewSelection } from '../types/todo';

interface SidebarProps {
  user: User;
  lists: TodoList[];
  selection: ViewSelection;
  searchQuery: string;
  counts: Record<SmartListId, number> & Record<string, number>;
  isOpen: boolean;
  darkMode: boolean;
  soundEnabled: boolean;
  onToggleDarkMode: () => void;
  onToggleSound: () => void;
  onClose: () => void;
  onSelect: (sel: ViewSelection) => void;
  onSearchChange: (q: string) => void;
  onCreateList: (title: string) => Promise<void>;
  onDeleteList: (listId: string) => Promise<void>;
  onExportJson: () => void;
  onSignOut: () => void;
}

const SMART_LISTS: { id: SmartListId; label: string; icon: string }[] = [
  { id: 'my-day', label: 'My Day', icon: '☀️' },
  { id: 'important', label: 'Important', icon: '⭐' },
  { id: 'planned', label: 'Planned', icon: '📅' },
  { id: 'tasks', label: 'Tasks', icon: '🏠' },
];

export function Sidebar({
  user,
  lists,
  selection,
  searchQuery,
  counts,
  isOpen,
  darkMode,
  soundEnabled,
  onToggleDarkMode,
  onToggleSound,
  onClose,
  onSelect,
  onSearchChange,
  onCreateList,
  onDeleteList,
  onExportJson,
  onSignOut,
}: SidebarProps) {
  const [newListTitle, setNewListTitle] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newListTitle.trim()) return;
    await onCreateList(newListTitle.trim());
    setNewListTitle('');
  };

  return (
    <>
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} />}
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-user">
          <div className="user-avatar">
            {(user.displayName || user.email || 'U')[0].toUpperCase()}
          </div>
          <div className="user-meta">
            <div className="user-name">{user.displayName || 'User'}</div>
            <div className="user-email">{user.email}</div>
          </div>
          <button className="icon-btn" title="Sign out" onClick={onSignOut}>
            ↪
          </button>
        </div>

        <div className="sidebar-search">
          <input
            type="search"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <nav className="sidebar-nav">
          {SMART_LISTS.map((item) => {
            const active =
              !searchQuery &&
              selection.type === 'smart' &&
              selection.id === item.id;
            return (
              <button
                key={item.id}
                className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => {
                  onSearchChange('');
                  onSelect({ type: 'smart', id: item.id });
                  onClose();
                }}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
                {counts[item.id] > 0 && (
                  <span className="nav-count">{counts[item.id]}</span>
                )}
              </button>
            );
          })}

          <div className="nav-divider" />

          {lists.map((list) => {
            const active =
              !searchQuery &&
              selection.type === 'list' &&
              selection.id === list.id;
            return (
              <div
                key={list.id}
                className={`nav-item-row ${active ? 'active' : ''}`}
              >
                <button
                  className="nav-item-main"
                  onClick={() => {
                    onSearchChange('');
                    onSelect({ type: 'list', id: list.id });
                    onClose();
                  }}
                >
                  <span className="nav-icon">☰</span>
                  <span className="nav-label">{list.title}</span>
                  {(counts[list.id] ?? 0) > 0 && (
                    <span className="nav-count">{counts[list.id]}</span>
                  )}
                </button>
                <button
                  className="nav-delete"
                  title="Delete list"
                  onClick={() => onDeleteList(list.id)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </nav>

        <form className="new-list-form" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="+ New list"
            value={newListTitle}
            onChange={(e) => setNewListTitle(e.target.value)}
          />
        </form>

        <div className="sidebar-footer">
          <button
            className="export-btn"
            onClick={onToggleDarkMode}
            title="Toggle dark mode"
          >
            {darkMode ? '☀️ Light' : '🌙 Dark'}
          </button>
          <button
            className="export-btn"
            onClick={onToggleSound}
            title="Toggle completion sound"
          >
            {soundEnabled ? '🔊 Sound' : '🔇 Muted'}
          </button>
          <button className="export-btn" onClick={onExportJson}>
            Export
          </button>
        </div>
      </aside>
    </>
  );
}
