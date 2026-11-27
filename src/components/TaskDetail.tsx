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
import { RepeatRule, TaskPriority, TodoItem, TodoStep } from '../types/todo';
import { RichNotesEditor } from './RichNotesEditor';
import { AppSelect } from './AppSelect';
import {
  deleteAttachmentWithDrive,
  fetchListCollaboratorEmails,
  getAttachmentBlobWithDrive,
  getPreviewableBlob,
  isImageFile,
  sanitizeFileName,
  saveAttachmentBlob,
  uploadAttachmentToDrive,
} from '../lib/attachmentStorage';
import {
  connectGoogleDrive,
  getDriveFileDownloadUrl,
  getDriveFileViewUrl,
  isDriveSessionActive,
} from '../lib/googleDrive';

function addDaysStr(baseYmd: string, days: number): string {
  const [y, m, d] = baseYmd.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

interface TaskDetailProps {
  item: TodoItem;
  todayStr: string;
  currentUserId: string;
  currentUserName?: string;
  allItems?: TodoItem[];
  listTitle?: string;
  listIcon?: string | null;
  parentList?: { id: string; ownerUid: string; memberUids?: string[] } | null;
  exiting?: boolean;
  onStartFocus?: (item: TodoItem, minutes?: number) => void;
  onClose: () => void;
  onUpdate: (item: TodoItem, patch: Partial<TodoItem>) => Promise<void>;
  onDelete: (item: TodoItem) => Promise<void>;
}

export function TaskDetail({
  item,
  todayStr,
  currentUserId,
  currentUserName = 'You',
  allItems = [],
  listTitle,
  listIcon,
  parentList,
  exiting = false,
  onStartFocus,
  onClose,
  onUpdate,
  onDelete,
}: TaskDetailProps) {
  const [title, setTitle] = useState(item.text);
  const [notes, setNotes] = useState(item.notes);
  const [tagInput, setTagInput] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [socialTab, setSocialTab] = useState<'comments' | 'activity'>('comments');
  const [blockerSelectId, setBlockerSelectId] = useState('');
  const [focusDurationMin, setFocusDurationMin] = useState<number>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('todo.focusDurationsMin') || '{}') as { focus?: number };
      if (typeof saved.focus === 'number' && saved.focus >= 1 && saved.focus <= 180) {
        return Math.round(saved.focus);
      }
    } catch {
      // Ignore storage errors
    }
    return 25;
  });
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
  const [driveConnectedNow, setDriveConnectedNow] = useState<boolean>(() => isDriveSessionActive());
  const [driveBusy, setDriveBusy] = useState(false);
  const [fileUploadProgress, setFileUploadProgress] = useState<{
    name: string;
    stage: 'saving' | 'uploading' | 'done';
    percent: number;
  } | null>(null);
  const [attachmentThumbs, setAttachmentThumbs] = useState<Record<string, string>>({});
  const [previewModal, setPreviewModal] = useState<{
    attId: string;
    name: string;
    url: string;
    kind: 'image' | 'pdf' | 'text';
    textContent?: string;
  } | null>(null);
  const [previewZoom, setPreviewZoom] = useState(1);

  useEffect(() => {
    if (!previewModal) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (previewModal.kind === 'image') {
          const delta = e.deltaY < 0 ? 0.15 : -0.15;
          setPreviewZoom((z) => Math.min(4, Math.max(0.5, Number((z + delta).toFixed(2)))));
        }
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [previewModal]);

  useEffect(() => {
    let cancelled = false;
    const createdUrls: string[] = [];
    const atts = item.attachments ?? [];

    (async () => {
      const next: Record<string, string> = {};
      for (const att of atts) {
        if (!isImageFile(att.name, att.type)) continue;
        try {
          const blob = await getAttachmentBlobWithDrive(att, { interactive: false });
          if (!blob || cancelled) continue;
          const previewBlob = await getPreviewableBlob(blob, att.name, att.type);
          if (cancelled) continue;
          const url = URL.createObjectURL(previewBlob);
          createdUrls.push(url);
          next[att.id] = url;
        } catch {
          // Ignore preview errors for individual thumbnails
        }
      }
      if (!cancelled) {
        setAttachmentThumbs(next);
      } else {
        createdUrls.forEach((u) => URL.revokeObjectURL(u));
      }
    })();

    return () => {
      cancelled = true;
      createdUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [item.id, item.attachments]);

  const handleDownloadAttachment = async (att: { id: string; name: string; driveFileId?: string; uploadedByUid?: string }) => {
    setFileError(null);
    const isSharedFromOther = Boolean(att.driveFileId && att.uploadedByUid && currentUserId && att.uploadedByUid !== currentUserId);
    const blob = isSharedFromOther ? null : await getAttachmentBlobWithDrive(att, { interactive: true });
    if (isDriveSessionActive()) setDriveConnectedNow(true);
    if (!blob) {
      if (att.driveFileId) {
        window.open(getDriveFileDownloadUrl(att.driveFileId), '_blank', 'noopener,noreferrer');
        return;
      }
      setFileError('File data not found locally. Please re-add the file.');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = att.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handlePreviewAttachment = async (att: { id: string; name: string; type?: string; driveFileId?: string; uploadedByUid?: string }) => {
    setFileError(null);
    const isSharedFromOther = Boolean(att.driveFileId && att.uploadedByUid && currentUserId && att.uploadedByUid !== currentUserId);
    const blob = isSharedFromOther ? null : await getAttachmentBlobWithDrive(att, { interactive: true });
    if (isDriveSessionActive()) setDriveConnectedNow(true);
    if (!blob) {
      if (att.driveFileId) {
        window.open(getDriveFileViewUrl(att.driveFileId), '_blank', 'noopener,noreferrer');
        return;
      }
      setFileError('File data not found locally. Please re-add the file.');
      return;
    }
    if (isImageFile(att.name, att.type)) {
      const previewBlob = await getPreviewableBlob(blob, att.name, att.type);
      const url = URL.createObjectURL(previewBlob);
      setPreviewZoom(1);
      setPreviewModal({ attId: att.id, name: att.name, url, kind: 'image' });
      return;
    }
    const lower = att.name.toLowerCase();
    if (att.type === 'application/pdf' || lower.endsWith('.pdf')) {
      const url = URL.createObjectURL(blob);
      setPreviewModal({ attId: att.id, name: att.name, url, kind: 'pdf' });
      return;
    }
    if (
      att.type?.startsWith('text/') ||
      ['.txt', '.md', '.json', '.csv', '.log', '.xml', '.yml', '.yaml'].some((ext) => lower.endsWith(ext))
    ) {
      const textContent = await blob.text();
      setPreviewModal({ attId: att.id, name: att.name, url: '', kind: 'text', textContent });
      return;
    }
    // Fallback: trigger download for non-previewable file types
    await handleDownloadAttachment(att);
  };
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

      <div className="detail-card detail-action-card detail-attachments-card">
        <div className="detail-attachments-header">
          <button
            type="button"
            className="detail-action detail-action-inline detail-attachments-add-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            <PaperclipIcon size={20} />
            <span>Add file</span>
          </button>
          <button
            type="button"
            className={`detail-drive-pill ${driveConnectedNow ? 'connected' : ''}`}
            disabled={driveBusy}
            title={
              driveConnectedNow
                ? 'Synced to ToDo PWA/Attachments in Google Drive · Click to refresh session'
                : 'Connect your Google Drive to sync attachments across devices'
            }
            onClick={async () => {
              setFileError(null);
              setDriveBusy(true);
              try {
                await connectGoogleDrive();
                setDriveConnectedNow(true);
              } catch (err) {
                setFileError(err instanceof Error ? err.message : 'Failed to connect Google Drive.');
              } finally {
                setDriveBusy(false);
              }
            }}
          >
            {driveConnectedNow && <span className="detail-drive-pill-dot" aria-hidden="true" />}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
            </svg>
            <span>{driveBusy ? 'Connecting…' : driveConnectedNow ? 'Drive' : 'Connect Drive'}</span>
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={async (e) => {
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
            const attId = String(Date.now());
            const originalName = f.name;
            setFileUploadProgress({ name: originalName, stage: 'saving', percent: 15 });
            try {
              await saveAttachmentBlob(attId, f);
            } catch {
              setFileUploadProgress(null);
              setFileError('Failed to save file locally.');
              e.target.value = '';
              return;
            }
            const safeName = sanitizeFileName(f.name);
            let driveFileId: string | null = null;
            if (isDriveSessionActive()) {
              setFileUploadProgress({ name: originalName, stage: 'uploading', percent: 25 });
              const shareWithEmails = parentList
                ? await fetchListCollaboratorEmails(parentList, currentUserId)
                : [];
              driveFileId = await uploadAttachmentToDrive({
                blob: f,
                fileName: `${attId}-${safeName}`,
                contentType: f.type,
                interactive: false,
                shareWithEmails,
                onProgress: (pct) => {
                  const mapped = Math.min(98, 25 + Math.round(pct * 0.73));
                  setFileUploadProgress({ name: originalName, stage: 'uploading', percent: mapped });
                },
              });
            }
            onUpdate(item, {
              attachments: [
                ...existing,
                {
                  id: attId,
                  name: safeName,
                  size: f.size,
                  type: f.type,
                  ...(driveFileId ? { driveFileId, uploadedByUid: currentUserId || undefined } : {}),
                },
              ],
            });
            setFileUploadProgress({ name: originalName, stage: 'done', percent: 100 });
            window.setTimeout(() => {
              setFileUploadProgress((prev) => (prev?.stage === 'done' ? null : prev));
            }, 1400);
            e.target.value = '';
          }}
        />
        {fileUploadProgress && (
          <div className={`detail-upload-progress stage-${fileUploadProgress.stage}`} role="status" aria-live="polite">
            <div className="detail-upload-progress-row">
              <span className="detail-upload-progress-label">
                {fileUploadProgress.stage === 'saving'
                  ? `Saving ${fileUploadProgress.name}…`
                  : fileUploadProgress.stage === 'uploading'
                    ? `Uploading ${fileUploadProgress.name} to Drive…`
                    : `Uploaded ${fileUploadProgress.name}`}
              </span>
              <span className="detail-upload-progress-pct">{fileUploadProgress.percent}%</span>
            </div>
            <div className="detail-upload-progress-track">
              <div
                className="detail-upload-progress-fill"
                style={{ width: `${fileUploadProgress.percent}%` }}
              />
            </div>
          </div>
        )}
        {fileError && (
          <div className="detail-attachments-error">{fileError}</div>
        )}
        {(item.attachments ?? []).length > 0 && (
          <div className="detail-attachments-list">
            {(item.attachments ?? []).map((att) => (
              <div key={att.id} className="detail-attachment-row">
                <button
                  type="button"
                  disabled={Boolean(att.missing)}
                  onClick={() => {
                    if (att.missing) return;
                    void handlePreviewAttachment(att);
                  }}
                  title={att.missing ? 'File data was not included in backup' : 'Click to preview'}
                  className="detail-attachment-preview-btn"
                  style={{
                    color: att.missing ? 'var(--color-text-2)' : 'inherit',
                    cursor: att.missing ? 'not-allowed' : 'pointer',
                    opacity: att.missing ? 0.75 : 1,
                  }}
                >
                  {attachmentThumbs[att.id] && !att.missing ? (
                    <img
                      src={attachmentThumbs[att.id]}
                      alt={att.name}
                      style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }}
                    />
                  ) : (
                    <PaperclipIcon size={14} />
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {att.name} ({Math.max(1, Math.round(att.size / 1024))} KB)
                    {att.driveFileId ? ' · Drive' : ''}
                    {att.missing ? ' — file unavailable' : ''}
                  </span>
                </button>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                  {!att.missing && (
                    <button
                      type="button"
                      className="clear-btn"
                      title="Download"
                      aria-label={`Download ${att.name}`}
                      onClick={() => void handleDownloadAttachment(att)}
                    >
                      ↓
                    </button>
                  )}
                  <button
                    type="button"
                    className="clear-btn"
                    title="Remove"
                    aria-label={`Remove ${att.name}`}
                    onClick={async () => {
                      setFileError(null);
                      onUpdate(item, { attachments: (item.attachments ?? []).filter((a) => a.id !== att.id) });
                      const result = await deleteAttachmentWithDrive(att, { interactive: true });
                      if (isDriveSessionActive()) setDriveConnectedNow(true);
                      if (result.driveError) {
                        setFileError(`Removed from task, but ${result.driveError}`);
                      }
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {previewModal && (
          <div
            className="modal-backdrop"
            style={{
              zIndex: 10000,
              background: 'rgba(0, 0, 0, 0.72)',
              backdropFilter: 'blur(8px)',
              padding: '24px',
            }}
            onClick={() => {
              if (previewModal.url) URL.revokeObjectURL(previewModal.url);
              setPreviewModal(null);
            }}
          >
            <div
              className="modal-card"
              style={{
                maxWidth: '880px',
                width: '92vw',
                maxHeight: '88vh',
                display: 'flex',
                flexDirection: 'column',
                padding: 0,
                borderRadius: '14px',
                overflow: 'hidden',
                background: 'var(--color-surface, #242424)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: '0 24px 64px rgba(0, 0, 0, 0.55)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 18px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  background: 'rgba(255, 255, 255, 0.02)',
                }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <PaperclipIcon size={16} />
                  <strong
                    style={{
                      fontSize: '0.92rem',
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {previewModal.name}
                  </strong>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  {previewModal.kind === 'image' && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginRight: '4px' }}>
                      <button
                        type="button"
                        className="clear-btn"
                        title="Zoom out"
                        aria-label="Zoom out"
                        onClick={() => setPreviewZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        className="clear-btn"
                        title="Reset zoom"
                        style={{ fontSize: '0.78rem', minWidth: '46px' }}
                        onClick={() => setPreviewZoom(1)}
                      >
                        {Math.round(previewZoom * 100)}%
                      </button>
                      <button
                        type="button"
                        className="clear-btn"
                        title="Zoom in"
                        aria-label="Zoom in"
                        onClick={() => setPreviewZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))))}
                      >
                        +
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      fontWeight: 500,
                    }}
                    onClick={() => void handleDownloadAttachment({ id: previewModal.attId, name: previewModal.name })}
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    className="clear-btn"
                    aria-label="Close preview"
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '8px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.1rem',
                    }}
                    onClick={() => {
                      if (previewModal.url) URL.revokeObjectURL(previewModal.url);
                      setPreviewModal(null);
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
              <div
                onWheel={(e) => {
                  if (previewModal.kind !== 'image') return;
                  e.preventDefault();
                  const delta = e.deltaY < 0 ? 0.2 : -0.2;
                  setPreviewZoom((z) => Math.min(4, Math.max(0.5, Number((z + delta).toFixed(2)))));
                }}
                style={{
                  padding: '16px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'auto',
                  background: 'rgba(0, 0, 0, 0.22)',
                }}
              >
                {previewModal.kind === 'image' && (
                  <img
                    src={previewModal.url}
                    alt={previewModal.name}
                    onDoubleClick={() => setPreviewZoom((z) => (z === 1 ? 2 : 1))}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '70vh',
                      objectFit: 'contain',
                      borderRadius: '8px',
                      boxShadow: '0 8px 28px rgba(0, 0, 0, 0.35)',
                      transform: `scale(${previewZoom})`,
                      transformOrigin: 'center center',
                      transition: 'transform 0.12s ease',
                      cursor: previewZoom > 1 ? 'zoom-out' : 'zoom-in',
                    }}
                  />
                )}
                {previewModal.kind === 'pdf' && (
                  <iframe
                    src={previewModal.url}
                    title={previewModal.name}
                    style={{ width: '100%', height: '70vh', border: 'none', borderRadius: '8px' }}
                  />
                )}
                {previewModal.kind === 'text' && (
                  <pre
                    style={{
                      margin: 0,
                      width: '100%',
                      padding: '14px 16px',
                      maxHeight: '70vh',
                      overflow: 'auto',
                      background: 'rgba(0, 0, 0, 0.3)',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {previewModal.textContent}
                  </pre>
                )}
              </div>
            </div>
          </div>
        )}
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
            <AppSelect
              ariaLabel="Recurrence type"
              value={repeatUnit}
              options={[
                { value: 'days', label: 'days' },
                { value: 'weeks', label: 'weeks' },
                { value: 'months', label: 'months' },
                { value: 'years', label: 'years' },
              ]}
              onChange={(val) => setRepeatUnit(val as 'days' | 'weeks' | 'months' | 'years')}
            />
          </div>
          {repeatUnit === 'weeks' && (
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
          )}
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <button type="button" className="chip-btn" onClick={() => setCustomRepeatOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={repeatUnit === 'weeks' && repeatDays.length === 0}
              className="chip-btn"
              style={{ background: 'var(--color-accent)', color: 'var(--color-text-inverse)', opacity: repeatUnit === 'weeks' && repeatDays.length === 0 ? 0.5 : 1 }}
              onClick={() => {
                const sortedDays = repeatUnit === 'weeks' ? [...repeatDays].sort((a, b) => a - b) : [];
                onUpdate(item, { repeat: 'custom', repeatCustom: { interval: repeatInterval, unit: repeatUnit, days: sortedDays } });
                setCustomRepeatOpen(false);
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      <div className="detail-card detail-note-card">
        <RichNotesEditor
          itemId={item.id}
          value={notes}
          onChange={(md) => setNotes(md)}
          onCommit={(md) => {
            if (md !== item.notes) {
              void onUpdate(item, { notes: md });
            }
          }}
        />
      </div>

      {/* Focus / Pomodoro Timer */}
      {onStartFocus && (
        <div className="detail-card detail-focus-card">
          <button
            type="button"
            className="detail-focus-trigger"
            onClick={() => onStartFocus(item, focusDurationMin)}
          >
            <span className="detail-focus-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="13" r="8" />
                <path d="M12 9v4l2.5 1.5" />
                <path d="M9 2h6" />
              </svg>
            </span>
            <span className="detail-focus-text">
              <span className="detail-focus-title">Start Focus Session</span>
              <span className="detail-focus-sub">
                {(item.focusMinutes ?? 0) > 0
                  ? `${item.focusMinutes}m logged · ${item.focusSessions ?? 1} session${(item.focusSessions ?? 1) === 1 ? '' : 's'}`
                  : `${focusDurationMin} min focus timer`}
              </span>
            </span>
            <span className="detail-focus-badge">{focusDurationMin}m</span>
          </button>
          <div className="detail-focus-presets" role="group" aria-label="Focus duration">
            {[15, 25, 45, 60].map((mins) => (
              <button
                key={mins}
                type="button"
                className={`detail-focus-preset-btn ${focusDurationMin === mins ? 'active' : ''}`}
                onClick={() => setFocusDurationMin(mins)}
              >
                {mins}m
              </button>
            ))}
            <label className="detail-focus-custom-wrap" aria-label="Custom focus minutes">
              <input
                type="number"
                min={1}
                max={180}
                value={focusDurationMin}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(180, Math.round(Number(e.target.value) || 1)));
                  setFocusDurationMin(val);
                }}
              />
              <span>m</span>
            </label>
          </div>
        </div>
      )}

      {/* Priority & Effort Estimate */}
      <div className="detail-card detail-meta-card">
        <div className="detail-field-group">
          <span className="detail-section-title">Priority</span>
          <div className="detail-segmented-track" role="group" aria-label="Priority">
            {([null, 'p1', 'p2', 'p3', 'p4'] as Array<TaskPriority | null>).map((p) => {
              const isActive = (item.priority ?? null) === p;
              return (
                <button
                  key={p ?? 'none'}
                  type="button"
                  className={`detail-seg-option ${p ? `prio-${p}` : 'is-none'} ${isActive ? 'active' : ''}`}
                  aria-pressed={isActive}
                  onClick={() => void onUpdate(item, { priority: p })}
                >
                  {p && <span className={`prio-dot prio-dot-${p}`} aria-hidden="true" />}
                  <span>{p ? p.toUpperCase() : 'None'}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="detail-field-group">
          <span className="detail-section-title">Effort Estimate</span>
          <div className="detail-segmented-track" role="group" aria-label="Effort estimate">
            {[null, 15, 30, 60, 120].map((mins) => {
              const isActive = (item.estimateMinutes ?? null) === mins;
              return (
                <button
                  key={mins ?? 'none'}
                  type="button"
                  className={`detail-seg-option ${mins === null ? 'is-none' : 'is-effort'} ${isActive ? 'active' : ''}`}
                  aria-pressed={isActive}
                  onClick={() => void onUpdate(item, { estimateMinutes: mins })}
                >
                  {mins === null ? 'None' : mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tags (#hashtags) */}
      <div className="detail-card detail-meta-card">
        <span className="detail-section-title">Tags</span>
        {(item.tags ?? []).length > 0 && (
          <div className="detail-tags-wrap">
            {(item.tags ?? []).map((tag) => (
              <span key={tag} className="detail-tag-chip">
                #{tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  onClick={() =>
                    void onUpdate(item, {
                      tags: (item.tags ?? []).filter((t) => t !== tag),
                    })
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <form
          className="detail-inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const cleaned = tagInput.trim().replace(/^#+/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
            if (!cleaned) return;
            const current = item.tags ?? [];
            if (!current.includes(cleaned)) {
              void onUpdate(item, { tags: [...current, cleaned] });
            }
            setTagInput('');
          }}
        >
          <input
            type="text"
            placeholder="Add #tag and press Enter"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
          />
          <button type="submit" className="detail-inline-submit" disabled={!tagInput.trim()}>
            Add
          </button>
        </form>
      </div>

      {/* Dependencies ("Waiting On") */}
      {allItems.length > 0 && (
        <div className="detail-card detail-meta-card">
          <span className="detail-section-title">Waiting On</span>
          {(item.blockedByIds ?? []).length > 0 && (
            <ul className="detail-deps-list">
              {(item.blockedByIds ?? []).map((bid) => {
                const blocker = allItems.find((x) => x.id === bid);
                if (!blocker) return null;
                return (
                  <li key={bid} className={`detail-dep-item ${blocker.done ? 'resolved' : ''}`}>
                    <span className="detail-dep-status" aria-hidden="true">
                      {blocker.done ? '✓' : '⏳'}
                    </span>
                    <span className="detail-dep-title"><EmojiText text={blocker.text} /></span>
                    <button
                      type="button"
                      className="clear-btn"
                      aria-label={`Remove dependency ${blocker.text}`}
                      onClick={() =>
                        void onUpdate(item, {
                          blockedByIds: (item.blockedByIds ?? []).filter((id) => id !== bid),
                        })
                      }
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="detail-inline-form">
            <AppSelect
              ariaLabel="Select blocking task"
              placeholder="Link a prerequisite task…"
              value={blockerSelectId}
              searchable
              options={allItems
                .filter(
                  (candidate) =>
                    !candidate.deletedAtMs &&
                    !candidate.done &&
                    candidate.id !== item.id &&
                    !(item.blockedByIds ?? []).includes(candidate.id)
                )
                .slice(0, 60)
                .map((candidate) => ({
                  value: candidate.id,
                  label: candidate.text.slice(0, 64),
                  badge: candidate.dueDate ?? undefined,
                }))}
              onChange={(val) => setBlockerSelectId(val)}
            />
            <button
              type="button"
              className="detail-inline-submit"
              disabled={!blockerSelectId}
              onClick={() => {
                if (!blockerSelectId) return;
                void onUpdate(item, {
                  blockedByIds: [...(item.blockedByIds ?? []), blockerSelectId],
                });
                setBlockerSelectId('');
              }}
            >
              Link
            </button>
          </div>
        </div>
      )}

      {/* Comments & Activity Log */}
      <div className="detail-card detail-meta-card">
        <div className="detail-card-row-head">
          <div className="detail-social-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={socialTab === 'comments'}
              className={`detail-social-tab ${socialTab === 'comments' ? 'active' : ''}`}
              onClick={() => setSocialTab('comments')}
            >
              Comments ({(item.comments ?? []).length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={socialTab === 'activity'}
              className={`detail-social-tab ${socialTab === 'activity' ? 'active' : ''}`}
              onClick={() => setSocialTab('activity')}
            >
              Activity ({(item.activity ?? []).length})
            </button>
          </div>
        </div>

        {socialTab === 'comments' ? (
          <>
            {(item.comments ?? []).length > 0 && (
              <ul className="detail-comments-list">
                {(item.comments ?? []).map((c) => (
                  <li key={c.id} className="detail-comment-item">
                    <div className="detail-comment-meta">
                      <strong>{c.authorName}</strong>
                      <span>
                        {new Date(c.createdAtMs).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                      {c.authorUid === currentUserId && (
                        <button
                          type="button"
                          className="clear-btn"
                          aria-label="Delete comment"
                          onClick={() =>
                            void onUpdate(item, {
                              comments: (item.comments ?? []).filter((x) => x.id !== c.id),
                            })
                          }
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div className="detail-comment-body">{c.text}</div>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="detail-inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                const text = commentInput.trim();
                if (!text) return;
                const nextComment = {
                  id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  text,
                  authorUid: currentUserId,
                  authorName: currentUserName,
                  createdAtMs: Date.now(),
                };
                void onUpdate(item, {
                  comments: [...(item.comments ?? []), nextComment],
                });
                setCommentInput('');
              }}
            >
              <input
                type="text"
                placeholder="Write a comment…"
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
              />
              <button type="submit" className="detail-inline-submit" disabled={!commentInput.trim()}>
                Post
              </button>
            </form>
          </>
        ) : (
          <ul className="detail-activity-list">
            {(item.activity ?? []).length === 0 ? (
              <li className="detail-activity-empty">No recent activity logged yet.</li>
            ) : (
              [...(item.activity ?? [])]
                .reverse()
                .slice(0, 20)
                .map((act) => (
                  <li key={act.id} className="detail-activity-item">
                    <span>
                      <strong>{act.actorName}</strong> {act.text}
                    </span>
                    <small>
                      {new Date(act.createdAtMs).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </small>
                  </li>
                ))
            )}
          </ul>
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
