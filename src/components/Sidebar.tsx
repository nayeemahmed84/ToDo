import { FormEvent, KeyboardEvent, ReactNode, useRef, useState } from 'react';
import { SmartListId, TodoGroup, TodoList, ViewSelection } from '../types/todo';
import { AppSettings } from './SettingsModal';
import {
  CalendarIcon,
  HomeIcon,
  ListIcon,
  StarIcon,
  SunIcon,
} from './Icons';

interface SidebarProps {
  lists: TodoList[];
  groups: TodoGroup[];
  selection: ViewSelection;
  searchQuery: string;
  counts: Record<SmartListId, number> & Record<string, number>;
  settings: AppSettings;
  isOpen: boolean;
  collapsed: boolean;
  onClose: () => void;
  onSelect: (sel: ViewSelection) => void;
  onSearchChange: (q: string) => void;
  onCreateList: (title: string) => Promise<void>;
  onCreateGroup: (title: string) => Promise<void>;
  onToggleGroup: (group: TodoGroup) => Promise<void>;
  onDeleteList: (listId: string) => Promise<void>;
  onShareList?: (listId: string) => void;
  onDuplicateList?: (listId: string) => void;
  onRenameList?: (listId: string, name: string) => Promise<void>;
  onRenameGroup?: (groupId: string, name: string) => Promise<void>;
  onUngroupLists?: (groupId: string) => Promise<void>;
}

const SMART_LISTS: { id: SmartListId; label: string; icon: ReactNode }[] = [
  { id: 'my-day', label: 'My Day', icon: <SunIcon /> },
  { id: 'important', label: 'Important', icon: <StarIcon /> },
  { id: 'planned', label: 'Planned', icon: <CalendarIcon /> },
  { id: 'all', label: 'All', icon: <span>∞</span> },
  { id: 'completed', label: 'Completed', icon: <span>✓</span> },
  { id: 'flagged-email', label: 'Flagged email', icon: <span>✉</span> },
  { id: 'assigned-to-me', label: 'Assigned to me', icon: <span>👤</span> },
  { id: 'tasks', label: 'Tasks', icon: <HomeIcon /> },
];

