import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface AppSelectOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
}

interface AppSelectProps {
  value: string;
  options: AppSelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
  onChange: (value: string) => void;
}

export function AppSelect({
  value,
  options,
  placeholder = 'Select…',
  ariaLabel,
  searchable,
  disabled = false,
  className = '',
  onChange,
}: AppSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const [openUpward, setOpenUpward] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const showSearch = searchable ?? options.length > 7;
  const selectedOption = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.description && o.description.toLowerCase().includes(q))
    );
  }, [options, query]);

  const computePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const padding = 10;
    const estHeight = Math.min(300, filtered.length * 38 + (showSearch ? 48 : 16));
    const spaceBelow = window.innerHeight - rect.bottom - padding;
    const spaceAbove = rect.top - padding;
    const flipUp = spaceBelow < Math.min(estHeight, 180) && spaceAbove > spaceBelow;
    setOpenUpward(flipUp);

    const width = Math.min(
      Math.max(rect.width, 190),
      window.innerWidth - padding * 2
    );
    const left = Math.min(
      Math.max(padding, rect.left),
      window.innerWidth - width - padding
    );

    if (flipUp) {
      setMenuStyle({
        position: 'fixed',
        left,
        bottom: window.innerHeight - rect.top + 6,
        width,
        maxHeight: Math.min(300, Math.max(120, spaceAbove - 6)),
      });
    } else {
      setMenuStyle({
        position: 'fixed',
        left,
        top: rect.bottom + 6,
        width,
        maxHeight: Math.min(300, Math.max(120, spaceBelow - 6)),
      });
    }
  };

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    computePosition();
    const selectedIdx = filtered.findIndex((o) => o.value === value);
    setActiveIdx(selectedIdx >= 0 ? selectedIdx : 0);
    if (showSearch) {
      window.setTimeout(() => searchRef.current?.focus(), 20);
    }

    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (
        target &&
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onResizeOrScroll = () => computePosition();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onResizeOrScroll);
    window.addEventListener('scroll', onResizeOrScroll, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', onResizeOrScroll);
      window.removeEventListener('scroll', onResizeOrScroll, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, showSearch]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter' && filtered[activeIdx]) {
      e.preventDefault();
      onChange(filtered[activeIdx].value);
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        className={`app-select-trigger ${open ? 'open' : ''} ${!selectedOption ? 'is-placeholder' : ''} ${className}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleKeyDown}
      >
        <span className="app-select-value">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg
          className="app-select-chevron"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className={`app-select-menu ${openUpward ? 'open-up' : 'open-down'}`}
            style={menuStyle}
            role="listbox"
            aria-label={ariaLabel || placeholder}
            onKeyDown={handleKeyDown}
          >
            {showSearch && (
              <div className="app-select-search-wrap">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  className="app-select-search"
                  placeholder="Filter…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            )}
            <div className="app-select-options">
              {filtered.length === 0 ? (
                <div className="app-select-empty">No matching options</div>
              ) : (
                filtered.map((opt, idx) => {
                  const isSelected = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`app-select-option ${isSelected ? 'selected' : ''} ${idx === activeIdx ? 'focused' : ''}`}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                        triggerRef.current?.focus();
                      }}
                    >
                      <span className="app-select-option-text">
                        <span className="app-select-option-label">{opt.label}</span>
                        {opt.description && (
                          <span className="app-select-option-desc">{opt.description}</span>
                        )}
                      </span>
                      {opt.badge && <span className="app-select-option-badge">{opt.badge}</span>}
                      {isSelected && (
                        <svg className="app-select-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
