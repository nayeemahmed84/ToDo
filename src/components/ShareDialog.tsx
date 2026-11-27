import { FormEvent, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { TodoList } from '../types/todo';
import { appConfirm } from '../lib/appDialog';

interface UserProfile {
  displayName?: string | null;
  email?: string | null;
}

interface ShareDialogProps {
  list: TodoList;
  user: User;
  driveAttachmentCount?: number;
  onSyncDrivePermissions?: () => Promise<{ totalFiles: number; filesShared: number; collaboratorCount: number }>;
  onInviteEmail: (email: string) => Promise<void>;
  onRemoveMember: (uid: string) => Promise<void>;
  onClose: () => void;
}

export function ShareDialog({
  list,
  user,
  driveAttachmentCount = 0,
  onSyncDrivePermissions,
  onInviteEmail,
  onRemoveMember,
  onClose,
}: ShareDialogProps) {
  const [email, setEmail] = useState('');
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [driveSyncing, setDriveSyncing] = useState(false);
  const [driveSyncMsg, setDriveSyncMsg] = useState<string | null>(null);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const isOwner = list.ownerUid === user.uid;
  const members = (list.memberUids ?? []).filter((mid) => mid !== list.ownerUid);

  useEffect(() => {
    const uidsToFetch = [list.ownerUid, ...members].filter((uid) => uid && uid !== user.uid);
    if (uidsToFetch.length === 0) return;
    let cancelled = false;
    Promise.all(
      uidsToFetch.map(async (uid) => {
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          if (snap.exists()) {
            const data = snap.data();
            return [uid, { displayName: data.displayName ?? null, email: data.email ?? null }] as const;
          }
        } catch {
          // ignore profile fetch errors
        }
        return [uid, {}] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      setProfiles((prev) => {
        const next = { ...prev };
        for (const [uid, profile] of entries) next[uid] = profile;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [list.ownerUid, members.join(','), user.uid]);

  const getDisplayName = (uid: string) => {
    if (uid === user.uid) return user.displayName || user.email || uid;
    const p = profiles[uid];
    return p?.displayName || p?.email || uid;
  };

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
    if (!navigator.onLine) {
      setStatusMsg('You are offline. Reconnect to send an invitation.');
      return;
    }
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
      className="modal-backdrop share-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="modal-card share-dialog-card"
        onClick={(e) => e.stopPropagation()}
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
              {(isOwner ? (user.displayName || user.email || 'U') : getDisplayName(list.ownerUid)).charAt(0).toUpperCase()}
            </span>
            <span>{isOwner ? `${user.displayName || user.email} (Owner)` : `${getDisplayName(list.ownerUid)} (Owner)`}</span>
          </div>
          {members.map((mid) => {
            const name = getDisplayName(mid);
            return (
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
                  {name.charAt(0).toUpperCase()}
                </span>
                {mid === user.uid ? `${name} (You)` : name}
              </span>
              {(isOwner || mid === user.uid) && (
                <button type="button" className="chip-btn" onClick={() => onRemoveMember(mid)}>
                  {mid === user.uid ? 'Leave' : 'Remove'}
                </button>
              )}
            </div>
            );
          })}
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

        {isOwner && (
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
        )}

        {driveAttachmentCount > 0 && onSyncDrivePermissions && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ fontSize: '0.82rem' }}>
                <strong>Google Drive attachments ({driveAttachmentCount})</strong>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-2)' }}>
                  Silently grant read access to all list members (no email notifications).
                </div>
              </div>
              <button
                type="button"
                className="chip-btn"
                disabled={driveSyncing}
                style={{ flexShrink: 0 }}
                onClick={async () => {
                  setDriveSyncing(true);
                  setDriveSyncMsg(null);
                  try {
                    const res = await onSyncDrivePermissions();
                    if (res.collaboratorCount === 0) {
                      setDriveSyncMsg('No other members on this list yet.');
                    } else {
                      setDriveSyncMsg(
                        `Synced silent Drive access for ${res.filesShared}/${res.totalFiles} file(s) with ${res.collaboratorCount} member(s).`
                      );
                    }
                  } catch (err) {
                    setDriveSyncMsg(err instanceof Error ? err.message : 'Failed to sync Drive permissions.');
                  } finally {
                    setDriveSyncing(false);
                  }
                }}
              >
                {driveSyncing ? 'Syncing…' : 'Sync Drive access'}
              </button>
            </div>
            {driveSyncMsg && (
              <div style={{ fontSize: '0.76rem', color: 'var(--color-text-2)' }}>{driveSyncMsg}</div>
            )}
          </div>
        )}

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
              <span>{getDisplayName(list.ownerUid)}</span>
              <span style={{ color: 'var(--color-text-2)' }}>Owner</span>
            </div>
            {members.map((mid) => {
              const name = getDisplayName(mid);
              return (
              <div key={mid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                <span>{mid === user.uid ? `${name} (You)` : name}</span>
                {(isOwner || mid === user.uid) && (
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={async () => {
                      const ok = await appConfirm({
                        title: mid === user.uid ? 'Leave shared list' : 'Remove member',
                        message: `Remove ${name} from '${list.title}'? They will no longer see this list.`,
                        confirmLabel: mid === user.uid ? 'Leave' : 'Remove',
                        danger: true,
                      });
                      if (ok) {
                        onRemoveMember(mid);
                      }
                    }}
                  >
                    {mid === user.uid ? 'Leave' : 'Remove'}
                  </button>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
