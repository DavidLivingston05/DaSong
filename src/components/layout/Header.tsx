import React, { useState, useEffect } from 'react';
import {
  Music, Home, BookOpen, Calendar, Plus, Database, Download,
  Layers, RefreshCw, LogOut, Palette, Sparkles, Check
} from 'lucide-react';
import { UserRole } from '../../types';

interface HeaderProps {
  navigateTo: (tab: 'dashboard' | 'search') => void;
  activeTab: 'dashboard' | 'search';
  selectedSongId: string | null;
  session: { role: UserRole; name?: string } | null;
  activeServerId: string;
  showInstallBanner: boolean;
  isInstalled: boolean;
  handleInstallApp: () => void;
  setShowJoinModal: (show: boolean) => void;
  fetchServers: () => Promise<void>;
  setShowCreateModal: (show: boolean) => void;
  handleForceSync: () => void;
  mongoStatus: 'connecting' | 'connected' | 'error' | 'offline';
  handleLeaveServer: () => void;
  setShowAddModal: (show: boolean) => void;
  setShowUploadModal: (show: boolean) => void;
}

export default function Header({
  navigateTo,
  activeTab,
  selectedSongId,
  session,
  activeServerId,
  showInstallBanner,
  isInstalled,
  handleInstallApp,
  setShowJoinModal,
  fetchServers,
  setShowCreateModal,
  handleForceSync,
  mongoStatus,
  handleLeaveServer,
  setShowAddModal,
  setShowUploadModal,
}: HeaderProps) {
  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    return localStorage.getItem('dasong_visual_theme') || 'amber';
  });
  const [showThemePicker, setShowThemePicker] = useState<boolean>(false);

  const changeTheme = (theme: string) => {
    setCurrentTheme(theme);
    localStorage.setItem('dasong_visual_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  };

  useEffect(() => {
    const saved = localStorage.getItem('dasong_visual_theme') || 'amber';
    document.documentElement.setAttribute('data-theme', saved);
  }, []);
  return (
    <header id="main-header" className={`bg-[#090A0F] border-b border-[#1E202B] text-white z-20 px-6 py-4 relative ${selectedSongId ? 'hidden md:block' : ''}`}>
      <div className="w-full max-w-[1850px] mx-auto flex items-center justify-between gap-6">
        <div
          onClick={() => navigateTo('dashboard')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigateTo('dashboard'); }}
          className="flex items-center space-x-3 select-none transition-all hover:opacity-90 shrink-0 cursor-pointer"
        >
          <div className="h-9 w-9 rounded bg-amber-500 flex items-center justify-center border border-amber-600">
            <Music className="h-5 w-5 text-black stroke-[2.5]" />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-base font-serif font-bold tracking-tight text-white leading-none">DaSong</span>
            <span className="text-[10px] font-mono font-medium uppercase tracking-widest text-zinc-500">Studio</span>
          </div>
        </div>

        <nav className="hidden md:flex items-center space-x-1.5">
          <button
            onClick={() => navigateTo('dashboard')}
            className={`px-4 py-2 rounded text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'dashboard'
                ? 'bg-[#1E202B] text-amber-500 border border-amber-500/25'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1E202B]/40'
            }`}
          >
            <Home className="h-3.5 w-3.5" />
            <span>Home</span>
          </button>
          <button
            onClick={() => navigateTo('search')}
            className={`px-4 py-2 rounded text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'search'
                ? 'bg-[#1E202B] text-amber-500 border border-amber-500/25'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1E202B]/40'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Library</span>
          </button>
        </nav>

        <div className="flex items-center gap-3">
          {activeServerId === 'default' ? (
            <div className="flex items-center gap-2">
              {showInstallBanner && !isInstalled && (
                <button
                  onClick={handleInstallApp}
                  className="hidden sm:flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-450 border border-amber-500/20 px-3.5 py-1.5 rounded text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer active-touch shrink-0"
                  title="Install DaSong Songbook App"
                >
                  <Download className="h-3.5 w-3.5 stroke-[2]" />
                  <span>Install App</span>
                </button>
              )}
              <button
                onClick={() => {
                  setShowJoinModal(true);
                  fetchServers();
                }}
                className="flex items-center gap-1.5 bg-[#12131A] hover:bg-[#1A1C26] border border-[#1E202B] hover:border-emerald-500/35 text-emerald-450 px-3.5 py-1.5 rounded text-[10px] uppercase font-mono tracking-wider transition-all cursor-pointer shrink-0"
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Join Server</span>
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1.5 bg-[#12131A] hover:bg-[#1A1C26] border border-[#1E202B] hover:border-zinc-700 text-zinc-400 hover:text-white px-3.5 py-1.5 rounded text-[10px] uppercase font-mono tracking-wider transition-all cursor-pointer shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Server</span>
              </button>
            </div>
          ) : (
            session && (
              <div className="flex items-center gap-3">
                <button
                  id="mongodb-sync-status-badge"
                  onClick={handleForceSync}
                  disabled={mongoStatus === 'connecting'}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-mono font-bold border transition-all cursor-pointer shrink-0 ${
                    mongoStatus === 'connected'
                      ? 'bg-[#12131A] hover:bg-[#1A1C26] text-emerald-450 border border-emerald-500/20'
                      : mongoStatus === 'connecting'
                        ? 'bg-[#12131A] hover:bg-[#1A1C26] text-amber-450 border border-amber-500/25 animate-pulse'
                        : mongoStatus === 'error'
                          ? 'bg-[#12131A] hover:bg-[#1A1C26] text-rose-455 border-rose-500/20'
                          : 'bg-[#12131A] hover:bg-[#1A1C26] text-zinc-400 border-[#1E202B]'
                  }`}
                  title="Click to Force Sync with Cloud Database"
                >
                  <RefreshCw className={`h-3 w-3 ${mongoStatus === 'connecting' ? 'animate-spin' : ''}`} />
                  <span className="hidden xs:inline">
                    {mongoStatus === 'connected' ? 'Synced' : mongoStatus === 'connecting' ? 'Syncing' : mongoStatus === 'error' ? 'Sync Error' : 'Offline'}
                  </span>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    mongoStatus === 'connected' ? 'bg-emerald-500' :
                    mongoStatus === 'connecting' ? 'bg-amber-500' :
                    mongoStatus === 'error' ? 'bg-rose-500' : 'bg-zinc-650'
                  }`} />
                </button>

                {(session.role === 'admin' || session.role === 'guest') && (
                  <div className="hidden lg:flex items-center gap-2">
                    <button
                      onClick={() => setShowAddModal(true)}
                      className="bg-amber-550/10 hover:bg-amber-550/20 text-amber-400 border border-amber-500/25 px-3.5 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Song</span>
                    </button>

                    <button
                      onClick={() => setShowUploadModal(true)}
                      className="bg-[#12131A] hover:bg-[#1A1C26] text-zinc-400 hover:text-white px-3.5 py-1.5 rounded text-xs font-semibold border border-[#1E202B] transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                    >
                      <Database className="h-3.5 w-3.5 text-amber-555" />
                      <span>Import</span>
                    </button>
                  </div>
                )}

                <div
                  className="flex items-center gap-2 bg-[#12131A] border border-[#1E202B] px-3 py-1.5 rounded shrink-0"
                  title={`${session.role}: ${session.name}`}
                >
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 ${
                    session.role === 'admin'
                      ? 'bg-amber-500/10 text-amber-555 border-amber-500/25'
                      : session.role === 'choir'
                        ? 'bg-emerald-500/10 text-emerald-450 border-emerald-500/25'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                  }`}>
                    {session.role}
                  </span>
                  <span className="hidden sm:inline text-xs text-zinc-300 font-medium max-w-[100px] truncate">
                    {session.name}
                  </span>
                </div>

                {/* 1-Tap Visual UI Theme Selector Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowThemePicker(!showThemePicker)}
                    className="flex items-center gap-1.5 bg-[#12131A] hover:bg-[#1A1C26] border border-[#1E202B] hover:border-amber-500/35 text-amber-400 px-3 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer shrink-0"
                    title="Change App UI Theme & Colors"
                  >
                    <Palette className="h-3.5 w-3.5 text-amber-500" />
                    <span className="hidden sm:inline font-mono uppercase text-[10px]">Theme</span>
                  </button>

                  {showThemePicker && (
                    <div className="absolute right-0 top-full mt-2 w-56 z-50 bg-[#090A0F] border border-amber-500/30 rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.9)] p-2 backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 duration-150 select-none">
                      <div className="px-2.5 py-1.5 mb-1 border-b border-zinc-850 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 font-mono flex items-center gap-1">
                          <Sparkles className="h-3 w-3" /> App Visual Theme
                        </span>
                      </div>
                      <div className="space-y-1">
                        {[
                          { id: 'amber', name: 'Midnight Gold', color: 'bg-amber-500' },
                          { id: 'emerald', name: 'Emerald Sanctuary', color: 'bg-emerald-500' },
                          { id: 'purple', name: 'Royal Majesty', color: 'bg-purple-500' },
                          { id: 'cyan', name: 'Ocean Grace', color: 'bg-cyan-500' },
                          { id: 'crimson', name: 'Velvet Rose', color: 'bg-rose-500' },
                        ].map(t => (
                          <button
                            key={t.id}
                            onClick={() => {
                              changeTheme(t.id);
                              setShowThemePicker(false);
                            }}
                            className={`w-full text-left px-2.5 py-2 rounded text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                              currentTheme === t.id ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'hover:bg-zinc-900 text-zinc-300'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`w-3 h-3 rounded-full ${t.color}`} />
                              <span>{t.name}</span>
                            </div>
                            {currentTheme === t.id && <Check className="h-3.5 w-3.5 text-amber-400" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleLeaveServer}
                  className="flex items-center justify-center p-2 text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 rounded transition-all border border-[#1E202B] hover:border-rose-900/35 cursor-pointer shrink-0"
                  title="Leave Workspace"
                  aria-label="Leave workspace"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )
          )}
        </div>
      </div>
    </header>
  );
}
