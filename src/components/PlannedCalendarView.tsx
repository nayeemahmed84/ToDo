import { useMemo, useState } from 'react';
import { TodoItem, TodoList } from '../types/todo';
import { EmojiText } from '../lib/emoji';

interface PlannedCalendarViewProps {
  items: TodoItem[];
  lists: TodoList[];
  todayStr: string;
  onSelectTask: (item: TodoItem) => void;
  onToggleDone: (item: TodoItem) => void;
  onRescheduleTask: (item: TodoItem, newDueDate: string) => Promise<void> | void;
  onQuickAddForDate: (dateYmd: string, title: string) => Promise<void> | void;
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function PlannedCalendarView({
  items,
  lists,
  todayStr,
  onSelectTask,
  onToggleDone,
  onRescheduleTask,
  onQuickAddForDate,
}: PlannedCalendarViewProps) {
  const [mode, setMode] = useState<'week' | 'month'>('month');
  const [anchorDate, setAnchorDate] = useState<Date>(() => parseYmd(todayStr));
  const [selectedDay, setSelectedDay] = useState<string>(todayStr);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState('');

  const listNameById = useMemo(() => new Map(lists.map((l) => [l.id, l.title])), [lists]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, TodoItem[]>();
    for (const item of items) {
      if (item.deletedAtMs || !item.dueDate) continue;
      const list = map.get(item.dueDate) ?? [];
      list.push(item);
      map.set(item.dueDate, list);
    }
    return map;
  }, [items]);

