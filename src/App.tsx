import { FormEvent, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  addDoc,
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
};

const SMART_COLORS: Record<SmartListId, string> = {
  'my-day': '#4c6ef5',
  important: '#e11d48',
  planned: '#0d9488',
  'assigned-to-me': '#0284c7',
  'flagged-email': '#b91c1c',
  tasks: '#4f46e5',
};

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [lists, setLists] = useState<TodoList[]>([]);
  const [groups, setGroups] = useState<TodoGroup[]>([]);
  const [allItems, setAllItems] = useState<TodoItem[]>([]);
  const [selection, setSelection] = useState<ViewSelection>({
    type: 'smart',
    id: 'my-day',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [newItemText, setNewItemText] = useState('');
  const [showCompleted, setShowCompleted] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('created');
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem('todo-dark') !== '0'
  );
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
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
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

    return () => {
      unsubLists();
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
    };
    for (const item of allItems) {
      if (item.done) continue;
      result.tasks += 1;
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
        return allItems.filter((i) => i.myDayDate === todayStr);
      case 'important':
        return allItems.filter((i) => i.important);
      case 'planned':
        return allItems.filter((i) => Boolean(i.dueDate));
      case 'assigned-to-me':
      case 'flagged-email':
        return [];
      case 'tasks':
      default:
        return allItems;
    }
  }, [allItems, searchQuery, selection, todayStr]);

  const sortedVisible = useMemo(() => {
    const arr = [...visibleItems];
    if (sortBy === 'importance') {
      arr.sort((a, b) => Number(b.important) - Number(a.important));
    } else if (sortBy === 'dueDate') {
      arr.sort((a, b) =>
        (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99')
      );
    } else if (sortBy === 'alphabetical') {
      arr.sort((a, b) => a.text.localeCompare(b.text));
    }
    return arr;
  }, [visibleItems, sortBy]);

  const activeItems = sortedVisible.filter((i) => !i.done);
  const completedItems = sortedVisible.filter((i) => i.done);
  const selectedItem =
    allItems.find((i) => i.id === selectedItemId) ?? null;

  const currentTitle = searchQuery.trim()
    ? `Search: "${searchQuery.trim()}"`
    : selection.type === 'smart'
      ? SMART_TITLES[selection.id]
      : lists.find((l) => l.id === selection.id)?.title ?? 'List';

  const ensureDefaultList = async (): Promise<string> => {
    if (selection.type === 'list') return selection.id;
    if (lists.length > 0) return lists[0].id;
    const ref = await addDoc(collection(db, 'lists'), {
      title: 'Tasks',
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
    await updateDoc(doc(db, 'lists', item.listId, 'items', item.id), patch);
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
          notes: item.notes,
          steps: item.steps.map((s) => ({ ...s, done: false })),
          createdAtMs: Date.now(),
          completedAtMs: null,
        });
      }
    }
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

  const headerColor =
    selection.type === 'smart' ? SMART_COLORS[selection.id] : '#4c6ef5';

  return (
    <div className={`app-shell ${darkMode ? 'dark' : ''}`}>
      <Sidebar
        user={user}
        lists={lists}
        groups={groups}
        selection={selection}
        searchQuery={searchQuery}
        counts={counts}
        isOpen={sidebarOpen}
        darkMode={darkMode}
        soundEnabled={soundEnabled}
        onToggleDarkMode={() => {
          setDarkMode((v) => {
            localStorage.setItem('todo-dark', v ? '0' : '1');
            return !v;
          });
        }}
        onToggleSound={() => {
          setSoundEnabled((v) => {
            localStorage.setItem('todo-sound', v ? '0' : '1');
            return !v;
          });
        }}
        onClose={() => setSidebarOpen(false)}
        onSelect={setSelection}
        onSearchChange={setSearchQuery}
        onCreateList={handleCreateList}
        onCreateGroup={handleCreateGroup}
        onToggleGroup={handleToggleGroup}
        onDeleteList={handleDeleteList}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onSignOut={() => signOutUser()}
      />

      <main
        className="main-pane"
        style={{
          background: `linear-gradient(180deg, ${headerColor} 0%, ${headerColor} 120px, var(--bg-main) 120px)`,
        }}
      >
        <header className="main-header">
          <button
            className="menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>
          <div className="header-titles">
            <h2>{currentTitle}</h2>
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
          <select
            className="sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            aria-label="Sort tasks"
          >
            <option value="created">Sort: Default</option>
            <option value="importance">Sort: Importance</option>
            <option value="dueDate">Sort: Due date</option>
            <option value="alphabetical">Sort: A-Z</option>
          </select>
        </header>

        {error && <p className="error">{error}</p>}

        <div className="tasks-scroll">
          <ul className="task-list">
          {activeItems.map((item) => (
            <li
              key={item.id}
              className={`task-row ${selectedItemId === item.id ? 'selected' : ''}`}
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
                onClick={() => setSelectedItemId(item.id)}
              >
                <span className="task-title">{item.text}</span>
                <span className="task-meta">
                  {item.myDayDate === todayStr && <span>☀️ My Day</span>}
                  {item.dueDate && <span>📅 {item.dueDate}</span>}
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
                      onClick={() => setSelectedItemId(item.id)}
                    >
                      <span className="task-title">{item.text}</span>
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

        {selection.type === 'smart' &&
          selection.id === 'flagged-email' &&
          !searchQuery && (
            <p className="notice">
              No flagged emails — Outlook/flagged-email import is V2.
            </p>
          )}

        {selection.type === 'smart' &&
          selection.id === 'assigned-to-me' &&
          !searchQuery && (
            <p className="notice">No tasks assigned to you yet.</p>
          )}

        {!searchQuery &&
          selection.id !== 'flagged-email' &&
          selection.id !== 'assigned-to-me' && (
          <form className="add-task-bar" onSubmit={handleAddItem}>
            <span className="add-circle" />
            <input
              type="text"
              placeholder="Try typing 'Buy groceries' or 'Pay utilities'"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onPaste={async (e) => {
                const text = e.clipboardData.getData('text');
                const lines = text
                  .split(/\r?\n/)
                  .map((l) => l.trim())
                  .filter(Boolean);
                if (lines.length > 1 && user) {
                  e.preventDefault();
                  const targetListId = await ensureDefaultList();
                  await Promise.all(
                    lines.map((line) =>
                      addDoc(collection(db, 'lists', targetListId, 'items'), {
                        listId: targetListId,
                        ownerUid: user.uid,
                        text: line,
                        done: false,
                        important: false,
                        myDayDate:
                          selection.type === 'smart' &&
                          selection.id === 'my-day'
                            ? todayStr
                            : null,
                        dueDate: null,
                        notes: '',
                        steps: [],
                        createdAtMs: Date.now(),
                        completedAtMs: null,
                      })
                    )
                  );
                }
              }}
            />
            {newItemText.trim() && (
              <button className="primary small" type="submit">
                Add
              </button>
            )}
          </form>
        )}
      </main>

      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              const isMyDay = contextMenu.item.myDayDate === todayStr;
              handleUpdateItem(contextMenu.item, {
                myDayDate: isMyDay ? null : todayStr,
              });
              setContextMenu(null);
            }}
          >
            {contextMenu.item.myDayDate === todayStr
              ? 'Remove from My Day'
              : 'Add to My Day'}
          </button>
          <button
            onClick={() => {
              handleUpdateItem(contextMenu.item, {
                important: !contextMenu.item.important,
              });
              setContextMenu(null);
            }}
          >
            {contextMenu.item.important
              ? 'Remove importance'
              : 'Mark as important'}
          </button>
          <button
            onClick={() => {
              handleUpdateItem(contextMenu.item, {
                done: !contextMenu.item.done,
                completedAtMs: !contextMenu.item.done ? Date.now() : null,
              });
              setContextMenu(null);
            }}
          >
            {contextMenu.item.done ? 'Mark as not completed' : 'Mark as completed'}
          </button>
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

      {undoToast && (
        <div className="undo-toast">
          <span>Deleted &ldquo;{undoToast.item.text}&rdquo;</span>
          <button onClick={handleUndoDelete}>Undo</button>
        </div>
      )}

      {selectedItem && (
        <TaskDetail
          key={selectedItem.id}
          item={selectedItem}
          todayStr={todayStr}
          onClose={() => setSelectedItemId(null)}
          onUpdate={handleUpdateItem}
          onDelete={handleDeleteItem}
        />
      )}
    </div>
  );
}

export default App;
