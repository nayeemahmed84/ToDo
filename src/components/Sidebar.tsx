import { FormEvent, KeyboardEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { SmartListId, TodoGroup, TodoList, ViewSelection } from '../types/todo';
import { AppSettings } from './SettingsModal';
import {
  CalendarIcon,
  HomeIcon,
  ListIcon,
  StarIcon,
  SunIcon,
  TrashIcon,
  UserIcon,
} from './Icons';

interface SidebarProps {
  user: User;
  userId: string;
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
  onRenameGroup?: (groupId: string, name: string) => Promise<void>;
  onUngroupLists?: (groupId: string) => Promise<void>;
  onMoveListToGroup?: (listId: string, groupId: string | null) => Promise<void>;
  onMoveListDown?: (listId: string) => Promise<void>;
  onToggleCollapsed?: () => void;
  onOpenSettings: () => void;
  onOpenWhatsNew: () => void;
  onSignOut: () => void;
}

const SMART_LISTS: { id: SmartListId; label: string; icon: ReactNode }[] = [
  { id: 'my-day', label: 'My Day', icon: <SunIcon /> },
  { id: 'important', label: 'Important', icon: <StarIcon /> },
  { id: 'all', label: 'All', icon: <span>∞</span> },
  { id: 'completed', label: 'Completed', icon: <span className="completed-nav-icon">✓</span> },
  { id: 'flagged-email', label: 'Flagged email', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 21V4m0 0h14l-3.5 5L19 14H5" /></svg> },
  { id: 'tasks', label: 'Tasks', icon: <HomeIcon /> },
  { id: 'planned', label: 'Planned', icon: <CalendarIcon /> },
  { id: 'assigned-to-me', label: 'Assigned to me', icon: <UserIcon size={20} /> },
];

export function Sidebar({
  user,
  userId,
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
  onRenameGroup,
  onUngroupLists,
  onMoveListToGroup,
  onMoveListDown,
  onToggleCollapsed,
  onOpenSettings,
  onOpenWhatsNew,
  onSignOut,
}: SidebarProps) {
  const [newListTitle, setNewListTitle] = useState('');
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [groupFormOpen, setGroupFormOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [newListShake, setNewListShake] = useState(false);
  const [sidebarMenu, setSidebarMenu] = useState<{ type: 'list' | 'group'; id: string; x: number; y: number } | null>(null);
  const [moveToGroupOpen, setMoveToGroupOpen] = useState(false);

  useEffect(() => {
    if (!sidebarMenu) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarMenu(null);
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('.context-menu')) setSidebarMenu(null);
    };
    const onScroll = () => setSidebarMenu(null);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [sidebarMenu]);
  const navRef = useRef<HTMLElement>(null);
  const newListInputRef = useRef<HTMLInputElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setAccountOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

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

  const handleCollapsedCreateClick = () => {
    onToggleCollapsed?.();
    setTimeout(() => newListInputRef.current?.focus(), 150);
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

  const displayName = user.displayName || 'User';
  const initials = (displayName || user.email || 'U')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  const renderList = (list: TodoList) => {
    const active = !searchQuery && selection.type === 'list' && selection.id === list.id;
    const count = counts[list.id] ?? 0;
    const shoppingList = /costco|dollarama|walmart|shoppers|wholesale|grocer|food basic/i.test(list.title);
    return (
      <div
        key={list.id}
        className={`nav-item-row ${list.groupId ? 'nested' : ''} ${active ? 'active' : ''}`}
        onContextMenu={(event) => {
          event.preventDefault();
          onSelect({ type: 'list', id: list.id });
          setMoveToGroupOpen(false);
          setSidebarMenu({ type: 'list', id: list.id, x: event.clientX, y: event.clientY });
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
            {shoppingList ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 4h2l2.2 11.2a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 1.9-1.4L21 8H5" />
                <circle cx="9" cy="20" r="1.2" /><circle cx="18" cy="20" r="1.2" />
                <path d="M8 11h10M10 8l1 7m4-7-1 7" />
              </svg>
            ) : <ListIcon />}
          </span>
          {!collapsed && <span className="nav-label">{list.title}</span>}
          {!collapsed && count > 0 && <span className="nav-count">{count}</span>}
        </button>
      </div>
    );
  };

  return (
    <>
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} />}
      <aside
        className={`sidebar ${isOpen ? 'open' : ''} ${
          collapsed ? 'collapsed' : ''
        }`}
      >
        <div className="sidebar-top">
          <div className="sidebar-account-wrap" ref={accountRef}>
            <button
              type="button"
              className="sidebar-profile-button"
              onClick={() => setAccountOpen((open) => !open)}
              aria-expanded={accountOpen}
              aria-haspopup="menu"
              aria-label={`Account menu for ${displayName}`}
            >
              <span className="user-avatar sidebar-avatar">
                {user.photoURL ? <img src={user.photoURL} alt="" /> : initials}
              </span>
              {!collapsed && (
                <span className="sidebar-profile-copy">
                  <strong>{displayName}</strong>
                  <span>{user.email}</span>
                </span>
              )}
              {!collapsed && <span className="sidebar-account-chevron" aria-hidden="true">⌄</span>}
            </button>
            {accountOpen && (
              <div className="sidebar-account-menu" role="menu" aria-label="Account options">
                <div className="sidebar-account-menu-user">
                  <strong>{displayName}</strong>
                  <span>{user.email}</span>
                </div>
                <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); onOpenSettings(); }}>Settings</button>
                <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); onOpenWhatsNew(); }}>What&apos;s new</button>
                <button type="button" role="menuitem" className="danger" onClick={() => { setAccountOpen(false); onSignOut(); }}>Sign out</button>
              </div>
            )}
          </div>
          {!collapsed && (
            <label className="sidebar-search" aria-label="Search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" />
              </svg>
              <input
                className="search-input"
                type="search"
                placeholder="Search"
                aria-label="Search tasks"
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </label>
          )}
        </div>
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
            if (!['flagged-email', 'important', 'completed'].includes(item.id) && settings.autoHideEmptySmartLists && (counts[item.id] ?? 0) === 0) return false;
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
                className={`nav-item nav-item-${item.id} ${active ? 'active' : ''}`}
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

          {!collapsed && groups.map((group) => {
            const groupLists = lists.filter((list) => list.groupId === group.id);
            return (
              <div key={group.id} className="nav-group">
                <button
                  type="button"
                  data-nav-item="true"
                  className="nav-item group-header"
                  onClick={() => onToggleGroup(group)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMoveToGroupOpen(false);
                    setSidebarMenu({ type: 'group', id: group.id, x: event.clientX, y: event.clientY });
                  }}
                  aria-expanded={!group.collapsed}
                >
                  <span className="nav-icon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h7l2 2h9v11H3z" /></svg></span>
                  <span className="nav-label">{group.title}</span>
                  <span className="group-chevron" aria-hidden="true">{group.collapsed ? '▸' : '▾'}</span>
                </button>
                {!group.collapsed && <div className="nav-group-items">{groupLists.map(renderList)}</div>}
              </div>
            );
          })}

          {lists.filter((list) => !list.groupId || !groups.some((group) => group.id === list.groupId)).map(renderList)}
        </nav>

        {!collapsed && (
          <div className="sidebar-bottom">
            <form
              className={`new-list-form ${newListShake ? 'shake' : ''}`}
              onSubmit={handleSubmit}
            >
              <span className="sidebar-add-icon" aria-hidden="true">+</span>
              <input
                ref={newListInputRef}
                type="text"
                placeholder="New list"
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
            <button
              type="button"
              className="sidebar-new-group-button"
              title="Create group"
              aria-label="Create group"
              aria-expanded={groupFormOpen}
              onClick={() => setGroupFormOpen((open) => !open)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 7v10M7 12h10" />
              </svg>
            </button>
            {groupFormOpen && (
              <form
                className="new-group-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newGroupTitle.trim()) return;
                  await onCreateGroup(newGroupTitle.trim());
                  setNewGroupTitle('');
                  setGroupFormOpen(false);
                }}
              >
                <input
                  autoFocus
                  type="text"
                  placeholder="Group name"
                  aria-label="New group name"
                  value={newGroupTitle}
                  onChange={(e) => setNewGroupTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setNewGroupTitle('');
                      setGroupFormOpen(false);
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                />
              </form>
            )}
          </div>
        )}

        {collapsed && (
          <div className="sidebar-bottom" style={{ width: '100%', alignItems: 'center' }}>
            <button
              type="button"
              className="nav-delete"
              title="New list"
              onClick={handleCollapsedCreateClick}
              aria-label="New list"
              style={{ fontSize: '1.5rem', lineHeight: 1, padding: '0.5rem', color: 'var(--color-text-2)' }}
            >
              +
            </button>
          </div>
        )}
  
      {sidebarMenu && (
        <div
          className="context-menu"
          role="menu"
          style={{
            position: 'fixed',
            top: Math.min(sidebarMenu.y, Math.max(8, window.innerHeight - 440)),
            left: Math.min(sidebarMenu.x, Math.max(8, window.innerWidth - 292)),
            zIndex: 'var(--z-menu, 60)',
            maxHeight: '80vh',
            overflowY: 'auto',
          }}
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
          ) : (() => {
            const list = lists.find((candidate) => candidate.id === sidebarMenu.id);
            if (!list) return null;
            const siblings = lists.filter((candidate) =>
              candidate.ownerUid === userId && candidate.groupId === list.groupId
            );
            const listIndex = siblings.findIndex((candidate) => candidate.id === list.id);
            const canMoveDown = list.ownerUid === userId && listIndex >= 0 && listIndex < siblings.length - 1;
            const canManage = list.ownerUid === userId;
            const stopMenu = () => {
              setSidebarMenu(null);
              setMoveToGroupOpen(false);
            };
            return (
              <>
                <button type="button" role="menuitem" className="context-menu-item" onClick={() => { const id = list.id; stopMenu(); onShareList?.(id); }}>
                  <span className="context-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 3.9M15.4 6.6L8.6 10.5" /></svg></span>
                  {list.memberUids?.length ? 'Sharing options' : 'Share list'}
                </button>
                {canManage && (
                  <div className="context-menu-submenu-wrap" onMouseEnter={() => setMoveToGroupOpen(true)} onMouseLeave={() => setMoveToGroupOpen(false)}>
                    <button
                      type="button"
                      role="menuitem"
                      className="context-menu-item"
                      aria-haspopup="menu"
                      aria-expanded={moveToGroupOpen}
                      onClick={() => setMoveToGroupOpen((open) => !open)}
                      onFocus={() => setMoveToGroupOpen(true)}
                    >
                      <span className="context-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h7l2 2h9v11H3z" /><path d="M12 11v5m-2-2 2 2 2-2" /></svg></span>
                      <span>Move list to…</span><span className="context-menu-arrow">›</span>
                    </button>
                    {moveToGroupOpen && (
                      <div className="context-menu context-menu-submenu" role="menu" aria-label="Move list to group">
                        <button type="button" role="menuitem" className="context-menu-item" disabled={!list.groupId} onClick={() => { void onMoveListToGroup?.(list.id, null); stopMenu(); }}>
                          <span className="context-menu-icon" aria-hidden="true"><ListIcon /></span>My lists
                        </button>
                        {groups.map((group) => (
                          <button key={group.id} type="button" role="menuitem" className="context-menu-item" disabled={group.id === list.groupId} onClick={() => { void onMoveListToGroup?.(list.id, group.id); stopMenu(); }}>
                            <span className="context-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h7l2 2h9v11H3z" /></svg></span>{group.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {list.groupId && canManage && (
                  <button type="button" role="menuitem" className="context-menu-item" onClick={() => { void onMoveListToGroup?.(list.id, null); stopMenu(); }}>
                    <span className="context-menu-icon" aria-hidden="true"><ListIcon /></span>Remove from group
                  </button>
                )}
                {canMoveDown && (
                  <button type="button" role="menuitem" className="context-menu-item" onClick={() => { const id = list.id; stopMenu(); void onMoveListDown?.(id); }}>
                    <span className="context-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v16m-6-6 6 6 6-6" /></svg></span>Move down
                  </button>
                )}
                {canManage && (
                  <button type="button" role="menuitem" className="context-menu-item" onClick={() => { const id = list.id; stopMenu(); onDuplicateList?.(id); }}>
                    <span className="context-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg></span>Duplicate list
                  </button>
                )}
                <button type="button" role="menuitem" className="context-menu-item" onClick={() => { stopMenu(); window.print(); }}>
                  <span className="context-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7" /><rect x="2" y="9" width="20" height="12" rx="2" /><path d="M6 18h12v4H6z" /></svg></span>Print list
                </button>
                <div className="account-popover-divider" />
                {canManage && (
                  <button type="button" role="menuitem" className="context-menu-item danger" onClick={async () => { const id = list.id; stopMenu(); await onDeleteList(id); }}>
                    <span className="context-menu-icon" aria-hidden="true"><TrashIcon size={18} /></span>Delete list
                  </button>
                )}
              </>
            );
          })()
          }
        </div>
      )}
    </aside>
    </>
  );
}
