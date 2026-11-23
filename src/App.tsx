import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import {
  addDoc,
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  DocumentData,
  onSnapshot,
  orderBy,
  query,
  QueryDocumentSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  waitForPendingWrites,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  getFirebaseStorage,
  isFirebaseConfigured,
  signInWithGoogle,
  signInWithGoogleRedirect,
  signOutUser,
} from './lib/firebase';
import { TaskRow } from './components/TaskRow';
import { Sidebar } from './components/Sidebar';
import { EmojiPicker } from './components/EmojiPicker';
import { TaskDetail } from './components/TaskDetail';
import { SyncStatus, TopBar } from './components/TopBar';
import { AppSettings, DEFAULT_SETTINGS, SettingsModal } from './components/SettingsModal';
import { ShareDialog } from './components/ShareDialog';
import { CustomCalendarPicker } from './components/CustomCalendarPicker';
import { AppDialogModal } from './components/AppDialogModal';
import { DEFAULT_PRINT_OPTIONS, PrintModal, PrintOptions, PrintSheet } from './components/PrintModal';
import { appConfirm, appPrompt } from './lib/appDialog';
import { playCompleteSound } from './lib/sound';
import { suggestEmoji } from './lib/suggestEmoji';
import { parseTaskInput } from './lib/parseTaskInput';
import { getContextSubmenuPosition, ContextSubmenuPosition } from './lib/contextMenu';
import { runViewTransition, useAnimatedPresence, useFlipList, useRetainedValue } from './lib/motion';
import { blobToDataUrl, compressBackgroundImage, isSupportedImageFile } from './lib/imageCompression';
import {
  notifyListCollaborators,
  registerDevicePushToken,
  requestAndEnableNotifications,
  showLocalNotification,
  subscribeForegroundMessages,
  unregisterDevicePushToken,
} from './lib/notifications';
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

