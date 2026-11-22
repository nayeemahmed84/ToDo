import { DragEvent as ReactDragEvent, FormEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { SmartListId, TodoGroup, TodoList, ViewSelection } from '../types/todo';
import { EmojiPicker } from './EmojiPicker';
import { AppSettings } from './SettingsModal';
import { getContextSubmenuPosition, ContextSubmenuPosition } from '../lib/contextMenu';
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
  onUpdateGroupIcon: (groupId: string, icon: string | null) => Promise<void>;
  onDeleteList: (listId: string) => Promise<void>;
  onShareList?: (listId: string) => void;
  onDuplicateList?: (listId: string) => void;
  onRenameGroup?: (groupId: string, name: string) => Promise<void>;
  onUngroupLists?: (groupId: string) => Promise<void>;
  onMoveListToGroup: (listId: string, groupId: string | null) => Promise<void>;
  onMoveListDown?: (listId: string) => Promise<void>;
  onReorderList: (listId: string, targetListId: string, insertBefore: boolean) => Promise<void>;
  onReorderGroup: (groupId: string, targetGroupId: string, insertBefore: boolean) => Promise<void>;
  onMoveTasksToList?: (taskIds: string[], targetListId: string) => void | Promise<void>;
  onToggleCollapsed?: () => void;
  onOpenSettings: () => void;
  onOpenWhatsNew: () => void;
  onSignOut: () => void;
}

type SidebarDragItem = { type: 'list' | 'group'; id: string; ids: string[] };
type SidebarDropTarget =
  | { type: 'list' | 'group-reorder'; id: string; position: 'before' | 'after' }
  | { type: 'group' | 'task-into-list'; id: string }
  | { type: 'root' };

