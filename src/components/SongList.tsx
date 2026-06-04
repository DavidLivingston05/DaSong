import React, { useState, useMemo, useRef } from 'react';
import { Search, Music, Star, Trash2, PlusCircle, Layers, ChevronRight, BookOpen, SlidersHorizontal, X } from 'lucide-react';
import { SongMetadata } from '../lib/db';
import { UserRole } from '../types';
import { matchSong, getHighlightRanges, getSearchRelevanceScore, findMatchingLyricLine } from '../lib/search';

/**
 * Highlights portions of `text` that match `query` with an amber glow.
 * Falls back to plain text when query is empty or there are no matches.
 */
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const ranges = getHighlightRanges(text, query);
  if (ranges.length === 0) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const { start, end } of ranges) {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark
        key={start}
        className="bg-amber-400/20 text-amber-300 rounded-sm px-0.5 not-italic font-inherit"
        style={{ fontWeight: 'inherit' }}
      >
        {text.slice(start, end)}
      </mark>
    );
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

interface SongListProps {
  songs: SongMetadata[];
  selectedSongId: string | null;
  onSelectSong: (id: string) => void;
  onToggleFavorite: (id: string, currentFav: boolean) => void;
  onDeleteSong: (id: string) => void;
  onOpenAddModal: () => void;
  onOpenUploadModal: () => void;
  onClearLibrary: () => void;
  currentRole: UserRole;
  onSuggestSong?: (id: string, title: string) => void;
}

