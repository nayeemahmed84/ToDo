import { FormEvent, useState } from 'react';
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
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          padding: '1.25rem',
          width: '420px',
          maxWidth: '92vw',
          background: 'var(--surface)',
          color: 'var(--text)',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-menu)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Share list</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close share dialog">
            ×
          </button>
        </div>

        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>List members</div>
          <div style={{ fontSize: '0.88rem', padding: '4px 0' }}>
            {user.displayName || user.email} (Owner)
          </div>
          {((list as TodoList & { memberIds?: string[] }).memberIds ?? []).map((mid) => (
            <div key={mid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.88rem', padding: '4px 0' }}>
              <span>{mid}</span>
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
              style={{ flex: 1, padding: '6px 8px', fontSize: '0.82rem', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px' }}
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
              {copied ? 'Copied' : 'Copy link'}
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
              style={{ flex: 1, padding: '6px 8px', fontSize: '0.85rem', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px' }}
            />
            <button
              type="submit"
              disabled={!email.trim()}
              style={{
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 14px',
                fontSize: '0.85rem',
                cursor: email.trim() ? 'pointer' : 'not-allowed',
                opacity: email.trim() ? 1 : 0.5,
              }}
            >
              Invite
            </button>
          </div>
          {statusMsg && <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{statusMsg}</div>}
        </form>

        <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>
          Anyone with this link and an account can join and edit this list.
        </div>
      </div>
    </div>
  );
}
