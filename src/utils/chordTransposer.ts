const SEMITONES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ALIASES: { [key: string]: string } = {
  'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'E#': 'F', 'B#': 'C', 'Cb': 'B'
};

// Normalize flat chords to sharp chords for index lookup
function normalizeChordRoot(root: string): string {
  return ALIASES[root] || root;
}

// Transpose a single chord string (e.g. C#m7, G/B, F#sus4)
export function transposeSingleChord(chordStr: string, semitones: number): string {
  // Return early for empty chords
  if (!chordStr) return '';

  // Handle slash chords like G/B recursively/separately
  if (chordStr.includes('/')) {
    const [base, bass] = chordStr.split('/');
    const transBase = transposeSingleChord(base, semitones);
    const transBass = transposeSingleChord(bass, semitones);
    return transBass ? `${transBase}/${transBass}` : transBase;
  }

  // Use Regex to match chord root (e.g., C, C#, Db) and the suffix (e.g. m, m7, sus4, maj7)
  const match = chordStr.match(/^([A-G][b#]?)(.*)$/);
  if (!match) return chordStr; // Return as-is if unrecognized

  const root = match[1];
  const suffix = match[2];

  const normalized = normalizeChordRoot(root);
  const index = SEMITONES.indexOf(normalized);

  if (index === -1) return chordStr;

  // Perform modulo arithmetic
  let targetIndex = (index + semitones) % 12;
  if (targetIndex < 0) targetIndex += 12;

  const newRoot = SEMITONES[targetIndex];
  return `${newRoot}${suffix}`;
}

// Transpose an entire lyrics sheet containing bracketed chords [C] is [Am] ...
export function transposeLyrics(lyrics: string, semitones: number): string {
  if (semitones === 0) return lyrics;

  // Matches text inside square brackets
  return lyrics.replace(/\[([^\]]+)\]/g, (match, chordInside) => {
    // Some brackets might contain non-chord markup, but we only transpose if inside looks like a chord
    const transposed = chordInside.split(/\s+/).map((item: string) => {
      // Validate if it is likely a chord starting with A-G
      if (/^[A-G]/.test(item)) {
        return transposeSingleChord(item, semitones);
      }
      return item;
    }).join(' ');

    return `[${transposed}]`;
  });
}

// Helper to remove all bracketed chords for plain lyrics mode (e.g. standard singers / congregation display)
export function stripChords(lyrics: string): string {
  // Replaces [G] or [D/F#] with empty string, preserving spaces
  return lyrics.replace(/\[[^\]]+\]/g, '');
}

// Dynamic range of key notes worship leaders typically select
export const KEYS_SCALE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export function calculateSemitoneDistance(fromKey: string, toKey: string): number {
  if (!fromKey || !toKey) return 0;
  
  const fromNormalized = normalizeChordRoot(fromKey);
  const toNormalized = normalizeChordRoot(toKey);
  
  const fromIndex = SEMITONES.indexOf(fromNormalized);
  const toIndex = SEMITONES.indexOf(toNormalized);
  
  if (fromIndex === -1 || toIndex === -1) return 0;
  
  return toIndex - fromIndex;
}
