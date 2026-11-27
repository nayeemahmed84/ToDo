import { useEffect, useMemo, useRef, useState } from 'react';
import { ListTemplate, SavedFilter, SmartListId, TodoItem, TodoList, ViewSelection } from '../types/todo';
import { scoreTextMatch, scoreTodoItemMatch } from '../lib/search';
import { EmojiText } from '../lib/emoji';
import { BUILTIN_TEMPLATES } from './TemplatesModal';

interface CommandPaletteProps {
  lists: TodoList[];
  items: TodoItem[];
  savedFilters?: SavedFilter[];
  customTemplates?: ListTemplate[];
  onSelectView: (sel: ViewSelection) => void;
  onSelectTask: (item: TodoItem) => void;
  onQuickAddTask: (text: string) => Promise<void> | void;
  onCycleTheme: () => void;
  onOpenSettings: (sectionId?: string) => void;
  onOpenInsights: (sectionId?: string) => void;
  onOpenTemplates: (templateId?: string) => void;
  onExportIcs: () => void;
  onCreateList: (title: string) => Promise<void> | void;
  onClose: () => void;
}

interface PaletteEntry {
  id: string;
  section: 'Actions' | 'Settings' | 'Lists' | 'Templates' | 'Tasks';
  label: string;
  subtitle?: string;
  badge?: string;
  onRun: () => void;
}

