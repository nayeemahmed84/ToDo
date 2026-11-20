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
import { SmartListId, TodoItem, TodoList, ViewSelection } from './types/todo';

function getTodayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const SMART_TITLES: Record<SmartListId, string> = {
  'my-day': 'My Day',
  important: 'Important',
  planned: 'Planned',
  tasks: 'Tasks',
};

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [lists, setLists] = useState<TodoList[]>([]);
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
  const [error, setError] = useState<string | null>(null);

  const todayStr = getTodayStr();

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

    return () => {
      unsubLists();
      unsubItems();
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
      case 'tasks':
      default:
        return allItems;
    }
  }, [allItems, searchQuery, selection, todayStr]);

  const activeItems = visibleItems.filter((i) => !i.done);
  const completedItems = visibleItems.filter((i) => i.done);
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
    await deleteDoc(doc(db, 'lists', listId));
    if (selection.type === 'list' && selection.id === listId) {
      setSelection({ type: 'smart', id: 'my-day' });
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
  };

  const handleDeleteItem = async (item: TodoItem) => {
    await deleteDoc(doc(db, 'lists', item.listId, 'items', item.id));
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
      <Sidebar
        user={user}
        lists={lists}
        selection={selection}
        searchQuery={searchQuery}
        counts={counts}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelect={setSelection}
        onSearchChange={setSearchQuery}
        onCreateList={handleCreateList}
        onDeleteList={handleDeleteList}
        onExportJson={handleExportJson}
        onSignOut={() => signOutUser()}
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
          <div>
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
        </header>

        {error && <p className="error">{error}</p>}

        {!searchQuery && (
          <form className="add-task-bar" onSubmit={handleAddItem}>
            <span className="plus-icon">+</span>
            <input
              type="text"
              placeholder="Add a task"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
            />
            {newItemText.trim() && (
              <button className="primary small" type="submit">
                Add
              </button>
            )}
          </form>
        )}

        <ul className="task-list">
          {activeItems.map((item) => (
            <li
              key={item.id}
              className={`task-row ${selectedItemId === item.id ? 'selected' : ''}`}
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
      </main>

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
