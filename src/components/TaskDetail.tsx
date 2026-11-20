import { FormEvent, useRef, useState } from 'react';
import { CustomCalendarPicker } from './CustomCalendarPicker';
import {
  AlarmClockIcon,
  CalendarIcon,
  HideDetailIcon,
  ListIcon,
  PaperclipIcon,
  PlusIcon,
  RepeatIcon,
  StarIcon,
  SunIcon,
  TagIcon,
  TrashIcon,
  UserPlusIcon,
} from './Icons';
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
  const [paneWidth, setPaneWidth] = useState(() => {
    const saved = Number(localStorage.getItem("todo-detail-width"));
    return saved >= 320 && saved <= 1015 ? saved : 360;
  });
  const [duePickerOpen, setDuePickerOpen] = useState(false);
  const [remindPickerOpen, setRemindPickerOpen] = useState(false);
  const [remindOptionsOpen, setRemindOptionsOpen] = useState(false);
  const [dueDateOptionsOpen, setDueDateOptionsOpen] = useState(false);
  const [repeatOptionsOpen, setRepeatOptionsOpen] = useState(false);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
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

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = paneWidth;
    const onMove = (ev: PointerEvent) => {
      const next = Math.min(1015, Math.max(320, startW + (startX - ev.clientX)));
      setPaneWidth(next);
      localStorage.setItem("todo-detail-width", String(next));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const nextHourDate = new Date();
  nextHourDate.setMinutes(0, 0, 0);
  nextHourDate.setHours(nextHourDate.getHours() + 1);
  const laterTodayLabel = nextHourDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <aside className="detail-panel" style={{ width: `${paneWidth}px` }}>
      <div
        onPointerDown={startResize}
        title="Drag to resize"
        style={{ position: "absolute", left: "-4px", top: 0, bottom: 0, width: "8px", cursor: "col-resize", zIndex: 10 }}
      />
      <div className="detail-top-close">
        <button className="icon-btn" onClick={onClose} aria-label="Close" title="Close">
          ✕
        </button>
      </div>

      <div className="detail-scroll-body">
      <div className="detail-card detail-title-card">
        <div className="detail-title-row">
          <input
            type="checkbox"
            className="circle-check detail-checkbox"
            checked={item.done}
            onChange={() =>
              onUpdate(item, {
                done: !item.done,
                completedAtMs: !item.done ? Date.now() : null,
              })
            }
          />
          <textarea
            className={`detail-title-input ${item.done ? 'done' : ''}`}
            value={title}
            rows={Math.min(4, Math.max(1, Math.ceil(title.length / 20)))}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
          />
          <button
            className={`star-btn ${item.important ? 'active' : ''}`}
            onClick={() => onUpdate(item, { important: !item.important })}
            title="Mark as important"
            aria-label="Mark as important"
          >
            <StarIcon size={22} filled={item.important} />
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
          <PlusIcon size={22} />
          <input
            type="text"
            placeholder="Add step"
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
          />
        </form>
      </div>

      <div className="detail-card detail-my-day-card">
        <button
          type="button"
          className={`detail-action detail-action-inline ${isMyDay ? 'active' : ''}`}
          onClick={() => onUpdate(item, { myDayDate: isMyDay ? null : todayStr })}
        >
          <SunIcon size={20} />
          <span>{isMyDay ? 'Added to My Day' : 'Add to My Day'}</span>
        </button>
      </div>

      <div className="detail-card detail-schedule-card">
        <section className="detail-schedule-section">
          <button
            type="button"
            className="detail-schedule-trigger"
            aria-expanded={remindOptionsOpen}
            onClick={() => setRemindOptionsOpen((open) => !open)}
          >
            <AlarmClockIcon size={20} />
            <span>Remind me</span>
            {item.reminderAtMs && <span className="detail-schedule-value">{new Date(item.reminderAtMs).toLocaleString()}</span>}
          </button>
          {remindOptionsOpen && (
            <div className="detail-schedule-options">
              <button type="button" className="chip-btn detail-pill" onClick={() => { onUpdate(item, { reminderAtMs: nextHourDate.getTime() }); setRemindOptionsOpen(false); }}>
                Later today {laterTodayLabel}
              </button>
              <button type="button" className="chip-btn detail-pill" onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() + 1);
                d.setHours(9, 0, 0, 0);
                onUpdate(item, { reminderAtMs: d.getTime() });
                setRemindOptionsOpen(false);
              }}>
                Tomorrow 9:00 AM
              </button>
              <button type="button" className="chip-btn detail-pill" onClick={() => setRemindPickerOpen((open) => !open)}>
                Pick a date &amp; time
              </button>
              {item.reminderAtMs && <button type="button" className="clear-btn" onClick={() => { onUpdate(item, { reminderAtMs: null }); setRemindOptionsOpen(false); }}>Clear</button>}
              {remindPickerOpen && (
                <div className="detail-schedule-popover">
                  <CustomCalendarPicker
                    todayStr={todayStr}
                    withTime
                    onSave={(d, t) => {
                      const [hh, mm] = (t || '10:00').split(':').map(Number);
                      const [yy, mo, dd] = d.split('-').map(Number);
                      const dt = new Date(yy, mo - 1, dd, hh, mm, 0, 0);
                      onUpdate(item, { reminderAtMs: dt.getTime() });
                      setRemindPickerOpen(false);
                      setRemindOptionsOpen(false);
                    }}
                    onCancel={() => setRemindPickerOpen(false)}
                  />
                </div>
              )}
            </div>
          )}
        </section>

        <section className="detail-schedule-section">
          <button
            type="button"
            className="detail-schedule-trigger"
            aria-expanded={dueDateOptionsOpen}
            onClick={() => setDueDateOptionsOpen((open) => !open)}
          >
            <CalendarIcon size={20} />
            <span>{item.dueDate ? 'Due date' : 'Add due date'}</span>
            {item.dueDate && <span className="detail-schedule-value">{new Date(`${item.dueDate}T00:00:00`).toLocaleDateString()}</span>}
          </button>
          {dueDateOptionsOpen && (
            <div className="detail-schedule-options">
              <button type="button" className="chip-btn detail-pill" onClick={() => { onUpdate(item, { dueDate: todayStr }); setDueDateOptionsOpen(false); }}>Today</button>
              <button type="button" className="chip-btn detail-pill" onClick={() => { onUpdate(item, { dueDate: addDaysStr(todayStr, 1) }); setDueDateOptionsOpen(false); }}>Tomorrow</button>
              <button type="button" className="chip-btn detail-pill" onClick={() => { onUpdate(item, { dueDate: addDaysStr(todayStr, 7) }); setDueDateOptionsOpen(false); }}>Next week</button>
              <button type="button" className="chip-btn detail-pill" onClick={() => setDuePickerOpen((open) => !open)}>{item.dueDate ? 'Change date' : 'Pick a date'}</button>
              {item.dueDate && <button type="button" className="clear-btn" onClick={() => { onUpdate(item, { dueDate: null }); setDueDateOptionsOpen(false); }}>Clear</button>}
              {duePickerOpen && (
                <div className="detail-schedule-popover">
                  <CustomCalendarPicker
                    initialDate={item.dueDate}
                    todayStr={todayStr}
                    onSave={(d) => { onUpdate(item, { dueDate: d }); setDuePickerOpen(false); setDueDateOptionsOpen(false); }}
                    onCancel={() => setDuePickerOpen(false)}
                  />
                </div>
              )}
            </div>
          )}
        </section>

        <section className="detail-schedule-section">
          <button
            type="button"
            className="detail-schedule-trigger"
            aria-expanded={repeatOptionsOpen}
            onClick={() => setRepeatOptionsOpen((open) => !open)}
          >
            <RepeatIcon size={20} />
            <span>Repeat</span>
            {item.repeat && item.repeat !== 'none' && <span className="detail-schedule-value">{item.repeat === 'custom' ? 'Custom' : item.repeat.charAt(0).toUpperCase() + item.repeat.slice(1)}</span>}
          </button>
          {repeatOptionsOpen && (
            <label className="detail-field-label detail-repeat-options">
              <span className="sr-only">Repeat frequency</span>
              <select
                className="repeat-select"
                value={item.repeat ?? 'none'}
                onChange={(e) => {
                  const val = e.target.value as RepeatRule;
                  if (val === 'custom') setCustomRepeatOpen(true);
                  else onUpdate(item, { repeat: val });
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
          )}
        </section>
      </div>

      <div className="detail-card detail-action-card">
        <button type="button" className="detail-action detail-action-inline" onClick={() => setAssignNoteOpen((v) => !v)}>
          <UserPlusIcon size={20} />
          <span>Assign to</span>
        </button>
        {assignNoteOpen && (
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-2)', marginTop: '4px' }}>
            This list is not shared yet — share it to assign tasks.
          </div>
        )}
      </div>

      <div className="detail-card detail-action-card">
        <button type="button" className="detail-action detail-action-inline" onClick={() => fileInputRef.current?.click()}>
          <PaperclipIcon size={20} />
          <span>Add file</span>
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
        {fileError && <div style={{ fontSize: '0.78rem', color: 'var(--color-danger)', marginTop: '4px' }}>{fileError}</div>}
        {(item.attachments ?? []).map((att) => (
          <div
            key={att.id}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', marginTop: '4px' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <PaperclipIcon size={14} /> {att.name} ({Math.max(1, Math.round(att.size / 1024))} KB)
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
        <div className="detail-card" style={{ border: '1px solid var(--color-accent)' }}>
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
                    border: '1px solid var(--color-border)',
                    background: active ? 'var(--color-accent)' : 'transparent',
                    color: active ? 'var(--color-text-inverse)' : 'var(--color-text)',
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
              style={{ background: 'var(--color-accent)', color: 'var(--color-text-inverse)', opacity: repeatDays.length === 0 ? 0.5 : 1 }}
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

      <div className="detail-card detail-note-card">
        <textarea
          className="notes-input"
          placeholder="Add note"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={handleNotesBlur}
        />
      </div>

      <div className="detail-more-options">
        <button
          type="button"
          className="detail-more-toggle"
          aria-expanded={moreOptionsOpen}
          onClick={() => setMoreOptionsOpen((open) => !open)}
        >
          {moreOptionsOpen ? 'Fewer options' : 'More options'}
        </button>
        {moreOptionsOpen && (
          <div className="detail-more-options-content">
            <div className="detail-card">
              <label className="detail-field-label">
                <div className="detail-field-header">
                  <TagIcon size={20} />
                  <span>Pick a category</span>
                </div>
                <select
                  className="repeat-select"
                  value={item.category ?? ''}
                  onChange={(e) => onUpdate(item, { category: (e.target.value || null) as CategoryColor | null })}
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

            {lists.length > 1 && (
              <div className="detail-card">
                <label className="detail-field-label">
                  <div className="detail-field-header">
                    <ListIcon size={20} />
                    <span>Move to list</span>
                  </div>
                  <select
                    className="repeat-select"
                    value={item.listId}
                    onChange={(e) => {
                      if (e.target.value !== item.listId) onMoveToList(item, e.target.value);
                    }}
                  >
                    {lists.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
                  </select>
                </label>
              </div>
            )}
          </div>
        )}
      </div>
      </div>

      <div className="detail-footer">
        <button
          type="button"
          className="icon-btn detail-footer-btn"
          onClick={onClose}
          aria-label="Hide detail view"
          title="Hide detail view"
        >
          <HideDetailIcon size={20} />
        </button>
        <span className="meta-time">
          {(() => {
            const d = new Date(item.createdAtMs);
            const sameYear = d.getFullYear() === new Date().getFullYear();
            const dateStr = d.toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              ...(sameYear ? {} : { year: 'numeric' }),
            });
            return `Created by You on ${dateStr}`;
          })()}
        </span>
        <button
          type="button"
          className="icon-btn detail-footer-btn detail-delete-btn"
          onClick={async () => {
            await onDelete(item);
            onClose();
          }}
          aria-label="Delete task"
          title="Delete task"
        >
          <TrashIcon size={20} />
        </button>
      </div>
    </aside>
  );
}
