import { useCallback, useEffect, useRef, useState } from 'react';
import { editorElementToMarkdown, markdownToEditorHtml } from '../lib/richNotes';

interface RichNotesEditorProps {
  value: string;
  itemId: string;
  onChange: (markdown: string) => void;
  onCommit: (markdown: string) => void;
}

const NOTES_HEIGHT_KEY = 'todo.notesEditorHeight';
const MIN_NOTES_HEIGHT = 120;
const MAX_NOTES_HEIGHT = 640;
const DEFAULT_NOTES_HEIGHT = 170;

export function RichNotesEditor({
  value,
  itemId,
  onChange,
  onCommit,
}: RichNotesEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastSyncedRef = useRef<string>(value);
  const [editorHeight, setEditorHeight] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(NOTES_HEIGHT_KEY));
      if (Number.isFinite(saved) && saved >= MIN_NOTES_HEIGHT && saved <= MAX_NOTES_HEIGHT) {
        return saved;
      }
    } catch {
      // Ignore storage errors
    }
    return DEFAULT_NOTES_HEIGHT;
  });
  const [resizing, setResizing] = useState(false);
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    strike: false,
    ul: false,
    code: false,
  });
  const [isEmpty, setIsEmpty] = useState(() => !value.trim());

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture is unsupported
    }
    const startY = e.clientY;
    const startHeight = editorHeight;
    let latestHeight = startHeight;
    setResizing(true);

    const onMove = (ev: PointerEvent) => {
      const next = Math.max(
        MIN_NOTES_HEIGHT,
        Math.min(MAX_NOTES_HEIGHT, Math.round(startHeight + (ev.clientY - startY)))
      );
      latestHeight = next;
      setEditorHeight(next);
    };

    const onUp = () => {
      setResizing(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      try {
        localStorage.setItem(NOTES_HEIGHT_KEY, String(latestHeight));
      } catch {
        // Ignore storage errors
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // Sync HTML into contentEditable when switching tasks or when value changes externally
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (document.activeElement === el && value === lastSyncedRef.current) return;
    el.innerHTML = markdownToEditorHtml(value);
    lastSyncedRef.current = value;
    setIsEmpty(!value.trim());
  }, [itemId, value]);

  const refreshActiveFormats = useCallback(() => {
    try {
      const sel = window.getSelection();
      let inCode = false;
      if (sel && sel.anchorNode) {
        const anchorEl =
          sel.anchorNode.nodeType === Node.ELEMENT_NODE
            ? (sel.anchorNode as HTMLElement)
            : sel.anchorNode.parentElement;
        inCode = Boolean(anchorEl?.closest('code'));
      }
      setActiveFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        strike: document.queryCommandState('strikeThrough'),
        ul: document.queryCommandState('insertUnorderedList'),
        code: inCode,
      });
    } catch {
      // Ignore queryCommandState errors on unsupported browsers
    }
  }, []);

  const syncFromDom = useCallback(
    (commit = false) => {
      const el = editorRef.current;
      if (!el) return;
      const md = editorElementToMarkdown(el);
      lastSyncedRef.current = md;
      setIsEmpty(!md.trim());
      onChange(md);
      if (commit) onCommit(md);
    },
    [onChange, onCommit]
  );

  const runExecCommand = (cmd: string, arg?: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand(cmd, false, arg);
    syncFromDom(false);
    refreshActiveFormats();
  };

  const toggleInlineCode = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const anchorEl =
      sel.anchorNode?.nodeType === Node.ELEMENT_NODE
        ? (sel.anchorNode as HTMLElement)
        : sel.anchorNode?.parentElement;
    const existingCode = anchorEl?.closest('code');
    if (existingCode && el.contains(existingCode)) {
      const textNode = document.createTextNode(existingCode.textContent ?? '');
      existingCode.replaceWith(textNode);
      const nextRange = document.createRange();
      nextRange.selectNodeContents(textNode);
      nextRange.collapse(false);
      sel.removeAllRanges();
      sel.addRange(nextRange);
    } else if (!range.collapsed) {
      const codeEl = document.createElement('code');
      codeEl.textContent = range.toString();
      range.deleteContents();
      range.insertNode(codeEl);
      range.setStartAfter(codeEl);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      const codeEl = document.createElement('code');
      codeEl.textContent = 'code';
      range.insertNode(codeEl);
      const nextRange = document.createRange();
      nextRange.selectNodeContents(codeEl);
      sel.removeAllRanges();
      sel.addRange(nextRange);
    }
    syncFromDom(false);
    refreshActiveFormats();
  };

  const insertChecklistItem = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();

    const row = document.createElement('div');
    row.className = 'rn-check-item';
    row.dataset.rnCheck = 'true';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'rn-checkbox';
    cb.setAttribute('contenteditable', 'false');

    const span = document.createElement('span');
    span.className = 'rn-check-text';
    span.appendChild(document.createElement('br'));

    row.appendChild(cb);
    row.appendChild(span);

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
      const anchorEl =
        sel.anchorNode?.nodeType === Node.ELEMENT_NODE
          ? (sel.anchorNode as HTMLElement)
          : sel.anchorNode?.parentElement;
      const currentBlock = anchorEl?.closest('div, p, li');
      if (currentBlock && currentBlock !== el && el.contains(currentBlock)) {
        currentBlock.after(row);
      } else {
        el.appendChild(row);
      }
    } else {
      el.appendChild(row);
    }

    // Place caret inside the new checklist text span
    const nextRange = document.createRange();
    nextRange.selectNodeContents(span);
    nextRange.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(nextRange);

    syncFromDom(false);
  };

  const insertLink = () => {
    const el = editorRef.current;
    if (!el) return;
    const url = window.prompt('Enter URL (https://…)', 'https://');
    if (!url || !url.trim()) return;
    const trimmed = url.trim();
    const safeUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    el.focus();
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      document.execCommand('createLink', false, safeUrl);
    } else {
      document.execCommand(
        'insertHTML',
        false,
        `<a href="${safeUrl.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">${safeUrl.replace(/</g, '&lt;')}</a>&nbsp;`
      );
    }
    syncFromDom(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = editorRef.current;
    if (!el) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      const sel = window.getSelection();
      const anchorEl =
        sel?.anchorNode?.nodeType === Node.ELEMENT_NODE
          ? (sel.anchorNode as HTMLElement)
          : sel?.anchorNode?.parentElement;
      const checkRow = anchorEl?.closest('.rn-check-item');
      if (checkRow && el.contains(checkRow)) {
        e.preventDefault();
        const textSpan = checkRow.querySelector<HTMLElement>('.rn-check-text');
        const currentText = (textSpan?.textContent ?? '').trim();
        if (!currentText) {
          // Pressing Enter on an empty checklist item exits the checklist into a normal line
          const div = document.createElement('div');
          div.appendChild(document.createElement('br'));
          checkRow.replaceWith(div);
          const nextRange = document.createRange();
          nextRange.selectNodeContents(div);
          nextRange.collapse(true);
          sel?.removeAllRanges();
          sel?.addRange(nextRange);
        } else {
          // Create next checklist item below
          const nextRow = document.createElement('div');
          nextRow.className = 'rn-check-item';
          nextRow.dataset.rnCheck = 'true';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.className = 'rn-checkbox';
          cb.setAttribute('contenteditable', 'false');
          const span = document.createElement('span');
          span.className = 'rn-check-text';
          span.appendChild(document.createElement('br'));
          nextRow.appendChild(cb);
          nextRow.appendChild(span);
          checkRow.after(nextRow);
          const nextRange = document.createRange();
          nextRange.selectNodeContents(span);
          nextRange.collapse(true);
          sel?.removeAllRanges();
          sel?.addRange(nextRange);
        }
        syncFromDom(false);
      }
    }
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Clicking a link opens it in a new tab
    const link = target.closest('a');
    if (link && link.href) {
      e.preventDefault();
      window.open(link.href, '_blank', 'noopener,noreferrer');
      return;
    }

    // Clicking a checklist checkbox toggles its checked state and commits immediately
    if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
      const cb = target as HTMLInputElement;
      const row = cb.closest('.rn-check-item');
      if (row) {
        row.classList.toggle('is-checked', cb.checked);
      }
      syncFromDom(true);
    }
  };

  return (
    <div className="rich-notes-wrap">
      <div className="detail-card-row-head">
        <span className="detail-section-title">Notes</span>
        <div className="rn-toolbar" role="toolbar" aria-label="Note formatting">
          <button
            type="button"
            className={`rn-tool-btn ${activeFormats.bold ? 'active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runExecCommand('bold')}
            title="Bold (Ctrl+B)"
            aria-label="Bold"
            aria-pressed={activeFormats.bold}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className={`rn-tool-btn ${activeFormats.italic ? 'active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runExecCommand('italic')}
            title="Italic (Ctrl+I)"
            aria-label="Italic"
            aria-pressed={activeFormats.italic}
          >
            <em>I</em>
          </button>
          <button
            type="button"
            className={`rn-tool-btn ${activeFormats.strike ? 'active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runExecCommand('strikeThrough')}
            title="Strikethrough"
            aria-label="Strikethrough"
            aria-pressed={activeFormats.strike}
          >
            <s>S</s>
          </button>
          <button
            type="button"
            className={`rn-tool-btn ${activeFormats.code ? 'active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggleInlineCode}
            title="Inline code"
            aria-label="Inline code"
            aria-pressed={activeFormats.code}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </button>
          <span className="rn-tool-divider" aria-hidden="true" />
          <button
            type="button"
            className={`rn-tool-btn ${activeFormats.ul ? 'active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runExecCommand('insertUnorderedList')}
            title="Bullet list"
            aria-label="Bullet list"
            aria-pressed={activeFormats.ul}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="9" y1="6" x2="20" y2="6" />
              <line x1="9" y1="12" x2="20" y2="12" />
              <line x1="9" y1="18" x2="20" y2="18" />
              <circle cx="4.5" cy="6" r="1" fill="currentColor" />
              <circle cx="4.5" cy="12" r="1" fill="currentColor" />
              <circle cx="4.5" cy="18" r="1" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            className="rn-tool-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={insertChecklistItem}
            title="Add checklist item"
            aria-label="Add checklist item"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="6" height="6" rx="1" />
              <path d="m4.5 8 1 1 2-2" />
              <line x1="13" y1="8" x2="21" y2="8" />
              <rect x="3" y="14" width="6" height="6" rx="1" />
              <line x1="13" y1="17" x2="21" y2="17" />
            </svg>
          </button>
          <button
            type="button"
            className="rn-tool-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={insertLink}
            title="Insert link"
            aria-label="Insert link"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </button>
        </div>
      </div>

      <div
        ref={editorRef}
        className={`rn-editor ${isEmpty ? 'is-empty' : ''}`}
        style={{ height: `${editorHeight}px` }}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Task notes"
        data-placeholder="Add note…"
        onInput={() => {
          syncFromDom(false);
          refreshActiveFormats();
        }}
        onKeyUp={refreshActiveFormats}
        onMouseUp={refreshActiveFormats}
        onKeyDown={handleKeyDown}
        onClick={handleEditorClick}
        onBlur={() => syncFromDom(true)}
      />

      <div
        className={`rn-resize-footer ${resizing ? 'resizing' : ''}`}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Drag to resize notes height"
        title="Drag down to resize notes (double-click to reset)"
        onPointerDown={handleResizePointerDown}
        onDoubleClick={() => {
          setEditorHeight(DEFAULT_NOTES_HEIGHT);
          try { localStorage.setItem(NOTES_HEIGHT_KEY, String(DEFAULT_NOTES_HEIGHT)); } catch { /* ignore */ }
        }}
      >
        <span className="rn-resize-grip" aria-hidden="true" />
        <span className="rn-resize-corner" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="11" y1="3" x2="3" y2="11" />
            <line x1="11" y1="7" x2="7" y2="11" />
          </svg>
        </span>
      </div>
    </div>
  );
}
