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
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const updateAppSettings = (patch: Partial<AppSettings>) => {
    setAppSettings((prev) => {
      const next = { ...prev, ...patch };
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
  const [suggestionsOpen, setSuggestionsOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [gridEditId, setGridEditId] = useState<string | null>(null);
  const [gridEditText, setGridEditText] = useState('');

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
    if (selection.type === 'smart' && selection.id === 'my-day') {
      setSuggestionsOpen(true);
    }
  }, [selection]);

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
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setContextMenu(null);
        setSelectedItemId(null);
      }
    };
    const onClick = () => setContextMenu(null);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('click', onClick);
    };
  }, []);

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
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
  }, []);

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
        setLists(
          snap.docs.map((d) => ({
            id: d.id,
            title: (d.data().title as string) || 'Untitled',
            ownerUid: d.data().ownerUid as string,
          }))
        );
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
        setGroups(
          snap.docs.map((d) => ({
            id: d.id,
            title: (d.data().title as string) || 'Group',
            ownerUid: d.data().ownerUid as string,
            collapsed: Boolean(d.data().collapsed),
          }))
        );
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
        setSharedLists(
          snap.docs.map((d) => ({
            id: d.id,
            title: (d.data().title as string) || 'Untitled',
            ownerUid: d.data().ownerUid as string,
          }))
        );
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
    return Array.from(map.values());
  }, [lists, sharedLists]);

  const currentTitle = searchQuery.trim()
    ? `Search: "${searchQuery.trim()}"`
    : selection.type === 'smart'
      ? SMART_TITLES[selection.id]
      : lists.find((l) => l.id === selection.id)?.title ?? 'List';

  const ensureDefaultList = async (): Promise<string> => {
    if (selection.type === 'list') return selection.id;
    if (defaultTasksList) return defaultTasksList.id;
    const ref = await addDoc(collection(db, 'lists'), {
      title: 'Tasks',
      isDefaultTasksList: true,
      ownerUid: user!.uid,
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
        dueDate:
          selection.type === 'smart' && selection.id === 'planned'
            ? todayStr
            : null,
        notes: '',
        category: null,
        steps: [],
        createdAtMs: Date.now(),
        completedAtMs: null,
      });
      setNewItemText('');
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
    <div className={`app-shell ${darkMode ? 'dark' : ''}`}>
      <TopBar
        user={user}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onToggleSidebar={() => {
          if (window.innerWidth < 1024) {
            setSidebarOpen((v) => !v);
          } else {
            setSidebarCollapsed((v) => !v);
          }
        }}
        onOpenSettings={() => {
          setSortMenuOpen(false);
          setGroupMenuOpen(false);
          setListMenuOpen(false);
          setContextMenu(null);
          setSettingsOpen(true);
        }}
        onSignOut={() => signOutUser()}
      />
      <div className="app-body">
        <Sidebar
          lists={allLists.filter((l) => l.id !== defaultTasksList?.id)}
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
          onRenameList={async (id, title) => {
            await updateDoc(doc(db, 'lists', id), { title });
          }}
          onRenameGroup={async (id, title) => {
            await updateDoc(doc(db, 'groups', id), { title });
          }}
          onUngroupLists={async (id) => {
            await Promise.all([
              ...allLists.filter((x) => x.groupId === id).map((l) => updateDoc(doc(db, 'lists', l.id), { groupId: null })),
              deleteDoc(doc(db, 'groups', id)),
            ]);
          }}
        />
        <main className="main-pane">
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
              <input
                ref={headerTitleInputRef}
                className="header-title-input"
                value={currentTitle}
                onChange={(e) => {
                  const val = e.target.value;
                  setLists((prev) =>
                    prev.map((l) =>
                      l.id === selection.id ? { ...l, title: val } : l
                    )
                  );
                }}
                onBlur={(e) => {
                  const trimmed = e.target.value.trim();
                  if (trimmed) {
                    updateDoc(doc(db, 'lists', selection.id), {
                      title: trimmed,
                    });
                  }
                }}
              />
            ) : (
              <h2>{currentTitle}</h2>
            )}
            {selection.type === 'smart' &&
              selection.id === 'my-day' &&
              !searchQuery && (
                <p className="subtitle">
                  {new Date().toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              )}
          </div>
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
            className="sort-select"
            onClick={() => window.print()}
            title="Print list"
          >
            Print
          </button>
          <div className="header-menu-wrap" style={{ position: "relative" }}>
            <button
              type="button"
              className="sort-select"
              onClick={() => { setSortMenuOpen((v) => !v); setGroupMenuOpen(false); }}
              aria-haspopup="menu"
              aria-expanded={sortMenuOpen}
            >
              Sort
            </button>
            {sortMenuOpen && (
              <div className="top-bar-popover" role="menu" style={{ minWidth: "200px" }}>
                {([
                  { id: 'importance', label: 'Importance' },
                  { id: 'dueDate', label: 'Due date' },
                  ...(selection.type === 'smart' && selection.id === 'my-day' ? [] : [{ id: 'myDay', label: 'Added to My Day' }]),
                  { id: 'alphabetical', label: 'Alphabetically' },
                  { id: 'created', label: 'Creation date' },
                ] as { id: SortOption; label: string }[]).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={sortBy === opt.id}
                    className="account-popover-item"
                    onClick={() => {
                      setSortBy(opt.id);
                      setSortAsc(opt.id === 'importance' || opt.id === 'myDay' ? false : true);
                      setSortMenuOpen(false);
                    }}
                  >
                    {sortBy === opt.id ? "✓ " : "  "}{opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="header-menu-wrap" style={{ position: "relative" }}>
            <button
              type="button"
              className="sort-select"
              onClick={() => { setGroupMenuOpen((v) => !v); setSortMenuOpen(false); }}
              aria-haspopup="menu"
              aria-expanded={groupMenuOpen}
            >
              Group
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
          <div className="header-menu-wrap" style={{ position: "relative" }}>
            <button
              type="button"
              className="sort-select"
              onClick={() => { setListMenuOpen((v) => !v); setSortMenuOpen(false); setGroupMenuOpen(false); }}
              aria-label="List options"
              aria-haspopup="menu"
              aria-expanded={listMenuOpen}
            >
              …
            </button>
            {listMenuOpen && (
              <div className="top-bar-popover" role="menu" style={{ minWidth: "220px" }}>
                {selection.type === 'smart' ? (
                  <button type="button" role="menuitem" className="account-popover-item" onClick={() => { setListMenuOpen(false); window.print(); }}>
                    Print list
                  </button>
                ) : (
                  <>
                    <button type="button" role="menuitem" className="account-popover-item" onClick={() => { setListMenuOpen(false); headerTitleInputRef.current?.focus(); }}>
                      Rename list
                    </button>
                    <div className="account-popover-item" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "default" }}>
                      <span>Change theme</span>
                      <span style={{ display: "flex", gap: "6px" }}>
                        {["#0078d4", "#e74856", "#8764b8", "#107c10", "#0099bc"].map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={`Theme ${c}`}
                            onClick={async () => {
                              await updateDoc(doc(db, "lists", selection.id), { color: c });
                              setListMenuOpen(false);
                            }}
                            style={{ width: "16px", height: "16px", borderRadius: "50%", border: "none", background: c, cursor: "pointer" }}
                          />
                        ))}
                      </span>
                    </div>
                    <button type="button" role="menuitem" className="account-popover-item" onClick={() => { setListMenuOpen(false); window.print(); }}>
                      Print list
                    </button>
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
              className="sort-select"
              onClick={() => setSuggestionsOpen((v) => !v)}
              aria-pressed={suggestionsOpen}
            >
              💡 Suggestions
            </button>
          )}
          {selection.type === 'list' && (
            <>
              <button
                className="sort-select"
                onClick={() => handleDuplicateList(selection.id)}
              >
                Duplicate
              </button>
              <button
                className="sort-select"
                onClick={() => { setSortMenuOpen(false); setGroupMenuOpen(false); setListMenuOpen(false); setContextMenu(null); setShareListId(selection.id); }}
              >
                Share
              </button>
            </>
          )}
        </header>

        {(sortBy !== 'position' || groupByCategory) && (
          <div className="sort-pill-bar" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", fontSize: "0.85rem", flexWrap: "wrap" }}>{sortBy !== 'position' && (
            <span className="sort-pill" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "3px 10px", display: "inline-flex", alignItems: "center", gap: "8px" }}>
              <span>Sorted by {({
  position: 'position',
  importance: 'importance',
  dueDate: 'due date',
  myDay: 'added to My Day',
  alphabetical: 'alphabetical',
  created: 'creation date',
}[sortBy])}</span>
              <button type="button" onClick={() => setSortAsc((v) => !v)} title="Reverse sort order" aria-label="Reverse sort order" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text)" }}>⇅</button>
              <button type="button" onClick={() => setSortBy("position")} title="Remove sort order" aria-label="Remove sort order" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text)" }}>×</button>
            </span>)}
            {groupByCategory && (
              <span className="sort-pill" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "3px 10px", display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <span>Grouped by categories</span>
                <button type="button" onClick={() => setGroupByCategory(false)} title="Remove grouping" aria-label="Remove grouping" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text)" }}>×</button>
              </span>
            )}
          </div>
        )}

        {!searchQuery && viewMode === 'list' && selection.id !== 'completed' && selection.id !== 'flagged-email' && selection.id !== 'assigned-to-me' && (
          <form className="add-task-bar top-add-task" onSubmit={handleAddItem} style={{ marginBottom: "10px", flexDirection: "column", alignItems: "stretch", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span className="add-circle" />
              <input
                type="text"
                placeholder="Add a task"
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
            <div className="add-picker-wrap" style={{ display: "flex", alignItems: "center", gap: "10px", paddingLeft: "28px", fontSize: "0.8rem", color: "var(--text-2)" }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button type="button" className="chip-btn" onClick={() => { setAddDueMenuOpen((v) => !v); setAddRepeatMenuOpen(false); }} title="Add due date">
                  📅 {addDueDate ? `Due: ${addDueDate}` : "Due date"}
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
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button type="button" className="chip-btn" onClick={() => { setAddRemindMenuOpen((v) => !v); setAddDueMenuOpen(false); setAddRepeatMenuOpen(false); setAddDueCalendarOpen(false); setAddRemindCalendarOpen(false); }} title="Remind me">
                  🔔 {addReminderAtMs ? new Date(addReminderAtMs).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Remind me'}
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
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button type="button" className="chip-btn" onClick={() => { setAddRepeatMenuOpen((v) => !v); setAddDueMenuOpen(false); }} title="Repeat">
                  🔁 {addRepeat !== "none" ? addRepeat : "Repeat"}
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
              {/\btomorrow\b$/i.test(newItemText.trim()) && <span style={{ color: "var(--accent)" }}>Due: Tomorrow</span>}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.82rem', color: 'var(--text-2)', marginBottom: '0.75rem', padding: '0 4px' }}>
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
                  <li
                    key={item.id}
                    className={`task-row ${
                selectedItemId === item.id || selectedIds.has(item.id)
                  ? 'selected'
                  : ''
              }`}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, item });
                    }}
                  >
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
                    <button
                      className="task-body"
                      onClick={(e) => {
                  if (e.ctrlKey || e.metaKey) {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.id)) next.delete(item.id);
                      else next.add(item.id);
                      return next;
                    });
                    setLastSelectedId(item.id);
                  } else if (e.shiftKey && lastSelectedId) {
                    const idxA = activeItems.findIndex(
                      (t) => t.id === lastSelectedId
                    );
                    const idxB = activeItems.findIndex((t) => t.id === item.id);
                    if (idxA !== -1 && idxB !== -1) {
                      const [start, end] =
                        idxA < idxB ? [idxA, idxB] : [idxB, idxA];
                      const rangeIds = activeItems
                        .slice(start, end + 1)
                        .map((t) => t.id);
                      setSelectedIds(new Set(rangeIds));
                    }
                  } else {
                    setSelectedIds(new Set());
                    setSelectedItemId(item.id);
                    setLastSelectedId(item.id);
                  }
                }}
                    >
                      <span className="task-title">{item.text}</span>
                      {(selection.type === 'smart' || searchQuery.trim() || item.dueDate || item.reminderAtMs || (item.repeat && item.repeat !== 'none')) && (
                        <div className="task-meta" style={{ fontSize: '0.78rem', color: 'var(--text-2)', display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                          {(selection.type === 'smart' || searchQuery.trim()) && (
                            <span>{allLists.find((l) => l.id === item.listId)?.title ?? 'Tasks'}</span>
                          )}
                          {item.dueDate && <span>Due {item.dueDate === todayStr ? 'Today' : item.dueDate === tomorrowStr ? 'Tomorrow' : item.dueDate}</span>}
                          {item.reminderAtMs && <span>🔔</span>}
                          {item.repeat && item.repeat !== 'none' && <span>🔁</span>}
                        </div>
                      )}
                      <span className="task-meta">
                        {item.dueDate && (
                          <span
                            className={
                              item.dueDate < todayStr
                                ? 'due-overdue'
                                : item.dueDate === todayStr
                                  ? 'due-today'
                                  : ''
                            }
                          >
                            📅 {item.dueDate}
                          </span>
                        )}
                      </span>
                    </button>
                    <button
                      className={`star-btn ${item.important ? 'active' : ''}`}
                      onClick={() =>
                        handleUpdateItem(item, { important: !item.important })
                      }
                      title="Mark as important"
                    >
                      {item.important ? '★' : '☆'}
                    </button>
                  </li>
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
                      )}
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
        <ul className="task-list">
          {activeItems.map((item) => (
            <li
              key={item.id}
              className={`task-row ${
                selectedItemId === item.id || selectedIds.has(item.id)
                  ? 'selected'
                  : ''
              }`}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, item });
              }}
            >
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
              <button
                className="task-body"
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey) {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.id)) next.delete(item.id);
                      else next.add(item.id);
                      return next;
                    });
                    setLastSelectedId(item.id);
                  } else if (e.shiftKey && lastSelectedId) {
                    const idxA = activeItems.findIndex(
                      (t) => t.id === lastSelectedId
                    );
                    const idxB = activeItems.findIndex((t) => t.id === item.id);
                    if (idxA !== -1 && idxB !== -1) {
                      const [start, end] =
                        idxA < idxB ? [idxA, idxB] : [idxB, idxA];
                      const rangeIds = activeItems
                        .slice(start, end + 1)
                        .map((t) => t.id);
                      setSelectedIds(new Set(rangeIds));
                    }
                  } else {
                    setSelectedIds(new Set());
                    setSelectedItemId(item.id);
                    setLastSelectedId(item.id);
                  }
                }}
              >
                <span className="task-title">{item.text}</span>
                      {(selection.type === 'smart' || searchQuery.trim() || item.dueDate || item.reminderAtMs || (item.repeat && item.repeat !== 'none')) && (
                        <div className="task-meta" style={{ fontSize: '0.78rem', color: 'var(--text-2)', display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                          {(selection.type === 'smart' || searchQuery.trim()) && (
                            <span>{allLists.find((l) => l.id === item.listId)?.title ?? 'Tasks'}</span>
                          )}
                          {item.dueDate && <span>Due {item.dueDate === todayStr ? 'Today' : item.dueDate === tomorrowStr ? 'Tomorrow' : item.dueDate}</span>}
                          {item.reminderAtMs && <span>🔔</span>}
                          {item.repeat && item.repeat !== 'none' && <span>🔁</span>}
                        </div>
                      )}
                <span className="task-meta">
                  {item.myDayDate === todayStr && <span>☀️ My Day</span>}
                  {item.dueDate && (
                    <span
                      className={
                        item.dueDate < todayStr
                          ? 'due-overdue'
                          : item.dueDate === todayStr
                            ? 'due-today'
                            : ''
                      }
                    >
                      📅 {item.dueDate}
                    </span>
                  )}
                  {item.steps.length > 0 && (
                    <span>
                      ✓ {item.steps.filter((s) => s.done).length}/
                      {item.steps.length}
                    </span>
                  )}
                  {item.notes && <span>📝 Note</span>}
                </span>
              </button>
              <button
                className={`star-btn ${item.important ? 'active' : ''}`}
                onClick={() =>
                  handleUpdateItem(item, { important: !item.important })
                }
                title="Mark as important"
              >
                {item.important ? '★' : '☆'}
              </button>
            </li>
          ))}
        </ul>
        )
        )}

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
                  <li key={item.id} className="task-row done">
                    <input
                      type="checkbox"
                      className="circle-check"
                      checked={item.done}
                      onChange={() =>
                        handleUpdateItem(item, {
                          done: false,
                          completedAtMs: null,
                        })
                      }
                    />
                    <button
                      className="task-body"
                      onClick={(e) => {
                  if (e.ctrlKey || e.metaKey) {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.id)) next.delete(item.id);
                      else next.add(item.id);
                      return next;
                    });
                    setLastSelectedId(item.id);
                  } else if (e.shiftKey && lastSelectedId) {
                    const idxA = activeItems.findIndex(
                      (t) => t.id === lastSelectedId
                    );
                    const idxB = activeItems.findIndex((t) => t.id === item.id);
                    if (idxA !== -1 && idxB !== -1) {
                      const [start, end] =
                        idxA < idxB ? [idxA, idxB] : [idxB, idxA];
                      const rangeIds = activeItems
                        .slice(start, end + 1)
                        .map((t) => t.id);
                      setSelectedIds(new Set(rangeIds));
                    }
                  } else {
                    setSelectedIds(new Set());
                    setSelectedItemId(item.id);
                    setLastSelectedId(item.id);
                  }
                }}
                    >
                      <span className="task-title">{item.text}</span>
                      {(selection.type === 'smart' || searchQuery.trim() || item.dueDate || item.reminderAtMs || (item.repeat && item.repeat !== 'none')) && (
                        <div className="task-meta" style={{ fontSize: '0.78rem', color: 'var(--text-2)', display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                          {(selection.type === 'smart' || searchQuery.trim()) && (
                            <span>{allLists.find((l) => l.id === item.listId)?.title ?? 'Tasks'}</span>
                          )}
                          {item.dueDate && <span>Due {item.dueDate === todayStr ? 'Today' : item.dueDate === tomorrowStr ? 'Tomorrow' : item.dueDate}</span>}
                          {item.reminderAtMs && <span>🔔</span>}
                          {item.repeat && item.repeat !== 'none' && <span>🔁</span>}
                        </div>
                      )}
                    </button>
                    <button
                      className={`star-btn ${item.important ? 'active' : ''}`}
                      onClick={() =>
                        handleUpdateItem(item, { important: !item.important })
                      }
                    >
                      {item.important ? '★' : '☆'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        </div>

        
        {!searchQuery && activeItems.length === 0 && !(selection.type === 'smart' && (selection.id === 'flagged-email' || selection.id === 'assigned-to-me')) && (
          <div className="empty-state" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-2)' }}>
            <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)', marginBottom: '0.25rem' }}>
              {selection.type === 'smart' && selection.id === 'my-day'
                ? 'Focus on your day'
                : 'No tasks yet'}
            </div>
            <div style={{ fontSize: '0.9rem' }}>
              {selection.type === 'smart' && selection.id === 'my-day'
                ? 'Get things done with My Day, a list that refreshes every day.'
                : selection.type === 'smart' && selection.id === 'important'
                ? 'Try starring some tasks to see them here.'
                : selection.type === 'smart' && selection.id === 'planned'
                ? 'Tasks with due dates or reminders show up here.'
                : selection.type === 'smart' && selection.id === 'completed'
                ? 'Tasks you complete show up here.'
                : 'Add a task above to get started.'}
            </div>
          </div>
        )}

        {selection.type === 'smart' &&
          selection.id === 'flagged-email' &&
          !searchQuery && (
            <div className="empty-state" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-2)' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ marginBottom: '0.75rem' }}>
                <rect x="2" y="4" width="20" height="16" rx="2" stroke="var(--text-3)" strokeWidth="1.5" />
                <path d="M2 7l10 6 10-6" stroke="var(--text-3)" strokeWidth="1.5" />
                <path d="M17 3v9m0-9h4l-1.2 2L21 7h-4" fill="#0078d4" stroke="#0078d4" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)', marginBottom: '0.25rem' }}>Tasks from flagged email</div>
              <div style={{ fontSize: '0.9rem' }}>Messages you flag will show up as tasks here.</div>
              {!appSettings.connectedFlaggedEmail && (
                <div style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: 'var(--text-3)' }}>Turn on Flagged email in Connected apps to receive flagged messages.</div>
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
          style={{ top: contextMenu.y, left: contextMenu.x, minWidth: "220px" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              const isMyDay = contextMenu.item.myDayDate === todayStr;
              handleUpdateItem(contextMenu.item, { myDayDate: isMyDay ? null : todayStr });
              setContextMenu(null);
            }}
          >
            {contextMenu.item.myDayDate === todayStr ? "Remove from My Day" : "Add to My Day"}
          </button>
          <button
            onClick={() => {
              handleUpdateItem(contextMenu.item, { important: !contextMenu.item.important });
              setContextMenu(null);
            }}
          >
            {contextMenu.item.important ? "Remove importance" : "Mark as important"}
          </button>
          <button
            onClick={() => {
              handleUpdateItem(contextMenu.item, { done: !contextMenu.item.done, completedAtMs: !contextMenu.item.done ? Date.now() : null });
              setContextMenu(null);
            }}
          >
            {contextMenu.item.done ? "Mark as not completed" : "Mark as completed"}
          </button>
          <button
            onClick={() => {
              handleUpdateItem(contextMenu.item, { dueDate: todayStr });
              setContextMenu(null);
            }}
          >
            Due today
          </button>
          <button
            onClick={() => {
              handleUpdateItem(contextMenu.item, { dueDate: tomorrowStr });
              setContextMenu(null);
            }}
          >
            Due tomorrow
          </button>
          <button
            onClick={async () => {
              if (!user) return;
              const ref = await addDoc(collection(db, "lists"), { title: contextMenu.item.text, ownerUid: user.uid, createdAt: serverTimestamp() });
              await handleMoveToList(contextMenu.item, ref.id);
              setContextMenu(null);
            }}
          >
            Create new list from this task
          </button>
          <div style={{ position: "relative" }} onMouseEnter={() => setTaskSubmenu("move")} onMouseLeave={() => setTaskSubmenu(null)}>
            <button type="button" style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
              <span>Move task to…</span><span>▸</span>
            </button>
            {taskSubmenu === "move" && (
              <div className="context-menu" style={{ position: "absolute", left: "100%", top: 0, minWidth: "180px" }}>
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
          <div style={{ position: "relative" }} onMouseEnter={() => setTaskSubmenu("copy")} onMouseLeave={() => setTaskSubmenu(null)}>
            <button type="button" style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
              <span>Copy task to…</span><span>▸</span>
            </button>
            {taskSubmenu === "copy" && (
              <div className="context-menu" style={{ position: "absolute", left: "100%", top: 0, minWidth: "180px" }}>
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
            className="danger"
            onClick={() => {
              handleDeleteItem(contextMenu.item);
              setContextMenu(null);
            }}
          >
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
      {shortcutsOpen && (
        <div className="modal-backdrop" onClick={() => setShortcutsOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ padding: "1.25rem", width: "360px", background: "var(--surface)", color: "var(--text)", borderRadius: "8px", border: "1px solid var(--border)" }}>
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
