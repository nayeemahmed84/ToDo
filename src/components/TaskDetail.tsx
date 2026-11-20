import { FormEvent, useRef, useState } from 'react';
import { CustomCalendarPicker } from './CustomCalendarPicker';
import { CategoryColor, RepeatRule, TodoItem, TodoList, TodoStep } from '../types/todo';

function addDaysStr(baseYmd: string, days: number): string {
  const [y, m, d] = baseYmd.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

interface TaskDetailProps {
  item: TodoItem;
  lists: TodoList[];
  todayStr: string;
  onClose: () => void;
  onUpdate: (item: TodoItem, patch: Partial<TodoItem>) => Promise<void>;
  onMoveToList: (item: TodoItem, targetListId: string) => Promise<void>;
  onDelete: (item: TodoItem) => Promise<void>;
}

export function TaskDetail({
  item,
  lists,
  todayStr,
  onClose,
  onUpdate,
  onMoveToList,
  onDelete,
}: TaskDetailProps) {
  const [title, setTitle] = useState(item.text);
  const [notes, setNotes] = useState(item.notes);
  const [paneWidth, setPaneWidth] = useState(360);
  const [duePickerOpen, setDuePickerOpen] = useState(false);
  const [remindPickerOpen, setRemindPickerOpen] = useState(false);
  const [customRepeatOpen, setCustomRepeatOpen] = useState(false);
  const [repeatInterval, setRepeatInterval] = useState(item.repeatCustom?.interval ?? 1);
  const [repeatUnit, setRepeatUnit] = useState<'days' | 'weeks' | 'months' | 'years'>(item.repeatCustom?.unit ?? 'weeks');
  const [repeatDays, setRepeatDays] = useState<number[]>(item.repeatCustom?.days ?? []);
  const [assignNoteOpen, setAssignNoteOpen] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newStep, setNewStep] = useState('');

  const isMyDay = item.myDayDate === todayStr;

  const handleTitleBlur = () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== item.text) {
      onUpdate(item, { text: trimmed });
    }
  };

  const handleNotesBlur = () => {
    if (notes !== item.notes) {
      onUpdate(item, { notes });
    }
  };

  const handleAddStep = async (e: FormEvent) => {
    e.preventDefault();
    if (!newStep.trim()) return;
    const step: TodoStep = {
      id: crypto.randomUUID(),
      text: newStep.trim(),
      done: false,
    };
    await onUpdate(item, { steps: [...item.steps, step] });
    setNewStep('');
  };

  const toggleStep = async (stepId: string) => {
    const nextSteps = item.steps.map((s) =>
      s.id === stepId ? { ...s, done: !s.done } : s
    );
    await onUpdate(item, { steps: nextSteps });
  };

  const removeStep = async (stepId: string) => {
    const nextSteps = item.steps.filter((s) => s.id !== stepId);
    await onUpdate(item, { steps: nextSteps });
  };

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = paneWidth;
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(600, Math.max(300, startW + (startX - ev.clientX)));
      setPaneWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const nextHourDate = new Date();
  nextHourDate.setMinutes(0, 0, 0);
  nextHourDate.setHours(nextHourDate.getHours() + 1);
  const laterTodayLabel = nextHourDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <aside className="detail-panel" style={{ width: `${paneWidth}px` }}>
      <div
        onMouseDown={startResize}
        title="Drag to resize"
        style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "5px", cursor: "col-resize", zIndex: 10 }}
      />
      <div className="detail-header">
        <span>Task Details</span>
        <button
          type="button"
          className="chip-btn"
          onClick={() => onUpdate(item, { done: !item.done, completedAtMs: !item.done ? Date.now() : null })}
        >
          {item.done ? "Completed" : "Complete task"}
        </button>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="detail-card">
        <div className="detail-title-row">
          <input
            type="checkbox"
            className="circle-check"
            checked={item.done}
            onChange={() =>
              onUpdate(item, {
                done: !item.done,
                completedAtMs: !item.done ? Date.now() : null,
              })
            }
          />
          <input
            type="text"
            className={`detail-title-input ${item.done ? 'done' : ''}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
          />
          <button
            className={`star-btn ${item.important ? 'active' : ''}`}
            onClick={() => onUpdate(item, { important: !item.important })}
            title="Mark as important"
          >
            {item.important ? '★' : '☆'}
          </button>
        </div>

        <ul className="steps-list">
          {item.steps.map((step) => (
            <li key={step.id} className="step-row">
              <input
                type="checkbox"
                className="circle-check small"
                checked={step.done}
                onChange={() => toggleStep(step.id)}
              />
              <span className={step.done ? 'done' : ''}>{step.text}</span>
              <button
                className="icon-btn small"
                onClick={() => removeStep(step.id)}
                title="Remove step"
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        <form className="add-step-form" onSubmit={handleAddStep}>
          <input
            type="text"
            placeholder="+ Add step"
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
          />
        </form>
      </div>

      <button
        className={`detail-action ${isMyDay ? 'active' : ''}`}
        onClick={() =>
          onUpdate(item, { myDayDate: isMyDay ? null : todayStr })
        }
      >
        <span>☀️</span>
        <span>{isMyDay ? 'Added to My Day' : 'Add to My Day'}</span>
      </button>

      <div className="detail-card">
        <label className="detail-field-label">
          <span>📅 Due date</span>
          <div className="quick-picks">
            <button
              type="button"
              className="chip-btn"
              onClick={() => onUpdate(item, { dueDate: todayStr })}
            >
              Today
            </button>
            <button
              type="button"
              className="chip-btn"
              onClick={() =>
                onUpdate(item, { dueDate: addDaysStr(todayStr, 1) })
              }
            >
              Tomorrow
            </button>
            <button
              type="button"
              className="chip-btn"
              onClick={() =>
                onUpdate(item, { dueDate: addDaysStr(todayStr, 7) })
              }
            >
              Next week
            </button>
          </div>
          <div className="due-row" style={{ position: "relative", display: "flex", gap: "8px", alignItems: "center" }}>
            <button type="button" className="chip-btn" onClick={() => setDuePickerOpen((v) => !v)}>
              {item.dueDate ? `Due: ${item.dueDate}` : "Pick a date"}
            </button>
            {item.dueDate && (
              <button type="button" className="clear-btn" onClick={() => onUpdate(item, { dueDate: null })}>
                Clear
              </button>
            )}
            {duePickerOpen && (
              <div style={{ position: "absolute", top: "34px", left: 0, zIndex: 40 }}>
                <CustomCalendarPicker
                  initialDate={item.dueDate}
                  todayStr={todayStr}
                  onSave={(d) => { onUpdate(item, { dueDate: d }); setDuePickerOpen(false); }}
                  onCancel={() => setDuePickerOpen(false)}
                />
              </div>
            )}
          </div>
        </label>
      </div>

      <div className="detail-card">
        <label className="detail-field-label">
          <span>🔁 Repeat</span>
          <select
            className="repeat-select"
            value={item.repeat ?? 'none'}
            onChange={(e) => {
              const val = e.target.value as RepeatRule;
              if (val === 'custom') { setCustomRepeatOpen(true); }
              else { onUpdate(item, { repeat: val }); }
            }}
          >
            <option value="none">Never</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="weekdays">Weekdays</option>
            <option value="yearly">Yearly</option>
            <option value="custom">Custom…</option>
          </select>
        </label>
      </div>

      {lists.length > 1 && (
        <div className="detail-card">
          <label className="detail-field-label">
            <span>📂 Move to list</span>
            <select
              className="repeat-select"
              value={item.listId}
              onChange={(e) => {
                if (e.target.value !== item.listId) {
                  onMoveToList(item, e.target.value);
                }
              }}
            >
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="detail-card">
        <label className="detail-field-label">
          <span>🎨 Category</span>
          <select
            className="repeat-select"
            value={item.category ?? ''}
            onChange={(e) =>
              onUpdate(item, {
                category: (e.target.value || null) as CategoryColor | null,
              })
            }
          >
            <option value="">None</option>
            <option value="blue">Blue</option>
            <option value="green">Green</option>
            <option value="orange">Orange</option>
            <option value="purple">Purple</option>
            <option value="red">Red</option>
            <option value="yellow">Yellow</option>
          </select>
        </label>
      </div>

      <div className="detail-card" style={{ position: 'relative' }}>
        <div className="detail-section-label">🔔 Remind me</div>
        <div className="due-chips">
          <button type="button" className="chip-btn" onClick={() => onUpdate(item, { reminderAtMs: nextHourDate.getTime() })}>
            Later today {laterTodayLabel}
          </button>
          <button
            type="button"
            className="chip-btn"
            onClick={() => {
              const d = new Date();
              d.setDate(d.getDate() + 1);
              d.setHours(9, 0, 0, 0);
              onUpdate(item, { reminderAtMs: d.getTime() });
            }}
          >
            Tomorrow 9:00 AM
          </button>
          <button type="button" className="chip-btn" onClick={() => setRemindPickerOpen((v) => !v)}>
            Pick a date &amp; time
          </button>
          {item.reminderAtMs && (
            <button type="button" className="clear-btn" onClick={() => onUpdate(item, { reminderAtMs: null })}>
              ×
            </button>
          )}
        </div>
        {item.reminderAtMs && (
          <div style={{ fontSize: '0.78rem', color: 'var(--accent)', marginTop: '4px' }}>
            Reminder: {new Date(item.reminderAtMs).toLocaleString()}
          </div>
        )}
        {remindPickerOpen && (
          <div style={{ position: 'absolute', top: '68px', left: 0, zIndex: 40 }}>
            <CustomCalendarPicker
              todayStr={todayStr}
              withTime
              onSave={(d, t) => {
                const [hh, mm] = (t || '10:00').split(':').map(Number);
                const [yy, mo, dd] = d.split('-').map(Number);
                const dt = new Date(yy, mo - 1, dd, hh, mm, 0, 0);
                onUpdate(item, { reminderAtMs: dt.getTime() });
                setRemindPickerOpen(false);
              }}
              onCancel={() => setRemindPickerOpen(false)}
            />
          </div>
        )}
      </div>

      <div className="detail-card">
        <button type="button" className="detail-action" onClick={() => setAssignNoteOpen((v) => !v)}>
          👤 Assign to
        </button>
        {assignNoteOpen && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginTop: '4px' }}>
            This list is not shared yet — share it to assign tasks.
          </div>
        )}
      </div>

      <div className="detail-card">
        <button type="button" className="detail-action" onClick={() => fileInputRef.current?.click()}>
          📎 Add file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={(e) => {
            setFileError(null);
            const f = e.target.files?.[0];
            if (!f) return;
            const blocked = ['.exe', '.bat', '.sh', '.msi', '.app'];
            if (blocked.some((ext) => f.name.toLowerCase().endsWith(ext))) {
              setFileError('Executable files are not allowed.');
              e.target.value = '';
              return;
            }
            if (f.size > 25 * 1024 * 1024) {
              setFileError('File exceeds 25 MB limit.');
              e.target.value = '';
              return;
            }
            const existing = item.attachments ?? [];
            if (existing.length >= 10) {
              setFileError('Maximum 10 files per task.');
              e.target.value = '';
              return;
            }
            onUpdate(item, {
              attachments: [...existing, { id: String(Date.now()), name: f.name, size: f.size, type: f.type }],
            });
            e.target.value = '';
          }}
        />
        {fileError && <div style={{ fontSize: '0.78rem', color: 'var(--danger)', marginTop: '4px' }}>{fileError}</div>}
        {(item.attachments ?? []).map((att) => (
          <div
            key={att.id}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', marginTop: '4px' }}
          >
            <span>
              📎 {att.name} ({Math.max(1, Math.round(att.size / 1024))} KB)
            </span>
            <button
              type="button"
              className="clear-btn"
              onClick={() => onUpdate(item, { attachments: (item.attachments ?? []).filter((a) => a.id !== att.id) })}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {customRepeatOpen && (
        <div className="detail-card" style={{ border: '1px solid var(--accent)' }}>
          <div className="detail-section-label">Custom repeat</div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
            <input
              type="number"
              min={1}
              value={repeatInterval}
              onChange={(e) => setRepeatInterval(Math.max(1, Number(e.target.value) || 1))}
              style={{ width: '56px' }}
              aria-label="Repeat interval"
            />
            <select
              value={repeatUnit}
              onChange={(e) => setRepeatUnit(e.target.value as 'days' | 'weeks' | 'months' | 'years')}
              aria-label="Recurrence type"
            >
              <option value="days">days</option>
              <option value="weeks">weeks</option>
              <option value="months">months</option>
              <option value="years">years</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((dLabel, idx) => {
              const active = repeatDays.includes(idx);
              return (
                <button
                  key={dLabel}
                  type="button"
                  onClick={() => setRepeatDays((prev) => (prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx]))}
                  style={{
                    padding: '3px 6px',
                    fontSize: '0.75rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                    background: active ? 'var(--accent)' : 'transparent',
                    color: active ? '#fff' : 'var(--text)',
                    cursor: 'pointer',
                  }}
                >
                  {dLabel}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <button type="button" className="chip-btn" onClick={() => setCustomRepeatOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={repeatDays.length === 0}
              className="chip-btn"
              style={{ background: 'var(--accent)', color: '#fff', opacity: repeatDays.length === 0 ? 0.5 : 1 }}
              onClick={() => {
                onUpdate(item, { repeat: 'custom', repeatCustom: { interval: repeatInterval, unit: repeatUnit, days: repeatDays } });
                setCustomRepeatOpen(false);
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      <div className="detail-card">
        <textarea
          className="notes-input"
          placeholder="Add note..."
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={handleNotesBlur}
        />
      </div>

      <div className="detail-footer">
        <span className="meta-time">
          Created{' '}
          {new Date(item.createdAtMs).toLocaleString('en-CA', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
          {item.updatedAtMs && item.updatedAtMs - item.createdAtMs > 5000 && (
            <>
              {' · Updated '}
              {new Date(item.updatedAtMs).toLocaleString('en-CA', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </>
          )}
        </span>
        <button
          className="danger-btn"
          onClick={async () => {
            await onDelete(item);
            onClose();
          }}
        >
          Delete task
        </button>
      </div>
    </aside>
  );
}
