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
      case 'worship': return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
      case 'gospel': return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
      case 'christmas': return 'bg-sky-500/10 border-sky-500/20 text-sky-405';
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
    <div id="song-list-module" className="flex flex-col space-y-6 text-zinc-300">
      
      {/* Page Title & Actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-zinc-900/20 select-none">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <BookOpen className="h-5.5 w-5.5 text-amber-550" /> Song Library
          </h2>
          <p className="text-xs text-zinc-500 mt-1">Browse, filter, and manage workspace lyrics with ease.</p>
        </div>
        {(currentRole === 'admin' || currentRole === 'guest') && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={onOpenAddModal}
              className="premium-btn-primary font-bold px-4 py-2 rounded text-xs transition-all flex items-center gap-1.5 h-10 cursor-pointer active-touch"
            >
              <Plus className="h-4 w-4 text-black stroke-[3]" /> Create Song
            </button>
            <button
              onClick={onOpenUploadModal}
              className="premium-btn-secondary font-bold px-4 py-2 rounded text-xs transition-all h-10 cursor-pointer flex items-center gap-1.5 active-touch"
            >
              <Database className="h-4 w-4 text-amber-500" /> Import Files
            </button>
          </div>
        )}
      </div>

      {/* Search Input Toolbar */}
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-zinc-500 transition-colors group-focus-within:text-amber-500" />
        </div>
        <input
          type="text"
          placeholder="Search songs by title, author, or lyrics snippets..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="block w-full pl-11 pr-4 py-3 bg-zinc-950/40 text-zinc-250 placeholder-zinc-550 focus:outline-none text-sm transition-all premium-input rounded"
        />
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
                <th className="p-4 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 hidden lg:table-cell">Author</th>
                <th className="p-4 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">Category</th>
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
                        <button className="text-amber-500 hover:text-amber-400 transition-all cursor-pointer p-1">
                          {song.favorite ? (
                            <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                          ) : (
                            <Star className="h-4 w-4 text-zinc-700 hover:text-zinc-400 transition-colors" />
                          )}
                        </button>
                      </td>
                      
                      {/* Title block with music symbol */}
                      <td className="p-4 text-xs font-semibold">
                        <div className="flex items-center gap-3">
                          <Music className={`h-4 w-4 shrink-0 transition-transform group-hover:scale-110 ${isSelected ? 'text-amber-500' : 'text-zinc-650'}`} />
                          <div className="flex flex-col text-left">
                            <span className={`text-[13px] font-bold tracking-tight transition-colors ${isSelected ? 'text-amber-555' : 'text-zinc-200 group-hover:text-amber-400'}`}>
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
                          <span className={`text-[9px] font-bold uppercase px-2.5 py-0.5 rounded-md tracking-wider select-none ${getCategoryStyle(song.category)}`}>
                            {song.category}
                          </span>
                        )}
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
                  <td colSpan={currentRole === 'admin' ? 5 : 4} className="text-center py-20 px-6 bg-zinc-950/40 select-none">
                    <div className="max-w-md mx-auto flex flex-col items-center justify-center">
                      <div className="p-4 bg-zinc-900/40 rounded-full mb-4">
                        <Layers className="h-8 w-8 text-zinc-650" />
                      </div>
                      <p className="font-bold text-white text-xs font-mono tracking-widest uppercase">No Songs Found</p>
                      <p className="text-[11px] text-zinc-500 mt-2 font-sans max-w-xs leading-relaxed">
                        We couldn't find any songs matching your filter. Try adding a new track or importing files.
                      </p>
                      {(currentRole === 'admin' || currentRole === 'guest') && (
                        <button
                          onClick={onOpenAddModal}
                          className="mt-5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-bold px-4 py-2 rounded text-[10px] font-mono tracking-wider transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
                        >
                          <Plus className="h-3.5 w-3.5" /> Create New Song
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>        {/* Mobile Grid View */}
        <div className="block md:hidden bg-zinc-950/10 py-3 space-y-3">
          {paginatedSongs.length > 0 ? (
            paginatedSongs.map((song, index) => {
              const isSelected = selectedSongId === song.id;
              return (
                <div
                  key={song.id}
                  id={`song-card-${song.id}`}
                  onClick={() => onSelectSong(song.id)}
                  className={`mobile-row mx-3.5 px-4 py-4 flex items-center justify-between gap-3 cursor-pointer rounded-md transition-all duration-200 active-touch select-none ${
                    isSelected
                      ? 'bg-amber-500/[0.03] border border-amber-500/20'
                      : kbdIndex === index
                        ? 'bg-zinc-900/60'
                        : 'premium-glass-card'
                  }`}
                >
                  {/* Left: indicator dot */}
                  {isSelected ? (
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-800 shrink-0" />
                  )}

                  {/* Center: song info */}
                  <div className="flex-1 truncate text-left min-w-0">
                    <div className={`text-sm font-bold truncate leading-snug ${isSelected ? 'text-amber-550' : 'text-zinc-200'}`}>
                      {song.title}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="text-[10px] font-medium text-zinc-550 truncate max-w-[130px] font-sans">
                        {song.author || 'Traditional'}
                      </span>
                      {song.category && (
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${getCategoryStyle(song.category)}`}>{song.category}</span>
                      )}
                      {song.bpm && (
                        <span className="text-[9px] font-mono text-zinc-500 bg-zinc-900/40 px-1.5 py-0.5 rounded">{song.bpm} bpm</span>
                      )}
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onToggleFavorite(song.id, !!song.favorite)}
                      className="p-2 text-zinc-650 hover:text-amber-550 transition-all cursor-pointer active-touch rounded"
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
                        className={`p-2 transition-colors cursor-pointer active-touch rounded ${
                          pendingDeleteId === song.id
                            ? 'text-red-400 bg-red-500/10'
                            : 'text-zinc-700 hover:text-red-400'
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
            <div className="text-center py-20 px-6 bg-zinc-950/20 select-none">
              <div className="max-w-md mx-auto flex flex-col items-center justify-center">
                <div className="p-4 bg-zinc-900/40 border border-zinc-850 rounded-full mb-4">
                  <Layers className="h-8 w-8 text-zinc-650" />
                </div>
                <p className="font-bold text-white text-xs font-mono tracking-widest uppercase">No Songs Found</p>
                <p className="text-[11px] text-zinc-500 mt-2 font-sans max-w-xs leading-relaxed">
                  We couldn't find any songs matching your filter. Try adding a new track or importing files.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Dynamic Infinite Scroll Load-More Trigger Strip */}
        <div id="lyrics-paginator" className="p-4 border-t border-zinc-900/60 bg-zinc-950/60 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono select-none">
          <div className="text-[11px] text-zinc-500 uppercase tracking-wider">
            Showing <strong className="text-zinc-350">{paginatedSongs.length}</strong> of <strong className="text-zinc-350">{sortedSongs.length}</strong> songs
          </div>

          {visibleCount < sortedSongs.length && (
            <button
              onClick={() => setVisibleCount(prev => prev + 20)}
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
