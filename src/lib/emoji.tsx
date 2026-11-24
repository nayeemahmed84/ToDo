import { Fragment } from 'react';
import emojiData from '@emoji-mart/data';

interface EmojiMartEntry {
  id: string;
  skins?: Array<{ native?: string }>;
}

let shortcodeMap: Map<string, string> | null = null;

function getShortcodeMap(): Map<string, string> {
  if (shortcodeMap) return shortcodeMap;
  const map = new Map<string, string>();
  const emojis = (emojiData as unknown as { emojis?: Record<string, EmojiMartEntry> }).emojis ?? {};
  for (const [id, entry] of Object.entries(emojis)) {
    const native = entry?.skins?.[0]?.native;
    if (!native) continue;
    const key = id.toLowerCase();
    map.set(key, native);
    if (key.includes('-')) {
      map.set(key.replace(/-/g, '_'), native);
    }
    if (key.startsWith('flag-') && key.length === 7) {
      const code = key.slice(5);
      if (!map.has(code)) {
        map.set(code, native);
      }
    }
  }
  shortcodeMap = map;
  return map;
}

const SHORTCODE_RE = /:([a-zA-Z0-9_+-]+):/g;
const FLAG_RE = /([\u{1F1E6}-\u{1F1FF}]{2})/u;
const FLAG_SPLIT_RE = /([\u{1F1E6}-\u{1F1FF}]{2})/gu;

export function resolveEmojiShortcodes(text: string): string {
  if (!text || !text.includes(':')) return text;
  const map = getShortcodeMap();
  return text.replace(SHORTCODE_RE, (full, rawName: string) => {
    const key = rawName.toLowerCase();
    return map.get(key) ?? map.get(key.replace(/_/g, '-')) ?? full;
  });
}

function getTwemojiFlagUrl(flag: string): string | null {
  const cps = Array.from(flag).map((ch) => ch.codePointAt(0));
  if (cps.length !== 2 || cps[0] == null || cps[1] == null) return null;
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${cps[0].toString(16)}-${cps[1].toString(16)}.svg`;
}

export function EmojiText({ text }: { text: string }) {
  const resolved = resolveEmojiShortcodes(text);
  if (!FLAG_RE.test(resolved)) {
    return <>{resolved}</>;
  }
  const parts = resolved.split(FLAG_SPLIT_RE);
  return (
    <>
      {parts.map((part, idx) => {
        if (!part) return null;
        if (FLAG_RE.test(part)) {
          const url = getTwemojiFlagUrl(part);
          if (url) {
            return (
              <img
                key={idx}
                src={url}
                alt={part}
                className="inline-flag-emoji"
                loading="lazy"
                draggable={false}
                onError={(e) => {
                  const span = document.createElement('span');
                  span.textContent = part;
                  e.currentTarget.replaceWith(span);
                }}
              />
            );
          }
        }
        return <Fragment key={idx}>{part}</Fragment>;
      })}
    </>
  );
}
