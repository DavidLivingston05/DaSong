/**
 * Utility matching engine for Tamil and Romanized Tamil (Tanglish) song search,
 * supporting word isolation, order flexibility, sanitization, and phonetic typo tolerance.
 * Includes highlight support via getHighlightRanges() for amber match highlighting in the UI.
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

const singleWordMatchCache = new Map<string, boolean>();

function isSingleWordMatch(queryWord: string, songWord: string): boolean {
  const cacheKey = `${queryWord}:${songWord}`;
  const cached = singleWordMatchCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let match = false;
  if (songWord.includes(queryWord) || queryWord.includes(songWord)) {
    match = true;
  } else {
    const isShortOrNumeric = queryWord.length < 4 || /^\d+$/.test(queryWord);
    if (!isShortOrNumeric) {
      const lengthDiff = Math.abs(queryWord.length - songWord.length);
      const maxLength = Math.max(queryWord.length, songWord.length);
      
      if (lengthDiff <= Math.floor(maxLength * 0.25)) {
        const distance = getLevenshteinDistance(queryWord, songWord);
        const similarity = 1 - distance / maxLength;
        if (similarity >= 0.75) {
          match = true;
        }
      }
    }
  }

  if (singleWordMatchCache.size > 50000) {
    singleWordMatchCache.clear();
  }
  singleWordMatchCache.set(cacheKey, match);
  return match;
}

/**
 * Checks if a cleaned query keyword match exists inside a list of song words.
 * Implements prefix, substring, and 75% character threshold similarity phonetic tolerance for longer keywords.
 */
export function isWordMatch(queryWord: string, songWords: string[]): boolean {
  for (const songWord of songWords) {
    if (isSingleWordMatch(queryWord, songWord)) {
      return true;
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
  lyricsSnippet?: string; // First ~300 chars included for full-text lyric search
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
    const cleanSnippet = song.lyricsSnippet ? cleanForSearch(song.lyricsSnippet) : '';

    songWords = `${cleanId} ${cleanTitle} ${cleanAuthor} ${cleanCategory} ${cleanSnippet}`
      .split(' ')
      .filter(Boolean);

    // Cap cache size to prevent unbounded memory growth in long sessions
    if (songWordsCache.size > 2000) songWordsCache.clear();
    songWordsCache.set(cacheKey, songWords);
  }

  // Return true if every individual query word matches at least one contextual song word
  return queryWords.every(qWord => isWordMatch(qWord, songWords));
}

/**
 * Clears both internal caches — call this after any song is created, updated, or deleted
 * to ensure stale tokens don't persist across mutations.
 */
export function clearSearchCache(): void {
  songWordsCache.clear();
  singleWordMatchCache.clear();
}

/**
 * Returns an array of non-overlapping {start, end} character index ranges where
 * any query word matches inside `text`. Used by <HighlightText> to wrap matched
 * substrings in amber <mark> spans without re-running the full matchSong pipeline.
 *
 * Strategy:
 * - Clean and split the query into words.
 * - For each query word, scan the display text for the first substring that the
 *   isSingleWordMatch heuristic would accept (prefix/substr/fuzzy).
 * - Collect all such ranges, then merge overlapping ones.
 * - Short or numeric query words use only exact substring matching to avoid
 *   false highlights from the fuzzy tier.
 */
export function getHighlightRanges(
  text: string,
  query: string
): { start: number; end: number }[] {
  if (!text || !query.trim()) return [];

  const cleanQuery = cleanForSearch(query);
  const queryWords = cleanQuery.split(' ').filter(Boolean);
  if (queryWords.length === 0) return [];

  const lowerText = text.toLowerCase();
  const ranges: { start: number; end: number }[] = [];

  for (const qWord of queryWords) {
    if (!qWord) continue;
    const isShortOrNumeric = qWord.length < 4 || /^\d+$/.test(qWord);

    // 1. Exact substring scan — always attempted first
    let idx = lowerText.indexOf(qWord);
    while (idx !== -1) {
      ranges.push({ start: idx, end: idx + qWord.length });
      idx = lowerText.indexOf(qWord, idx + 1);
    }

    if (ranges.length > 0 || isShortOrNumeric) continue;

    // 2. Word-level fuzzy scan — only for longer words with no exact match
    // Split display text into word tokens with their char positions
    const wordTokenRegex = /\S+/g;
    let match: RegExpExecArray | null;
    while ((match = wordTokenRegex.exec(lowerText)) !== null) {
      const token = match[0];
      const tokenStart = match.index;
      const cleanToken = cleanForSearch(token);
      if (!cleanToken) continue;

      // Re-use the isSingleWordMatch cache
      if (isSingleWordMatch(qWord, cleanToken)) {
        ranges.push({ start: tokenStart, end: tokenStart + token.length });
      }
    }
  }

  if (ranges.length === 0) return [];

  // Merge overlapping / adjacent ranges so we don't double-wrap
  ranges.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1];
    const cur = ranges[i];
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ start: cur.start, end: cur.end });
    }
  }
  return merged;
}
