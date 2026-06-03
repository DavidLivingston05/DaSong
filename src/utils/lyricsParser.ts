/**
 * Heuristics to detect if a word token is a valid musical chord.
 */
export function isChordToken(token: string): boolean {
  // Strip parentheses or brackets around the chord if any (e.g. (C#m7))
  const clean = token.replace(/[()]/g, '').trim();
  if (!clean) return false;

  // Regex matching standard chord structures:
  // - Starts with A-G root note
  // - Optional accidental # or b
  // - Optional suffix (m, min, maj, dim, aug, sus, add, numbers, flats/sharps in suffix like 7b5, etc.)
  // - Optional slash bass note (e.g. /B, /F#)
  const chordRegex = /^[A-G][b#]?(m|min|maj|dim|aug|sus|add|maj7|m7|7|9|11|13|5|2|4|M7|add9|sus4|sus2|\+|o|ø)?(2|5|6|7|9|11|13|b5|#5|b9|#9|sus|sus4|sus2|add9|maj9)?(\/[A-G][b#]?)?$/i;
  return chordRegex.test(clean);
}

/**
 * Heuristics to detect if a text line contains chords.
 * A line is considered a chord line if:
 * 1. It is not empty.
 * 2. At least 70% of the non-empty tokens look like chords.
 */
export function isChordsLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  const tokens = trimmed.split(/\s+/);
  let chordCount = 0;
  
  for (const token of tokens) {
    if (isChordToken(token)) {
      chordCount++;
    }
  }

  // If there are tokens, check if the majority of them are chords
  return tokens.length > 0 && (chordCount / tokens.length) >= 0.7;
}

/**
 * Merges a chords line and a lyrics line into a single bracketed chord line.
 * Aligning the bracketed chords with the text underneath them.
 */
export function mergeChordsAndLyrics(chordsLine: string, lyricsLine: string): string {
  // Extract all non-space chord tokens and their starting indices
  const regex = /\S+/g;
  let match;
  const chords: { chord: string; index: number }[] = [];

  while ((match = regex.exec(chordsLine)) !== null) {
    chords.push({
      chord: match[0],
      index: match.index
    });
  }

  // Build the merged string
  let result = '';
  let lyricsIndex = 0;

  // Sort chords by starting index
  chords.sort((a, b) => a.index - b.index);

  for (const c of chords) {
    // Append the text from the previous index up to this chord's index
    if (c.index > lyricsIndex) {
      result += lyricsLine.substring(lyricsIndex, c.index);
      lyricsIndex = c.index;
    }

    // Append the chord inside square brackets
    result += `[${c.chord.replace(/[()]/g, '')}]`;
  }

  // Append any remaining lyrics
  if (lyricsIndex < lyricsLine.length) {
    result += lyricsLine.substring(lyricsIndex);
  }

  return result;
}

/**
 * Converts a line that contains chords only (no lyrics underneath) into bracketed chords.
 * Preserves spaces between them.
 */
export function convertChordsToBracketed(chordsLine: string): string {
  // Wrap non-space sequences in brackets
  return chordsLine.replace(/\S+/g, '[$&]').replace(/[()]/g, '');
}

/**
 * Parses an entire song sheet containing traditional chords-above-lyrics formatting
 * and converts it into unified lines containing bracketed chords.
 */
export function parseTwoLineChords(text: string): string {
  if (!text) return '';

  const lines = text.split(/\r?\n/);
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];

    const isChords = isChordsLine(line);

    if (isChords) {
      // If there is a next line and it is a lyrics line (not empty and not chords)
      const hasNextLine = nextLine !== undefined;
      const isNextLyrics = hasNextLine && nextLine.trim() !== '' && !isChordsLine(nextLine);

      if (isNextLyrics) {
        result.push(mergeChordsAndLyrics(line, nextLine));
        i++; // Skip the next line since we merged it
      } else {
        // Chords line with no lyrics underneath (e.g. intro/outro or bridge chords line)
        result.push(convertChordsToBracketed(line));
      }
    } else {
      // Standard text line
      result.push(line);
    }
  }

  return result.join('\n');
}
