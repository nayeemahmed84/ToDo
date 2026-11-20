import { FormEvent, ReactNode, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { SmartListId, TodoGroup, TodoList, ViewSelection } from '../types/todo';
import {
  CalendarIcon,
  DownloadIcon,
  HomeIcon,
  ListIcon,
  LogOutIcon,
  MoonIcon,
  StarIcon,
  SunIcon,
  VolumeIcon,
} from './Icons';

interface SidebarProps {
  user: User;
  lists: TodoList[];
  groups: TodoGroup[];
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
  onCreateGroup: (title: string) => Promise<void>;
  onToggleGroup: (group: TodoGroup) => Promise<void>;
  onDeleteList: (listId: string) => Promise<void>;
  onExportJson: () => void;
  onImportJson: (file: File) => Promise<void>;
  onSignOut: () => void;
}

const SMART_LISTS: { id: SmartListId; label: string; icon: ReactNode }[] = [
  { id: 'my-day', label: 'My Day', icon: <SunIcon /> },
  { id: 'important', label: 'Important', icon: <StarIcon /> },
  { id: 'planned', label: 'Planned', icon: <CalendarIcon /> },
  { id: 'tasks', label: 'Tasks', icon: <HomeIcon /> },
];

export function Sidebar({
  user,
  lists,
  groups,
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
  onCreateGroup,
  onToggleGroup,
  onDeleteList,
  onExportJson,
  onImportJson,
  onSignOut,
}: SidebarProps) {
  const [newListTitle, setNewListTitle] = useState('');
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
            <LogOutIcon />
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

          {groups.map((group) => (
            <div key={group.id} className="nav-group">
              <button
                className="nav-item group-header"
                onClick={() => onToggleGroup(group)}
              >
                <span className="nav-icon">📁</span>
                <span className="nav-label">{group.title}</span>
                <span className="nav-count">
                  {group.collapsed ? '▸' : '▾'}
                </span>
              </button>
            </div>
          ))}

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
                  <span className="nav-icon">
                    <ListIcon />
                  </span>
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
        <form
          className="new-list-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newGroupTitle.trim()) return;
            await onCreateGroup(newGroupTitle.trim());
            setNewGroupTitle('');
          }}
        >
          <input
            type="text"
            placeholder="+ New group"
            value={newGroupTitle}
            onChange={(e) => setNewGroupTitle(e.target.value)}
          />
        </form>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              await onImportJson(file);
              e.target.value = '';
            }
          }}
        />

        <div className="sidebar-footer">
          <button
            className="export-btn"
            onClick={onToggleDarkMode}
            title="Toggle dark mode"
          >
            {darkMode ? <SunIcon size={14} /> : <MoonIcon size={14} />}
            <span>{darkMode ? 'Light' : 'Dark'}</span>
          </button>
          <button
            className="export-btn"
            onClick={onToggleSound}
            title="Toggle completion sound"
          >
            <VolumeIcon size={14} muted={!soundEnabled} />
            <span>{soundEnabled ? 'Sound' : 'Muted'}</span>
          </button>
          <button className="export-btn" onClick={onExportJson}>
            <DownloadIcon size={14} />
            <span>Export</span>
          </button>
          <button
            className="export-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Import JSON backup"
          >
            <span>Import</span>
          </button>
        </div>
      </aside>
    </>
  );
}