  const days = useMemo(() => {
    const result: { ymd: string; date: Date; inCurrentMonth: boolean }[] = [];
    if (mode === 'week') {
      const start = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate());
      start.setDate(start.getDate() - start.getDay());
      for (let i = 0; i < 7; i += 1) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        result.push({ ymd: toYmd(d), date: d, inCurrentMonth: true });
      }
    } else {
      const firstOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
      const startOffset = firstOfMonth.getDay();
      const gridStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1 - startOffset);
      for (let i = 0; i < 42; i += 1) {
        const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
        result.push({
          ymd: toYmd(d),
          date: d,
          inCurrentMonth: d.getMonth() === anchorDate.getMonth(),
        });
      }
    }
    return result;
  }, [anchorDate, mode]);

  const navigate = (delta: number) => {
    setAnchorDate((prev) => {
      if (mode === 'week') {
        return new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + delta * 7);
      }
      return new Date(prev.getFullYear(), prev.getMonth() + delta, 1);
    });
  };

  const headerLabel = useMemo(() => {
    if (mode === 'month') {
      return anchorDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    const first = days[0]?.date;
    const last = days[days.length - 1]?.date;
    if (!first || !last) return '';
    return `${first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }, [anchorDate, mode, days]);

  const selectedDayItems = itemsByDate.get(selectedDay) ?? [];

  const handleDropOnDay = (e: React.DragEvent, targetYmd: string) => {
    e.preventDefault();
    setDragOverDay(null);
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;
    const found = items.find((i) => i.id === taskId);
    if (found && found.dueDate !== targetYmd) {
      void onRescheduleTask(found, targetYmd);
    }
  };

  return (
    <div className="planned-calendar-wrap">
      <div className="planned-calendar-toolbar">
        <div className="planned-cal-nav">
          <button type="button" className="chip-btn" onClick={() => navigate(-1)} aria-label="Previous">
            ‹
          </button>
          <button
            type="button"
            className="chip-btn"
            onClick={() => {
              const t = parseYmd(todayStr);
              setAnchorDate(t);
              setSelectedDay(todayStr);
            }}
          >
            Today
          </button>
          <button type="button" className="chip-btn" onClick={() => navigate(1)} aria-label="Next">
            ›
          </button>
          <h3 className="planned-cal-title">{headerLabel}</h3>
        </div>
        <div className="planned-cal-mode" role="tablist" aria-label="Calendar view mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'week'}
            className={`chip-btn ${mode === 'week' ? 'active' : ''}`}
            onClick={() => setMode('week')}
          >
            Week
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'month'}
            className={`chip-btn ${mode === 'month' ? 'active' : ''}`}
            onClick={() => setMode('month')}
          >
            Month
          </button>
        </div>
      </div>

      <div className="planned-cal-weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="planned-cal-weekday">{w}</div>
        ))}
      </div>

      <div className={`planned-cal-grid mode-${mode}`}>
        {days.map(({ ymd, date, inCurrentMonth }) => {
          const dayItems = itemsByDate.get(ymd) ?? [];
          const isToday = ymd === todayStr;
          const isSelected = ymd === selectedDay;
          const isDragOver = dragOverDay === ymd;
          return (
            <div
              key={ymd}
              className={`planned-cal-cell ${!inCurrentMonth ? 'muted' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${isDragOver ? 'drag-over' : ''}`}
              onClick={() => setSelectedDay(ymd)}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverDay !== ymd) setDragOverDay(ymd);
              }}
              onDragLeave={() => {
                if (dragOverDay === ymd) setDragOverDay(null);
              }}
              onDrop={(e) => handleDropOnDay(e, ymd)}
            >
              <div className="planned-cal-cell-header">
                <span className="planned-cal-day-num">{date.getDate()}</span>
                {dayItems.length > 0 && (
                  <span className="planned-cal-day-count">{dayItems.length}</span>
                )}
              </div>
              <div className="planned-cal-chips">
                {dayItems.slice(0, mode === 'week' ? 8 : 3).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', t.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    className={`planned-cal-task-chip ${t.done ? 'done' : ''} ${t.priority ? `prio-${t.priority}` : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTask(t);
                    }}
                    title={t.text}
                  >
                    <EmojiText text={t.text} />
                  </button>
                ))}
                {dayItems.length > (mode === 'week' ? 8 : 3) && (
                  <span className="planned-cal-more">+{dayItems.length - (mode === 'week' ? 8 : 3)} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Day Agenda Drawer (great for mobile & quick reschedule) */}
      <div className="planned-cal-agenda">
        <div className="planned-cal-agenda-head">
          <strong>
            {parseYmd(selectedDay).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
          </strong>
          <span className="planned-cal-agenda-count">
            {selectedDayItems.length} task{selectedDayItems.length === 1 ? '' : 's'}
          </span>
        </div>

        <form
          className="planned-cal-quick-add"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = quickAddTitle.trim();
            if (!trimmed) return;
            setQuickAddTitle('');
            void onQuickAddForDate(selectedDay, trimmed);
          }}
        >
          <input
            type="text"
            placeholder={`Add task for ${selectedDay === todayStr ? 'today' : selectedDay}…`}
            value={quickAddTitle}
            onChange={(e) => setQuickAddTitle(e.target.value)}
          />
          <button type="submit" className="chip-btn" disabled={!quickAddTitle.trim()}>
            Add
          </button>
        </form>

        {selectedDayItems.length === 0 ? (
          <div className="planned-cal-empty">No tasks scheduled for this date. Drag any task onto a day to reschedule.</div>
        ) : (
          <ul className="planned-cal-agenda-list">
            {selectedDayItems.map((t) => (
              <li key={t.id} className={`planned-cal-agenda-item ${t.done ? 'done' : ''}`}>
                <input
                  type="checkbox"
                  className="circle-check"
                  checked={t.done}
                  onChange={() => onToggleDone(t)}
                  aria-label={`Mark ${t.text} ${t.done ? 'incomplete' : 'complete'}`}
                />
                <button
                  type="button"
                  className="planned-cal-agenda-body"
                  onClick={() => onSelectTask(t)}
                >
                  <span className="planned-cal-agenda-title"><EmojiText text={t.text} /></span>
                  <span className="planned-cal-agenda-meta">
                    {listNameById.get(t.listId) ?? 'Tasks'}
                    {t.estimateMinutes ? ` · ${t.estimateMinutes}m` : ''}
                  </span>
                </button>
                <input
                  type="date"
                  className="planned-cal-reschedule-input"
                  value={t.dueDate ?? selectedDay}
                  aria-label={`Reschedule ${t.text}`}
                  title="Reschedule date"
                  onChange={(e) => {
                    if (e.target.value) void onRescheduleTask(t, e.target.value);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
