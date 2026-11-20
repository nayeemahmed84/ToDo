import { FormEvent, useState } from 'react';
import { TodoItem, TodoStep } from '../types/todo';

interface TaskDetailProps {
  item: TodoItem;
  todayStr: string;
  onClose: () => void;
  onUpdate: (item: TodoItem, patch: Partial<TodoItem>) => Promise<void>;
  onDelete: (item: TodoItem) => Promise<void>;
}

export function TaskDetail({
  item,
  todayStr,
  onClose,
  onUpdate,
  onDelete,
}: TaskDetailProps) {
  const [title, setTitle] = useState(item.text);
  const [notes, setNotes] = useState(item.notes);
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

  return (
    <aside className="detail-panel">
      <div className="detail-header">
        <span>Task Details</span>
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
          <div className="due-row">
            <input
              type="date"
              value={item.dueDate ?? ''}
              onChange={(e) =>
                onUpdate(item, { dueDate: e.target.value || null })
              }
            />
            {item.dueDate && (
              <button
                className="clear-btn"
                onClick={() => onUpdate(item, { dueDate: null })}
              >
                Clear
              </button>
            )}
          </div>
        </label>
      </div>

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
          Created {new Date(item.createdAtMs).toLocaleDateString()}
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
