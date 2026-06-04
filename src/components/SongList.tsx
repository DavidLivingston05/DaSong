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

  // Debounce: 40ms for Holyrics-style instant feedback
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setSearchQuery(tempSearch);
      setVisibleCount(20);
    }, 40);
    return () => clearTimeout(handler);
  }, [tempSearch]);

  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState<boolean>(false);
  const [visibleCount, setVisibleCount] = useState<number>(20);
  const [kbdIndex, setKbdIndex] = useState<number>(-1);
  const [sortBy, setSortBy] = useState<'title-asc' | 'title-desc' | 'newest' | 'oldest' | 'bpm-asc' | 'bpm-desc'>('title-asc');
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
    // Sort: relevance when searching, otherwise user-selected sort
    return [...result].sort((a, b) => {
      if (searchQuery.trim()) {
        const scoreA = getSearchRelevanceScore(a, searchQuery);
        const scoreB = getSearchRelevanceScore(b, searchQuery);
        if (scoreA !== scoreB) return scoreB - scoreA;
      }
      switch (sortBy) {
        case 'title-asc': return a.title.localeCompare(b.title);
        case 'title-desc': return b.title.localeCompare(a.title);
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
  }, [kbdIndex, paginatedSongs]);

  // Color-coded category badge styles
  const getCategoryStyle = (category?: string): string => {
    switch ((category || '').toLowerCase()) {
      case 'worship': return 'bg-amber-500/10 border-amber-500/20 text-amber-500';
      case 'gospel': return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
      case 'christmas': return 'bg-blue-400/10 border-blue-400/20 text-blue-400';
      case 'classic': return 'bg-rose-500/10 border-rose-500/20 text-rose-400';
      case 'praise & thanksgiving': return 'bg-violet-500/10 border-violet-500/20 text-violet-400';
      default: return 'bg-zinc-700/30 border-zinc-600/30 text-zinc-400';
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
    <div id="song-list-module" className="flex flex-col space-y-3 text-zinc-300">
      
      {/* ── CLEAN SEARCH BAR ── */}
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800/80 p-4 shadow-[0_4px_30px_rgba(0,0,0,0.4)] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />

        {/* Search input row */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
            <input
              id="song-search"
              type="text"
              autoComplete="off"
              className="w-full pl-11 pr-10 py-3.5 text-[16px] md:text-sm rounded-xl border border-zinc-800 bg-zinc-950 text-white placeholder-zinc-600 outline-none focus:border-amber-500 transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]"
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
                : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>

          {/* Admin: import button */}
          {currentRole === 'admin' && (
            <button
              onClick={onOpenUploadModal}
              className="shrink-0 cursor-pointer bg-amber-500 hover:bg-amber-400 active:scale-95 text-black p-3 rounded-xl text-[10px] font-mono font-extrabold transition-all flex items-center gap-1.5 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
              title="Import Lyrics File"
            >
              <PlusCircle className="h-4 w-4 stroke-[3]" />
              <span className="hidden sm:inline">Import</span>
            </button>
          )}
        </div>

        {/* Result count + guest badge */}
        <div className="flex items-center justify-between mt-2 px-1">
          <span className="text-[11px] text-zinc-500 font-mono">
            {searchQuery.trim() ? (
              <>
                <strong className="text-zinc-300">{filteredSongs.length}</strong>
                {filteredSongs.length === 1 ? ' song found' : ' songs found'}
                {isPartialMatch && <span className="text-amber-500/70 ml-1">(best matches)</span>}
              </>
            ) : (
              <><strong className="text-zinc-300">{songs.length}</strong> songs in library</>
            )}
          </span>
          {currentRole === 'guest' && (
            <span className="flex items-center gap-1.5">
              <BookOpen className="h-3 w-3 text-amber-500/70" />
              <span className="text-[10px] font-mono font-extrabold uppercase tracking-widest text-amber-500/70">Browse Mode</span>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
            </span>
          )}
        </div>

        {/* Collapsible Filters Panel */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-zinc-800/60 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">

            {/* Category pills */}
            <div className="flex flex-col space-y-1.5">
              <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 font-bold pl-0.5">Category</span>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => { setSelectedCategory(cat); setVisibleCount(20); }}
                    className={`px-3 py-1.5 text-[10px] uppercase font-mono tracking-wider font-extrabold rounded-xl border transition-all shrink-0 cursor-pointer select-none active-touch ${
                      selectedCategory === cat
                        ? 'bg-amber-500 border-amber-500 text-black shadow-[0_4px_12px_rgba(245,158,11,0.2)]'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
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
                  <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 font-bold shrink-0">Sort</span>
                  <select
                    value={sortBy}
                    onChange={e => { setSortBy(e.target.value as typeof sortBy); setVisibleCount(20); }}
                    className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-[10px] font-mono font-bold px-2 py-1.5 rounded-xl outline-none focus:border-amber-500 cursor-pointer"
                  >
                    <option value="title-asc">Title A → Z</option>
                    <option value="title-desc">Title Z → A</option>
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="bpm-asc">BPM Low → High</option>
                    <option value="bpm-desc">BPM High → Low</option>
                  </select>
                </div>
                <button
                  onClick={() => { setShowOnlyFavorites(!showOnlyFavorites); setVisibleCount(20); }}
                  className={`flex items-center gap-2 px-3 py-1.5 text-[10px] uppercase tracking-widest font-mono rounded-xl border transition-all cursor-pointer select-none ${
                    showOnlyFavorites
                      ? 'bg-zinc-950 border-amber-500 text-amber-500 font-black'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <Star className={`h-3 w-3 ${showOnlyFavorites ? 'fill-amber-500 text-amber-500' : ''}`} />
                  Favorites
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Song Grid / Lists layout */}
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800/80 overflow-hidden shadow-[0_10px_35px_rgba(0,0,0,0.5)]">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-950 border-b border-zinc-800/80">
                <th className="p-4 text-[10px] font-mono uppercase tracking-widest text-zinc-500 w-14 text-center font-bold">Fav</th>
                <th className="p-4 text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold">Song Title</th>
                <th className="p-4 text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold hidden lg:table-cell">Author</th>
                <th className="p-4 text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold">Category</th>
                {currentRole === 'admin' && (
                  <th className="p-4 text-[10px] font-mono uppercase tracking-widest text-zinc-500 w-28 text-center font-bold">Delete</th>
                )}
              </tr>
            </thead>
            <tbody>
              {paginatedSongs.length > 0 ? (
                paginatedSongs.map((song, index) => {
                  const isSelected = selectedSongId === song.id;
                  const matchingLine = searchQuery.trim() ? findMatchingLyricLine(song.lyricsSnippet, searchQuery) : undefined;
                  return (
                    <tr
                      key={song.id}
                      id={`song-row-${song.id}`}
                      onClick={() => onSelectSong(song.id)}
                      className={`group border-b border-zinc-850/60 hover:bg-zinc-800/35 cursor-pointer transition-all ${
                        isSelected 
                          ? 'bg-amber-500/5 text-white font-extrabold border-b border-amber-500/30 ring-1 ring-amber-500/25' 
                          : kbdIndex === index 
                            ? 'bg-zinc-800/50 text-white border-b border-zinc-700 shadow-sm ring-1 ring-amber-500/20'
                            : 'text-zinc-300'
                      }`}
                    >
                      {/* Favorite Toggle button cells */}
                      <td className="p-3 text-center" onClick={(e) => { e.stopPropagation(); onToggleFavorite(song.id, !!song.favorite); }}>
                        <button className="text-amber-550 hover:text-amber-400 transition-colors cursor-pointer p-1">
                          {song.favorite ? (
                            <Star className="h-4 w-4 fill-amber-500 text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                          ) : (
                            <Star className="h-4 w-4 text-zinc-700 group-hover:scale-110 transition-transform hover:text-zinc-500 hover:fill-zinc-500/20" />
                          )}
                        </button>
                      </td>
                      
                      {/* Title block with music symbol */}
                      <td className="p-4 text-xs font-semibold">
                        <div className="flex items-center gap-3">
                          {isSelected ? (
                            <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b]" />
                          ) : (
                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-800 text-zinc-550" />
                          )}
                          <Music className={`h-3.5 w-3.5 ${isSelected ? 'text-amber-500' : 'text-zinc-650'}`} />
                          <div className="flex flex-col text-left">
                            <span className={`${isSelected ? 'text-amber-500 font-black' : 'text-zinc-200 group-hover:text-amber-400/90'}`}>
                              <HighlightText text={song.title} query={searchQuery} />
                            </span>
                            {matchingLine && (
                              <div className="text-[10px] text-zinc-550 font-sans italic mt-1 font-normal max-w-md truncate">
                                &ldquo;... <HighlightText text={matchingLine} query={searchQuery} /> ...&rdquo;
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Author column (lg+) */}
                      <td className="p-4 text-xs text-zinc-500 hidden lg:table-cell font-mono">
                        <HighlightText text={song.author || 'Traditional'} query={searchQuery} />
                      </td>

                      {/* Category column */}
                      <td className="p-4">
                        {song.category && (
                          <span className={`text-[9px] font-extrabold uppercase font-mono px-2 py-0.5 rounded border ${getCategoryStyle(song.category)}`}>
                            {song.category}
                          </span>
                        )}
                      </td>

                      {/* Delete actions — two-step confirm */}
                      {currentRole === 'admin' && (
                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleDeleteClick(song.id)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono transition-all cursor-pointer active:scale-95 ${
                              pendingDeleteId === song.id
                                ? 'bg-red-500/15 border border-red-500/30 text-red-400'
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
                  <td colSpan={currentRole === 'admin' ? 5 : 4} className="text-center py-16 px-4 bg-zinc-950/40">
                    <Layers className="h-10 w-10 text-zinc-800 mx-auto mb-3" />
                    <p className="font-bold text-zinc-400 text-xs font-mono uppercase tracking-widest">No Songs Found</p>
                    {searchQuery.trim() ? (
                      <p className="text-[10px] text-zinc-500 mt-2 font-mono max-w-xs mx-auto leading-relaxed">
                        No match for <span className="text-amber-500/80 font-bold">&quot;{searchQuery}&quot;</span>.<br />
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

        <div className="block md:hidden bg-zinc-950/20 py-2 space-y-1">
          {paginatedSongs.length > 0 ? (
            paginatedSongs.map((song, index) => {
              const isSelected = selectedSongId === song.id;
              const matchingLine = searchQuery.trim() ? findMatchingLyricLine(song.lyricsSnippet, searchQuery) : undefined;
              return (
                <div
                  key={song.id}
                  id={`song-card-${song.id}`}
                  onClick={() => onSelectSong(song.id)}
                  className={`mobile-row mx-3 px-4 py-3 flex items-center justify-between gap-3 cursor-pointer rounded-2xl border transition-all duration-150 active-touch select-none ${
                    isSelected
                      ? 'bg-gradient-to-br from-zinc-900 to-amber-950/15 border-amber-500/50 shadow-[0_4px_20px_rgba(245,158,11,0.08)]'
                      : kbdIndex === index
                        ? 'bg-zinc-900/90 border-amber-500/40 shadow-sm'
                        : 'bg-gradient-to-br from-zinc-900/90 to-zinc-950/60 border-zinc-800/80'
                  }`}
                >
                  {/* Left: indicator dot */}
                  {isSelected ? (
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b] shrink-0" />
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-700 shrink-0" />
                  )}

                  {/* Center: song info */}
                  <div className="flex-1 truncate text-left min-w-0">
                    <div className={`text-[15px] font-bold truncate leading-snug ${isSelected ? 'text-amber-500 font-black' : 'text-zinc-100'}`}>
                      <HighlightText text={song.title} query={searchQuery} />
                    </div>
                    {matchingLine && (
                      <div className="text-[11px] text-zinc-500 font-sans italic mt-1 truncate">
                        &ldquo;... <HighlightText text={matchingLine} query={searchQuery} /> ...&rdquo;
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[11px] font-semibold text-zinc-400 truncate max-w-[130px] font-sans">
                        <HighlightText text={song.author || 'Traditional'} query={searchQuery} />
                      </span>
                      {song.category && (
                        <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded border font-mono ${getCategoryStyle(song.category)}`}>{song.category}</span>
                      )}
                      {song.bpm && (
                        <span className="text-[10px] font-bold text-zinc-500 bg-zinc-800/80 px-1.5 py-0.5 rounded font-mono">{song.bpm}bpm</span>
                      )}
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onToggleFavorite(song.id, !!song.favorite)}
                      className="p-3 text-zinc-600 hover:text-amber-500 transition-colors cursor-pointer active-touch rounded-xl"
                      title="Toggle Favorite"
                    >
                      {song.favorite ? (
                        <Star className="h-5 w-5 fill-amber-500 text-amber-500 drop-shadow-[0_0_6px_rgba(245,158,11,0.4)]" />
                      ) : (
                        <Star className="h-5 w-5 text-zinc-700" />
                      )}
                    </button>
                    {currentRole === 'admin' && (
                      <button
                        onClick={() => handleDeleteClick(song.id)}
                        className={`p-3 transition-colors cursor-pointer active-touch rounded-xl ${
                          pendingDeleteId === song.id
                            ? 'text-red-400 bg-red-500/10'
                            : 'text-zinc-700 hover:text-red-400'
                        }`}
                        title={pendingDeleteId === song.id ? 'Tap again to confirm' : 'Delete Song'}
                      >
                        {pendingDeleteId === song.id ? (
                          <span className="text-[10px] font-bold font-mono">Del?</span>
                        ) : (
                          <Trash2 className="h-4.5 w-4.5" />
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
              <Layers className="h-10 w-10 text-zinc-800 mx-auto mb-3" />
              <p className="font-bold text-zinc-400 text-xs font-mono uppercase tracking-widest">No Songs Found</p>
              {searchQuery.trim() ? (
                <p className="text-[11px] text-zinc-500 mt-2 font-mono max-w-[260px] mx-auto leading-relaxed">
                  No match for <span className="text-amber-500/80 font-bold">&quot;{searchQuery}&quot;</span>.<br />
                  Try the first few words of the lyrics in English spelling.
                </p>
              ) : (
                <p className="text-[10px] text-zinc-600 mt-1 uppercase font-mono">
                  Adjust filters or import lyrics to begin.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Dynamic Infinite Scroll Load-More Trigger Strip */}
        <div id="lyrics-paginator" className="p-4 border-t border-zinc-800/80 bg-zinc-950 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider text-center sm:text-left">
            Showing <strong className="text-zinc-300 font-bold">{paginatedSongs.length}</strong> of <strong className="text-zinc-300 font-bold">{filteredSongs.length}</strong> songs
          </div>

          {visibleCount < filteredSongs.length && (
            <button
              onClick={() => setVisibleCount(prev => prev + 20)}
              className="w-full sm:w-auto px-6 py-2 bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-black tracking-widest rounded-xl transition-all cursor-pointer shadow-md shadow-amber-500/10 active:scale-95 active-touch uppercase"
            >
              LOAD MORE SONGS
            </button>
          )}
        </div>
      </div>



    </div>
  );
}

export default React.memo(SongList);
