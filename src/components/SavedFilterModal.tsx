import { useEffect, useState } from 'react';
import type { SavedFilter, SavedFilterDueBucket, TaskPriority } from '../types/todo';
import { BUILTIN_FILTER_PRESETS, summarizeSavedFilter } from '../lib/savedFilters';
import { AppSelect } from './AppSelect';

interface SavedFilterModalProps {
  existingFilter?: SavedFilter | null;
  availableTags: string[];
  onSave: (filter: SavedFilter) => void;
  onDelete?: (filterId: string) => void;
  onClose: () => void;
}

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'p1', label: 'P1 · Urgent' },
  { value: 'p2', label: 'P2 · High' },
  { value: 'p3', label: 'P3 · Medium' },
  { value: 'p4', label: 'P4 · Low' },
];

export function SavedFilterModal({
  existingFilter,
  availableTags,
  onSave,
  onDelete,
  onClose,
}: SavedFilterModalProps) {
  const [title, setTitle] = useState(existingFilter?.title ?? '');
  const [icon, setIcon] = useState(existingFilter?.icon ?? '🔎');
  const [query, setQuery] = useState(existingFilter?.query ?? '');
  const [tagsText, setTagsText] = useState((existingFilter?.tags ?? []).join(', '));
  const [priorities, setPriorities] = useState<TaskPriority[]>(existingFilter?.priorities ?? []);
  const [maxEstimate, setMaxEstimate] = useState<string>(
    existingFilter?.maxEstimateMinutes ? String(existingFilter.maxEstimateMinutes) : ''
  );
  const [dueBucket, setDueBucket] = useState<SavedFilterDueBucket>(existingFilter?.dueBucket ?? 'any');
  const [onlyBlocked, setOnlyBlocked] = useState(Boolean(existingFilter?.onlyBlocked));
  const [onlyImportant, setOnlyImportant] = useState(Boolean(existingFilter?.onlyImportant));
  const [onlyMyDay, setOnlyMyDay] = useState(Boolean(existingFilter?.onlyMyDay));
  const [includeCompleted, setIncludeCompleted] = useState(Boolean(existingFilter?.includeCompleted));

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const parsedTags = tagsText
    .split(/[,\s]+/)
    .map((t) => t.replace(/^#/, '').trim().toLowerCase())
    .filter(Boolean);

  const togglePriority = (p: TaskPriority) => {
    setPriorities((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  const toggleTagChip = (tag: string) => {
    const lower = tag.toLowerCase();
    const next = parsedTags.includes(lower)
      ? parsedTags.filter((t) => t !== lower)
      : [...parsedTags, lower];
    setTagsText(next.join(', '));
  };

  const draftFilter: SavedFilter = {
    id: existingFilter?.id ?? `flt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: title.trim() || 'Smart Filter',
    icon: icon.trim() || '🔎',
    query: query.trim() || undefined,
    tags: parsedTags.length > 0 ? parsedTags : undefined,
    priorities: priorities.length > 0 ? priorities : undefined,
    maxEstimateMinutes: maxEstimate ? Number(maxEstimate) : null,
    dueBucket,
    onlyBlocked,
    onlyImportant,
    onlyMyDay,
    includeCompleted,
    createdAtMs: existingFilter?.createdAtMs ?? Date.now(),
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave(draftFilter);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="saved-filter-modal"
        role="dialog"
        aria-modal="true"
        aria-label={existingFilter ? 'Edit saved filter' : 'Create saved filter'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="saved-filter-modal-header">
          <div>
            <h2>{existingFilter ? 'Edit Smart Filter' : 'New Smart Filter'}</h2>
            <p className="saved-filter-preview">{summarizeSavedFilter(draftFilter)}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {!existingFilter && (
          <div className="saved-filter-presets">
            <span className="saved-filter-section-label">Quick presets</span>
            <div className="saved-filter-preset-row">
              {BUILTIN_FILTER_PRESETS.map((preset) => (
                <button
                  key={preset.title}
                  type="button"
                  className="saved-filter-preset-chip"
                  onClick={() => {
                    setTitle(preset.title);
                    setIcon(preset.icon ?? '🔎');
                    setPriorities(preset.priorities ?? []);
                    setMaxEstimate(preset.maxEstimateMinutes ? String(preset.maxEstimateMinutes) : '');
                    setDueBucket(preset.dueBucket ?? 'any');
                    setOnlyBlocked(Boolean(preset.onlyBlocked));
                    setOnlyImportant(Boolean(preset.onlyImportant));
                    setOnlyMyDay(Boolean(preset.onlyMyDay));
                  }}
                >
                  <span>{preset.icon}</span>
                  <span>{preset.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="saved-filter-form">
          <div className="saved-filter-name-row">
            <input
              type="text"
              className="saved-filter-icon-input"
              value={icon}
              onChange={(e) => setIcon(e.target.value.slice(0, 4))}
              aria-label="Filter emoji"
              placeholder="🔎"
            />
            <input
              type="text"
              className="saved-filter-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Filter name (e.g. Deep Work P1)"
              autoFocus
              required
            />
          </div>

          <div className="saved-filter-field">
            <label>Priorities</label>
            <div className="saved-filter-chip-group">
              {PRIORITIES.map((p) => {
                const active = priorities.includes(p.value);
                return (
                  <button
                    key={p.value}
                    type="button"
                    className={`saved-filter-toggle-chip prio-${p.value} ${active ? 'active' : ''}`}
                    onClick={() => togglePriority(p.value)}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="saved-filter-grid-2">
            <div className="saved-filter-field">
              <label>Due window</label>
              <AppSelect
                value={dueBucket}
                onChange={(v) => setDueBucket(v as SavedFilterDueBucket)}
                ariaLabel="Due window"
                options={[
                  { value: 'any', label: 'Any due date' },
                  { value: 'overdue', label: 'Overdue' },
                  { value: 'today', label: 'Due today' },
                  { value: 'week', label: 'Next 7 days' },
                  { value: 'no-date', label: 'No due date' },
                ]}
              />
            </div>

            <div className="saved-filter-field">
              <label>Max effort</label>
              <AppSelect
                value={maxEstimate}
                onChange={setMaxEstimate}
                ariaLabel="Maximum effort"
                options={[
                  { value: '', label: 'Any effort' },
                  { value: '15', label: '≤ 15 min' },
                  { value: '30', label: '≤ 30 min' },
                  { value: '60', label: '≤ 1 hour' },
                  { value: '120', label: '≤ 2 hours' },
                ]}
              />
            </div>
          </div>

          <div className="saved-filter-field">
            <label>Tags (comma-separated, matches all)</label>
            <input
              type="text"
              className="saved-filter-text-input"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="work, urgent"
            />
            {availableTags.length > 0 && (
              <div className="saved-filter-chip-group" style={{ marginTop: '6px' }}>
                {availableTags.slice(0, 12).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={`saved-filter-toggle-chip ${parsedTags.includes(tag.toLowerCase()) ? 'active' : ''}`}
                    onClick={() => toggleTagChip(tag)}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="saved-filter-field">
            <label>Keyword contains</label>
            <input
              type="text"
              className="saved-filter-text-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Optional search text in title, notes, or steps"
            />
          </div>

          <div className="saved-filter-flags">
            <label className="saved-filter-checkbox">
              <input type="checkbox" checked={onlyImportant} onChange={(e) => setOnlyImportant(e.target.checked)} />
              <span>Important only</span>
            </label>
            <label className="saved-filter-checkbox">
              <input type="checkbox" checked={onlyMyDay} onChange={(e) => setOnlyMyDay(e.target.checked)} />
              <span>In My Day</span>
            </label>
            <label className="saved-filter-checkbox">
              <input type="checkbox" checked={onlyBlocked} onChange={(e) => setOnlyBlocked(e.target.checked)} />
              <span>Blocked / Waiting</span>
            </label>
            <label className="saved-filter-checkbox">
              <input type="checkbox" checked={includeCompleted} onChange={(e) => setIncludeCompleted(e.target.checked)} />
              <span>Include completed</span>
            </label>
          </div>

          <div className="saved-filter-actions">
            {existingFilter && onDelete && (
              <button
                type="button"
                className="saved-filter-delete-btn"
                onClick={() => {
                  onDelete(existingFilter.id);
                  onClose();
                }}
              >
                Delete
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button type="button" className="chip-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="chip-btn"
              disabled={!title.trim()}
              style={{ background: 'var(--color-accent)', color: 'var(--color-text-inverse)' }}
            >
              {existingFilter ? 'Save changes' : 'Create filter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
