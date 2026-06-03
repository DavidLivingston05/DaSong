import React, { useState, useMemo } from 'react';
import { Search, Heart, Music, Star, Trash2, PlusCircle, ArrowLeft, Layers, Compass, BarChart2, ShieldAlert } from 'lucide-react';
import { SongMetadata } from '../lib/db';
import { UserRole } from '../types';
import { matchSong } from '../lib/search';

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

  // Debounce the typing query to prevent input lag
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setSearchQuery(tempSearch);
      setVisibleCount(20);
    }, 180);
    return () => clearTimeout(handler);
  }, [tempSearch]);

  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState<boolean>(false);
  const [visibleCount, setVisibleCount] = useState<number>(20);

  // Derive unique categories for filtering dropdown
  const categories = useMemo(() => {
    const list = new Set<string>();
    songs.forEach(s => {
      if (s.category) list.add(s.category);
    });
    return ['All', ...Array.from(list)];
  }, [songs]);

  // High performance filter loop matching multiple constraints with phonetic Tamil/Tanglish support
  const filteredSongs = useMemo(() => {
    const result = songs.filter(song => {
      // 1. Phonetic & Dual-Script Text Filter
      const matchesText = !searchQuery.trim() || matchSong(song, searchQuery);
      
      // 2. Category filter
      const matchesCategory = selectedCategory === 'All' || song.category === selectedCategory;
      
      // 3. Favorites filter
      const matchesFav = !showOnlyFavorites || !!song.favorite;

      return matchesText && matchesCategory && matchesFav;
    });

    // Reset page if filters change
    return result;
  }, [songs, searchQuery, selectedCategory, showOnlyFavorites]);

  // Slice list up to visible count for ultra fast layout rendering
  const paginatedSongs = useMemo(() => {
    return filteredSongs.slice(0, visibleCount);
  }, [filteredSongs, visibleCount]);

  // Listen for keyboard shortcuts: pressing "/" focuses the search bar instantly
  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isTyping = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' || 
        (activeElement as HTMLElement).isContentEditable
      );

      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        const searchInput = document.getElementById('song-search');
        if (searchInput) {
          searchInput.focus();
          (searchInput as HTMLInputElement).select();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  return (
    <div id="song-list-module" className="flex flex-col space-y-4 text-zinc-300">
      
      {/* Search and Filters panel - Styled like an audio master channel rack */}
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800/80 p-5 shadow-[0_4px_30px_rgba(0,0,0,0.4)] space-y-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>
        {/* Dynamic Search Box */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            id="song-search"
            type="text"
            className="w-full pl-11 pr-5 py-3 text-xs font-mono rounded-xl border border-zinc-800 bg-zinc-950 text-white placeholder-zinc-600 outline-none focus:border-amber-500 transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]"
            placeholder="Search core catalog: enter song name, code keywords, or tag..."
            value={tempSearch}
            onChange={(e) => {
              setTempSearch(e.target.value);
            }}
          />
        </div>

        {/* Category Selector Carousel - Horizontal Scroll Pills */}
        <div className="flex flex-col space-y-1.5">
          <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 font-bold pl-0.5">Filter Channel:</span>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
            {categories.map((cat) => {
              const isActive = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => {
                    setSelectedCategory(cat);
                    setVisibleCount(20);
                  }}
                  className={`px-4 py-2 text-[10px] uppercase font-mono tracking-wider font-extrabold rounded-xl border transition-all shrink-0 cursor-pointer select-none active-touch ${
                    isActive
                      ? 'bg-amber-500 border-amber-500 text-black shadow-[0_4px_12px_rgba(245,158,11,0.2)]'
                      : 'bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  }`}
                >
                  {cat === 'All' ? '⚡ All Channels' : cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filters Select boxes & options */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-3">
            {/* Favorite Filter Toggle - Styled like a physical tactile latching keyboard switch */}
            <button
              id="filter-favorites-toggle"
              onClick={() => {
                setShowOnlyFavorites(!showOnlyFavorites);
                setVisibleCount(20);
              }}
              className={`flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-widest font-mono rounded-xl border transition-all cursor-pointer select-none ${
                showOnlyFavorites
                  ? 'bg-zinc-950 border-amber-500 text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.15)] font-black'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-850'
              }`}
            >
              {showOnlyFavorites ? (
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_6px_#ef4444]" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
              )}
              <Heart className={`h-3 w-3 ${showOnlyFavorites ? 'fill-amber-500 text-amber-500' : ''}`} />
              Favorites Only
            </button>
          </div>

          {/* Quick Action Buttons for resetting & bulk ops */}
          {currentRole === 'admin' && (
            <div className="flex gap-2">
              <button
                onClick={onOpenUploadModal}
                className="cursor-pointer bg-amber-500 hover:bg-amber-400 active:scale-95 text-black px-4 py-2 rounded-xl text-[10px] uppercase font-mono tracking-wider font-extrabold transition-all flex items-center gap-1.5 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
              >
                <PlusCircle className="h-3.5 w-3.5 stroke-[3]" /> Import Lyrics File
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Song Grid / Lists layout - Styled like DAW Mixer Strip Grid */}
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800/80 overflow-hidden shadow-[0_10px_35px_rgba(0,0,0,0.5)]">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-950 border-b border-zinc-800/80">
                <th className="p-4 text-[10px] font-mono uppercase tracking-widest text-zinc-500 w-14 text-center font-bold">LED</th>
                <th className="p-4 text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold">Channel Strip Feed Title</th>
                {currentRole === 'admin' && (
                  <th className="p-4 text-[10px] font-mono uppercase tracking-widest text-zinc-500 w-16 text-center font-bold">Trash</th>
                )}
              </tr>
            </thead>
            <tbody>
              {paginatedSongs.length > 0 ? (
                paginatedSongs.map((song) => {
                  const isSelected = selectedSongId === song.id;
                  return (
                    <tr
                      key={song.id}
                      onClick={() => onSelectSong(song.id)}
                      className={`group border-b border-zinc-850/60 hover:bg-zinc-800/35 cursor-pointer transition-all ${
                        isSelected 
                          ? 'bg-amber-500/5 text-white font-extrabold border-b border-amber-500/30' 
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
                      
                      {/* Title block with cleavage symbol */}
                      <td className="p-4 text-xs font-semibold">
                        <div className="flex items-center gap-3">
                          {isSelected ? (
                            <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
                          ) : (
                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-800 text-zinc-550" />
                          )}
                          <Music className={`h-3.5 w-3.5 ${isSelected ? 'text-amber-500' : 'text-zinc-650'}`} />
                          <span className={`${isSelected ? 'text-amber-500 font-black' : 'text-zinc-200 group-hover:text-amber-400/90'}`}>{song.title}</span>
                        </div>
                      </td>

                      {/* Delete actions */}
                      {currentRole === 'admin' && (
                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete "${song.title}"?`)) {
                                onDeleteSong(song.id);
                              }
                            }}
                            className="text-zinc-600 hover:text-red-400 p-1.5 rounded-lg hover:bg-zinc-950 transition-all cursor-pointer active:scale-95"
                            title="Delete song"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={currentRole === 'admin' ? 3 : 2} className="text-center py-16 px-4 bg-zinc-950/40">
                    <Layers className="h-10 w-10 text-zinc-800 mx-auto mb-3" />
                    <p className="font-bold text-zinc-400 text-xs font-mono uppercase tracking-widest">No Channel Feed Found</p>
                    <p className="text-[10px] text-zinc-600 mt-1 uppercase font-mono">
                      Adjust search query or import lyrics to begin.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile/Tablet Card-based View */}
        <div className="block md:hidden bg-zinc-950/20 py-2.5 space-y-1">
          {paginatedSongs.length > 0 ? (
            paginatedSongs.map((song) => {
              const isSelected = selectedSongId === song.id;
              return (
                <div
                  key={song.id}
                  onClick={() => onSelectSong(song.id)}
                  className={`mx-4 p-4 flex items-center justify-between gap-4 cursor-pointer rounded-2xl border transition-all duration-200 active-touch select-none ${
                    isSelected
                      ? 'bg-gradient-to-br from-zinc-900 to-amber-950/15 border-amber-500/50 shadow-[0_4px_20px_rgba(245,158,11,0.08)] scale-[1.01]'
                      : 'bg-gradient-to-br from-zinc-900/90 to-zinc-950/60 border-zinc-800/80 hover:border-zinc-700/60 shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-3.5 truncate">
                    {isSelected ? (
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444] shrink-0" />
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-750 shrink-0" />
                    )}
                    <div className="truncate text-left">
                      <div className={`text-[14px] font-bold truncate tracking-wide ${isSelected ? 'text-amber-500 font-black' : 'text-zinc-200'}`}>
                        {song.title}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 font-mono text-[9px] text-zinc-550 flex-wrap">
                        <span className="truncate max-w-[120px] font-sans font-semibold text-zinc-450">{song.author || 'Traditional'}</span>
                        {song.bpm && (
                          <>
                            <span>•</span>
                            <span className="bg-zinc-800/80 px-1.5 py-0.5 rounded text-zinc-400 font-bold">{song.bpm} BPM</span>
                          </>
                        )}
                        {song.category && (
                          <>
                            <span>•</span>
                            <span className="text-amber-500/95 font-extrabold bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 rounded uppercase">{song.category}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onToggleFavorite(song.id, !!song.favorite)}
                      className="p-2 text-zinc-650 hover:text-amber-500 transition-colors cursor-pointer"
                      title="Toggle Favorite"
                    >
                      {song.favorite ? (
                        <Star className="h-4.5 w-4.5 fill-amber-500 text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" />
                      ) : (
                        <Star className="h-4.5 w-4.5 text-zinc-700" />
                      )}
                    </button>
                    {currentRole === 'admin' && (
                      <button
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete "${song.title}"?`)) {
                            onDeleteSong(song.id);
                          }
                        }}
                        className="p-2 text-zinc-600 hover:text-red-400 transition-colors cursor-pointer"
                        title="Delete Song"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-16 px-4">
              <Layers className="h-10 w-10 text-zinc-800 mx-auto mb-3" />
              <p className="font-bold text-zinc-400 text-xs font-mono uppercase tracking-widest">No Songs Found</p>
              <p className="text-[10px] text-zinc-600 mt-1 uppercase font-mono">
                Adjust search query or import lyrics to begin.
              </p>
            </div>
          )}
        </div>

        {/* Dynamic Infinite Scroll Load-More Trigger Strip */}
        <div id="lyrics-paginator" className="p-4 border-t border-zinc-800/80 bg-zinc-950 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider text-center sm:text-left">
            Showing <strong className="text-zinc-300 font-bold">{paginatedSongs.length}</strong> of <strong className="text-zinc-300 font-bold">{filteredSongs.length}</strong> modules
          </div>

          {visibleCount < filteredSongs.length && (
            <button
              onClick={() => setVisibleCount(prev => prev + 20)}
              className="w-full sm:w-auto px-6 py-2 bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-black tracking-widest rounded-xl transition-all cursor-pointer shadow-md shadow-amber-500/10 active:scale-95 active-touch uppercase"
            >
              LOAD MORE CHANNELS
            </button>
          )}
        </div>
      </div>



    </div>
  );
}

export default React.memo(SongList);
