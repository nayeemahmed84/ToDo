import { FormEvent, useEffect, useRef, useState } from 'react';
import { PwaSharePayload } from '../lib/pwa';
import { formatSharedFileSize, SharedFileRecord } from '../lib/shareTarget';
import { TodoList } from '../types/todo';

interface ShareTargetModalProps {
  payload: PwaSharePayload;
  lists: TodoList[];
  defaultListId: string;
  onSave: (data: {
    title: string;
    note: string;
    listId: string;
    addToMyDay: boolean;
    files: SharedFileRecord[];
  }) => Promise<void>;
  onClose: () => void;
}

export function ShareTargetModal({
  payload,
  lists,
  defaultListId,
  onSave,
  onClose,
}: ShareTargetModalProps) {
  const [title, setTitle] = useState(payload.title);
  const [note, setNote] = useState(payload.note);
  const [listId, setListId] = useState(defaultListId);
  const [addToMyDay, setAddToMyDay] = useState(false);
  const [files, setFiles] = useState<SharedFileRecord[]>(payload.files ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, saving]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Please enter a task title.');
      titleInputRef.current?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: trimmed,
        note: note.trim(),
        listId,
        addToMyDay,
        files,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save shared task.');
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-target-modal-title"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div className="modal-card share-target-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="share-target-modal-title">Save shared item to To Do</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="share-target-form">
          <label className="share-target-field">
            <span>Task title</span>
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              maxLength={240}
              required
            />
          </label>

          <label className="share-target-field">
            <span>Notes &amp; link</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional notes or shared URL"
              rows={3}
            />
          </label>

          <div className="share-target-row">
            <label className="share-target-field share-target-list-field">
              <span>Target list</span>
              <select value={listId} onChange={(e) => setListId(e.target.value)}>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.icon ? `${l.icon} ` : ''}
                    {l.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="share-target-checkbox">
              <input
                type="checkbox"
                checked={addToMyDay}
                onChange={(e) => setAddToMyDay(e.target.checked)}
              />
              <span>Add to My Day</span>
            </label>
          </div>

          {files.length > 0 && (
            <div className="share-target-files">
              <span className="share-target-files-label">
                Shared attachments ({files.length})
              </span>
              <ul className="share-target-file-list">
                {files.map((file, idx) => (
                  <li key={`${file.name}-${idx}`} className="share-target-file-item">
                    <span className="share-target-file-name" title={file.name}>
                      {file.name}
                    </span>
                    <span className="share-target-file-size">
                      {formatSharedFileSize(file.size)}
                    </span>
                    <button
                      type="button"
                      className="share-target-file-remove"
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label={`Remove ${file.name}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <div className="share-target-error" role="alert">
              {error}
            </div>
          )}

          <div className="share-target-actions">
            <button
              type="button"
              className="secondary-btn"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="primary-btn" disabled={saving}>
              {saving ? 'Saving…' : 'Save Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