const SMART_LISTS: { id: SmartListId; label: string; icon: ReactNode }[] = [
  { id: 'my-day', label: 'My Day', icon: <SunIcon /> },
  { id: 'important', label: 'Important', icon: <StarIcon /> },
  { id: 'all', label: 'All', icon: <span>∞</span> },
  { id: 'completed', label: 'Completed', icon: <span className="completed-nav-icon">✓</span> },
  { id: 'flagged-email', label: 'Flagged email', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 21V4m0 0h14l-3.5 5L19 14H5" /></svg> },
  { id: 'tasks', label: 'Tasks', icon: <HomeIcon /> },
  { id: 'planned', label: 'Planned', icon: <CalendarIcon /> },
  { id: 'assigned-to-me', label: 'Assigned to me', icon: <UserIcon size={20} /> },
  {
    id: 'trash',
    label: 'Trash',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6M14 11v6" />
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      </svg>
    ),
  },
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
  onUpdateGroupIcon,
  onDeleteList,
  onShareList,
  onDuplicateList,
  onRenameGroup,
  onUngroupLists,
  onMoveListToGroup,
  onMoveListDown,
  onReorderList,
  onReorderGroup,
  onToggleCollapsed,
  onOpenSettings,
  onMoveTasksToList,
  onSignOut,
}: SidebarProps) {
  const [newListTitle, setNewListTitle] = useState('');
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [groupFormOpen, setGroupFormOpen] = useState(false);
  const [groupIconPicker, setGroupIconPicker] = useState<{ id: string; top: number; left: number } | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [newListShake, setNewListShake] = useState(false);
  const [sidebarMenu, setSidebarMenu] = useState<{ type: 'list' | 'group'; id: string; x: number; y: number } | null>(null);
  const [moveToGroupOpen, setMoveToGroupOpen] = useState(false);
  const [moveToGroupPosition, setMoveToGroupPosition] = useState<ContextSubmenuPosition | null>(null);
  const [draggedItem, setDraggedItem] = useState<SidebarDragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<SidebarDropTarget | null>(null);
  const [selectedListIds, setSelectedListIds] = useState<Set<string>>(() => new Set());
  const [lastClickedListId, setLastClickedListId] = useState<string | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(() => new Set());
  const [lastClickedGroupId, setLastClickedGroupId] = useState<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressedIdRef = useRef<string | null>(null);

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

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
  const orderedGroups = [...groups].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const rootLists = lists
    .filter((list) => !list.groupId || !groups.some((group) => group.id === list.groupId))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const openMoveToGroup = (anchor: HTMLElement) => {
    setMoveToGroupPosition(getContextSubmenuPosition(anchor.getBoundingClientRect()));
    setMoveToGroupOpen(true);
  };
  const clearDragState = () => {
    setDraggedItem(null);
    setDropTarget(null);
  };
  const handleDragStart = (event: ReactDragEvent<HTMLElement>, item: SidebarDragItem) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `${item.type}:${item.id}`);
    setDraggedItem(item);
  };
  const handleListDragOver = (event: ReactDragEvent<HTMLElement>, list: TodoList) => {
    if (event.dataTransfer.types.includes('application/x-todo-items')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropTarget({ type: 'task-into-list', id: list.id });
      return;
    }
    if (
      draggedItem?.type !== 'list' ||
      draggedItem.ids.includes(list.id) ||
      list.ownerUid !== userId ||
      list.isDefaultTasksList
    ) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    setDropTarget({
      type: 'list',
      id: list.id,
      position: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after',
    });
  };
  const handleListDrop = async (event: ReactDragEvent<HTMLElement>, list: TodoList) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.types.includes('application/x-todo-items')) {
      const raw = event.dataTransfer.getData('application/x-todo-items');
      clearDragState();
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            await onMoveTasksToList?.(parsed.filter((id): id is string => typeof id === 'string'), list.id);
          }
        } catch {
          // ignore malformed drag payload
        }
      }
      return;
    }
    if (
      draggedItem?.type !== 'list' ||
      draggedItem.ids.includes(list.id) ||
      list.ownerUid !== userId ||
      list.isDefaultTasksList
    ) {
      clearDragState();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const insertBefore = event.clientY < rect.top + rect.height / 2;
    const idsToMove = insertBefore ? draggedItem.ids : [...draggedItem.ids].reverse();
    clearDragState();
    for (const id of idsToMove) {
      await onReorderList(id, list.id, insertBefore);
    }
  };
  const handleGroupDragOver = (event: ReactDragEvent<HTMLElement>, group: TodoGroup) => {
    if (group.ownerUid !== userId || !draggedItem) return;
    if (draggedItem.type === 'list') {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropTarget({ type: 'group', id: group.id });
      return;
    }
    if (draggedItem.type === 'group' && !draggedItem.ids.includes(group.id)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = event.currentTarget.getBoundingClientRect();
      setDropTarget({
        type: 'group-reorder',
        id: group.id,
        position: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after',
      });
    }
  };
  const handleGroupDrop = async (event: ReactDragEvent<HTMLElement>, group: TodoGroup) => {
    event.preventDefault();
    event.stopPropagation();
    if (
      group.ownerUid !== userId ||
      !draggedItem ||
      (draggedItem.type === 'group' && draggedItem.ids.includes(group.id))
    ) {
      clearDragState();
      return;
    }
    if (draggedItem.type === 'list') {
      const ids = draggedItem.ids;
      clearDragState();
      for (const id of ids) {
        await onMoveListToGroup(id, group.id);
      }
    } else {
      const rect = event.currentTarget.getBoundingClientRect();
      const insertBefore = event.clientY < rect.top + rect.height / 2;
      const idsToMove = insertBefore ? draggedItem.ids : [...draggedItem.ids].reverse();
      clearDragState();
      for (const id of idsToMove) {
        await onReorderGroup(id, group.id, insertBefore);
      }
    }
  };
  const handleRootDragOver = (event: ReactDragEvent<HTMLElement>) => {
    if (draggedItem?.type !== 'list' || (event.target as HTMLElement).closest('.nav-item-row')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget({ type: 'root' });
  };
  const handleRootDrop = async (event: ReactDragEvent<HTMLElement>) => {
    if (
      draggedItem?.type !== 'list' ||
      (event.target as HTMLElement).closest('.nav-item-row')
    ) return;
    event.preventDefault();
    event.stopPropagation();
    const ids = draggedItem.ids;
    clearDragState();
    for (const id of ids) {
      await onMoveListToGroup(id, null);
    }
  };

  const renderList = (list: TodoList) => {
    const active = !searchQuery && selection.type === 'list' && selection.id === list.id;
    const isMultiSelected = selectedListIds.has(list.id);
    const isTaskDropTarget = dropTarget?.type === 'task-into-list' && dropTarget.id === list.id;
    const count = counts[list.id] ?? 0;
    return (
      <div
        key={list.id}
        className={`nav-item-row ${list.groupId ? 'nested' : ''} ${active ? 'active' : ''} ${isMultiSelected ? 'multi-selected' : ''} ${draggedItem?.type === 'list' && draggedItem.ids.includes(list.id) ? 'dragging' : ''} ${dropTarget?.type === 'list' && dropTarget.id === list.id ? `drop-${dropTarget.position}` : ''} ${isTaskDropTarget ? 'drop-into' : ''}`}
        draggable={list.ownerUid === userId && !list.isDefaultTasksList}
        onDragStart={(event) => {
          if (list.ownerUid !== userId || list.isDefaultTasksList) {
            event.preventDefault();
            return;
          }
          const ids = selectedListIds.has(list.id) && selectedListIds.size > 1
            ? lists.filter((l) => selectedListIds.has(l.id) && l.ownerUid === userId && !l.isDefaultTasksList).map((l) => l.id)
            : [list.id];
          handleDragStart(event, { type: 'list', id: list.id, ids });
        }}
        onDragEnd={clearDragState}
        onDragOver={(event) => handleListDragOver(event, list)}
        onDrop={(event) => handleListDrop(event, list)}
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
          onTouchStart={() => {
            clearLongPress();
            longPressedIdRef.current = null;
            longPressTimerRef.current = window.setTimeout(() => {
              longPressedIdRef.current = list.id;
              setSelectedGroupIds(new Set());
              setSelectedListIds((prev) => {
                const next = new Set(prev);
                if (next.has(list.id)) next.delete(list.id);
                else next.add(list.id);
                return next;
              });
              setLastClickedListId(list.id);
            }, 450);
          }}
          onTouchMove={clearLongPress}
          onTouchEnd={clearLongPress}
          onTouchCancel={clearLongPress}
          onClick={(event) => {
            if (longPressedIdRef.current === list.id) {
              longPressedIdRef.current = null;
              event.preventDefault();
              return;
            }
            if (event.ctrlKey || event.metaKey) {
              event.preventDefault();
              setSelectedGroupIds(new Set());
              setSelectedListIds((prev) => {
                const next = new Set(prev);
                if (next.has(list.id)) next.delete(list.id);
                else next.add(list.id);
                return next;
              });
              setLastClickedListId(list.id);
              return;
            }
            if (event.shiftKey) {
              event.preventDefault();
              setSelectedGroupIds(new Set());
              const orderedLists = [
                ...lists.filter((l) => !l.groupId),
                ...groups.flatMap((g) => (g.collapsed ? [] : lists.filter((l) => l.groupId === g.id))),
              ];
              const anchorId = lastClickedListId ?? (selection.type === 'list' ? selection.id : null);
              const anchorIdx = anchorId ? orderedLists.findIndex((l) => l.id === anchorId) : -1;
              const targetIdx = orderedLists.findIndex((l) => l.id === list.id);
              if (anchorIdx >= 0 && targetIdx >= 0) {
                const [start, end] = anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
                setSelectedListIds(new Set(orderedLists.slice(start, end + 1).map((l) => l.id)));
              } else {
                setSelectedListIds(new Set([list.id]));
              }
              setLastClickedListId(list.id);
              return;
            }
            setSelectedListIds(new Set());
            setSelectedGroupIds(new Set());
            setLastClickedListId(list.id);
            onSearchChange('');
            onSelect({ type: 'list', id: list.id });
            onClose();
          }}
        >
          <span className="nav-icon">
            {list.icon ? (
              <span className="list-emoji" aria-hidden="true">{list.icon}</span>
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
        onClick={(e) => {
          if (selectedListIds.size === 0 && selectedGroupIds.size === 0) return;
          const target = e.target as HTMLElement;
          if (!target.closest('.nav-item-row, .group-header-wrap, button, input, [role="menu"]')) {
            setSelectedListIds(new Set());
            setSelectedGroupIds(new Set());
          }
        }}
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
                </span>
              )}
              {!collapsed && (
                <span className="sidebar-account-chevron" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              )}
            </button>
            {accountOpen && (
              <div className="sidebar-account-menu" role="menu" aria-label="Account options">
                <div className="sidebar-account-menu-user">
                  <strong>{displayName}</strong>
                  <span>{user.email}</span>
                </div>
                <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); onOpenSettings(); }}>Settings</button>
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
            if (item.id === 'my-day' || item.id === 'tasks' || item.id === 'trash') return true;
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

          {!collapsed && orderedGroups.map((group) => {
            const groupLists = lists
              .filter((list) => list.groupId === group.id)
              .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
            const isGroupMultiSelected = selectedGroupIds.has(group.id);
            const groupClassName = draggedItem?.type === 'group' && draggedItem.ids.includes(group.id)
              ? 'dragging'
              : dropTarget?.type === 'group' && dropTarget.id === group.id
                ? 'drop-target'
                : dropTarget?.type === 'group-reorder' && dropTarget.id === group.id
                  ? `drop-${dropTarget.position}`
                  : '';
            return (
              <div key={group.id} className="nav-group">
                <div className="group-header-wrap">
                  <button
                    type="button"
                    data-nav-item="true"
                    className={`nav-item group-header ${isGroupMultiSelected ? 'multi-selected' : ''} ${groupClassName}`}
                    draggable={group.ownerUid === userId}
                    onDragStart={(event) => {
                      if (group.ownerUid !== userId) {
                        event.preventDefault();
                        return;
                      }
                      const ids = selectedGroupIds.has(group.id) && selectedGroupIds.size > 1
                        ? groups.filter((g) => selectedGroupIds.has(g.id) && g.ownerUid === userId).map((g) => g.id)
                        : [group.id];
                      handleDragStart(event, { type: 'group', id: group.id, ids });
                    }}
                    onDragEnd={clearDragState}
                    onDragOver={(event) => handleGroupDragOver(event, group)}
                    onDrop={(event) => handleGroupDrop(event, group)}
                    onTouchStart={() => {
                      clearLongPress();
                      longPressedIdRef.current = null;
                      longPressTimerRef.current = window.setTimeout(() => {
                        longPressedIdRef.current = group.id;
                        setSelectedListIds(new Set());
                        setSelectedGroupIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(group.id)) next.delete(group.id);
                          else next.add(group.id);
                          return next;
                        });
                        setLastClickedGroupId(group.id);
                      }, 450);
                    }}
                    onTouchMove={clearLongPress}
                    onTouchEnd={clearLongPress}
                    onTouchCancel={clearLongPress}
                    onClick={(event) => {
                      if (longPressedIdRef.current === group.id) {
                        longPressedIdRef.current = null;
                        event.preventDefault();
                        return;
                      }
                      if (event.ctrlKey || event.metaKey) {
                        event.preventDefault();
                        setSelectedListIds(new Set());
                        setSelectedGroupIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(group.id)) next.delete(group.id);
                          else next.add(group.id);
                          return next;
                        });
                        setLastClickedGroupId(group.id);
                        return;
                      }
                      if (event.shiftKey) {
                        event.preventDefault();
                        setSelectedListIds(new Set());
                        const anchorIdx = lastClickedGroupId ? groups.findIndex((g) => g.id === lastClickedGroupId) : -1;
                        const targetIdx = groups.findIndex((g) => g.id === group.id);
                        if (anchorIdx >= 0 && targetIdx >= 0) {
                          const [start, end] = anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
                          setSelectedGroupIds(new Set(groups.slice(start, end + 1).map((g) => g.id)));
                        } else {
                          setSelectedGroupIds(new Set([group.id]));
                        }
                        setLastClickedGroupId(group.id);
                        return;
                      }
                      setSelectedListIds(new Set());
                      setSelectedGroupIds(new Set());
                      setLastClickedGroupId(group.id);
                      onToggleGroup(group);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setMoveToGroupOpen(false);
                      setSidebarMenu({ type: 'group', id: group.id, x: event.clientX, y: event.clientY });
                    }}
                    aria-expanded={!group.collapsed}
                  >
                    <span className="nav-icon group-icon-placeholder" aria-hidden="true" />
                    <span className="nav-label">{group.title}</span>
                    <span className="group-chevron" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="group-icon-button"
                    aria-label={`Change icon for ${group.title}`}
                    aria-haspopup="dialog"
                    aria-expanded={groupIconPicker?.id === group.id}
                    title="Change folder icon"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                      event.stopPropagation();
                      if (groupIconPicker?.id === group.id) {
                        setGroupIconPicker(null);
                        return;
                      }
                      const rect = event.currentTarget.getBoundingClientRect();
                      const pickerHeight = 320;
                      const pickerWidth = Math.min(320, window.innerWidth - 24);
                      const belowTop = rect.bottom + 8;
                      const top = belowTop + pickerHeight <= window.innerHeight - 8
                        ? belowTop
                        : Math.max(8, rect.top - pickerHeight - 8);
                      const left = Math.max(8, Math.min(rect.left, window.innerWidth - pickerWidth - 8));
                      setGroupIconPicker({ id: group.id, top, left });
                    }}
                  >
                    {group.icon ? (
                      <span className="list-emoji" aria-hidden="true">{group.icon}</span>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h7l2 2h9v11H3z" />
                      </svg>
                    )}
                  </button>
                  {groupIconPicker?.id === group.id && (
                    <EmojiPicker
                      fixedPosition={{ top: groupIconPicker.top, left: groupIconPicker.left }}
                      onSelect={(icon) => {
                        void onUpdateGroupIcon(group.id, icon).then(() => setGroupIconPicker(null));
                      }}
                      onClose={() => setGroupIconPicker(null)}
                    />
                  )}
                </div>
                {!group.collapsed && <div className="nav-group-items">{groupLists.map(renderList)}</div>}
              </div>
            );
          })}

          <div
            className={`nav-root-lists ${dropTarget?.type === 'root' ? 'drop-target' : ''}`}
            onDragOver={handleRootDragOver}
            onDrop={handleRootDrop}
          >
            {rootLists.map(renderList)}
          </div>
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
              setMoveToGroupPosition(null);
            };
            return (
              <>
                <button type="button" role="menuitem" className="context-menu-item" onClick={() => { const id = list.id; stopMenu(); onShareList?.(id); }}>
                  <span className="context-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 3.9M15.4 6.6L8.6 10.5" /></svg></span>
                  {list.memberUids?.length ? 'Sharing options' : 'Share list'}
                </button>
                {canManage && (
                  <div className="context-menu-submenu-wrap" onMouseEnter={(event) => openMoveToGroup(event.currentTarget)} onMouseLeave={() => setMoveToGroupOpen(false)}>
                    <button
                      type="button"
                      role="menuitem"
                      className="context-menu-item"
                      aria-haspopup="menu"
                      aria-expanded={moveToGroupOpen}
                      onClick={(event) => openMoveToGroup(event.currentTarget)}
                      onFocus={(event) => openMoveToGroup(event.currentTarget)}
                    >
                      <span className="context-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h7l2 2h9v11H3z" /><path d="M12 11v5m-2-2 2 2 2-2" /></svg></span>
                      <span>Move list to…</span><span className="context-menu-arrow">›</span>
                    </button>
                    {moveToGroupOpen && (
                      <div className="context-menu context-menu-submenu" role="menu" aria-label="Move list to group" style={moveToGroupPosition ?? undefined}>
                        <button type="button" role="menuitem" className="context-menu-item" disabled={!list.groupId} onClick={() => { void onMoveListToGroup(list.id, null); stopMenu(); }}>
                          <span className="context-menu-icon" aria-hidden="true"><ListIcon /></span>My lists
                        </button>
                        {orderedGroups.map((group) => (
                          <button key={group.id} type="button" role="menuitem" className="context-menu-item" disabled={group.id === list.groupId} onClick={() => { void onMoveListToGroup(list.id, group.id); stopMenu(); }}>
                            <span className="context-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h7l2 2h9v11H3z" /></svg></span>{group.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {list.groupId && canManage && (
                  <button type="button" role="menuitem" className="context-menu-item" onClick={() => { void onMoveListToGroup(list.id, null); stopMenu(); }}>
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
