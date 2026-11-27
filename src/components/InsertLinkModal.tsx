import { FormEvent, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface InsertLinkModalProps {
  initialUrl?: string;
  initialText?: string;
  isEditing?: boolean;
  onSubmit: (url: string, text: string) => void;
  onRemove?: () => void;
  onClose: () => void;
}

function normalizeAndValidateUrl(raw: string): { url?: string; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { error: 'Please enter a URL.' };
  }

  // Reject unsafe schemes explicitly before prepending https://
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return { error: 'Only http:// and https:// links are supported.' };
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    const hasValidHost =
      parsed.hostname === 'localhost' ||
      (parsed.hostname.includes('.') && !parsed.hostname.startsWith('.') && !parsed.hostname.endsWith('.'));
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !hasValidHost) {
      return { error: 'Please enter a valid web address (e.g. https://example.com).' };
    }
    return { url: parsed.href };
  } catch {
    return { error: 'Please enter a valid web address (e.g. https://example.com).' };
  }
}

export function InsertLinkModal({
  initialUrl = '',
  initialText = '',
  isEditing = false,
  onSubmit,
  onRemove,
  onClose,
}: InsertLinkModalProps) {
  const [url, setUrl] = useState(initialUrl);
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const urlId = useId();
  const textId = useId();
  const errorId = useId();

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const input = urlInputRef.current;
      if (input) {
        input.focus();
        input.select();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const result = normalizeAndValidateUrl(url);
    if (result.error || !result.url) {
      setError(result.error ?? 'Please enter a valid URL.');
      urlInputRef.current?.focus();
      return;
    }
    onSubmit(result.url, text.trim());
  };

  const trimmedUrl = url.trim();
  const previewUrl =
    trimmedUrl && !/^https?:\/\//i.test(trimmedUrl) && !/^[a-z][a-z0-9+.-]*:/i.test(trimmedUrl)
      ? `https://${trimmedUrl}`
      : null;

  const modalContent = (
    <div
      className="rn-link-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        className="rn-link-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="rn-link-modal-header">
          <div className="rn-link-modal-title-group">
            <span className="rn-link-modal-icon" aria-hidden="true">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </span>
            <div>
              <h3 id={titleId} className="rn-link-modal-title">
                {isEditing ? 'Edit link' : 'Insert link'}
              </h3>
              <p className="rn-link-modal-subtitle">
                Add a clickable link to your note
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rn-link-modal-close"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="rn-link-modal-body">
          <div className="rn-link-field">
            <label htmlFor={urlId} className="rn-link-label">
              URL
            </label>
            <div className={`rn-link-input-wrap ${error ? 'has-error' : ''}`}>
              <span className="rn-link-input-icon" aria-hidden="true">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </span>
              <input
                ref={urlInputRef}
                id={urlId}
                type="url"
                inputMode="url"
                className="rn-link-input"
                value={url}
                placeholder="https://example.com"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? errorId : undefined}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (error) setError(null);
                }}
              />
            </div>
            {error ? (
              <p id={errorId} className="rn-link-error" role="alert">
                {error}
              </p>
            ) : previewUrl ? (
              <p className="rn-link-hint">
                Will link to <span>{previewUrl}</span>
              </p>
            ) : null}
          </div>

          <div className="rn-link-field">
            <div className="rn-link-label-row">
              <label htmlFor={textId} className="rn-link-label">
                Display text
              </label>
              <span className="rn-link-optional">Optional</span>
            </div>
            <input
              id={textId}
              type="text"
              className="rn-link-input rn-link-input-plain"
              value={text}
              placeholder="e.g. Project brief"
              autoComplete="off"
              onChange={(e) => setText(e.target.value)}
            />
          </div>
        </div>

        <div className="rn-link-modal-footer">
          {isEditing && onRemove ? (
            <button
              type="button"
              className="rn-link-btn rn-link-btn-remove"
              onClick={onRemove}
            >
              Remove link
            </button>
          ) : (
            <span />
          )}
          <div className="rn-link-modal-actions">
            <button
              type="button"
              className="rn-link-btn rn-link-btn-cancel"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rn-link-btn rn-link-btn-primary"
              disabled={!trimmedUrl}
            >
              {isEditing ? 'Update link' : 'Insert link'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );

  return createPortal(modalContent, document.body);
}
