import { SongMetadata } from './db';

export interface RecommendedSongItem {
  song: SongMetadata;
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
 * Calculates smart song recommendations based on key match, author, and lyric keyword similarity.
 */
export function getRecommendedSongs(
  targetSong: SongMetadata,
  catalog: SongMetadata[],
  limit: number = 6
): RecommendedSongItem[] {
  if (!targetSong || !catalog || catalog.length === 0) return [];

  const results: RecommendedSongItem[] = [];

  const targetKey = targetSong.key ? String(targetSong.key).trim() : '';
  const targetAuthor = targetSong.author ? targetSong.author.trim().toLowerCase() : '';
  const targetKeywords = extractKeywords(`${targetSong.title} ${targetSong.lyricsSnippet || ''}`);

  for (const candidate of catalog) {
    if (candidate.id === targetSong.id) continue;

    let score = 0;
    const reasons: string[] = [];

    const candidateKey = candidate.key ? String(candidate.key).trim() : '';
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
