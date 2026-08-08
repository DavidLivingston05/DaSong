import React, { useState } from 'react';
import {
  RefreshCw, X, Smartphone, Download, Search, Music, BookOpen, Plus, Database, LogOut
} from 'lucide-react';
import { UserRole, SuggestedSong, Song } from '../types';
import { SongMetadata } from '../lib/db';
import { motion } from 'motion/react';
import SongDetail from '../components/SongDetail';
import SongList from '../components/SongList';


interface DashboardViewProps {
  activeServerId: string;
  session: { role: UserRole; name?: string } | null;
  songs: SongMetadata[];
  mongoStatus: 'connecting' | 'connected' | 'error' | 'offline';
  currentRole: UserRole;
  renderGuestWelcome: () => React.ReactNode;
  isFollowing: boolean;
  handleToggleFollow: (val: boolean) => void;
  showInstallBanner: boolean;
  isInstalled: boolean;
  dismissedInstall: boolean;
  handleDismissInstall: () => void;
  handleInstallApp: () => void;
  handleLogout: () => void;
  quickSearchInput: string;
  setQuickSearchInput: (value: string) => void;
  quickSearchMatches: SongMetadata[];
  setSongSourceTab: (tab: 'search' | 'dashboard') => void;
  setActiveTab: (tab: 'dashboard' | 'search') => void;
  handleSelectSong: (id: string | null) => void;
  stats: { total: number; favorites: number; categories: number };
  recentSongs: SongMetadata[];
  suggestions: SuggestedSong[];
  handleDismissSuggestion: (id: string) => void;
  setShowAddModal: (show: boolean) => void;
  setShowUploadModal: (show: boolean) => void;
}

interface SongSearchViewProps {
  selectedSongId: string | null;
  handleSelectSong: (id: string | null) => void;
  songSourceTab: 'search' | 'dashboard';
  setActiveTab: (tab: 'dashboard' | 'search') => void;
  loadEvents?: () => void;
  handleEnterStageMode: () => void;
  handleToggleFavorite: (id: string, currentFav: boolean) => void;
  handleSongUpdateOrReview: () => void;
  currentRole: UserRole;
  activeSetlistIds?: string[];
  songs: SongMetadata[];
  favoriteSongIds: Set<string>;
  setSongSourceTab: (tab: 'search' | 'dashboard') => void;
  handleDeleteSong: (id: string) => void;
  setShowAddModal: (show: boolean) => void;
  setShowUploadModal: (show: boolean) => void;
  handleClearLibrary: () => void;
  mongoStatus: 'connecting' | 'connected' | 'error' | 'offline';
  onExportSong?: (song: Song) => void;
}

