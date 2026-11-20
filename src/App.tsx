import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  addDoc,
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  isFirebaseConfigured,
  signInWithGoogle,
  signInWithGoogleRedirect,
  signOutUser,
} from './lib/firebase';
import { TaskRow } from './components/TaskRow';
import { Sidebar } from './components/Sidebar';
import { TaskDetail } from './components/TaskDetail';
import { TopBar } from './components/TopBar';
import { AppSettings, DEFAULT_SETTINGS, SettingsModal } from './components/SettingsModal';
import { ShareDialog } from './components/ShareDialog';
import { CustomCalendarPicker } from './components/CustomCalendarPicker';
import { playCompleteSound } from './lib/sound';
import {
  RepeatRule,
  SmartListId,
  SortOption,
  TodoGroup,
  TodoItem,
  TodoList,
  ViewSelection,
} from './types/todo';

function getTodayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getNextRepeatDate(baseYmd: string, rule: RepeatRule): string {
  const [y, m, d] = baseYmd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (rule === 'daily') dt.setDate(dt.getDate() + 1);
  else if (rule === 'weekly') dt.setDate(dt.getDate() + 7);
  else if (rule === 'monthly') dt.setMonth(dt.getMonth() + 1);
  else if (rule === 'yearly') dt.setFullYear(dt.getFullYear() + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

const SMART_TITLES: Record<SmartListId, string> = {
  'my-day': 'My Day',
  important: 'Important',
  planned: 'Planned',
  'assigned-to-me': 'Assigned to me',
  'flagged-email': 'Flagged email',
  tasks: 'Tasks',
  all: 'All',
  completed: 'Completed',
};

function getListIcon(selection: ViewSelection, listTitle?: string): React.ReactNode {
  switch (selection.type) {
    case 'smart':
      switch (selection.id) {
        case 'my-day':
          return (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
          );
        case 'important':
          return (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          );
        case 'planned':
          return (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
          );
        case 'all':
          return <span style={{ fontSize: '20px', fontWeight: 600, lineHeight: 1 }}>∞</span>;
        case 'completed':
          return <span className="completed-nav-icon">✓</span>;
        case 'flagged-email':
          return (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 21V4m0 0h14l-3.5 5L19 14H5" />
            </svg>
          );
        case 'assigned-to-me':
          return (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          );
        case 'tasks':
          return (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
            </svg>
          );
        default:
          return null;
      }
    case 'list':
      if (/costco|dollarama|walmart|shoppers|wholesale|grocer|food basic/i.test(listTitle ?? '')) {
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 4h2l2.2 11.2a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 1.9-1.4L21 8H5" />
            <circle cx="9" cy="20" r="1.2" /><circle cx="18" cy="20" r="1.2" />
            <path d="M8 11h10M10 8l1 7m4-7-1 7" />
          </svg>
        );
      }
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      );
    default:
      return null;
  }
}

function getSortIcon(sort: SortOption): React.ReactNode {
  if (sort === 'importance') {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><polygon points="12 2 15 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 9 8.3 12 2" /></svg>;
  }
  if (sort === 'dueDate') {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>;
  }
  if (sort === 'myDay') {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
  }
  if (sort === 'alphabetical') return <span aria-hidden="true" style={{ fontSize: 15, fontWeight: 700 }}>A↓</span>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
}

