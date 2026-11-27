import { useEffect, useRef, useState } from 'react';
import { ListTemplate, TodoList } from '../types/todo';
import { EmojiText } from '../lib/emoji';
import { AppSelect } from './AppSelect';

export const BUILTIN_TEMPLATES: ListTemplate[] = [
  {
    id: 'builtin-travel-packing',
    title: 'Travel Packing',
    icon: '🧳',
    color: 'teal',
    background: 'coast',
    createdAtMs: 0,
    tasks: [
      { text: 'Passport, ID & boarding passes', priority: 'p1', tags: ['travel'], estimateMinutes: 10 },
      { text: 'Phone charger, power bank & adapters', priority: 'p2', tags: ['travel', 'tech'], estimateMinutes: 10 },
      { text: 'Medications & toiletries', priority: 'p2', tags: ['travel'], estimateMinutes: 15 },
      { text: 'Clothes & weather-appropriate shoes', priority: 'p3', tags: ['travel'], estimateMinutes: 20 },
      { text: 'Lock windows & set out-of-office reply', priority: 'p2', tags: ['home'], estimateMinutes: 10 },
    ],
  },
  {
    id: 'builtin-weekly-review',
    title: 'Weekly Review',
    icon: '🗓️',
    color: 'purple',
    background: 'plain',
    createdAtMs: 0,
    tasks: [
      { text: 'Clear inbox & capture loose notes', priority: 'p2', tags: ['review'], estimateMinutes: 15 },
      { text: 'Review overdue & upcoming Planned tasks', priority: 'p1', tags: ['review'], estimateMinutes: 15 },
      { text: 'Pick top 3 priorities for next week', priority: 'p1', tags: ['planning'], estimateMinutes: 15 },
      { text: 'Archive completed projects & clean up lists', priority: 'p3', tags: ['review'], estimateMinutes: 10 },
    ],
  },
  {
    id: 'builtin-release-checklist',
    title: 'Project Launch Checklist',
    icon: '🚀',
    color: 'blue',
    background: 'plain',
    createdAtMs: 0,
    tasks: [
      {
        text: 'Run full test suite & production build',
        priority: 'p1',
        tags: ['release'],
        estimateMinutes: 20,
        steps: [{ text: 'Unit tests pass' }, { text: 'Type-check passes' }, { text: 'Production bundle verified' }],
      },
      { text: 'Verify mobile & responsive layout', priority: 'p1', tags: ['qa'], estimateMinutes: 20 },
      { text: 'Update changelog & release notes', priority: 'p2', tags: ['docs'], estimateMinutes: 15 },
      { text: 'Deploy & smoke-test live environment', priority: 'p1', tags: ['release'], estimateMinutes: 15 },
    ],
  },
];

interface TemplatesModalProps {
  customTemplates: ListTemplate[];
  lists: TodoList[];
  focusTemplateId?: string | null;
  focusToken?: number;
  onInstantiateTemplate: (template: ListTemplate) => Promise<void> | void;
  onSaveListAsTemplate: (listId: string) => Promise<void> | void;
  onDeleteTemplate: (templateId: string) => void;
  onClose: () => void;
}

