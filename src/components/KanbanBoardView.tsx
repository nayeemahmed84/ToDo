import { DragEvent, useMemo, useState } from 'react';
import type { TaskPriority, TodoItem } from '../types/todo';

function formatDurationMinutes(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}m`;
}

export type BoardGroupBy = 'priority' | 'due' | 'status';

interface KanbanColumn {
  id: string;
  title: string;
  accent?: string;
  items: TodoItem[];
}

interface KanbanBoardViewProps {
  items: TodoItem[];
  todayStr: string;
  incompleteItemIds: Set<string>;
  listNamesById: Record<string, string>;
  selectedItemId: string | null;
  groupBy: BoardGroupBy;
  onChangeGroupBy: (next: BoardGroupBy) => void;
  onSelectItem: (item: TodoItem) => void;
  onToggleDone: (item: TodoItem) => void;
  onToggleImportant: (item: TodoItem) => void;
  onUpdateItem: (item: TodoItem, patch: Partial<TodoItem>) => void;
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, (d || 1) + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function KanbanBoardView({
  items,
  todayStr,
  incompleteItemIds,
  listNamesById,
  selectedItemId,
  groupBy,
  onChangeGroupBy,
  onSelectItem,
  onToggleDone,
  onToggleImportant,
  onUpdateItem,
}: KanbanBoardViewProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);

  const tomorrowStr = useMemo(() => addDaysYmd(todayStr, 1), [todayStr]);
  const upcomingDefaultStr = useMemo(() => addDaysYmd(todayStr, 3), [todayStr]);

  const columns: KanbanColumn[] = useMemo(() => {
    if (groupBy === 'priority') {
      const buckets: Record<string, TodoItem[]> = {
        p1: [],
        p2: [],
        p3: [],
        p4: [],
        none: [],
      };
      for (const item of items) {
        const key = item.priority ?? 'none';
        (buckets[key] ?? buckets.none).push(item);
      }
      return [
        { id: 'p1', title: 'P1 · Urgent', accent: '#ef4444', items: buckets.p1 },
        { id: 'p2', title: 'P2 · High', accent: '#f97316', items: buckets.p2 },
        { id: 'p3', title: 'P3 · Medium', accent: '#3b82f6', items: buckets.p3 },
        { id: 'p4', title: 'P4 · Low', accent: '#6b7280', items: buckets.p4 },
        { id: 'none', title: 'No Priority', items: buckets.none },
      ];
    }

    if (groupBy === 'due') {
      const buckets: Record<string, TodoItem[]> = {
        overdue: [],
        today: [],
        tomorrow: [],
        upcoming: [],
        'no-date': [],
      };
      for (const item of items) {
        if (!item.dueDate) {
          buckets['no-date'].push(item);
        } else if (item.dueDate < todayStr) {
          buckets.overdue.push(item);
        } else if (item.dueDate === todayStr) {
          buckets.today.push(item);
        } else if (item.dueDate === tomorrowStr) {
          buckets.tomorrow.push(item);
        } else {
          buckets.upcoming.push(item);
        }
      }
      return [
        { id: 'overdue', title: 'Overdue', accent: '#ef4444', items: buckets.overdue },
        { id: 'today', title: 'Today', accent: '#3b82f6', items: buckets.today },
        { id: 'tomorrow', title: 'Tomorrow', accent: '#8b5cf6', items: buckets.tomorrow },
        { id: 'upcoming', title: 'Upcoming', accent: '#10b981', items: buckets.upcoming },
        { id: 'no-date', title: 'No Date', items: buckets['no-date'] },
      ];
    }

    // status
    const todo: TodoItem[] = [];
    const blocked: TodoItem[] = [];
    const completed: TodoItem[] = [];
    for (const item of items) {
      if (item.done) {
        completed.push(item);
      } else if ((item.blockedByIds ?? []).some((id) => incompleteItemIds.has(id))) {
        blocked.push(item);
      } else {
        todo.push(item);
      }
    }
    return [
      { id: 'todo', title: 'To Do', accent: '#3b82f6', items: todo },
      { id: 'blocked', title: 'Blocked', accent: '#f59e0b', items: blocked },
      { id: 'completed', title: 'Completed', accent: '#10b981', items: completed },
    ];
  }, [groupBy, incompleteItemIds, items, todayStr, tomorrowStr]);

  const handleDropOnColumn = (e: DragEvent<HTMLDivElement>, colId: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggingId;
    setDraggingId(null);
    setDragOverColId(null);
    if (!taskId) return;
    const item = items.find((i) => i.id === taskId);
    if (!item) return;

    if (groupBy === 'priority') {
      const nextPriority: TaskPriority | null = colId === 'none' ? null : (colId as TaskPriority);
      if ((item.priority ?? null) !== nextPriority) {
        onUpdateItem(item, { priority: nextPriority });
      }
      return;
    }

    if (groupBy === 'due') {
      if (colId === 'overdue') return; // don't force an arbitrary past date
      const nextDue =
        colId === 'today'
          ? todayStr
          : colId === 'tomorrow'
            ? tomorrowStr
            : colId === 'upcoming'
              ? upcomingDefaultStr
              : null;
      if ((item.dueDate ?? null) !== nextDue) {
        onUpdateItem(item, { dueDate: nextDue });
      }
      return;
    }

    if (groupBy === 'status') {
      if (colId === 'completed' && !item.done) {
        onToggleDone(item);
      } else if (colId === 'todo' && item.done) {
        onToggleDone(item);
      }
    }
  };

  return (
    <div className="kanban-board-root">
      <div className="kanban-toolbar">
        <span className="kanban-toolbar-label">Group columns by</span>
        <div className="kanban-group-pills" role="tablist" aria-label="Board grouping">
          {(
            [
              { id: 'priority', label: 'Priority' },
              { id: 'due', label: 'Due Date' },
              { id: 'status', label: 'Status' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={groupBy === opt.id}
              className={`kanban-group-pill ${groupBy === opt.id ? 'active' : ''}`}
              onClick={() => onChangeGroupBy(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="kanban-columns">
        {columns.map((col) => {
          const isOver = dragOverColId === col.id;
          return (
            <div
              key={col.id}
              className={`kanban-column ${isOver ? 'drag-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverColId !== col.id) setDragOverColId(col.id);
              }}
              onDragLeave={() => {
                if (dragOverColId === col.id) setDragOverColId(null);
              }}
              onDrop={(e) => handleDropOnColumn(e, col.id)}
            >
              <div className="kanban-column-header">
                <div className="kanban-column-title-wrap">
                  {col.accent && (
                    <span className="kanban-column-dot" style={{ background: col.accent }} aria-hidden="true" />
                  )}
                  <h3 className="kanban-column-title">{col.title}</h3>
                </div>
                <span className="kanban-column-count">{col.items.length}</span>
              </div>

              <div className="kanban-column-cards">
                {col.items.length === 0 ? (
                  <div className="kanban-empty-col">Drop tasks here</div>
                ) : (
                  col.items.map((item) => {
                    const doneSteps = (item.steps ?? []).filter((s) => s.done).length;
                    const totalSteps = (item.steps ?? []).length;
                    const blockedCount = (item.blockedByIds ?? []).filter((id) =>
                      incompleteItemIds.has(id)
                    ).length;
                    const listName = listNamesById[item.listId];
                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => {
                          setDraggingId(item.id);
                          e.dataTransfer.setData('text/plain', item.id);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOverColId(null);
                        }}
                        onClick={() => onSelectItem(item)}
                        className={`kanban-card ${item.done ? 'is-done' : ''} ${selectedItemId === item.id ? 'is-selected' : ''} ${draggingId === item.id ? 'is-dragging' : ''}`}
                      >
                        <div className="kanban-card-top">
                          <button
                            type="button"
                            className={`kanban-check ${item.done ? 'checked' : ''}`}
                            aria-label={item.done ? 'Mark incomplete' : 'Mark complete'}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleDone(item);
                            }}
                          >
                            {item.done ? '✓' : ''}
                          </button>
                          <span className="kanban-card-title">{item.text}</span>
                          <button
                            type="button"
                            className={`kanban-star ${item.important ? 'active' : ''}`}
                            aria-label={item.important ? 'Remove importance' : 'Mark important'}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleImportant(item);
                            }}
                          >
                            {item.important ? '★' : '☆'}
                          </button>
                        </div>

                        <div className="kanban-card-meta">
                          {item.priority && (
                            <span className={`kanban-pill prio-${item.priority}`}>
                              {item.priority.toUpperCase()}
                            </span>
                          )}
                          {item.dueDate && (
                            <span className={`kanban-pill ${item.dueDate < todayStr && !item.done ? 'overdue' : ''}`}>
                              📅 {item.dueDate}
                            </span>
                          )}
                          {typeof item.estimateMinutes === 'number' && item.estimateMinutes > 0 && (
                            <span className="kanban-pill">⏱ {formatDurationMinutes(item.estimateMinutes)}</span>
                          )}
                          {totalSteps > 0 && (
                            <span className="kanban-pill">
                              ☑ {doneSteps}/{totalSteps}
                            </span>
                          )}
                          {(item.attachments?.length ?? 0) > 0 && (
                            <span className="kanban-pill" title="Attachments">
                              📎 {item.attachments!.length}
                            </span>
                          )}
                          {blockedCount > 0 && (
                            <span className="kanban-pill blocked">⏳ Blocked ({blockedCount})</span>
                          )}
                          {listName && <span className="kanban-pill list-name">{listName}</span>}
                        </div>

                        {item.tags && item.tags.length > 0 && (
                          <div className="kanban-card-tags">
                            {item.tags.slice(0, 4).map((tag) => (
                              <span key={tag} className="kanban-tag">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
