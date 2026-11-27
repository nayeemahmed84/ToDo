import { formatTypingLabel, getPeerInitials, ListPresencePeer } from '../lib/presence';

interface ListPresenceBarProps {
  activePeers: ListPresencePeer[];
  typingPeers: ListPresencePeer[];
}

export function ListPresenceBar({ activePeers, typingPeers }: ListPresenceBarProps) {
  if (activePeers.length === 0 && typingPeers.length === 0) {
    return null;
  }

  const visiblePeers = activePeers.slice(0, 4);
  const overflowCount = Math.max(0, activePeers.length - visiblePeers.length);
  const typingLabel = formatTypingLabel(typingPeers);
  const namesSummary = activePeers.map((p) => p.displayName).join(', ');

  return (
    <div className="list-presence-bar" aria-live="polite">
      {activePeers.length > 0 && (
        <div
          className="presence-avatar-stack"
          title={`Viewing now: ${namesSummary}`}
          aria-label={`${activePeers.length} collaborator${activePeers.length === 1 ? '' : 's'} viewing this list: ${namesSummary}`}
        >
          {visiblePeers.map((peer) => (
            <span key={peer.uid} className="presence-avatar" title={peer.displayName}>
              {peer.photoURL ? (
                <img src={peer.photoURL} alt={peer.displayName} referrerPolicy="no-referrer" />
              ) : (
                <span className="presence-avatar-initials">{getPeerInitials(peer.displayName)}</span>
              )}
              <span className="presence-online-dot" aria-hidden="true" />
            </span>
          ))}
          {overflowCount > 0 && (
            <span className="presence-avatar presence-avatar-overflow">+{overflowCount}</span>
          )}
        </div>
      )}

      {typingLabel && (
        <div className="presence-typing-pill" role="status">
          <span className="presence-typing-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>{typingLabel}</span>
        </div>
      )}
    </div>
  );
}
