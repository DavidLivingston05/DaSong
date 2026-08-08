import { FilterableSong, getCachedSongData } from './search';

export interface RecommendedSongItem {
  song: FilterableSong;
  score: number;
  reasons: string[];
}

// Relative / Harmonic key pairs (Major and its relative minor)
const RELATIVE_KEYS: Record<string, string> = {
  'C': 'Am', 'Am': 'C',
  'G': 'Em', 'Em': 'G',
  'D': 'Bm', 'Bm': 'D',
  'A': 'F#m', 'F#m': 'A',
  'E': 'C#m', 'C#m': 'E',
  'B': 'G#m', 'G#m': 'B',
  'F': 'Dm', 'Dm': 'F',
  'Bb': 'Gm', 'Gm': 'Bb',
  'Eb': 'Cm', 'Cm': 'Eb',
  'Ab': 'Fm', 'Fm': 'Ab',
};

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about',
  'of', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
  'naan', 'en', 'un', 'el', 'dhevan', 'deva', 'yesu', 'karthar', 'iraivan', 'aamen'
]);

const keywordCache = new Map<string, Set<string>>();

function extractKeywords(text: string): Set<string> {
  if (!text) return new Set();
  const cached = keywordCache.get(text);
  if (cached) return cached;

  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s\u0b80-\u0bff]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  const res = new Set(words);
  if (keywordCache.size > 5000) keywordCache.clear();
  keywordCache.set(text, res);
  return res;
}

/**
 * Calculates smart song recommendations based on key match, theme, author, and lyric keyword similarity.
 */
export function getRecommendedSongs(
  target: FilterableSong | string,
  catalog: FilterableSong[],
  limit: number = 6
): RecommendedSongItem[] {
  if (!catalog || catalog.length === 0) return [];

  let targetSong: FilterableSong | null = null;
  let queryText: string = '';

  if (typeof target === 'string') {
    queryText = target.trim();
    if (!queryText) return [];
  } else {
    targetSong = target;
  }

  const results: RecommendedSongItem[] = [];

  const targetKey = (targetSong as any)?.key ? String((targetSong as any).key).trim() : '';
  const targetCategory = targetSong?.category ? targetSong.category.trim().toLowerCase() : '';
  const targetAuthor = targetSong?.author ? targetSong.author.trim().toLowerCase() : '';
  const targetKeywords = targetSong ? extractKeywords(`${targetSong.title} ${targetSong.lyricsSnippet || ''}`) : extractKeywords(queryText);

  for (const candidate of catalog) {
    if (targetSong && candidate.id === targetSong.id) continue;

    let score = 0;
    const reasons: string[] = [];

    const candidateKey = (candidate as any)?.key ? String((candidate as any).key).trim() : '';
    const candidateCategory = candidate.category ? candidate.category.trim().toLowerCase() : '';
    const candidateAuthor = candidate.author ? candidate.author.trim().toLowerCase() : '';

    if (targetKey && candidateKey) {
      if (targetKey.toLowerCase() === candidateKey.toLowerCase()) {
        score += 120;
        reasons.push(`Key of ${candidateKey}`);
      } else if (RELATIVE_KEYS[targetKey] && RELATIVE_KEYS[targetKey].toLowerCase() === candidateKey.toLowerCase()) {
        score += 80;
        reasons.push(`Harmonic Key (${candidateKey})`);
      }
    }

    if (targetCategory && candidateCategory) {
      if (targetCategory === candidateCategory) {
        score += 100;
        reasons.push(`Theme: ${candidate.category}`);
      } else if (candidateCategory.includes(targetCategory) || targetCategory.includes(candidateCategory)) {
        score += 60;
        reasons.push(`Related Theme`);
      }
    } else if (candidateCategory && queryText) {
      if (candidateCategory.includes(queryText.toLowerCase())) {
        score += 70;
        reasons.push(`Theme: ${candidate.category}`);
      }
    }

    if (targetAuthor && candidateAuthor && targetAuthor === candidateAuthor) {
      score += 90;
      reasons.push(`Same Author`);
    }

    if (targetKeywords.size > 0) {
      const candidateKeywords = extractKeywords(`${candidate.title} ${candidate.lyricsSnippet || ''}`);
      let overlap = 0;
      for (const kw of targetKeywords) {
        if (candidateKeywords.has(kw)) overlap++;
      }
      if (overlap > 0) {
        const jaccard = overlap / (targetKeywords.size + candidateKeywords.size - overlap);
        const keywordScore = Math.round(jaccard * 180) + (overlap * 15);
        score += keywordScore;
        if (overlap >= 2) {
          reasons.push(`Shared Lyrics`);
        }
      }
    }

    if (!targetSong && queryText) {
      const cached = getCachedSongData(candidate);
      const cleanQ = queryText.toLowerCase();
      if (cached.cleanTitle.includes(cleanQ) || cached.transliteratedTitle.includes(cleanQ)) {
        score += 150;
        reasons.push(`Title Match`);
      }
    }

    if (score > 20) {
      const uniqueReasons = Array.from(new Set(reasons)).slice(0, 2);
      results.push({
        song: candidate,
        score,
        reasons: uniqueReasons.length > 0 ? uniqueReasons : ['Recommended']
      });
    }
  }

  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
}
