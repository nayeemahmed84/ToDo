import { useState, useRef, MouseEvent, ChangeEvent, CSSProperties } from 'react';
import { TodoItem, TodoList } from '../types/todo';
import { StarIcon } from './Icons';

const SAND_GRAINS = Array.from({ length: 40 }, (_, i) => {
  const xPct = ((i * 23 + 7) % 94) + 3;
  const yPct = ((i * 37 + 11) % 76) + 12;
  const dx = 28 + ((i * 19) % 58);
  const dy = ((i % 2 === 0 ? -1 : 1) * (10 + ((i * 13) % 28)));
  const delay = Math.round((xPct / 100) * 180);
  const size = 2 + (i % 3);
  return { xPct, yPct, dx, dy, delay, size };
});

interface TaskRowProps {
  item: TodoItem;
  lists: TodoList[];
  selected: boolean;
  selectedIds?: Set<string>;
  todayStr: string;
  tomorrowStr: string;
  showListMeta: boolean;
  reorderable?: boolean;
  sandState?: 'dissolve' | 'materialize' | null;
  clipboardState?: 'copy' | 'cut' | null;
  onReorder?: (draggedItemId: string, targetItemId: string, insertAfter: boolean) => void | Promise<void>;
  onToggleDone: (item: TodoItem) => void;
  onToggleImportant: (item: TodoItem) => void;
  onOpen: (e: MouseEvent<HTMLButtonElement>, item: TodoItem) => void;
  onLongPress?: (item: TodoItem) => void;
  onContextMenu: (e: React.MouseEvent<HTMLLIElement>, item: TodoItem) => void;
}

