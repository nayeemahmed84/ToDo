interface ShortcutsModalProps {
  onClose: () => void;
}

export function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card shortcuts-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div className="shortcuts-header">
          <h2>Keyboard shortcuts</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="shortcuts-grid">
          <div className="shortcuts-section">
            <h3>General &amp; Navigation</h3>
            <div className="shortcuts-row"><span>New task</span><span className="shortcuts-keys"><kbd>Ctrl+N</kbd><kbd>N</kbd></span></div>
            <div className="shortcuts-row"><span>Search tasks</span><span className="shortcuts-keys"><kbd>Ctrl+F</kbd><kbd>/</kbd></span></div>
            <div className="shortcuts-row"><span>New list</span><span className="shortcuts-keys"><kbd>Ctrl+Shift+L</kbd><kbd>L</kbd></span></div>
            <div className="shortcuts-row"><span>Toggle sidebar</span><span className="shortcuts-keys"><kbd>Ctrl+B</kbd><kbd>Ctrl+1</kbd></span></div>
            <div className="shortcuts-row"><span>Switch smart lists</span><span className="shortcuts-keys"><kbd>1</kbd>–<kbd>8</kbd></span></div>
            <div className="shortcuts-row"><span>Previous / Next list</span><span className="shortcuts-keys"><kbd>[</kbd><kbd>]</kbd></span></div>
            <div className="shortcuts-row"><span>Toggle List / Grid view</span><kbd>V</kbd></div>
            <div className="shortcuts-row"><span>Toggle Completed section</span><span className="shortcuts-keys"><kbd>Ctrl+Shift+C</kbd><kbd>C</kbd></span></div>
            <div className="shortcuts-row"><span>Toggle Dark / Light theme</span><kbd>Ctrl+Shift+D</kbd></div>
            <div className="shortcuts-row"><span>Open Settings</span><kbd>Ctrl+,</kbd></div>
            <div className="shortcuts-row"><span>Shortcuts help</span><span className="shortcuts-keys"><kbd>?</kbd><kbd>Ctrl+/</kbd></span></div>
            <div className="shortcuts-row"><span>Close / Clear selection</span><kbd>Esc</kbd></div>
          </div>
          <div className="shortcuts-section">
            <h3>Task List &amp; Actions</h3>
            <div className="shortcuts-row"><span>Next / Previous task</span><span className="shortcuts-keys"><kbd>↓</kbd><kbd>↑</kbd> / <kbd>J</kbd><kbd>K</kbd></span></div>
            <div className="shortcuts-row"><span>Multi-select range</span><span className="shortcuts-keys"><kbd>Shift+↓</kbd><kbd>Shift+↑</kbd></span></div>
            <div className="shortcuts-row"><span>Select all active tasks</span><kbd>Ctrl+A</kbd></div>
            <div className="shortcuts-row"><span>Mark / Unmark complete</span><span className="shortcuts-keys"><kbd>Ctrl+M</kbd><kbd>Ctrl+U</kbd></span></div>
            <div className="shortcuts-row"><span>Toggle complete</span><span className="shortcuts-keys"><kbd>Space</kbd><kbd>X</kbd></span></div>
            <div className="shortcuts-row"><span>Move / Copy to list menu</span><span className="shortcuts-keys"><kbd>M</kbd><kbd>C</kbd></span></div>
            <div className="shortcuts-row"><span>Copy / Cut / Paste tasks</span><span className="shortcuts-keys"><kbd>Ctrl+C</kbd><kbd>Ctrl+X</kbd><kbd>Ctrl+V</kbd></span></div>
            <div className="shortcuts-row"><span>Toggle My Day</span><span className="shortcuts-keys"><kbd>Ctrl+T</kbd><kbd>T</kbd></span></div>
            <div className="shortcuts-row"><span>Toggle Important</span><span className="shortcuts-keys"><kbd>S</kbd><kbd>I</kbd></span></div>
            <div className="shortcuts-row"><span>Due Today / Tomorrow</span><span className="shortcuts-keys"><kbd>D</kbd><kbd>Shift+D</kbd></span></div>
            <div className="shortcuts-row"><span>Reorder task up / down</span><span className="shortcuts-keys"><kbd>Alt+↑</kbd><kbd>Alt+↓</kbd></span></div>
            <div className="shortcuts-row"><span>Delete selected task(s)</span><span className="shortcuts-keys"><kbd>Del</kbd><kbd>Backspace</kbd></span></div>
            <div className="shortcuts-row"><span>Undo (multi-step)</span><kbd>Ctrl+Z</kbd></div>
            <h3 style={{ marginTop: '0.75rem' }}>Task Detail Pane</h3>
            <div className="shortcuts-row"><span>Open / Focus title</span><span className="shortcuts-keys"><kbd>Enter</kbd><kbd>O</kbd><kbd>E</kbd></span></div>
            <div className="shortcuts-row"><span>Add a step</span><kbd>A</kbd></div>
            <div className="shortcuts-row"><span>Focus notes</span><kbd>Shift+M</kbd></div>
          </div>
        </div>
      </div>
    </div>
  );
}
