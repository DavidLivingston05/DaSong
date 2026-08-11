import React, { useState, useEffect } from 'react';
import {
  Music, Home, BookOpen, Calendar, Plus, Database, Download,
  Layers, RefreshCw, LogOut, Palette, Sparkles, Check
} from 'lucide-react';
import { UserRole } from '../../types';

interface HeaderProps {
  navigateTo: (tab: 'dashboard' | 'search' | 'setlists') => void;
  activeTab: 'dashboard' | 'search' | 'setlists';
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
  handleForceUpdateApp?: () => void;
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
  handleForceUpdateApp,
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
          <button
            onClick={() => navigateTo('setlists')}
            className={`px-4 py-2 rounded text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'setlists'
                ? 'bg-[#1E202B] text-amber-500 border border-amber-500/25'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1E202B]/40'
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>Setlists</span>
          </button>
        </nav>

        <div className="flex items-center gap-3">
          {activeServerId === 'default' ? (
            <div className="flex items-center gap-2">
              {!isInstalled && (
                <button
                  onClick={handleInstallApp}
                  className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-450 border border-amber-500/20 px-2.5 sm:px-3.5 py-1.5 rounded text-xs font-medium transition-all cursor-pointer active-touch shrink-0"
                  title="Install DaSong Songbook App"
                >
                  <Download className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span className="hidden xs:inline">Install</span>
                </button>
              )}
              <button
                onClick={() => setShowJoinModal(true)}
                className="px-2.5 sm:px-3.5 py-1.5 bg-[#12131A] hover:bg-[#1A1C26] text-zinc-300 hover:text-white border border-[#272A37] hover:border-amber-500/35 rounded text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active-touch font-medium"
                title="Join Workspaces"
              >
                <Database className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span className="hidden sm:inline">Join Server</span>
              </button>
              {(session?.role === 'admin' || session?.role === 'guest') && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-2.5 sm:px-3.5 py-1.5 bg-[#12131A] hover:bg-[#1A1C26] text-amber-500 hover:text-amber-400 border border-amber-500/25 hover:border-amber-500/50 rounded text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active-touch font-medium"
                  title="Create Workspace"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">Add Server</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="bg-[#12131A] border border-amber-500/30 px-3 py-1 rounded text-xs flex items-center gap-2 text-amber-400 font-mono">
                <Layers className="h-3.5 w-3.5 text-amber-500" />
                <span className="font-bold uppercase tracking-wider">{activeServerId}</span>
              </div>
              <button
                onClick={handleForceSync}
                className="p-2 bg-[#12131A] hover:bg-[#1A1C26] border border-[#272A37] text-zinc-400 hover:text-white rounded transition-colors cursor-pointer"
                title="Force Sync With Server"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${mongoStatus === 'connecting' ? 'animate-spin text-amber-500' : ''}`} />
              </button>
              <button
                onClick={handleLeaveServer}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-red-950/30 text-zinc-400 hover:text-red-400 border border-zinc-800 hover:border-red-900/50 rounded text-xs transition-colors cursor-pointer flex items-center gap-1"
                title="Leave Server & Return to Local Mode"
              >
                <LogOut className="h-3.5 w-3.5" /> Leave Workspace
              </button>
            </div>
          )}

          {/* Visual Theme Selector Menu */}
          <div className="relative flex items-center gap-1.5">
            {handleForceUpdateApp && (
              <button
                onClick={handleForceUpdateApp}
                className="p-2 bg-[#12131A] hover:bg-[#1A1C26] border border-[#272A37] hover:border-amber-500/30 text-amber-500 rounded transition-all cursor-pointer active-touch"
                title="Purge Cache & Reload Newest Version"
                aria-label="Purge Cache & Reload Newest Version"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => setShowThemePicker(!showThemePicker)}
              className="p-2 bg-[#12131A] hover:bg-[#1A1C26] border border-[#272A37] hover:border-amber-500/30 text-amber-500 rounded transition-all cursor-pointer active-touch"
              title="Change Visual Accent Theme"
              aria-label="Change Visual Accent Theme"
            >
              <Palette className="h-4 w-4" />
            </button>

            {showThemePicker && (
              <div className="absolute right-0 mt-2 w-48 bg-[#12131A] border border-[#1E202B] rounded-xl shadow-2xl z-50 p-2 space-y-1 animate-in fade-in slide-in-from-top-2 duration-150 select-none">
                <div className="px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1 border-b border-zinc-900 pb-1.5 mb-1">
                  <Sparkles className="w-3 h-3 text-amber-500" /> Visual Accent Theme
                </div>
                {[
                  { id: 'amber', label: 'Gold Amber', color: 'bg-amber-500' },
                  { id: 'emerald', label: 'Worship Emerald', color: 'bg-emerald-500' },
                  { id: 'cyan', label: 'Electric Cyan', color: 'bg-cyan-500' },
                  { id: 'purple', label: 'Royal Purple', color: 'bg-purple-500' },
                  { id: 'crimson', label: 'Deep Crimson', color: 'bg-rose-500' },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      changeTheme(t.id);
                      setShowThemePicker(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                      currentTheme === t.id ? 'bg-[#1A1C26] text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${t.color}`} />
                      <span>{t.label}</span>
                    </div>
                    {currentTheme === t.id && <Check className="w-3.5 h-3.5 text-amber-500 stroke-[3]" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