function SongList({
  songs,
  selectedSongId,
  onSelectSong,
  onToggleFavorite,
  onDeleteSong,
  onOpenAddModal,
  onOpenUploadModal,
  onClearLibrary,
  currentRole,
  onSuggestSong
}: SongListProps) {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [tempSearch, setTempSearch] = useState<string>('');
  const [showFilters, setShowFilters] = useState<boolean>(false);

  // Debounce: 80ms for responsive and lag-free feedback
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setSearchQuery(tempSearch);
      setVisibleCount(20);
    }, 80);
    return () => clearTimeout(handler);
  }, [tempSearch]);

  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState<boolean>(false);
  const [visibleCount, setVisibleCount] = useState<number>(20);
  const [kbdIndex, setKbdIndex] = useState<number>(-1);
  const [sortBy, setSortBy] = useState<'title-asc' | 'title-desc' | 'author-asc' | 'author-desc' | 'category-asc' | 'category-desc' | 'lyrics-asc' | 'lyrics-desc' | 'newest' | 'oldest' | 'bpm-asc' | 'bpm-desc'>('title-asc');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const deleteTimerRef = useRef<number | null>(null);

  // Clear search
  const clearSearch = () => { setTempSearch(''); setSelectedCategory('All'); setShowOnlyFavorites(false); };

  // Derive unique categories for filtering dropdown
  const categories = useMemo(() => {
    const list = new Set<string>();
    songs.forEach(s => {
      if (s.category) list.add(s.category);
    });
    return ['All', ...Array.from(list)];
  }, [songs]);

  // High-performance filter — partial match (Google-style: show songs even with incomplete typing)
  const filteredSongs = useMemo(() => {
    let result = songs;
    if (searchQuery.trim() || selectedCategory !== 'All' || showOnlyFavorites) {
      result = songs.filter(song => {
        const matchesText = !searchQuery.trim() || matchSong(song, searchQuery);
        const matchesCategory = selectedCategory === 'All' || song.category === selectedCategory;
        const matchesFav = !showOnlyFavorites || !!song.favorite;
        return matchesText && matchesCategory && matchesFav;
      });
    }

    // Pre-calculate search relevance scores to optimize sorting complexity from O(N log N) to O(N)
    const scores = new Map<string, number>();
    if (searchQuery.trim()) {
      result.forEach(song => {
        scores.set(song.id, getSearchRelevanceScore(song, searchQuery));
      });
    }

    // Sort: relevance when searching, otherwise user-selected sort
    return [...result].sort((a, b) => {
      if (searchQuery.trim()) {
        const scoreA = scores.get(a.id) || 0;
        const scoreB = scores.get(b.id) || 0;
        if (scoreA !== scoreB) return scoreB - scoreA;
      }
      switch (sortBy) {
        case 'title-asc': return a.title.localeCompare(b.title);
        case 'title-desc': return b.title.localeCompare(a.title);
        case 'author-asc': return (a.author || '').localeCompare(b.author || '');
        case 'author-desc': return (b.author || '').localeCompare(a.author || '');
        case 'category-asc': return (a.category || '').localeCompare(b.category || '');
        case 'category-desc': return (b.category || '').localeCompare(a.category || '');
        case 'lyrics-asc': return (a.lyricsSnippet || '').localeCompare(b.lyricsSnippet || '');
        case 'lyrics-desc': return (b.lyricsSnippet || '').localeCompare(a.lyricsSnippet || '');
        case 'newest': return (b.createdAt || 0) - (a.createdAt || 0);
        case 'oldest': return (a.createdAt || 0) - (b.createdAt || 0);
        case 'bpm-asc': return (a.bpm || 0) - (b.bpm || 0);
        case 'bpm-desc': return (b.bpm || 0) - (a.bpm || 0);
        default: return 0;
      }
    });
  }, [songs, searchQuery, selectedCategory, showOnlyFavorites, sortBy]);

  // Is this a partial-match situation (user typed something but results are fewer than all songs)?
  const isPartialMatch = searchQuery.trim().length > 0 && filteredSongs.length > 0 && filteredSongs.length < songs.length;


  // Slice list up to visible count for ultra fast layout rendering
  const paginatedSongs = useMemo(() => {
    return filteredSongs.slice(0, visibleCount);
  }, [filteredSongs, visibleCount]);

  // Reset keyboard selection when active filter inputs change
  React.useEffect(() => {
    setKbdIndex(-1);
  }, [searchQuery, selectedCategory, showOnlyFavorites]);

  // Keyboard navigation listener (ArrowUp, ArrowDown, Enter)
  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isTypingInChat = activeElement && (
        activeElement.tagName === 'TEXTAREA' || 
        (activeElement as HTMLElement).isContentEditable
      );

      // Only allow shortcuts if the user isn't typing in an external text block (like requests modal)
      if (isTypingInChat) return;

      const isInput = activeElement && activeElement.tagName === 'INPUT';

      // Press "/" to focus search bar
      if (e.key === '/' && !isInput) {
        e.preventDefault();
        const searchInput = document.getElementById('song-search');
        if (searchInput) {
          searchInput.focus();
          (searchInput as HTMLInputElement).select();
        }
        return;
      }

      // Press Escape to blur search
      if (e.key === 'Escape' && isInput) {
        (activeElement as HTMLElement).blur();
        return;
      }

      // Keyboard arrow navigation
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setKbdIndex(prev => {
          const next = prev + 1;
          return next < paginatedSongs.length ? next : prev;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setKbdIndex(prev => {
          const next = prev - 1;
          return next >= 0 ? next : prev;
        });
      } else if (e.key === 'Enter') {
        if (kbdIndex >= 0 && kbdIndex < paginatedSongs.length) {
          e.preventDefault();
          if (isInput) {
            (activeElement as HTMLElement).blur();
          }
          onSelectSong(paginatedSongs[kbdIndex].id);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [paginatedSongs, kbdIndex, onSelectSong]);

  // Automatically scroll the keyboard highlighted item into view if it moves off-screen
  React.useEffect(() => {
    if (kbdIndex >= 0 && paginatedSongs[kbdIndex]) {
      const songId = paginatedSongs[kbdIndex].id;
      const activeEl = document.getElementById(`song-row-${songId}`) || 
                       document.getElementById(`song-card-${songId}`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [kbdIndex, paginatedSongs]);  // Color-coded category badge styles
  const getCategoryStyle = (category?: string): string => {
    switch ((category || '').toLowerCase()) {
      case 'worship': return 'bg-amber-500/10 border-amber-500/20 text-amber-450';
      case 'gospel': return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
      case 'christmas': return 'bg-sky-500/10 border-sky-500/20 text-sky-400';
      case 'classic': return 'bg-rose-500/10 border-rose-500/20 text-rose-400';
      case 'praise & thanksgiving': return 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400';
      default: return 'bg-zinc-800/40 border-zinc-800/60 text-zinc-400';
    }
  };

  // Two-step delete handler
  const handleDeleteClick = (songId: string) => {
    if (pendingDeleteId === songId) {
      onDeleteSong(songId);
      setPendingDeleteId(null);
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    } else {
      setPendingDeleteId(songId);
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = window.setTimeout(() => setPendingDeleteId(null), 3000);
    }
  };

  return (
    <div id="song-list-module" className="flex flex-col space-y-3.5 text-zinc-300">
      
      {/* ── CLEAN SEARCH BAR ── */}
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800/80 p-4 shadow-lg relative overflow-hidden">
        
        {/* Search input row */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
            <input
              id="song-search"
              type="text"
              autoComplete="off"
              className="w-full pl-11 pr-10 py-3 text-sm rounded-xl border border-zinc-800/80 bg-zinc-950/60 text-white placeholder-zinc-500 outline-none focus:border-amber-500 focus:bg-zinc-950 transition-all"
              placeholder="Search songs, lyrics, Tamil or English…"
              value={tempSearch}
              onChange={(e) => setTempSearch(e.target.value)}
            />
            {tempSearch.length > 0 && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-zinc-500 hover:text-zinc-200 transition-colors active-touch"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter toggle button */}
          <button
            onClick={() => setShowFilters(f => !f)}
            title="Filters"
            className={`shrink-0 p-3 rounded-xl border transition-all cursor-pointer active-touch ${
              showFilters || selectedCategory !== 'All' || showOnlyFavorites
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-zinc-950 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>

          {/* Admin: import button */}
          {currentRole === 'admin' && (
            <button
              onClick={onOpenUploadModal}
              className="shrink-0 cursor-pointer bg-amber-550/10 hover:bg-amber-550/20 border border-amber-555/20 active:scale-95 text-amber-400 p-3 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
              title="Import Lyrics File"
            >
              <PlusCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Import</span>
            </button>
          )}
        </div>

        {/* Result count + guest badge */}
        <div className="flex items-center justify-between mt-2.5 px-1 font-sans">
          <span className="text-xs text-zinc-500 font-medium">
            {searchQuery.trim() ? (
              <>
                <strong className="text-zinc-300 font-semibold">{filteredSongs.length}</strong>
                {filteredSongs.length === 1 ? ' song found' : ' songs found'}
                {isPartialMatch && <span className="text-amber-500/70 ml-1">(best matches)</span>}
              </>
            ) : (
              <><strong className="text-zinc-300 font-semibold">{songs.length}</strong> songs in library</>
            )}
          </span>
          {currentRole === 'guest' && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
              <BookOpen className="h-3 w-3 text-amber-500/80" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-500/80">Browse Mode</span>
            </span>
          )}
        </div>

        {/* Collapsible Filters Panel */}
        {showFilters && (
          <div className="mt-3.5 pt-3.5 border-t border-zinc-800/50 space-y-3.5 animate-in fade-in slide-in-from-top-2 duration-200">

            {/* Category pills */}
            <div className="flex flex-col space-y-1.5">
              <span className="text-xs font-semibold text-zinc-550 pl-0.5">Category</span>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => { setSelectedCategory(cat); setVisibleCount(20); }}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-full border transition-all shrink-0 cursor-pointer select-none active-touch ${
                      selectedCategory === cat
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 font-semibold shadow-sm'
                        : 'bg-zinc-950 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                    }`}
                  >
                    {cat === 'All' ? 'All Songs' : cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort + Favorites row (hidden for guests) */}
            {currentRole !== 'guest' && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-zinc-550 shrink-0">Sort By</span>
                  <select
                    value={sortBy}
                    onChange={e => { setSortBy(e.target.value as typeof sortBy); setVisibleCount(20); }}
                    className="bg-zinc-950 border border-zinc-800/80 text-zinc-300 text-xs font-medium px-3 py-1.5 rounded-xl outline-none focus:border-amber-500/80 cursor-pointer"
                  >
                    <option value="title-asc">Title A → Z</option>
                    <option value="title-desc">Title Z → A</option>
                    <option value="author-asc">Author A → Z</option>
                    <option value="author-desc">Author Z → A</option>
                    <option value="category-asc">Category A → Z</option>
                    <option value="category-desc">Category Z → A</option>
                    <option value="lyrics-asc">Lyrics A → Z</option>
                    <option value="lyrics-desc">Lyrics Z → A</option>
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="bpm-asc">BPM Low → High</option>
                    <option value="bpm-desc">BPM High → Low</option>
                  </select>
                </div>
                <button
                  onClick={() => { setShowOnlyFavorites(!showOnlyFavorites); setVisibleCount(20); }}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-full border transition-all cursor-pointer select-none ${
                    showOnlyFavorites
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 font-semibold'
                      : 'bg-zinc-950 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  <Star className={`h-3.5 w-3.5 ${showOnlyFavorites ? 'fill-amber-500 text-amber-500' : ''}`} />
                  Favorites Only
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Song Grid / Lists layout */}
      <div className="bg-zinc-900 border border-zinc-800/80 overflow-hidden shadow-lg rounded-2xl">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-950/60 border-b border-zinc-900/60">
                <th className="p-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-14 text-center">Fav</th>
                <th className="p-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">Song Title</th>
                <th className="p-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 hidden lg:table-cell">Author</th>
                <th className="p-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">Category</th>
                {currentRole === 'admin' && (
                  <th className="p-3.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 w-28 text-center">Delete</th>
                )}
              </tr>
            </thead>
            <tbody>
              {paginatedSongs.length > 0 ? (
                paginatedSongs.map((song, index) => {
                  const isSelected = selectedSongId === song.id;
                  const matchingLine = searchQuery.trim() ? findMatchingLyricLine(song, searchQuery) : undefined;
                  return (
                    <tr
                      key={song.id}
                      id={`song-row-${song.id}`}
                      onClick={() => onSelectSong(song.id)}
                      className={`group border-b border-zinc-850/30 hover:bg-zinc-900/40 cursor-pointer transition-all ${
                        isSelected 
                          ? 'bg-amber-550/[0.02] text-white border-b border-amber-550/20' 
                          : kbdIndex === index 
                            ? 'bg-zinc-800/20 text-white border-b border-zinc-800'
                            : 'text-zinc-300'
                      }`}
                    >
                      {/* Favorite Toggle button cells */}
                      <td className="p-3 text-center" onClick={(e) => { e.stopPropagation(); onToggleFavorite(song.id, !!song.favorite); }}>
                        <button className="text-amber-500 hover:text-amber-400 transition-colors cursor-pointer p-1">
                          {song.favorite ? (
                            <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                          ) : (
                            <Star className="h-4 w-4 text-zinc-700 group-hover:scale-105 transition-transform hover:text-zinc-500 hover:fill-zinc-500/20" />
                          )}
                        </button>
                      </td>
                      
                      {/* Title block with music symbol */}
                      <td className="p-4 text-xs font-semibold">
                        <div className="flex items-center gap-3">
                          {isSelected ? (
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b]" />
                          ) : (
                            <div className="w-1.5 h-1.5 rounded-full bg-transparent" />
                          )}
                          <Music className={`h-3.5 w-3.5 ${isSelected ? 'text-amber-500' : 'text-zinc-600'}`} />
                          <div className="flex flex-col text-left">
                            <span className={`${isSelected ? 'text-amber-500 font-bold' : 'text-zinc-200 group-hover:text-amber-450'}`}>
                              <HighlightText text={song.title} query={searchQuery} />
                            </span>
                            {matchingLine && (
                              <div className="text-[10px] text-zinc-500 font-sans italic mt-1 font-medium max-w-md truncate">
                                &ldquo;... <HighlightText text={matchingLine} query={searchQuery} /> ...&rdquo;
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Author column (lg+) */}
                      <td className="p-4 text-xs text-zinc-500 hidden lg:table-cell font-sans font-medium">
                        <HighlightText text={song.author || 'Traditional'} query={searchQuery} />
                      </td>

                      {/* Category column */}
                      <td className="p-4">
                        {song.category && (
                          <span className={`text-[9px] font-semibold uppercase px-2 py-0.5 rounded border ${getCategoryStyle(song.category)}`}>
                            {song.category}
                          </span>
                        )}
                      </td>

                      {/* Delete actions — two-step confirm */}
                      {currentRole === 'admin' && (
                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleDeleteClick(song.id)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-sans transition-all cursor-pointer active:scale-95 ${
                              pendingDeleteId === song.id
                                ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                                : 'text-zinc-600 hover:text-red-400 hover:bg-zinc-950 border border-transparent'
                            }`}
                            title={pendingDeleteId === song.id ? 'Click again to confirm delete' : 'Delete song'}
                          >
                            {pendingDeleteId === song.id ? 'Confirm?' : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={currentRole === 'admin' ? 5 : 4} className="text-center py-16 px-4 bg-zinc-950/20">
                    <Layers className="h-9 w-9 text-zinc-800 mx-auto mb-2.5" />
                    <p className="font-semibold text-zinc-500 text-xs font-sans tracking-wide">No Songs Found</p>
                    {searchQuery.trim() ? (
                      <p className="text-[10px] text-zinc-650 mt-1.5 max-w-xs mx-auto leading-relaxed">
                        No match for <span className="text-amber-500/80 font-semibold">&quot;{searchQuery}&quot;</span>.<br />
                        Try the first few words of the Tamil lyrics in English spelling.
                      </p>
                    ) : (
                      <p className="text-[10px] text-zinc-600 mt-1 uppercase font-mono">
                        Adjust your filters or add a song to begin.
                      </p>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="block md:hidden bg-zinc-950/10 py-2.5 space-y-2">
          {paginatedSongs.length > 0 ? (
            paginatedSongs.map((song, index) => {
              const isSelected = selectedSongId === song.id;
              const matchingLine = searchQuery.trim() ? findMatchingLyricLine(song, searchQuery) : undefined;
              return (
                <div
                  key={song.id}
                  id={`song-card-${song.id}`}
                  onClick={() => onSelectSong(song.id)}
                  className={`mobile-row mx-3 px-4 py-3 flex items-center justify-between gap-3 cursor-pointer rounded-2xl border transition-all duration-150 active-touch select-none ${
                    isSelected
                      ? 'bg-amber-550/[0.02] border-amber-550/30 shadow-md shadow-amber-500/[0.02]'
                      : kbdIndex === index
                        ? 'bg-zinc-900 border-amber-550/20'
                        : 'bg-zinc-900/60 border-zinc-850/80'
                  }`}
                >
                  {/* Left: indicator dot */}
                  {isSelected ? (
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b] shrink-0" />
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-800 shrink-0" />
                  )}

                  {/* Center: song info */}
                  <div className="flex-1 truncate text-left min-w-0">
                    <div className={`text-sm font-semibold truncate leading-snug ${isSelected ? 'text-amber-500 font-bold' : 'text-zinc-200'}`}>
                      <HighlightText text={song.title} query={searchQuery} />
                    </div>
                    {matchingLine && (
                      <div className="text-[10px] text-zinc-550 font-sans italic mt-1.5 truncate">
                        &ldquo;... <HighlightText text={matchingLine} query={searchQuery} /> ...&rdquo;
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="text-[10px] font-medium text-zinc-500 truncate max-w-[130px] font-sans">
                        <HighlightText text={song.author || 'Traditional'} query={searchQuery} />
                      </span>
                      {song.category && (
                        <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded border ${getCategoryStyle(song.category)}`}>{song.category}</span>
                      )}
                      {song.bpm && (
                        <span className="text-[9px] font-medium text-zinc-500 bg-zinc-800/40 px-1.5 py-0.5 rounded border border-zinc-800/50">{song.bpm} bpm</span>
                      )}
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onToggleFavorite(song.id, !!song.favorite)}
                      className="p-2.5 text-zinc-650 hover:text-amber-550 transition-colors cursor-pointer active-touch rounded-xl"
                      title="Toggle Favorite"
                    >
                      {song.favorite ? (
                        <Star className="h-5 w-5 fill-amber-500 text-amber-500" />
                      ) : (
                        <Star className="h-5 w-5 text-zinc-700" />
                      )}
                    </button>
                    {currentRole === 'admin' && (
                      <button
                        onClick={() => handleDeleteClick(song.id)}
                        className={`p-2.5 transition-colors cursor-pointer active-touch rounded-xl ${
                          pendingDeleteId === song.id
                            ? 'text-red-400 bg-red-500/10'
                            : 'text-zinc-755 hover:text-red-400'
                        }`}
                        title={pendingDeleteId === song.id ? 'Tap again to confirm' : 'Delete Song'}
                      >
                        {pendingDeleteId === song.id ? (
                          <span className="text-[10px] font-bold font-sans">Del?</span>
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    {!isSelected && (
                      <ChevronRight className="h-4 w-4 text-zinc-700 ml-0.5 shrink-0" />
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-16 px-4">
              <Layers className="h-9 w-9 text-zinc-800 mx-auto mb-2.5" />
              <p className="font-semibold text-zinc-500 text-xs font-sans tracking-wide">No Songs Found</p>
              {searchQuery.trim() ? (
                <p className="text-[10px] text-zinc-650 mt-1.5 max-w-[260px] mx-auto leading-relaxed font-sans">
                  No match for <span className="text-amber-500/80 font-semibold">&quot;{searchQuery}&quot;</span>.<br />
                  Try the first few words of the lyrics in English spelling.
                </p>
              ) : (
                <p className="text-[10px] text-zinc-650 mt-1.5 font-sans">
                  Adjust filters or import lyrics to begin.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Dynamic Infinite Scroll Load-More Trigger Strip */}
        <div id="lyrics-paginator" className="p-3.5 border-t border-zinc-800/60 bg-zinc-950/40 flex flex-col sm:flex-row items-center justify-between gap-3 font-sans">
          <div className="text-xs text-zinc-500 font-medium text-center sm:text-left">
            Showing <strong className="text-zinc-350 font-semibold">{paginatedSongs.length}</strong> of <strong className="text-zinc-350 font-semibold">{filteredSongs.length}</strong> songs
          </div>

          {visibleCount < filteredSongs.length && (
            <button
              onClick={() => setVisibleCount(prev => prev + 20)}
              className="w-full sm:w-auto px-5 py-2.5 bg-amber-550/15 hover:bg-amber-550/25 border border-amber-550/20 text-amber-400 text-xs font-semibold tracking-wider rounded-xl transition-all cursor-pointer active:scale-95 active-touch uppercase"
            >
              Load More Songs
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default React.memo(SongList);
