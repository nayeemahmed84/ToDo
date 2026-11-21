const KEYWORD_EMOJIS: Array<[string[], string]> = [
  [['walmart', 'target', 'costco', 'aldi', 'kroger', 'publix', 'safeway', 'wegmans', 'trader', 'wholefoods', 'grocery', 'groceries', 'supermarket', 'market', 'shop', 'shopping', 'store', 'mall', 'amazon', 'buy', 'cart', 'errands'], '🛒'],
  [['food', 'dinner', 'lunch', 'breakfast', 'meal', 'cook', 'cooking', 'recipe', 'kitchen', 'bake', 'baking', 'eat', 'restaurant', 'pizza', 'burger', 'snack'], '🍳'],
  [['coffee', 'cafe', 'starbucks', 'tea', 'espresso', 'latte', 'drink', 'drinks', 'bar', 'smoothie'], '☕'],
  [['gym', 'workout', 'fitness', 'exercise', 'run', 'running', 'jog', 'yoga', 'sport', 'sports', 'swim', 'cardio', 'weights', 'lift', 'training'], '🏋️'],
  [['work', 'office', 'job', 'career', 'meeting', 'client', 'project', 'deadline', 'business', 'email', 'emails', 'presentation', 'report'], '💼'],
  [['code', 'coding', 'dev', 'developer', 'programming', 'software', 'app', 'web', 'bug', 'tech', 'computer', 'laptop', 'server', 'deploy', 'git'], '💻'],
  [['study', 'school', 'college', 'university', 'class', 'course', 'exam', 'homework', 'assignment', 'learn', 'learning', 'lecture', 'quiz'], '📚'],
  [['book', 'books', 'read', 'reading', 'novel', 'library', 'magazine', 'article'], '📖'],
  [['travel', 'trip', 'vacation', 'holiday', 'flight', 'airport', 'hotel', 'pack', 'packing', 'luggage', 'passport', 'tour'], '✈️'],
  [['home', 'house', 'apartment', 'clean', 'cleaning', 'chore', 'chores', 'laundry', 'repair', 'fix', 'furniture', 'room', 'move', 'moving'], '🏠'],
  [['bill', 'bills', 'bank', 'banking', 'finance', 'budget', 'money', 'tax', 'taxes', 'pay', 'payment', 'invest', 'salary', 'rent', 'utilities'], '💰'],
  [['health', 'doctor', 'dentist', 'hospital', 'clinic', 'med', 'medicine', 'pharmacy', 'cvs', 'walgreens', 'therapy', 'appointment', 'checkup', 'vitamins'], '🩺'],
  [['car', 'auto', 'vehicle', 'gas', 'fuel', 'mechanic', 'drive', 'oil', 'tire', 'wash', 'maintenance'], '🚗'],
  [['pet', 'pets', 'dog', 'cat', 'vet', 'puppy', 'kitten', 'walk', 'grooming'], '🐾'],
  [['garden', 'plant', 'plants', 'lawn', 'yard', 'flower', 'flowers', 'water', 'seeds'], '🪴'],
  [['gift', 'gifts', 'birthday', 'party', 'wedding', 'anniversary', 'celebrate', 'event', 'present'], '🎁'],
  [['music', 'song', 'songs', 'playlist', 'guitar', 'piano', 'concert', 'band', 'audio', 'podcast'], '🎵'],
  [['movie', 'movies', 'film', 'tv', 'show', 'shows', 'watch', 'netflix', 'game', 'games', 'gaming', 'video'], '🎬'],
  [['idea', 'ideas', 'brainstorm', 'note', 'notes', 'journal', 'write', 'writing', 'blog', 'draft'], '💡'],
  [['goal', 'goals', 'habit', 'habits', 'plan', 'planning', 'priority', 'important', 'focus', 'routine'], '🎯'],
  [['family', 'kids', 'kid', 'child', 'children', 'baby', 'mom', 'dad', 'parents'], '👨‍👩‍👧‍👦'],
  [['clothes', 'clothing', 'fashion', 'outfit', 'shirt', 'shoes', 'dress', 'wardrobe', 'tailor'], '👕'],
  [['photo', 'photos', 'camera', 'picture', 'pictures', 'album', 'shoot'], '📷'],
  [['call', 'calls', 'phone', 'contact', 'text', 'message', 'follow'], '📞'],
];

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

/**
 * Suggests the closest matching emoji for a list or folder title.
 * Uses exact, prefix/substring, and fuzzy Levenshtein matching.
 */
export function suggestEmoji(title: string): string | null {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  if (words.length === 0) return null;

  let bestEmoji: string | null = null;
  let bestScore = 0;

  for (const [keywords, emoji] of KEYWORD_EMOJIS) {
    for (const word of words) {
      for (const kw of keywords) {
        if (word === kw) return emoji;
        let score = 0;
        if (word.length >= 3 && (kw.startsWith(word) || word.startsWith(kw))) {
          score = 0.85;
        } else if (word.length >= 4 && kw.length >= 4) {
          const dist = levenshtein(word, kw);
          const maxLen = Math.max(word.length, kw.length);
          const sim = 1 - dist / maxLen;
          if (sim >= 0.65) score = sim;
        }
        if (score > bestScore) {
          bestScore = score;
          bestEmoji = emoji;
        }
      }
    }
  }

  return bestEmoji;
}
