import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Music, Star, Trash2, Layers, Plus, Database, BookOpen, Search, X } from 'lucide-react';
import { SongMetadata } from '../lib/db';
import { UserRole } from '../types';

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
  const [showFavoritesOnly, setShowFavoritesOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('q') || '';
    }
    return '';
  });
  const [kbdIndex, setKbdIndex] = useState<number>(-1);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const deleteTimerRef = useRef<number | null>(null);
  const observerTarget = useRef<HTMLDivElement | null>(null);

  // Sync searchQuery changes to URL query parameters (?q=) with 250ms debounce (replaceState)
  useEffect(() => {
    const timer = setTimeout(() => {
      const url = new URL(window.location.href);
      const currentQ = url.searchParams.get('q') || '';
      const trimmedQuery = searchQuery.trim();

      if (trimmedQuery !== currentQ) {
        if (trimmedQuery) {
          url.searchParams.set('q', trimmedQuery);
        } else {
          url.searchParams.delete('q');
        }
        window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Sync state if browser back/forward navigation (popstate) changes the 'q' parameter
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const urlQ = params.get('q') || '';
      setSearchQuery(urlQ);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Sorted & filtered songs catalog
  const sortedSongs = useMemo(() => {
    let filtered = songs;
    if (showFavoritesOnly) {
      filtered = filtered.filter(s => !!s.favorite);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(s =>
        (s.title && s.title.toLowerCase().includes(q)) ||
        (s.author && s.author.toLowerCase().includes(q)) ||
        (s.lyricsSnippet && s.lyricsSnippet.toLowerCase().includes(q)) ||
        (s.key && s.key.toLowerCase().includes(q))
      );
    }
    return [...filtered].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  }, [songs, showFavoritesOnly, searchQuery]);

  // Keyboard shortcut: Press '/' to focus search input
  useEffect(() => {
    const handleShortcut = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        (activeEl as HTMLElement).isContentEditable
      );

      if (e.key === '/' && !isInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

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

  // Keyboard navigation listener (ArrowUp, ArrowDown, Enter)
  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isTypingInInput = activeElement && (
        activeElement.tagName === 'TEXTAREA' || 
        activeElement.tagName === 'INPUT' ||
        (activeElement as HTMLElement).isContentEditable
      );

      if (isTypingInInput) return;

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
    <div id="song-list-module" className="flex flex-col space-y-3.5 text-zinc-300 w-full flex-1 min-h-0">
      
      {/* Top Actions Bar (No title text, full-screen function focus) */}
      <div className="flex items-center justify-between gap-2.5 flex-wrap select-none">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
              showFavoritesOnly 
                ? 'bg-amber-500/10 text-amber-500 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]' 
                : 'premium-btn-secondary border-[#1E202B] text-zinc-400 hover:text-white'
            }`}
            title={showFavoritesOnly ? "Showing Favorites Only" : "Show Favorites Only"}
            aria-label={showFavoritesOnly ? "Showing favorites only" : "Show favorites only"}
          >
            <Star className={`h-4 w-4 ${showFavoritesOnly ? 'fill-amber-500 text-amber-500' : ''}`} aria-hidden={true} />
            <span>Favorites</span>
          </button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={onOpenAddModal}
            className="premium-btn-primary font-bold px-3.5 py-2 rounded-lg text-xs transition-all flex items-center gap-1.5 cursor-pointer active-touch"
          >
            <Plus className="h-4 w-4 text-black stroke-[3]" aria-hidden={true} /> Create Song
          </button>
          <button
            onClick={onOpenUploadModal}
            className="premium-btn-secondary font-bold px-3.5 py-2 rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1.5 active-touch"
          >
            <Database className="h-4 w-4 text-amber-500" aria-hidden={true} /> Import Files
          </button>
        </div>
      </div>

      {/* 🔍 Search Bar */}
      <div className="relative flex items-center w-full">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
          <Search className="h-4 w-4 text-amber-500" />
        </div>
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setVisibleCount(50);
          }}
          placeholder="Search for songs by title, lyrics, or author... (Press '/' to focus)"
          className="w-full bg-[#12131A] text-white text-xs md:text-sm pl-10 pr-24 py-3 rounded-lg border border-[#1E202B] focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 outline-none transition-all placeholder:text-zinc-500 font-medium shadow-inner"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setVisibleCount(50);
                searchInputRef.current?.focus();
              }}
              className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors cursor-pointer"
              title="Clear search"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono text-zinc-500 bg-zinc-900 border border-zinc-800 rounded">
            /
          </span>
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
                <th className="p-4 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">Song Title</th>
                {currentRole === 'admin' && (
                  <th className="p-4 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 w-28 text-center">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {paginatedSongs.length > 0 ? (
                paginatedSongs.map((song, index) => {
                  const isSelected = selectedSongId === song.id;

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
                      
                      {/* Title block with music symbol */}
                      <td className="p-4 text-xs font-semibold">
                        <div className="flex items-start gap-3">
                          <Music className={`h-4 w-4 shrink-0 mt-0.5 transition-transform group-hover:scale-110 ${isSelected ? 'text-amber-500' : 'text-zinc-650'}`} aria-hidden={true} />
                          <div className="flex flex-col text-left min-w-0">
                            <span className={`text-[13px] font-bold tracking-tight transition-colors break-words whitespace-normal ${isSelected ? 'text-amber-555' : 'text-zinc-200 group-hover:text-amber-400'}`}>
                              {song.title}
                            </span>
                            {song.author && (
                              <span className="text-[11px] text-zinc-500 font-normal mt-0.5 break-words whitespace-normal">
                                by {song.author}
                              </span>
                            )}
                          </div>
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
                    <div className="max-w-md mx-auto flex flex-col items-center justify-center space-y-3">
                      <div className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-full">
                        <Search className="h-8 w-8 text-zinc-500" aria-hidden={true} />
                      </div>
                      <p className="font-bold text-white text-xs font-mono tracking-widest uppercase">
                        {searchQuery ? `No songs matching "${searchQuery}"` : 'No Songs Found'}
                      </p>
                      {searchQuery && (
                        <button
                          onClick={() => {
                            setSearchQuery('');
                            searchInputRef.current?.focus();
                          }}
                          className="px-3.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-xs font-mono transition-colors cursor-pointer"
                        >
                          Clear Search
                        </button>
                      )}
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

              return (
                <div
                  key={song.id}
                  id={`song-card-${song.id}`}
                  onClick={() => onSelectSong(song.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectSong(song.id); }}
                  className={`mobile-row mx-1 sm:mx-2 px-3.5 py-3.5 flex flex-col gap-2 cursor-pointer rounded-md transition-all duration-200 active-touch select-none ${
                    isSelected
                      ? 'bg-amber-500/[0.03] border border-amber-500/20'
                      : kbdIndex === index
                        ? 'bg-zinc-900/60'
                        : 'premium-glass-card'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 w-full">
                    {/* Left: indicator dot & title */}
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-2 ${isSelected ? 'bg-amber-500' : 'bg-zinc-800'}`} />
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className={`text-sm font-bold break-words whitespace-normal leading-snug ${isSelected ? 'text-amber-555' : 'text-zinc-200'}`}>
                          {song.title}
                        </div>
                        {song.author && (
                          <span className="text-[10px] text-zinc-500 break-words whitespace-normal mt-0.5">
                            by {song.author}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: favorite button */}
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onToggleFavorite(song.id, !!song.favorite)}
                        className="p-2 text-zinc-650 hover:text-amber-555 transition-all cursor-pointer active-touch rounded"
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
                </div>
              );
            })
          ) : (
            <div className="text-center py-12 px-6 bg-zinc-950/20 select-none">
              <div className="max-w-md mx-auto flex flex-col items-center justify-center space-y-3">
                <div className="p-4 bg-zinc-900/40 border border-zinc-850 rounded-full">
                  <Search className="h-8 w-8 text-zinc-500" aria-hidden={true} />
                </div>
                <p className="font-bold text-white text-xs font-mono tracking-widest uppercase">
                  {searchQuery ? `No songs matching "${searchQuery}"` : 'No Songs Found'}
                </p>
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      searchInputRef.current?.focus();
                    }}
                    className="px-3.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-xs font-mono transition-colors cursor-pointer"
                  >
                    Clear Search
                  </button>
                )}
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
