import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Music, Star, Trash2, Layers, ChevronRight, Search, Plus, Database, BookOpen, Sparkles, Key, Tag } from 'lucide-react';
import { SongMetadata } from '../lib/db';
import { UserRole } from '../types';
import { matchSong, getSearchRelevanceScore, findMatchingLyricLine } from '../lib/search';
import { getRecommendedSongs, RecommendedSongItem } from '../lib/recommendations';
import HighlightText from './HighlightText';

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
  currentRole
}: SongListProps) {
  const [visibleCount, setVisibleCount] = useState<number>(50);
  const [inputValue, setInputValue] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState<boolean>(false);
  const [kbdIndex, setKbdIndex] = useState<number>(-1);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [showRecommendations, setShowRecommendations] = useState<boolean>(true);
  
  const deleteTimerRef = useRef<number | null>(null);
  const observerTarget = useRef<HTMLDivElement | null>(null);

  // Debounce search query update cleanly
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(inputValue);
      setVisibleCount(50);
    }, 100);
    return () => clearTimeout(timer);
  }, [inputValue]);

  // Currently selected song object
  const selectedSong = useMemo(() => {
    return songs.find(s => s.id === selectedSongId) || null;
  }, [songs, selectedSongId]);

  // Compute smart recommendations for selected song OR current search query
  const smartRecommendations = useMemo<RecommendedSongItem[]>(() => {
    if (!showRecommendations) return [];
    const target = selectedSong || searchQuery.trim();
    if (!target) {
      // Default top recommendations when no search/selection
      return getRecommendedSongs(songs[0] || '', songs, 6);
    }
    return getRecommendedSongs(target, songs, 6);
  }, [showRecommendations, selectedSong, searchQuery, songs]);

  // Improvised search matching & relevance-based scoring
  const sortedSongs = useMemo(() => {
    let filtered = songs;
    if (showFavoritesOnly) {
      filtered = filtered.filter(s => !!s.favorite);
    }

    const q = searchQuery.trim();
    if (!q) {
      // Alphabetical sort when no search query
      return [...filtered].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }

    // Filter using matchSong (Tanglish/Tamil phonetic tolerant & multi-word forgiving)
    const matches = filtered.filter(s => matchSong(s, q));

    // Pre-calculate relevance scores in single O(N) linear pass for sub-millisecond sorting
    const scoredMatches = matches.map(s => ({ song: s, score: getSearchRelevanceScore(s, q) }));
    scoredMatches.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return (a.song.title || '').localeCompare(b.song.title || '');
    });
    return scoredMatches.map(sm => sm.song);
  }, [songs, searchQuery, showFavoritesOnly]);

  // Slice list up to visible count for performance
  const paginatedSongs = useMemo(() => {
    return sortedSongs.slice(0, visibleCount);
  }, [sortedSongs, visibleCount]);

  // Infinite Scroll Intersection Observer to automatically load more songs when scrolling near the bottom
  useEffect(() => {
    const currentTarget = observerTarget.current;
    if (!currentTarget || visibleCount >= sortedSongs.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => Math.min(prev + 50, sortedSongs.length));
        }
      },
      { threshold: 0.1, rootMargin: '150px' }
    );

    observer.observe(currentTarget);
    return () => {
      observer.unobserve(currentTarget);
    };
  }, [sortedSongs.length, visibleCount]);

  // Reset keyboard selection when songs change
  React.useEffect(() => {
    setKbdIndex(-1);
  }, [songs]);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Keyboard navigation listener (ArrowUp, ArrowDown, Enter, '/')
  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isTypingInChat = activeElement && (
        activeElement.tagName === 'TEXTAREA' || 
        activeElement.tagName === 'INPUT' ||
        (activeElement as HTMLElement).isContentEditable
      );

      if (e.key === '/' && !isTypingInChat) {
        e.preventDefault();
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
        return;
      }

      if (isTypingInChat) return;

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
          onSelectSong(paginatedSongs[kbdIndex].id);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [paginatedSongs, kbdIndex, onSelectSong]);

  // Automatically scroll the keyboard highlighted item into view
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
    <div id="song-list-module" className="flex flex-col space-y-6 text-zinc-300">
      
      {/* Page Title & Actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-zinc-900/20 select-none">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <BookOpen className="h-5.5 w-5.5 text-amber-550" aria-hidden={true} /> Song Library
          </h2>
          <p className="text-xs text-zinc-500 mt-1">Browse, filter, and discover songs with smart recommendations & phonetics.</p>
        </div>
        {(currentRole === 'admin' || currentRole === 'guest') && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={onOpenAddModal}
              className="premium-btn-primary font-bold px-4 py-2 rounded text-xs transition-all flex items-center gap-1.5 h-10 cursor-pointer active-touch"
            >
              <Plus className="h-4 w-4 text-black stroke-[3]" aria-hidden={true} /> Create Song
            </button>
            <button
              onClick={onOpenUploadModal}
              className="premium-btn-secondary font-bold px-4 py-2 rounded text-xs transition-all h-10 cursor-pointer flex items-center gap-1.5 active-touch"
            >
              <Database className="h-4 w-4 text-amber-500" aria-hidden={true} /> Import Files
            </button>
          </div>
        )}
      </div>

      {/* Search Input Toolbar with Instant Dropdown Menu */}
      <div className="flex flex-col gap-2 w-full">
        <div className="flex flex-col sm:flex-row gap-2 w-full">
          <div className="relative group flex-1">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
              <Search className="h-4 w-4 text-zinc-500 transition-colors group-focus-within:text-amber-500" aria-hidden={true} />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Type song title or lyrics ('aaradhani', 'neere'). Press '/' to focus..."
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
              }}
              className="block w-full pl-11 pr-16 py-3 bg-zinc-950/40 text-zinc-250 placeholder-zinc-550 focus:outline-none text-sm transition-all premium-input rounded"
              aria-label="Search songs by title, author, or lyrics snippets"
            />
            {inputValue ? (
              <button
                onClick={() => {
                  setInputValue('');
                }}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-zinc-500 hover:text-white z-10"
              >
                Clear
              </button>
            ) : (
              <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-[10px] font-mono font-bold text-zinc-600 bg-zinc-900/60 px-1.5 py-0.5 rounded my-auto h-5 border border-zinc-800 z-10">
                /
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={`px-4 py-3 rounded text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 border ${
                showFavoritesOnly 
                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]' 
                  : 'premium-btn-secondary border-[#1E202B] text-zinc-400 hover:text-white'
              }`}
              title={showFavoritesOnly ? "Showing Favorites Only" : "Show Favorites Only"}
              aria-label={showFavoritesOnly ? "Showing favorites only" : "Show favorites only"}
            >
              <Star className={`h-4 w-4 ${showFavoritesOnly ? 'fill-amber-500 text-amber-500' : ''}`} aria-hidden={true} />
              <span className="hidden sm:inline">Favorites</span>
            </button>
          </div>
        </div>
      </div>

      {/* Song Grid / Lists layout */}
      <div className="bg-[#12131A] border border-[#1E202B] overflow-hidden rounded-md">
        
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-950/80 border-b border-zinc-900/35 select-none">
                <th className="p-4 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 w-14 text-center">Fav</th>
                <th className="p-4 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">Song Title & Lyrics Preview</th>
                <th className="p-4 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 w-28 text-center">Category</th>
                {currentRole === 'admin' && (
                  <th className="p-4 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 w-28 text-center">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {paginatedSongs.length > 0 ? (
                paginatedSongs.map((song, index) => {
                  const isSelected = selectedSongId === song.id;
                  const matchingSnippetLine = searchQuery.trim() ? findMatchingLyricLine(song, searchQuery) : undefined;

                  return (
                    <tr
                      key={song.id}
                      id={`song-row-${song.id}`}
                      onClick={() => onSelectSong(song.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectSong(song.id); }}
                      className={`group border-b border-zinc-900/15 cursor-pointer transition-all duration-200 ${
                        isSelected 
                          ? 'bg-amber-500/[0.03] text-white shadow-[inset_4px_0_0_0_#f59e0b]' 
                          : kbdIndex === index 
                            ? 'bg-zinc-900/50 text-white'
                            : 'text-zinc-300 hover:bg-zinc-900/20 hover:text-white'
                      }`}
                    >
                      {/* Favorite Toggle button cells */}
                      <td className="p-4 text-center" onClick={(e) => { e.stopPropagation(); onToggleFavorite(song.id, !!song.favorite); }}>
                        <button className="text-amber-500 hover:text-amber-400 transition-all cursor-pointer p-1" aria-label="Toggle favorite">
                          {song.favorite ? (
                            <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                          ) : (
                            <Star className="h-4 w-4 text-zinc-700 hover:text-zinc-400 transition-colors" />
                          )}
                        </button>
                      </td>
                      
                      {/* Title block with music symbol & highlighted lyric preview */}
                      <td className="p-4 text-xs font-semibold">
                        <div className="flex items-start gap-3">
                          <Music className={`h-4 w-4 shrink-0 mt-0.5 transition-transform group-hover:scale-110 ${isSelected ? 'text-amber-500' : 'text-zinc-650'}`} aria-hidden={true} />
                          <div className="flex flex-col text-left min-w-0">
                            <span className={`text-[13px] font-bold tracking-tight transition-colors ${isSelected ? 'text-amber-555' : 'text-zinc-200 group-hover:text-amber-400'}`}>
                              <HighlightText text={song.title} query={searchQuery} />
                            </span>
                            {song.author && (
                              <span className="text-[11px] text-zinc-500 font-normal mt-0.5">
                                by <HighlightText text={song.author} query={searchQuery} />
                              </span>
                            )}
                            {matchingSnippetLine && (
                              <div className="mt-1.5 text-[11px] font-mono text-zinc-400 bg-zinc-950/70 border border-zinc-900/80 px-2 py-1 rounded inline-block max-w-xl truncate">
                                "<HighlightText text={matchingSnippetLine} query={searchQuery} />"
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Category Column */}
                      <td className="p-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {song.category ? (
                            <span className="text-[10px] font-sans text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-850">
                              {song.category}
                            </span>
                          ) : (
                            <span className="text-zinc-700 text-xs">-</span>
                          )}
                        </div>
                      </td>

                      {/* Delete actions — two-step confirm */}
                      {currentRole === 'admin' && (
                        <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleDeleteClick(song.id)}
                            className={`px-3 py-1.5 rounded text-[10px] font-bold font-mono transition-all cursor-pointer active:scale-95 ${
                              pendingDeleteId === song.id
                                ? 'bg-red-500/15 text-red-400'
                                : 'text-zinc-650 hover:text-red-400 hover:bg-red-950/20'
                            }`}
                            title={pendingDeleteId === song.id ? 'Click again to confirm delete' : 'Delete song'}
                            aria-label="Delete song"
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
                  <td colSpan={currentRole === 'admin' ? 4 : 3} className="text-center py-16 px-6 bg-zinc-950/40 select-none">
                    <div className="max-w-md mx-auto flex flex-col items-center justify-center">
                      <div className="p-4 bg-zinc-900/40 rounded-full mb-4">
                        <Layers className="h-8 w-8 text-zinc-650" aria-hidden={true} />
                      </div>
                      <p className="font-bold text-white text-xs font-mono tracking-widest uppercase">No Exact Matches Found</p>
                      <p className="text-[11px] text-zinc-500 mt-2 font-sans max-w-xs leading-relaxed">
                        We couldn't find any songs matching "{searchQuery}". Check recommendations above or create a new track.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Grid View */}
        <div className="block md:hidden bg-zinc-950/10 py-3 space-y-3">
          {paginatedSongs.length > 0 ? (
            paginatedSongs.map((song, index) => {
              const isSelected = selectedSongId === song.id;
              const matchingSnippetLine = searchQuery.trim() ? findMatchingLyricLine(song, searchQuery) : undefined;

              return (
                <div
                  key={song.id}
                  id={`song-card-${song.id}`}
                  onClick={() => onSelectSong(song.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectSong(song.id); }}
                  className={`mobile-row mx-3.5 px-4 py-3.5 flex flex-col gap-2 cursor-pointer rounded-md transition-all duration-200 active-touch select-none ${
                    isSelected
                      ? 'bg-amber-500/[0.03] border border-amber-500/20'
                      : kbdIndex === index
                        ? 'bg-zinc-900/60'
                        : 'premium-glass-card'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 w-full">
                    {/* Left: indicator dot & title */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSelected ? 'bg-amber-500' : 'bg-zinc-800'}`} />
                      <div className="flex flex-col min-w-0">
                        <div className={`text-sm font-bold truncate leading-snug ${isSelected ? 'text-amber-550' : 'text-zinc-200'}`}>
                          <HighlightText text={song.title} query={searchQuery} />
                        </div>
                        {song.author && (
                          <span className="text-[10px] text-zinc-500 truncate">
                            <HighlightText text={song.author} query={searchQuery} />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: favorite button */}
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onToggleFavorite(song.id, !!song.favorite)}
                        className="p-2 text-zinc-650 hover:text-amber-550 transition-all cursor-pointer active-touch rounded"
                        title="Toggle Favorite"
                        aria-label="Toggle favorite"
                      >
                        {song.favorite ? (
                          <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                        ) : (
                          <Star className="h-4 w-4 text-zinc-700" />
                        )}
                      </button>
                      {currentRole === 'admin' && (
                        <button
                          onClick={() => handleDeleteClick(song.id)}
                          className={`p-2 transition-colors cursor-pointer active-touch rounded ${
                            pendingDeleteId === song.id
                              ? 'text-red-400 bg-red-500/10'
                              : 'text-zinc-700 hover:text-red-400'
                          }`}
                          title={pendingDeleteId === song.id ? 'Tap again to confirm' : 'Delete Song'}
                          aria-label="Delete song"
                        >
                          {pendingDeleteId === song.id ? (
                            <span className="text-[10px] font-bold font-sans">Del?</span>
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Matching Lyric Line snippet on Mobile */}
                  {matchingSnippetLine && (
                    <div className="text-[11px] font-mono text-zinc-400 bg-zinc-950/80 border border-zinc-900 px-2 py-1 rounded truncate w-full">
                      "<HighlightText text={matchingSnippetLine} query={searchQuery} />"
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-12 px-6 bg-zinc-950/20 select-none">
              <div className="max-w-md mx-auto flex flex-col items-center justify-center">
                <div className="p-4 bg-zinc-900/40 border border-zinc-850 rounded-full mb-4">
                  <Layers className="h-8 w-8 text-zinc-650" aria-hidden={true} />
                </div>
                <p className="font-bold text-white text-xs font-mono tracking-widest uppercase">No Matches Found</p>
                <p className="text-[11px] text-zinc-500 mt-2 font-sans max-w-xs leading-relaxed">
                  No exact matches found for "{searchQuery}". See recommendations above!
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Dynamic Infinite Scroll Load-More Trigger Strip */}
        <div ref={observerTarget} id="lyrics-paginator" className="p-4 border-t border-zinc-900/60 bg-zinc-950/60 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono select-none">
          <div className="text-[11px] text-zinc-500 uppercase tracking-wider">
            Showing <strong className="text-zinc-400">{paginatedSongs.length}</strong> of <strong className="text-zinc-400">{sortedSongs.length}</strong> songs
          </div>

          {visibleCount < sortedSongs.length && (
            <button
              onClick={() => setVisibleCount(prev => prev + 50)}
              className="w-full sm:w-auto px-5 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-550/20 text-amber-400 text-[10px] font-bold tracking-wider rounded transition-all cursor-pointer active:scale-95 active-touch uppercase"
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
