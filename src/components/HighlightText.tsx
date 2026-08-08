import React from 'react';
import { getHighlightRanges } from '../lib/search';

interface HighlightTextProps {
  text: string;
  query: string;
  className?: string;
  highlightClassName?: string;
}

export const HighlightText: React.FC<HighlightTextProps> = React.memo(({
  text,
  query,
  className = '',
  highlightClassName = 'bg-amber-500/25 text-amber-300 font-bold px-0.5 rounded'
}) => {
  if (!text) return null;
  if (!query || !query.trim()) {
    return <span className={className}>{text}</span>;
  }

  const ranges = getHighlightRanges(text, query);
  if (ranges.length === 0) {
    return <span className={className}>{text}</span>;
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  ranges.forEach((range, idx) => {
    if (range.start > lastIndex) {
      parts.push(
        <span key={`text-${lastIndex}-${range.start}`}>
          {text.substring(lastIndex, range.start)}
        </span>
      );
    }

    parts.push(
      <mark key={`highlight-${idx}`} className={highlightClassName}>
        {text.substring(range.start, range.end)}
      </mark>
    );

    lastIndex = range.end;
  });

  if (lastIndex < text.length) {
    parts.push(
      <span key={`text-${lastIndex}-end`}>
        {text.substring(lastIndex)}
      </span>
    );
  }

  return <span className={className}>{parts}</span>;
});

export default HighlightText;
