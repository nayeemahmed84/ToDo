import type { TodoItem } from '../types/todo';

export function normalizeSearchText(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/['’`\uFE0F]/g, '')
    .replace(/[^\p{L}\p{N}\p{M}\p{Extended_Pictographic}]+/gu, ' ')
    .trim();
}

function collapseSpaces(input: string): string {
  return input.replace(/\s+/g, '');
}

function damerauLevenshtein(a: string, b: string, maxDist: number): number {
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > maxDist) return maxDist + 1;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  const dp: number[][] = Array.from({ length: lenA + 1 }, () => new Array<number>(lenB + 1).fill(0));
  for (let i = 0; i <= lenA; i += 1) dp[i][0] = i;
  for (let j = 0; j <= lenB; j += 1) dp[0][j] = j;

  for (let i = 1; i <= lenA; i += 1) {
    let rowMin = maxDist + 1;
    for (let j = 1; j <= lenB; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, dp[i - 2][j - 2] + cost);
      }
      dp[i][j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > maxDist) return maxDist + 1;
  }
  return dp[lenA][lenB];
}

function matchesAcronym(words: string[], token: string): boolean {
  if (token.length < 2 || words.length < token.length) return false;
  const initials = words.map((w) => w[0] ?? '').join('');
  return initials.includes(token);
}

function scoreTokenAgainstWords(token: string, words: string[], collapsedText: string): number {
  let best = 0;
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    if (w === token) return 100;
    if (w.startsWith(token)) {
      best = Math.max(best, 85);
    } else if ((token.length >= 2 || /[\p{Unified_Ideograph}\p{Extended_Pictographic}]/u.test(token)) && w.includes(token)) {
      best = Math.max(best, 65);
    } else if (token.length >= 3) {
      const maxDist = token.length >= 6 ? 2 : 1;
      const dist = damerauLevenshtein(token, w, maxDist);
      if (dist <= maxDist) {
        best = Math.max(best, dist === 1 ? 45 : 30);
      } else if (w.length > token.length + 1) {
        // Check prefix of word with typo tolerance (e.g. "barbq" or "myanmr")
        const prefix = w.slice(0, token.length);
        const prefixDist = damerauLevenshtein(token, prefix, 1);
        if (prefixDist <= 1) {
          best = Math.max(best, 40);
        }
      }
    }
  }
  if (best === 0 && token.length >= 2) {
    if (collapsedText.includes(token)) {
      best = 60;
    } else if (matchesAcronym(words, token)) {
      best = 55;
    }
  }
  return best;
}

export function scoreTextMatch(rawText: string, rawQuery: string): number {
  const normQuery = normalizeSearchText(rawQuery);
  if (!normQuery) return 0;
  const normText = normalizeSearchText(rawText);
  if (!normText) return 0;

  if (normText === normQuery) return 1000;
  if (normText.startsWith(normQuery)) return 850;
  if (normText.includes(normQuery)) return 700;

  const collapsedText = collapseSpaces(normText);
  const collapsedQuery = collapseSpaces(normQuery);
  if (collapsedQuery.length >= 2 && collapsedText.includes(collapsedQuery)) {
    return 620;
  }

  const queryTokens = normQuery.split(/\s+/).filter(Boolean);
  const targetWords = normText.split(/\s+/).filter(Boolean);
  if (queryTokens.length === 0 || targetWords.length === 0) return 0;

  let totalScore = 0;
  let inOrder = true;
  let lastWordIdx = -1;

  for (const token of queryTokens) {
    const tokenScore = scoreTokenAgainstWords(token, targetWords, collapsedText);
    if (tokenScore === 0) return 0;
    totalScore += tokenScore;

    const matchedIdx = targetWords.findIndex(
      (w, idx) => idx > lastWordIdx && (w.startsWith(token) || w.includes(token))
    );
    if (matchedIdx >= 0) {
      lastWordIdx = matchedIdx;
    } else {
      inOrder = false;
    }
  }

  const avg = totalScore / queryTokens.length;
  return Math.round(avg * 4 + (inOrder ? 80 : 0));
}

export function scoreTodoItemMatch(
  item: TodoItem,
  rawQuery: string,
  listTitle?: string
): number {
  const normQuery = normalizeSearchText(rawQuery);
  if (!normQuery) return 0;

  const titleScore = scoreTextMatch(item.text, normQuery);
  if (titleScore > 0) {
    return titleScore + 200;
  }

  const tagsText = (item.tags ?? []).join(' ');
  const tagScore = tagsText ? scoreTextMatch(tagsText, normQuery) : 0;
  if (tagScore > 0) {
    return tagScore + 150;
  }

  let bestStepScore = 0;
  for (const step of item.steps ?? []) {
    const s = scoreTextMatch(step.text, normQuery);
    if (s > bestStepScore) bestStepScore = s;
  }
  if (bestStepScore > 0) {
    return bestStepScore + 100;
  }

  const notesScore = item.notes ? scoreTextMatch(item.notes, normQuery) : 0;
  if (notesScore > 0) {
    return notesScore + 50;
  }

  // Cross-field match: e.g. query tokens split across title, tags, steps, notes, comments, and list title
  const combined = [
    item.text,
    tagsText,
    ...(item.steps ?? []).map((s) => s.text),
    item.notes ?? '',
    ...(item.comments ?? []).map((c) => c.text),
    listTitle ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return scoreTextMatch(combined, normQuery);
}
