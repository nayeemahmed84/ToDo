import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const LIST_EMOJIS = [
  '📋', '📝', '✅', '⭐', '🌟', '📌', '📍', '💡', '🎯', '📚', '📖', '🧠',
  '💼', '💰', '🛒', '🧾', '🍎', '🍌', '🥑', '🥕', '🥦', '🍞', '🧀', '🥛',
  '☕', '🍵', '🍽️', '🎂', '🏠', '🏡', '🛋️', '🛏️', '🧹', '🧺', '🪴', '🌱',
  '🌻', '🐶', '🐱', '🐰', '❤️', '💖', '🎮', '🎨', '🎵', '🎧', '🎬', '📷',
  '💻', '📱', '⌚', '🔧', '🛠️', '🔨', '🚗', '🚲', '✈️', '🏖️', '🏋️', '⚽',
  '🎁', '🧳', '📅', '🔔', '🚀', '🌈', '🔥', '💧', '🔑', '📦', '📧', '✉️',
  '🏢', '🏫', '🌍', '☀️', '🌙', '🎉', '🧘', '💊', '🩺', '🪙', '🧼', '🦋',
  '🍀', '🌸', '⛺', '🚆', '🛍️', '💬', '🗂️', '💵', '🧪', '🧵', '🧸', '🐟',
];

interface EmojiPickerProps {
  onSelect: (emoji: string | null) => void;
  onClose: () => void;
  fixedPosition?: { top: number; left: number };
}

export function EmojiPicker({ onSelect, onClose, fixedPosition }: EmojiPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const handleScroll = (event: Event) => {
      if (event.target instanceof Node && pickerRef.current?.contains(event.target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  const picker = (
    <div
      ref={pickerRef}
      className="emoji-picker"
      role="dialog"
      aria-label="Choose an icon emoji"
      style={fixedPosition ? {
        position: 'fixed',
        top: fixedPosition.top,
        left: fixedPosition.left,
        zIndex: 1100,
      } : undefined}
    >
      <div className="emoji-picker-header">
        <strong>Choose an emoji</strong>
        <button type="button" className="emoji-picker-close" onClick={onClose} aria-label="Close emoji picker">
          ×
        </button>
      </div>
      <div className="emoji-picker-grid" role="group" aria-label="Available emojis">
        {LIST_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="emoji-picker-option"
            onClick={() => onSelect(emoji)}
            aria-label={`Use ${emoji}`}
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
      <button type="button" className="emoji-picker-reset" onClick={() => onSelect(null)}>
        Use default icon
      </button>
    </div>
  );

  return fixedPosition ? createPortal(picker, document.body) : picker;
}
