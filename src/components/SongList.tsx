import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, Star, Music, Plus, Database, Trash2, ArrowRight } from 'lucide-react';
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
  onClearLibrary?: () => void;
  currentRole: UserRole;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  filterFavorites?: boolean;
  onFilterFavoritesChange?: (filter: boolean) => void;
}

function SongList({
  songs,
  selectedSongId,
  onSelectSong,
  onToggleFavorite,
  onDeleteSong,
  onOpenAddModal,
  onOpenUploadModal,
  currentRole,
  searchQuery: controlledSearchQuery,
  onSearchChange,
  filterFavorites: controlledFilterFavorites,
  onFilterFavoritesChange,
}: SongListProps) {
  const [internalSearchQuery, setInternalSearchQuery] = useState<string>('');
  const [internalFilterFavorites, setInternalFilterFavorites] = useState<boolean>(false);

  const searchQuery = controlledSearchQuery !== undefined ? controlledSearchQuery : internalSearchQuery;
  const setSearchQuery = onSearchChange || setInternalSearchQuery;

  const filterFavorites = controlledFilterFavorites !== undefined ? controlledFilterFavorites : internalFilterFavorites;
  const setFilterFavorites = onFilterFavoritesChange || setInternalFilterFavorites;

  const [visibleLimit, setVisibleLimit] = useState<number>(80);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const deleteTimeoutRef = useRef<number | null>(null);

  // Focus search input on '/' keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
      if (e.key === '/' && !isInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Ultra-fast ranked search matching
  const filteredSongs = useMemo(() => {
    let list = songs;

    if (filterFavorites) {
      list = list.filter(s => !!s.favorite);
    }

    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return list;
    }

    // Rank results for maximum relevance
    const exactTitle: SongMetadata[] = [];
    const startsWithTitle: SongMetadata[] = [];
    const containsTitle: SongMetadata[] = [];
    const matchAuthorOrLyrics: SongMetadata[] = [];

    for (let i = 0; i < list.length; i++) {
      const song = list[i];
      const title = (song.title || '').toLowerCase();
      const author = (song.author || '').toLowerCase();
      const snippet = (song.lyricsSnippet || '').toLowerCase();
      const key = (song.key || '').toLowerCase();

      if (title === q) {
        exactTitle.push(song);
      } else if (title.startsWith(q)) {
        startsWithTitle.push(song);
      } else if (title.includes(q)) {
        containsTitle.push(song);
      } else if (author.includes(q) || snippet.includes(q) || key === q) {
        matchAuthorOrLyrics.push(song);
      }
    }

    return [
      ...exactTitle,
      ...startsWithTitle,
      ...containsTitle,
      ...matchAuthorOrLyrics
    ];
  }, [songs, searchQuery, filterFavorites]);

  const displayedSongs = useMemo(() => {
    return filteredSongs.slice(0, visibleLimit);
  }, [filteredSongs, visibleLimit]);

  const favoritesCount = useMemo(() => {
    return songs.filter(s => s.favorite).length;
  }, [songs]);

  const handleDelete = (e: React.MouseEvent, songId: string) => {
    e.stopPropagation();
    if (pendingDeleteId === songId) {
      onDeleteSong(songId);
      setPendingDeleteId(null);
      if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
    } else {
      setPendingDeleteId(songId);
      if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = window.setTimeout(() => setPendingDeleteId(null), 3500);
    }
  };

  return (
    <div className="w-full flex flex-col space-y-3.5 select-none">
      {/* 🔍 LIGHTNING-FAST SEARCH HEADER */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        {/* Search Input Bar */}
        <div className="relative flex-1 flex items-center">
          <Search className="absolute left-3.5 w-4 h-4 text-amber-500 pointer-events-none" />
          
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setVisibleLimit(80);
            }}
            placeholder="Search song title, lyrics, or author..."
            className="w-full bg-[#12131A] text-white text-sm pl-10 pr-20 py-3 rounded-xl border border-[#1E202B] focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 outline-none transition-all placeholder:text-zinc-500 font-medium shadow-sm"
          />

          <div className="absolute right-3 flex items-center gap-1.5">
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono text-zinc-500 bg-zinc-900 border border-zinc-800 rounded">
              /
            </kbd>
          </div>
        </div>

        {/* Quick Filter & Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setFilterFavorites(!filterFavorites)}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
              filterFavorites
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/40 shadow-sm shadow-amber-500/20'
                : 'bg-[#12131A] text-zinc-400 hover:text-white border-[#1E202B] hover:bg-[#1A1C26]'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${filterFavorites ? 'fill-amber-400 text-amber-400' : 'text-zinc-400'}`} />
            <span>Favorites</span>
            <span className="text-[10px] font-mono opacity-80">({favoritesCount})</span>
          </button>

          {currentRole === 'admin' && (
            <>
              <button
                onClick={onOpenAddModal}
                className="px-3.5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20 cursor-pointer active-touch"
                title="Add New Song"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <span className="hidden xs:inline">Add</span>
              </button>
              <button
                onClick={onOpenUploadModal}
                className="px-3 py-2.5 bg-[#12131A] hover:bg-[#1A1C26] text-zinc-300 hover:text-white border border-[#1E202B] text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                title="Import File"
              >
                <Database className="w-3.5 h-3.5 text-amber-500" />
                <span className="hidden sm:inline">Import</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 📋 RESULTS SUMMARY BADGE */}
      <div className="flex items-center justify-between text-xs text-zinc-400 px-1 font-mono">
        <span>
          Showing <strong className="text-white">{filteredSongs.length}</strong> {filteredSongs.length === 1 ? 'song' : 'songs'}
          {searchQuery && <span> matching "<span className="text-amber-400">{searchQuery}</span>"</span>}
        </span>
        {filterFavorites && (
          <button
            onClick={() => setFilterFavorites(false)}
            className="text-[11px] text-amber-400 hover:underline cursor-pointer"
          >
            Show All Songs
          </button>
        )}
      </div>

      {/* 🎵 FAST & CLEAN SONG LIST */}
      <div className="bg-[#12131A] border border-[#1E202B] rounded-xl overflow-hidden shadow-lg divide-y divide-[#1E202B]/60">
        {displayedSongs.length > 0 ? (
          displayedSongs.map((song) => {
            const isSelected = selectedSongId === song.id;

            return (
              <div
                key={song.id}
                onClick={() => onSelectSong(song.id)}
                className={`group p-3.5 sm:p-4 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-amber-500/10 text-white'
                    : 'hover:bg-[#1A1C26] text-zinc-200'
                }`}
              >
                {/* Left: Star & Title */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(song.id, !!song.favorite);
                    }}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-amber-400 transition-colors cursor-pointer shrink-0"
                    title={song.favorite ? "Unstar favorite" : "Star favorite"}
                  >
                    <Star
                      className={`w-4 h-4 ${
                        song.favorite ? 'fill-amber-400 text-amber-400' : 'text-zinc-600 hover:text-zinc-400'
                      }`}
                    />
                  </button>

                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white group-hover:text-amber-400 transition-colors truncate">
                        {song.title}
                      </span>
                    </div>
                    {song.author && (
                      <span className="text-xs text-zinc-400 truncate mt-0.5">
                        {song.author}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Actions & Arrow */}
                <div className="flex items-center gap-2 shrink-0">
                  {currentRole === 'admin' && (
                    <button
                      onClick={(e) => handleDelete(e, song.id)}
                      className={`p-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                        pendingDeleteId === song.id
                          ? 'bg-rose-500/20 text-rose-400 font-bold px-2.5'
                          : 'text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10'
                      }`}
                      title={pendingDeleteId === song.id ? "Click again to confirm delete" : "Delete song"}
                    >
                      {pendingDeleteId === song.id ? 'Confirm?' : <Trash2 className="w-4 h-4" />}
                    </button>
                  )}

                  <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-16 px-4 space-y-3">
            <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center mx-auto border border-[#1E202B] text-zinc-500">
              <Search className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-white">
              {searchQuery ? `No songs found matching "${searchQuery}"` : 'No songs in library'}
            </h4>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              {searchQuery
                ? 'Try searching with a different word, author name, or clear the search query.'
                : 'Add or import songs to get started with your library.'}
            </p>
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                className="px-4 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold transition-all hover:bg-amber-500/20 cursor-pointer"
              >
                Clear Search Filter
              </button>
            )}
          </div>
        )}
      </div>

      {/* Load More Button for large catalogs */}
      {visibleLimit < filteredSongs.length && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => setVisibleLimit(prev => prev + 80)}
            className="px-6 py-2.5 bg-[#12131A] hover:bg-[#1A1C26] text-amber-400 border border-[#1E202B] hover:border-amber-500/40 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer"
          >
            Load More Songs ({filteredSongs.length - visibleLimit} remaining)
          </button>
        </div>
      )}
    </div>
  );
}

export default React.memo(SongList);
