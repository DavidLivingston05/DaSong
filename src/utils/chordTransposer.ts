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

/**
 * Intelligent parser that splits raw lyrics into natural worship stanzas.
 * Prevents splitting lines of the same stanza (e.g. from chord-only lines),
 * recognizes true stanza breaks (blank lines), and recognizes verse/chorus markers.
 */
export function parseSongSections(rawLyrics: string): string[] {
  if (!rawLyrics) return [];

  // 1. Normalize line endings & HTML tags
  const text = rawLyrics
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '');

  // 2. Strip leading metadata lines (Title:, Author:, Key:, etc.)
  const rawLines = text.split('\n');
  const cleanLines: string[] = [];
  let lyricsStarted = false;

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!lyricsStarted) {
      const isMetadata = 
        /^(?:Title|Name|Author|Artist|Composer|Writer|Key|Chord\s*Key|Bpm|Tempo|Category|Genre|Theme)\s*:/i.test(trimmed) ||
        /^lyrics\s*:/i.test(trimmed);
      if (isMetadata) continue;
      if (trimmed === '') continue;
      lyricsStarted = true;
    }
    cleanLines.push(line);
  }

  // 3. Process lines: strip bracketed chords, and eliminate lines that were ONLY chords
  // so they don't leave phantom blank lines that split a stanza in two!
  const lyricLines: { text: string; isBlank: boolean }[] = [];

  for (let i = 0; i < cleanLines.length; i++) {
    const originalLine = cleanLines[i];
    const isOriginallyBlank = originalLine.trim() === '';
    
    if (isOriginallyBlank) {
      lyricLines.push({ text: '', isBlank: true });
      continue;
    }

    // Strip bracketed chords
    const withoutBracketedChords = originalLine.replace(/\[[^\]]+\]/g, '');
    
    // Check if the line was ONLY chords (e.g. [G] [D] or just bracketed chords)
    // If it only had chords and no text, do NOT make it an empty blank line!
    if (withoutBracketedChords.trim() === '') {
      continue; // Dropping chord-only lines prevents splitting stanzas into two boxes!
    }

    // Also check if line is purely unbracketed chord symbols (e.g. "G   Em7   C   D/F#")
    const words = withoutBracketedChords.trim().split(/\s+/);
    const isPureChordLine = words.length > 0 && words.every(w => 
      /^[A-G][b#]?(?:m|maj|min|dim|aug|sus|add)?[0-9]*(?:\/[A-G][b#]?)?$/.test(w)
    );
    if (isPureChordLine) {
      continue; // Drop pure chord line
    }

    lyricLines.push({ text: withoutBracketedChords.trimEnd(), isBlank: false });
  }

  // 4. Group lines into stanzas (sections)
  // A stanza break occurs when:
  // a) There is an intentional blank line (isBlank === true)
  // b) OR a line starts a new numbered verse (e.g. "1. ", "2. ", "3. ") or section tag (e.g. "Chorus:", "Bridge:")
  const sections: string[] = [];
  let currentSectionLines: string[] = [];

  for (let i = 0; i < lyricLines.length; i++) {
    const item = lyricLines[i];

    if (item.isBlank) {
      if (currentSectionLines.length > 0) {
        sections.push(currentSectionLines.join('\n'));
        currentSectionLines = [];
      }
      continue;
    }

    // Check if line begins a new section like "1. ", "2. ", "Chorus:", "VERSE 1:", "Bridge:", "பல்லவி:", "சரணம்:"
    const isNewSectionHeader = 
      /^(?:Chorus|CHORUS|Verse\s*\d+|VERSE\s*\d+|\d+[\.\)]|பல்லவி|சரணம்\s*\d*|Bridge|BRIDGE|Outro|Intro|Tag)\b/i.test(item.text.trim()) ||
      item.text.trim().endsWith(':');

    if (isNewSectionHeader && currentSectionLines.length > 0) {
      // Previous stanza ends here
      sections.push(currentSectionLines.join('\n'));
      currentSectionLines = [];
    }

    currentSectionLines.push(item.text);
  }

  if (currentSectionLines.length > 0) {
    sections.push(currentSectionLines.join('\n'));
  }

  return sections.filter(s => s.trim().length > 0);
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
