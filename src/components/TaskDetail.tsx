import { FormEvent, useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CustomCalendarPicker } from './CustomCalendarPicker';
import { EmojiText } from '../lib/emoji';
import {
  AlarmClockIcon,
  CalendarIcon,
  HideDetailIcon,
  PaperclipIcon,
  PlusIcon,
  RepeatIcon,
  StarIcon,
  SunIcon,
  TrashIcon,
  UserPlusIcon,
} from './Icons';
import { RepeatRule, TodoItem, TodoStep } from '../types/todo';

function addDaysStr(baseYmd: string, days: number): string {
  const [y, m, d] = baseYmd.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

interface TaskDetailProps {
  item: TodoItem;
  todayStr: string;
  currentUserId: string;
  listTitle?: string;
  listIcon?: string | null;
  exiting?: boolean;
  onClose: () => void;
  onUpdate: (item: TodoItem, patch: Partial<TodoItem>) => Promise<void>;
  onDelete: (item: TodoItem) => Promise<void>;
}

export function TaskDetail({
  item,
  todayStr,
  currentUserId,
  listTitle,
  listIcon,
  exiting = false,
  onClose,
  onUpdate,
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
  const [scheduleAnchorRect, setScheduleAnchorRect] = useState<{ top: number; bottom: number; left: number } | null>(null);
  const getScheduleFixedStyle = (width: number, estHeight: number): React.CSSProperties | undefined => {
    if (!scheduleAnchorRect) return undefined;
    const maxLeft = Math.max(8, window.innerWidth - width - 12);
    const left = Math.min(Math.max(8, scheduleAnchorRect.left + 24), maxLeft);
    const fitsBelow = scheduleAnchorRect.bottom + 4 + estHeight <= window.innerHeight - 12;
    const top = fitsBelow
      ? scheduleAnchorRect.bottom + 4
      : Math.max(8, window.innerHeight - estHeight - 12);
    return { top, left };
  };
  const [customRepeatOpen, setCustomRepeatOpen] = useState(false);
  const [repeatInterval, setRepeatInterval] = useState(item.repeatCustom?.interval ?? 1);
  const [repeatUnit, setRepeatUnit] = useState<'days' | 'weeks' | 'months' | 'years'>(item.repeatCustom?.unit ?? 'weeks');
  const [repeatDays, setRepeatDays] = useState<number[]>(item.repeatCustom?.days ?? []);
  const [assignNoteOpen, setAssignNoteOpen] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newStep, setNewStep] = useState('');
  const [ownerDisplayName, setOwnerDisplayName] = useState<string | null>(
    item.createdByName?.trim() || null
  );
  const lastModifiedByUid = item.updatedByUid ?? item.ownerUid;
  const [modifierDisplayName, setModifierDisplayName] = useState<string | null>(
    item.updatedByName?.trim() || null
  );

  useEffect(() => {
    setOwnerDisplayName(item.createdByName?.trim() || null);
    setModifierDisplayName(item.updatedByName?.trim() || null);

    const uidsToFetch = new Set<string>();
    if (item.ownerUid && item.ownerUid !== currentUserId && !item.createdByName?.trim()) {
      uidsToFetch.add(item.ownerUid);
    }
    if (lastModifiedByUid && lastModifiedByUid !== currentUserId && !item.updatedByName?.trim()) {
      uidsToFetch.add(lastModifiedByUid);
    }
    if (uidsToFetch.size === 0) return;

    let cancelled = false;
    Promise.all(
      Array.from(uidsToFetch).map(async (uid) => {
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          if (!snap.exists()) return [uid, null] as const;
          const data = snap.data();
          const name = (typeof data.displayName === 'string' && data.displayName.trim())
            || (typeof data.email === 'string' && data.email.trim())
            || null;
          return [uid, name] as const;
        } catch {
          return [uid, null] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      for (const [uid, name] of entries) {
        if (!name) continue;
        if (uid === item.ownerUid) setOwnerDisplayName(name);
        if (uid === lastModifiedByUid) setModifierDisplayName(name);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [item.ownerUid, item.createdByName, lastModifiedByUid, item.updatedByName, currentUserId]);

  const isMyDay = item.myDayDate === todayStr;
  const createdBy = item.ownerUid === currentUserId
    ? 'You'
    : ownerDisplayName || 'a collaborator';
  const lastModifiedBy = lastModifiedByUid === currentUserId
    ? 'You'
    : modifierDisplayName
      || (lastModifiedByUid === item.ownerUid ? ownerDisplayName : null)
      || 'a collaborator';
  const lastModifiedAt = new Date(item.updatedAtMs ?? item.createdAtMs);
  const lastModifiedDate = lastModifiedAt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(lastModifiedAt.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
  });
  const lastModifiedTime = lastModifiedAt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

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

  const shortWeekday = (ymd: string) =>
    new Date(`${ymd}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
  const todayWeekday = shortWeekday(todayStr);
  const tomorrowYmd = addDaysStr(todayStr, 1);
  const tomorrowWeekday = shortWeekday(tomorrowYmd);
  const nextWeekYmd = addDaysStr(todayStr, 7);
  const nextWeekWeekday = shortWeekday(nextWeekYmd);

  useEffect(() => {
    if (!remindOptionsOpen && !dueDateOptionsOpen && !repeatOptionsOpen && !remindPickerOpen && !duePickerOpen) {
      return;
    }
    const closeAllSchedule = () => {
      setRemindOptionsOpen(false);
      setDueDateOptionsOpen(false);
      setRepeatOptionsOpen(false);
      setRemindPickerOpen(false);
      setDuePickerOpen(false);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement)?.closest('.detail-schedule-section')) {
        closeAllSchedule();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeAllSchedule();
      }
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [remindOptionsOpen, dueDateOptionsOpen, repeatOptionsOpen, remindPickerOpen, duePickerOpen]);

  return (
    <aside className={`detail-panel ${exiting ? 'exiting' : ''}`} style={{ width: `${paneWidth}px` }}>
      <div
        onPointerDown={startResize}
        title="Drag to resize"
        style={{ position: "absolute", left: "-4px", top: 0, bottom: 0, width: "8px", cursor: "col-resize", zIndex: 10 }}
      />
      <div className="detail-mobile-topbar">
        <button
          type="button"
          className="mobile-topbar-icon-btn"
          onClick={onClose}
          aria-label="Back to list"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="detail-mobile-list-title">
          {listIcon && <span aria-hidden="true">{listIcon}</span>}
          <span>{listTitle || 'Tasks'}</span>
        </div>
      </div>
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
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
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
              <span className={step.done ? 'done' : ''}><EmojiText text={step.text} /></span>
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
            aria-expanded={remindOptionsOpen || remindPickerOpen}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setScheduleAnchorRect({ top: rect.top, bottom: rect.bottom, left: rect.left });
              const next = !(remindOptionsOpen || remindPickerOpen);
              setRemindOptionsOpen(next);
              setRemindPickerOpen(false);
              setDueDateOptionsOpen(false);
              setDuePickerOpen(false);
              setRepeatOptionsOpen(false);
            }}
          >
            <AlarmClockIcon size={20} />
            <span>Remind me</span>
            {item.reminderAtMs && <span className="detail-schedule-value">{new Date(item.reminderAtMs).toLocaleString()}</span>}
          </button>
          {remindOptionsOpen && !remindPickerOpen && (
            <div className="detail-schedule-menu" role="menu" aria-label="Remind me options" style={getScheduleFixedStyle(256, 230)}>
              <button
                type="button"
                role="menuitem"
                className="detail-schedule-menu-item"
                onClick={() => {
                  onUpdate(item, { reminderAtMs: nextHourDate.getTime() });
                  setRemindOptionsOpen(false);
                }}
              >
                <AlarmClockIcon size={16} />
                <span>Later today</span>
                <span className="detail-schedule-menu-hint">{laterTodayLabel}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="detail-schedule-menu-item"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 1);
                  d.setHours(9, 0, 0, 0);
                  onUpdate(item, { reminderAtMs: d.getTime() });
                  setRemindOptionsOpen(false);
                }}
              >
                <CalendarIcon size={16} />
                <span>Tomorrow</span>
                <span className="detail-schedule-menu-hint">{tomorrowWeekday}, 9:00 AM</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="detail-schedule-menu-item"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 7);
                  d.setHours(9, 0, 0, 0);
                  onUpdate(item, { reminderAtMs: d.getTime() });
                  setRemindOptionsOpen(false);
                }}
              >
                <CalendarIcon size={16} />
                <span>Next week</span>
                <span className="detail-schedule-menu-hint">{nextWeekWeekday}, 9:00 AM</span>
              </button>
              <div className="detail-schedule-menu-divider" />
              <button
                type="button"
                role="menuitem"
                className="detail-schedule-menu-item"
                onClick={() => {
                  setRemindOptionsOpen(false);
                  setRemindPickerOpen(true);
                }}
              >
                <CalendarIcon size={16} />
                <span>Pick a date &amp; time</span>
              </button>
              {item.reminderAtMs && (
                <>
                  <div className="detail-schedule-menu-divider" />
                  <button
                    type="button"
                    role="menuitem"
                    className="detail-schedule-menu-item danger"
                    onClick={() => {
                      onUpdate(item, { reminderAtMs: null });
                      setRemindOptionsOpen(false);
                    }}
                  >
                    <TrashIcon size={16} />
                    <span>Remove reminder</span>
                  </button>
                </>
              )}
            </div>
          )}
          {remindPickerOpen && (
            <div className="detail-schedule-popover" style={getScheduleFixedStyle(300, 405)}>
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
        </section>

        <section className="detail-schedule-section">
          <button
            type="button"
            className="detail-schedule-trigger"
            aria-expanded={dueDateOptionsOpen || duePickerOpen}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setScheduleAnchorRect({ top: rect.top, bottom: rect.bottom, left: rect.left });
              const next = !(dueDateOptionsOpen || duePickerOpen);
              setDueDateOptionsOpen(next);
              setDuePickerOpen(false);
              setRemindOptionsOpen(false);
              setRemindPickerOpen(false);
              setRepeatOptionsOpen(false);
            }}
          >
            <CalendarIcon size={20} />
            <span>{item.dueDate ? 'Due date' : 'Add due date'}</span>
            {item.dueDate && <span className="detail-schedule-value">{new Date(`${item.dueDate}T00:00:00`).toLocaleDateString()}</span>}
          </button>
          {dueDateOptionsOpen && !duePickerOpen && (
            <div className="detail-schedule-menu" role="menu" aria-label="Due date options" style={getScheduleFixedStyle(256, 230)}>
              <button
                type="button"
                role="menuitem"
                className="detail-schedule-menu-item"
                onClick={() => {
                  onUpdate(item, { dueDate: todayStr });
                  setDueDateOptionsOpen(false);
                }}
              >
                <CalendarIcon size={16} />
                <span>Today</span>
                <span className="detail-schedule-menu-hint">{todayWeekday}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="detail-schedule-menu-item"
                onClick={() => {
                  onUpdate(item, { dueDate: tomorrowYmd });
                  setDueDateOptionsOpen(false);
                }}
              >
                <CalendarIcon size={16} />
                <span>Tomorrow</span>
                <span className="detail-schedule-menu-hint">{tomorrowWeekday}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="detail-schedule-menu-item"
                onClick={() => {
                  onUpdate(item, { dueDate: nextWeekYmd });
                  setDueDateOptionsOpen(false);
                }}
              >
                <CalendarIcon size={16} />
                <span>Next week</span>
                <span className="detail-schedule-menu-hint">{nextWeekWeekday}</span>
              </button>
              <div className="detail-schedule-menu-divider" />
              <button
                type="button"
                role="menuitem"
                className="detail-schedule-menu-item"
                onClick={() => {
                  setDueDateOptionsOpen(false);
                  setDuePickerOpen(true);
                }}
              >
                <CalendarIcon size={16} />
                <span>Pick a date</span>
              </button>
              {item.dueDate && (
                <>
                  <div className="detail-schedule-menu-divider" />
                  <button
                    type="button"
                    role="menuitem"
                    className="detail-schedule-menu-item danger"
                    onClick={() => {
                      onUpdate(item, { dueDate: null });
                      setDueDateOptionsOpen(false);
                    }}
                  >
                    <TrashIcon size={16} />
                    <span>Remove due date</span>
                  </button>
                </>
              )}
            </div>
          )}
          {duePickerOpen && (
            <div className="detail-schedule-popover" style={getScheduleFixedStyle(300, 355)}>
              <CustomCalendarPicker
                initialDate={item.dueDate}
                todayStr={todayStr}
                onSave={(d) => {
                  onUpdate(item, { dueDate: d });
                  setDuePickerOpen(false);
                  setDueDateOptionsOpen(false);
                }}
                onCancel={() => setDuePickerOpen(false)}
              />
            </div>
          )}
        </section>

        <section className="detail-schedule-section">
          <button
            type="button"
            className="detail-schedule-trigger"
            aria-expanded={repeatOptionsOpen}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setScheduleAnchorRect({ top: rect.top, bottom: rect.bottom, left: rect.left });
              const next = !repeatOptionsOpen;
              setRepeatOptionsOpen(next);
              setRemindOptionsOpen(false);
              setRemindPickerOpen(false);
              setDueDateOptionsOpen(false);
              setDuePickerOpen(false);
            }}
          >
            <RepeatIcon size={20} />
            <span>Repeat</span>
            {item.repeat && item.repeat !== 'none' && <span className="detail-schedule-value">{item.repeat === 'custom' ? 'Custom' : item.repeat.charAt(0).toUpperCase() + item.repeat.slice(1)}</span>}
          </button>
          {repeatOptionsOpen && (
            <div className="detail-schedule-menu" role="menu" aria-label="Repeat options" style={getScheduleFixedStyle(248, 280)}>
              {(['daily', 'weekdays', 'weekly', 'monthly', 'yearly'] as RepeatRule[]).map((rule) => (
                <button
                  key={rule}
                  type="button"
                  role="menuitem"
                  className="detail-schedule-menu-item"
                  onClick={() => {
                    onUpdate(item, { repeat: rule });
                    setRepeatOptionsOpen(false);
                  }}
                >
                  <RepeatIcon size={16} />
                  <span>{rule.charAt(0).toUpperCase() + rule.slice(1)}</span>
                </button>
              ))}
              <div className="detail-schedule-menu-divider" />
              <button
                type="button"
                role="menuitem"
                className="detail-schedule-menu-item"
                onClick={() => {
                  setRepeatOptionsOpen(false);
                  setCustomRepeatOpen(true);
                }}
              >
                <RepeatIcon size={16} />
                <span>Custom…</span>
              </button>
              {item.repeat && item.repeat !== 'none' && (
                <>
                  <div className="detail-schedule-menu-divider" />
                  <button
                    type="button"
                    role="menuitem"
                    className="detail-schedule-menu-item danger"
                    onClick={() => {
                      onUpdate(item, { repeat: 'none' });
                      setRepeatOptionsOpen(false);
                    }}
                  >
                    <TrashIcon size={16} />
                    <span>Never repeat</span>
                  </button>
                </>
              )}
            </div>
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
            const timeStr = d.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            });
            return `Created by ${createdBy} on ${dateStr} at ${timeStr}`;
          })()}
          <span>
            Last modified by {lastModifiedBy} on {lastModifiedDate} at {lastModifiedTime}
          </span>
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
