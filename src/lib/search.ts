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

const TAMIL_VOWELS: Record<string, string> = {
  'அ': 'a', 'ஆ': 'a', 'இ': 'i', 'ஈ': 'i', 'உ': 'u', 'ஊ': 'u',
  'எ': 'e', 'ஏ': 'e', 'ஐ': 'ai', 'ஒ': 'o', 'ஓ': 'o', 'ஔ': 'au'
};

const TAMIL_CONSONANTS: Record<string, string> = {
  'க': 'k', 'ங': 'ng', 'ச': 's', 'ஞ': 'nj', 'ட': 't', 'ண': 'n',
  'த': 'th', 'ந': 'n', 'ப': 'p', 'ம': 'm', 'ய': 'y', 'ர': 'r',
  'ல': 'l', 'வ': 'v', 'ழ': 'zh', 'ள': 'l', 'ற': 'r', 'ன': 'n',
  'ஜ': 'j', 'ஷ': 'sh', 'ஸ': 's', 'ஹ': 'h'
};

const TAMIL_VOWEL_SIGNS: Record<string, string> = {
  'ா': 'a', 'ி': 'i', 'ீ': 'i', 'ு': 'u', 'ூ': 'u',
  'ெ': 'e', 'ே': 'e', 'ை': 'ai', 'ொ': 'o', 'ோ': 'o', 'ௌ': 'au'
};

/**
 * Transliterates Tamil characters to their phonetically equivalent Tanglish text.
 */
export function transliterateTamilToTanglish(text: string): string {
  let result = '';
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (TAMIL_VOWELS[char] !== undefined) {
      result += TAMIL_VOWELS[char];
      i++;
      continue;
    }
    if (TAMIL_CONSONANTS[char] !== undefined) {
      const consonantSound = TAMIL_CONSONANTS[char];
      const nextChar = text[i + 1];
      if (nextChar === '்') {
        result += consonantSound;
        i += 2;
      } else if (TAMIL_VOWEL_SIGNS[nextChar] !== undefined) {
        result += consonantSound + TAMIL_VOWEL_SIGNS[nextChar];
        i += 2;
      } else {
        result += consonantSound + 'a';
        i++;
      }
      continue;
    }
    if (char === '்' || TAMIL_VOWEL_SIGNS[char] !== undefined) {
      i++;
      continue;
    }
    result += char;
    i++;
  }
  return result;
}

/**
 * Checks if a cleaned query keyword match exists inside a list of song words.
 * Implements prefix, substring, and 75% character threshold similarity phonetic tolerance for longer keywords.
 * Also handles transliterating Tamil query words to enable cross-script matching.
 */
