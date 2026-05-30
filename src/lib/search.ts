/**
 * Utility matching engine for Tamil and Romanized Tamil (Tanglish) song search,
 * supporting word isolation, order flexibility, sanitization, and phonetic typo tolerance.
 */

/**
 * Computes the Levenshtein distance between two strings with O(min(M, N)) space optimization.
 * This measures the minimum number of character edits (insertions, deletions, substitutions)
 * required to change one string into another.
 */
export function getLevenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prevRow = Array.from({ length: b.length + 1 }, (_, i) => i);
  let currRow = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    currRow[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        currRow[j - 1] + 1,      // Insertion
        prevRow[j] + 1,          // Deletion
        prevRow[j - 1] + cost    // Substitution
      );
    }
    // Swap rows
    const temp = prevRow;
    prevRow = currRow;
    currRow = temp;
  }

  return prevRow[b.length];
}

/**
 * Strips out all non-alphanumeric punctuation and accents, collapsing multiple whitespace characters.
 * Preserves the Latin character set, numbers, and the Tamil Unicode script block (\u0B80-\u0BFF).
 */
export function cleanForSearch(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD') // Decomposes accented characters into their base forms and accent markers
    .replace(/[\u0300-\u036f]/g, '') // Strips the separated accent markers
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\s\u0b80-\u0bff]/g, ' ') // Keep alphanumeric characters, spaces, and pure Tamil script
    .replace(/\s+/g, ' ') // Collapse multiple space characters
    .trim();
}

/**
 * Checks if a cleaned query keyword match exists inside a list of song words.
 * Implements prefix, substring, and 75% character threshold similarity phonetic tolerance for longer keywords.
 */
export function isWordMatch(queryWord: string, songWords: string[]): boolean {
  // Purely numeric strings and short words (< 4 characters) demand strict substring checks to filter noise
  const isShortOrNumeric = queryWord.length < 4 || /^\d+$/.test(queryWord);

  for (const songWord of songWords) {
    // Exact or substring match (e.g. "alle" matching "alleluya")
    if (songWord.includes(queryWord) || queryWord.includes(songWord)) {
      return true;
    }

    // Dynamic phonetic match via Levenshtein edit distance for long keywords (>= 4 characters)
    // Matches "enbam" with "inbam", or "aalugirar" with "aaluhirar"
    if (!isShortOrNumeric) {
      const lengthDiff = Math.abs(queryWord.length - songWord.length);
      const maxLength = Math.max(queryWord.length, songWord.length);
      
      // Math proof: similarity can never be >= 0.75 if length difference is greater than 25%
      if (lengthDiff > Math.floor(maxLength * 0.25)) {
        continue;
      }

      const distance = getLevenshteinDistance(queryWord, songWord);
      const similarity = 1 - distance / maxLength;
      if (similarity >= 0.75) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if a song matches a given multi-word search query.
 * Splits query into standalone words, checks that every single query word matches some song context.
 */
export interface FilterableSong {
  id: string;
  title: string;
  author?: string;
  category?: string;
}

// Thread-safe memory cache of pre-cleaned song tokens to keep searches under 1ms
const songWordsCache = new Map<string, string[]>();

export function matchSong(song: FilterableSong, searchQuery: string): boolean {
  const query = searchQuery.trim();
  if (!query) return true;

  const cleanQuery = cleanForSearch(query);
  const queryWords = cleanQuery.split(' ').filter(Boolean);
  if (queryWords.length === 0) return true;

  // Generate a stable composite cache key incorporating all textual attributes
  const cacheKey = `${song.id}_${song.title}_${song.author || ''}_${song.category || ''}`;
  
  let songWords = songWordsCache.get(cacheKey);
  if (!songWords) {
    const cleanId = cleanForSearch(song.id);
    const cleanTitle = cleanForSearch(song.title);
    const cleanAuthor = song.author ? cleanForSearch(song.author) : '';
    const cleanCategory = song.category ? cleanForSearch(song.category) : '';

    songWords = `${cleanId} ${cleanTitle} ${cleanAuthor} ${cleanCategory}`
      .split(' ')
      .filter(Boolean);
      
    songWordsCache.set(cacheKey, songWords);
  }

  // Return true if every individual query word matches at least one contextual song word
  return queryWords.every(qWord => isWordMatch(qWord, songWords));
}
