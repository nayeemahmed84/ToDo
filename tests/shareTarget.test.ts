import { describe, expect, it } from 'vitest';
import { formatSharedFileSize, normalizeShareFields } from '../src/lib/shareTarget';

describe('PWA Share Target helpers', () => {
  it('combines title, text, and url without duplicating title or url in notes', () => {
    const result = normalizeShareFields({
      title: 'Quarterly Roadmap',
      text: 'Please review section 3 before Friday',
      url: 'https://example.com/roadmap',
    });

    expect(result.title).toBe('Quarterly Roadmap');
    expect(result.url).toBe('https://example.com/roadmap');
    expect(result.note).toContain('Please review section 3 before Friday');
    expect(result.note).toContain('https://example.com/roadmap');
  });

  it('extracts URL embedded inside text (common Android share behavior)', () => {
    const result = normalizeShareFields({
      text: 'Check out this recipe https://example.com/pasta',
    });

    expect(result.title).toBe('Check out this recipe https://example.com/pasta');
    expect(result.url).toBe('https://example.com/pasta');
    expect(result.note).toBe('');
  });

  it('uses first shared filename when only files are shared', () => {
    const result = normalizeShareFields({
      fileNames: ['receipt-2026.pdf', 'notes.txt'],
    });

    expect(result.title).toBe('Review receipt-2026.pdf');
    expect(result.note).toBe('');
    expect(result.url).toBeUndefined();
  });

  it('falls back to "Shared item" when payload is completely empty', () => {
    const result = normalizeShareFields({});
    expect(result.title).toBe('Shared item');
    expect(result.note).toBe('');
  });

  it('formats file sizes cleanly across B, KB, and MB', () => {
    expect(formatSharedFileSize(512)).toBe('512 B');
    expect(formatSharedFileSize(2048)).toBe('2.0 KB');
    expect(formatSharedFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });
});