export function isWordMatch(queryWord: string, songWords: string[]): boolean {
  for (const songWord of songWords) {
    if (isSingleWordMatch(queryWord, songWord)) {
      return true;
    }
  }

  // Handle cross-script matching if query word has Tamil characters
  if (/[\u0b80-\u0bff]/.test(queryWord)) {
    const transliterated = cleanForSearch(transliterateTamilToTanglish(queryWord));
    if (transliterated && transliterated !== queryWord) {
      for (const songWord of songWords) {
        if (isSingleWordMatch(transliterated, songWord)) {
          return true;
        }
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

    const transliteratedTitle = transliterateTamilToTanglish(cleanTitle);
    const transliteratedSnippet = transliterateTamilToTanglish(cleanSnippet);

    songWords = `${cleanId} ${cleanTitle} ${transliteratedTitle} ${cleanAuthor} ${cleanCategory} ${cleanSnippet} ${transliteratedSnippet}`
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

/**
 * Calculates search relevance score for Holyrics-style ranking (higher score = more relevant).
 */
export function getSearchRelevanceScore(song: FilterableSong, searchQuery: string): number {
  const query = searchQuery.trim();
  if (!query) return 0;

  const cleanQuery = cleanForSearch(query);
  if (!cleanQuery) return 0;

  const cleanTitle = cleanForSearch(song.title);
  const transliteratedTitle = cleanForSearch(transliterateTamilToTanglish(song.title));

  // 1. Exact title match (original or transliterated)
  if (cleanTitle === cleanQuery || transliteratedTitle === cleanQuery) {
    return 100;
  }

  // 2. Title starts with query
  if (cleanTitle.startsWith(cleanQuery) || transliteratedTitle.startsWith(cleanQuery)) {
    return 90;
  }

  // 3. Title contains query
  if (cleanTitle.includes(cleanQuery) || transliteratedTitle.includes(cleanQuery)) {
    return 80;
  }

  // 4. Word-level title match
  const queryWords = cleanQuery.split(' ').filter(Boolean);
  const titleWords = `${cleanTitle} ${transliteratedTitle}`.split(' ').filter(Boolean);
  const allWordsInTitle = queryWords.every(qw => titleWords.some(tw => tw.includes(qw) || qw.includes(tw)));
  if (allWordsInTitle) {
    return 70;
  }

  // 5. Author match
  if (song.author) {
    const cleanAuthor = cleanForSearch(song.author);
    if (cleanAuthor === cleanQuery) return 60;
    if (cleanAuthor.includes(cleanQuery)) return 55;
  }

  // 6. Category match
  if (song.category) {
    const cleanCategory = cleanForSearch(song.category);
    if (cleanCategory === cleanQuery) return 50;
  }

  // 7. Lyrics match
  if (song.lyricsSnippet) {
    const cleanLyrics = cleanForSearch(song.lyricsSnippet);
    const transliteratedLyrics = cleanForSearch(transliterateTamilToTanglish(song.lyricsSnippet));

    if (cleanLyrics.includes(cleanQuery) || transliteratedLyrics.includes(cleanQuery)) {
      return 40;
    }

    const lyricWords = `${cleanLyrics} ${transliteratedLyrics}`.split(' ').filter(Boolean);
    const allWordsInLyrics = queryWords.every(qw => lyricWords.some(lw => lw.includes(qw) || qw.includes(lw)));
    if (allWordsInLyrics) {
      return 35;
    }

    const someWordsInLyrics = queryWords.some(qw => lyricWords.some(lw => lw.includes(qw) || qw.includes(lw)));
    if (someWordsInLyrics) {
      return 20;
    }
  }

  // 8. General fallback match
  return 10;
}

/**
 * Finds the first lyric line in the song snippet that contains search matches.
 */
export function findMatchingLyricLine(lyrics: string | undefined, searchQuery: string): string | undefined {
  if (!lyrics || !searchQuery.trim()) return undefined;

  const cleanQuery = cleanForSearch(searchQuery);
  const queryWords = cleanQuery.split(' ').filter(Boolean);
  if (queryWords.length === 0) return undefined;

  const lines = lyrics.split(/\r?\n/);

  // Pass 1: exact match on query phrase
  for (const line of lines) {
    const cleanLine = cleanForSearch(line);
    const transliteratedLine = cleanForSearch(transliterateTamilToTanglish(line));
    if (cleanLine.includes(cleanQuery) || transliteratedLine.includes(cleanQuery)) {
      return line.trim();
    }
  }

  // Pass 2: line containing all query words
  for (const line of lines) {
    const cleanLine = cleanForSearch(line);
    const transliteratedLine = cleanForSearch(transliterateTamilToTanglish(line));
    const combinedWords = `${cleanLine} ${transliteratedLine}`.split(' ').filter(Boolean);

    const allWordsMatch = queryWords.every(qWord =>
      combinedWords.some(w => w.includes(qWord) || qWord.includes(w))
    );
    if (allWordsMatch) {
      return line.trim();
    }
  }

  // Pass 3: line matching longest query word (min length 3)
  const sortedWords = [...queryWords].sort((a, b) => b.length - a.length);
  for (const line of lines) {
    const cleanLine = cleanForSearch(line);
    const transliteratedLine = cleanForSearch(transliterateTamilToTanglish(line));
    const combinedWords = `${cleanLine} ${transliteratedLine}`.split(' ').filter(Boolean);

    for (const qWord of sortedWords) {
      if (qWord.length >= 3 && combinedWords.some(w => w.includes(qWord) || qWord.includes(w))) {
        return line.trim();
      }
    }
  }

  return undefined;
}
