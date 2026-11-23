import { useEffect } from 'react';
import { TodoItem, TodoList } from '../types/todo';

export interface PrintOptions {
  includeCompleted: boolean;
  includeSteps: boolean;
  includeNotes: boolean;
  includeMeta: boolean;
  includeHandwrittenLines: boolean;
  compact: boolean;
}

export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  includeCompleted: true,
  includeSteps: true,
  includeNotes: true,
  includeMeta: true,
  includeHandwrittenLines: true,
  compact: false,
};

interface PrintSheetProps {
  title: string;
  icon?: string | null;
  activeItems: TodoItem[];
  completedItems: TodoItem[];
  lists: TodoList[];
  showListName?: boolean;
  todayStr: string;
  options: PrintOptions;
  preview?: boolean;
}

export function PrintSheet({
  title,
  icon,
  activeItems,
  completedItems,
  lists,
  showListName = false,
  todayStr,
  options,
  preview = false,
}: PrintSheetProps) {
  const listTitleById = new Map(lists.map((l) => [l.id, l.title]));
  const printedDate = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const renderTask = (item: TodoItem) => {
    const listName = listTitleById.get(item.listId);
    const metaParts: string[] = [];
    if (options.includeMeta) {
      if (showListName && listName) metaParts.push(listName);
      if (item.myDayDate === todayStr) metaParts.push('My Day');
      if (item.dueDate) {
        metaParts.push(
          item.dueDate < todayStr
            ? `Overdue (${item.dueDate})`
            : item.dueDate === todayStr
              ? 'Due Today'
              : `Due ${item.dueDate}`
        );
      }
      if (item.repeat && item.repeat !== 'none') {
        metaParts.push(`Repeats ${item.repeat}`);
      }
    }

    return (
      <li key={item.id} className={`print-task-item ${item.done ? 'is-done' : ''}`}>
        <div className="print-task-main">
          <span className={`print-checkbox ${item.done ? 'checked' : ''}`} aria-hidden="true">
            {item.done ? '✓' : ''}
          </span>
          <div className="print-task-content">
            <div className="print-task-title-row">
              {item.important && <span className="print-star" aria-label="Important">★</span>}
              <span className="print-task-title">{item.text}</span>
            </div>
            {metaParts.length > 0 && (
              <div className="print-task-meta">{metaParts.join(' · ')}</div>
            )}
            {options.includeSteps && item.steps && item.steps.length > 0 && (
              <ul className="print-steps-list">
                {item.steps.map((step) => (
                  <li key={step.id} className={`print-step-item ${step.done ? 'is-done' : ''}`}>
                    <span className={`print-step-box ${step.done ? 'checked' : ''}`} aria-hidden="true">
                      {step.done ? '✓' : ''}
                    </span>
                    <span>{step.text}</span>
                  </li>
                ))}
              </ul>
            )}
            {options.includeNotes && item.notes && item.notes.trim() && (
              <div className="print-task-notes">{item.notes.trim()}</div>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className={`print-sheet ${options.compact ? 'is-compact' : ''} ${preview ? 'is-preview' : ''}`}>
      <header className="print-sheet-header">
        <div className="print-sheet-title-wrap">
          {icon && <span className="print-sheet-icon" aria-hidden="true">{icon}</span>}
          <h1 className="print-sheet-title">{title}</h1>
        </div>
        <div className="print-sheet-subtitle">
          <span>{printedDate}</span>
          <span>
            {activeItems.length} {activeItems.length === 1 ? 'task' : 'tasks'}
            {options.includeCompleted && completedItems.length > 0
              ? ` · ${completedItems.length} completed`
              : ''}
          </span>
        </div>
      </header>

      {activeItems.length === 0 && (!options.includeCompleted || completedItems.length === 0) ? (
        <p className="print-empty">No tasks in this list.</p>
      ) : (
        <>
          {activeItems.length > 0 && (
            <ul className="print-task-list">
              {activeItems.map(renderTask)}
            </ul>
          )}

          {options.includeCompleted && completedItems.length > 0 && (
            <section className="print-completed-section">
              <h2 className="print-section-heading">Completed ({completedItems.length})</h2>
              <ul className="print-task-list">
                {completedItems.map(renderTask)}
              </ul>
            </section>
          )}
        </>
      )}

      {options.includeHandwrittenLines && (
        <section className="print-notes-lines">
          <h2 className="print-section-heading">Notes &amp; Additional Items</h2>
          <div className="print-ruled-line" />
          <div className="print-ruled-line" />
          <div className="print-ruled-line" />
          <div className="print-ruled-line" />
        </section>
      )}
    </div>
  );
}

interface PrintModalProps {
  title: string;
  icon?: string | null;
  activeItems: TodoItem[];
  completedItems: TodoItem[];
  lists: TodoList[];
  showListName?: boolean;
  todayStr: string;
  options: PrintOptions;
  onChangeOptions: (next: PrintOptions) => void;
  onPrint: () => void;
  onClose: () => void;
}

export function PrintModal({
  title,
  icon,
  activeItems,
  completedItems,
  lists,
  showListName,
  todayStr,
  options,
  onChangeOptions,
  onPrint,
  onClose,
}: PrintModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onPrint();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, onPrint]);

  const toggle = (key: keyof PrintOptions) =>
    onChangeOptions({ ...options, [key]: !options[key] });

  return (
    <div className="modal-backdrop print-modal-backdrop" onClick={onClose}>
      <div
        className="modal-card print-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Print list options"
      >
        <div className="print-modal-header">
          <div>
            <h2>Print list</h2>
            <p className="print-modal-subtitle">
              Formatted cleanly for paper — black &amp; white, high contrast, with pen-friendly checkboxes.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="print-modal-body">
          <div className="print-options-panel">
            <h3>Include on paper</h3>
            <label className="print-option-row">
              <input
                type="checkbox"
                checked={options.includeCompleted}
                onChange={() => toggle('includeCompleted')}
              />
              <span>Completed tasks ({completedItems.length})</span>
            </label>
            <label className="print-option-row">
              <input
                type="checkbox"
                checked={options.includeSteps}
                onChange={() => toggle('includeSteps')}
              />
              <span>Subtasks / Steps</span>
            </label>
            <label className="print-option-row">
              <input
                type="checkbox"
                checked={options.includeNotes}
                onChange={() => toggle('includeNotes')}
              />
              <span>Task notes</span>
            </label>
            <label className="print-option-row">
              <input
                type="checkbox"
                checked={options.includeMeta}
                onChange={() => toggle('includeMeta')}
              />
              <span>Due dates, My Day &amp; repeat info</span>
            </label>
            <label className="print-option-row">
              <input
                type="checkbox"
                checked={options.includeHandwrittenLines}
                onChange={() => toggle('includeHandwrittenLines')}
              />
              <span>Blank lines for handwritten notes</span>
            </label>
            <label className="print-option-row">
              <input
                type="checkbox"
                checked={options.compact}
                onChange={() => toggle('compact')}
              />
              <span>Compact spacing (fits more per page)</span>
            </label>
          </div>

          <div className="print-preview-panel" aria-label="Paper preview">
            <PrintSheet
              title={title}
              icon={icon}
              activeItems={activeItems}
              completedItems={completedItems}
              lists={lists}
              showListName={showListName}
              todayStr={todayStr}
              options={options}
              preview
            />
          </div>
        </div>

        <div className="print-modal-footer">
          <button type="button" className="chip-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={onPrint}>
            Print
          </button>
        </div>
      </div>
    </div>
  );
}
