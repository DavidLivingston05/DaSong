import React from 'react';
import {
  RefreshCw, X, Smartphone, Download, Music, BookOpen, Plus, Database, LogOut, Sparkles
} from 'lucide-react';
import { UserRole, Song } from '../types';
import { SongMetadata } from '../lib/db';
import { motion } from 'motion/react';
import SongDetail from '../components/SongDetail';
import SongList from '../components/SongList';


import SetlistManager from '../components/SetlistManager';
import { WorshipEvent } from '../types';

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
  setSongSourceTab: (tab: 'search' | 'dashboard') => void;
  setActiveTab: (tab: 'dashboard' | 'search') => void;
  handleSelectSong: (id: string | null) => void;
  stats: { total: number; favorites: number; categories: number };
  recentSongs: SongMetadata[];
  setShowAddModal: (show: boolean) => void;
  setShowUploadModal: (show: boolean) => void;
}

interface SongSearchViewProps {
  selectedSongId: string | null;
  handleSelectSong: (id: string | null) => void;
  songSourceTab: 'search' | 'dashboard';
  setActiveTab: (tab: 'dashboard' | 'search') => void;
  handleEnterStageMode: () => void;
  handleToggleFavorite: (id: string, currentFav: boolean) => void;
  handleSongUpdateOrReview: () => void;
  currentRole: UserRole;
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
  setSongSourceTab,
  setActiveTab,
  handleSelectSong,
  stats,
  recentSongs,
  setShowAddModal,
  setShowUploadModal,
}: DashboardViewProps) {
  const isAdmin = currentRole === 'admin';
  const displaySongs = recentSongs.length > 0 ? recentSongs : songs.slice(0, 6);

  return (
    <motion.div
      key="dashboard"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.18 }}
      className="w-full space-y-6"
    >
      {/* 👑 HERO SECTION */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-950/40 via-zinc-900 to-zinc-950 border border-amber-500/20 p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md uppercase tracking-wider">
                SERVER: {activeServerId ? activeServerId.toUpperCase() : 'LOCAL-ONLY'}
              </span>
              <span className={`px-2.5 py-1 text-xs font-mono font-bold rounded-md border uppercase tracking-wider ${
                isAdmin 
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' 
                  : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
              }`}>
                ROLE: {isAdmin ? 'ADMINISTRATOR' : currentRole === 'choir' ? 'CHOIR MEMBER' : 'GUEST'}
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md uppercase tracking-wider">
                <span className={`w-2 h-2 rounded-full ${mongoStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                {mongoStatus === 'connected' ? 'CLOUD SYNCED' : mongoStatus === 'connecting' ? 'SYNCING...' : 'LOCAL WORKSPACE'}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white pt-1">
              Welcome back, <span className="text-amber-400">{session?.name || (isAdmin ? 'Administrator' : currentRole === 'choir' ? 'Choir Vocalist' : 'Worshipper')}</span>
            </h1>
            <p className="text-zinc-400 text-sm max-w-2xl leading-relaxed">
              {isAdmin 
                ? 'Manage worship song catalog, compose lyrics, and broadcast stage projections.' 
                : 'Access assigned worship lyrics, review musical keys, and join live display sync.'}
            </p>
          </div>

          {/* Hero Quick Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {isAdmin ? (
              <>
                <button 
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-xs transition-all shadow-lg shadow-amber-500/20 cursor-pointer active-touch"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  Add New Song
                </button>
                <button 
                  onClick={() => setShowUploadModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-850 text-zinc-200 border border-zinc-700 font-bold rounded-xl text-xs transition-all cursor-pointer active-touch"
                >
                  <Database className="w-4 h-4 text-amber-400" />
                  Import File
                </button>
              </>
            ) : (
              <button 
                onClick={() => handleToggleFollow(!isFollowing)}
                className={`flex items-center gap-2 px-5 py-2.5 font-bold rounded-xl text-xs transition-all cursor-pointer active-touch ${
                  isFollowing 
                    ? 'bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/20' 
                    : 'bg-amber-500 hover:bg-amber-400 text-zinc-950'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                {isFollowing ? 'Following Live Projection...' : 'Join Stage Projection Stream'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Guest Role Welcome Callout */}
      {currentRole === 'guest' && renderGuestWelcome()}

      {/* App Install Banner */}
      {showInstallBanner && !isInstalled && !dismissedInstall && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-550/5 to-transparent border border-amber-500/20 p-4 md:p-5 rounded-xl relative overflow-hidden group text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-500 shrink-0">
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-wide">Install DaSong Studio PWA</h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  Install on your device for instant offline access, stage display, and quick launch.
                </p>
              </div>
            </div>
            <button 
              onClick={handleDismissInstall}
              className="text-zinc-500 hover:text-white p-1 transition-colors cursor-pointer"
              aria-label="Dismiss banner"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button 
              onClick={handleDismissInstall}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              Maybe Later
            </button>
            <button 
              onClick={handleInstallApp}
              className="flex-1 sm:flex-none bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-amber-500/15 active-touch"
            >
              <Download className="h-3.5 w-3.5 stroke-[3]" /> Install Now
            </button>
          </div>
        </div>
      )}

      {/* 📊 METRICS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 select-none text-left">
        
        <div 
          onClick={() => setActiveTab('search')}
          className="p-5 rounded-xl bg-[#12131A] border border-[#1E202B] hover:border-amber-500/35 transition-all flex justify-between items-center shadow-lg cursor-pointer group active-touch"
        >
          <div>
            <p className="text-xs font-mono uppercase text-zinc-400 tracking-wider font-bold">Song Catalog</p>
            <h3 className="text-3xl font-bold text-white mt-1 group-hover:text-amber-400 transition-colors">{stats.total.toLocaleString()}</h3>
            <p className="text-xs text-zinc-500 mt-1">Ready for Stage & Practice</p>
          </div>
          <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400 group-hover:scale-110 transition-transform">
            <BookOpen className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-xl bg-[#12131A] border border-[#1E202B] flex justify-between items-center shadow-lg">
          <div>
            <p className="text-xs font-mono uppercase text-zinc-400 tracking-wider font-bold">Stage Sync Status</p>
            <h3 className={`text-xl font-bold mt-1 uppercase font-mono ${isFollowing ? 'text-emerald-400' : 'text-zinc-300'}`}>
              {isFollowing ? 'ACTIVE FOLLOW' : 'STANDBY'}
            </h3>
            <p className="text-xs text-zinc-500 mt-1">Auto-syncs screen with master display</p>
          </div>
          <div className={`p-3 rounded-xl border ${isFollowing ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400'}`}>
            <Smartphone className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-xl bg-[#12131A] border border-[#1E202B] flex justify-between items-center shadow-lg sm:col-span-2 lg:col-span-1">
          <div>
            <p className="text-xs font-mono uppercase text-zinc-400 tracking-wider font-bold">Workspace Server</p>
            <h3 className="text-xl font-bold text-amber-400 mt-1 uppercase font-mono">
              {activeServerId || 'LOCAL MODE'}
            </h3>
            <p className="text-xs text-zinc-500 mt-1">Active Network Workspace Node</p>
          </div>
          <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20 text-blue-400">
            <Music className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* 📡 BROADCAST CONTROL BANNER */}
      <div className="p-5 rounded-xl bg-[#12131A] border border-[#1E202B] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 select-none text-left">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isFollowing ? 'bg-emerald-400 animate-ping' : 'bg-zinc-600'}`} />
          <div>
            <h4 className="font-bold text-white text-sm tracking-wide">LIVE BROADCAST FOLLOW MODE</h4>
            <p className="text-xs text-zinc-400 mt-0.5">Automatically sync active lyrics on your phone with main stage display screen.</p>
          </div>
        </div>
        <button 
          onClick={() => handleToggleFollow(!isFollowing)}
          className={`px-4 py-2 font-mono font-bold text-xs rounded-xl transition-all border cursor-pointer active-touch shrink-0 ${
            isFollowing 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20' 
              : 'bg-zinc-900 text-zinc-200 border-zinc-700 hover:bg-zinc-850'
          }`}
        >
          {isFollowing ? 'DISABLE FOLLOW MODE' : 'ENABLE FOLLOW MODE'}
        </button>
      </div>

      {/* 🎵 RECENTLY PREPARED LYRICS SECTION */}
      {displaySongs.length > 0 && (
        <div className="space-y-4 text-left select-none">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2 tracking-tight">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Recently Prepared Lyrics
            </h2>
            <button
              onClick={() => setActiveTab('search')}
              className="text-xs font-mono text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer"
            >
              View Full Library →
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displaySongs.map(song => (
              <div 
                key={song.id}
                onClick={() => {
                  setActiveTab('search');
                  setSongSourceTab('search');
                  handleSelectSong(song.id);
                }}
                className="p-5 rounded-xl bg-[#12131A] border border-[#1E202B] hover:border-amber-500/40 transition-all space-y-3 cursor-pointer group shadow-lg flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="font-bold text-sm text-zinc-100 group-hover:text-amber-400 transition-colors truncate">
                        {song.title}
                      </h4>
                      <p className="text-xs text-zinc-400 mt-0.5 truncate font-mono">
                        {song.author || 'Traditional'} • Key: <span className="text-amber-400 font-bold">{song.key || 'G'}</span>
                      </p>
                    </div>
                  </div>

                  {song.lyricsSnippet && (
                    <div className="p-3 bg-[#090A0F] rounded-lg border border-[#1E202B] font-mono text-[11px] text-zinc-300 italic line-clamp-2 leading-relaxed">
                      "{song.lyricsSnippet}"
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-zinc-500 pt-2 border-t border-[#1E202B]/60">
                  <span className="font-mono text-[10px] uppercase">Songsheet View</span>
                  <div className="flex items-center gap-1 text-amber-400 font-mono text-[11px] font-bold group-hover:translate-x-0.5 transition-transform">
                    <span>Open Sheet</span>
                    <span>→</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </motion.div>
  );
}

export function SongSearchView({
  selectedSongId,
  handleSelectSong,
  songSourceTab,
  setActiveTab,
  handleEnterStageMode,
  handleToggleFavorite,
  handleSongUpdateOrReview,
  currentRole,
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
            backLabel="Back to Library"
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

interface SetlistManagerViewProps {
  currentRole: UserRole;
  events: WorshipEvent[];
  songsCatalog: SongMetadata[];
  onRefreshEvents: () => void;
  onSelectSong: (id: string) => void;
  onEnterStageMode?: () => void;
  selectedSongId: string | null;
  handleSelectSong: (id: string | null) => void;
  handleToggleFavorite: (id: string, currentFav: boolean) => void;
  handleSongUpdateOrReview: () => void;
  favoriteSongIds: Set<string>;
  onExportSong?: (song: Song) => void;
}

export function SetlistManagerView({
  currentRole,
  events,
  songsCatalog,
  onRefreshEvents,
  onSelectSong,
  onEnterStageMode,
  selectedSongId,
  handleSelectSong,
  handleToggleFavorite,
  handleSongUpdateOrReview,
  favoriteSongIds,
  onExportSong,
}: SetlistManagerViewProps) {
  return (
    <motion.div
      key="setlists"
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
            onClose={() => handleSelectSong(null)}
            onEnterStageMode={onEnterStageMode || (() => {})}
            onToggleFavorite={handleToggleFavorite}
            onLyricsUpdated={handleSongUpdateOrReview}
            onSelectSong={onSelectSong}
            currentRole={currentRole}
            backLabel="Back to Setlists"
            songsMetadata={songsCatalog}
            isFavorite={favoriteSongIds.has(selectedSongId)}
            onExportSong={onExportSong}
          />
        </div>
      ) : (
        <SetlistManager
          currentRole={currentRole}
          events={events}
          songsCatalog={songsCatalog}
          onRefreshEvents={onRefreshEvents}
          onSelectSong={onSelectSong}
          onEnterStageMode={onEnterStageMode}
        />
      )}
    </motion.div>
  );
}
