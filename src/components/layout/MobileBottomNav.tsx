import React from 'react';
import { Home, BookOpen, Calendar, Plus, Smartphone } from 'lucide-react';
import { UserRole } from '../../types';

interface MobileBottomNavProps {
  session: { role: UserRole; name?: string } | null;
  activeTab: 'dashboard' | 'search' | 'setlists';
  setActiveTab: (tab: 'dashboard' | 'search' | 'setlists') => void;
  navigateTo: (tab: 'dashboard' | 'search' | 'setlists') => void;
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
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#090A0F]/95 border-t border-[#1E202B] backdrop-blur-xl grid grid-cols-3 items-center shadow-[0_-8px_30px_rgba(0,0,0,0.8)] pb-safe select-none"
      style={{ paddingTop: '8px', paddingBottom: 'max(10px, env(safe-area-inset-bottom, 10px))' }}
    >
      <button
        onClick={() => setActiveTab('dashboard')}
        className={`flex flex-col items-center gap-1 py-1 text-xs transition-all active-touch cursor-pointer relative ${
          activeTab === 'dashboard' ? 'text-amber-500' : 'text-zinc-500'
        }`}
        aria-current={activeTab === 'dashboard' ? 'page' : undefined}
      >
        {activeTab === 'dashboard' && <span className="nav-tab-active-bar" />}
        <Home className={`w-5 h-5 transition-transform duration-200 ${activeTab === 'dashboard' ? 'drop-shadow-[0_0_8px_rgba(245,158,11,0.6)] scale-110' : ''}`} />
        <span className={`text-[10px] font-bold uppercase tracking-wider ${activeTab === 'dashboard' ? 'font-black' : ''}`}>Home</span>
      </button>

      <button
        onClick={() => {
          setSelectedSongId(null);
          navigateTo('search');
        }}
        className={`flex flex-col items-center gap-1 py-1 text-xs transition-all active-touch cursor-pointer relative ${
          activeTab === 'search' ? 'text-amber-500' : 'text-zinc-500'
        }`}
        aria-current={activeTab === 'search' ? 'page' : undefined}
      >
        {activeTab === 'search' && <span className="nav-tab-active-bar" />}
        <BookOpen className={`w-5 h-5 transition-transform duration-200 ${activeTab === 'search' ? 'drop-shadow-[0_0_8px_rgba(245,158,11,0.6)] scale-110' : ''}`} />
        <span className={`text-[10px] font-bold uppercase tracking-wider ${activeTab === 'search' ? 'font-black' : ''}`}>Library</span>
      </button>

      <button
        onClick={() => {
          setSelectedSongId(null);
          navigateTo('setlists');
        }}
        className={`flex flex-col items-center gap-1 py-1 text-xs transition-all active-touch cursor-pointer relative ${
          activeTab === 'setlists' ? 'text-amber-500' : 'text-zinc-500'
        }`}
        aria-current={activeTab === 'setlists' ? 'page' : undefined}
      >
        {activeTab === 'setlists' && <span className="nav-tab-active-bar" />}
        <Calendar className={`w-5 h-5 transition-transform duration-200 ${activeTab === 'setlists' ? 'drop-shadow-[0_0_8px_rgba(245,158,11,0.6)] scale-110' : ''}`} />
        <span className={`text-[10px] font-bold uppercase tracking-wider ${activeTab === 'setlists' ? 'font-black' : ''}`}>Setlists</span>
      </button>
    </div>
  );
}
