import { FormEvent, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { TodoList } from '../types/todo';

interface ShareDialogProps {
  list: TodoList;
  user: User;
  onInviteEmail: (email: string) => Promise<void>;
  onRemoveMember: (uid: string) => Promise<void>;
  onClose: () => void;
}

export function ShareDialog({
  list,
  user,
  onInviteEmail,
  onRemoveMember,
  onClose,
}: ShareDialogProps) {
  const [email, setEmail] = useState('');
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shareUrl = `${window.location.origin}/?share=${encodeURIComponent(list.id)}`;

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatusMsg(null);
    try {
      await onInviteEmail(email.trim());
      setStatusMsg(`Invitation sent to ${email.trim()}`);
      setEmail('');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Could not send invite.');
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--color-overlay)', zIndex: 100 }}
    >
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          padding: '1.5rem',
          width: '480px',
          maxWidth: '92vw',
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.45)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
        }}
      >
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', paddingBottom: '0.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, letterSpacing: '-0.01em', textAlign: 'center' }}>Share list</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close share dialog"
            style={{ position: 'absolute', right: 0, fontSize: '20px' }}
          >
            ×
          </button>
        </div>

        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>List members</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.88rem', padding: '4px 0' }}>
            <span
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'var(--color-accent)',
                color: 'var(--color-text-inverse)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
            </span>
            <span>{user.displayName || user.email} (Owner)</span>
          </div>
          {((list as TodoList & { memberIds?: string[] }).memberIds ?? []).map((mid) => (
            <div key={mid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.88rem', padding: '4px 0' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: 'var(--color-surface-hover)',
                    color: 'var(--color-text)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {mid.charAt(0).toUpperCase()}
                </span>
                {mid}
              </span>
              <button type="button" className="chip-btn" onClick={() => onRemoveMember(mid)}>
                Remove
              </button>
            </div>
          ))}
        </div>

        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>Invitation link</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              readOnly
              value={shareUrl}
              style={{ flex: 1, padding: '6px 8px', fontSize: '0.82rem', background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '4px' }}
            />
            <button
              type="button"
              className="chip-btn"
              onClick={() => {
                navigator.clipboard?.writeText(shareUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? 'Copied ✓' : 'Copy link'}
            </button>
          </div>
        </div>

        <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Invite via email</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="email"
              placeholder="Enter email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ flex: 1, padding: '6px 8px', fontSize: '0.85rem', background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '4px' }}
            />
            <button
              type="submit"
              disabled={!isValidEmail}
              style={{
                background: 'var(--color-accent)',
                color: 'var(--color-text-inverse)',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 14px',
                fontSize: '0.85rem',
                cursor: isValidEmail ? 'pointer' : 'not-allowed',
                opacity: isValidEmail ? 1 : 0.5,
              }}
            >
              Invite
            </button>
          </div>
          {email.trim().length > 0 && !isValidEmail && (
            <div style={{ fontSize: '0.78rem', color: 'var(--color-danger)' }}>Enter a valid email address</div>
          )}
          {statusMsg && <div style={{ fontSize: '0.8rem', color: 'var(--color-text-2)' }}>{statusMsg}</div>}
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-2)' }}>
            Anyone with this link and an account can join and edit this list.
          </div>
          <button
            type="button"
            className="chip-btn"
            style={{ flexShrink: 0 }}
            onClick={() => setManageOpen((v) => !v)}
          >
            Manage access
          </button>
        </div>

        {manageOpen && (
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem', fontSize: '0.85rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '6px' }}>Manage access</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>{user.displayName || user.email}</span>
              <span style={{ color: 'var(--color-text-2)' }}>Owner</span>
            </div>
            {((list as TodoList & { memberIds?: string[] }).memberIds ?? []).map((mid) => (
              <div key={mid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                <span>{mid}</span>
                <button
                  type="button"
                  className="chip-btn"
                  onClick={() => {
                    if (window.confirm(`Remove ${mid} from '${list.title}'? They will no longer see this list.`)) {
                      onRemoveMember(mid);
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
