import React from 'react';
import { Home, BookOpen, Plus, Smartphone } from 'lucide-react';
import { UserRole } from '../../types';

interface MobileBottomNavProps {
  session: { role: UserRole; name?: string } | null;
  activeTab: 'dashboard' | 'search';
  setActiveTab: (tab: 'dashboard' | 'search') => void;
  navigateTo: (tab: 'dashboard' | 'search') => void;
  showInstallBanner: boolean;
  isInstalled: boolean;
  handleInstallApp: () => void;
  setShowAddModal: (show: boolean) => void;
  setSelectedSongId: (id: string | null) => void;
}

export default function MobileBottomNav({
  session,
  activeTab,
  setActiveTab,
  navigateTo,
  showInstallBanner,
  isInstalled,
  handleInstallApp,
  setShowAddModal,
  setSelectedSongId,
}: MobileBottomNavProps) {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-zinc-950/90 border-t border-zinc-800/50 backdrop-blur-xl flex justify-around items-end shadow-[0_-8px_30px_rgba(0,0,0,0.7)] pb-safe animate-slideUp"
      style={{ paddingTop: '10px', paddingBottom: 'max(14px, env(safe-area-inset-bottom, 14px))' }}
    >
      <button
        onClick={() => setActiveTab('dashboard')}
        className={`flex flex-col items-center gap-1 px-5 pt-1 pb-0 text-xs transition-all active-touch cursor-pointer relative min-w-[56px] ${
          activeTab === 'dashboard' ? 'text-amber-500' : 'text-zinc-500'
        }`}
        aria-current={activeTab === 'dashboard' ? 'page' : undefined}
      >
        {activeTab === 'dashboard' && <span className="nav-tab-active-bar" />}
        <Home className={`w-6 h-6 transition-transform duration-200 ${activeTab === 'dashboard' ? 'drop-shadow-[0_0_8px_rgba(245,158,11,0.6)] scale-110' : ''}`} />
        <span className={`text-[11px] font-bold uppercase tracking-wider ${activeTab === 'dashboard' ? 'font-black' : ''}`}>Home</span>
      </button>

      <button
        onClick={() => {
          setSelectedSongId(null);
          navigateTo('search');
        }}
        className={`flex flex-col items-center gap-1 px-5 pt-1 pb-0 text-xs transition-all active-touch cursor-pointer relative min-w-[56px] ${
          activeTab === 'search' ? 'text-amber-500' : 'text-zinc-500'
        }`}
        aria-current={activeTab === 'search' ? 'page' : undefined}
      >
        {activeTab === 'search' && <span className="nav-tab-active-bar" />}
        <BookOpen className={`w-6 h-6 transition-transform duration-200 ${activeTab === 'search' ? 'drop-shadow-[0_0_8px_rgba(245,158,11,0.6)] scale-110' : ''}`} />
        <span className={`text-[11px] font-bold uppercase tracking-wider ${activeTab === 'search' ? 'font-black' : ''}`}>Library</span>
      </button>

      {(session?.role === 'admin' || session?.role === 'guest') && (
        <div className="flex flex-col items-center -mt-5 relative min-w-[64px]">
          <button
            onClick={() => setShowAddModal(true)}
            className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-[0_4px_20px_rgba(245,158,11,0.5),0_2px_8px_rgba(0,0,0,0.6)] active-touch border-2 border-amber-300/20 cursor-pointer"
            title="Add New Song"
          >
            <Plus className="w-7 h-7 text-black stroke-[3]" />
          </button>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mt-1">Add</span>
        </div>
      )}

      {showInstallBanner && !isInstalled && (
        <button
          onClick={handleInstallApp}
          className="flex flex-col items-center gap-1 px-5 pt-1 pb-0 text-xs transition-all active-touch cursor-pointer text-amber-400 min-w-[56px] relative animate-in fade-in"
          title="Install App"
        >
          <Smartphone className="w-6 h-6 text-amber-400" />
          <span className="text-[11px] font-bold uppercase tracking-wider">Install</span>
        </button>
      )}
    </div>
  );
}
