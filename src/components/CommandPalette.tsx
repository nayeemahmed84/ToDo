import { useEffect, useMemo, useRef, useState } from 'react';
import { SmartListId, TodoItem, TodoList, ViewSelection } from '../types/todo';
import { scoreTextMatch, scoreTodoItemMatch } from '../lib/search';
import { EmojiText } from '../lib/emoji';

interface CommandPaletteProps {
  lists: TodoList[];
  items: TodoItem[];
  onSelectView: (sel: ViewSelection) => void;
  onSelectTask: (item: TodoItem) => void;
  onQuickAddTask: (text: string) => Promise<void> | void;
  onCycleTheme: () => void;
  onOpenSettings: () => void;
  onOpenInsights: () => void;
  onOpenTemplates: () => void;
  onExportIcs: () => void;
  onCreateList: (title: string) => Promise<void> | void;
  onClose: () => void;
}

interface PaletteEntry {
  id: string;
  section: 'Actions' | 'Lists' | 'Tasks';
  label: string;
  subtitle?: string;
  badge?: string;
  onRun: () => void;
}

const SMART_ENTRIES: { id: SmartListId; label: string }[] = [
  { id: 'my-day', label: 'My Day' },
  { id: 'important', label: 'Important' },
  { id: 'planned', label: 'Planned' },
  { id: 'all', label: 'All Tasks' },
  { id: 'completed', label: 'Completed' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'assigned-to-me', label: 'Assigned to me' },
  { id: 'trash', label: 'Trash' },
];

export function CommandPalette({
  lists,
  items,
  onSelectView,
  onSelectTask,
  onQuickAddTask,
  onCycleTheme,
  onOpenSettings,
  onOpenInsights,
  onOpenTemplates,
  onExportIcs,
  onCreateList,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const entries = useMemo<PaletteEntry[]>(() => {
    const q = query.trim();
    const result: PaletteEntry[] = [];

    if (q) {
      result.push({
        id: 'quick-add',
        section: 'Actions',
        label: `Add task: "${q}"`,
        subtitle: 'Supports dates, #tags, !p1–p4, ~30m',
        badge: 'Enter',
        onRun: () => {
          void onQuickAddTask(q);
          onClose();
        },
      });
    }

    const actions: PaletteEntry[] = [
      {
        id: 'act-insights',
        section: 'Actions',
        label: 'Daily Review & Productivity Insights',
        subtitle: 'Streaks, 7-day chart & My Day rollover',
        onRun: () => {
          onClose();
          onOpenInsights();
        },
      },
      {
        id: 'act-templates',
        section: 'Actions',
        label: 'List Templates & Checklists',
        subtitle: 'Create a list from a reusable template',
        onRun: () => {
          onClose();
          onOpenTemplates();
        },
      },
      {
        id: 'act-ics',
        section: 'Actions',
        label: 'Export Calendar (.ics / iCal)',
        subtitle: 'Download scheduled tasks for Google/Apple Calendar',
        onRun: () => {
          onClose();
          onExportIcs();
        },
      },
      {
        id: 'act-theme',
        section: 'Actions',
        label: 'Cycle App Theme',
        subtitle: 'Switch between Light, Dark, and iOS Glass themes',
        onRun: () => {
          onCycleTheme();
          onClose();
        },
      },
      {
        id: 'act-settings',
        section: 'Actions',
        label: 'Open Settings',
        subtitle: 'Preferences, notifications, backup & restore',
        onRun: () => {
          onClose();
          onOpenSettings();
        },
      },
    ];

    if (q) {
      actions.push({
        id: 'act-new-list',
        section: 'Actions',
        label: `Create new list "${q}"`,
        onRun: () => {
          void onCreateList(q);
          onClose();
        },
      });
    }

    const filteredActions = q
      ? actions.filter((a) => scoreTextMatch(`${a.label} ${a.subtitle ?? ''}`, q) > 0)
      : actions;
    result.push(...filteredActions);

    // Lists
    const listEntries: PaletteEntry[] = [
      ...SMART_ENTRIES.map((s) => ({
        id: `smart-${s.id}`,
        section: 'Lists' as const,
        label: s.label,
        subtitle: 'Smart list',
        onRun: () => {
          onSelectView({ type: 'smart', id: s.id });
          onClose();
        },
      })),
      ...lists.map((l) => ({
        id: `list-${l.id}`,
        section: 'Lists' as const,
        label: `${l.icon ? `${l.icon} ` : ''}${l.title}`,
        subtitle: 'List',
        onRun: () => {
          onSelectView({ type: 'list', id: l.id });
          onClose();
        },
      })),
    ];

    const filteredLists = q
      ? listEntries
          .map((e) => ({ e, score: scoreTextMatch(e.label, q) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 6)
          .map((x) => x.e)
      : listEntries.slice(0, 6);
    result.push(...filteredLists);

    // Tasks
    if (q) {
      const listById = new Map(lists.map((l) => [l.id, l.title]));
      const matchingTasks = items
        .filter((i) => !i.deletedAtMs)
        .map((item) => ({
          item,
          score: scoreTodoItemMatch(item, q, listById.get(item.listId)),
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(({ item }) => ({
          id: `task-${item.id}`,
          section: 'Tasks' as const,
          label: item.text,
          subtitle: `${listById.get(item.listId) ?? 'Tasks'}${item.dueDate ? ` · Due ${item.dueDate}` : ''}`,
          badge: item.done ? 'Done' : item.priority ? item.priority.toUpperCase() : undefined,
          onRun: () => {
            onSelectTask(item);
            onClose();
          },
        }));
      result.push(...matchingTasks);
    }

    return result;
  }, [
    query,
    lists,
    items,
    onSelectView,
    onSelectTask,
    onQuickAddTask,
    onCycleTheme,
    onOpenSettings,
    onOpenInsights,
    onOpenTemplates,
    onExportIcs,
    onCreateList,
    onClose,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((idx) => (entries.length ? (idx + 1) % entries.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((idx) => (entries.length ? (idx - 1 + entries.length) % entries.length : 0));
    } else if (e.key === 'Enter' && entries[activeIndex]) {
      e.preventDefault();
      entries[activeIndex].onRun();
    }
  };

  return (
    <div className="modal-backdrop command-palette-backdrop" onClick={onClose}>
      <div
        className="command-palette-card"
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="command-palette-input-row">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Jump to list, find task, run command, or type a new task…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Command palette search"
          />
          <kbd className="command-palette-kbd">Esc</kbd>
        </div>

        <div className="command-palette-list" role="listbox">
          {entries.length === 0 ? (
            <div className="command-palette-empty">No matching commands, lists, or tasks.</div>
          ) : (
            entries.map((entry, idx) => {
              const showSection = idx === 0 || entries[idx - 1].section !== entry.section;
              return (
                <div key={entry.id}>
                  {showSection && <div className="command-palette-section">{entry.section}</div>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={idx === activeIndex}
                    className={`command-palette-item ${idx === activeIndex ? 'active' : ''}`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={entry.onRun}
                  >
                    <div className="command-palette-item-text">
                      <span className="command-palette-item-label"><EmojiText text={entry.label} /></span>
                      {entry.subtitle && (
                        <span className="command-palette-item-sub">{entry.subtitle}</span>
                      )}
                    </div>
                    {entry.badge && <span className="command-palette-badge">{entry.badge}</span>}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
