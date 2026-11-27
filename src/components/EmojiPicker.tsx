import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface EmojiPickerProps {
  onSelect: (emoji: string | null) => void;
  onClose: () => void;
  fixedPosition?: { top: number; left: number };
}

export function EmojiPicker({ onSelect, onClose, fixedPosition }: EmojiPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;
    let cancelled = false;
    container.innerHTML = '';

    void Promise.all([import('@emoji-mart/data'), import('emoji-mart')]).then(
      ([dataMod, emojiMartMod]) => {
        if (cancelled || !mountRef.current) return;
        const PickerClass = emojiMartMod.Picker;
        const picker = new PickerClass({
          data: dataMod.default,
          set: 'native',
          theme: 'auto',
          previewPosition: 'none',
          skinTonePosition: 'search',
          onEmojiSelect: (emoji: { native?: string }) => {
            if (emoji.native) {
              onSelect(emoji.native);
              onClose();
            }
          },
        });
        mountRef.current.innerHTML = '';
        mountRef.current.appendChild(picker as unknown as Node);
      }
    );

    return () => {
      cancelled = true;
      container.innerHTML = '';
    };
  }, [onSelect, onClose]);

  const content = (
    <div
      ref={pickerRef}
      className="emoji-picker-popover"
      role="dialog"
      aria-label="Choose list icon"
      style={
        fixedPosition
          ? {
              position: 'fixed',
              top: Math.min(fixedPosition.top, window.innerHeight - 440),
              left: Math.min(fixedPosition.left, window.innerWidth - 360),
              zIndex: 1000,
              padding: 0,
              overflow: 'hidden',
              width: 'max-content',
            }
          : {
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              zIndex: 1000,
              padding: 0,
              overflow: 'hidden',
              width: 'max-content',
            }
      }
      onClick={(e) => e.stopPropagation()}
    >
      <div ref={mountRef} />
      <div style={{ padding: '6px 10px', borderTop: '1px solid var(--color-border)' }}>
        <button
          type="button"
          className="emoji-clear-btn"
          onClick={() => {
            onSelect(null);
            onClose();
          }}
        >
          Remove emoji
        </button>
      </div>
    </div>
  );

  return fixedPosition ? createPortal(content, document.body) : content;
}
