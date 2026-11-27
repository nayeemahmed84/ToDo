interface WhatsNewModalProps {
  onClose: () => void;
}

export function WhatsNewModal({ onClose }: WhatsNewModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card whats-new-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="What's new in To Do"
      >
        <div className="whats-new-heading">
          <h2>What&apos;s new in To Do</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <ul>
          <li>Live collaborator presence and typing indicators on shared lists</li>
          <li>Full PWA Share Target support for links, notes, and shared files/images</li>
          <li>Kanban Board, Planned Calendar, Saved Smart Filters, and live iCal feed</li>
          <li>Google Drive attachments/backups and Google Photos background picker</li>
          <li>WYSIWYG rich notes, Focus/Pomodoro timer, and Daily Review insights</li>
        </ul>
      </div>
    </div>
  );
}