function getTaskSortOrder(item: TodoItem): number {
  return item.sortOrder ?? -item.createdAtMs;
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

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const SMART_TITLES: Record<SmartListId, string> = {
  'my-day': 'My Day',
  important: 'Important',
  planned: 'Planned',
  'assigned-to-me': 'Assigned to me',
  tasks: 'Tasks',
  all: 'All',
  completed: 'Completed',
  trash: 'Trash',
};

function getListIcon(selection: ViewSelection, customIcon?: string | null): React.ReactNode {
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
        case 'trash':
          return (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          );
        default:
          return null;
      }
    case 'list':
      if (customIcon) {
        return <span className="list-emoji" aria-hidden="true">{customIcon}</span>;
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
    move: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
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
  const [ownedItems, setOwnedItems] = useState<TodoItem[]>([]);
  const [sharedItemsByList, setSharedItemsByList] = useState<Record<string, TodoItem[]>>({});
  const rawItems = useMemo(() => {
    const byId = new Map<string, TodoItem>();
    for (const item of ownedItems) byId.set(item.id, item);
    for (const listItems of Object.values(sharedItemsByList)) {
      for (const item of listItems) byId.set(item.id, item);
    }
    return Array.from(byId.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [ownedItems, sharedItemsByList]);

  const allItems = useMemo(
    () => rawItems.filter((item) => !item.deletedAtMs),
    [rawItems]
  );

  const trashedItems = useMemo(() => {
    const now = Date.now();
    return rawItems
      .filter((item) => Boolean(item.deletedAtMs) && now - (item.deletedAtMs ?? 0) <= TRASH_RETENTION_MS)
      .sort((a, b) => (b.deletedAtMs ?? 0) - (a.deletedAtMs ?? 0));
  }, [rawItems]);

  const purgedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!user) return;
    const now = Date.now();
    for (const item of rawItems) {
      if (
        item.deletedAtMs &&
        now - item.deletedAtMs > TRASH_RETENTION_MS &&
        !purgedIdsRef.current.has(item.id)
      ) {
        purgedIdsRef.current.add(item.id);
        deleteDoc(doc(db, 'lists', item.listId, 'items', item.id)).catch(() => {
          purgedIdsRef.current.delete(item.id);
        });
      }
    }
  }, [rawItems, user]);

  const [sandExitingIds, setSandExitingIds] = useState<Set<string>>(() => new Set());
  const [sandEnteringIds, setSandEnteringIds] = useState<Set<string>>(() => new Set());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online'
  );

  useEffect(() => {
    let syncedTimer: number | undefined;
    let active = true;

    const handleOffline = () => {
      if (syncedTimer !== undefined) window.clearTimeout(syncedTimer);
      setSyncStatus('offline');
    };

    const handleOnline = () => {
      if (syncedTimer !== undefined) window.clearTimeout(syncedTimer);
      setSyncStatus('syncing');
      void waitForPendingWrites(db)
        .then(() => {
          if (!active || !navigator.onLine) return;
          setSyncStatus('synced');
          syncedTimer = window.setTimeout(() => {
            if (active && navigator.onLine) {
              setSyncStatus((prev) => (prev === 'synced' ? 'online' : prev));
            }
          }, 2500);
        })
        .catch(() => {
          if (active && navigator.onLine) setSyncStatus('online');
        });
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      active = false;
      if (syncedTimer !== undefined) window.clearTimeout(syncedTimer);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);
  const prevDoneByIdRef = useRef<Map<string, boolean>>(new Map());
  const sandTimersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const prev = prevDoneByIdRef.current;
    const next = new Map<string, boolean>();
    const newlyChecked: string[] = [];
    const newlyUnchecked: string[] = [];

    for (const item of allItems) {
      next.set(item.id, item.done);
      if (prev.has(item.id)) {
        const wasDone = prev.get(item.id);
        if (!wasDone && item.done) newlyChecked.push(item.id);
        else if (wasDone && !item.done) newlyUnchecked.push(item.id);
      }
    }
    prevDoneByIdRef.current = next;

    if (newlyChecked.length === 0 && newlyUnchecked.length === 0) return;

    const scheduleClear = (id: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) => {
      const existing = sandTimersRef.current.get(id);
      if (existing !== undefined) window.clearTimeout(existing);
      const timerId = window.setTimeout(() => {
        sandTimersRef.current.delete(id);
        setter((s) => {
          if (!s.has(id)) return s;
          const copy = new Set(s);
          copy.delete(id);
          return copy;
        });
      }, 300);
      sandTimersRef.current.set(id, timerId);
    };

    if (newlyChecked.length > 0) {
      setSandEnteringIds((s) => {
        const copy = new Set(s);
        for (const id of newlyChecked) copy.delete(id);
        return copy;
      });
      setSandExitingIds((s) => {
        const copy = new Set(s);
        for (const id of newlyChecked) {
          copy.add(id);
          scheduleClear(id, setSandExitingIds);
        }
        return copy;
      });
    }

    if (newlyUnchecked.length > 0) {
      setSandExitingIds((s) => {
        const copy = new Set(s);
        for (const id of newlyUnchecked) copy.delete(id);
        return copy;
      });
      setSandEnteringIds((s) => {
        const copy = new Set(s);
        for (const id of newlyUnchecked) {
          copy.add(id);
          scheduleClear(id, setSandEnteringIds);
        }
        return copy;
      });
    }
  }, [allItems]);

  const getSandState = (id: string): 'dissolve' | 'materialize' | null => {
    if (sandExitingIds.has(id)) return 'dissolve';
    if (sandEnteringIds.has(id)) return 'materialize';
    return null;
  };
  const [selection, setSelection] = useState<ViewSelection>(() => {
    const path = window.location.pathname.toLowerCase();
    if (path === '/tasks/important') return { type: 'smart', id: 'important' };
    if (path === '/tasks/planned') return { type: 'smart', id: 'planned' };
    if (path === '/tasks/all') return { type: 'smart', id: 'all' };
    if (path === '/tasks/completed') return { type: 'smart', id: 'completed' };
    if (path === '/tasks/assigned-to-me') return { type: 'smart', id: 'assigned-to-me' };
    if (path === '/tasks/inbox' || path === '/tasks/tasks') return { type: 'smart', id: 'tasks' };
    try {
      const saved = localStorage.getItem('todo.lastSelection');
      if (saved) {
        const parsed = JSON.parse(saved) as ViewSelection;
        if (parsed && (parsed.type === 'smart' || parsed.type === 'list') && typeof parsed.id === 'string') {
          return parsed;
        }
      }
    } catch {
      // ignore invalid stored selection
    }
    return { type: 'smart', id: 'my-day' };
  });
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem('todo.lastSelection', JSON.stringify(selection));
    } catch {
      // ignore storage errors
    }
  }, [selection]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [newItemText, setNewItemText] = useState('');
  const [duplicateDismissed, setDuplicateDismissed] = useState(false);
  const [smartParseEnabled, setSmartParseEnabled] = useState(true);
  const [completedExpandedByView, setCompletedExpandedByView] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('todo.completedExpandedByView');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') return parsed as Record<string, boolean>;
      }
    } catch {
      // ignore storage errors
    }
    return {};
  });
  useEffect(() => {
    try {
      localStorage.setItem('todo.completedExpandedByView', JSON.stringify(completedExpandedByView));
    } catch {
      // ignore storage errors
    }
  }, [completedExpandedByView]);
  const currentViewKey = `${selection.type}:${selection.id}`;
  const showCompleted = Boolean(completedExpandedByView[currentViewKey]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'home' | 'list' | 'search'>('home');
  const [mobileAddOpen, setMobileAddOpen] = useState(false);
  const [mobileHideCompletedSearch, setMobileHideCompletedSearch] = useState(false);
  const [mobileSearchMenuOpen, setMobileSearchMenuOpen] = useState(false);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const mobileAddInputRef = useRef<HTMLInputElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [addReminderAtMs, setAddReminderAtMs] = useState<number | null>(null);
  const [addDueMenuOpen, setAddDueMenuOpen] = useState(false);
  const [addRemindMenuOpen, setAddRemindMenuOpen] = useState(false);
  const [addRepeatMenuOpen, setAddRepeatMenuOpen] = useState(false);
  const [addDueCalendarOpen, setAddDueCalendarOpen] = useState(false);
  const [addRemindCalendarOpen, setAddRemindCalendarOpen] = useState(false);
  const [addRowExpanded, setAddRowExpanded] = useState(false);
  const [addInputFocused, setAddInputFocused] = useState(false);
  const [suggestionsLimit, setSuggestionsLimit] = useState(10);

  useEffect(() => {
    setEmojiPickerOpen(false);
  }, [selection.type, selection.id, searchQuery]);

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
    if (!addRowExpanded) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement)?.closest('.add-task-row')) {
        setAddRowExpanded(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [addRowExpanded]);

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
  const [printListId, setPrintListId] = useState<string | null>(null);
  const [printOptions, setPrintOptions] = useState<PrintOptions>(() => {
    try {
      const saved = localStorage.getItem('todo-print-options');
      return saved ? { ...DEFAULT_PRINT_OPTIONS, ...JSON.parse(saved) } : DEFAULT_PRINT_OPTIONS;
    } catch {
      return DEFAULT_PRINT_OPTIONS;
    }
  });
  useEffect(() => {
    localStorage.setItem('todo-print-options', JSON.stringify(printOptions));
  }, [printOptions]);
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
      if (patch.reminderNotifications !== undefined && user) {
        if (patch.reminderNotifications) {
          void requestAndEnableNotifications(user.uid);
        } else {
          void unregisterDevicePushToken(user.uid);
        }
      }
      return next;
    });
  };
  const mutedListIdsRef = useRef<string[]>(appSettings.mutedListIds ?? []);
  mutedListIdsRef.current = appSettings.mutedListIds ?? [];
  const isListMuted = (listId: string) => mutedListIdsRef.current.includes(listId);
  const toggleListNotifications = (listId: string) => {
    const current = appSettings.mutedListIds ?? [];
    const willMute = !current.includes(listId);
    const next = willMute
      ? [...current, listId]
      : current.filter((id) => id !== listId);
    updateAppSettings({ mutedListIds: next });
    const targetTitle = allLists.find((l) => l.id === listId)?.title ?? 'list';
    showClipboardToast(
      willMute
        ? `Notifications turned off for "${targetTitle}"`
        : `Notifications turned on for "${targetTitle}"`
    );
  };
  const [sortBy, setSortBy] = useState<SortOption>('position');
  const [sortAsc, setSortAsc] = useState(true);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [listMenuOpen, setListMenuOpen] = useState(false);
  const [listOptionsSortOpen, setListOptionsSortOpen] = useState(false);
  const [listOptionsSortPosition, setListOptionsSortPosition] = useState<ContextSubmenuPosition | null>(null);
  const [themeDeleteTarget, setThemeDeleteTarget] = useState<{
    top: number;
    left: number;
    kind: 'custom-bg' | 'wallpaper' | 'color';
    id: string;
    label: string;
  } | null>(null);
  const [backgroundUploadInProgress, setBackgroundUploadInProgress] = useState(false);
  const [backgroundUploadStatus, setBackgroundUploadStatus] = useState<{
    stage: 'preparing' | 'uploading' | 'saving' | 'done' | 'error';
    progress: number;
    message: string;
  } | null>(null);
  const [taskSubmenu, setTaskSubmenu] = useState<"move" | "copy" | null>(null);
  const [taskSubmenuPosition, setTaskSubmenuPosition] = useState<ContextSubmenuPosition | null>(null);
  const headerTitleInputRef = useRef<HTMLInputElement>(null);
  const backgroundImageInputRef = useRef<HTMLInputElement>(null);
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
    if (!listMenuOpen) {
      setListOptionsSortOpen(false);
      setListOptionsSortPosition(null);
      setThemeDeleteTarget(null);
    }
  }, [listMenuOpen]);

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
  const [taskDatePickerOpen, setTaskDatePickerOpen] = useState(false);
  const [completedMenu, setCompletedMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [completedMoveOpen, setCompletedMoveOpen] = useState(false);
  const [completedMovePosition, setCompletedMovePosition] = useState<ContextSubmenuPosition | null>(null);
  const [completedDatePickerOpen, setCompletedDatePickerOpen] = useState(false);
  const [undoToast, setUndoToast] = useState<{
    item: TodoItem;
    timerId: number;
  } | null>(null);
  const undoStackRef = useRef<Array<{ label: string; undo: () => Promise<void> }>>([]);
  const isUndoingRef = useRef(false);
  const pushUndo = (entry: { label: string; undo: () => Promise<void> }) => {
    if (isUndoingRef.current) return;
    undoStackRef.current = [...undoStackRef.current.slice(-29), entry];
  };
  const [error, setError] = useState<string | null>(null);

  const todayStr = getTodayStr();
  const openTaskSubmenu = (submenu: "move" | "copy", anchor: HTMLElement) => {
    setTaskSubmenuPosition(getContextSubmenuPosition(anchor.getBoundingClientRect()));
    setTaskSubmenu(submenu);
  };

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [listPickerMenu, setListPickerMenu] = useState<{ mode: 'move' | 'copy'; items: TodoItem[] } | null>(null);
  const [taskClipboard, setTaskClipboard] = useState<{ mode: 'copy' | 'cut'; items: TodoItem[] } | null>(null);
  const [clipboardToast, setClipboardToast] = useState<string | null>(null);
  const clipboardToastTimerRef = useRef<number | null>(null);
  const showClipboardToast = (msg: string) => {
    if (clipboardToastTimerRef.current !== null) {
      window.clearTimeout(clipboardToastTimerRef.current);
    }
    setClipboardToast(msg);
    clipboardToastTimerRef.current = window.setTimeout(() => {
      setClipboardToast(null);
      clipboardToastTimerRef.current = null;
    }, 2400);
  };
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
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
    if (!searchQuery && viewMode === 'list' && selection.id !== 'completed' && selection.id !== 'assigned-to-me') {
      setTimeout(() => {
        if (!document.activeElement?.closest('.sidebar-search')) {
          addTaskInputRef.current?.focus();
        }
      }, 100);
    }
  }, [selection, viewMode]);

  const parsedNewTask = useMemo(
    () => (smartParseEnabled ? parseTaskInput(newItemText) : null),
    [newItemText, smartParseEnabled]
  );

  const duplicateMatches = useMemo(() => {
    const rawQ = parsedNewTask?.hasMatch ? parsedNewTask.title : newItemText;
    const q = rawQ.trim().toLowerCase();
    if (q.length < 2 || duplicateDismissed) return [];
    const targetListId =
      selection.type === 'list'
        ? selection.id
        : selection.id === 'tasks'
          ? defaultTasksList?.id ?? null
          : null;
    return allItems
      .filter((item) => {
        if (targetListId && item.listId !== targetListId) return false;
        return item.text.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const aExact = a.text.trim().toLowerCase() === q ? 0 : 1;
        const bExact = b.text.trim().toLowerCase() === q ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        if (a.done !== b.done) return a.done ? 1 : -1;
        return b.createdAtMs - a.createdAtMs;
      })
      .slice(0, 5);
  }, [allItems, defaultTasksList?.id, duplicateDismissed, newItemText, parsedNewTask, selection]);

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
    const onClick = () => {
      setContextMenu(null);
      setTaskDatePickerOpen(false);
      setCompletedMenu(null);
      setCompletedMoveOpen(false);
      setCompletedDatePickerOpen(false);
    };
    const onScroll = () => {
      setContextMenu(null);
      setTaskDatePickerOpen(false);
      setCompletedMenu(null);
      setCompletedMoveOpen(false);
      setCompletedDatePickerOpen(false);
    };
    window.addEventListener('click', onClick);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('click', onClick);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  useEffect(() => {
    if (!sortMenuOpen && !groupMenuOpen && !listMenuOpen && !listOptionsSortOpen) return;
    const closeMenus = () => {
      setSortMenuOpen(false);
      setGroupMenuOpen(false);
      setListMenuOpen(false);
      setListOptionsSortOpen(false);
      setListOptionsSortPosition(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (listOptionsSortOpen) {
          setListOptionsSortOpen(false);
          setListOptionsSortPosition(null);
        } else {
          closeMenus();
        }
      }
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
  }, [sortMenuOpen, groupMenuOpen, listMenuOpen, listOptionsSortOpen]);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
  }, []);

  const notifiedLocalRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !appSettings.reminderNotifications) return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      void registerDevicePushToken(user.uid);
    }
    let unsubscribe = () => {};
    let cancelled = false;
    void subscribeForegroundMessages((listId) => isListMuted(listId)).then((fn) => {
      if (cancelled) fn();
      else unsubscribe = fn;
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user, appSettings.reminderNotifications]);

  useEffect(() => {
    if (!user || !appSettings.reminderNotifications) return;
    const checkDueReminders = () => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const now = Date.now();
      for (const item of allItems) {
        if (
          !item.done &&
          !item.deletedAtMs &&
          !item.reminderNotified &&
          item.reminderAtMs &&
          item.reminderAtMs <= now &&
          !isListMuted(item.listId) &&
          !notifiedLocalRef.current.has(item.id)
        ) {
          notifiedLocalRef.current.add(item.id);
          void showLocalNotification('Task Reminder', item.text, item.id);
          void updateDoc(doc(db, 'lists', item.listId, 'items', item.id), {
            reminderNotified: true,
          }).catch(() => {});
        }
      }
    };
    checkDueReminders();
    const timer = window.setInterval(checkDueReminders, 30_000);
    return () => window.clearInterval(timer);
  }, [user, appSettings.reminderNotifications, allItems]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paramListId = params.get('join') || params.get('share');
    if (paramListId) {
      try {
        sessionStorage.setItem('todo.pendingShareListId', paramListId);
      } catch {
        // ignore storage errors
      }
    }

    if (!user) return;
    let joinListId = paramListId;
    if (!joinListId) {
      try {
        joinListId = sessionStorage.getItem('todo.pendingShareListId');
      } catch {
        joinListId = null;
      }
    }
    if (!joinListId) return;

    updateDoc(doc(db, 'lists', joinListId), {
      memberUids: arrayUnion(user.uid),
    })
      .then(() => {
        try {
          sessionStorage.removeItem('todo.pendingShareListId');
        } catch {
          // ignore storage errors
        }
        setSelection({ type: 'list', id: joinListId });
        if (paramListId) {
          window.history.replaceState({}, '', window.location.pathname);
        }
      })
      .catch((err) => {
        try {
          sessionStorage.removeItem('todo.pendingShareListId');
        } catch {
          // ignore storage errors
        }
        setError(err instanceof Error ? err.message : 'Failed to join list');
      });
  }, [user]);

  const mapItemDoc = (d: QueryDocumentSnapshot<DocumentData>, fallbackOwnerUid: string): TodoItem => {
    const data = d.data();
    const listId = d.ref.parent.parent?.id ?? (data.listId as string) ?? '';
    const createdAtMs = (data.createdAtMs as number) ?? Date.now();
    return {
      id: d.id,
      listId,
      ownerUid: (data.ownerUid as string) ?? fallbackOwnerUid,
      text: (data.text as string) ?? '',
      done: Boolean(data.done),
      important: Boolean(data.important),
      myDayDate: (data.myDayDate as string | null) ?? null,
      dueDate: (data.dueDate as string | null) ?? null,
      repeat: (data.repeat as RepeatRule) ?? 'none',
      repeatCustom: (data.repeatCustom as TodoItem['repeatCustom']) ?? null,
      reminderAtMs: (data.reminderAtMs as number | null) ?? null,
      reminderNotified: Boolean(data.reminderNotified),
      assignedTo: (data.assignedTo as string | null) ?? null,
      attachments: Array.isArray(data.attachments) ? data.attachments : [],
      updatedAtMs: (data.updatedAtMs as number | null) ?? null,
      createdByName: typeof data.createdByName === 'string' ? data.createdByName : null,
      updatedByUid: typeof data.updatedByUid === 'string' ? data.updatedByUid : null,
      updatedByName: typeof data.updatedByName === 'string' ? data.updatedByName : null,
      category: (data.category as any) ?? null,
      notes: (data.notes as string) ?? '',
      steps: Array.isArray(data.steps) ? data.steps : [],
      sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : -createdAtMs,
      createdAtMs,
      completedAtMs: (data.completedAtMs as number | null) ?? null,
      deletedAtMs: (data.deletedAtMs as number | null) ?? null,
      deletedByUid: typeof data.deletedByUid === 'string' ? data.deletedByUid : null,
      deletedByName: typeof data.deletedByName === 'string' ? data.deletedByName : null,
    };
  };

  useEffect(() => {
    if (!user) {
      setLists([]);
      setSharedLists([]);
      setOwnedItems([]);
      setSharedItemsByList({});
      return;
    }

    setDoc(
      doc(db, 'users', user.uid),
      {
        displayName: user.displayName || null,
        email: user.email || null,
        photoURL: user.photoURL || null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch(() => {});

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
            icon: typeof data.icon === 'string' ? data.icon : null,
            color: (data.color as string | undefined) ?? 'blue',
            background: (data.background as TodoList['background'] | undefined) ?? 'field',
            backgroundImageUrl: typeof data.backgroundImageUrl === 'string' ? data.backgroundImageUrl : null,
            backgroundImagePath: typeof data.backgroundImagePath === 'string' ? data.backgroundImagePath : null,
            customBackgroundActive: Boolean(data.customBackgroundActive),
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
        setOwnedItems(snap.docs.map((d) => mapItemDoc(d, user.uid)));
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
        setGroups(snap.docs.map((d, index) => {
          const data = d.data();
          const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
          return {
            id: d.id,
            title: (data.title as string) || 'Group',
            ownerUid: data.ownerUid as string,
            icon: typeof data.icon === 'string' ? data.icon : null,
            collapsed: Boolean(data.collapsed),
            sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : createdAt?.toMillis?.() ?? index,
          };
        }));
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
            icon: typeof data.icon === 'string' ? data.icon : null,
            color: (data.color as string | undefined) ?? 'blue',
            background: (data.background as TodoList['background'] | undefined) ?? 'field',
            backgroundImageUrl: typeof data.backgroundImageUrl === 'string' ? data.backgroundImageUrl : null,
            backgroundImagePath: typeof data.backgroundImagePath === 'string' ? data.backgroundImagePath : null,
            customBackgroundActive: Boolean(data.customBackgroundActive),
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
      trash: trashedItems.length,
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
  }, [allItems, trashedItems.length, todayStr]);

  const visibleItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      return allItems.filter(
        (i) =>
          (!mobileHideCompletedSearch || !i.done) &&
          (i.text.toLowerCase().includes(q) ||
            i.notes.toLowerCase().includes(q))
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
        return [];
      case 'all':
        return allItems;
      case 'completed':
        return allItems.filter((i) => i.done);
      case 'trash':
        return [];
      case 'tasks':
        return defaultTasksList
          ? allItems.filter((i) => i.listId === defaultTasksList.id)
          : [];
      default:
        return allItems;
    }
  }, [allItems, searchQuery, selection, todayStr, defaultTasksList, mobileHideCompletedSearch]);

  const sortedVisible = useMemo(() => {
    const arr = [...visibleItems];
    const dir = sortAsc ? 1 : -1;
    if (sortBy === 'position') {
      arr.sort((a, b) => getTaskSortOrder(a) - getTaskSortOrder(b));
    } else if (sortBy === 'importance') {
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

  const activeItems = sortedVisible.filter((i) => !i.done || sandExitingIds.has(i.id));
  const completedItems = sortedVisible.filter((i) => i.done && !sandExitingIds.has(i.id));
  const reorderListId =
    selection.type === 'list'
      ? selection.id
      : selection.id === 'tasks'
        ? defaultTasksList?.id ?? null
        : null;
  const canReorderItems =
    reorderListId !== null &&
    sortBy === 'position' &&
    !groupByCategory &&
    !searchQuery.trim() &&
    viewMode === 'list';

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

  const mainPaneRef = useRef<HTMLElement | null>(null);
  const flipOrderKey = `${currentViewKey}:${viewMode}:${showCompleted}:${activeItems.map((i) => i.id).join(',')}:${showCompleted ? completedItems.map((i) => i.id).join(',') : ''}`;
  useFlipList(mainPaneRef, flipOrderKey);

  const detailPresence = useAnimatedPresence(Boolean(selectedItem), 200);
  const renderedDetailItem = useRetainedValue(selectedItem, detailPresence.shouldRender);
  const suggestionsVisible = Boolean(
    !selectedItem &&
      suggestionsOpen &&
      selection.type === 'smart' &&
      selection.id === 'my-day' &&
      !searchQuery
  );
  const suggestionsPresence = useAnimatedPresence(suggestionsVisible, 200);
  const bulkPresence = useAnimatedPresence(selectedIds.size > 0, 180);
  const undoPresence = useAnimatedPresence(Boolean(undoToast), 180);
  const renderedUndoToast = useRetainedValue(undoToast, undoPresence.shouldRender);
  const clipboardVisible = Boolean(taskClipboard && taskClipboard.items.length > 0 && !undoToast);
  const clipboardPresence = useAnimatedPresence(clipboardVisible, 180);
  const renderedClipboard = useRetainedValue(
    taskClipboard && taskClipboard.items.length > 0 ? taskClipboard : null,
    clipboardPresence.shouldRender
  );
  const clipboardToastVisible = Boolean(clipboardToast && !taskClipboard && !undoToast);
  const clipboardToastPresence = useAnimatedPresence(clipboardToastVisible, 180);
  const renderedClipboardToast = useRetainedValue(clipboardToast, clipboardToastPresence.shouldRender);
  const listPickerPresence = useAnimatedPresence(Boolean(listPickerMenu), 180);
  const renderedListPicker = useRetainedValue(listPickerMenu, listPickerPresence.shouldRender);

  const allLists = useMemo(() => {
    const map = new Map<string, TodoList>();
    for (const l of lists) map.set(l.id, l);
    for (const l of sharedLists) map.set(l.id, l);
    return Array.from(map.values()).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [lists, sharedLists]);

  useEffect(() => {
    if (!user) {
      setSharedItemsByList({});
      return;
    }
    const sharedListIds = allLists
      .filter((l) => l.ownerUid !== user.uid || (l.memberUids && l.memberUids.length > 0))
      .map((l) => l.id);

    setSharedItemsByList((prev) => {
      const next: Record<string, TodoItem[]> = {};
      for (const id of sharedListIds) {
        if (prev[id]) next[id] = prev[id];
      }
      return next;
    });

    const unsubs = sharedListIds.map((listId) =>
      onSnapshot(
        collection(db, 'lists', listId, 'items'),
        (snap) => {
          const items = snap.docs.map((d) => mapItemDoc(d, user.uid));
          setSharedItemsByList((prev) => ({ ...prev, [listId]: items }));
        },
        (err) => setError(err.message)
      )
    );

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [user, allLists]);

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
        if (prev.size === 0 && selectedItemId) {
          next.add(selectedItemId);
        }
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
      setSelectedItemId(null);
      setLastSelectedId(item.id);
    } else if (e.shiftKey && lastSelectedId) {
      const pool = showCompleted ? [...activeItems, ...completedItems] : activeItems;
      const idxA = pool.findIndex((t) => t.id === lastSelectedId);
      const idxB = pool.findIndex((t) => t.id === item.id);
      if (idxA !== -1 && idxB !== -1) {
        const [start, end] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
        const rangeIds = pool.slice(start, end + 1).map((t) => t.id);
        setSelectedIds(new Set(rangeIds));
        setSelectedItemId(null);
      }
    } else {
      setSelectedIds(new Set());
      setSelectedItemId(item.id);
      setLastSelectedId(item.id);
    }
  };

  const handleToggleDone = (item: TodoItem) => {
    const nextDone = !item.done;
    if (nextDone) {
      setSandEnteringIds((s) => {
        if (!s.has(item.id)) return s;
        const copy = new Set(s);
        copy.delete(item.id);
        return copy;
      });
      setSandExitingIds((s) => {
        if (s.has(item.id)) return s;
        const copy = new Set(s);
        copy.add(item.id);
        return copy;
      });
    } else {
      setSandExitingIds((s) => {
        if (!s.has(item.id)) return s;
        const copy = new Set(s);
        copy.delete(item.id);
        return copy;
      });
      setSandEnteringIds((s) => {
        if (s.has(item.id)) return s;
        const copy = new Set(s);
        copy.add(item.id);
        return copy;
      });
    }
    handleUpdateItem(item, { done: nextDone, completedAtMs: nextDone ? Date.now() : null });
  };

  const handleToggleImportant = (item: TodoItem) => {
    handleUpdateItem(item, { important: !item.important });
  };

  const currentList = selection.type === 'list'
    ? allLists.find((l) => l.id === selection.id) ?? null
    : null;
  const handleListIconChange = async (icon: string | null) => {
    if (!user || !currentList || currentList.ownerUid !== user.uid) return;
    setError(null);
    try {
      await updateDoc(doc(db, 'lists', currentList.id), { icon });
      setEmojiPickerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update list icon');
    }
  };
  const handleUploadListBackground = async (file: File) => {
    if (!user || !currentList || currentList.ownerUid !== user.uid) return;
    if (!navigator.onLine) {
      setError('You are offline. Reconnect to upload a custom background.');
      return;
    }
    if (!isSupportedImageFile(file)) {
      setError('Choose an image file (JPG, PNG, WebP, HEIC, HEIF, AVIF, etc.).');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError('Background images must be 25 MB or smaller.');
      return;
    }

    setError(null);
    setBackgroundUploadInProgress(true);
    setBackgroundUploadStatus({
      stage: 'preparing',
      progress: 12,
      message: 'Preparing & compressing image…',
    });
    let backgroundStorage: ReturnType<typeof getFirebaseStorage> | null = null;
    let uploadedPath: string | null = null;
    let uploadCompleted = false;
    let listUpdated = false;
    try {
      const { blob, contentType } = await compressBackgroundImage(file);
      const sizeKb = Math.max(1, Math.round(blob.size / 1024));
      let backgroundImageUrl: string;
      let nextImagePath: string | null = null;

      try {
        backgroundStorage = getFirebaseStorage();
        uploadedPath = `list-backgrounds/${user.uid}/${currentList.id}/${crypto.randomUUID()}`;
        const imageRef = ref(backgroundStorage, uploadedPath);

        setBackgroundUploadStatus({
          stage: 'uploading',
          progress: 20,
          message: `Uploading (${sizeKb} KB)… 0%`,
        });

        await new Promise<void>((resolve, reject) => {
          const task = uploadBytesResumable(imageRef, blob, { contentType });
          let settled = false;
          const stallTimer = window.setTimeout(() => {
            if (!settled) {
              settled = true;
              task.cancel();
              reject(new Error('Storage upload timed out at 0%'));
            }
          }, 6000);

          task.on(
            'state_changed',
            (snapshot) => {
              if (snapshot.bytesTransferred > 0) {
                window.clearTimeout(stallTimer);
              }
              const ratio = snapshot.totalBytes > 0 ? snapshot.bytesTransferred / snapshot.totalBytes : 0;
              const pct = Math.round(ratio * 100);
              setBackgroundUploadStatus({
                stage: 'uploading',
                progress: Math.max(20, Math.min(92, 20 + Math.round(ratio * 72))),
                message: `Uploading (${sizeKb} KB)… ${pct}%`,
              });
            },
            (uploadErr) => {
              window.clearTimeout(stallTimer);
              if (!settled) {
                settled = true;
                reject(uploadErr);
              }
            },
            () => {
              window.clearTimeout(stallTimer);
              if (!settled) {
                settled = true;
                resolve();
              }
            }
          );
        });

        uploadCompleted = true;
        setBackgroundUploadStatus({
          stage: 'saving',
          progress: 96,
          message: 'Applying background…',
        });
        backgroundImageUrl = await getDownloadURL(imageRef);
        nextImagePath = uploadedPath;
      } catch {
        // Fallback when Firebase Storage isn't enabled/reachable: store compressed image directly in Firestore.
        setBackgroundUploadStatus({
          stage: 'saving',
          progress: 85,
          message: `Saving compressed image (${sizeKb} KB)…`,
        });
        const dataUrl = await blobToDataUrl(blob);
        if (dataUrl.length > 750_000) {
          throw new Error('Compressed image is too large to save without Firebase Storage.');
        }
        backgroundImageUrl = dataUrl;
        nextImagePath = null;
        uploadedPath = null;
        uploadCompleted = false;
      }

      await updateDoc(doc(db, 'lists', currentList.id), {
        backgroundImageUrl,
        backgroundImagePath: nextImagePath,
        customBackgroundActive: true,
      });
      listUpdated = true;

      if (currentList.backgroundImagePath && currentList.backgroundImagePath !== nextImagePath && backgroundStorage) {
        try {
          await deleteObject(ref(backgroundStorage, currentList.backgroundImagePath));
        } catch (cleanupErr) {
          setError(`Background updated, but the previous image could not be removed: ${cleanupErr instanceof Error ? cleanupErr.message : 'Unknown error'}`);
        }
      }
      setBackgroundUploadStatus({
        stage: 'done',
        progress: 100,
        message: `Background updated (${sizeKb} KB)`,
      });
      window.setTimeout(() => {
        setBackgroundUploadStatus((prev) => (prev?.stage === 'done' ? null : prev));
      }, 2600);
      setListMenuOpen(false);
    } catch (err) {
      let message = err instanceof Error ? err.message : 'Failed to upload background image';
      if (backgroundStorage && uploadedPath && uploadCompleted && !listUpdated) {
        try {
          await deleteObject(ref(backgroundStorage, uploadedPath));
        } catch (cleanupErr) {
          message += ` The uploaded file could not be cleaned up: ${cleanupErr instanceof Error ? cleanupErr.message : 'Unknown error'}`;
        }
      }
      setError(message);
      setBackgroundUploadStatus({
        stage: 'error',
        progress: 0,
        message,
      });
    } finally {
      setBackgroundUploadInProgress(false);
    }
  };
  const handleRemoveListBackground = async () => {
    if (!user || !currentList || currentList.ownerUid !== user.uid) return;
    setError(null);
    try {
      await updateDoc(doc(db, 'lists', currentList.id), {
        backgroundImageUrl: null,
        backgroundImagePath: null,
        customBackgroundActive: false,
      });
      setListMenuOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove uploaded background');
      return;
    }

    if (currentList.backgroundImagePath) {
      try {
        await deleteObject(ref(getFirebaseStorage(), currentList.backgroundImagePath));
      } catch (err) {
        setError(`Background removed, but the uploaded file could not be deleted: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
  };
  const currentTitle = searchQuery.trim()
    ? `Search: "${searchQuery.trim()}"`
    : selection.type === 'smart'
      ? SMART_TITLES[selection.id]
      : currentList?.title ?? 'List';
  const customBackgroundUrl = currentList?.customBackgroundActive
    ? currentList.backgroundImageUrl ?? null
    : null;
  const smartTheme = selection.type === 'smart'
    ? appSettings.smartThemes?.[selection.id]
    : undefined;
  const currentWallpaper = customBackgroundUrl
    ? 'custom'
    : selection.type === 'smart'
      ? smartTheme?.background ?? (selection.id === 'my-day' ? 'coast' : 'field')
      : currentList?.background ?? 'field';
  const sortOptions: { id: SortOption; label: string }[] = [
    { id: 'importance', label: 'Importance' },
    { id: 'dueDate', label: 'Due date' },
    ...(selection.type === 'list' ? [{ id: 'myDay' as SortOption, label: 'Added to My Day' }] : []),
    { id: 'alphabetical', label: 'Alphabetically' },
    { id: 'created', label: 'Creation date' },
  ];
  const handleSelectSortOption = (sort: SortOption) => {
    setSortBy(sort);
    setSortAsc(sort === 'importance' || sort === 'myDay' ? false : true);
    setSortMenuOpen(false);
    setListOptionsSortOpen(false);
    setListMenuOpen(false);
  };
  const renderSortMenuOptions = () => (
    <>
      <div className="sort-menu-header">Sort by</div>
      {sortOptions.map((option) => (
        <button
          key={option.id}
          type="button"
          role="menuitemradio"
          aria-checked={sortBy === option.id}
          className="sort-menu-item"
          onClick={() => handleSelectSortOption(option.id)}
        >
          <span className="sort-menu-icon">{getSortIcon(option.id)}</span>
          <span>{option.label}</span>
          {sortBy === option.id && <span className="sort-menu-check" aria-hidden="true">✓</span>}
        </button>
      ))}
    </>
  );

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
      ...(suggestEmoji(title) ? { icon: suggestEmoji(title)! } : {}),
      createdAt: serverTimestamp(),
    });
    setSelection({ type: 'list', id: ref.id });
  };

  const handleDeleteList = async (listId: string) => {
    if (!user) return;
    setError(null);
    try {
      const targetList = allLists.find((l) => l.id === listId);
      const listItems = allItems.filter((i) => i.listId === listId);
      await Promise.all(
        listItems.map((i) =>
          deleteDoc(doc(db, 'lists', listId, 'items', i.id))
        )
      );
      await deleteDoc(doc(db, 'lists', listId));
      if (targetList?.backgroundImagePath) {
        try {
          await deleteObject(ref(getFirebaseStorage(), targetList.backgroundImagePath));
        } catch {
          // Best-effort cleanup of deleted list's Storage background
        }
      }
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

  const handleMoveTasksToList = async (taskIds: string[], targetListId: string) => {
    const idSet = new Set(taskIds);
    const itemsToMove = allItems.filter((item) => idSet.has(item.id) && item.listId !== targetListId);
    if (itemsToMove.length === 0) return;
    await Promise.all(itemsToMove.map((item) => handleMoveToList(item, targetListId)));
    setSelectedIds(new Set());
  };

  const handleMoveListToGroup = async (listId: string, groupId: string | null) => {
    if (!user) return;
    const list = allLists.find((candidate) => candidate.id === listId);
    if (!list || list.ownerUid !== user.uid || list.isDefaultTasksList) return;
    const siblings = allLists
      .filter((candidate) =>
        candidate.ownerUid === user.uid &&
        !candidate.isDefaultTasksList &&
        candidate.id !== listId &&
        (candidate.groupId ?? null) === groupId
      )
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const sourceSiblings = (list.groupId ?? null) === groupId
      ? []
      : allLists
          .filter((candidate) =>
            candidate.ownerUid === user.uid &&
            !candidate.isDefaultTasksList &&
            candidate.id !== listId &&
            (candidate.groupId ?? null) === (list.groupId ?? null)
          )
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const nextSortOrder = Math.max(0, ...siblings.map((sibling) => sibling.sortOrder ?? 0)) + 1;
    const batch = writeBatch(db);
    sourceSiblings.forEach((sibling, index) => {
      batch.update(doc(db, 'lists', sibling.id), { sortOrder: index + 1 });
    });
    batch.update(doc(db, 'lists', listId), {
      groupId,
      sortOrder: nextSortOrder,
    });
    try {
      await batch.commit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move list');
    }
  };

  const handleReorderList = async (
    listId: string,
    targetListId: string,
    insertBefore: boolean
  ) => {
    if (!user || listId === targetListId) return;
    const draggedList = allLists.find((candidate) => candidate.id === listId);
    const targetList = allLists.find((candidate) => candidate.id === targetListId);
    if (
      !draggedList ||
      !targetList ||
      draggedList.ownerUid !== user.uid ||
      targetList.ownerUid !== user.uid ||
      draggedList.isDefaultTasksList ||
      targetList.isDefaultTasksList
    ) return;

    const targetGroupId = targetList.groupId ?? null;
    const targetSiblings = allLists
      .filter((candidate) =>
        candidate.ownerUid === user.uid &&
        !candidate.isDefaultTasksList &&
        candidate.id !== draggedList.id &&
        (candidate.groupId ?? null) === targetGroupId
      )
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const targetIndex = targetSiblings.findIndex((candidate) => candidate.id === targetListId);
    if (targetIndex < 0) return;
    targetSiblings.splice(targetIndex + (insertBefore ? 0 : 1), 0, {
      ...draggedList,
      groupId: targetGroupId,
    });

    const sourceGroupId = draggedList.groupId ?? null;
    const sourceSiblings = sourceGroupId === targetGroupId
      ? []
      : allLists
          .filter((candidate) =>
            candidate.ownerUid === user.uid &&
            !candidate.isDefaultTasksList &&
            candidate.id !== draggedList.id &&
            (candidate.groupId ?? null) === sourceGroupId
          )
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const batch = writeBatch(db);
    sourceSiblings.forEach((sibling, index) => {
      batch.update(doc(db, 'lists', sibling.id), { sortOrder: index + 1 });
    });
    targetSiblings.forEach((sibling, index) => {
      batch.update(doc(db, 'lists', sibling.id), {
        sortOrder: index + 1,
        ...(sibling.id === draggedList.id ? { groupId: targetGroupId } : {}),
      });
    });
    try {
      await batch.commit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder lists');
    }
  };

  const handleMoveListStep = async (listId: string, delta: -1 | 1) => {
    if (!user) return;
    const list = allLists.find((candidate) => candidate.id === listId);
    if (!list || list.ownerUid !== user.uid) return;
    const targetGroupId = list.groupId ?? null;
    const siblings = allLists
      .filter((candidate) =>
        candidate.ownerUid === user.uid &&
        !candidate.isDefaultTasksList &&
        candidate.id !== defaultTasksList?.id &&
        (candidate.groupId ?? null) === targetGroupId
      )
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const index = siblings.findIndex((candidate) => candidate.id === listId);
    const swapIndex = index + delta;
    if (index < 0 || swapIndex < 0 || swapIndex >= siblings.length) return;
    const reordered = [...siblings];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(swapIndex, 0, moved);
    const batch = writeBatch(db);
    reordered.forEach((sibling, idx) => {
      batch.update(doc(db, 'lists', sibling.id), { sortOrder: idx + 1 });
    });
    await batch.commit();
  };

  const handleMoveListUp = (listId: string) => handleMoveListStep(listId, -1);

  const handleMoveListDown = (listId: string) => handleMoveListStep(listId, 1);

  const isSharedList = (listId: string) => {
    const list = allLists.find((l) => l.id === listId);
    return Boolean(
      list &&
        ((list.memberUids?.length ?? 0) > 0 || (user && list.ownerUid !== user.uid))
    );
  };

  const handleAddItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !newItemText.trim()) return;
    setError(null);
    try {
      const targetListId = await ensureDefaultList();
      const parsed = smartParseEnabled ? parseTaskInput(newItemText) : null;
      const addedText = parsed?.hasMatch ? parsed.title : newItemText.trim();
      const resolvedDueDate =
        addDueDate ??
        parsed?.dueDate ??
        (selection.type === 'smart' && selection.id === 'planned' ? todayStr : null);
      const resolvedReminderAtMs = addReminderAtMs ?? parsed?.reminderAtMs ?? null;
      const resolvedRepeat = addRepeat !== 'none' ? addRepeat : (parsed?.repeat ?? 'none');
      const addedRef = await addDoc(collection(db, 'lists', targetListId, 'items'), {
        listId: targetListId,
        ownerUid: user.uid,
        createdByName: user.displayName?.trim() || user.email?.trim() || null,
        text: addedText,
        done: false,
        important: selection.type === 'smart' && selection.id === 'important',
        myDayDate:
          selection.type === 'smart' && selection.id === 'my-day'
            ? todayStr
            : null,
        dueDate: resolvedDueDate,
        reminderAtMs: resolvedReminderAtMs,
        reminderNotified: false,
        repeat: resolvedRepeat,
        notes: '',
        category: null,
        steps: [],
        createdAtMs: Date.now(),
        completedAtMs: null,
      });
      setNewItemText('');
      setSmartParseEnabled(true);
      setDuplicateDismissed(false);
      setAddDueDate(null);
      setAddReminderAtMs(null);
      setAddRepeat('none');
      pushUndo({
        label: `add "${addedText}"`,
        undo: async () => {
          await deleteDoc(doc(db, 'lists', targetListId, 'items', addedRef.id));
        },
      });
      if (isSharedList(targetListId)) {
        void notifyListCollaborators({
          listId: targetListId,
          itemId: addedRef.id,
          action: 'added',
          text: addedText,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add task');
    }
  };

  const handleUpdateItem = async (
    item: TodoItem,
    patch: Partial<TodoItem>,
    options?: { skipUndo?: boolean }
  ) => {
    const prevPatch: Partial<TodoItem> = {};
    for (const key of Object.keys(patch) as (keyof TodoItem)[]) {
      (prevPatch as Record<string, unknown>)[key] = item[key] ?? null;
    }
    const extraReminderReset =
      patch.reminderAtMs !== undefined && patch.reminderNotified === undefined
        ? { reminderNotified: false }
        : {};
    await updateDoc(doc(db, 'lists', item.listId, 'items', item.id), {
      ...patch,
      ...extraReminderReset,
      updatedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
      updatedByUid: user?.uid ?? item.ownerUid,
      updatedByName: user?.displayName?.trim() || user?.email?.trim() || null,
    });
    if (!options?.skipUndo) {
      pushUndo({
        label: `update "${item.text}"`,
        undo: () => handleUpdateItem(item, prevPatch, { skipUndo: true }),
      });
    }
    if (patch.done !== undefined && isSharedList(item.listId)) {
      void notifyListCollaborators({
        listId: item.listId,
        itemId: item.id,
        action: patch.done ? 'completed' : 'reopened',
        text: item.text,
      });
    }
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

  const handleReorderItems = async (
    draggedItemId: string,
    targetItemId: string,
    insertAfter: boolean
  ) => {
    const listId =
      selection.type === 'list'
        ? selection.id
        : selection.id === 'tasks'
          ? defaultTasksList?.id ?? null
          : null;
    if (
      !user ||
      !listId ||
      sortBy !== 'position' ||
      groupByCategory ||
      searchQuery.trim() ||
      viewMode !== 'list'
    ) return;

    const orderedItems = allItems
      .filter((item) => item.listId === listId)
      .sort((a, b) => getTaskSortOrder(a) - getTaskSortOrder(b));
    const draggedIndex = orderedItems.findIndex((item) => item.id === draggedItemId);
    const target = orderedItems.find((item) => item.id === targetItemId);
    if (draggedIndex < 0 || !target) return;
    const draggedOrigin = orderedItems[draggedIndex];
    const crossingDoneState = draggedOrigin.done !== target.done;

    if (selectedIds.has(draggedItemId) && selectedIds.size > 1) {
      if (selectedIds.has(targetItemId)) return;
      const movingItems = orderedItems.filter(
        (item) => selectedIds.has(item.id) && item.done === draggedOrigin.done
      );
      if (movingItems.length === 0) return;
      const movingSet = new Set(movingItems.map((item) => item.id));
      const previousOrder = orderedItems.map((item) => item.id);
      const remaining = orderedItems.filter((item) => !movingSet.has(item.id));
      const targetIndex = remaining.findIndex((item) => item.id === targetItemId);
      if (targetIndex < 0) return;
      remaining.splice(targetIndex + (insertAfter ? 1 : 0), 0, ...movingItems);
      if (!crossingDoneState && remaining.every((item, index) => item.id === previousOrder[index])) return;

      const modifiedFields = {
        ...(crossingDoneState
          ? { done: target.done, completedAtMs: target.done ? Date.now() : null }
          : {}),
        updatedAtMs: Date.now(),
        updatedAt: serverTimestamp(),
        updatedByUid: user.uid,
        updatedByName: user.displayName?.trim() || null,
      };
      setError(null);
      try {
        for (let start = 0; start < remaining.length; start += 450) {
          const batch = writeBatch(db);
          remaining.slice(start, start + 450).forEach((item, offset) => {
            const fields = { sortOrder: (start + offset) * 1024 };
            batch.update(
              doc(db, 'lists', item.listId, 'items', item.id),
              movingSet.has(item.id) ? { ...fields, ...modifiedFields } : fields
            );
          });
          await batch.commit();
        }
        if (crossingDoneState && target.done && soundEnabled) {
          playCompleteSound();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reorder tasks');
      }
      return;
    }

    const previousOrder = orderedItems.map((item) => item.id);
    const [draggedItem] = orderedItems.splice(draggedIndex, 1);
    const targetIndex = orderedItems.findIndex((item) => item.id === targetItemId);
    const insertionIndex = targetIndex + (insertAfter ? 1 : 0);
    orderedItems.splice(insertionIndex, 0, draggedItem);
    if (!crossingDoneState && orderedItems.every((item, index) => item.id === previousOrder[index])) return;

    if (crossingDoneState) {
      await handleUpdateItem(draggedItem, {
        done: target.done,
        completedAtMs: target.done ? Date.now() : null,
      });
    }

    const previous = orderedItems[insertionIndex - 1];
    const next = orderedItems[insertionIndex + 1];
    const previousSortOrder = previous ? getTaskSortOrder(previous) : null;
    const nextSortOrder = next ? getTaskSortOrder(next) : null;
    const needsReindex =
      previousSortOrder !== null &&
      nextSortOrder !== null &&
      nextSortOrder - previousSortOrder <= 1;
    const sortOrder = needsReindex
      ? null
      : previousSortOrder === null
        ? (nextSortOrder ?? 0) - 1024
        : nextSortOrder === null
          ? previousSortOrder + 1024
          : previousSortOrder + (nextSortOrder - previousSortOrder) / 2;
    const modifiedFields = {
      updatedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
      updatedByUid: user.uid,
      updatedByName: user.displayName?.trim() || null,
    };

    setError(null);
    try {
      if (needsReindex) {
        for (let start = 0; start < orderedItems.length; start += 450) {
          const batch = writeBatch(db);
          orderedItems.slice(start, start + 450).forEach((item, offset) => {
            const fields = { sortOrder: (start + offset) * 1024 };
            batch.update(
              doc(db, 'lists', item.listId, 'items', item.id),
              item.id === draggedItemId ? { ...fields, ...modifiedFields } : fields
            );
          });
          await batch.commit();
        }
      } else {
        await updateDoc(
          doc(db, 'lists', draggedItem.listId, 'items', draggedItem.id),
          { sortOrder, ...modifiedFields }
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder tasks');
    }
  };

  const handleMoveToList = async (
    item: TodoItem,
    targetListId: string,
    options?: { skipUndo?: boolean }
  ): Promise<string | void> => {
    if (!user || targetListId === item.listId) return;
    const prevListId = item.listId;
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
      updatedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
      updatedByUid: user.uid,
      updatedByName: user.displayName?.trim() || null,
      completedAtMs: item.completedAtMs ?? null,
    });
    await deleteDoc(doc(db, 'lists', prevListId, 'items', item.id));
    setSelectedItemId(ref.id);
    if (!options?.skipUndo) {
      pushUndo({
        label: `move "${item.text}"`,
        undo: async () => {
          await handleMoveToList({ ...item, id: ref.id, listId: targetListId }, prevListId, { skipUndo: true });
        },
      });
    }
    return ref.id;
  };

  const handleCopyItemToList = async (
    item: TodoItem,
    targetListId: string,
    extraPatch?: Partial<TodoItem>,
    options?: { skipUndo?: boolean }
  ): Promise<string | void> => {
    if (!user) return;
    const isSame = targetListId === item.listId;
    const addedRef = await addDoc(collection(db, 'lists', targetListId, 'items'), {
      listId: targetListId,
      ownerUid: user.uid,
      text: isSame ? `${item.text} (copy)` : item.text,
      done: false,
      important: extraPatch?.important ?? false,
      myDayDate: extraPatch?.myDayDate ?? null,
      dueDate: item.dueDate ?? null,
      notes: item.notes ?? '',
      category: item.category ?? null,
      steps: (item.steps ?? []).map((st) => ({ ...st, done: false })),
      createdAtMs: Date.now(),
      completedAtMs: null,
    });
    if (!options?.skipUndo) {
      pushUndo({
        label: `copy "${item.text}"`,
        undo: async () => {
          await deleteDoc(doc(db, 'lists', targetListId, 'items', addedRef.id));
        },
      });
    }
    return addedRef.id;
  };

  const clipboardItemIds = useMemo(
    () => new Set(taskClipboard?.items.map((t) => t.id) ?? []),
    [taskClipboard]
  );
  const getClipboardState = (id: string): 'copy' | 'cut' | null =>
    taskClipboard && clipboardItemIds.has(id) ? taskClipboard.mode : null;

  const handlePasteClipboard = async () => {
    if (!taskClipboard || taskClipboard.items.length === 0) return;
    const targetListId =
      selection.type === 'list'
        ? selection.id
        : defaultTasksList?.id ?? allLists[0]?.id ?? null;
    if (!targetListId) return;
    const extraPatch: Partial<TodoItem> | undefined =
      selection.type === 'smart' && selection.id === 'my-day'
        ? { myDayDate: todayStr }
        : selection.type === 'smart' && selection.id === 'important'
          ? { important: true }
          : undefined;
    if (taskClipboard.mode === 'copy') {
      await Promise.all(
        taskClipboard.items.map((item) => handleCopyItemToList(item, targetListId, extraPatch))
      );
      showClipboardToast(`Pasted ${taskClipboard.items.length} task${taskClipboard.items.length > 1 ? 's' : ''}`);
    } else {
      await Promise.all(
        taskClipboard.items.map(async (item) => {
          if (item.listId !== targetListId) {
            await handleMoveToList(item, targetListId);
          }
          if (extraPatch) {
            await handleUpdateItem(item, extraPatch);
          }
        })
      );
      const count = taskClipboard.items.length;
      setTaskClipboard(null);
      setSelectedIds(new Set());
      showClipboardToast(`Moved ${count} task${count > 1 ? 's' : ''}`);
    }
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
          sortOrder: i.sortOrder ?? -i.createdAtMs,
          createdAtMs: Date.now(),
          completedAtMs: i.completedAtMs ?? null,
        })
      )
    );
    setSelection({ type: 'list', id: newRef.id });
  };

  const handleDeleteItem = async (
    item: TodoItem,
    options?: { skipUndo?: boolean }
  ) => {
    setError(null);
    try {
      await updateDoc(doc(db, 'lists', item.listId, 'items', item.id), {
        deletedAtMs: Date.now(),
        deletedByUid: user?.uid ?? item.ownerUid,
        deletedByName: user?.displayName?.trim() || user?.email?.trim() || null,
      });
      if (selectedItemId === item.id) {
        setSelectedItemId(null);
      }
      if (!options?.skipUndo) {
        pushUndo({
          label: `delete "${item.text}"`,
          undo: () => handleRestoreItem(item),
        });
      }
      if (undoToast) window.clearTimeout(undoToast.timerId);
      const timerId = window.setTimeout(() => setUndoToast(null), 5000);
      setUndoToast({ item, timerId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move task to trash');
    }
  };

  const handleUndo = async () => {
    const stack = undoStackRef.current;
    if (stack.length === 0 || !user) return;
    const entry = stack[stack.length - 1];
    undoStackRef.current = stack.slice(0, -1);
    if (undoToast) {
      window.clearTimeout(undoToast.timerId);
      setUndoToast(null);
    }
    isUndoingRef.current = true;
    try {
      await entry.undo();
      showClipboardToast(`Undid: ${entry.label}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo');
    } finally {
      isUndoingRef.current = false;
    }
  };

  const handleUndoDelete = async () => {
    if (!undoToast || !user) return;
    window.clearTimeout(undoToast.timerId);
    const { item } = undoToast;
    setUndoToast(null);
    if (undoStackRef.current.length > 0) {
      await handleUndo();
    } else {
      await handleRestoreItem(item);
    }
  };

  const handleRestoreItem = async (item: TodoItem) => {
    setError(null);
    try {
      await updateDoc(doc(db, 'lists', item.listId, 'items', item.id), {
        deletedAtMs: null,
        deletedByUid: null,
        deletedByName: null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore task');
    }
  };

  const handlePermanentDeleteItem = async (item: TodoItem) => {
    setError(null);
    try {
      await deleteDoc(doc(db, 'lists', item.listId, 'items', item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to permanently delete task');
    }
  };

  const handleEmptyTrash = async () => {
    if (trashedItems.length === 0) return;
    const ok = await appConfirm({
      title: 'Empty Trash',
      message: `Permanently delete all ${trashedItems.length} item(s) in Trash? This cannot be undone.`,
      confirmLabel: 'Empty trash',
      danger: true,
    });
    if (!ok) {
      return;
    }
    setError(null);
    try {
      await Promise.all(
        trashedItems.map((item) => deleteDoc(doc(db, 'lists', item.listId, 'items', item.id)))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to empty trash');
    }
  };

  const handleCreateGroup = async (title: string) => {
    if (!user) return;
    await addDoc(collection(db, 'groups'), {
      title,
      ownerUid: user.uid,
      collapsed: false,
      sortOrder: Math.max(Date.now(), ...groups.map((group) => (group.sortOrder ?? 0) + 1)),
      createdAt: serverTimestamp(),
    });
  };

  const handleReorderGroup = async (
    groupId: string,
    targetGroupId: string,
    insertBefore: boolean
  ) => {
    if (!user || groupId === targetGroupId) return;
    const orderedGroups = [...groups].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const draggedGroup = orderedGroups.find((group) => group.id === groupId);
    const targetGroup = orderedGroups.find((group) => group.id === targetGroupId);
    const targetIndex = orderedGroups.findIndex((group) => group.id === targetGroupId);
    if (
      !draggedGroup ||
      draggedGroup.ownerUid !== user.uid ||
      !targetGroup ||
      targetGroup.ownerUid !== user.uid ||
      targetIndex < 0
    ) return;
    const nextGroups = orderedGroups.filter((group) => group.id !== groupId);
    const adjustedTargetIndex = nextGroups.findIndex((group) => group.id === targetGroupId);
    nextGroups.splice(adjustedTargetIndex + (insertBefore ? 0 : 1), 0, draggedGroup);
    const batch = writeBatch(db);
    nextGroups.forEach((group, index) => {
      batch.update(doc(db, 'groups', group.id), { sortOrder: index + 1 });
    });
    try {
      await batch.commit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder folders');
    }
  };

  const handleToggleGroup = async (group: TodoGroup) => {
    await updateDoc(doc(db, 'groups', group.id), {
      collapsed: !group.collapsed,
    });
  };

  const handleUpdateGroupIcon = async (groupId: string, icon: string | null) => {
    if (!user) return;
    setError(null);
    try {
      await updateDoc(doc(db, 'groups', groupId), { icon });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update folder icon');
    }
  };

  const handleImportJson = async (
    file: File
  ): Promise<{ lists: number; items: number; groups: number }> => {
    if (!user) throw new Error('Sign in to import a backup.');
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        groups?: Array<Partial<TodoGroup> & { id?: string }>;
        lists?: Array<Partial<TodoList> & { id?: string }>;
        items?: Array<Partial<TodoItem>>;
        settings?: Partial<AppSettings>;
      };
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        (!Array.isArray(parsed.lists) &&
          !Array.isArray(parsed.items) &&
          !Array.isArray(parsed.groups) &&
          !parsed.settings)
      ) {
        throw new Error('Invalid backup file format.');
      }

      const groupIdMap = new Map<string, string>();
      let importedGroups = 0;
      for (const g of parsed.groups ?? []) {
        const ref = await addDoc(collection(db, 'groups'), {
          title: g.title || 'Imported Group',
          ownerUid: user.uid,
          collapsed: Boolean(g.collapsed),
          sortOrder: typeof g.sortOrder === 'number' ? g.sortOrder : Date.now(),
          createdAt: serverTimestamp(),
          ...(g.icon ? { icon: g.icon } : {}),
        });
        if (g.id) groupIdMap.set(g.id, ref.id);
        importedGroups += 1;
      }

      const idMap = new Map<string, string>();
      let importedLists = 0;
      for (const l of parsed.lists ?? []) {
        const mappedGroupId =
          l.groupId && groupIdMap.has(l.groupId) ? groupIdMap.get(l.groupId)! : null;
        const ref = await addDoc(collection(db, 'lists'), {
          title: l.title || 'Imported List',
          ownerUid: user.uid,
          createdAt: serverTimestamp(),
          ...(l.icon ? { icon: l.icon } : {}),
          ...(l.color ? { color: l.color } : {}),
          ...(l.background ? { background: l.background } : {}),
          ...(typeof l.sortOrder === 'number' ? { sortOrder: l.sortOrder } : {}),
          ...(mappedGroupId ? { groupId: mappedGroupId } : {}),
        });
        if (l.id) idMap.set(l.id, ref.id);
        importedLists += 1;
      }

      let importedItems = 0;
      const itemsToImport = parsed.items ?? [];
      if (itemsToImport.length > 0) {
        const fallbackListId = await ensureDefaultList();
        for (const item of itemsToImport) {
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
            reminderAtMs: item.reminderAtMs ?? null,
            repeat: item.repeat ?? 'none',
            category: item.category ?? null,
            notes: item.notes ?? '',
            steps: Array.isArray(item.steps) ? item.steps : [],
            attachments: Array.isArray(item.attachments) ? item.attachments : [],
            sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : Date.now(),
            createdAtMs: item.createdAtMs ?? Date.now(),
            completedAtMs: item.completedAtMs ?? null,
            deletedAtMs: item.deletedAtMs ?? null,
          });
          importedItems += 1;
        }
      }

      if (parsed.settings && typeof parsed.settings === 'object') {
        updateAppSettings(parsed.settings);
      }

      return { lists: importedLists, items: importedItems, groups: importedGroups };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to import JSON';
      setError(msg);
      throw new Error(msg);
    }
  };

  const handleExportJson = () => {
    const payload = {
      version: '0.1.0',
      exportedAt: new Date().toISOString(),
      account: user
        ? {
            uid: user.uid,
            displayName: user.displayName ?? null,
            email: user.email ?? null,
          }
        : null,
      settings: appSettings,
      uiState: {
        completedExpandedByView,
        collapsedLists,
        printOptions,
      },
      groups,
      lists: allLists,
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

  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandlerRef.current = (e: KeyboardEvent) => {
    if (!user) return;
    const target = e.target as HTMLElement | null;
    const isInput = Boolean(
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    );
    const isInteractiveElement = Boolean(
      target && target.closest('button:not(.task-body), a, input, textarea, select, [role="menuitem"]')
    );
    const mod = e.ctrlKey || e.metaKey;
    const lowerKey = e.key.toLowerCase();

    // Always handle Escape
    if (e.key === 'Escape') {
      if (listOptionsSortOpen) {
        setListOptionsSortOpen(false);
        setListOptionsSortPosition(null);
        return;
      }
      const hasOpenMenu = Boolean(
        contextMenu || sortMenuOpen || groupMenuOpen || listMenuOpen || listOptionsSortOpen ||
        addDueMenuOpen || addRemindMenuOpen || addRepeatMenuOpen ||
        addDueCalendarOpen || addRemindCalendarOpen || settingsOpen ||
        shareListId || shortcutsOpen || whatsNewOpen || sidebarOpen || emojiPickerOpen ||
        bulkMoveOpen || listPickerMenu || suggestionsOpen || mobileAddOpen ||
        document.querySelector('.context-menu, .sort-menu, .list-options-menu, .list-options-sort-submenu, .settings-backdrop, .modal-backdrop, .add-picker-wrap .top-bar-popover')
      );
      setContextMenu(null);
      setSortMenuOpen(false);
      setGroupMenuOpen(false);
      setListMenuOpen(false);
      setListOptionsSortOpen(false);
      setListOptionsSortPosition(null);
      setAddDueMenuOpen(false);
      setAddRemindMenuOpen(false);
      setAddRepeatMenuOpen(false);
      setAddDueCalendarOpen(false);
      setAddRemindCalendarOpen(false);
      setSettingsOpen(false);
      setWhatsNewOpen(false);
      setShareListId(null);
      setPrintListId(null);
      setShortcutsOpen(false);
      setSidebarOpen(false);
      setEmojiPickerOpen(false);
      setBulkMoveOpen(false);
      setListPickerMenu(null);
      setSuggestionsOpen(false);
      setMobileAddOpen(false);
      if (hasOpenMenu) return;
      if (isInput && target) {
        (target as HTMLElement).blur();
        return;
      }
      if (selectedIds.size > 0) {
        setSelectedIds(new Set());
        return;
      }
      if (selectedItemId) {
        setSelectedItemId(null);
        return;
      }
      if (searchQuery) {
        setSearchQuery('');
      }
      return;
    }

    // If a modal dialog (confirm/prompt/settings/share/whatsNew/shortcuts/listPicker) is open, restrict globals
    const hasBlockingModal = Boolean(
      settingsOpen || shareListId || printListId || whatsNewOpen || listPickerMenu ||
      document.querySelector('.app-dialog-backdrop')
    );
    if (hasBlockingModal) return;

    const isEmptyAddInput = Boolean(
      target && target === addTaskInputRef.current && !addTaskInputRef.current?.value
    );

    const sourcePool =
      selection.type === 'smart' && selection.id === 'trash' ? trashedItems : allItems;
    const targetTasks = selectedIds.size > 0
      ? sourcePool.filter((t) => selectedIds.has(t.id))
      : selectedItem
        ? [selectedItem]
        : [];

    // Shortcuts modal toggle: ? (when not typing) or Ctrl/Cmd + /
    if ((e.key === '?' && !isInput && !mod) || (mod && e.key === '/')) {
      e.preventDefault();
      setShortcutsOpen((v) => !v);
      return;
    }

    if (shortcutsOpen) return;

    // Global modifier shortcuts (work even when focused inside inputs)
    if (mod && !e.altKey) {
      if (e.key === '1' || (lowerKey === 'b' && !e.shiftKey)) {
        e.preventDefault();
        if (window.innerWidth <= 900) {
          setSidebarOpen((v) => !v);
        } else {
          setSidebarCollapsed((v) => !v);
        }
        return;
      }
      if (lowerKey === 'f' && !e.shiftKey) {
        e.preventDefault();
        if (window.innerWidth <= 900) {
          setMobileView('search');
          setMobileAddOpen(false);
          setTimeout(() => mobileSearchInputRef.current?.focus(), 60);
        } else {
          setSidebarCollapsed(false);
          setTimeout(() => {
            const el = document.querySelector<HTMLInputElement>('.sidebar-search .search-input');
            el?.focus();
            el?.select();
          }, 60);
        }
        return;
      }
      if (lowerKey === 'n' && !e.shiftKey) {
        e.preventDefault();
        if (window.innerWidth <= 900) {
          setMobileView('list');
          setMobileAddOpen(true);
          setTimeout(() => mobileAddInputRef.current?.focus(), 60);
        } else {
          setAddRowExpanded(true);
          setTimeout(() => addTaskInputRef.current?.focus(), 40);
        }
        return;
      }
      if (e.key === ',' && !e.shiftKey) {
        e.preventDefault();
        setSettingsOpen(true);
        return;
      }
      if (e.shiftKey && lowerKey === 'd') {
        e.preventDefault();
        const nextDark = !darkMode;
        updateAppSettings({ themeMode: nextDark ? 'dark' : 'light', themeModeExplicit: true });
        return;
      }
      if (e.shiftKey && lowerKey === 'l') {
        e.preventDefault();
        setSidebarCollapsed(false);
        if (window.innerWidth <= 900) setSidebarOpen(true);
        setTimeout(() => {
          document.querySelector<HTMLInputElement>('[data-new-list-input="true"]')?.focus();
        }, 80);
        return;
      }
      if (e.shiftKey && lowerKey === 'c') {
        e.preventDefault();
        setCompletedExpandedByView((prev) => ({ ...prev, [currentViewKey]: !prev[currentViewKey] }));
        return;
      }
      if (lowerKey === 'z' && !e.shiftKey && (!isInput || isEmptyAddInput) && undoStackRef.current.length > 0) {
        e.preventDefault();
        void handleUndo();
        return;
      }
      if (lowerKey === 'a' && !e.shiftKey && (!isInput || isEmptyAddInput)) {
        e.preventDefault();
        if (activeItems.length > 0) {
          setSelectedIds(new Set(activeItems.map((t) => t.id)));
          setLastSelectedId(activeItems[activeItems.length - 1].id);
        }
        return;
      }
      if (lowerKey === 't' && !e.shiftKey) {
        if (targetTasks.length > 0) {
          e.preventDefault();
          const allInMyDay = targetTasks.every((t) => t.myDayDate === todayStr);
          targetTasks.forEach((t) => handleUpdateItem(t, { myDayDate: allInMyDay ? null : todayStr }));
          return;
        }
      }
      const inDetailPane = Boolean(target?.closest('.detail-pane'));
      if (lowerKey === 'm' && !e.shiftKey && (!isInput || isEmptyAddInput || inDetailPane) && targetTasks.length > 0) {
        e.preventDefault();
        targetTasks.forEach((t) => {
          if (!t.done) handleUpdateItem(t, { done: true, completedAtMs: Date.now() });
        });
        return;
      }
      if (lowerKey === 'u' && !e.shiftKey && (!isInput || isEmptyAddInput || inDetailPane) && targetTasks.length > 0) {
        e.preventDefault();
        targetTasks.forEach((t) => {
          if (t.done) handleUpdateItem(t, { done: false, completedAtMs: null });
        });
        return;
      }
      const hasInputSelection =
        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
          ? (target.selectionStart ?? 0) !== (target.selectionEnd ?? 0)
          : false;
      const hasTextSelection = Boolean(window.getSelection()?.toString().trim()) || hasInputSelection;
      const canCopyOrCutTask =
        (!isInput || isEmptyAddInput || Boolean(target?.closest('.detail-pane'))) &&
        !hasTextSelection &&
        targetTasks.length > 0;
      if (lowerKey === 'c' && !e.shiftKey && canCopyOrCutTask) {
        e.preventDefault();
        setTaskClipboard({ mode: 'copy', items: targetTasks });
        showClipboardToast(`Copied ${targetTasks.length} task${targetTasks.length > 1 ? 's' : ''}`);
        return;
      }
      if (lowerKey === 'x' && !e.shiftKey && canCopyOrCutTask) {
        e.preventDefault();
        setTaskClipboard({ mode: 'cut', items: targetTasks });
        showClipboardToast(`Cut ${targetTasks.length} task${targetTasks.length > 1 ? 's' : ''} — press Ctrl+V in a list to move`);
        return;
      }
      const isEmptyDetailStepInput = Boolean(
        inDetailPane && target instanceof HTMLInputElement && !target.value
      );
      if (lowerKey === 'v' && !e.shiftKey && (!isInput || isEmptyAddInput || isEmptyDetailStepInput) && taskClipboard && taskClipboard.items.length > 0) {
        e.preventDefault();
        void handlePasteClipboard();
        return;
      }
    }

    // Alt + 1..8 smart list switching (works anywhere)
    const smartOrder: SmartListId[] = [
      'my-day',
      'important',
      'planned',
      'all',
      'completed',
      'assigned-to-me',
      'tasks',
      'trash',
    ];
    if (e.altKey && !mod && !e.shiftKey && /^[1-8]$/.test(e.key)) {
      e.preventDefault();
      const id = smartOrder[Number(e.key) - 1];
      if (id) {
        setSearchQuery('');
        setSelection({ type: 'smart', id });
        setMobileView('list');
      }
      return;
    }

    // Reorder selected task with Alt+ArrowUp/Down or Ctrl/Cmd+Shift+ArrowUp/Down
    if (
      ((e.altKey && !mod) || (mod && e.shiftKey)) &&
      (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
      !isInput
    ) {
      if (canReorderItems && selectedItem && !selectedItem.done) {
        const idx = activeItems.findIndex((t) => t.id === selectedItem.id);
        if (idx !== -1) {
          if (e.key === 'ArrowUp' && idx > 0) {
            e.preventDefault();
            void handleReorderItems(selectedItem.id, activeItems[idx - 1].id, false);
          } else if (e.key === 'ArrowDown' && idx < activeItems.length - 1) {
            e.preventDefault();
            void handleReorderItems(selectedItem.id, activeItems[idx + 1].id, true);
          }
        }
      }
      return;
    }

    // Everything below only runs when NOT typing in an input/textarea/select
    if (isInput || mod || e.altKey) return;

    // Number keys 1..8 switch smart lists
    if (/^[1-8]$/.test(e.key) && !e.shiftKey) {
      e.preventDefault();
      const id = smartOrder[Number(e.key) - 1];
      if (id) {
        setSearchQuery('');
        setSelection({ type: 'smart', id });
        setMobileView('list');
      }
      return;
    }

    // [ and ] to cycle through lists
    if (e.key === '[' || e.key === ']') {
      e.preventDefault();
      const navEntries: ViewSelection[] = [
        ...smartOrder
          .filter((id) => {
            if (id === 'important' && !appSettings.smartImportant) return false;
            if (id === 'planned' && !appSettings.smartPlanned) return false;
            if (id === 'all' && !appSettings.smartAll) return false;
            if (id === 'completed' && !appSettings.smartCompleted) return false;
            if (id === 'assigned-to-me' && !appSettings.smartAssignedToMe) return false;
            return true;
          })
          .map((id) => ({ type: 'smart' as const, id })),
        ...allLists.filter((l) => !l.isDefaultTasksList).map((l) => ({ type: 'list' as const, id: l.id })),
      ];
      if (navEntries.length > 0) {
        const currIdx = navEntries.findIndex(
          (entry) => entry.type === selection.type && entry.id === selection.id
        );
        const delta = e.key === ']' ? 1 : -1;
        const nextIdx = currIdx === -1
          ? 0
          : (currIdx + delta + navEntries.length) % navEntries.length;
        setSearchQuery('');
        setSelection(navEntries[nextIdx]);
        setMobileView('list');
      }
      return;
    }

    // Single-key app shortcuts
    if (e.key === '/') {
      e.preventDefault();
      if (window.innerWidth <= 900) {
        setMobileView('search');
        setMobileAddOpen(false);
        setTimeout(() => mobileSearchInputRef.current?.focus(), 60);
      } else {
        setSidebarCollapsed(false);
        setTimeout(() => {
          const el = document.querySelector<HTMLInputElement>('.sidebar-search .search-input');
          el?.focus();
          el?.select();
        }, 60);
      }
      return;
    }

    if (lowerKey === 'n' && !e.shiftKey) {
      e.preventDefault();
      if (window.innerWidth <= 900) {
        setMobileView('list');
        setMobileAddOpen(true);
        setTimeout(() => mobileAddInputRef.current?.focus(), 60);
      } else {
        setAddRowExpanded(true);
        setTimeout(() => addTaskInputRef.current?.focus(), 40);
      }
      return;
    }

    if (lowerKey === 'l' && !e.shiftKey) {
      e.preventDefault();
      setSidebarCollapsed(false);
      if (window.innerWidth <= 900) setSidebarOpen(true);
      setTimeout(() => {
        document.querySelector<HTMLInputElement>('[data-new-list-input="true"]')?.focus();
      }, 80);
      return;
    }

    if (lowerKey === 'v' && !e.shiftKey) {
      e.preventDefault();
      setViewMode((mode) => {
        const next = mode === 'list' ? 'grid' : 'list';
        setViewAnnouncement(next === 'grid' ? 'Grid view opened' : 'List view opened');
        return next;
      });
      return;
    }

    if (lowerKey === 'c' && !e.shiftKey) {
      if (targetTasks.length > 0) {
        e.preventDefault();
        setListPickerMenu({ mode: 'copy', items: targetTasks });
        return;
      }
      e.preventDefault();
      setCompletedExpandedByView((prev) => ({ ...prev, [currentViewKey]: !prev[currentViewKey] }));
      return;
    }

    if (lowerKey === 'm' && !e.shiftKey && targetTasks.length > 0) {
      e.preventDefault();
      setListPickerMenu({ mode: 'move', items: targetTasks });
      return;
    }

    // Task list navigation: ArrowDown / ArrowUp / j / k
    const navigableItems = showCompleted ? [...activeItems, ...completedItems] : activeItems;
    if (
      (e.key === 'ArrowDown' || e.key === 'ArrowUp' || lowerKey === 'j' || lowerKey === 'k') &&
      navigableItems.length > 0 &&
      !target?.closest('.sidebar')
    ) {
      e.preventDefault();
      const goingDown = e.key === 'ArrowDown' || lowerKey === 'j';
      const anchorId = lastSelectedId ?? selectedItemId;
      const currentIdx = anchorId ? navigableItems.findIndex((t) => t.id === anchorId) : -1;
      const nextIdx = goingDown
        ? (currentIdx < navigableItems.length - 1 ? currentIdx + 1 : 0)
        : (currentIdx > 0 ? currentIdx - 1 : navigableItems.length - 1);
      const nextItem = navigableItems[nextIdx];
      if (!nextItem) return;

      if (e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (anchorId) next.add(anchorId);
          next.add(nextItem.id);
          return next;
        });
        setSelectedItemId(null);
        setLastSelectedId(nextItem.id);
      } else {
        setSelectedIds(new Set());
        setSelectedItemId(nextItem.id);
        setLastSelectedId(nextItem.id);
      }
      return;
    }

    // Selected task actions
    if ((e.key === 'Delete' || e.key === 'Backspace') && targetTasks.length > 0) {
      e.preventDefault();
      void (async () => {
        if (
          (targetTasks.length > 1 || appSettings.confirmBeforeDelete) &&
          !(await appConfirm({
            title: targetTasks.length > 1 ? 'Delete tasks' : 'Delete task',
            message: targetTasks.length > 1
              ? `Delete ${targetTasks.length} selected tasks?`
              : `Delete "${targetTasks[0].text}"?`,
            confirmLabel: 'Delete',
            danger: true,
          }))
        ) {
          return;
        }
        if (selection.id === 'trash') {
          await Promise.all(targetTasks.map((t) => handlePermanentDeleteItem(t)));
        } else {
          await Promise.all(
            targetTasks.map((t) => handleDeleteItem(t, { skipUndo: targetTasks.length > 1 }))
          );
          if (targetTasks.length > 1) {
            const deletedBatch = [...targetTasks];
            pushUndo({
              label: `delete ${deletedBatch.length} tasks`,
              undo: async () => {
                await Promise.all(deletedBatch.map((t) => handleRestoreItem(t)));
              },
            });
          }
        }
        setSelectedIds(new Set());
        if (selectedItemId && targetTasks.some((t) => t.id === selectedItemId)) {
          setSelectedItemId(null);
        }
      })();
      return;
    }

    if (lowerKey === 'x' && targetTasks.length > 0) {
      e.preventDefault();
      const allDone = targetTasks.every((t) => t.done);
      targetTasks.forEach((t) =>
        handleUpdateItem(t, { done: !allDone, completedAtMs: !allDone ? Date.now() : null })
      );
      return;
    }

    if (e.key === ' ' && targetTasks.length > 0 && !isInteractiveElement) {
      e.preventDefault();
      const allDone = targetTasks.every((t) => t.done);
      targetTasks.forEach((t) =>
        handleUpdateItem(t, { done: !allDone, completedAtMs: !allDone ? Date.now() : null })
      );
      return;
    }

    if (lowerKey === 't' && !e.shiftKey && targetTasks.length > 0) {
      e.preventDefault();
      const allInMyDay = targetTasks.every((t) => t.myDayDate === todayStr);
      targetTasks.forEach((t) => handleUpdateItem(t, { myDayDate: allInMyDay ? null : todayStr }));
      return;
    }

    if ((lowerKey === 's' || lowerKey === 'i') && !e.shiftKey && targetTasks.length > 0) {
      e.preventDefault();
      const allImportant = targetTasks.every((t) => t.important);
      targetTasks.forEach((t) => handleUpdateItem(t, { important: !allImportant }));
      return;
    }

    if (lowerKey === 'd' && targetTasks.length > 0) {
      e.preventDefault();
      const due = e.shiftKey ? tomorrowStr : todayStr;
      targetTasks.forEach((t) => handleUpdateItem(t, { dueDate: due }));
      return;
    }

    // Detail pane quick focus shortcuts
    if ((e.key === 'Enter' || lowerKey === 'o') && !isInteractiveElement) {
      if (selectedItem) {
        e.preventDefault();
        document.querySelector<HTMLTextAreaElement>('.detail-title-input')?.focus();
      } else if (activeItems.length > 0) {
        e.preventDefault();
        setSelectedItemId(activeItems[0].id);
        setLastSelectedId(activeItems[0].id);
      }
      return;
    }

    if (lowerKey === 'e' && !e.shiftKey && selectedItem) {
      e.preventDefault();
      const titleEl = document.querySelector<HTMLTextAreaElement>('.detail-title-input');
      titleEl?.focus();
      titleEl?.select();
      return;
    }

    if (lowerKey === 'a' && !e.shiftKey && selectedItem) {
      e.preventDefault();
      document.querySelector<HTMLInputElement>('.add-step-form input')?.focus();
      return;
    }

    if (lowerKey === 'm' && e.shiftKey && selectedItem) {
      e.preventDefault();
      document.querySelector<HTMLTextAreaElement>('textarea[placeholder="Add note"]')?.focus();
      return;
    }
  };

  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

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
      if (!navigator.onLine) {
        setError('You are offline. Connect to the internet to sign in.');
        return;
      }
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
    <>
    <div className="app-shell" data-mobile-view={mobileView}>
      <TopBar
        syncStatus={syncStatus}
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
          onSelect={(sel) => {
            runViewTransition(() => {
              setSelection(sel);
              setMobileView('list');
              setMobileAddOpen(false);
            });
          }}
          onOpenMobileSearch={() => {
            setMobileView('search');
            setMobileAddOpen(false);
            setTimeout(() => mobileSearchInputRef.current?.focus(), 60);
          }}
          onSearchChange={setSearchQuery}
          onCreateList={handleCreateList}
          onCreateGroup={handleCreateGroup}
          onToggleGroup={handleToggleGroup}
          onUpdateGroupIcon={handleUpdateGroupIcon}
          onDeleteList={handleDeleteList}
          onShareList={(id) => setShareListId(id)}
          onDuplicateList={(id) => handleDuplicateList(id)}
          onPrintList={(id) => setPrintListId(id)}
          mutedListIds={appSettings.mutedListIds}
          onToggleListNotifications={toggleListNotifications}
          onMoveListToGroup={handleMoveListToGroup}
          onMoveListUp={handleMoveListUp}
          onMoveListDown={handleMoveListDown}
          onReorderList={handleReorderList}
          onReorderGroup={handleReorderGroup}
          onMoveTasksToList={handleMoveTasksToList}
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
          onOpenShortcuts={() => {
            setSortMenuOpen(false);
            setGroupMenuOpen(false);
            setListMenuOpen(false);
            setContextMenu(null);
            setShortcutsOpen(true);
          }}
          onOpenWhatsNew={() => setWhatsNewOpen(true)}
          onSignOut={() => signOutUser()}
        />
<main
          ref={mainPaneRef}
          className="main-pane"
          onClick={(e) => {
            if (selectedIds.size === 0 && !selectedItemId) return;
            const target = e.target as HTMLElement;
            if (!target.closest('.task-row, .bulk-bar, .add-task-row, button, a, input, select, textarea, [role="menu"]')) {
              if (selectedIds.size > 0) setSelectedIds(new Set());
              if (selectedItemId) setSelectedItemId(null);
            }
          }}
          data-list-color={currentList ? currentList.color ?? 'blue' : smartTheme?.color ?? 'default'}
          data-wallpaper={currentWallpaper}
          style={customBackgroundUrl ? {
            backgroundImage: `linear-gradient(rgba(19, 19, 19, .10), rgba(17, 16, 15, .22)), url(${JSON.stringify(customBackgroundUrl)})`,
          } : undefined}
        >
        {mobileView === 'search' ? (
          <div className="mobile-search-topbar">
            <button
              type="button"
              className="mobile-topbar-icon-btn"
              onClick={() => {
                setSearchQuery('');
                setMobileSearchMenuOpen(false);
                setMobileView('home');
              }}
              aria-label="Back to lists"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <input
              ref={mobileSearchInputRef}
              type="text"
              className="mobile-search-input"
              placeholder="Search"
              aria-label="Search tasks"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="mobile-topbar-icon-btn"
                onClick={() => {
                  setSearchQuery('');
                  mobileSearchInputRef.current?.focus();
                }}
                aria-label="Clear search"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
            <div className="mobile-search-menu-wrap" style={{ position: 'relative' }}>
              <button
                type="button"
                className="mobile-topbar-icon-btn"
                onClick={() => setMobileSearchMenuOpen((v) => !v)}
                aria-label="Search options"
                aria-haspopup="menu"
                aria-expanded={mobileSearchMenuOpen}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="5" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="12" cy="19" r="1.8" />
                </svg>
              </button>
              {mobileSearchMenuOpen && (
                <div className="top-bar-popover mobile-search-popover" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className="account-popover-item"
                    onClick={() => {
                      setMobileHideCompletedSearch((v) => !v);
                      setMobileSearchMenuOpen(false);
                    }}
                  >
                    {mobileHideCompletedSearch ? 'Show completed items' : 'Hide completed items'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mobile-list-topbar">
            <button
              type="button"
              className="mobile-topbar-icon-btn mobile-back-btn"
              onClick={() => {
                setMobileAddOpen(false);
                setListMenuOpen(false);
                setMobileView('home');
              }}
              aria-label="Back to lists"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="mobile-list-topbar-actions">
              {selection.type === 'list' && (
                <button
                  type="button"
                  className="mobile-topbar-share-btn"
                  onClick={() => {
                    setSortMenuOpen(false);
                    setGroupMenuOpen(false);
                    setListMenuOpen(false);
                    setContextMenu(null);
                    setShareListId(selection.id);
                  }}
                  aria-label="Share list"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="9" cy="8" r="3.5" />
                    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16.5 4.8a3.5 3.5 0 0 1 0 6.4M18 14a5.5 5.5 0 0 1 3.5 5.1" />
                  </svg>
                  {currentList?.memberUids?.length ? (
                    <span className="mobile-share-count">{currentList.memberUids.length + 1}</span>
                  ) : null}
                </button>
              )}
              <button
                type="button"
                className="mobile-topbar-icon-btn mobile-overflow-btn"
                onClick={() => {
                  setListMenuOpen((open) => !open);
                  setListOptionsSortOpen(false);
                  setListOptionsSortPosition(null);
                  setSortMenuOpen(false);
                  setGroupMenuOpen(false);
                }}
                aria-label="List options"
                aria-haspopup="menu"
                aria-expanded={listMenuOpen}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="5" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="12" cy="19" r="1.8" />
                </svg>
              </button>
            </div>
          </div>
        )}
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
                <div className="header-list-icon-wrap">
                  {currentList?.ownerUid === user.uid ? (
                    <button
                      type="button"
                      className="header-list-icon-button"
                      aria-label={`Change icon for ${currentList.title}`}
                      aria-haspopup="dialog"
                      aria-expanded={emojiPickerOpen}
                      title="Change list icon"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => setEmojiPickerOpen((open) => !open)}
                    >
                      <span className="header-list-icon">
                        {getListIcon(selection, currentList.icon)}
                      </span>
                    </button>
                  ) : (
                    <span className="header-list-icon">
                      {getListIcon(selection, currentList?.icon)}
                    </span>
                  )}
                  {emojiPickerOpen && currentList?.ownerUid === user.uid && (
                    <EmojiPicker
                      onSelect={handleListIconChange}
                      onClose={() => setEmojiPickerOpen(false)}
                    />
                  )}
                </div>
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
                        const suggestedIcon = suggestEmoji(trimmed);
                        updateDoc(doc(db, 'lists', selection.id), {
                          title: trimmed,
                          ...(suggestedIcon ? { icon: suggestedIcon } : {}),
                        });
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
                onClick={() => runViewTransition(() => { setViewMode('list'); setViewAnnouncement('List view opened'); })}
              >
                List
              </button>
              <button
                role="tab"
                aria-selected={viewMode === 'grid'}
                className={`view-tab ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => runViewTransition(() => { setViewMode('grid'); setViewAnnouncement('Grid view opened'); })}
              >
                Grid
              </button>
            </div>
            <span className="sr-only" aria-live="polite">{viewAnnouncement}</span>
            <button
              className="toolbar-btn toolbar-print-button"
              onClick={() => setPrintListId('__current__')}
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
                  {renderSortMenuOptions()}
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
            <div
              className="header-menu-wrap header-options-menu-wrap"
              style={{ position: "relative" }}
              onClick={(event) => {
                const target = event.target;
                if (!(target instanceof Element) || !target.closest('.background-image-delete-menu, .list-theme-tile')) {
                  setThemeDeleteTarget(null);
                }
              }}
            >
              <button
                type="button"
                className="toolbar-icon-button toolbar-options-button"
                onClick={() => {
                  setListMenuOpen((open) => !open);
                  setListOptionsSortOpen(false);
                  setListOptionsSortPosition(null);
                  setSortMenuOpen(false);
                  setGroupMenuOpen(false);
                }}
                aria-label="List options"
                aria-haspopup="menu"
                aria-expanded={listMenuOpen}
              >
                <span>…</span>
              </button>
              {listMenuOpen && (
                <div className="top-bar-popover list-options-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className="account-popover-item list-menu-item list-options-sort-trigger"
                    aria-haspopup="menu"
                    aria-expanded={listOptionsSortOpen}
                    onClick={(event) => {
                      if (listOptionsSortOpen) {
                        setListOptionsSortOpen(false);
                        setListOptionsSortPosition(null);
                      } else {
                        setListOptionsSortPosition(getContextSubmenuPosition(event.currentTarget.getBoundingClientRect()));
                        setListOptionsSortOpen(true);
                      }
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M7 15V4M7 4L3 8M7 4l4 4M17 9v11m0 0-4-4m4 4 4-4" />
                    </svg>
                    <span style={{ flex: 1, textAlign: 'left' }}>Sort by</span>
                    <span className="list-options-sort-arrow" aria-hidden="true">›</span>
                  </button>
                  <div className="list-theme-section">
                    <div className="list-theme-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Theme</span>
                      {((appSettings.hiddenThemeColors?.length ?? 0) > 0 || (appSettings.hiddenBackgrounds?.length ?? 0) > 0) && (
                        <button
                          type="button"
                          className="chip-btn"
                          style={{ fontSize: '11px', padding: '2px 7px' }}
                          onClick={() => updateAppSettings({ hiddenThemeColors: [], hiddenBackgrounds: [] })}
                        >
                          Restore
                        </button>
                      )}
                    </div>
                    <div className="list-theme-grid">
                      {[
                        { key: "blue", var: "var(--swatch-blue)" },
                        { key: "purple", var: "var(--swatch-purple)" },
                        { key: "red", var: "var(--swatch-red)" },
                        { key: "green", var: "var(--swatch-green)" },
                        { key: "teal", var: "var(--swatch-teal)" },
                      ]
                        .filter((swatch) => !(appSettings.hiddenThemeColors ?? []).includes(swatch.key))
                        .map((swatch) => {
                        const activeColor = selection.type === 'list'
                          ? (currentList?.color ?? 'blue')
                          : (smartTheme?.color ?? 'blue');
                        return (
                          <button
                            key={swatch.key}
                            type="button"
                            aria-label={`List color ${swatch.key}`}
                            aria-pressed={activeColor === swatch.key}
                            title={`Color: ${swatch.key} (right-click to delete)`}
                            className="list-theme-tile"
                            onClick={async () => {
                              setThemeDeleteTarget(null);
                              if (selection.type === 'list') {
                                await updateDoc(doc(db, "lists", selection.id), { color: swatch.key });
                              } else {
                                updateAppSettings({
                                  smartThemes: {
                                    ...(appSettings.smartThemes ?? {}),
                                    [selection.id]: { ...(smartTheme ?? {}), color: swatch.key },
                                  },
                                });
                              }
                              setListMenuOpen(false);
                            }}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              const padding = 8;
                              const menuWidth = Math.min(190, window.innerWidth - padding * 2);
                              const menuHeight = 44;
                              setThemeDeleteTarget({
                                top: Math.max(padding, Math.min(event.clientY, window.innerHeight - menuHeight - padding)),
                                left: Math.max(padding, Math.min(event.clientX, window.innerWidth - menuWidth - padding)),
                                kind: 'color',
                                id: swatch.key,
                                label: `${swatch.key} theme`,
                              });
                            }}
                            style={{ background: swatch.var }}
                          />
                        );
                      })}
                      {([
                        { id: 'field', label: 'Poppy field' },
                        { id: 'coast', label: 'Coast at sunset' },
                        { id: 'plain', label: 'Solid background' },
                        { id: 'none', label: 'No background' },
                      ] as const)
                        .filter((wallpaper) => !(appSettings.hiddenBackgrounds ?? []).includes(wallpaper.id))
                        .map((wallpaper) => {
                        const isPressed = selection.type === 'list'
                          ? !currentList?.customBackgroundActive && (currentList?.background ?? 'field') === wallpaper.id
                          : currentWallpaper === wallpaper.id;
                        return (
                          <button
                            key={wallpaper.id}
                            type="button"
                            className={`list-theme-tile wallpaper-${wallpaper.id}`}
                            aria-label={wallpaper.label}
                            aria-pressed={isPressed}
                            title={`${wallpaper.label} (right-click to delete)`}
                            onClick={async () => {
                              setThemeDeleteTarget(null);
                              if (selection.type === 'list') {
                                await updateDoc(doc(db, 'lists', selection.id), {
                                  background: wallpaper.id,
                                  customBackgroundActive: false,
                                });
                              } else {
                                updateAppSettings({
                                  smartThemes: {
                                    ...(appSettings.smartThemes ?? {}),
                                    [selection.id]: { ...(smartTheme ?? {}), background: wallpaper.id },
                                  },
                                });
                              }
                              setListMenuOpen(false);
                            }}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              const padding = 8;
                              const menuWidth = Math.min(190, window.innerWidth - padding * 2);
                              const menuHeight = 44;
                              setThemeDeleteTarget({
                                top: Math.max(padding, Math.min(event.clientY, window.innerHeight - menuHeight - padding)),
                                left: Math.max(padding, Math.min(event.clientX, window.innerWidth - menuWidth - padding)),
                                kind: 'wallpaper',
                                id: wallpaper.id,
                                label: wallpaper.label,
                              });
                            }}
                          />
                        );
                      })}
                      {selection.type === 'list' && currentList?.backgroundImageUrl && (
                        <button
                          type="button"
                          className="list-theme-tile wallpaper-custom"
                          aria-label="Uploaded background"
                          aria-pressed={Boolean(currentList.customBackgroundActive)}
                          title="Right-click to delete uploaded background"
                          style={{ backgroundImage: `url(${JSON.stringify(currentList.backgroundImageUrl)})` }}
                          onClick={async () => {
                            setThemeDeleteTarget(null);
                            await updateDoc(doc(db, 'lists', selection.id), { customBackgroundActive: true });
                            setListMenuOpen(false);
                          }}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            if (currentList.ownerUid !== user.uid || backgroundUploadInProgress) return;
                            const padding = 8;
                            const menuWidth = Math.min(190, window.innerWidth - padding * 2);
                            const menuHeight = 44;
                            setThemeDeleteTarget({
                              top: Math.max(padding, Math.min(event.clientY, window.innerHeight - menuHeight - padding)),
                              left: Math.max(padding, Math.min(event.clientX, window.innerWidth - menuWidth - padding)),
                              kind: 'custom-bg',
                              id: 'custom-bg',
                              label: 'uploaded background',
                            });
                          }}
                        />
                      )}
                      {selection.type === 'list' && currentList?.ownerUid === user.uid && (
                        <>
                          <input
                            ref={backgroundImageInputRef}
                            type="file"
                            accept="image/*,.heic,.heif"
                            hidden
                            onChange={(event) => {
                              const file = event.currentTarget.files?.[0];
                              if (file) void handleUploadListBackground(file);
                              event.currentTarget.value = '';
                            }}
                          />
                          <button
                            type="button"
                            role="menuitem"
                            className="list-theme-tile list-theme-upload-tile"
                            aria-label={backgroundUploadInProgress ? 'Uploading background image' : 'Upload background image'}
                            title={backgroundUploadInProgress ? 'Uploading background image' : 'Upload background image'}
                            disabled={backgroundUploadInProgress}
                            onClick={() => backgroundImageInputRef.current?.click()}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 16V4m0 0L7 9m5-5 5 5M5 14v5h14v-5" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                    {backgroundUploadStatus && (
                      <div className={`theme-upload-status stage-${backgroundUploadStatus.stage}`} role="status" aria-live="polite">
                        <div className="theme-upload-status-row">
                          <span className="theme-upload-status-text">{backgroundUploadStatus.message}</span>
                          {backgroundUploadStatus.stage === 'error' && (
                            <button
                              type="button"
                              className="theme-upload-dismiss"
                              onClick={() => setBackgroundUploadStatus(null)}
                              aria-label="Dismiss upload error"
                            >
                              ×
                            </button>
                          )}
                        </div>
                        {backgroundUploadStatus.stage !== 'error' && (
                          <div className="theme-upload-bar-track">
                            <div
                              className="theme-upload-bar-fill"
                              style={{ width: `${backgroundUploadStatus.progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button type="button" role="menuitem" className="account-popover-item list-menu-item" onClick={() => { setListMenuOpen(false); setPrintListId('__current__'); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="6 9 6 2 18 2 18 9" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect x="6" y="14" width="12" height="8" />
                    </svg>
                    <span>Print list</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="account-popover-item list-menu-item"
                    onClick={() => {
                      setListMenuOpen(false);
                      const lines = [
                        ...activeItems.map((t) => `☐ ${t.text}`),
                        ...completedItems.map((t) => `☑ ${t.text}`),
                      ];
                      const subject = encodeURIComponent(currentTitle);
                      const body = encodeURIComponent(lines.length > 0 ? lines.join('\n') : '(No tasks)');
                      window.location.href = `mailto:?subject=${subject}&body=${body}`;
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                    <span>Email list</span>
                  </button>
                  <button type="button" role="menuitem" className="account-popover-item list-menu-item" onClick={() => { setViewMode((mode) => mode === 'list' ? 'grid' : 'list'); setListMenuOpen(false); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" />
                      <rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                    <span>{viewMode === 'list' ? 'Grid view' : 'List view'}</span>
                  </button>
                  {selection.type === 'list' && currentList?.ownerUid === user.uid && !currentList?.isDefaultTasksList && (
                    <button
                      type="button"
                      role="menuitem"
                      className="account-popover-item list-menu-item"
                      onClick={async () => {
                        setListMenuOpen(false);
                        const nextTitle = await appPrompt({
                          title: 'Rename list',
                          defaultValue: currentList.title,
                          placeholder: 'List name',
                          confirmLabel: 'Rename',
                        });
                        if (nextTitle && nextTitle.trim() && nextTitle.trim() !== currentList.title) {
                          await updateDoc(doc(db, 'lists', selection.id), { title: nextTitle.trim() });
                        }
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                      <span>Rename list</span>
                    </button>
                  )}
                  {selection.type === 'list' && currentList?.ownerUid === user.uid && currentList?.groupId && (
                    <button
                      type="button"
                      role="menuitem"
                      className="account-popover-item list-menu-item"
                      onClick={() => {
                        setListMenuOpen(false);
                        void handleMoveListToGroup(selection.id, null);
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h7l2 2h9v11H3z" />
                      </svg>
                      <span>Remove from group</span>
                    </button>
                  )}
                  {selection.type === 'list' && (
                    <>
                      <div className="account-popover-divider" />
                      <button type="button" role="menuitem" className="account-popover-item list-menu-item" onClick={() => { setListMenuOpen(false); void handleDuplicateList(selection.id); }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="9" y="9" width="13" height="13" rx="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        <span>Duplicate list</span>
                      </button>
                      <button type="button" role="menuitem" className="account-popover-item list-menu-item" onClick={() => { setListMenuOpen(false); setShareListId(selection.id); }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M19 8v6M22 11h-6" />
                        </svg>
                        <span>Share list</span>
                      </button>
                    </>
                  )}
                  {(selection.type === 'list' || (selection.type === 'smart' && selection.id === 'tasks' && defaultTasksList)) && (() => {
                    const targetListId = selection.type === 'list' ? selection.id : defaultTasksList!.id;
                    const isMuted = (appSettings.mutedListIds ?? []).includes(targetListId);
                    return (
                      <button
                        type="button"
                        role="menuitem"
                        className="account-popover-item list-menu-item"
                        onClick={() => {
                          setListMenuOpen(false);
                          toggleListNotifications(targetListId);
                        }}
                      >
                        {isMuted ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M10.27 4.26A6 6 0 0 1 18 10c0 2.58.7 4.53 1.38 5.76" />
                            <path d="M6.27 6.27A6 6 0 0 0 6 8c0 7-3 9-3 9h14" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                            <path d="m2 2 20 20" />
                          </svg>
                        )}
                        <span>{isMuted ? 'Turn on notifications' : 'Turn off notifications'}</span>
                      </button>
                    );
                  })()}
                  {selection.type === 'list' && (
                    <>
                      <div className="account-popover-divider" />
                      <button type="button" role="menuitem" className="account-popover-item list-menu-item danger" onClick={() => { setListMenuOpen(false); handleDeleteList(selection.id); }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 6h18" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        <span>Delete list</span>
                      </button>
                    </>
                  )}
                </div>
              )}
              {themeDeleteTarget && (
                <div
                  className="top-bar-popover background-image-delete-menu"
                  role="menu"
                  aria-label={`Delete ${themeDeleteTarget.label}`}
                  style={{
                    position: 'fixed',
                    top: themeDeleteTarget.top,
                    left: themeDeleteTarget.left,
                    right: 'auto',
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="account-popover-item danger"
                    disabled={backgroundUploadInProgress}
                    onClick={async () => {
                      const target = themeDeleteTarget;
                      setThemeDeleteTarget(null);
                      if (target.kind === 'custom-bg') {
                        await handleRemoveListBackground();
                        return;
                      }
                      if (target.kind === 'color') {
                        const nextHidden = Array.from(new Set([...(appSettings.hiddenThemeColors ?? []), target.id]));
                        updateAppSettings({ hiddenThemeColors: nextHidden });
                        if (selection.type === 'list' && currentList?.color === target.id && currentList.ownerUid === user.uid) {
                          await updateDoc(doc(db, 'lists', selection.id), { color: 'default' });
                        } else if (selection.type === 'smart' && smartTheme?.color === target.id) {
                          updateAppSettings({
                            hiddenThemeColors: nextHidden,
                            smartThemes: {
                              ...(appSettings.smartThemes ?? {}),
                              [selection.id]: { ...(smartTheme ?? {}), color: 'default' },
                            },
                          });
                        }
                        return;
                      }
                      const nextHiddenBgs = Array.from(new Set([...(appSettings.hiddenBackgrounds ?? []), target.id]));
                      const fallbackBg = target.id === 'none' ? 'plain' : 'none';
                      updateAppSettings({ hiddenBackgrounds: nextHiddenBgs });
                      if (selection.type === 'list' && currentList?.background === target.id && currentList.ownerUid === user.uid) {
                        await updateDoc(doc(db, 'lists', selection.id), { background: fallbackBg });
                      } else if (selection.type === 'smart' && currentWallpaper === target.id) {
                        updateAppSettings({
                          hiddenBackgrounds: nextHiddenBgs,
                          smartThemes: {
                            ...(appSettings.smartThemes ?? {}),
                            [selection.id]: { ...(smartTheme ?? {}), background: fallbackBg },
                          },
                        });
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
              {listMenuOpen && listOptionsSortOpen && listOptionsSortPosition && (
                <div
                  className="top-bar-popover sort-menu list-options-sort-submenu"
                  role="menu"
                  aria-label="Sort by"
                  style={{
                    position: 'fixed',
                    top: listOptionsSortPosition.top,
                    left: listOptionsSortPosition.left,
                    right: 'auto',
                  }}
                >
                  {renderSortMenuOptions()}
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

{!searchQuery && viewMode === 'list' && selection.id !== 'completed' && selection.id !== 'assigned-to-me' && selection.id !== 'trash' && (
          <form className={`add-task-row ${addDueMenuOpen || addRemindMenuOpen || addRepeatMenuOpen || addDueCalendarOpen || addRemindCalendarOpen || addDueDate || addReminderAtMs || addRepeat !== 'none' ? 'has-open-popover' : ''}`}
          onFocus={() => setAddRowExpanded(true)}
          onClick={() => setAddRowExpanded(true)} onSubmit={handleAddItem} ref={addTaskFormRef}>
            <div className="add-task-top-row">
              <span className="add-task-checkbox" aria-hidden="true" />
              <input
                ref={addTaskInputRef}
                type="text"
                placeholder={addInputFocused
                  ? "Try typing 'Pay utilities bill by Friday 6pm'"
                  : 'Add a task. Type @ to assign it to someone.'}
                aria-label={`List ${currentTitle}, Press shift+tab to access List options`}
                value={newItemText}
                onFocus={() => setAddInputFocused(true)}
                onBlur={() => setAddInputFocused(false)}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewItemText(val);
                  setDuplicateDismissed(false);
                  if (!val.trim()) setSmartParseEnabled(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    if (duplicateMatches.length > 0) {
                      e.stopPropagation();
                      setDuplicateDismissed(true);
                      return;
                    }
                    if (!newItemText.trim()) (e.target as HTMLInputElement).blur();
                  }
                }}
                onPaste={async (e) => {
                  const text = e.clipboardData.getData("text");
                  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
                  if (lines.length > 1 && user) {
                    e.preventDefault();
                    if (
                      lines.length > 20 &&
                      !(await appConfirm({
                        title: 'Create multiple tasks',
                        message: `Create ${lines.length} tasks from pasted lines?`,
                        confirmLabel: `Create ${lines.length} tasks`,
                      }))
                    ) return;
                    const targetListId = await ensureDefaultList();
                    await Promise.all(lines.map((line) => addDoc(collection(db, "lists", targetListId, "items"), {
                      listId: targetListId, ownerUid: user.uid, text: line, done: false, important: false,
                      myDayDate: selection.type === "smart" && selection.id === "my-day" ? todayStr : null,
                      dueDate: addDueDate, repeat: addRepeat, notes: "", category: null, steps: [], createdAtMs: Date.now(), completedAtMs: null,
                    })));
                  }
                }}
              />
              <div className="add-task-inline-actions">
                <div className="add-picker-wrap">
                  <button type="button" className="add-task-icon-btn" onClick={() => { setAddDueMenuOpen((v) => !v); setAddRepeatMenuOpen(false); setAddRemindMenuOpen(false); setAddDueCalendarOpen(false); setAddRemindCalendarOpen(false); }} title="Add due date">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="17" rx="2" />
                      <path d="M8 2v3M16 2v3M3 9h18" />
                      <circle cx="8" cy="13" r="0.9" fill="currentColor" stroke="none" />
                      <circle cx="12" cy="13" r="0.9" fill="currentColor" stroke="none" />
                      <circle cx="16" cy="13" r="0.9" fill="currentColor" stroke="none" />
                      <circle cx="8" cy="17" r="0.9" fill="currentColor" stroke="none" />
                      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
                      <circle cx="16" cy="17" r="0.9" fill="currentColor" stroke="none" />
                    </svg>
                    {addDueDate && <span className="add-task-icon-label">{addDueDate}</span>}
                  </button>
                  {addDueMenuOpen && (
                    <div className="top-bar-popover" role="menu" style={{ minWidth: '160px', right: 0, left: 'auto' }}>
                      <button type="button" role="menuitem" className="account-popover-item" onClick={() => { setAddDueDate(todayStr); setAddDueMenuOpen(false); }}>Today</button>
                      <button type="button" role="menuitem" className="account-popover-item" onClick={() => { setAddDueDate(tomorrowStr); setAddDueMenuOpen(false); }}>Tomorrow</button>
                      <button type="button" role="menuitem" className="account-popover-item" onClick={() => { const d = new Date(); d.setDate(d.getDate() + 7); setAddDueDate(d.toISOString().slice(0, 10)); setAddDueMenuOpen(false); }}>Next week</button>
                      <button type="button" role="menuitem" className="account-popover-item" onClick={(e) => { e.stopPropagation(); setAddDueMenuOpen(false); setAddDueCalendarOpen(true); }}>Pick a date</button>
                      {addDueDate && <button type="button" role="menuitem" className="account-popover-item danger" onClick={() => { setAddDueDate(null); setAddDueMenuOpen(false); }}>Remove due date</button>}
                    </div>
                  )}
                  {addDueCalendarOpen && (
                    <div className="top-bar-popover" style={{ right: 0, left: 'auto', padding: 0 }}>
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
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="13" r="7.5" />
                      <path d="M12 9.5v3.5l2.2 1.4" />
                      <path d="M5.5 4.5L3 7M18.5 4.5L21 7" />
                      <path d="M7.5 19.5L6 21M16.5 19.5L18 21" />
                    </svg>
                    {addReminderAtMs && <span className="add-task-icon-label">{new Date(addReminderAtMs).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
                  </button>
                  {addRemindMenuOpen && (
                    <div className="top-bar-popover" role="menu" style={{ minWidth: '190px', right: 0, left: 'auto' }}>
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
                      <button type="button" role="menuitem" className="account-popover-item" onClick={(e) => { e.stopPropagation(); setAddRemindMenuOpen(false); setAddRemindCalendarOpen(true); }}>Pick a date & time</button>
                      {addReminderAtMs && <button type="button" role="menuitem" className="account-popover-item danger" onClick={() => { setAddReminderAtMs(null); setAddRemindMenuOpen(false); }}>Remove reminder</button>}
                    </div>
                  )}
                  {addRemindCalendarOpen && (
                    <div className="top-bar-popover" style={{ right: 0, left: 'auto', padding: 0 }}>
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
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 11.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6.5" />
                      <path d="M8 2v3M16 2v3M3 9h17" />
                      <path d="M17.5 14.5a3.5 3.5 0 1 1-3 5.3" />
                      <path d="M17.5 12.8v2.4h2.4" />
                    </svg>
                    {addRepeat !== "none" && <span className="add-task-icon-label">{addRepeat}</span>}
                  </button>
                  {addRepeatMenuOpen && (
                    <div className="top-bar-popover" role="menu" style={{ minWidth: '160px', right: 0, left: 'auto' }}>
                      {(['daily', 'weekdays', 'weekly', 'monthly', 'yearly'] as const).map((r) => (
                        <button key={r} type="button" role="menuitem" className="account-popover-item" onClick={() => { setAddRepeat(r); setAddRepeatMenuOpen(false); }}>
                          {r.charAt(0).toUpperCase() + r.slice(1)}
                        </button>
                      ))}
                      {addRepeat !== 'none' && <button type="button" role="menuitem" className="account-popover-item danger" onClick={() => { setAddRepeat('none'); setAddRepeatMenuOpen(false); }}>Never</button>}
                    </div>
                  )}
                </div>
                {newItemText.trim() && (
                  <button type="submit" className="add-task-icon-btn add-task-send-btn" title="Add task" aria-label="Add task">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M22 2L11 13" />
                      <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </form>
        )}

        {!searchQuery && viewMode === 'list' && parsedNewTask?.hasMatch && (
          <div className="smart-parse-banner" role="status" aria-live="polite">
            <span className="smart-parse-chips">
              <span className="smart-parse-spark" aria-hidden="true">✨</span>
              <span className="smart-parse-title">“{parsedNewTask.title}”</span>
              {!addDueDate && parsedNewTask.dueDate && (
                <span className="smart-parse-chip">
                  📅 {new Date(`${parsedNewTask.dueDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
              )}
              {!addReminderAtMs && parsedNewTask.reminderAtMs && (
                <span className="smart-parse-chip">
                  ⏰ {new Date(parsedNewTask.reminderAtMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
              {addRepeat === 'none' && parsedNewTask.repeat && parsedNewTask.repeat !== 'none' && (
                <span className="smart-parse-chip">
                  🔁 {parsedNewTask.repeat.charAt(0).toUpperCase() + parsedNewTask.repeat.slice(1)}
                </span>
              )}
            </span>
            <button
              type="button"
              className="smart-parse-dismiss"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setSmartParseEnabled(false)}
              title="Keep text as-is without auto-scheduling"
            >
              Keep raw text
            </button>
          </div>
        )}

        {!searchQuery && viewMode === 'list' && addInputFocused && duplicateMatches.length > 0 && (
          <div className="duplicate-hint-dropdown" role="region" aria-label="Similar items already in list">
            <div className="duplicate-hint-header">
              <span>Already in this list ({duplicateMatches.length}) — press Enter to add anyway</span>
              <button
                type="button"
                className="duplicate-hint-close"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setDuplicateDismissed(true)}
                aria-label="Dismiss suggestions"
              >
                ×
              </button>
            </div>
            <ul className="duplicate-hint-list">
              {duplicateMatches.map((match) => (
                <li key={match.id} className={`duplicate-hint-item ${match.done ? 'is-done' : ''}`}>
                  <span className="duplicate-hint-status" aria-hidden="true">
                    {match.done ? '✓' : '○'}
                  </span>
                  <span className="duplicate-hint-text" title={match.text}>
                    {match.text}
                  </span>
                  <span className="duplicate-hint-badge">
                    {match.done ? 'Completed' : 'Active'}
                  </span>
                  {match.done ? (
                    <button
                      type="button"
                      className="duplicate-hint-action"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        void handleUpdateItem(match, { done: false, completedAtMs: null });
                        setNewItemText('');
                        setDuplicateDismissed(false);
                        showClipboardToast(`Unmarked "${match.text}"`);
                      }}
                    >
                      Unmark
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="duplicate-hint-action"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSelectedItemId(match.id);
                        setLastSelectedId(match.id);
                        setNewItemText('');
                        setDuplicateDismissed(false);
                      }}
                    >
                      Open
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
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

        {selection.type === 'smart' && selection.id === 'trash' && !searchQuery ? (
          <section className="trash-view">
            <div className="trash-banner">
              <span className="trash-banner-text">
                <span aria-hidden="true">🗑️</span>
                <span>Items in Trash are kept for 30 days before being permanently deleted.</span>
              </span>
              {trashedItems.length > 0 && (
                <button type="button" className="trash-btn trash-btn-danger" onClick={handleEmptyTrash}>
                  <span aria-hidden="true">🧹</span>
                  <span>Empty trash</span>
                </button>
              )}
            </div>
            {trashedItems.length === 0 ? (
              <div className="empty-state" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-text-2)' }}>
                <div style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }} aria-hidden="true">✨</div>
                <div className="empty-state-title">Trash is empty</div>
                <div className="empty-state-copy">Deleted tasks will stay here for 30 days so you can restore them anytime.</div>
              </div>
            ) : (
              <ul className="task-list">
                {trashedItems.map((item) => {
                  const listTitle = allLists.find((l) => l.id === item.listId)?.title ?? 'Tasks';
                  const deletedAtMs = item.deletedAtMs ?? Date.now();
                  const daysLeft = Math.max(1, Math.ceil((TRASH_RETENTION_MS - (Date.now() - deletedAtMs)) / (24 * 60 * 60 * 1000)));
                  const deletedDateStr = new Date(deletedAtMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  const deletedByLabel = item.deletedByUid === user?.uid
                    ? 'You'
                    : item.deletedByName || null;
                  return (
                    <li key={item.id} className="task-row has-meta" style={{ justifyContent: 'space-between' }}>
                      <div className="task-body" style={{ minWidth: 0 }}>
                        <span className="task-title" style={{ textDecoration: item.done ? 'line-through' : 'none', opacity: item.done ? 0.7 : 1 }}>
                          {item.text}
                        </span>
                        <div className="task-meta">
                          <span>{listTitle}</span>
                          <span> · Deleted {deletedDateStr}{deletedByLabel ? ` by ${deletedByLabel}` : ''} · {daysLeft}d left</span>
                        </div>
                      </div>
                      <div className="trash-actions">
                        <button type="button" className="trash-btn trash-btn-restore" onClick={() => handleRestoreItem(item)}>
                          <span aria-hidden="true">♻️</span>
                          <span>Restore</span>
                        </button>
                        <button
                          type="button"
                          className="trash-btn trash-btn-danger"
                          onClick={() => handlePermanentDeleteItem(item)}
                        >
                          <span aria-hidden="true">🗑️</span>
                          <span>Delete forever</span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : (plannedGroups ?? categoryGroups) ? (
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
                  selectedIds={selectedIds}
                    todayStr={todayStr}
                    tomorrowStr={tomorrowStr}
                    showListMeta={selection.type === 'smart' || searchQuery.trim() !== ''}
                    reorderable={canReorderItems}
                    sandState={getSandState(item.id)}
                    clipboardState={getClipboardState(item.id)}
                    onReorder={handleReorderItems}
                    onToggleDone={handleToggleDone}
                    onToggleImportant={handleToggleImportant}
                    onOpen={handleOpen}
                onLongPress={(t) => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(t.id)) next.delete(t.id);
                    else next.add(t.id);
                    return next;
                  });
                }}
                    onContextMenu={(e) => {
                      if (selectedIds.size > 0 && !selectedIds.has(item.id)) setSelectedIds(new Set());
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
                  <span className="section-icon">{getListIcon({ type: 'list', id: list.id }, list.icon)}</span>
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
                  selectedIds={selectedIds}
                        todayStr={todayStr}
                        tomorrowStr={tomorrowStr}
                        showListMeta={false}
                        sandState={getSandState(item.id)}
                    clipboardState={getClipboardState(item.id)}
                        onToggleDone={handleToggleDone}
                        onToggleImportant={handleToggleImportant}
                        onOpen={handleOpen}
                onLongPress={(t) => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(t.id)) next.delete(t.id);
                    else next.add(t.id);
                    return next;
                  });
                }}
                        onContextMenu={(e) => {
                          if (selectedIds.size > 0 && !selectedIds.has(item.id)) setSelectedIds(new Set());
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
            {activeItems.map((item, idx) => (
              <TaskRow
                key={item.id}
                index={idx}
                item={item}
                lists={allLists}
                selected={selectedItemId === item.id || selectedIds.has(item.id)}
                  selectedIds={selectedIds}
                todayStr={todayStr}
                tomorrowStr={tomorrowStr}
                showListMeta={(selection.type === 'smart' || searchQuery.trim() !== '') && selection.id !== 'all'}
                reorderable={canReorderItems}
                sandState={getSandState(item.id)}
                clipboardState={getClipboardState(item.id)}
                onReorder={handleReorderItems}
                onToggleDone={handleToggleDone}
                onToggleImportant={handleToggleImportant}
                onOpen={handleOpen}
                onLongPress={(t) => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(t.id)) next.delete(t.id);
                    else next.add(t.id);
                    return next;
                  });
                }}
                onContextMenu={(e) => {
                  if (selectedIds.size > 0 && !selectedIds.has(item.id)) setSelectedIds(new Set());
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
              onClick={() => setCompletedExpandedByView((prev) => ({ ...prev, [currentViewKey]: !prev[currentViewKey] }))}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                const rawIds = e.dataTransfer.getData('application/x-todo-items');
                const singleId = e.dataTransfer.getData('text/plain');
                let ids: string[] = [];
                if (rawIds) {
                  try { ids = JSON.parse(rawIds) as string[]; } catch { /* ignore */ }
                }
                if (ids.length === 0 && singleId) ids = [singleId];
                const toComplete = activeItems.filter((t) => ids.includes(t.id) && !t.done);
                toComplete.forEach((t) => {
                  void handleUpdateItem(t, { done: true, completedAtMs: Date.now() });
                });
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu(null);
                setCompletedMoveOpen(false);
                setCompletedDatePickerOpen(false);
                setCompletedMenu({ x: e.clientX, y: e.clientY });
              }}
            >
              <span className={`completed-toggle-chevron ${showCompleted ? 'expanded' : ''}`} aria-hidden="true">▸</span>
              <span>Completed ({completedItems.length})</span>
            </button>
            <div className={`accordion-collapse ${showCompleted ? 'expanded' : 'collapsed'}`} aria-hidden={!showCompleted}>
              <div className="accordion-inner">
                <ul className="task-list">
                  {completedItems.map((item, idx) => (
                    <TaskRow
                      key={item.id}
                      index={idx}
                      item={item}
                      lists={allLists}
                      selected={selectedItemId === item.id || selectedIds.has(item.id)}
                      selectedIds={selectedIds}
                      todayStr={todayStr}
                      tomorrowStr={tomorrowStr}
                      showListMeta={selection.type === 'smart' || searchQuery.trim() !== ''}
                      reorderable={canReorderItems}
                      clipboardState={getClipboardState(item.id)}
                      onReorder={handleReorderItems}
                      onToggleDone={handleToggleDone}
                      onToggleImportant={handleToggleImportant}
                      onOpen={handleOpen}
                      onLongPress={(t) => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(t.id)) next.delete(t.id);
                          else next.add(t.id);
                          return next;
                        });
                      }}
                      onContextMenu={(e) => {
                        if (selectedIds.size > 0 && !selectedIds.has(item.id)) setSelectedIds(new Set());
                        setContextMenu({ x: e.clientX, y: e.clientY, item });
                      }}
                    />
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}
        </div>

        
        {!searchQuery && activeItems.length === 0 && selection.type !== 'list' && !(selection.type === 'smart' && (selection.id === 'assigned-to-me' || selection.id === 'trash')) && (
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
            {selection.type === 'smart' && selection.id === 'my-day' && (
              <div className="empty-state-title">Focus on your day</div>
            )}
            <div className="empty-state-copy">
              {selection.type === 'smart' && selection.id === 'my-day'
                ? 'Get things done with My Day, a list that refreshes every day.'
                : selection.type === 'smart' && selection.id === 'important'
                ? 'Try starring some tasks to see them here.'
                : selection.type === 'smart' && selection.id === 'planned'
                ? 'Tasks with due dates or reminders show up here.'
                : selection.type === 'smart' && selection.id === 'completed'
                ? 'Tasks you complete show up here.'
                : ''}
            </div>
            {selection.type === 'smart' && selection.id === 'my-day' && (
              <button type="button" className="empty-state-action" onClick={() => addTaskInputRef.current?.focus()}>
                Add task to My Day
              </button>
            )}
          </div>
        )}

        {selection.type === 'smart' &&
          selection.id === 'assigned-to-me' &&
          !searchQuery && (
            <p className="notice">No tasks assigned to you yet.</p>
          )}

        {mobileView === 'list' && <div className="mobile-notepad-lines" aria-hidden="true" />}

        {mobileView === 'list' &&
          !searchQuery &&
          selection.id !== 'completed' &&
          selection.id !== 'assigned-to-me' &&
          selection.id !== 'trash' &&
          !mobileAddOpen && (
            <button
              type="button"
              className="mobile-fab"
              onClick={() => {
                setMobileAddOpen(true);
                setTimeout(() => mobileAddInputRef.current?.focus(), 60);
              }}
              aria-label="Add a task"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          )}

        {mobileAddOpen && (
          <div
            className="mobile-quick-add-backdrop"
            onClick={() => {
              setMobileAddOpen(false);
              setAddDueMenuOpen(false);
              setAddDueCalendarOpen(false);
              setAddRemindMenuOpen(false);
              setAddRemindCalendarOpen(false);
              setAddRepeatMenuOpen(false);
            }}
          >
            <form
              className="mobile-quick-add-sheet"
              onClick={(e) => e.stopPropagation()}
              onSubmit={async (e) => {
                await handleAddItem(e);
                setAddDueMenuOpen(false);
                setAddDueCalendarOpen(false);
                setAddRemindMenuOpen(false);
                setAddRemindCalendarOpen(false);
                setAddRepeatMenuOpen(false);
                mobileAddInputRef.current?.focus();
              }}
            >
              {(addDueMenuOpen || addDueCalendarOpen || addRemindMenuOpen || addRemindCalendarOpen || addRepeatMenuOpen) && (
                <div className="mobile-quick-add-picker-panel">
                  {addDueMenuOpen && (
                    <div className="mobile-picker-menu" role="menu" aria-label="Due date options">
                      <button type="button" role="menuitem" className="account-popover-item" onClick={() => { setAddDueDate(todayStr); setAddDueMenuOpen(false); }}>Today</button>
                      <button type="button" role="menuitem" className="account-popover-item" onClick={() => { setAddDueDate(tomorrowStr); setAddDueMenuOpen(false); }}>Tomorrow</button>
                      <button type="button" role="menuitem" className="account-popover-item" onClick={() => { const d = new Date(); d.setDate(d.getDate() + 7); setAddDueDate(d.toISOString().slice(0, 10)); setAddDueMenuOpen(false); }}>Next week</button>
                      <button type="button" role="menuitem" className="account-popover-item" onClick={() => { setAddDueMenuOpen(false); setAddDueCalendarOpen(true); }}>Pick a date</button>
                      {addDueDate && <button type="button" role="menuitem" className="account-popover-item danger" onClick={() => { setAddDueDate(null); setAddDueMenuOpen(false); }}>Remove due date</button>}
                    </div>
                  )}
                  {addDueCalendarOpen && (
                    <div className="mobile-calendar-wrap">
                      <CustomCalendarPicker
                        initialDate={addDueDate}
                        todayStr={todayStr}
                        onSave={(dateStr) => { setAddDueDate(dateStr); setAddDueCalendarOpen(false); }}
                        onCancel={() => setAddDueCalendarOpen(false)}
                      />
                    </div>
                  )}
                  {addRemindMenuOpen && (
                    <div className="mobile-picker-menu" role="menu" aria-label="Reminder options">
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
                      <button type="button" role="menuitem" className="account-popover-item" onClick={() => { setAddRemindMenuOpen(false); setAddRemindCalendarOpen(true); }}>Pick a date &amp; time</button>
                      {addReminderAtMs && <button type="button" role="menuitem" className="account-popover-item danger" onClick={() => { setAddReminderAtMs(null); setAddRemindMenuOpen(false); }}>Remove reminder</button>}
                    </div>
                  )}
                  {addRemindCalendarOpen && (
                    <div className="mobile-calendar-wrap">
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
                  {addRepeatMenuOpen && (
                    <div className="mobile-picker-menu" role="menu" aria-label="Repeat options">
                      {(['daily', 'weekdays', 'weekly', 'monthly', 'yearly'] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          role="menuitem"
                          className={`account-popover-item ${addRepeat === r ? 'active' : ''}`}
                          onClick={() => { setAddRepeat(r); setAddRepeatMenuOpen(false); }}
                        >
                          {r.charAt(0).toUpperCase() + r.slice(1)}
                        </button>
                      ))}
                      {addRepeat !== 'none' && (
                        <button type="button" role="menuitem" className="account-popover-item danger" onClick={() => { setAddRepeat('none'); setAddRepeatMenuOpen(false); }}>Never</button>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="mobile-quick-add-row">
                <span className="add-task-checkbox" aria-hidden="true" />
                <input
                  ref={mobileAddInputRef}
                  type="text"
                  placeholder="Add a task"
                  aria-label="Add a task"
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={!newItemText.trim()}
                  className={`mobile-quick-add-submit ${newItemText.trim() ? 'active' : ''}`}
                  aria-label="Create task"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
              </div>
              <div className="mobile-quick-add-actions">
                <button
                  type="button"
                  className={`mobile-quick-add-chip ${addDueDate ? 'active' : ''}`}
                  onClick={() => {
                    const next = !(addDueMenuOpen || addDueCalendarOpen);
                    setAddDueMenuOpen(next);
                    setAddDueCalendarOpen(false);
                    setAddRemindMenuOpen(false);
                    setAddRemindCalendarOpen(false);
                    setAddRepeatMenuOpen(false);
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                  <span>{addDueDate ? `Due ${addDueDate}` : 'Set due date'}</span>
                </button>
                <button
                  type="button"
                  className={`mobile-quick-add-chip ${addReminderAtMs ? 'active' : ''}`}
                  onClick={() => {
                    const next = !(addRemindMenuOpen || addRemindCalendarOpen);
                    setAddRemindMenuOpen(next);
                    setAddRemindCalendarOpen(false);
                    setAddDueMenuOpen(false);
                    setAddDueCalendarOpen(false);
                    setAddRepeatMenuOpen(false);
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  <span>
                    {addReminderAtMs
                      ? new Date(addReminderAtMs).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                      : 'Remind me'}
                  </span>
                </button>
                <button
                  type="button"
                  className={`mobile-quick-add-chip ${addRepeat !== 'none' ? 'active' : ''}`}
                  onClick={() => {
                    const next = !addRepeatMenuOpen;
                    setAddRepeatMenuOpen(next);
                    setAddDueMenuOpen(false);
                    setAddDueCalendarOpen(false);
                    setAddRemindMenuOpen(false);
                    setAddRemindCalendarOpen(false);
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m17 2 4 4-4 4" />
                    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
                    <path d="m7 22-4-4 4-4" />
                    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
                  </svg>
                  <span>{addRepeat !== 'none' ? addRepeat.charAt(0).toUpperCase() + addRepeat.slice(1) : 'Repeat'}</span>
                </button>
              </div>
            </form>
          </div>
        )}

      </main>

      {contextMenu && (() => {
        const isMultiSelection = selectedIds.has(contextMenu.item.id) && selectedIds.size > 1;
        const targetItems = isMultiSelection
          ? sortedVisible.filter((i) => selectedIds.has(i.id))
          : [contextMenu.item];
        const effectiveItems = targetItems.length > 0 ? targetItems : [contextMenu.item];
        const isMulti = effectiveItems.length > 1;
        const allInMyDay = effectiveItems.every((i) => i.myDayDate === todayStr);
        const allImportant = effectiveItems.every((i) => i.important);
        const allDone = effectiveItems.every((i) => i.done);
        const closeContextMenu = (clearMulti = false) => {
          setContextMenu(null);
          setTaskSubmenu(null);
          setTaskDatePickerOpen(false);
          if (clearMulti && isMulti) setSelectedIds(new Set());
        };
        return (
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
            onClick={async () => {
              const snapshot = [...effectiveItems];
              const nextMyDay = allInMyDay ? null : todayStr;
              closeContextMenu(true);
              await Promise.all(snapshot.map((i) => handleUpdateItem(i, { myDayDate: nextMyDay })));
            }}
          >
            <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="sun" /></span>
            <span>{allInMyDay ? "Remove from My Day" : "Add to My Day"}</span>
            <span className="context-menu-shortcut">Ctrl+T</span>
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={async () => {
              const snapshot = [...effectiveItems];
              const nextImportant = !allImportant;
              closeContextMenu(true);
              await Promise.all(snapshot.map((i) => handleUpdateItem(i, { important: nextImportant })));
            }}
          >
            <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="star" /></span>
            {allImportant ? "Remove importance" : "Mark as important"}
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={async () => {
              const snapshot = [...effectiveItems];
              const nextDone = !allDone;
              const completedAt = nextDone ? Date.now() : null;
              closeContextMenu(true);
              await Promise.all(snapshot.map((i) => handleUpdateItem(i, { done: nextDone, completedAtMs: completedAt })));
            }}
          >
            <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="check" /></span>
            <span>{allDone ? "Mark as not completed" : "Mark as completed"}</span>
          </button>
          <div className="account-popover-divider" />
          <button
            type="button"
            className="context-menu-item"
            onClick={async () => {
              const snapshot = [...effectiveItems];
              closeContextMenu(true);
              await Promise.all(snapshot.map((i) => handleUpdateItem(i, { dueDate: todayStr })));
            }}
          >
            <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="calendar" /></span>
            Due today
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={async () => {
              const snapshot = [...effectiveItems];
              closeContextMenu(true);
              await Promise.all(snapshot.map((i) => handleUpdateItem(i, { dueDate: tomorrowStr })));
            }}
          >
            <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="calendar" /></span>
            Due tomorrow
          </button>
          <div className="context-menu-submenu-wrap">
            <button
              type="button"
              className="context-menu-item"
              onClick={(e) => {
                e.stopPropagation();
                setTaskSubmenu(null);
                setTaskDatePickerOpen((v) => !v);
              }}
            >
              <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="calendar" /></span>
              <span>Pick a date</span>
            </button>
            {taskDatePickerOpen && (
              <div
                className="context-menu context-menu-submenu"
                style={{
                  top: Math.max(8, Math.min(contextMenu.y + 120, window.innerHeight - 360)),
                  left: Math.max(8, Math.min(contextMenu.x + 252, window.innerWidth - 320)),
                  width: 'auto',
                  minWidth: 'unset',
                  maxWidth: 'none',
                  maxHeight: 'none',
                  overflow: 'visible',
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <CustomCalendarPicker
                  initialDate={contextMenu.item.dueDate ?? todayStr}
                  todayStr={todayStr}
                  onSave={async (dateStr) => {
                    const snapshot = [...effectiveItems];
                    closeContextMenu(true);
                    await Promise.all(snapshot.map((i) => handleUpdateItem(i, { dueDate: dateStr })));
                  }}
                  onCancel={() => setTaskDatePickerOpen(false)}
                />
              </div>
            )}
          </div>
          <div className="account-popover-divider" />
          <button
            type="button"
            className="context-menu-item"
            onClick={async () => {
              if (!user) return;
              const snapshot = [...effectiveItems];
              const listTitle = contextMenu.item.text;
              closeContextMenu(true);
              const ref = await addDoc(collection(db, "lists"), { title: listTitle, ownerUid: user.uid, createdAt: serverTimestamp() });
              await Promise.all(snapshot.map((i) => handleMoveToList(i, ref.id)));
            }}
          >
            <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="move" /></span>
            {isMulti ? `Create new list from ${effectiveItems.length} tasks` : "Create new list from this task"}
          </button>
          <div className="context-menu-submenu-wrap" onMouseEnter={(event) => openTaskSubmenu("move", event.currentTarget)} onMouseLeave={() => setTaskSubmenu(null)}>
            <button
              type="button"
              className="context-menu-item"
              onClick={(event) => openTaskSubmenu("move", event.currentTarget)}
            >
              <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="move" /></span><span>{isMulti ? "Move tasks to…" : "Move task to…"}</span><span className="context-menu-arrow">›</span>
            </button>
            {taskSubmenu === "move" && (
              <div className="context-menu context-menu-submenu" style={taskSubmenuPosition ?? undefined}>
                {allLists.map((l) => {
                  const isCurrent = effectiveItems.every((i) => i.listId === l.id);
                  return (
                    <button key={l.id} className="context-menu-item" disabled={isCurrent} onClick={async () => {
                      const snapshot = [...effectiveItems];
                      closeContextMenu(true);
                      await Promise.all(snapshot.map((i) => handleMoveToList(i, l.id)));
                    }}>
                      <span className="context-menu-icon" aria-hidden="true">
                        {l.icon ? <span style={{ fontSize: '15px', lineHeight: 1 }}>{l.icon}</span> : <ContextMenuIcon kind="move" />}
                      </span>
                      <span>{l.title}</span>
                      {isCurrent && <span style={{ marginLeft: 'auto', opacity: 0.7 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="context-menu-submenu-wrap" onMouseEnter={(event) => openTaskSubmenu("copy", event.currentTarget)} onMouseLeave={() => setTaskSubmenu(null)}>
            <button
              type="button"
              className="context-menu-item"
              onClick={(event) => openTaskSubmenu("copy", event.currentTarget)}
            >
              <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="copy" /></span><span>{isMulti ? "Copy tasks to…" : "Copy task to…"}</span><span className="context-menu-arrow">›</span>
            </button>
            {taskSubmenu === "copy" && (
              <div className="context-menu context-menu-submenu" style={taskSubmenuPosition ?? undefined}>
                {allLists.map((l) => (
                  <button key={l.id} className="context-menu-item" onClick={async () => {
                    const snapshot = [...effectiveItems];
                    closeContextMenu(true);
                    await Promise.all(snapshot.map((i) => handleCopyItemToList(i, l.id)));
                  }}>
                    <span className="context-menu-icon" aria-hidden="true">
                      {l.icon ? <span style={{ fontSize: '15px', lineHeight: 1 }}>{l.icon}</span> : <ContextMenuIcon kind="move" />}
                    </span>
                    <span>{l.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="account-popover-divider" />
          <button
            type="button"
            className="context-menu-item danger"
            onClick={async () => {
              const snapshot = [...effectiveItems];
              closeContextMenu(true);
              if (
                snapshot.length > 1 &&
                !(await appConfirm({
                  title: 'Delete tasks',
                  message: `Delete ${snapshot.length} selected tasks?`,
                  confirmLabel: 'Delete',
                  danger: true,
                }))
              ) {
                return;
              }
              await Promise.all(snapshot.map((i) => handleDeleteItem(i)));
            }}
          >
            <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="trash" /></span>
            <span>{isMulti ? `Delete ${effectiveItems.length} tasks` : "Delete task"}</span>
            <span className="context-menu-shortcut">Delete</span>
          </button>
        </div>
        );
      })()}

      {completedMenu && completedItems.length > 0 && (() => {
        const allInMyDay = completedItems.every((i) => i.myDayDate === todayStr);
        const allImportant = completedItems.every((i) => i.important);
        const closeCompletedMenu = () => {
          setCompletedMenu(null);
          setCompletedMoveOpen(false);
          setCompletedDatePickerOpen(false);
        };
        return (
          <div
            className="context-menu"
            style={{
              top: Math.max(8, Math.min(completedMenu.y, window.innerHeight - 440)),
              left: Math.max(8, Math.min(completedMenu.x, window.innerWidth - 280)),
              maxHeight: 'calc(100vh - 16px)',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="context-menu-item"
              onClick={async () => {
                const target = allInMyDay ? null : todayStr;
                closeCompletedMenu();
                await Promise.all(completedItems.map((item) => handleUpdateItem(item, { myDayDate: target })));
              }}
            >
              <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="sun" /></span>
              <span>{allInMyDay ? 'Remove from My Day' : 'Add to My Day'}</span>
              <span className="context-menu-shortcut">Ctrl+T</span>
            </button>
            <button
              type="button"
              className="context-menu-item"
              onClick={async () => {
                const target = !allImportant;
                closeCompletedMenu();
                await Promise.all(completedItems.map((item) => handleUpdateItem(item, { important: target })));
              }}
            >
              <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="star" /></span>
              <span>{allImportant ? 'Remove importance' : 'Mark as important'}</span>
            </button>
            <button
              type="button"
              className="context-menu-item"
              onClick={async () => {
                closeCompletedMenu();
                await Promise.all(completedItems.map((item) => handleUpdateItem(item, { done: false, completedAtMs: null })));
              }}
            >
              <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="check" /></span>
              <span>Mark as not completed</span>
            </button>
            <div className="account-popover-divider" />
            <button
              type="button"
              className="context-menu-item"
              onClick={async () => {
                closeCompletedMenu();
                await Promise.all(completedItems.map((item) => handleUpdateItem(item, { dueDate: todayStr })));
              }}
            >
              <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="calendar" /></span>
              <span>Due today</span>
            </button>
            <button
              type="button"
              className="context-menu-item"
              onClick={async () => {
                closeCompletedMenu();
                await Promise.all(completedItems.map((item) => handleUpdateItem(item, { dueDate: tomorrowStr })));
              }}
            >
              <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="calendar" /></span>
              <span>Due tomorrow</span>
            </button>
            <div className="context-menu-submenu-wrap">
              <button
                type="button"
                className="context-menu-item"
                onClick={(e) => {
                  e.stopPropagation();
                  setCompletedMoveOpen(false);
                  setCompletedDatePickerOpen((v) => !v);
                }}
              >
                <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="calendar" /></span>
                <span>Pick a date</span>
              </button>
              {completedDatePickerOpen && (
                <div
                  className="context-menu context-menu-submenu"
                  style={{
                    top: Math.max(8, Math.min(completedMenu.y + 120, window.innerHeight - 360)),
                    left: Math.max(8, Math.min(completedMenu.x + 252, window.innerWidth - 320)),
                    width: 'auto',
                    minWidth: 'unset',
                    maxWidth: 'none',
                    maxHeight: 'none',
                    overflow: 'visible',
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <CustomCalendarPicker
                    initialDate={todayStr}
                    todayStr={todayStr}
                    onSave={async (dateStr) => {
                      closeCompletedMenu();
                      await Promise.all(completedItems.map((item) => handleUpdateItem(item, { dueDate: dateStr })));
                    }}
                    onCancel={() => setCompletedDatePickerOpen(false)}
                  />
                </div>
              )}
            </div>
            <div className="account-popover-divider" />
            <div
              className="context-menu-submenu-wrap"
              onMouseEnter={(event) => {
                setCompletedDatePickerOpen(false);
                setCompletedMovePosition(getContextSubmenuPosition(event.currentTarget.getBoundingClientRect()));
                setCompletedMoveOpen(true);
              }}
              onMouseLeave={() => setCompletedMoveOpen(false)}
            >
              <button
                type="button"
                className="context-menu-item"
                onClick={(event) => {
                  setCompletedDatePickerOpen(false);
                  setCompletedMovePosition(getContextSubmenuPosition(event.currentTarget.getBoundingClientRect()));
                  setCompletedMoveOpen((v) => !v);
                }}
              >
                <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="move" /></span>
                <span>Move tasks to…</span>
                <span className="context-menu-arrow">›</span>
              </button>
              {completedMoveOpen && (
                <div className="context-menu context-menu-submenu" style={completedMovePosition ?? undefined}>
                  {allLists.map((l) => {
                    const isCurrent = selection.type === 'list' && l.id === selection.id;
                    return (
                      <button
                        key={l.id}
                        className="context-menu-item"
                        disabled={isCurrent}
                        onClick={async () => {
                          closeCompletedMenu();
                          await Promise.all(completedItems.map((item) => handleMoveToList(item, l.id)));
                        }}
                      >
                        <span className="context-menu-icon" aria-hidden="true">
                          {l.icon ? <span style={{ fontSize: '15px', lineHeight: 1 }}>{l.icon}</span> : <ContextMenuIcon kind="move" />}
                        </span>
                        <span>{l.title}</span>
                        {isCurrent && <span style={{ marginLeft: 'auto', opacity: 0.7 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="account-popover-divider" />
            <button
              type="button"
              className="context-menu-item danger"
              onClick={async () => {
                const count = completedItems.length;
                const snapshot = [...completedItems];
                closeCompletedMenu();
                const ok = await appConfirm({
                  title: 'Delete completed tasks',
                  message: `Delete all ${count} completed task(s)?`,
                  confirmLabel: 'Delete',
                  danger: true,
                });
                if (!ok) return;
                await Promise.all(snapshot.map((item) => handleDeleteItem(item)));
              }}
            >
              <span className="context-menu-icon" aria-hidden="true"><ContextMenuIcon kind="trash" /></span>
              <span>Delete tasks</span>
              <span className="context-menu-shortcut">Delete</span>
            </button>
          </div>
        );
      })()}

      {bulkPresence.shouldRender && (
        <div className={`bulk-bar ${bulkPresence.isExiting ? 'exiting' : ''}`} role="region" aria-label="Bulk actions">
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
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <span className="context-menu-icon" aria-hidden="true">
                          {l.icon ? <span style={{ fontSize: '15px', lineHeight: 1 }}>{l.icon}</span> : <ContextMenuIcon kind="move" />}
                        </span>
                        <span>{l.title}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="danger"
              onClick={async () => {
                if (
                  selectedIds.size > 1 &&
                  !(await appConfirm({
                    title: 'Delete tasks',
                    message: `Delete ${selectedIds.size} selected tasks?`,
                    confirmLabel: 'Delete',
                    danger: true,
                  }))
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

      {undoPresence.shouldRender && renderedUndoToast && (
        <div className={`undo-toast ${undoPresence.isExiting ? 'exiting' : ''}`}>
          <span>Deleted &ldquo;{renderedUndoToast.item.text}&rdquo;</span>
          <button onClick={handleUndoDelete}>Undo</button>
        </div>
      )}

      {clipboardPresence.shouldRender && renderedClipboard && (
        <div className={`clipboard-toast ${clipboardPresence.isExiting ? 'exiting' : ''}`} role="status" aria-live="polite">
          <span className="clipboard-toast-badge">
            {renderedClipboard.mode === 'cut' ? '✂ Cut' : '📋 Copied'} ({renderedClipboard.items.length})
          </span>
          <span>
            {renderedClipboard.items.length === 1
              ? `“${renderedClipboard.items[0].text}”`
              : `${renderedClipboard.items.length} tasks`}{' '}
            — press <kbd>Ctrl+V</kbd> in a list to paste
          </span>
          <span className="clipboard-toast-actions">
            <button
              type="button"
              className="clipboard-toast-paste"
              onClick={() => void handlePasteClipboard()}
            >
              Paste here
            </button>
            <button
              type="button"
              className="clipboard-toast-clear"
              onClick={() => setTaskClipboard(null)}
              aria-label="Clear clipboard"
              title="Clear clipboard"
            >
              ×
            </button>
          </span>
        </div>
      )}

      {clipboardToastPresence.shouldRender && renderedClipboardToast && (
        <div className={`undo-toast ${clipboardToastPresence.isExiting ? 'exiting' : ''}`} role="status" aria-live="polite">
          <span>{renderedClipboardToast}</span>
        </div>
      )}

      {backgroundUploadStatus && !listMenuOpen && (
        <div className={`undo-toast upload-progress-toast stage-${backgroundUploadStatus.stage}`} role="status" aria-live="polite">
          <div className="upload-toast-inner">
            <span>{backgroundUploadStatus.message}</span>
            {backgroundUploadStatus.stage !== 'error' && (
              <div className="theme-upload-bar-track">
                <div
                  className="theme-upload-bar-fill"
                  style={{ width: `${backgroundUploadStatus.progress}%` }}
                />
              </div>
            )}
          </div>
          {backgroundUploadStatus.stage === 'error' && (
            <button type="button" onClick={() => setBackgroundUploadStatus(null)}>
              Dismiss
            </button>
          )}
        </div>
      )}

      {listPickerPresence.shouldRender && renderedListPicker && (
        <div className={`modal-backdrop ${listPickerPresence.isExiting ? 'exiting' : ''}`} onClick={() => setListPickerMenu(null)}>
          <div
            className={`modal-card ${listPickerPresence.isExiting ? 'exiting' : ''}`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                const buttons = Array.from(
                  e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-list-picker-item="true"]:not(:disabled)')
                );
                if (buttons.length === 0) return;
                const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
                e.preventDefault();
                const next = e.key === 'ArrowDown'
                  ? (idx < buttons.length - 1 ? idx + 1 : 0)
                  : (idx > 0 ? idx - 1 : buttons.length - 1);
                buttons[next]?.focus();
              }
            }}
            role="dialog"
            aria-modal="true"
            aria-label={renderedListPicker.mode === 'move' ? 'Move to list' : 'Copy to list'}
            style={{ padding: "1rem", width: "300px", borderRadius: "10px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
              <h2 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600 }}>
                {renderedListPicker.mode === 'move' ? 'Move' : 'Copy'}{' '}
                {renderedListPicker.items.length > 1 ? `${renderedListPicker.items.length} tasks` : 'task'} to…
              </h2>
              <button type="button" className="icon-btn" onClick={() => setListPickerMenu(null)} aria-label="Close">×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", maxHeight: "320px", overflowY: "auto" }}>
              {(() => {
                const firstEnabledIdx = allLists.findIndex(
                  (l) => !(renderedListPicker.mode === 'move' && renderedListPicker.items.every((t) => t.listId === l.id))
                );
                return allLists.map((l, idx) => {
                  const allInThisList = renderedListPicker.items.every((t) => t.listId === l.id);
                  const disabled = renderedListPicker.mode === 'move' && allInThisList;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      data-list-picker-item="true"
                      autoFocus={idx === firstEnabledIdx}
                      disabled={disabled}
                      className="context-menu-item"
                      style={{ width: "100%", textAlign: "left", justifyContent: "space-between" }}
                      onClick={async () => {
                        const items = renderedListPicker.items;
                        const mode = renderedListPicker.mode;
                        setListPickerMenu(null);
                        if (mode === 'move') {
                          await Promise.all(items.map((t) => handleMoveToList(t, l.id)));
                          setSelectedIds(new Set());
                          showClipboardToast(`Moved ${items.length} task${items.length > 1 ? 's' : ''} to ${l.title}`);
                        } else {
                          await Promise.all(items.map((t) => handleCopyItemToList(t, l.id)));
                          showClipboardToast(`Copied ${items.length} task${items.length > 1 ? 's' : ''} to ${l.title}`);
                        }
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <span className="context-menu-icon" aria-hidden="true">
                          {l.icon ? <span style={{ fontSize: '15px', lineHeight: 1 }}>{l.icon}</span> : <ContextMenuIcon kind="move" />}
                        </span>
                        <span>{l.title}</span>
                      </span>
                      {allInThisList && <span style={{ opacity: 0.6, fontSize: "0.78rem" }}>Current</span>}
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {suggestionsPresence.shouldRender && (
          <aside className={`suggestions-pane ${suggestionsPresence.isExiting ? 'exiting' : ''}`} aria-label="Suggestions">
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

      {detailPresence.shouldRender && renderedDetailItem && (() => {
        const itemParentList = allLists.find((l) => l.id === renderedDetailItem.listId);
        return (
          <TaskDetail
            key={renderedDetailItem.id}
            item={renderedDetailItem}
            todayStr={todayStr}
            currentUserId={user?.uid ?? ''}
            listTitle={itemParentList?.title}
            listIcon={itemParentList?.icon}
            exiting={detailPresence.isExiting}
            onClose={() => setSelectedItemId(null)}
            onUpdate={handleUpdateItem}
            onDelete={handleDeleteItem}
          />
        );
      })()}
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
          <div className="modal-card shortcuts-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
            <div className="shortcuts-header">
              <h2>Keyboard shortcuts</h2>
              <button type="button" className="icon-btn" onClick={() => setShortcutsOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="shortcuts-grid">
              <div className="shortcuts-section">
                <h3>General &amp; Navigation</h3>
                <div className="shortcuts-row"><span>New task</span><span className="shortcuts-keys"><kbd>Ctrl+N</kbd><kbd>N</kbd></span></div>
                <div className="shortcuts-row"><span>Search tasks</span><span className="shortcuts-keys"><kbd>Ctrl+F</kbd><kbd>/</kbd></span></div>
                <div className="shortcuts-row"><span>New list</span><span className="shortcuts-keys"><kbd>Ctrl+Shift+L</kbd><kbd>L</kbd></span></div>
                <div className="shortcuts-row"><span>Toggle sidebar</span><span className="shortcuts-keys"><kbd>Ctrl+B</kbd><kbd>Ctrl+1</kbd></span></div>
                <div className="shortcuts-row"><span>Switch smart lists</span><span className="shortcuts-keys"><kbd>1</kbd>–<kbd>8</kbd></span></div>
                <div className="shortcuts-row"><span>Previous / Next list</span><span className="shortcuts-keys"><kbd>[</kbd><kbd>]</kbd></span></div>
                <div className="shortcuts-row"><span>Toggle List / Grid view</span><kbd>V</kbd></div>
                <div className="shortcuts-row"><span>Toggle Completed section</span><span className="shortcuts-keys"><kbd>Ctrl+Shift+C</kbd><kbd>C</kbd></span></div>
                <div className="shortcuts-row"><span>Toggle Dark / Light theme</span><kbd>Ctrl+Shift+D</kbd></div>
                <div className="shortcuts-row"><span>Open Settings</span><kbd>Ctrl+,</kbd></div>
                <div className="shortcuts-row"><span>Shortcuts help</span><span className="shortcuts-keys"><kbd>?</kbd><kbd>Ctrl+/</kbd></span></div>
                <div className="shortcuts-row"><span>Close / Clear selection</span><kbd>Esc</kbd></div>
              </div>
              <div className="shortcuts-section">
                <h3>Task List &amp; Actions</h3>
                <div className="shortcuts-row"><span>Next / Previous task</span><span className="shortcuts-keys"><kbd>↓</kbd><kbd>↑</kbd> / <kbd>J</kbd><kbd>K</kbd></span></div>
                <div className="shortcuts-row"><span>Multi-select range</span><span className="shortcuts-keys"><kbd>Shift+↓</kbd><kbd>Shift+↑</kbd></span></div>
                <div className="shortcuts-row"><span>Select all active tasks</span><kbd>Ctrl+A</kbd></div>
                <div className="shortcuts-row"><span>Mark / Unmark complete</span><span className="shortcuts-keys"><kbd>Ctrl+M</kbd><kbd>Ctrl+U</kbd></span></div>
                <div className="shortcuts-row"><span>Toggle complete</span><span className="shortcuts-keys"><kbd>Space</kbd><kbd>X</kbd></span></div>
                <div className="shortcuts-row"><span>Move / Copy to list menu</span><span className="shortcuts-keys"><kbd>M</kbd><kbd>C</kbd></span></div>
                <div className="shortcuts-row"><span>Copy / Cut / Paste tasks</span><span className="shortcuts-keys"><kbd>Ctrl+C</kbd><kbd>Ctrl+X</kbd><kbd>Ctrl+V</kbd></span></div>
                <div className="shortcuts-row"><span>Toggle My Day</span><span className="shortcuts-keys"><kbd>Ctrl+T</kbd><kbd>T</kbd></span></div>
                <div className="shortcuts-row"><span>Toggle Important</span><span className="shortcuts-keys"><kbd>S</kbd><kbd>I</kbd></span></div>
                <div className="shortcuts-row"><span>Due Today / Tomorrow</span><span className="shortcuts-keys"><kbd>D</kbd><kbd>Shift+D</kbd></span></div>
                <div className="shortcuts-row"><span>Reorder task up / down</span><span className="shortcuts-keys"><kbd>Alt+↑</kbd><kbd>Alt+↓</kbd></span></div>
                <div className="shortcuts-row"><span>Delete selected task(s)</span><span className="shortcuts-keys"><kbd>Del</kbd><kbd>Backspace</kbd></span></div>
                <div className="shortcuts-row"><span>Undo (multi-step)</span><kbd>Ctrl+Z</kbd></div>
                <h3 style={{ marginTop: "0.75rem" }}>Task Detail Pane</h3>
                <div className="shortcuts-row"><span>Open / Focus title</span><span className="shortcuts-keys"><kbd>Enter</kbd><kbd>O</kbd><kbd>E</kbd></span></div>
                <div className="shortcuts-row"><span>Add a step</span><kbd>A</kbd></div>
                <div className="shortcuts-row"><span>Focus notes</span><kbd>Shift+M</kbd></div>
              </div>
            </div>
          </div>
        </div>
      )}
      {settingsOpen && (
        <SettingsModal
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
              const existing = targetList.memberUids ?? [];
              await updateDoc(doc(db, 'lists', targetList.id), {
                memberUids: existing.filter((m) => m !== uid),
              });
            }}
            onClose={() => setShareListId(null)}
          />
        );
      })()}
      <AppDialogModal />
    </div>
    {(() => {
      const targetList =
        printListId && printListId !== '__current__'
          ? allLists.find((l) => l.id === printListId) ?? null
          : null;
      const pTitle = targetList ? targetList.title : currentTitle;
      const pIcon = targetList ? targetList.icon ?? null : currentList?.icon ?? null;
      const pItems = targetList
        ? allItems
            .filter((i) => i.listId === targetList.id)
            .sort((a, b) => getTaskSortOrder(a) - getTaskSortOrder(b))
        : null;
      const pActive = pItems ? pItems.filter((i) => !i.done) : activeItems;
      const pCompleted = pItems ? pItems.filter((i) => i.done) : completedItems;
      const pShowListName = !targetList && (selection.type === 'smart' || searchQuery.trim() !== '');
      return (
        <>
          <div className="print-sheet-root">
            <PrintSheet
              title={pTitle}
              icon={pIcon}
              activeItems={pActive}
              completedItems={pCompleted}
              lists={allLists}
              showListName={pShowListName}
              todayStr={todayStr}
              options={printOptions}
            />
          </div>
          {printListId && (
            <PrintModal
              title={pTitle}
              icon={pIcon}
              activeItems={pActive}
              completedItems={pCompleted}
              lists={allLists}
              showListName={pShowListName}
              todayStr={todayStr}
              options={printOptions}
              onChangeOptions={setPrintOptions}
              onPrint={() => window.print()}
              onClose={() => setPrintListId(null)}
            />
          )}
        </>
      );
    })()}
    </>
  );
}

export default App;