export function Sidebar({
  lists,
  groups,
  selection,
  searchQuery,
  counts,
  settings,
  isOpen,
  collapsed,
  onClose,
  onSelect,
  onSearchChange,
  onCreateList,
  onCreateGroup,
  onToggleGroup,
  onDeleteList,
  onShareList,
  onDuplicateList,
  onRenameList,
  onRenameGroup,
  onUngroupLists,
}: SidebarProps) {
  const [newListTitle, setNewListTitle] = useState('');
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [newListShake, setNewListShake] = useState(false);
  const [sidebarMenu, setSidebarMenu] = useState<{ type: 'list' | 'group'; id: string; x: number; y: number } | null>(null);
  const navRef = useRef<HTMLElement>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newListTitle.trim()) {
      setNewListShake(true);
      setTimeout(() => setNewListShake(false), 400);
      return;
    }
    await onCreateList(newListTitle.trim());
    setNewListTitle('');
  };

  const handleNavKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const nav = navRef.current;
    if (!nav) return;
    const items = Array.from(
      nav.querySelectorAll<HTMLButtonElement>('button[data-nav-item="true"]')
    );
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    e.preventDefault();
    if (e.key === 'ArrowDown') {
      const next = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      items[next]?.focus();
    } else {
      const prev = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      items[prev]?.focus();
    }
  };

  return (
    <>
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} />}
      <aside
        className={`sidebar ${isOpen ? 'open' : ''} ${
          collapsed ? 'collapsed' : ''
        }`}
      >
        <nav
          ref={navRef}
          className="sidebar-nav"
          role="listbox"
          aria-label="Lists"
          onKeyDown={handleNavKeyDown}
        >
          {SMART_LISTS.filter((item) => {
            if (item.id === 'my-day' || item.id === 'tasks') return true;
            if (item.id === 'important' && !settings.smartImportant) return false;
            if (item.id === 'planned' && !settings.smartPlanned) return false;
            if (item.id === 'all' && !settings.smartAll) return false;
            if (item.id === 'completed' && !settings.smartCompleted) return false;
            if (item.id === 'flagged-email' && !settings.smartFlaggedEmail) return false;
            if (item.id === 'assigned-to-me' && !settings.smartAssignedToMe) return false;
            if (item.id !== 'flagged-email' && settings.autoHideEmptySmartLists && (counts[item.id] ?? 0) === 0) return false;
            return true;
          }).map((item) => {
            const active =
              !searchQuery &&
              selection.type === 'smart' &&
              selection.id === item.id;
            const count = counts[item.id] ?? 0;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={active}
                data-nav-item="true"
                title={collapsed ? item.label : undefined}
                className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => {
                  onSearchChange('');
                  onSelect({ type: 'smart', id: item.id });
                  onClose();
                }}
              >
                <span className="nav-icon">{item.icon}</span>
                {!collapsed && <span className="nav-label">{item.label}</span>}
                {!collapsed && count > 0 && (
                  <span className="nav-count">{count}</span>
                )}
              </button>
            );
          })}

          <div className="nav-divider" />

          {!collapsed &&
            groups.map((group) => (
              <div key={group.id} className="nav-group">
                <button
                  type="button"
                  data-nav-item="true"
                  className="nav-item group-header"
                  onClick={() => onToggleGroup(group)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSidebarMenu({ type: 'group', id: group.id, x: e.clientX, y: e.clientY });
                  }}
                >
                  <span className="nav-icon">📁</span>
                  <span className="nav-label">{group.title}</span>
                  <span className="nav-count">
                    {group.collapsed ? '<' : 'v'}
                  </span>
                </button>
              </div>
            ))}

          {lists.map((list) => {
            const active =
              !searchQuery &&
              selection.type === 'list' &&
              selection.id === list.id;
            const count = counts[list.id] ?? 0;
            return (
              <div
                key={list.id}
                className={`nav-item-row ${active ? 'active' : ''}`}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onSelect({ type: 'list', id: list.id });
                  setSidebarMenu({ type: 'list', id: list.id, x: e.clientX, y: e.clientY });
                }}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-nav-item="true"
                  title={collapsed ? list.title : undefined}
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
                  {!collapsed && <span className="nav-label">{list.title}</span>}
                  {!collapsed && count > 0 && (
                    <span className="nav-count">{count}</span>
                  )}
                </button>
                {!collapsed && (
                  <button
                    type="button"
                    className="nav-delete"
                    title="Delete list"
                    onClick={() => onDeleteList(list.id)}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="sidebar-bottom">
            <form
              className={`new-list-form ${newListShake ? 'shake' : ''}`}
              onSubmit={handleSubmit}
            >
              <input
                type="text"
                placeholder="+ New list"
                title="Name this list, then select enter to create it."
                value={newListTitle}
                onChange={(e) => setNewListTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setNewListTitle('');
                    (e.target as HTMLInputElement).blur();
                  }
                }}
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
                placeholder="Create group"
                value={newGroupTitle}
                onChange={(e) => setNewGroupTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setNewGroupTitle('');
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
            </form>
          </div>
        )}
  
      {sidebarMenu && (
        <div
          className="context-menu"
          role="menu"
          style={{ position: 'fixed', top: sidebarMenu.y, left: sidebarMenu.x, zIndex: 'var(--z-menu, 60)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {sidebarMenu.type === 'group' ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="account-popover-item"
                onClick={async () => {
                  const g = groups.find((x) => x.id === sidebarMenu.id);
                  setSidebarMenu(null);
                  if (!g || !onRenameGroup) return;
                  const next = window.prompt('Rename group', g.title);
                  if (next && next.trim()) await onRenameGroup(g.id, next.trim());
                }}
              >
                Rename group
              </button>
              <button
                type="button"
                role="menuitem"
                className="account-popover-item"
                onClick={() => setSidebarMenu(null)}
              >
                Move up
              </button>
              <button
                type="button"
                role="menuitem"
                className="account-popover-item"
                onClick={() => setSidebarMenu(null)}
              >
                Move down
              </button>
              <div className="account-popover-divider" />
              <button
                type="button"
                role="menuitem"
                className="account-popover-item danger"
                onClick={async () => {
                  const g = groups.find((x) => x.id === sidebarMenu.id);
                  setSidebarMenu(null);
                  if (!g || !onUngroupLists) return;
                  if (window.confirm(`Delete group '${g.title}'? Lists inside will not be deleted.`)) {
                    await onUngroupLists(g.id);
                  }
                }}
              >
                Ungroup lists
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                className="account-popover-item"
                onClick={async () => {
                  const l = lists.find((x) => x.id === sidebarMenu.id);
                  setSidebarMenu(null);
                  if (!l || !onRenameList) return;
                  const next = window.prompt('Rename list', l.title);
                  if (next && next.trim()) await onRenameList(l.id, next.trim());
                }}
              >
                Rename list
              </button>
              <button
                type="button"
                role="menuitem"
                className="account-popover-item"
                onClick={() => {
                  const id = sidebarMenu.id;
                  setSidebarMenu(null);
                  onShareList?.(id);
                }}
              >
                Share list
              </button>
              <button
                type="button"
                role="menuitem"
                className="account-popover-item"
                onClick={() => {
                  const id = sidebarMenu.id;
                  setSidebarMenu(null);
                  onDuplicateList?.(id);
                }}
              >
                Duplicate list
              </button>
              <button
                type="button"
                role="menuitem"
                className="account-popover-item"
                onClick={() => {
                  setSidebarMenu(null);
                  window.print();
                }}
              >
                Print list
              </button>
              <div className="account-popover-divider" />
              <button
                type="button"
                role="menuitem"
                className="account-popover-item danger"
                onClick={async () => {
                  const id = sidebarMenu.id;
                  setSidebarMenu(null);
                  await onDeleteList(id);
                }}
              >
                Delete list
              </button>
            </>
          )}
        </div>
      )}
    </aside>
    </>
  );
}