export function TaskRow({
  item,
  lists,
  selected,
  selectedIds,
  todayStr,
  tomorrowStr,
  showListMeta,
  reorderable = false,
  sandState = null,
  clipboardState = null,
  onReorder,
  onToggleDone,
  onToggleImportant,
  onOpen,
  onLongPress,
  onContextMenu,
}: TaskRowProps) {
  const [popping, setPopping] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  const listName = lists.find((list) => list.id === item.listId)?.title ?? 'Tasks';
  const hasMeta = Boolean(
    showListMeta || item.dueDate || item.reminderAtMs ||
    (item.repeat && item.repeat !== 'none') || item.myDayDate === todayStr ||
    item.steps.length || item.notes || item.attachments?.length
  );

  const handleToggleImportant = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!item.important) {
      setPopping(true);
      window.setTimeout(() => setPopping(false), 150);
    }
    onToggleImportant(item);
  };

  const handleCheckbox = (event: ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation();
    onToggleDone(item);
  };

  const handleDragStart = (event: React.DragEvent<HTMLLIElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest('input, .star-btn')) {
      event.preventDefault();
      return;
    }
    const draggedIds = selectedIds && selectedIds.has(item.id) && selectedIds.size > 1
      ? Array.from(selectedIds)
      : [item.id];
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', item.id);
    event.dataTransfer.setData('application/x-todo-items', JSON.stringify(draggedIds));
    setDragging(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLLIElement>) => {
    if (!reorderable) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const bounds = event.currentTarget.getBoundingClientRect();
    setDropPosition(event.clientY >= bounds.top + bounds.height / 2 ? 'after' : 'before');
  };

  const handleDrop = (event: React.DragEvent<HTMLLIElement>) => {
    if (!reorderable) return;
    event.preventDefault();
    const draggedItemId = event.dataTransfer.getData('text/plain');
    const bounds = event.currentTarget.getBoundingClientRect();
    const insertAfter = event.clientY >= bounds.top + bounds.height / 2;
    setDropPosition(null);
    if (draggedItemId && draggedItemId !== item.id) {
      void onReorder?.(draggedItemId, item.id, insertAfter);
    }
  };

  return (
    <li
      className={`task-row ${hasMeta ? 'has-meta' : ''} ${item.done ? 'done' : ''} ${selected ? 'selected' : ''} ${dragging ? 'dragging' : ''} ${dropPosition ? `drop-${dropPosition}` : ''} ${sandState ? `sand-${sandState}` : ''} ${clipboardState ? `clipboard-${clipboardState}` : ''}`}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={(event) => {
        const relatedTarget = event.relatedTarget;
        if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return;
        setDropPosition(null);
      }}
      onDrop={handleDrop}
      onDragEnd={() => {
        setDragging(false);
        setDropPosition(null);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu(event, item);
      }}
      onClick={(event) => {
        const target = event.target;
        if (target instanceof Element && target.closest('input, .star-btn, .task-body')) return;
        if (longPressedRef.current) {
          longPressedRef.current = false;
          return;
        }
        onOpen(event as unknown as MouseEvent<HTMLButtonElement>, item);
      }}
      onTouchStart={(event) => {
        const target = event.target;
        if (target instanceof Element && target.closest('input, .star-btn')) return;
        clearLongPress();
        longPressedRef.current = false;
        longPressTimerRef.current = window.setTimeout(() => {
          longPressedRef.current = true;
          onLongPress?.(item);
        }, 450);
      }}
      onTouchMove={clearLongPress}
      onTouchEnd={clearLongPress}
      onTouchCancel={clearLongPress}
    >
      <input
        type="checkbox"
        className="circle-check"
        checked={item.done}
        onChange={handleCheckbox}
        aria-label={`${item.done ? 'Mark incomplete' : 'Mark complete'}: ${item.text}`}
      />
      <button
        type="button"
        className="task-body"
        onClick={(event) => {
          if (longPressedRef.current) {
            longPressedRef.current = false;
            event.preventDefault();
            return;
          }
          onOpen(event, item);
        }}
      >
        <span className="task-title" title={item.text}>{item.text}</span>
        {hasMeta && (
          <div className="task-meta">
            {showListMeta && <span>{listName}</span>}
            {item.myDayDate === todayStr && (
              <span className="task-meta-icon" title="In My Day">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
                My Day
              </span>
            )}
            {item.dueDate && (
              <span className={`task-meta-icon ${item.dueDate < todayStr ? 'due-overdue' : item.dueDate === todayStr ? 'due-today' : ''}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                Due {item.dueDate === todayStr ? 'Today' : item.dueDate === tomorrowStr ? 'Tomorrow' : item.dueDate}
              </span>
            )}
            {item.reminderAtMs && (
              <span className="task-meta-icon" title={`Reminder ${new Date(item.reminderAtMs).toLocaleString()}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                Reminder
              </span>
            )}
            {item.repeat && item.repeat !== 'none' && (
              <span className="task-meta-icon" title={`Repeats ${item.repeat}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" /></svg>
                Repeat
              </span>
            )}
            {item.steps.length > 0 && (
              <span className="task-meta-icon" title="Steps">✓ {item.steps.filter((step) => step.done).length}/{item.steps.length}</span>
            )}
            {item.notes && (
              <span className="task-meta-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5" /></svg>
                Note
              </span>
            )}
            {!!item.attachments?.length && (
              <span className="task-meta-icon" title="Files">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" /></svg>
                {item.attachments.length}
              </span>
            )}
          </div>
        )}
      </button>
      <button
        type="button"
        className={`star-btn ${item.important ? 'active' : ''} ${popping ? 'popping' : ''}`}
        onClick={handleToggleImportant}
        title={item.important ? 'Remove importance' : 'Mark as important'}
        aria-label={item.important ? 'Remove importance' : 'Mark as important'}
      >
        {item.important ? <StarIcon filled size={20} className="star-icon" /> : <StarIcon size={20} className="star-icon" />}
      </button>
      {sandState && (
        <span className="sand-particles" aria-hidden="true">
          {SAND_GRAINS.map((g, idx) => (
            <span
              key={idx}
              className="sand-grain"
              style={{
                left: `${g.xPct}%`,
                top: `${g.yPct}%`,
                width: `${g.size}px`,
                height: `${g.size}px`,
                '--sx': `${g.dx}px`,
                '--sy': `${g.dy}px`,
                '--sd': `${g.delay}ms`,
              } as CSSProperties}
            />
          ))}
        </span>
      )}
    </li>
  );
}
