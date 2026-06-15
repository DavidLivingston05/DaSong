import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Music, Star, Trash2, Layers, ChevronRight, Search, Plus, Database, BookOpen } from 'lucide-react';
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
  currentRole
}: SongListProps) {
  const [visibleCount, setVisibleCount] = useState<number>(20);
  const [inputValue, setInputValue] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [kbdIndex, setKbdIndex] = useState<number>(-1);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const deleteTimerRef = useRef<number | null>(null);

  // Debounce search input by 150ms to prevent key lag when searching a large catalog
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchQuery(inputValue);
      setVisibleCount(20);
    }, 150);
    return () => clearTimeout(handler);
  }, [inputValue]);

  // Sort songs alphabetically by title
  const sortedSongs = useMemo(() => {
    let filtered = songs;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = songs.filter(s => 
        (s.title || '').toLowerCase().includes(q) || 
        (s.author && s.author.toLowerCase().includes(q)) ||
        (s.lyricsSnippet && s.lyricsSnippet.toLowerCase().includes(q))
      );
    }
    return [...filtered].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  }, [songs, searchQuery]);

  // Slice list up to visible count for performance
  const paginatedSongs = useMemo(() => {
    return sortedSongs.slice(0, visibleCount);
  }, [sortedSongs, visibleCount]);

  // Reset keyboard selection when songs change
  React.useEffect(() => {
    setKbdIndex(-1);
  }, [songs]);

  // Keyboard navigation listener (ArrowUp, ArrowDown, Enter)
  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isTypingInChat = activeElement && (
        activeElement.tagName === 'TEXTAREA' || 
        activeElement.tagName === 'INPUT' ||
        (activeElement as HTMLElement).isContentEditable
      );

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

  // Color-coded category badge styles
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
    <div id="song-list-module" className="flex flex-col space-y-5 text-zinc-300">
      
      {/* Page Title & Actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-zinc-900/40">
        <div>
          <h2 className="text-xl md:text-2xl font-serif font-bold text-white tracking-tight flex items-center gap-2">
            <BookOpen className="h-5.5 w-5.5 text-amber-500" /> Song Library
          </h2>
          <p className="text-[11px] text-zinc-500 mt-1.5">Browse public song sheets and manage workspace lyrics.</p>
        </div>
        {(currentRole === 'admin' || currentRole === 'guest') && (
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenAddModal}
              className="bg-amber-600 hover:bg-amber-550 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-[0_2px_10px_rgba(217,119,6,0.1)] flex items-center gap-1.5 h-10 cursor-pointer active:scale-95"
            >
              <Plus className="h-4 w-4 text-white stroke-[2.5]" /> Add Song
            </button>
            <button
              onClick={onOpenUploadModal}
              className="bg-zinc-900 hover:bg-zinc-850 text-zinc-300 hover:text-white px-4 py-2 rounded-xl text-xs font-bold border border-zinc-800 transition-all h-10 cursor-pointer flex items-center gap-1.5 active:scale-95"
            >
              <Database className="h-4 w-4 text-amber-550" /> Import File
            </button>
          </div>
        )}
      </div>

      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-zinc-500" />
        </div>
        <input
          type="text"
          placeholder="Search songs by title, author, or lyrics..."
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
          }}
          className="block w-full pl-10 pr-4 py-3 border border-zinc-800 rounded-xl leading-5 bg-zinc-900 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 text-sm transition-all shadow-sm"
        />
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
                  return (
                    <tr
                      key={song.id}
                      id={`song-row-${song.id}`}
                      onClick={() => onSelectSong(song.id)}
                      className={`group border-b border-zinc-850/30 cursor-pointer song-row-card ${
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
                              {song.title}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Author column (lg+) */}
                      <td className="p-4 text-xs text-zinc-500 hidden lg:table-cell font-sans font-medium">
                        {song.author || 'Traditional'}
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
                                ? 'bg-red-500/10 border border-red-550/20 text-red-400'
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
                    <p className="text-[10px] text-zinc-650 mt-1.5 font-sans">
                      Add a song to the library to begin.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Grid View */}
        <div className="block md:hidden bg-zinc-950/10 py-2.5 space-y-2">
          {paginatedSongs.length > 0 ? (
            paginatedSongs.map((song, index) => {
              const isSelected = selectedSongId === song.id;
              return (
                <div
                  key={song.id}
                  id={`song-card-${song.id}`}
                  onClick={() => onSelectSong(song.id)}
                  className={`mobile-row mx-3 px-4 py-3 flex items-center justify-between gap-3 cursor-pointer rounded-2xl border transition-all duration-150 active-touch select-none song-row-card ${
                    isSelected
                      ? 'bg-amber-550/[0.02] border-amber-550/30 shadow-md shadow-amber-500/[0.02]'
                      : kbdIndex === index
                        ? 'bg-zinc-900 border-amber-550/20'
                        : 'premium-glass-card'
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
                      {song.title}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="text-[10px] font-medium text-zinc-500 truncate max-w-[130px] font-sans">
                        {song.author || 'Traditional'}
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
              <p className="text-[10px] text-zinc-650 mt-1.5 font-sans">
                Add a song to the library to begin.
              </p>
            </div>
          )}
        </div>

        {/* Dynamic Infinite Scroll Load-More Trigger Strip */}
        <div id="lyrics-paginator" className="p-3.5 border-t border-zinc-800/60 bg-zinc-950/40 flex flex-col sm:flex-row items-center justify-between gap-3 font-sans">
          <div className="text-xs text-zinc-500 font-medium text-center sm:text-left">
            Showing <strong className="text-zinc-350 font-semibold">{paginatedSongs.length}</strong> of <strong className="text-zinc-350 font-semibold">{sortedSongs.length}</strong> songs
          </div>

          {visibleCount < sortedSongs.length && (
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