function ContextMenuIcon({ kind }: { kind: 'sun' | 'star' | 'check' | 'calendar' | 'folder' | 'move' | 'copy' | 'trash' }) {
  const paths: Record<typeof kind, React.ReactNode> = {
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    star: <polygon points="12 2 15 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 9 8.3 12 2" />,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    folder: <path d="M3 6h7l2 2h9v11H3z" />,
    move: <><path d="M3 6h7l2 2h9v11H3z" /><path d="M12 11v5m-2-2 2 2 2-2" /></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
    trash: <><path d="M3 6h18M8 6V4h8v2m-11 0 1 15h12l1-15" /><path d="M10 10v7m4-7v7" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [lists, setLists] = useState<TodoList[]>([]);


  const defaultTasksList = useMemo(
    () =>
      lists.find((l) => l.isDefaultTasksList) ??
      lists.find((l) => l.title.toLowerCase() === "tasks") ??
      null,
    [lists]
  );
  const [sharedLists, setSharedLists] = useState<TodoList[]>([]);
  const [groups, setGroups] = useState<TodoGroup[]>([]);
  const [allItems, setAllItems] = useState<TodoItem[]>([]);
  const [selection, setSelection] = useState<ViewSelection>(() => {
    const path = window.location.pathname.toLowerCase();
    if (path === '/tasks/flagged' || path === '/tasks/flagged-email') return { type: 'smart', id: 'flagged-email' };
    if (path === '/tasks/important') return { type: 'smart', id: 'important' };
    if (path === '/tasks/planned') return { type: 'smart', id: 'planned' };
    if (path === '/tasks/all') return { type: 'smart', id: 'all' };
    if (path === '/tasks/completed') return { type: 'smart', id: 'completed' };
    if (path === '/tasks/assigned-to-me') return { type: 'smart', id: 'assigned-to-me' };
    if (path === '/tasks/inbox' || path === '/tasks/tasks') return { type: 'smart', id: 'tasks' };
    return { type: 'smart', id: 'my-day' };
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [newItemText, setNewItemText] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [addReminderAtMs, setAddReminderAtMs] = useState<number | null>(null);
  const [addDueMenuOpen, setAddDueMenuOpen] = useState(false);
  const [addRemindMenuOpen, setAddRemindMenuOpen] = useState(false);
  const [addRepeatMenuOpen, setAddRepeatMenuOpen] = useState(false);
  const [addDueCalendarOpen, setAddDueCalendarOpen] = useState(false);
  const [addRemindCalendarOpen, setAddRemindCalendarOpen] = useState(false);
  const [suggestionsLimit, setSuggestionsLimit] = useState(10);

  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const searchEl = document.querySelector<HTMLInputElement>('.search-input');
        searchEl?.focus();
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  useEffect(() => {
    if (!addDueMenuOpen && !addRemindMenuOpen && !addRepeatMenuOpen && !addDueCalendarOpen && !addRemindCalendarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAddDueMenuOpen(false);
        setAddRemindMenuOpen(false);
        setAddRepeatMenuOpen(false);
        setAddDueCalendarOpen(false);
        setAddRemindCalendarOpen(false);
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement)?.closest('.add-picker-wrap')) {
        setAddDueMenuOpen(false);
        setAddRemindMenuOpen(false);
        setAddRepeatMenuOpen(false);
        setAddDueCalendarOpen(false);
        setAddRemindCalendarOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [addDueMenuOpen, addRemindMenuOpen, addRepeatMenuOpen, addDueCalendarOpen, addRemindCalendarOpen]);
  const [installPrompt, setInstallPrompt] = useState<Event & { prompt?: () => Promise<void> } | null>(null);
  const [shareListId, setShareListId] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>(() => {
    try {
      const raw = localStorage.getItem("todo-settings");
      if (raw) {
        const stored = JSON.parse(raw) as Partial<AppSettings>;
        const merged = { ...DEFAULT_SETTINGS, ...stored };
        // The old default was "system"; use the screenshot-matched dark theme
        // unless someone explicitly selected light in the appearance settings.
        if (merged.themeMode === 'system' && !merged.themeModeExplicit) merged.themeMode = 'dark';
        return merged;
      }
      const legacyDark = localStorage.getItem('todo-dark');
      return legacyDark === null
        ? DEFAULT_SETTINGS
        : { ...DEFAULT_SETTINGS, themeMode: legacyDark === '1' ? 'dark' : 'light' };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const updateAppSettings = (patch: Partial<AppSettings>) => {
    setAppSettings((prev) => {
      const next = {
        ...prev,
        ...patch,
        ...(patch.themeMode !== undefined ? { themeModeExplicit: true } : {}),
      };
      localStorage.setItem("todo-settings", JSON.stringify(next));
      if (patch.themeMode !== undefined) {
        const isDark = patch.themeMode === "dark" || (patch.themeMode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
        setDarkMode(isDark);
        localStorage.setItem("todo-dark", isDark ? "1" : "0");
      }
      if (patch.playCompletionSound !== undefined) {
        setSoundEnabled(patch.playCompletionSound);
        localStorage.setItem("todo-sound", patch.playCompletionSound ? "1" : "0");
      }
      return next;
    });
  };
  const [sortBy, setSortBy] = useState<SortOption>('position');
  const [sortAsc, setSortAsc] = useState(true);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [listMenuOpen, setListMenuOpen] = useState(false);
  const [taskSubmenu, setTaskSubmenu] = useState<"move" | "copy" | null>(null);
  const headerTitleInputRef = useRef<HTMLInputElement>(null);
  const addTaskFormRef = useRef<HTMLFormElement>(null);
  const addTaskInputRef = useRef<HTMLInputElement>(null);
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [viewAnnouncement, setViewAnnouncement] = useState('');
  const [addDueDate, setAddDueDate] = useState<string | null>(null);
  const [addRepeat, setAddRepeat] = useState<RepeatRule>('none');
  const [darkMode, setDarkMode] = useState(() => {
    if (appSettings.themeMode === 'dark') return true;
    if (appSettings.themeMode === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    const topBarColor = getComputedStyle(document.documentElement).getPropertyValue('--color-top-bar-bg').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', topBarColor);
  }, [darkMode]);

  useEffect(() => {
    const syncSidebarBreakpoint = () => {
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
        setSidebarCollapsed(false);
      } else setSidebarOpen(false);
    };
    window.addEventListener('resize', syncSidebarBreakpoint);
    return () => window.removeEventListener('resize', syncSidebarBreakpoint);
  }, []);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      const isDark =
        appSettings.themeMode === 'dark' ||
        (appSettings.themeMode === 'system' && mq.matches);
      setDarkMode(isDark);
      localStorage.setItem('todo-dark', isDark ? '1' : '0');
    };
    sync();
    if (appSettings.themeMode === 'system') {
      mq.addEventListener('change', sync);
      return () => mq.removeEventListener('change', sync);
    }
  }, [appSettings.themeMode]);
  const [soundEnabled, setSoundEnabled] = useState(
    () => localStorage.getItem('todo-sound') !== '0'
  );
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: TodoItem;
  } | null>(null);
  const [undoToast, setUndoToast] = useState<{
    item: TodoItem;
    timerId: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const todayStr = getTodayStr();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
const [isFullscreen, setIsFullscreen] = useState(false);
const [gridEditId, setGridEditId] = useState<string | null>(null);
const [gridEditText, setGridEditText] = useState('');
  const [collapsedLists, setCollapsedLists] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('todo-collapsed-lists');
      return raw ? JSON.parse(raw) as Record<string, boolean> : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem('todo-collapsed-lists', JSON.stringify(collapsedLists));
  }, [collapsedLists]);

  // Auto-focus the add-task input when selection changes (list opened)
  useEffect(() => {
    if (!searchQuery && viewMode === 'list' && selection.id !== 'completed' && selection.id !== 'flagged-email' && selection.id !== 'assigned-to-me') {
      setTimeout(() => addTaskInputRef.current?.focus(), 100);
    }
  }, [selection, searchQuery, viewMode]);

  const myDaySuggestions = useMemo(() => {
    const tmrw = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    return allItems
      .filter((t) => !t.done && t.myDayDate !== todayStr)
      .sort((a, b) => {
        const rank = (t: TodoItem) => {
          if (t.dueDate === todayStr) return 0;
          if (t.dueDate && t.dueDate < todayStr) return 1;
          if (t.dueDate === tmrw) return 2;
          return 3;
        };
        const r = rank(a) - rank(b);
        return r !== 0 ? r : b.createdAtMs - a.createdAtMs;
      })
      .slice(0, 20);
  }, [allItems, todayStr, defaultTasksList]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      } else if (e.key === 'Escape') {
        const hasOpenMenu = Boolean(
          contextMenu || sortMenuOpen || groupMenuOpen || listMenuOpen ||
          addDueMenuOpen || addRemindMenuOpen || addRepeatMenuOpen ||
          addDueCalendarOpen || addRemindCalendarOpen || settingsOpen ||
          shareListId || shortcutsOpen || whatsNewOpen || sidebarOpen ||
          document.querySelector('.context-menu, .sort-menu, .list-options-menu, .settings-backdrop, .modal-backdrop, .add-picker-wrap .top-bar-popover')
        );
        setContextMenu(null);
        setSortMenuOpen(false);
        setGroupMenuOpen(false);
        setListMenuOpen(false);
        setAddDueMenuOpen(false);
        setAddRemindMenuOpen(false);
        setAddRepeatMenuOpen(false);
        setAddDueCalendarOpen(false);
        setAddRemindCalendarOpen(false);
        setSettingsOpen(false);
        setWhatsNewOpen(false);
        setShareListId(null);
        setShortcutsOpen(false);
        setSidebarOpen(false);
        if (!hasOpenMenu) setSelectedItemId(null);
      }
    };
    const onClick = () => setContextMenu(null);
    const onScroll = () => setContextMenu(null);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('click', onClick);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('click', onClick);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [
    addDueCalendarOpen,
    addDueMenuOpen,
    addRemindCalendarOpen,
    addRemindMenuOpen,
    addRepeatMenuOpen,
    contextMenu,
    groupMenuOpen,
    listMenuOpen,
    settingsOpen,
    whatsNewOpen,
    shareListId,
    shortcutsOpen,
    sidebarOpen,
    sortMenuOpen,
  ]);

  useEffect(() => {
    if (!sortMenuOpen && !groupMenuOpen && !listMenuOpen) return;
    const closeMenus = () => {
      setSortMenuOpen(false);
      setGroupMenuOpen(false);
      setListMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenus();
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement)?.closest('.header-menu-wrap')) closeMenus();
    };
    const onScroll = () => closeMenus();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [sortMenuOpen, groupMenuOpen, listMenuOpen]);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const joinListId = params.get('join') || params.get('share');
    if (joinListId) {
      updateDoc(doc(db, 'lists', joinListId), {
        memberUids: arrayUnion(user.uid),
      })
        .then(() => {
          setSelection({ type: 'list', id: joinListId });
          window.history.replaceState({}, '', window.location.pathname);
        })
        .catch((err) =>
          setError(err instanceof Error ? err.message : 'Failed to join list')
        );
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setLists([]);
      setAllItems([]);
      return;
    }

    const listsQuery = query(
      collection(db, 'lists'),
      where('ownerUid', '==', user.uid),
      orderBy('createdAt', 'asc')
    );

    const unsubLists = onSnapshot(
      listsQuery,
      (snap) => {
        setLists(snap.docs.map((d, index) => {
          const data = d.data();
          const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
          return {
            id: d.id,
            title: (data.title as string) || 'Untitled',
            ownerUid: data.ownerUid as string,
            isDefaultTasksList: Boolean(data.isDefaultTasksList),
            groupId: (data.groupId as string | null | undefined) ?? null,
            color: (data.color as string | undefined) ?? 'blue',
            background: (data.background as TodoList['background'] | undefined) ?? 'field',
            memberUids: Array.isArray(data.memberUids) ? data.memberUids as string[] : [],
            sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : createdAt?.toMillis?.() ?? index,
            createdAt: data.createdAt,
          };
        }));
      },
      (err) => setError(err.message)
    );

    const itemsQuery = query(
      collectionGroup(db, 'items'),
      where('ownerUid', '==', user.uid)
    );

    const unsubItems = onSnapshot(
      itemsQuery,
      (snap) => {
        const nextItems: TodoItem[] = snap.docs.map((d) => {
          const data = d.data();
          const listId = d.ref.parent.parent?.id ?? (data.listId as string) ?? '';
          return {
            id: d.id,
            listId,
            ownerUid: (data.ownerUid as string) ?? user.uid,
            text: (data.text as string) ?? '',
            done: Boolean(data.done),
            important: Boolean(data.important),
            myDayDate: (data.myDayDate as string | null) ?? null,
            dueDate: (data.dueDate as string | null) ?? null,
            repeat: (data.repeat as RepeatRule) ?? 'none',
            repeatCustom: (data.repeatCustom as TodoItem['repeatCustom']) ?? null,
            reminderAtMs: (data.reminderAtMs as number | null) ?? null,
            assignedTo: (data.assignedTo as string | null) ?? null,
            attachments: Array.isArray(data.attachments) ? data.attachments : [],
            updatedAtMs: (data.updatedAtMs as number | null) ?? null,
            category: (data.category as any) ?? null,
            notes: (data.notes as string) ?? '',
            steps: Array.isArray(data.steps) ? data.steps : [],
            createdAtMs: (data.createdAtMs as number) ?? Date.now(),
            completedAtMs: (data.completedAtMs as number | null) ?? null,
          };
        });
        nextItems.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setAllItems(nextItems);
      },
      (err) => setError(err.message)
    );

    const groupsQuery = query(
      collection(db, 'groups'),
      where('ownerUid', '==', user.uid)
    );

    const unsubGroups = onSnapshot(
      groupsQuery,
      (snap) => {
        setGroups(snap.docs.map((d) => ({
          id: d.id,
          title: (d.data().title as string) || 'Group',
          ownerUid: d.data().ownerUid as string,
          collapsed: Boolean(d.data().collapsed),
        })));
      },
      (err) => setError(err.message)
    );

    const sharedListsQuery = query(
      collection(db, 'lists'),
      where('memberUids', 'array-contains', user.uid)
    );

    const unsubSharedLists = onSnapshot(
      sharedListsQuery,
      (snap) => {
        setSharedLists(snap.docs.map((d, index) => {
          const data = d.data();
          const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
          return {
            id: d.id,
            title: (data.title as string) || 'Untitled',
            ownerUid: data.ownerUid as string,
            isDefaultTasksList: Boolean(data.isDefaultTasksList),
            groupId: (data.groupId as string | null | undefined) ?? null,
            color: (data.color as string | undefined) ?? 'blue',
            background: (data.background as TodoList['background'] | undefined) ?? 'field',
            memberUids: Array.isArray(data.memberUids) ? data.memberUids as string[] : [],
            sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : createdAt?.toMillis?.() ?? index,
            createdAt: data.createdAt,
          };
        }));
      },
      (err) => setError(err.message)
    );

    return () => {
      unsubLists();
      unsubSharedLists();
      unsubItems();
      unsubGroups();
    };
  }, [user]);

  const counts = useMemo(() => {
    const result: Record<string, number> = {
      'my-day': 0,
      important: 0,
      planned: 0,
      tasks: 0,
      all: 0,
      completed: 0,
    };
    for (const item of allItems) {
      if (item.done) {
        result.completed += 1;
        continue;
      }
      if (defaultTasksList && item.listId === defaultTasksList.id) result.tasks += 1;
      result.all += 1;
      if (item.myDayDate === todayStr) result['my-day'] += 1;
      if (item.important) result.important += 1;
      if (item.dueDate) result.planned += 1;
      result[item.listId] = (result[item.listId] ?? 0) + 1;
    }
    return result as Record<SmartListId, number> & Record<string, number>;
  }, [allItems, todayStr]);

  const visibleItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      return allItems.filter(
        (i) =>
          i.text.toLowerCase().includes(q) ||
          i.notes.toLowerCase().includes(q)
      );
    }
    if (selection.type === 'list') {
      return allItems.filter((i) => i.listId === selection.id);
    }
    switch (selection.id) {
      case 'my-day':
        return allItems.filter((i) => i.myDayDate === todayStr || (appSettings.showDueTodayInMyDay && i.dueDate === todayStr));
      case 'important':
        return allItems.filter((i) => i.important);
      case 'planned':
        return allItems.filter((i) => Boolean(i.dueDate));
      case 'assigned-to-me':
      case 'flagged-email':
        return [];
      case 'all':
        return allItems;
      case 'completed':
        return allItems.filter((i) => i.done);
      case 'tasks':
        return defaultTasksList
          ? allItems.filter((i) => i.listId === defaultTasksList.id)
          : [];
      default:
        return allItems;
    }
  }, [allItems, searchQuery, selection, todayStr, defaultTasksList]);

  const sortedVisible = useMemo(() => {
    const arr = [...visibleItems];
    const dir = sortAsc ? 1 : -1;
    if (sortBy === 'importance') {
      arr.sort((a, b) => (Number(b.important) - Number(a.important)) * dir || a.createdAtMs - b.createdAtMs);
    } else if (sortBy === 'dueDate') {
      arr.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return a.createdAtMs - b.createdAtMs;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate) * dir || a.createdAtMs - b.createdAtMs;
      });
    } else if (sortBy === 'myDay') {
      arr.sort((a, b) => {
        const am = a.myDayDate === todayStr ? 1 : 0;
        const bm = b.myDayDate === todayStr ? 1 : 0;
        return (bm - am) * dir || a.createdAtMs - b.createdAtMs;
      });
    } else if (sortBy === 'alphabetical') {
      arr.sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' }) * dir);
    } else if (sortBy === 'created') {
      arr.sort((a, b) => (a.createdAtMs - b.createdAtMs) * dir);
    }
    return arr;
  }, [visibleItems, sortBy, sortAsc, todayStr]);

  const activeItems = sortedVisible.filter((i) => !i.done);
  const completedItems = sortedVisible.filter((i) => i.done);

  const tomorrowStr = useMemo(() => {
    const [y, m, d] = todayStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d + 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }, [todayStr]);

  const plannedGroups = useMemo(() => {
    if (selection.type !== 'smart' || selection.id !== 'planned' || searchQuery) {
      return null;
    }
    const groups: { label: string; items: TodoItem[] }[] = [
      { label: 'Overdue', items: [] },
      { label: 'Today', items: [] },
      { label: 'Tomorrow', items: [] },
      { label: 'Later', items: [] },
    ];
    for (const item of activeItems) {
      if (!item.dueDate) continue;
      if (item.dueDate < todayStr) groups[0].items.push(item);
      else if (item.dueDate === todayStr) groups[1].items.push(item);
      else if (item.dueDate === tomorrowStr) groups[2].items.push(item);
      else groups[3].items.push(item);
    }
    return groups.filter((g) => g.items.length > 0);
  }, [activeItems, selection, searchQuery, todayStr, tomorrowStr]);

  const categoryGroups = useMemo(() => {
    if (!groupByCategory) return null;
    const order = ['Blue', 'Green', 'Orange', 'Purple', 'Red', 'Yellow', 'No category'];
    const map = new Map<string, TodoItem[]>();
    for (const label of order) map.set(label, []);
    for (const item of activeItems) {
      const cat = (item as TodoItem & { category?: string }).category;
      const key = cat && order.includes(cat) ? cat : 'No category';
      map.get(key)!.push(item);
    }
    const nonEmpty = order
      .map((label) => ({ label, items: map.get(label)! }))
      .filter((g) => g.items.length > 0);
    return nonEmpty.length > 0 ? nonEmpty : [{ label: 'No category', items: [] }];
  }, [activeItems, groupByCategory]);

  const selectedItem =
    allItems.find((i) => i.id === selectedItemId) ?? null;

  const allLists = useMemo(() => {
    const map = new Map<string, TodoList>();
    for (const l of lists) map.set(l.id, l);
    for (const l of sharedLists) map.set(l.id, l);
    return Array.from(map.values()).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [lists, sharedLists]);

  const toggleListCollapsed = (listId: string) => {
    setCollapsedLists((prev) => ({ ...prev, [listId]: !prev[listId] }));
  };

  const allViewGroups = useMemo(() => {
    if (
      !searchQuery &&
      selection.type === 'smart' &&
      selection.id === 'all'
    ) {
      const map = new Map<string, TodoList>();
      for (const l of allLists) map.set(l.id, l);
      const groups: { list: TodoList; items: TodoItem[] }[] = [];
      for (const l of allLists) {
        const items = activeItems.filter((i) => i.listId === l.id);
        if (items.length > 0) {
          groups.push({ list: l, items });
        }
      }
      // fallback: tasks without a matching list
      const orphan = activeItems.filter((i) => !map.has(i.listId));
      if (orphan.length > 0) {
        groups.push({ list: { id: '', title: 'Untitled', ownerUid: user?.uid ?? '', isDefaultTasksList: false }, items: orphan });
      }
      return groups;
    }
    return null;
  }, [activeItems, allLists, searchQuery, selection, user?.uid]);

  const handleOpen = (e: React.MouseEvent<HTMLButtonElement>, item: TodoItem) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
      setLastSelectedId(item.id);
    } else if (e.shiftKey && lastSelectedId) {
      const idxA = activeItems.findIndex((t) => t.id === lastSelectedId);
      const idxB = activeItems.findIndex((t) => t.id === item.id);
      if (idxA !== -1 && idxB !== -1) {
        const [start, end] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
        const rangeIds = activeItems.slice(start, end + 1).map((t) => t.id);
        setSelectedIds(new Set(rangeIds));
      }
    } else {
      setSelectedIds(new Set());
      setSelectedItemId(item.id);
      setLastSelectedId(item.id);
    }
  };

  const handleToggleDone = (item: TodoItem) => {
    handleUpdateItem(item, { done: !item.done, completedAtMs: !item.done ? Date.now() : null });
  };

  const handleToggleImportant = (item: TodoItem) => {
    handleUpdateItem(item, { important: !item.important });
  };

  const currentList = selection.type === 'list'
    ? allLists.find((l) => l.id === selection.id) ?? null
    : null;
  const currentTitle = searchQuery.trim()
    ? `Search: "${searchQuery.trim()}"`
    : selection.type === 'smart'
      ? SMART_TITLES[selection.id]
      : currentList?.title ?? 'List';
  const currentWallpaper = selection.type === 'smart' && selection.id === 'my-day'
    ? 'coast'
    : currentList?.background ?? 'field';

  const ensureDefaultList = async (): Promise<string> => {
    if (selection.type === 'list') return selection.id;
    if (defaultTasksList) return defaultTasksList.id;
    const ref = await addDoc(collection(db, 'lists'), {
      title: 'Tasks',
      isDefaultTasksList: true,
      ownerUid: user!.uid,
      sortOrder: 0,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  };

  const handleCreateList = async (title: string) => {
    if (!user) return;
    setError(null);
    const ref = await addDoc(collection(db, 'lists'), {
      title,
      ownerUid: user.uid,
      sortOrder: Date.now(),
      background: 'field',
      createdAt: serverTimestamp(),
    });
    setSelection({ type: 'list', id: ref.id });
  };

  const handleDeleteList = async (listId: string) => {
    if (!user) return;
    setError(null);
    try {
      const listItems = allItems.filter((i) => i.listId === listId);
      await Promise.all(
        listItems.map((i) =>
          deleteDoc(doc(db, 'lists', listId, 'items', i.id))
        )
      );
      await deleteDoc(doc(db, 'lists', listId));
      if (selection.type === 'list' && selection.id === listId) {
        setSelection({ type: 'smart', id: 'my-day' });
      }
      if (selectedItemId && listItems.some((i) => i.id === selectedItemId)) {
        setSelectedItemId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete list');
    }
  };

  const handleMoveListToGroup = async (listId: string, groupId: string | null) => {
    await updateDoc(doc(db, 'lists', listId), { groupId });
  };

  const handleMoveListDown = async (listId: string) => {
    if (!user) return;
    const list = allLists.find((candidate) => candidate.id === listId);
    if (!list || list.ownerUid !== user.uid) return;
    const siblings = allLists.filter((candidate) =>
      candidate.ownerUid === user.uid &&
      candidate.id !== defaultTasksList?.id &&
      candidate.groupId === list.groupId
    );
    const index = siblings.findIndex((candidate) => candidate.id === listId);
    if (index < 0 || index >= siblings.length - 1) return;
    const next = siblings[index + 1];
    const currentOrder = list.sortOrder ?? index;
    const nextOrder = next.sortOrder ?? index + 1;
    await Promise.all([
      updateDoc(doc(db, 'lists', list.id), { sortOrder: nextOrder }),
      updateDoc(doc(db, 'lists', next.id), { sortOrder: currentOrder }),
    ]);
  };

  const handleAddItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !newItemText.trim()) return;
    setError(null);
    try {
      const targetListId = await ensureDefaultList();
      await addDoc(collection(db, 'lists', targetListId, 'items'), {
        listId: targetListId,
        ownerUid: user.uid,
        text: newItemText.trim(),
        done: false,
        important: selection.type === 'smart' && selection.id === 'important',
        myDayDate:
          selection.type === 'smart' && selection.id === 'my-day'
            ? todayStr
            : null,
        dueDate: addDueDate ?? (selection.type === 'smart' && selection.id === 'planned' ? todayStr : null),
        reminderAtMs: addReminderAtMs,
        repeat: addRepeat,
        notes: '',
        category: null,
        steps: [],
        createdAtMs: Date.now(),
        completedAtMs: null,
      });
      setNewItemText('');
      setAddDueDate(null);
      setAddReminderAtMs(null);
      setAddRepeat('none');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add task');
    }
  };

  const handleUpdateItem = async (
    item: TodoItem,
    patch: Partial<TodoItem>
  ) => {
    await updateDoc(doc(db, 'lists', item.listId, 'items', item.id), { ...patch, updatedAtMs: Date.now(), updatedAt: serverTimestamp() });
    if (patch.done === true) {
      if (soundEnabled) playCompleteSound();
      if (item.repeat && item.repeat !== 'none' && user) {
        const nextDue = getNextRepeatDate(
          item.dueDate ?? todayStr,
          item.repeat
        );
        await addDoc(collection(db, 'lists', item.listId, 'items'), {
          listId: item.listId,
          ownerUid: user.uid,
          text: item.text,
          done: false,
          important: item.important,
          myDayDate: null,
          dueDate: nextDue,
          repeat: item.repeat,
          category: item.category ?? null,
          notes: item.notes,
          steps: item.steps.map((s) => ({ ...s, done: false })),
          createdAtMs: Date.now(),
          completedAtMs: null,
        });
      }
    }
  };

  const handleMoveToList = async (item: TodoItem, targetListId: string) => {
    if (!user || targetListId === item.listId) return;
    const ref = await addDoc(collection(db, 'lists', targetListId, 'items'), {
      listId: targetListId,
      ownerUid: user.uid,
      text: item.text,
      done: item.done,
      important: item.important,
      myDayDate: item.myDayDate,
      dueDate: item.dueDate,
      repeat: item.repeat ?? 'none',
          category: item.category ?? null,
      notes: item.notes,
      steps: item.steps,
      createdAtMs: item.createdAtMs,
      completedAtMs: item.completedAtMs ?? null,
    });
    await deleteDoc(doc(db, 'lists', item.listId, 'items', item.id));
    setSelectedItemId(ref.id);
  };

  const handleDuplicateList = async (listId: string) => {
    if (!user) return;
    const source = lists.find((l) => l.id === listId);
    if (!source) return;
    const newRef = await addDoc(collection(db, 'lists'), {
      title: `${source.title} (copy)`,
      ownerUid: user.uid,
      color: source.color ?? 'blue',
      background: source.background ?? 'field',
      sortOrder: Date.now(),
      createdAt: serverTimestamp(),
    });
    const listItems = allItems.filter((i) => i.listId === listId);
    await Promise.all(
      listItems.map((i) =>
        addDoc(collection(db, 'lists', newRef.id, 'items'), {
          listId: newRef.id,
          ownerUid: user.uid,
          text: i.text,
          done: i.done,
          important: i.important,
          myDayDate: i.myDayDate,
          dueDate: i.dueDate,
          repeat: i.repeat ?? 'none',
          category: i.category ?? null,
          notes: i.notes,
          steps: i.steps,
          createdAtMs: Date.now(),
          completedAtMs: i.completedAtMs ?? null,
        })
      )
    );
    setSelection({ type: 'list', id: newRef.id });
  };

  const handleDeleteItem = async (item: TodoItem) => {
    setError(null);
    try {
      await deleteDoc(doc(db, 'lists', item.listId, 'items', item.id));
      if (selectedItemId === item.id) {
        setSelectedItemId(null);
      }
      if (undoToast) window.clearTimeout(undoToast.timerId);
      const timerId = window.setTimeout(() => setUndoToast(null), 5000);
      setUndoToast({ item, timerId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete task');
    }
  };

  const handleUndoDelete = async () => {
    if (!undoToast || !user) return;
    window.clearTimeout(undoToast.timerId);
    const { item } = undoToast;
    setUndoToast(null);
    await addDoc(collection(db, 'lists', item.listId, 'items'), {
      listId: item.listId,
      ownerUid: user.uid,
      text: item.text,
      done: item.done,
      important: item.important,
      myDayDate: item.myDayDate,
      dueDate: item.dueDate,
      repeat: item.repeat ?? 'none',
          category: item.category ?? null,
      notes: item.notes,
      steps: item.steps,
      createdAtMs: item.createdAtMs,
      completedAtMs: item.completedAtMs ?? null,
    });
  };

  const handleCreateGroup = async (title: string) => {
    if (!user) return;
    await addDoc(collection(db, 'groups'), {
      title,
      ownerUid: user.uid,
      collapsed: false,
      createdAt: serverTimestamp(),
    });
  };

  const handleToggleGroup = async (group: TodoGroup) => {
    await updateDoc(doc(db, 'groups', group.id), {
      collapsed: !group.collapsed,
    });
  };

  const handleImportJson = async (file: File) => {
    if (!user) return;
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        lists?: { id?: string; title?: string }[];
        items?: Partial<TodoItem>[];
      };
      const idMap = new Map<string, string>();
      for (const l of parsed.lists ?? []) {
        const ref = await addDoc(collection(db, 'lists'), {
          title: l.title || 'Imported List',
          ownerUid: user.uid,
          createdAt: serverTimestamp(),
        });
        if (l.id) idMap.set(l.id, ref.id);
      }
      const fallbackListId = await ensureDefaultList();
      for (const item of parsed.items ?? []) {
        const targetListId =
          (item.listId && idMap.get(item.listId)) || fallbackListId;
        await addDoc(collection(db, 'lists', targetListId, 'items'), {
          listId: targetListId,
          ownerUid: user.uid,
          text: item.text || 'Untitled task',
          done: Boolean(item.done),
          important: Boolean(item.important),
          myDayDate: item.myDayDate ?? null,
          dueDate: item.dueDate ?? null,
          repeat: item.repeat ?? 'none',
          category: item.category ?? null,
          notes: item.notes ?? '',
          steps: Array.isArray(item.steps) ? item.steps : [],
          createdAtMs: item.createdAtMs ?? Date.now(),
          completedAtMs: item.completedAtMs ?? null,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import JSON');
    }
  };

  const handleExportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      lists,
      items: allItems,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `todo-backup-${todayStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isFirebaseConfigured) {
    return (
      <main className="auth-screen">
        <div className="auth-card">
          <h1>ToDo PWA</h1>
          <p className="notice">
            Add your Firebase keys in <code>.env.local</code> and restart.
          </p>
        </div>
      </main>
    );
  }

  if (!authReady) {
    return <main className="auth-screen">Loading...</main>;
  }

  if (!user) {
    const handleSignIn = async () => {
      setError(null);
      try {
        await signInWithGoogle();
      } catch (err: unknown) {
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code: unknown }).code)
            : '';
        if (code === 'auth/popup-blocked') {
          await signInWithGoogleRedirect();
          return;
        }
        setError(
          err instanceof Error ? err.message : 'Google sign-in failed'
        );
      }
    };

    return (
      <main className="auth-screen">
        <div className="auth-card">
          <div className="brand-mark">✓</div>
          <h1>ToDo</h1>
          <p>Your free, cross-platform replacement for Microsoft To Do.</p>
          {error && <p className="error">{error}</p>}
          <button className="primary full" onClick={handleSignIn}>
            Sign in with Google
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <TopBar
        onToggleSidebar={() => {
          if (window.innerWidth < 1024) {
            setSidebarOpen((v) => !v);
          } else {
            setSidebarCollapsed((v) => !v);
          }
        }}
      />
      <div className="app-body">
<Sidebar
          user={user}
          lists={allLists.filter((l) => l.id !== defaultTasksList?.id)}
          userId={user.uid}
          groups={groups}
          selection={selection}
          searchQuery={searchQuery}
          counts={counts}
          settings={appSettings}
          isOpen={sidebarOpen}
          collapsed={sidebarCollapsed}
          onClose={() => setSidebarOpen(false)}
          onSelect={setSelection}
          onSearchChange={setSearchQuery}
          onCreateList={handleCreateList}
          onCreateGroup={handleCreateGroup}
          onToggleGroup={handleToggleGroup}
          onDeleteList={handleDeleteList}
          onShareList={(id) => setShareListId(id)}
          onDuplicateList={(id) => handleDuplicateList(id)}
          onMoveListToGroup={handleMoveListToGroup}
          onMoveListDown={handleMoveListDown}
          onRenameGroup={async (id, title) => {
            await updateDoc(doc(db, 'groups', id), { title });
          }}
          onUngroupLists={async (id) => {
            await Promise.all([
              ...allLists.filter((x) => x.groupId === id).map((l) => updateDoc(doc(db, 'lists', l.id), { groupId: null })),
              deleteDoc(doc(db, 'groups', id)),
            ]);
          }}
          onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
          onOpenSettings={() => {
            setSortMenuOpen(false);
            setGroupMenuOpen(false);
            setListMenuOpen(false);
            setContextMenu(null);
            setSettingsOpen(true);
          }}
          onOpenWhatsNew={() => setWhatsNewOpen(true)}
          onSignOut={() => signOutUser()}
        />
<main className="main-pane" data-list-color={currentList ? currentList.color ?? 'blue' : 'default'} data-wallpaper={currentWallpaper}>
        <header className="main-header">
          <button
            className="menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>
          <div className="header-titles">
            {selection.type === 'list' && !searchQuery ? (
              <div className="header-title-row">
                <span className="header-list-icon">{getListIcon(selection, currentList?.title)}</span>
                {currentList?.ownerUid === user.uid ? (
                  <input
                    ref={headerTitleInputRef}
                    type="text"
                    aria-label="List name"
                    className="header-title-input"
                    value={currentTitle}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLists((prev) => prev.map((list) =>
                        list.id === selection.id ? { ...list, title: val } : list
                      ));
                    }}
                    onBlur={(e) => {
                      const trimmed = e.target.value.trim();
                      if (trimmed) {
                        updateDoc(doc(db, 'lists', selection.id), { title: trimmed });
                      }
                    }}
                  />
                ) : (
                  <h2 className="header-title">{currentTitle}</h2>
                )}
              </div>
            ) : (
              <div className="header-title-row">
                <h2 className="header-title">{currentTitle}</h2>
              </div>
            )}
            {selection.type === 'smart' &&
              selection.id === 'my-day' &&
              !searchQuery && (
                <p className="subtitle">
                  {new Date().toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </p>
              )}
          </div>
          <div className="header-toolbar">
            <div className="view-tabs" role="tablist" aria-label="View mode">
              <button
                role="tab"
                aria-selected={viewMode === 'list'}
                className={`view-tab ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => { setViewMode('list'); setViewAnnouncement('List view opened'); }}
              >
                List
              </button>
              <button
                role="tab"
                aria-selected={viewMode === 'grid'}
                className={`view-tab ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => { setViewMode('grid'); setViewAnnouncement('Grid view opened'); }}
              >
                Grid
              </button>
            </div>
            <span className="sr-only" aria-live="polite">{viewAnnouncement}</span>
            <button
              type="button"
              className="toolbar-icon-button workspace-fullscreen-button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
              title={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {isFullscreen ? <><path d="M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5" /></> : <><path d="M14 3h7v7M21 3l-8 8M10 21H3v-7M3 21l8-8" /></>}
              </svg>
            </button>
            <button
              className="toolbar-btn toolbar-print-button"
              onClick={() => window.print()}
              title="Print list"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 9V2h12v7" />
                <rect x="2" y="9" width="20" height="12" rx="2" />
              </svg>
              <span>Print</span>
            </button>
            <div className="header-menu-wrap header-sort-menu-wrap" style={{ position: "relative" }}>
              <button
                type="button"
                className="toolbar-btn themed toolbar-sort-button"
                onClick={() => { setSortMenuOpen((v) => !v); setGroupMenuOpen(false); setListMenuOpen(false); }}
                aria-haspopup="menu"
                aria-expanded={sortMenuOpen}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18M3 12h18M3 18h18" />
                </svg>
                <span>Sort</span>
              </button>
              {sortMenuOpen && (
                <div className="top-bar-popover sort-menu" role="menu" aria-label="Sort by">
                  <div className="sort-menu-header">Sort by</div>
                  {([
                    { id: 'importance', label: 'Importance' },
                    { id: 'dueDate', label: 'Due date' },
                    ...(selection.type === 'list' ? [{ id: 'myDay', label: 'Added to My Day' }] : []),
                    { id: 'alphabetical', label: 'Alphabetically' },
                    { id: 'created', label: 'Creation date' },
                  ] as { id: SortOption; label: string }[]).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={sortBy === opt.id}
                      className="sort-menu-item"
                      onClick={() => {
                        setSortBy(opt.id);
                        setSortAsc(opt.id === 'importance' || opt.id === 'myDay' ? false : true);
                        setSortMenuOpen(false);
                      }}
                    >
                      <span className="sort-menu-icon">{getSortIcon(opt.id)}</span>
                      <span>{opt.label}</span>
                      {sortBy === opt.id && <span className="sort-menu-check" aria-hidden="true">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="header-menu-wrap header-group-menu-wrap" style={{ position: "relative" }}>
              <button
                type="button"
                className="toolbar-btn themed toolbar-group-button"
                onClick={() => { setGroupMenuOpen((v) => !v); setSortMenuOpen(false); setListMenuOpen(false); }}
                aria-haspopup="menu"
                aria-expanded={groupMenuOpen}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span>Group</span>
              </button>
              {groupMenuOpen && (
                <div className="top-bar-popover" role="menu" style={{ minWidth: "180px" }}>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={groupByCategory}
                    className="account-popover-item"
                    onClick={() => { setGroupByCategory((v) => !v); setGroupMenuOpen(false); }}
                  >
                    {groupByCategory ? "✓ " : "  "}Categories
                  </button>
                </div>
              )}
            </div>
            <div className="header-menu-wrap header-options-menu-wrap" style={{ position: "relative" }}>
              <button
                type="button"
                className="toolbar-icon-button toolbar-options-button"
                onClick={() => { setListMenuOpen((v) => !v); setSortMenuOpen(false); setGroupMenuOpen(false); }}
                aria-label="List options"
                aria-haspopup="menu"
                aria-expanded={listMenuOpen}
              >
                <span>…</span>
              </button>
              {listMenuOpen && (
                <div className="top-bar-popover list-options-menu" role="menu">
                  {selection.type === 'list' && (
                    <>
                      <button type="button" role="menuitem" className="account-popover-item" onClick={() => { setListMenuOpen(false); headerTitleInputRef.current?.focus(); }}>
                        Rename list
                      </button>
                      <div className="list-theme-row">
                        <span>List color</span>
                        <span className="list-theme-swatches">
                          {[
                            { key: "blue", var: "var(--swatch-blue)" },
                            { key: "red", var: "var(--swatch-red)" },
                            { key: "purple", var: "var(--swatch-purple)" },
                            { key: "green", var: "var(--swatch-green)" },
                            { key: "teal", var: "var(--swatch-teal)" },
                          ].map((swatch) => (
                            <button
                              key={swatch.key}
                              type="button"
                              aria-label={`List color ${swatch.key}`}
                              aria-pressed={(currentList?.color ?? 'blue') === swatch.key}
                              className="list-theme-swatch"
                              onClick={async () => {
                                await updateDoc(doc(db, "lists", selection.id), { color: swatch.key });
                                setListMenuOpen(false);
                              }}
                              style={{ background: swatch.var }}
                            />
                          ))}
                        </span>
                      </div>
                      <div className="wallpaper-menu-row">
                        <span>Background</span>
                        <span className="wallpaper-swatches">
                          {([
                            { id: 'field', label: 'Poppy field' },
                            { id: 'coast', label: 'Coast at sunset' },
                            { id: 'plain', label: 'Solid background' },
                          ] as const).map((wallpaper) => (
                            <button
                              key={wallpaper.id}
                              type="button"
                              className={`wallpaper-swatch wallpaper-${wallpaper.id}`}
                              aria-label={wallpaper.label}
                              aria-pressed={(currentList?.background ?? 'field') === wallpaper.id}
                              title={wallpaper.label}
                              onClick={async () => {
                                await updateDoc(doc(db, 'lists', selection.id), { background: wallpaper.id });
                                setListMenuOpen(false);
                              }}
                            />
                          ))}
                        </span>
                      </div>
                    </>
                  )}
                  <button type="button" role="menuitem" className="account-popover-item" onClick={() => { setListMenuOpen(false); setSortMenuOpen(true); }}>
                    Sort by…
                  </button>
                  <button type="button" role="menuitemcheckbox" aria-checked={groupByCategory} className="account-popover-item" onClick={() => setGroupByCategory((value) => !value)}>
                    {groupByCategory ? '✓ ' : ''}Group by category
                  </button>
                  <button type="button" role="menuitem" className="account-popover-item" onClick={() => { setViewMode((mode) => mode === 'list' ? 'grid' : 'list'); setListMenuOpen(false); }}>
                    Switch to {viewMode === 'list' ? 'Grid' : 'List'} view
                  </button>
                  {selection.type === 'list' && (
                    <>
                      <button type="button" role="menuitem" className="account-popover-item" onClick={() => { setListMenuOpen(false); void handleDuplicateList(selection.id); }}>
                        Duplicate list
                      </button>
                      <button type="button" role="menuitem" className="account-popover-item" onClick={() => { setListMenuOpen(false); setShareListId(selection.id); }}>
                        Share list
                      </button>
                    </>
                  )}
                  <button type="button" role="menuitem" className="account-popover-item" onClick={() => { setListMenuOpen(false); window.print(); }}>
                    Print list
                  </button>
                  {selection.type === 'list' && (
                    <>
                      <div className="account-popover-divider" />
                      <button type="button" role="menuitem" className="account-popover-item danger" onClick={() => { setListMenuOpen(false); handleDeleteList(selection.id); }}>
                        Delete list
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            {selection.type === 'smart' && selection.id === 'my-day' && (
              <button
                type="button"
                className="toolbar-icon-button suggestions-btn"
                onClick={() => setSuggestionsOpen((v) => !v)}
                aria-pressed={suggestionsOpen}
                aria-label={suggestionsOpen ? 'Hide suggestions' : 'Show suggestions'}
                title={suggestionsOpen ? 'Hide suggestions' : 'Suggestions'}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 18h6M10 21h4M8.3 14.5A7 7 0 1 1 15.7 14.5c-.9.8-1.2 1.7-1.2 2.5h-5c0-.8-.3-1.7-1.2-2.5Z" />
                  <path d="M12 2v2" />
                </svg>
              </button>
            )}
            {selection.type === 'list' && (
              <>
                <button
                  className="toolbar-btn toolbar-duplicate-button"
                  onClick={() => handleDuplicateList(selection.id)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Duplicate</span>
                </button>
                <button
                  className="toolbar-icon-button toolbar-share-button"
                  onClick={() => { setSortMenuOpen(false); setGroupMenuOpen(false); setListMenuOpen(false); setContextMenu(null); setShareListId(selection.id); }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="9" cy="8" r="3.5" />
                    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16.5 4.8a3.5 3.5 0 0 1 0 6.4M18 14a5.5 5.5 0 0 1 3.5 5.1" />
                  </svg>
                  {currentList?.memberUids?.length ? <span className="share-member-count">{currentList.memberUids.length + 1}</span> : null}
                </button>
              </>
            )}
          </div>
        </header>

        {(sortBy !== 'position' || groupByCategory) && (
          <div className="sort-pill-bar" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", fontSize: "0.85rem", flexWrap: "wrap" }}>{sortBy !== 'position' && (
            <span className="sort-pill" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "14px", padding: "3px 10px", display: "inline-flex", alignItems: "center", gap: "8px" }}>
              <span>Sorted by {({
  position: 'position',
  importance: 'importance',
  dueDate: 'due date',
  myDay: 'added to My Day',
  alphabetical: 'alphabetical',
  created: 'creation date',
}[sortBy])}</span>
              <button type="button" onClick={() => setSortAsc((v) => !v)} title="Reverse sort order" aria-label="Reverse sort order" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text)" }}>⇅</button>
              <button type="button" onClick={() => setSortBy("position")} title="Remove sort order" aria-label="Remove sort order" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text)" }}>×</button>
            </span>)}
            {groupByCategory && (
              <span className="sort-pill" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "14px", padding: "3px 10px", display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <span>Grouped by categories</span>
                <button type="button" onClick={() => setGroupByCategory(false)} title="Remove grouping" aria-label="Remove grouping" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text)" }}>×</button>
              </span>
            )}
          </div>
        )}

{!searchQuery && viewMode === 'list' && selection.id !== 'completed' && selection.id !== 'flagged-email' && selection.id !== 'assigned-to-me' && (
          <form className="add-task-row" onSubmit={handleAddItem} ref={addTaskFormRef}>
            <div className="add-task-top-row">
              <span className="add-task-checkbox" aria-hidden="true" />
              <input
                ref={addTaskInputRef}
                type="text"
                placeholder={selection.type === 'smart' && selection.id === 'my-day'
                  ? "Try typing 'Pay utilities bill by Friday 6pm'"
                  : 'Add a task. Type @ to assign it to someone.'}
                aria-label={`List ${currentTitle}, Press shift+tab to access List options`}
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape" && !newItemText.trim()) (e.target as HTMLInputElement).blur(); }}
                onPaste={async (e) => {
                  const text = e.clipboardData.getData("text");
                  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
                  if (lines.length > 1 && user) {
                    e.preventDefault();
                    if (lines.length > 20 && !window.confirm(`Create ${lines.length} tasks?`)) return;
                    const targetListId = await ensureDefaultList();
                    await Promise.all(lines.map((line) => addDoc(collection(db, "lists", targetListId, "items"), {
                      listId: targetListId, ownerUid: user.uid, text: line, done: false, important: false,
                      myDayDate: selection.type === "smart" && selection.id === "my-day" ? todayStr : null,
                      dueDate: addDueDate, repeat: addRepeat, notes: "", category: null, steps: [], createdAtMs: Date.now(), completedAtMs: null,
                    })));
                  }
                }}
              />
              <button type="submit" disabled={!newItemText.trim()} className="add-task-submit-btn">Add</button>
            </div>
            <div className="add-task-divider" />
            <div className="add-task-bottom-row">
              <div className="add-picker-wrap">
              <button type="button" className="add-task-icon-btn" onClick={() => { setAddDueMenuOpen((v) => !v); setAddRepeatMenuOpen(false); setAddRemindMenuOpen(false); setAddDueCalendarOpen(false); setAddRemindCalendarOpen(false); }} title="Add due date">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
                {addDueDate && <span className="add-task-icon-label">Due: {addDueDate}</span>}
              </button>
              {addDueMenuOpen && (
                <div className="top-bar-popover" role="menu" style={{ minWidth: '160px', left: 0 }}>
                  <button type="button" role="menuitem" className="account-popover-item" onClick={() => { setAddDueDate(todayStr); setAddDueMenuOpen(false); }}>Today</button>
                  <button type="button" role="menuitem" className="account-popover-item" onClick={() => { setAddDueDate(tomorrowStr); setAddDueMenuOpen(false); }}>Tomorrow</button>
                  <button type="button" role="menuitem" className="account-popover-item" onClick={() => { const d = new Date(); d.setDate(d.getDate() + 7); setAddDueDate(d.toISOString().slice(0, 10)); setAddDueMenuOpen(false); }}>Next week</button>
                  <button type="button" role="menuitem" className="account-popover-item" onClick={() => { setAddDueMenuOpen(false); setAddDueCalendarOpen(true); }}>Pick a date</button>
                  {addDueDate && <button type="button" role="menuitem" className="account-popover-item danger" onClick={() => { setAddDueDate(null); setAddDueMenuOpen(false); }}>Remove due date</button>}
                </div>
              )}
              {addDueCalendarOpen && (
                <div className="top-bar-popover" style={{ left: 0, padding: 0 }}>
                  <CustomCalendarPicker
                    initialDate={addDueDate}
                    todayStr={todayStr}
                    onSave={(dateStr) => { setAddDueDate(dateStr); setAddDueCalendarOpen(false); }}
                    onCancel={() => setAddDueCalendarOpen(false)}
                  />
                </div>
              )}
              </div>
              <div className="add-picker-wrap">
              <button type="button" className="add-task-icon-btn" onClick={() => { setAddRemindMenuOpen((v) => !v); setAddDueMenuOpen(false); setAddRepeatMenuOpen(false); setAddDueCalendarOpen(false); setAddRemindCalendarOpen(false); }} title="Remind me">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {addReminderAtMs && <span className="add-task-icon-label">{new Date(addReminderAtMs).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
              </button>
              {addRemindMenuOpen && (
                <div className="top-bar-popover" role="menu" style={{ minWidth: '190px', left: 0 }}>
                  <button type="button" role="menuitem" className="account-popover-item" onClick={() => {
                    const d = new Date();
                    d.setHours(d.getHours() + 1, 0, 0, 0);
                    setAddReminderAtMs(d.getTime());
                    setAddRemindMenuOpen(false);
                  }}>Later today</button>
                  <button type="button" role="menuitem" className="account-popover-item" onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 1);
                    d.setHours(9, 0, 0, 0);
                    setAddReminderAtMs(d.getTime());
                    setAddRemindMenuOpen(false);
                  }}>Tomorrow, 9 AM</button>
                  <button type="button" role="menuitem" className="account-popover-item" onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 7);
                    d.setHours(9, 0, 0, 0);
                    setAddReminderAtMs(d.getTime());
                    setAddRemindMenuOpen(false);
                  }}>Next week, 9 AM</button>
                  <button type="button" role="menuitem" className="account-popover-item" onClick={() => { setAddRemindMenuOpen(false); setAddRemindCalendarOpen(true); }}>Pick a date & time</button>
                  {addReminderAtMs && <button type="button" role="menuitem" className="account-popover-item danger" onClick={() => { setAddReminderAtMs(null); setAddRemindMenuOpen(false); }}>Remove reminder</button>}
                </div>
              )}
              {addRemindCalendarOpen && (
                <div className="top-bar-popover" style={{ left: 0, padding: 0 }}>
                  <CustomCalendarPicker
                    initialDate={todayStr}
                    todayStr={todayStr}
                    withTime
                    onSave={(dateStr, timeStr) => {
                      const [hh, mm] = (timeStr || '09:00').split(':').map(Number);
                      const d = new Date(`${dateStr}T00:00:00`);
                      d.setHours(hh, mm, 0, 0);
                      setAddReminderAtMs(d.getTime());
                      setAddRemindCalendarOpen(false);
                    }}
                    onCancel={() => setAddRemindCalendarOpen(false)}
                  />
                </div>
              )}
              </div>
              <div className="add-picker-wrap">
              <button type="button" className="add-task-icon-btn" onClick={() => { setAddRepeatMenuOpen((v) => !v); setAddDueMenuOpen(false); setAddRemindMenuOpen(false); setAddDueCalendarOpen(false); setAddRemindCalendarOpen(false); }} title="Repeat">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14" />
                  <path d="M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
                {addRepeat !== "none" && <span className="add-task-icon-label">{addRepeat}</span>}
              </button>
              {addRepeatMenuOpen && (
                <div className="top-bar-popover" role="menu" style={{ minWidth: '160px', left: 0 }}>
                  {(['daily', 'weekdays', 'weekly', 'monthly', 'yearly'] as const).map((r) => (
                    <button key={r} type="button" role="menuitem" className="account-popover-item" onClick={() => { setAddRepeat(r); setAddRepeatMenuOpen(false); }}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </button>
                  ))}
                  {addRepeat !== 'none' && <button type="button" role="menuitem" className="account-popover-item danger" onClick={() => { setAddRepeat('none'); setAddRepeatMenuOpen(false); }}>Never</button>}
                </div>
              )}
              </div>
            </div>
          </form>
        )}

        {error && <p className="error">{error}</p>}

        <div className="tasks-scroll">

        {searchQuery.trim() && (() => {
          const q = searchQuery.trim().toLowerCase();
          const listCount = allLists.filter((l) => l.title.toLowerCase().includes(q)).length;
          const groupCount = groups.filter((g) => g.title.toLowerCase().includes(q)).length;
          const allMatched = [...activeItems, ...completedItems];
          const taskCount = allMatched.length;
          const noteCount = allMatched.filter((i) => (i.notes ?? '').toLowerCase().includes(q)).length;
          const stepCount = allMatched.reduce((acc, i) => acc + (i.steps ?? []).filter((s) => s.text.toLowerCase().includes(q)).length, 0);
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.82rem', color: 'var(--color-text-2)', marginBottom: '0.75rem', padding: '0 4px' }}>
              <div>{taskCount} Tasks, {noteCount} Notes, and {stepCount} Steps found</div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <span>Tasks ({taskCount})</span>
                <span>Notes ({noteCount})</span>
                <span>Steps ({stepCount})</span>
                <span>Lists ({listCount})</span>
                <span>Groups ({groupCount})</span>
              </div>
            </div>
          );
        })()}

        {searchQuery.trim() && (() => {
          const q = searchQuery.trim().toLowerCase();
          const matchedLists = allLists.filter((l) => l.title.toLowerCase().includes(q));
          if (matchedLists.length === 0) return null;
          return (
            <section className="completed-section" style={{ marginBottom: '0.75rem' }}>
              <div className="completed-toggle">Lists ({matchedLists.length})</div>
              <ul className="task-list">
                {matchedLists.map((l) => (
                  <li
                    key={l.id}
                    className="task-row"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setSelection({ type: 'list', id: l.id });
                      setSearchQuery('');
                    }}
                  >
                    <span className="task-title">☰ {l.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })()}

        {(plannedGroups ?? categoryGroups) ? (
          (plannedGroups ?? categoryGroups)!.map((group) => (
            <section key={group.label} className="completed-section">
              <div className="completed-toggle">{group.label} ({group.items.length})</div>
              <ul className="task-list">
                {group.items.map((item) => (
                  <TaskRow
                    key={item.id}
                    item={item}
                    lists={allLists}
                    selected={selectedItemId === item.id || selectedIds.has(item.id)}
                    todayStr={todayStr}
                    tomorrowStr={tomorrowStr}
                    showListMeta={(selection.type === 'smart' || searchQuery.trim() !== '') && selection.id !== 'all'}
                    onToggleDone={handleToggleDone}
                    onToggleImportant={handleToggleImportant}
                    onOpen={handleOpen}
                    onContextMenu={(e) => {
                      setContextMenu({ x: e.clientX, y: e.clientY, item });
                    }}
                  />
                ))}
              </ul>
            </section>
          ))
        ) : (
        viewMode === 'grid' ? (
          <div className="grid-view-wrap">
            <table className="grid-table" aria-label="Tasks grid">
              <thead>
                <tr>
                  <th>Done</th>
                  <th>Title</th>
                  <th>Due Date</th>
                  <th>Importance</th>
                </tr>
              </thead>
              <tbody>
                {activeItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <input
                        type="checkbox"
                        className="circle-check"
                        checked={item.done}
                        onChange={() =>
                          handleUpdateItem(item, {
                            done: true,
                            completedAtMs: Date.now(),
                          })
                        }
                      />
                    </td>
                    <td
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (
                          (e.key === 'Enter' || e.key === ' ') &&
                          gridEditId !== item.id
                        ) {
                          e.preventDefault();
                          setGridEditId(item.id);
                          setGridEditText(item.text);
                        }
                      }}
                      onClick={() => {
                        if (gridEditId !== item.id) {
                          setGridEditId(item.id);
                          setGridEditText(item.text);
                        }
                      }}
                    >
                      {gridEditId === item.id ? (
                        <input
                          type="text"
                          className="grid-cell-input"
                          autoFocus
                          value={gridEditText}
                          onChange={(e) => setGridEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const trimmed = gridEditText.trim();
                              if (trimmed) {
                                handleUpdateItem(item, { text: trimmed });
                              }
                              setGridEditId(null);
                            } else if (e.key === 'Escape') {
                              setGridEditId(null);
                            }
                          }}
                          onBlur={() => {
                            const trimmed = gridEditText.trim();
                            if (trimmed && trimmed !== item.text) {
                              handleUpdateItem(item, { text: trimmed });
                            }
                            setGridEditId(null);
                          }}
                        />
                      ) : (
                        item.text
        )})
                    </td>
                    <td>{item.dueDate ?? '—'}</td>
                    <td>
                      <button
                        className={`star-btn ${item.important ? 'active' : ''}`}
                        onClick={() =>
                          handleUpdateItem(item, { important: !item.important })
                        }
                        aria-label="Toggle important"
                      >
                        {item.important ? '★' : '☆'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
        allViewGroups ? (
          allViewGroups.map(({ list, items }) => {
            const isCollapsed = collapsedLists[list.id] ?? false;
            return (
              <section key={list.id} className="all-section">
                <button
                  type="button"
                  className="section-header"
                  onClick={() => toggleListCollapsed(list.id)}
                  aria-expanded={!isCollapsed}
                >
                  <span className="section-chevron">{isCollapsed ? '▸' : '▾'}</span>
                  <span className="section-icon">{getListIcon({ type: 'list', id: list.id }, list.title)}</span>
                  <span className="section-name">{list.title}</span>
                  <span className="section-count">{items.length}</span>
                </button>
                {!isCollapsed && (
                  <ul className="task-list">
                    {items.map((item) => (
                      <TaskRow
                        key={item.id}
                        item={item}
                        lists={allLists}
                        selected={selectedItemId === item.id || selectedIds.has(item.id)}
                        todayStr={todayStr}
                        tomorrowStr={tomorrowStr}
                        showListMeta={false}
                        onToggleDone={handleToggleDone}
                        onToggleImportant={handleToggleImportant}
                        onOpen={handleOpen}
                        onContextMenu={(e) => {
                          setContextMenu({ x: e.clientX, y: e.clientY, item });
                        }}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        ) : (
          <ul className="task-list">
            {activeItems.map((item) => (
              <TaskRow
                key={item.id}
                item={item}
                lists={allLists}
                selected={selectedItemId === item.id || selectedIds.has(item.id)}
                todayStr={todayStr}
                tomorrowStr={tomorrowStr}
                showListMeta={(selection.type === 'smart' || searchQuery.trim() !== '') && selection.id !== 'all'}
                onToggleDone={handleToggleDone}
                onToggleImportant={handleToggleImportant}
                onOpen={handleOpen}
                onContextMenu={(e) => {
                  setContextMenu({ x: e.clientX, y: e.clientY, item });
                }}
              />
            ))}
          </ul>
        )
        ))}
        {completedItems.length > 0 && (
          <section className="completed-section">
            <button
              className="completed-toggle"
              onClick={() => setShowCompleted((v) => !v)}
            >
              <span>{showCompleted ? '▾' : '▸'}</span>
              <span>Completed ({completedItems.length})</span>
            </button>
            {showCompleted && (
              <ul className="task-list">
                {completedItems.map((item) => (
                  <TaskRow
                    key={item.id}
                    item={item}
                    lists={allLists}
                    selected={selectedItemId === item.id || selectedIds.has(item.id)}
                    todayStr={todayStr}
                    tomorrowStr={tomorrowStr}
                    showListMeta={(selection.type === 'smart' || searchQuery.trim() !== '') && selection.id !== 'all'}
                    onToggleDone={handleToggleDone}
                    onToggleImportant={handleToggleImportant}
                    onOpen={handleOpen}
                    onContextMenu={(e) => {
                      setContextMenu({ x: e.clientX, y: e.clientY, item });
                    }}
                  />
                ))}
              </ul>
            )}
          </section>
        )}
        </div>

        
        {!searchQuery && activeItems.length === 0 && !(selection.type === 'smart' && (selection.id === 'flagged-email' || selection.id === 'assigned-to-me')) && (
          <div className={`empty-state ${selection.type === 'smart' && selection.id === 'my-day' ? 'my-day-empty-state' : ''}`}>
            {selection.type === 'smart' && selection.id === 'my-day' && (
              <div className="empty-state-illustration" aria-hidden="true">
                <svg viewBox="0 0 112 104" fill="none">
                  <path d="M24 32 86 42 77 88 18 78Z" fill="rgba(255,255,255,.14)" />
                  <path d="M27 25 89 35 80 81 21 71Z" fill="#e9e5df" />
                  <path d="m27 25 62 10-3 15-62-10Z" fill="#7d8fd1" />
                  <path d="m39 21-2 15m14-13-2 15m14-13-2 15m14-13-2 15" stroke="#ddd9d3" strokeWidth="5" strokeLinecap="round" />
                  <circle cx="91" cy="22" r="5" fill="rgba(255,255,255,.2)" />
                  <circle cx="91" cy="5" r="2.5" fill="rgba(255,255,255,.2)" />
                  <circle cx="105" cy="22" r="2.5" fill="rgba(255,255,255,.2)" />
                  <circle cx="78" cy="22" r="2.5" fill="rgba(255,255,255,.2)" />
                  <circle cx="91" cy="39" r="2.5" fill="rgba(255,255,255,.2)" />
                </svg>
              </div>
            )}
            <div className="empty-state-title">
              {selection.type === 'smart' && selection.id === 'my-day'
                ? 'Focus on your day'
                : 'No tasks yet'}
            </div>
            <div className="empty-state-copy">
              {selection.type === 'smart' && selection.id === 'my-day'
                ? 'Get things done with My Day, a list that refreshes every day.'
                : selection.type === 'smart' && selection.id === 'important'
                ? 'Try starring some tasks to see them here.'
                : selection.type === 'smart' && selection.id === 'planned'
                ? 'Tasks with due dates or reminders show up here.'
                : selection.type === 'smart' && selection.id === 'completed'
                ? 'Tasks you complete show up here.'
                : 'Add a task below to get started.'}
            </div>
            {selection.type === 'smart' && selection.id === 'my-day' && (
              <button type="button" className="empty-state-action" onClick={() => addTaskInputRef.current?.focus()}>
                Add task to My Day
              </button>
            )}
          </div>
        )}

        {selection.type === 'smart' &&
          selection.id === 'flagged-email' &&
          !searchQuery && (
            <div className="empty-state" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-text-2)' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ marginBottom: '0.75rem' }}>
                <rect x="2" y="4" width="20" height="16" rx="2" stroke="var(--color-text-3)" strokeWidth="1.5" />
                <path d="M2 7l10 6 10-6" stroke="var(--color-text-3)" strokeWidth="1.5" />
                <path d="M17 3v9m0-9h4l-1.2 2L21 7h-4" fill="var(--color-accent)" stroke="var(--color-accent)" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--color-text)', marginBottom: '0.25rem' }}>Tasks from flagged email</div>
              <div style={{ fontSize: '0.9rem' }}>Messages you flag will show up as tasks here.</div>
              {!appSettings.connectedFlaggedEmail && (
                <div style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: 'var(--color-text-3)' }}>Turn on Flagged email in Connected apps to receive flagged messages.</div>
              )}
            </div>
          )}

        {selection.type === 'smart' &&
          selection.id === 'assigned-to-me' &&
          !searchQuery && (
            <p className="notice">No tasks assigned to you yet.</p>
          )}


      </main>

      {contextMenu && (
        <div
          className="context-menu"
          style={{
            top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 500)),
            left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 292)),
            maxHeight: 'calc(100vh - 16px)',
            overflowY: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              const isMyDay = contextMenu.item.myDayDate === todayStr;
              handleUpdateItem(contextMenu.item, { myDayDate: isMyDay ? null : todayStr });
              setContextMenu(null);
            }}
          >
            <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="sun" /></span>
            {contextMenu.item.myDayDate === todayStr ? "Remove from My Day" : "Add to My Day"}
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              handleUpdateItem(contextMenu.item, { important: !contextMenu.item.important });
              setContextMenu(null);
            }}
          >
            <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="star" /></span>
            {contextMenu.item.important ? "Remove importance" : "Mark as important"}
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              handleUpdateItem(contextMenu.item, { done: !contextMenu.item.done, completedAtMs: !contextMenu.item.done ? Date.now() : null });
              setContextMenu(null);
            }}
          >
            <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="check" /></span>
            {contextMenu.item.done ? "Mark as not completed" : "Mark as completed"}
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              handleUpdateItem(contextMenu.item, { dueDate: todayStr });
              setContextMenu(null);
            }}
          >
            <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="calendar" /></span>
            Due today
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              handleUpdateItem(contextMenu.item, { dueDate: tomorrowStr });
              setContextMenu(null);
            }}
          >
            <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="calendar" /></span>
            Due tomorrow
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={async () => {
              if (!user) return;
              const ref = await addDoc(collection(db, "lists"), { title: contextMenu.item.text, ownerUid: user.uid, createdAt: serverTimestamp() });
              await handleMoveToList(contextMenu.item, ref.id);
              setContextMenu(null);
            }}
          >
            <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="folder" /></span>
            Create new list from this task
          </button>
          <div className="context-menu-submenu-wrap" onMouseEnter={() => setTaskSubmenu("move")} onMouseLeave={() => setTaskSubmenu(null)}>
            <button type="button" className="context-menu-item" onClick={() => setTaskSubmenu((value) => value === "move" ? null : "move")}>
              <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="move" /></span><span>Move task to…</span><span className="context-menu-arrow">›</span>
            </button>
            {taskSubmenu === "move" && (
              <div className="context-menu context-menu-submenu">
                {allLists.map((l) => {
                  const isCurrent = l.id === contextMenu.item.listId;
                  return (
                    <button key={l.id} disabled={isCurrent} onClick={async () => { await handleMoveToList(contextMenu.item, l.id); setContextMenu(null); setTaskSubmenu(null); }}>
                      {isCurrent ? "✓ " : ""}{l.title}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="context-menu-submenu-wrap" onMouseEnter={() => setTaskSubmenu("copy")} onMouseLeave={() => setTaskSubmenu(null)}>
            <button type="button" className="context-menu-item" onClick={() => setTaskSubmenu((value) => value === "copy" ? null : "copy")}>
              <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="copy" /></span><span>Copy task to…</span><span className="context-menu-arrow">›</span>
            </button>
            {taskSubmenu === "copy" && (
              <div className="context-menu context-menu-submenu">
                {allLists.map((l) => (
                  <button key={l.id} onClick={async () => {
                    if (!user) return;
                    const isSame = l.id === contextMenu.item.listId;
                    await addDoc(collection(db, "lists", l.id, "items"), {
                      listId: l.id, ownerUid: user.uid, text: isSame ? `${contextMenu.item.text} (copy)` : contextMenu.item.text,
                      done: false, important: false, myDayDate: null, dueDate: contextMenu.item.dueDate ?? null,
                      notes: contextMenu.item.notes ?? "", category: contextMenu.item.category ?? null,
                      steps: (contextMenu.item.steps ?? []).map((st) => ({ ...st, done: false })), createdAtMs: Date.now(), completedAtMs: null,
                    });
                    setContextMenu(null); setTaskSubmenu(null);
                  }}>
                    {l.title}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="danger"
            onClick={() => {
              handleDeleteItem(contextMenu.item);
              setContextMenu(null);
            }}
          >
            <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="trash" /></span>
            Delete task
          </button>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="bulk-bar" role="region" aria-label="Bulk actions">
          <span className="bulk-count">{selectedIds.size} selected</span>
          <div className="bulk-actions">
            <button
              onClick={() => {
                activeItems
                  .filter((t) => selectedIds.has(t.id))
                  .forEach((t) => handleUpdateItem(t, { myDayDate: todayStr }));
                setSelectedIds(new Set());
              }}
            >
              Add to My Day
            </button>
            <button
              onClick={() => {
                activeItems
                  .filter((t) => selectedIds.has(t.id))
                  .forEach((t) =>
                    handleUpdateItem(t, {
                      done: true,
                      completedAtMs: Date.now(),
                    })
                  );
                setSelectedIds(new Set());
              }}
            >
              Mark complete
            </button>
            <button
              onClick={() => {
                activeItems
                  .filter((t) => selectedIds.has(t.id))
                  .forEach((t) => handleUpdateItem(t, { important: true }));
                setSelectedIds(new Set());
              }}
            >
              Mark important
            </button>
            <div className="bulk-move-wrap">
              <button onClick={() => setBulkMoveOpen((v) => !v)}>
                Move to &#9656;
              </button>
              {bulkMoveOpen && (
                <div className="bulk-move-menu">
                  {allLists.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => {
                        activeItems
                          .filter((t) => selectedIds.has(t.id))
                          .forEach((t) => handleMoveToList(t, l.id));
                        setBulkMoveOpen(false);
                        setSelectedIds(new Set());
                      }}
                    >
                      {l.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="danger"
              onClick={() => {
                if (
                  selectedIds.size > 1 &&
                  !window.confirm(`Delete ${selectedIds.size} tasks?`)
                ) {
                  return;
                }
                activeItems
                  .filter((t) => selectedIds.has(t.id))
                  .forEach((t) => handleDeleteItem(t));
                setSelectedIds(new Set());
              }}
            >
              Delete
            </button>
            <button
              onClick={() => {
                setSelectedIds(new Set());
                setBulkMoveOpen(false);
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {undoToast && (
        <div className="undo-toast">
          <span>Deleted &ldquo;{undoToast.item.text}&rdquo;</span>
          <button onClick={handleUndoDelete}>Undo</button>
        </div>
      )}

      {!selectedItem &&
        suggestionsOpen &&
        selection.type === 'smart' &&
        selection.id === 'my-day' &&
        !searchQuery && (
          <aside className="suggestions-pane" aria-label="Suggestions">
            <div className="suggestions-header">
              <h3>Suggestions</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {myDaySuggestions.length > 0 && (
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => Promise.all(myDaySuggestions.map((item) => handleUpdateItem(item, { myDayDate: todayStr })))}
                  >
                    Add all
                  </button>
                )}
                <button
                  className="icon-btn"
                  onClick={() => setSuggestionsOpen(false)}
                  aria-label="Close suggestions"
                >
                  &#10005;
                </button>
              </div>
            </div>
            <p className="suggestions-section-label">Recently added</p>
            <ul className="suggestions-list">
              {myDaySuggestions.length === 0 ? (
                <li className="suggestions-empty">No suggestions right now.</li>
              ) : (
                myDaySuggestions.slice(0, suggestionsLimit).map((item) => {
                  const listName =
                    lists.find((l) => l.id === item.listId)?.title ??
                    'Tasks';
                  return (
                    <li key={item.id} className="suggestion-row">
                      <div className="suggestion-info">
                        <span className="suggestion-title">{item.text}</span>
                        <span className="suggestion-list">{listName}</span>
                      </div>
                      <button
                        className="suggestion-add-btn"
                        onClick={() =>
                          handleUpdateItem(item, { myDayDate: todayStr })
                        }
                        aria-label={`Add ${item.text} to My Day`}
                        title="Add to My Day"
                      >
                        +
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
            {myDaySuggestions.length > suggestionsLimit && suggestionsLimit < 20 && (
              <button
                type="button"
                className="chip-btn"
                style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}
                onClick={() => setSuggestionsLimit((n) => Math.min(20, n + 10))}
              >
                More
              </button>
            )}
          </aside>
        )}

      {selectedItem && (
        <TaskDetail
          key={selectedItem.id}
          item={selectedItem}
          lists={allLists}
          todayStr={todayStr}
          onClose={() => setSelectedItemId(null)}
          onUpdate={handleUpdateItem}
          onMoveToList={handleMoveToList}
          onDelete={handleDeleteItem}
        />
      )}
      </div>
      {installPrompt && (
        <button
          type="button"
          className="chip-btn"
          style={{ position: 'fixed', bottom: '16px', right: '16px', zIndex: 'var(--z-toast, 100)' }}
          onClick={async () => {
            await installPrompt.prompt?.();
            setInstallPrompt(null);
          }}
        >
          Install app
        </button>
      )}
      {whatsNewOpen && (
        <div className="modal-backdrop" onClick={() => setWhatsNewOpen(false)}>
          <div className="modal-card whats-new-card" onClick={(e) => e.stopPropagation()}>
            <div className="whats-new-heading">
              <h2>What&apos;s new in To Do</h2>
              <button type="button" className="icon-btn" onClick={() => setWhatsNewOpen(false)} aria-label="Close">×</button>
            </div>
            <ul>
              <li>Smart lists for My Day, Important, Planned, All, Completed, and more</li>
              <li>List sharing, groups, and custom themes</li>
              <li>Reminders, due dates, recurrence, and task steps</li>
            </ul>
          </div>
        </div>
      )}
      {shortcutsOpen && (
        <div className="modal-backdrop" onClick={() => setShortcutsOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ padding: "1.25rem", width: "360px", background: "var(--color-surface)", color: "var(--color-text)", borderRadius: "8px", border: "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Keyboard shortcuts</h2>
              <button type="button" className="icon-btn" onClick={() => setShortcutsOpen(false)}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.85rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>New task</span><kbd>Ctrl+N</kbd></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Search</span><kbd>Ctrl+F</kbd></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Close / Clear</span><kbd>Esc</kbd></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Shortcuts help</span><kbd>?</kbd></div>
            </div>
          </div>
        </div>
      )}
      {settingsOpen && (
        <SettingsModal
          user={user}
          settings={appSettings}
          onUpdateSettings={updateAppSettings}
          onExportJson={handleExportJson}
          onImportJson={handleImportJson}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {shareListId && (() => {
        const targetList = allLists.find((l) => l.id === shareListId);
        if (!targetList) return null;
        return (
          <ShareDialog
            list={targetList}
            user={user}
            onInviteEmail={async (email) => {
              await addDoc(collection(db, "lists", targetList.id, "shares"), {
                email, role: "member", status: "invited", createdAt: serverTimestamp(),
              });
            }}
            onRemoveMember={async (uid) => {
              const existing = (targetList as TodoList & { memberIds?: string[] }).memberIds ?? [];
              await updateDoc(doc(db, "lists", targetList.id), { memberIds: existing.filter((m) => m !== uid) });
            }}
            onClose={() => setShareListId(null)}
          />
        );
      })()}
    </div>
  );
}

export default App;