export function DashboardView({
  activeServerId,
  session,
  songs,
  mongoStatus,
  currentRole,
  renderGuestWelcome,
  isFollowing,
  handleToggleFollow,
  showInstallBanner,
  isInstalled,
  dismissedInstall,
  handleDismissInstall,
  handleInstallApp,
  handleLogout,
  quickSearchInput,
  setQuickSearchInput,
  quickSearchMatches,
  setSongSourceTab,
  setActiveTab,
  handleSelectSong,
  stats,
  recentSongs,
  suggestions,
  handleDismissSuggestion,
  setShowAddModal,
  setShowUploadModal,
}: DashboardViewProps) {
  return (
    <motion.div
      key="dashboard"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.18 }}
      className={activeServerId === 'default' ? "w-full" : (session?.role === 'admin' ? "grid grid-cols-1 lg:grid-cols-[7.5fr_2.5fr] gap-8 items-start w-full py-4 md:py-8 px-0 md:px-4 max-w-none mx-auto" : "flex flex-col items-center py-4 md:py-8 px-0 md:px-4 w-full max-w-6xl mx-auto")}
    >
      {activeServerId === 'default' ? renderGuestWelcome() : (
        <>
          {/* Left Column Wrapper */}
          <div className="flex flex-col gap-5 md:gap-6 w-full">
            {songs.length === 0 && mongoStatus === 'connecting' && (
              <div className="w-full text-left bg-gradient-to-r from-zinc-900 via-zinc-950 to-amber-950/20 p-5 md:p-6 rounded-3xl border border-amber-500/25 shadow-xl relative overflow-hidden group animate-in slide-in-from-top duration-300">
                <div className="absolute top-1/2 -right-4 -translate-y-1/2 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl group-hover:bg-amber-500/10 transition-all duration-500"></div>
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
                  <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-2xl shrink-0">
                    <RefreshCw className="h-6 w-6 text-amber-500 animate-spin" />
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <h3 className="text-sm font-bold text-white flex items-center justify-center sm:justify-start gap-2">
                      Syncing Workspace Song Library...
                      <span className="bg-amber-500/10 text-amber-450 text-[9px] font-mono font-black px-1.5 py-0.5 rounded border border-amber-500/20 uppercase tracking-wider">Syncing</span>
                    </h3>
                    <p className="text-[11.5px] text-zinc-400 mt-1 select-none font-medium leading-relaxed max-w-xl">
                      Downloading church songbooks and lyrics from the cloud server. This is only necessary during your first visit and will complete in a few moments. No need to refresh!
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* === MOBILE COMPACT GREETING BAR (hidden on desktop) === */}
            <div className="md:hidden w-full flex items-center justify-between mb-4 px-1">
              <div>
                <p className="text-[11px] font-mono text-zinc-500 uppercase tracking-widest">Active Session</p>
                <h2 className="text-lg font-bold text-white tracking-tight leading-tight">
                  Welcome, <span className="text-amber-500">{session?.name?.split(' ')[0] || 'User'}</span>
                  <span className="ml-1.5 text-xs text-zinc-400 font-normal">({session?.role})</span>
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-mono font-bold px-2 py-1 rounded-lg border uppercase ${
                  mongoStatus === 'connected' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                  mongoStatus === 'connecting' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                  'bg-zinc-800 text-zinc-500 border-zinc-700'
                }`}>
                  {mongoStatus === 'connected' ? 'Live' : mongoStatus === 'connecting' ? 'Sync' : 'Local'}
                </span>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1 px-2.5 py-1 bg-zinc-900 hover:bg-rose-955/20 text-rose-400 border border-zinc-800 hover:border-rose-955/40 rounded-lg transition-all text-[11px] font-mono font-bold cursor-pointer active-touch"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Exit</span>
                </button>
              </div>
            </div>

            {/* === DESKTOP GREETING CARD (hidden on mobile) === */}
            <div className="hidden md:block w-full text-left mb-6 bg-zinc-950/40 p-6 rounded-3xl border border-zinc-850 shadow-md relative overflow-hidden">
              <span className="text-[9px] font-mono tracking-widest text-amber-500 font-bold uppercase bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">Workspace</span>
              <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight mt-2.5">
                Welcome back, <span className="text-amber-500">{session?.name || 'User'}</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-1 select-none">
                Role: <span className="text-amber-400 font-bold capitalize">{session?.role}</span>
              </p>
            </div>

            {/* Live Service Follow Panel (Guest/Choir/Admin dashboard) */}
            {activeServerId !== 'default' && (
              <div className={`w-full p-5 rounded-3xl border transition-all duration-300 ${
                isFollowing 
                  ? 'bg-amber-500/5 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)]' 
                  : 'bg-zinc-955/20 border-zinc-850 hover:border-zinc-800'
              } mb-6 relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
                <div className="flex items-start gap-3.5 relative z-10">
                  <div className="pt-0.5 shrink-0">
                    <span className="relative flex h-3 w-3">
                      {isFollowing && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      )}
                      <span className={`relative inline-flex rounded-full h-3 w-3 ${isFollowing ? 'bg-amber-500 shadow-[0_0_8px_#f59e0b]' : 'bg-zinc-650'}`}></span>
                    </span>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Live Service Sync</h3>
                    <p className="text-[11px] text-zinc-400 mt-1 select-none font-medium leading-relaxed max-w-xl">
                      {isFollowing 
                        ? 'Connected. Screen automatically updates when songs are presented by the leader.' 
                        : 'Enable auto-sync to follow projected lyrics during live worship.'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleFollow(!isFollowing)}
                  className={`relative z-10 px-5 py-2.5 rounded-full text-xs font-bold font-mono tracking-wider uppercase transition-all cursor-pointer active-touch shrink-0 ${
                    isFollowing 
                      ? 'bg-amber-500 text-black shadow-md hover:bg-amber-400 shadow-amber-500/25' 
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                  }`}
                >
                  {isFollowing ? 'Syncing' : 'Follow'}
                </button>
              </div>
            )}

            {/* Elegant PWA Browser Install Banner */}
            {showInstallBanner && !isInstalled && !dismissedInstall && (
              <div className="w-full text-left mb-6 bg-gradient-to-r from-zinc-900 via-zinc-950 to-amber-955/25 p-5 md:p-6 rounded-3xl border border-amber-500/20 shadow-lg relative overflow-hidden group animate-in slide-in-from-top duration-300">
                <div className="absolute top-1/2 -right-4 -translate-y-1/2 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl group-hover:bg-amber-500/10 transition-all duration-500"></div>
                
                <button 
                  onClick={handleDismissInstall}
                  className="absolute top-3.5 right-3.5 p-1.5 rounded-full text-zinc-505 hover:text-zinc-400 hover:bg-white/5 transition-colors cursor-pointer active-touch"
                  title="Dismiss Banner"
                  aria-label="Dismiss banner"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 relative z-10">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-amber-500/20 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.1)] relative">
                    <Smartphone className="h-6 w-6 text-amber-500" />
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center border-2 border-zinc-950">
                      <Download className="h-2.5 w-2.5 text-black stroke-[3]" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 pr-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                      Install DaSong Songbook App
                      <span className="bg-amber-500/10 text-amber-400 text-[8px] font-mono font-bold px-1.5 py-0.2 rounded border border-amber-500/20 uppercase tracking-wide">PWA Active</span>
                    </h3>
                    <p className="text-[11.5px] text-zinc-400 mt-1 select-none font-medium leading-relaxed">
                      Pin to your Home Screen or Desktop for a premium offline experience, native fullscreen display, and notch-safe bounds for live worship sets.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 mt-3 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-zinc-800/80">
                    <button 
                      onClick={handleDismissInstall}
                      className="flex-1 sm:flex-none text-center text-[11px] font-bold text-zinc-400 hover:text-zinc-200 px-3 py-2 rounded-xl transition-all cursor-pointer active-touch"
                    >
                      Maybe Later
                    </button>
                    <button 
                      onClick={handleInstallApp}
                      className="flex-1 sm:flex-none bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-full text-[11px] transition-all shadow-md active-touch flex items-center justify-center gap-1.5 cursor-pointer shadow-amber-500/15"
                    >
                      <Download className="h-3.5 w-3.5 stroke-[3]" /> Install Now
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="w-full mb-6 relative">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-[18px] w-[18px] text-zinc-550" />
                </div>
                <input
                  type="text"
                  placeholder="Quick song access... (Type title, author, or lyrics)"
                  value={quickSearchInput}
                  onChange={(e) => setQuickSearchInput(e.target.value)}
                  className="block w-full pl-11 pr-10 py-3 border border-[#1E202B] bg-[#12131A] text-white placeholder-zinc-550 focus:outline-none focus:border-amber-500/35 text-xs font-sans transition-all rounded"
                  aria-label="Quick search songs"
                />
                {quickSearchInput && (
                  <button
                    onClick={() => setQuickSearchInput('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-355 cursor-pointer"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Autocomplete Popup List */}
              {quickSearchInput.trim() && (
                <div className="absolute left-0 right-0 mt-1.5 bg-[#12131A] border border-[#1E202B] rounded shadow-lg z-30 overflow-hidden max-h-[350px] overflow-y-auto divide-y divide-[#1E202B] animate-in fade-in slide-in-from-top-1 duration-150">
                  {quickSearchMatches.length === 0 ? (
                    <div className="p-4 text-center text-zinc-550 text-xs font-sans italic">
                      No matching songs found
                    </div>
                  ) : (
                    quickSearchMatches.map((song) => (
                      <button
                        key={song.id}
                        onClick={() => {
                          setQuickSearchInput('');
                          setSongSourceTab('search');
                          setActiveTab('search');
                          handleSelectSong(song.id);
                        }}
                        className="w-full p-3 hover:bg-[#1A1C26] transition-colors flex items-center justify-between text-left cursor-pointer group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8 w-8 rounded bg-[#1A1C26] border border-[#272A37] flex items-center justify-center text-zinc-400 group-hover:text-amber-500 transition-colors shrink-0">
                            <Music className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-zinc-200 group-hover:text-amber-450 transition-colors truncate">
                              {song.title}
                            </div>
                            <div className="text-[10px] text-zinc-550 font-mono mt-0.5">
                              {song.author || 'Traditional'}
                            </div>
                          </div>
                        </div>
                        {song.category && (
                          <span className="text-[9px] font-bold uppercase font-mono bg-amber-500/10 border border-amber-500/25 text-amber-555 px-2 py-0.5 rounded shrink-0">
                            {song.category}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Quick Metrics Cards */}
            <div className="grid grid-cols-3 gap-3 w-full mb-6 select-none">
              <div className="bg-[#12131A] border border-[#1E202B] p-3.5 md:p-4 rounded text-center relative overflow-hidden">
                <span className="text-[9px] font-mono tracking-wider uppercase block text-zinc-550">Songs</span>
                <span className="font-mono text-xl md:text-2xl text-amber-500 block font-bold mt-1">
                  {stats.total}
                </span>
                <span className="text-[9px] text-zinc-500 mt-0.5 block font-sans">Total</span>
              </div>
              <div className="bg-[#12131A] border border-[#1E202B] p-3.5 md:p-4 rounded text-center relative overflow-hidden">
                <span className="text-[9px] font-mono tracking-wider uppercase block text-zinc-550">Stars</span>
                <span className="font-mono text-xl md:text-2xl text-amber-500 block font-bold mt-1">
                  {stats.favorites}
                </span>
                <span className="text-[9px] text-zinc-500 mt-0.5 block font-sans">Favorites</span>
              </div>
              <div className="bg-[#12131A] border border-[#1E202B] p-3.5 md:p-4 rounded text-center relative overflow-hidden">
                <span className="text-[9px] font-mono tracking-wider uppercase block text-zinc-550">Categories</span>
                <span className="font-mono text-xl md:text-2xl text-amber-500 block font-bold mt-1">
                  {stats.categories}
                </span>
                <span className="text-[9px] text-zinc-500 mt-0.5 block font-sans">Unique</span>
              </div>
            </div>
            
            {/* Quick Actions Navigation Cards */}
            <div className="grid grid-cols-2 gap-3 md:gap-4 w-full">
              <button 
                onClick={() => setActiveTab('search')}
                className="p-4 md:p-5 bg-[#12131A] hover:bg-[#1A1C26] border border-[#1E202B] hover:border-amber-500/35 rounded text-left transition-all cursor-pointer group flex flex-col md:flex-row md:items-start gap-2 md:gap-4 active-touch"
              >
                <div className="p-2.5 md:p-3 bg-[#1A1C26] border border-[#272A37] rounded group-hover:border-amber-500/20 transition-all w-fit shrink-0">
                  <BookOpen className="w-5 h-5 text-amber-555" />
                </div>
                <div>
                  <div className="text-[13px] md:text-sm font-semibold text-white tracking-wide">Song Library</div>
                  <p className="text-[11px] md:text-xs text-zinc-500 mt-0.5 md:mt-1">Search and browse all songs.</p>
                </div>
              </button>
            </div>

            {/* === RESPONSIVE JUMP BACK IN === */}
            {recentSongs.length > 0 && (
              <div className="w-full mt-6">
                <span className="text-[10px] font-mono tracking-widest uppercase text-amber-500 font-semibold block mb-3 pl-0.5 text-left">
                  Jump Back In
                </span>
                
                {/* Desktop View: list */}
                <div className="hidden md:block space-y-2 bg-[#12131A] p-5 md:p-6 rounded-md border border-[#1E202B] relative overflow-hidden">
                  {recentSongs.map(song => (
                    <button
                      key={song.id}
                      onClick={() => {
                        setActiveTab('search');
                        setSongSourceTab('search');
                        handleSelectSong(song.id);
                      }}
                      className="w-full p-3 bg-[#1A1C26]/40 hover:bg-[#1A1C26] border border-[#1E202B] hover:border-amber-500/35 rounded flex items-center justify-between gap-3 text-left transition-all cursor-pointer group active-touch"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-7 w-7 rounded bg-[#1A1C26] border border-[#272A37] flex items-center justify-center text-zinc-400 group-hover:text-amber-500 transition-colors shrink-0">
                          <Music className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white group-hover:text-amber-400 transition-colors truncate">{song.title}</div>
                          <div className="text-[10px] text-zinc-550 font-mono mt-0.5">{song.author || 'Traditional'}</div>
                        </div>
                      </div>
                      {song.category && (
                        <span className="text-[9px] font-bold uppercase font-mono bg-amber-500/10 border border-amber-500/25 text-amber-555 px-2 py-0.5 rounded shrink-0">
                          {song.category}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Mobile View: horizontal scroll pills */}
                <div className="md:hidden flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
                  {recentSongs.map(song => (
                    <button
                      key={song.id}
                      onClick={() => {
                        setActiveTab('search');
                        setSongSourceTab('search');
                        handleSelectSong(song.id);
                      }}
                      className="recent-song-pill active-touch text-left shrink-0"
                    >
                      <div className="text-[13px] font-bold text-white truncate leading-tight">{song.title}</div>
                      <div className="text-[10px] text-zinc-555 font-mono mt-1 truncate">{song.author || 'Traditional'}</div>
                      {song.category && (
                        <div className="text-[9px] font-bold uppercase text-amber-500/90 mt-1">{song.category}</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

        </>
      )}
    </motion.div>
  );
}

export function SongSearchView({
  selectedSongId,
  handleSelectSong,
  songSourceTab,
  setActiveTab,
  loadEvents,
  handleEnterStageMode,
  handleToggleFavorite,
  handleSongUpdateOrReview,
  currentRole,
  activeSetlistIds,
  songs,
  favoriteSongIds,
  setSongSourceTab,
  handleDeleteSong,
  setShowAddModal,
  setShowUploadModal,
  handleClearLibrary,
  mongoStatus,
  onExportSong,
}: SongSearchViewProps) {
  return (
    <motion.div
      key="search"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.18 }}
      className="w-full min-h-0"
    >
      {selectedSongId ? (
        <div className="w-full flex flex-col">
          <SongDetail 
            songId={selectedSongId}
            onClose={() => {
              handleSelectSong(null);
            }}
            onEnterStageMode={handleEnterStageMode}
            onToggleFavorite={handleToggleFavorite}
            onLyricsUpdated={handleSongUpdateOrReview}
            onSelectSong={handleSelectSong}
            currentRole={currentRole}
            backLabel="Back to Search"
            songsMetadata={songs}
            isFavorite={selectedSongId ? favoriteSongIds.has(selectedSongId) : false}
            onExportSong={onExportSong}
          />
        </div>
      ) : (
        <div className="flex flex-col space-y-5 min-h-[400px]">
          {songs.length === 0 && mongoStatus === 'connecting' && (
            <div className="w-full text-left bg-gradient-to-r from-zinc-900 via-zinc-950 to-amber-955/20 p-5 md:p-6 rounded-3xl border border-amber-500/20 shadow-lg relative overflow-hidden group animate-in slide-in-from-top duration-300">
              <div className="absolute top-1/2 -right-4 -translate-y-1/2 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl group-hover:bg-amber-500/10 transition-all duration-500"></div>
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
                <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-2xl shrink-0">
                  <RefreshCw className="h-6 w-6 text-amber-500 animate-spin" />
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <h3 className="text-sm font-bold text-white flex items-center justify-center sm:justify-start gap-2">
                    Syncing Songs From Server...
                    <span className="bg-amber-500/10 text-amber-450 text-[9px] font-mono font-black px-1.5 py-0.5 rounded border border-amber-500/20 uppercase tracking-wider">Syncing</span>
                  </h3>
                  <p className="text-[11.5px] text-zinc-400 mt-1 select-none font-medium leading-relaxed max-w-xl">
                    We are loading the song catalogue. Your local database cache will update automatically as soon as synchronization is complete.
                  </p>
                </div>
              </div>
            </div>
          )}
          <SongList 
            songs={songs}
            selectedSongId={selectedSongId}
            onSelectSong={(id) => {
              setSongSourceTab('search');
              handleSelectSong(id);
            }}
            onToggleFavorite={handleToggleFavorite}
            onDeleteSong={handleDeleteSong}
            onOpenAddModal={() => setShowAddModal(true)}
            onOpenUploadModal={() => setShowUploadModal(true)}
            onClearLibrary={handleClearLibrary}
            currentRole={currentRole}
          />
        </div>
      )}
    </motion.div>
  );
}


