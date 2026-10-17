import React, { useState, useEffect } from 'react';
import {
  Music, Home, BookOpen, Calendar, Plus, Database, Download,
  RefreshCw, LogOut, Palette, ShieldCheck
} from 'lucide-react';
import { UserRole } from '../../types';
import ColorPickerModal from '../modals/ColorPickerModal';
import { applyAccentThemeColor } from '../../utils/colorUtils';

interface HeaderProps {
  navigateTo: (tab: 'dashboard' | 'search' | 'setlists') => void;
  activeTab: 'dashboard' | 'search' | 'setlists';
  selectedSongId: string | null;
  session: { role: UserRole; name?: string } | null;
  showInstallBanner: boolean;
  isInstalled: boolean;
  handleInstallApp: () => void;
  handleForceSync: () => void;
  handleForceUpdateApp?: () => void;
  mongoStatus: 'connecting' | 'connected' | 'error' | 'offline';
  setShowAdminLoginModal: (show: boolean) => void;
  handleLogoutAdmin: () => void;
  setShowAddModal: (show: boolean) => void;
  setShowUploadModal: (show: boolean) => void;
}

export default function Header({
  navigateTo,
  activeTab,
  selectedSongId,
  session,
  showInstallBanner,
  isInstalled,
  handleInstallApp,
  handleForceSync,
  handleForceUpdateApp,
  mongoStatus,
  setShowAdminLoginModal,
  handleLogoutAdmin,
  setShowAddModal,
  setShowUploadModal,
}: HeaderProps) {
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
  const [currentColorHex, setCurrentColorHex] = useState<string>(() => {
    return localStorage.getItem('dasong_custom_accent_color') || '#F59E0B';
  });

  const isAdmin = session?.role === 'admin';

  useEffect(() => {
    const savedCustomColor = localStorage.getItem('dasong_custom_accent_color');
    const savedTheme = localStorage.getItem('dasong_visual_theme');
    if (savedCustomColor) {
      applyAccentThemeColor(savedCustomColor);
      setCurrentColorHex(savedCustomColor);
    } else if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  }, []);

  return (
    <header id="main-header" className={`bg-[#090A0F] border-b border-[#1E202B] text-white z-20 px-4 sm:px-6 py-3.5 relative ${selectedSongId ? 'hidden md:block' : ''}`}>
      <div className="w-full max-w-[1850px] mx-auto flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <div
          onClick={() => navigateTo('dashboard')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigateTo('dashboard'); }}
          className="flex items-center space-x-3 select-none transition-all hover:opacity-90 shrink-0 cursor-pointer"
        >
          <div className="h-9 w-9 rounded-xl bg-amber-500 flex items-center justify-center border border-amber-600 shadow-md shadow-amber-500/10">
            <Music className="h-5 w-5 text-black stroke-[2.5]" />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-base font-serif font-bold tracking-tight text-white leading-none">DaSong</span>
            <span className="text-[10px] font-mono font-medium uppercase tracking-widest text-zinc-500">Studio</span>
          </div>
        </div>

        {/* Centered Navigation Tabs */}
        <nav className="hidden md:flex items-center space-x-1.5">
          <button
            onClick={() => navigateTo('dashboard')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'dashboard'
                ? 'bg-[#1E202B] text-amber-500 border border-amber-500/25 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1E202B]/40'
            }`}
          >
            <Home className="h-3.5 w-3.5" />
            <span>Home</span>
          </button>
          <button
            onClick={() => navigateTo('search')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'search'
                ? 'bg-[#1E202B] text-amber-500 border border-amber-500/25 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1E202B]/40'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Library</span>
          </button>
          <button
            onClick={() => navigateTo('setlists')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'setlists'
                ? 'bg-[#1E202B] text-amber-500 border border-amber-500/25 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1E202B]/40'
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>Setlists</span>
          </button>
        </nav>

        {/* Right Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Cloud Sync Status Badge */}
          <button
            id="mongodb-sync-status-badge"
            onClick={handleForceSync}
            disabled={mongoStatus === 'connecting'}
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold border transition-all cursor-pointer shrink-0 ${
              mongoStatus === 'connected'
                ? 'bg-[#12131A] hover:bg-[#1A1C26] text-emerald-450 border-emerald-500/20'
                : mongoStatus === 'connecting'
                  ? 'bg-[#12131A] hover:bg-[#1A1C26] text-amber-450 border-amber-500/25 animate-pulse'
                  : mongoStatus === 'error'
                    ? 'bg-[#12131A] hover:bg-[#1A1C26] text-rose-455 border-rose-500/20'
                    : 'bg-[#12131A] hover:bg-[#1A1C26] text-zinc-400 border-[#1E202B]'
            }`}
            title="Click to Force Sync with Cloud Database"
          >
            <RefreshCw className={`h-3 w-3 ${mongoStatus === 'connecting' ? 'animate-spin' : ''}`} />
            <span>{mongoStatus === 'connected' ? 'Synced' : mongoStatus === 'connecting' ? 'Syncing' : mongoStatus === 'error' ? 'Sync Error' : 'Local'}</span>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              mongoStatus === 'connected' ? 'bg-emerald-500' :
              mongoStatus === 'connecting' ? 'bg-amber-500' :
              mongoStatus === 'error' ? 'bg-rose-500' : 'bg-zinc-600'
            }`} />
          </button>

          {/* Install App Button */}
          {showInstallBanner && !isInstalled && (
            <button
              onClick={handleInstallApp}
              className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer active-touch shrink-0"
              title="Install DaSong Songbook App"
            >
              <Download className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="hidden xs:inline">Install</span>
            </button>
          )}

          {/* Admin Action Buttons */}
          {isAdmin ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddModal(true)}
                className="hidden lg:flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/25 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Song</span>
              </button>
              <button
                onClick={() => setShowUploadModal(true)}
                className="hidden lg:flex items-center gap-1.5 bg-[#12131A] hover:bg-[#1A1C26] text-zinc-300 hover:text-white px-3 py-1.5 rounded-xl text-xs font-bold border border-[#1E202B] transition-all cursor-pointer"
              >
                <Database className="h-3.5 w-3.5 text-amber-500" />
                <span>Import</span>
              </button>

              {/* Admin Role Badge + Logout */}
              <div className="flex items-center gap-1.5 bg-[#12131A] border border-amber-500/30 px-2.5 sm:px-3 py-1.5 rounded-xl shrink-0">
                <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">Admin</span>
                <button
                  onClick={handleLogoutAdmin}
                  className="ml-1 p-0.5 text-zinc-400 hover:text-rose-400 rounded transition-colors cursor-pointer"
                  title="Switch to User Mode"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAdminLoginModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#12131A] hover:bg-[#1A1C26] text-amber-400 border border-amber-500/25 hover:border-amber-500/50 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm active-touch"
                title="Login as Administrator"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Admin Login</span>
              </button>
            </div>
          )}

          {/* Interactive Colour Picker Launcher */}
          <div className="relative flex items-center gap-1.5">
            {handleForceUpdateApp && (
              <button
                onClick={handleForceUpdateApp}
                className="p-2 bg-[#12131A] hover:bg-[#1A1C26] border border-[#1E202B] hover:border-amber-500/30 text-amber-500 rounded-xl transition-all cursor-pointer active-touch"
                title="Purge Cache & Reload Newest Version"
                aria-label="Purge Cache & Reload Newest Version"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => setShowColorPicker(true)}
              className="p-2 bg-[#12131A] hover:bg-[#1A1C26] border border-[#1E202B] hover:border-amber-500/30 text-amber-500 rounded-xl transition-all cursor-pointer active-touch flex items-center gap-1.5 group"
              title="Open Full Colour Picker"
              aria-label="Open Full Colour Picker"
            >
              <div
                className="w-3.5 h-3.5 rounded-full border border-white/30 shadow-sm"
                style={{ backgroundColor: currentColorHex }}
              />
              <Palette className="h-4 w-4 text-amber-400 group-hover:rotate-12 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* Full Google-Style Colour Picker Modal */}
      <ColorPickerModal
        isOpen={showColorPicker}
        onClose={() => setShowColorPicker(false)}
        currentColorHex={currentColorHex}
        onColorChange={(hex) => {
          setCurrentColorHex(hex);
        }}
      />
    </header>
  );
}
