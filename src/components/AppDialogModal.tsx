import { FormEvent, useEffect, useRef, useState } from 'react';
import { AppDialogRequest, subscribeAppDialog } from '../lib/appDialog';

export function AppDialogModal() {
  const [request, setRequest] = useState<AppDialogRequest | null>(null);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => subscribeAppDialog(setRequest), []);

  useEffect(() => {
    if (!request) return;
    if (request.kind === 'prompt') {
      setInputValue(request.defaultValue ?? '');
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    } else {
      requestAnimationFrame(() => {
        confirmBtnRef.current?.focus();
      });
    }
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (request.kind === 'confirm') request.resolve(false);
        else request.resolve(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [request]);

  if (!request) return null;

  const handleCancel = () => {
    if (request.kind === 'confirm') request.resolve(false);
    else request.resolve(null);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (request.kind === 'confirm') {
      request.resolve(true);
    } else {
      request.resolve(inputValue);
    }
  };

  return (
    <div
      className="app-dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleCancel();
      }}
    >
      <form
        className="app-dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        onSubmit={handleSubmit}
      >
        <h3 id="app-dialog-title" className="app-dialog-title">
          {request.title}
        </h3>
        {request.message && (
          <p className="app-dialog-message">{request.message}</p>
        )}
        {request.kind === 'prompt' && (
          <input
            ref={inputRef}
            type="text"
            className="app-dialog-input"
            value={inputValue}
            placeholder={request.placeholder}
            onChange={(e) => setInputValue(e.target.value)}
          />
        )}
        <div className="app-dialog-actions">
          <button
            type="button"
            className="app-dialog-btn app-dialog-btn-cancel"
            onClick={handleCancel}
          >
            {request.cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmBtnRef}
            type="submit"
            className={`app-dialog-btn ${
              request.kind === 'confirm' && request.danger
                ? 'app-dialog-btn-danger'
                : 'app-dialog-btn-primary'
            }`}
          >
            {request.confirmLabel ?? (request.kind === 'prompt' ? 'Save' : 'Confirm')}
          </button>
        </div>
      </form>
    </div>
  );
}