const SETTINGS_ENTRIES: { id: string; label: string; subtitle: string; keywords: string }[] = [
  { id: 'confirm-delete', label: 'Confirm before deleting', subtitle: 'Settings · General', keywords: 'settings general delete prompt confirmation' },
  { id: 'add-on-top', label: 'Add new tasks on top', subtitle: 'Settings · General', keywords: 'settings general order top new task' },
  { id: 'move-starred', label: 'Move starred tasks to top', subtitle: 'Settings · General', keywords: 'settings general important star sort top' },
  { id: 'completion-sound', label: 'Play completion sound', subtitle: 'Settings · General', keywords: 'settings general audio chime mute sound' },
  { id: 'reminder-notifications', label: 'Turn on reminder notifications', subtitle: 'Settings · General', keywords: 'settings general push alerts reminders notifications' },
  { id: 'theme', label: 'Theme', subtitle: 'Settings · General · Light, Dark, iOS Glass, System', keywords: 'settings general appearance dark light glass system theme' },
  { id: 'smart-lists', label: 'Smart lists visibility', subtitle: 'Settings · Smart lists', keywords: 'settings smart lists important planned all completed assigned' },
  { id: 'auto-hide-smart', label: 'Auto-hide empty smart lists', subtitle: 'Settings · Smart lists', keywords: 'settings smart lists hide empty sidebar' },
  { id: 'due-today-my-day', label: "Show 'Due Today' tasks in My Day", subtitle: 'Settings · Smart lists', keywords: 'settings smart lists my day due today' },
  { id: 'local-backup', label: 'Local Backup', subtitle: 'Settings · Data & Backups · Export / Import .zip / .json', keywords: 'settings data backup restore export import zip json' },
  { id: 'google-drive', label: 'Google Drive Sync', subtitle: 'Settings · Data & Backups · Cloud backups & attachments', keywords: 'settings data google drive cloud sync backup restore' },
  { id: 'ics-export', label: 'One-time .ics Export', subtitle: 'Settings · Calendar & Live Feed', keywords: 'settings calendar ics ical export download' },
  { id: 'live-feed', label: 'Live Subscription (webcal)', subtitle: 'Settings · Calendar & Live Feed', keywords: 'settings calendar webcal ical live feed subscription sync' },
];

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
  savedFilters = [],
  customTemplates = [],
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

    // Settings items (compute first so generic "Open Settings" never hijacks specific setting searches like "backup")
    const matchingSettingsData = q
      ? SETTINGS_ENTRIES
          .map((s) => ({
            s,
            score: scoreTextMatch(`${s.label} ${s.subtitle} ${s.keywords}`, q),
          }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 6)
      : [];

    const actions: PaletteEntry[] = [
      {
        id: 'act-insights',
        section: 'Actions',
        label: 'Daily Review & Productivity Insights',
        subtitle: 'Streaks, 7-day chart & My Day rollover',
        onRun: () => {
          onClose();
          onOpenInsights('overview');
        },
      },
      {
        id: 'act-templates',
        section: 'Actions',
        label: 'List Templates & Checklists',
        subtitle: 'Create a list from a reusable template',
        onRun: () => {
          onClose();
          onOpenTemplates('save-bar');
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
        subtitle: 'App preferences & configuration',
        onRun: () => {
          onClose();
          onOpenSettings(matchingSettingsData[0]?.s.id ?? 'general');
        },
      },
    ];

    if (q) {
      actions.push(
        {
          id: 'act-insights-7d',
          section: 'Actions',
          label: 'Last 7 Days Completion Chart',
          subtitle: 'Insights · Weekly productivity trend',
          onRun: () => {
            onClose();
            onOpenInsights('last-7-days');
          },
        },
        {
          id: 'act-insights-rollover',
          section: 'Actions',
          label: 'Unfinished My Day & Rollover',
          subtitle: 'Insights · Roll unfinished tasks to tomorrow',
          onRun: () => {
            onClose();
            onOpenInsights('unfinished-my-day');
          },
        },
        {
          id: 'act-insights-overdue',
          section: 'Actions',
          label: 'Overdue Tasks Review',
          subtitle: 'Insights · Pull overdue tasks into My Day',
          onRun: () => {
            onClose();
            onOpenInsights('overdue');
          },
        },
        {
          id: 'act-new-list',
          section: 'Actions',
          label: `Create new list "${q}"`,
          onRun: () => {
            void onCreateList(q);
            onClose();
          },
        }
      );
    }

    const filteredActions = q
      ? actions.filter((a) => scoreTextMatch(`${a.label} ${a.subtitle ?? ''}`, q) > 0)
      : actions;
    result.push(...filteredActions);

    // Settings items (jump directly to setting, scroll & highlight)
    if (matchingSettingsData.length > 0) {
      const matchingSettings: PaletteEntry[] = matchingSettingsData.map(({ s }) => ({
        id: `setting-${s.id}`,
        section: 'Settings' as const,
        label: s.label,
        subtitle: s.subtitle,
        badge: 'Setting',
        onRun: () => {
          onClose();
          onOpenSettings(s.id);
        },
      }));
      result.push(...matchingSettings);
    }

    // Lists & Saved Filters
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
      ...savedFilters.map((f) => ({
        id: `filter-${f.id}`,
        section: 'Lists' as const,
        label: `${f.icon ? `${f.icon} ` : '🔎 '}${f.title}`,
        subtitle: 'Saved filter',
        onRun: () => {
          onSelectView({ type: 'filter', id: f.id });
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
          .map((e) => ({ e, score: scoreTextMatch(`${e.label} ${e.subtitle ?? ''}`, q) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 6)
          .map((x) => x.e)
      : listEntries.slice(0, 6);
    result.push(...filteredLists);

    // Templates
    if (q) {
      const allTemplates = [...customTemplates, ...BUILTIN_TEMPLATES];
      const matchingTemplates: PaletteEntry[] = allTemplates
        .map((tpl) => ({
          tpl,
          score: scoreTextMatch(`${tpl.title} template checklist ${tpl.tasks.map((t) => t.text).join(' ')}`, q),
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map(({ tpl }) => ({
          id: `template-${tpl.id}`,
          section: 'Templates' as const,
          label: `${tpl.icon ? `${tpl.icon} ` : ''}${tpl.title}`,
          subtitle: `Template · ${tpl.tasks.length} task${tpl.tasks.length === 1 ? '' : 's'}`,
          badge: 'Template',
          onRun: () => {
            onClose();
            onOpenTemplates(tpl.id);
          },
        }));
      result.push(...matchingTemplates);
    }

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
    savedFilters,
    customTemplates,
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