export function TemplatesModal({
  customTemplates,
  lists,
  focusTemplateId = null,
  focusToken = 0,
  onInstantiateTemplate,
  onSaveListAsTemplate,
  onDeleteTemplate,
  onClose,
}: TemplatesModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [selectedListId, setSelectedListId] = useState<string>(lists[0]?.id ?? '');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [highlightedTemplateId, setHighlightedTemplateId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!focusTemplateId) return;
    setHighlightedTemplateId(focusTemplateId);
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

    const scrollTargetIntoModal = () => {
      const modal = modalRef.current;
      const root = modal ?? document;
      const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(focusTemplateId)
        : focusTemplateId.replace(/["\\]/g, '\\$&');
      const el = root.querySelector<HTMLElement>(`[data-template-id="${escaped}"]`);
      if (!el) return;
      if (modal) {
        const modalRect = modal.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const desiredTop = modal.scrollTop + (elRect.top - modalRect.top) - Math.max(20, (modal.clientHeight - elRect.height) / 2);
        modal.scrollTo({ top: Math.max(0, desiredTop), behavior });
      } else {
        el.scrollIntoView({ behavior, block: 'center', inline: 'nearest' });
      }
    };

    const rafId = window.requestAnimationFrame(scrollTargetIntoModal);
    const settleTimer = window.setTimeout(scrollTargetIntoModal, 240);
    const clearTimer = window.setTimeout(() => {
      setHighlightedTemplateId(null);
    }, 1800);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(settleTimer);
      window.clearTimeout(clearTimer);
    };
  }, [focusTemplateId, focusToken]);

  const handleUse = async (tpl: ListTemplate) => {
    setBusyId(tpl.id);
    try {
      await onInstantiateTemplate(tpl);
      onClose();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal-card templates-modal"
        role="dialog"
        aria-modal="true"
        aria-label="List Templates"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="insights-header">
          <div>
            <h2>List Templates</h2>
            <p className="insights-sub">Spin up reusable checklists or save any existing list as a template.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close templates">
            ×
          </button>
        </div>

        {lists.length > 0 && (
          <div
            data-template-id="save-bar"
            className={`templates-save-bar ${highlightedTemplateId === 'save-bar' ? 'command-highlight' : ''}`}
          >
            <AppSelect
              ariaLabel="Choose list to save as template"
              placeholder="Choose a list…"
              value={selectedListId}
              options={lists.map((l) => ({
                value: l.id,
                label: `${l.icon ? `${l.icon} ` : ''}${l.title}`,
              }))}
              onChange={(val) => setSelectedListId(val)}
            />
            <button
              type="button"
              className="chip-btn insights-action-btn"
              disabled={!selectedListId}
              onClick={() => {
                if (selectedListId) void onSaveListAsTemplate(selectedListId);
              }}
            >
              + Save as Template
            </button>
          </div>
        )}

        {customTemplates.length > 0 && (
          <div className="templates-group">
            <h3>Your Templates</h3>
            <div className="templates-grid">
              {customTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  data-template-id={tpl.id}
                  className={`template-card ${highlightedTemplateId === tpl.id ? 'command-highlight' : ''}`}
                >
                  <div className="template-card-head">
                    <span className="template-card-title">
                      {tpl.icon ? `${tpl.icon} ` : ''}
                      <EmojiText text={tpl.title} />
                    </span>
                    <button
                      type="button"
                      className="clear-btn"
                      onClick={() => onDeleteTemplate(tpl.id)}
                      aria-label={`Delete template ${tpl.title}`}
                      title="Delete template"
                    >
                      ×
                    </button>
                  </div>
                  <div className="template-card-meta">
                    {tpl.tasks.length} task{tpl.tasks.length === 1 ? '' : 's'}
                  </div>
                  <ul className="template-card-preview">
                    {tpl.tasks.slice(0, 3).map((t, i) => (
                      <li key={i}>{t.text}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="chip-btn insights-action-btn template-use-btn"
                    disabled={busyId === tpl.id}
                    onClick={() => void handleUse(tpl)}
                  >
                    {busyId === tpl.id ? 'Creating…' : 'Use Template'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="templates-group">
          <h3>Starter Templates</h3>
          <div className="templates-grid">
            {BUILTIN_TEMPLATES.map((tpl) => (
              <div
                key={tpl.id}
                data-template-id={tpl.id}
                className={`template-card ${highlightedTemplateId === tpl.id ? 'command-highlight' : ''}`}
              >
                <div className="template-card-head">
                  <span className="template-card-title">
                    {tpl.icon ? `${tpl.icon} ` : ''}
                    <EmojiText text={tpl.title} />
                  </span>
                </div>
                <div className="template-card-meta">
                  {tpl.tasks.length} task{tpl.tasks.length === 1 ? '' : 's'}
                </div>
                <ul className="template-card-preview">
                  {tpl.tasks.slice(0, 3).map((t, i) => (
                    <li key={i}>{t.text}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="chip-btn insights-action-btn template-use-btn"
                  disabled={busyId === tpl.id}
                  onClick={() => void handleUse(tpl)}
                >
                  {busyId === tpl.id ? 'Creating…' : 'Use Template'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
