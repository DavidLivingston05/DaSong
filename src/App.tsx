import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { 
  Music, Sparkles, Sliders, Play, Settings, Plus, Star, Heart, 
  Trash2, X, AlertCircle, RefreshCw, Check, BookOpen, Database,
  ChevronRight, HelpCircle, Download, Smartphone,
  Home, Search, LogOut, ShieldCheck, User, Radio
} from 'lucide-react';
import { Song, UserRole, Setlist } from './types';
import { 
  initDB, 
  getAllSongsMetadata, 
  getSongById, 
  saveSong, 
  deleteSong, 
  clearAllSongs, 
  SongMetadata,
  syncWithMongoDB,
  getBroadcastState,
  getSetlists,
  fetchSetlistsFromCloud
} from './lib/db';
import Header from './components/layout/Header';
import MobileBottomNav from './components/layout/MobileBottomNav';
import { DashboardView, SongSearchView, SetlistManagerView } from './views/AppViews';
import AddSongModal from './components/modals/AddSongModal';
import BulkUploadModal from './components/modals/BulkUploadModal';
import AdminLoginModal from './components/modals/AdminLoginModal';
import IOSInstallModal from './components/modals/IOSInstallModal';
import { AnimatePresence, motion } from 'motion/react';

const StageMode = lazy(() => import('./components/StageMode'));

const ViewFallback = () => (
  <div className="flex items-center justify-center min-h-[300px] w-full p-8">
    <div className="flex flex-col items-center gap-3 text-zinc-400">
      <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-xs tracking-wider uppercase font-medium">Loading View...</span>
    </div>
  </div>
);

interface AppHistoryState {
  id: string;
  tab: 'dashboard' | 'search' | 'setlists';
  songId: string | null;
  stageMode: boolean;
  modal: 'add' | 'upload' | 'admin' | null;
  searchQuery?: string;
}

export default function App() {
  const [songs, setSongs] = useState<SongMetadata[]>([]);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [recentSongIds, setRecentSongIds] = useState<string[]>([]);
  const [mongoStatus, setMongoStatus] = useState<'connecting' | 'connected' | 'error' | 'offline'>('connecting');

  // Persisted search query & filter states
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    return sessionStorage.getItem('dasong_search_query') || '';
  });
  const [filterFavorites, setFilterFavorites] = useState<boolean>(() => {
    return sessionStorage.getItem('dasong_search_favorites') === 'true';
  });

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    sessionStorage.setItem('dasong_search_query', query);
  }, []);

  const handleFilterFavoritesChange = useCallback((filter: boolean) => {
    setFilterFavorites(filter);
    sessionStorage.setItem('dasong_search_favorites', filter ? 'true' : 'false');
  }, []);

  // Authentication session tracking (Admin vs User only)
  interface UserSession {
    role: UserRole;
    name?: string;
  }

  const [session, setSession] = useState<UserSession>(() => {
    const savedRole = localStorage.getItem('dasong_user_role');
    const savedName = localStorage.getItem('dasong_user_name');
    if (savedRole === 'admin') {
      return {
        role: 'admin',
        name: savedName || 'Administrator'
      };
    }
    return {
      role: 'user',
      name: savedName || 'User'
    };
  });

  const currentRole = session.role;

  const [favoriteSongIds, setFavoriteSongIds] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('dasong_favorites');
    return saved ? new Set(JSON.parse(saved)) : new Set<string>();
  });

  const [showAdminLoginModal, setShowAdminLoginModal] = useState<boolean>(false);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);

  // PWA Installation & OS Detection States
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState<boolean>(false);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState<boolean>(false);
  const [dismissedInstall, setDismissedInstall] = useState<boolean>(() => {
    return localStorage.getItem('dasong_dismiss_install') === 'true';
  });

  const [isFollowing, setIsFollowing] = useState<boolean>(() => {
    return localStorage.getItem('dasong_live_follow') === 'true';
  });
  const [adminBroadcast, setAdminBroadcast] = useState<{ songId: string; songTitle?: string } | null>(null);
  const [dismissedBroadcastSongId, setDismissedBroadcastSongId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'search' | 'setlists'>('search');
  const [songSourceTab, setSongSourceTab] = useState<'search' | 'dashboard'>('search');

  const navigateTo = useCallback((tab: 'dashboard' | 'search' | 'setlists') => {
    setActiveTab(tab);
  }, []);

  const [stageModeSong, setStageModeSong] = useState<Song | null>(null);

  // Setlist state
  const [setlists, setSetlists] = useState<Setlist[]>(() => getSetlists());
  const [activeSetlistQueue, setActiveSetlistQueue] = useState<string[] | null>(null);

  const refreshSetlists = useCallback(async () => {
    try {
      const cloudList = await fetchSetlistsFromCloud();
      setSetlists(cloudList);
    } catch {
      setSetlists(getSetlists());
    }
  }, []);

  // Manual Add Form structure
  const [addForm, setAddForm] = useState({
    title: '',
    author: '',
    key: 'G',
    lyrics: ''
  });

  const historyStackRef = useRef<AppHistoryState[]>([]);
  const currentStackIndexRef = useRef<number>(-1);
  const isPoppingStateRef = useRef<boolean>(false);

  // Handle browser navigation & back button
  useEffect(() => {
    const initialState: AppHistoryState = {
      id: Math.random().toString(36).substring(2),
      tab: activeTab,
      songId: selectedSongId,
      stageMode: stageModeSong !== null,
      modal: showAddModal ? 'add' :
             showUploadModal ? 'upload' :
             showAdminLoginModal ? 'admin' : null,
      searchQuery: searchQuery
    };

    history.replaceState(initialState, '', window.location.pathname + window.location.search);
    historyStackRef.current = [initialState];
    currentStackIndexRef.current = 0;

    const handlePopState = (e: PopStateEvent) => {
      const state = e.state as AppHistoryState | null;
      if (!state || !state.id) return;

      const foundIdx = historyStackRef.current.findIndex(s => s.id === state.id);
      if (foundIdx !== -1) {
        currentStackIndexRef.current = foundIdx;
        isPoppingStateRef.current = true;

        setActiveTab(state.tab);
        setSelectedSongId(state.songId);

        if (state.searchQuery !== undefined) {
          setSearchQuery(state.searchQuery);
          sessionStorage.setItem('dasong_search_query', state.searchQuery);
        }

        if (state.stageMode && state.songId) {
          getSongById(state.songId).then(fullSong => {
            if (fullSong) {
              setStageModeSong(fullSong);
            }
          }).catch(err => {
            console.error("Failed to restore stage mode song:", err);
            setStageModeSong(null);
          });
        } else {
          setStageModeSong(null);
        }

        setShowAddModal(state.modal === 'add');
        setShowUploadModal(state.modal === 'upload');
        setShowAdminLoginModal(state.modal === 'admin');

        setTimeout(() => {
          isPoppingStateRef.current = false;
        }, 50);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Back button handler: traverses back through song history or returns to library
  const handleBack = useCallback(() => {
    if (window.history.length > 1 && currentStackIndexRef.current > 0) {
      window.history.back();
    } else {
      setSelectedSongId(null);
    }
  }, []);

  // Update history state on navigation
  useEffect(() => {
    if (isPoppingStateRef.current) return;

    const topState = historyStackRef.current[currentStackIndexRef.current];
    const currentModal = showAddModal ? 'add' :
                         showUploadModal ? 'upload' :
                         showAdminLoginModal ? 'admin' : null;

    if (
      !topState ||
      topState.tab !== activeTab ||
      topState.songId !== selectedSongId ||
      topState.stageMode !== (stageModeSong !== null) ||
      topState.modal !== currentModal
    ) {
      const newState: AppHistoryState = {
        id: Math.random().toString(36).substring(2),
        tab: activeTab,
        songId: selectedSongId,
        stageMode: stageModeSong !== null,
        modal: currentModal,
        searchQuery: searchQuery
      };

      if (historyStackRef.current.length > 0) {
        historyStackRef.current = historyStackRef.current.slice(0, currentStackIndexRef.current + 1);
        historyStackRef.current.push(newState);
        currentStackIndexRef.current = historyStackRef.current.length - 1;
        history.pushState(newState, '', window.location.pathname + window.location.search);
      }
    }
  }, [
    activeTab,
    selectedSongId,
    stageModeSong,
    showAddModal,
    showUploadModal,
    showAdminLoginModal,
    searchQuery
  ]);

  // Load & sync songs metadata
  const syncSongsList = useCallback(async () => {
    try {
      const list = await getAllSongsMetadata();
      const savedFavs = localStorage.getItem('dasong_favorites');
      const favIds = savedFavs ? new Set<string>(JSON.parse(savedFavs)) : new Set<string>();

      const mappedList = list.map(s => ({
        ...s,
        favorite: favIds.has(s.id)
      }));

      // Sort primarily by favorites, then title
      const sorted = [...mappedList].sort((a, b) => {
        if (a.favorite && !b.favorite) return -1;
        if (!a.favorite && b.favorite) return 1;
        return (a.title || '').localeCompare(b.title || '');
      });
      setSongs(sorted);
    } catch (err) {
      console.error('Error syncing database stats:', err);
    }
  }, []);

  const handleSongUpdateOrReview = useCallback(async () => {
    await syncSongsList();
  }, [syncSongsList]);

  // MongoDB sync background worker
  const triggerMongoSync = useCallback(async () => {
    setMongoStatus('connecting');
    try {
      await syncWithMongoDB();
      await syncSongsList();
      await refreshSetlists();
      setMongoStatus('connected');
    } catch (err) {
      console.error('Failed to synchronize with MongoDB Cloud:', err);
      setMongoStatus('error');
    }
  }, [syncSongsList, refreshSetlists]);

  // Initialize DB and Cloud sync on mount
  useEffect(() => {
    const initApp = async () => {
      try {
        await initDB();
        await syncSongsList();
        await refreshSetlists();
        triggerMongoSync();
      } catch (err) {
        console.error('Database initialization error:', err);
      }
    };
    initApp();
  }, [syncSongsList, refreshSetlists, triggerMongoSync]);

  // Handle shared link query parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const querySong = params.get('song');
    if (querySong) {
      setSelectedSongId(querySong);
      const cleanUrl = window.location.pathname;
      history.replaceState(history.state, '', cleanUrl);
    }
  }, []);

  // PWA & Service Worker setup
  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    if (isStandalone) {
      setIsInstalled(true);
    }

    const ua = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    if (isIOSDevice && !isStandalone && !dismissedInstall) {
      setShowInstallBanner(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!dismissedInstall) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowInstallBanner(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [dismissedInstall]);

  const handleInstallApp = async () => {
    if (isIOS) {
      setShowIOSInstructions(true);
      return;
    }
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setShowInstallBanner(false);
      }
      setDeferredPrompt(null);
    } else {
      setShowIOSInstructions(true);
    }
  };

  const handleDismissInstall = () => {
    setShowInstallBanner(false);
    setDismissedInstall(true);
    localStorage.setItem('dasong_dismiss_install', 'true');
  };

  // Live Broadcast follower & invitation detection
  useEffect(() => {
    let active = true;

    const checkBroadcast = async () => {
      try {
        const isBroadcaster = localStorage.getItem('dasong_live_broadcast') === 'true';
        if (isBroadcaster) {
          if (adminBroadcast) setAdminBroadcast(null);
          return;
        }

        const state = await getBroadcastState();
        if (!active) return;

        if (state && state.songId && typeof state.activeLineIndex === 'number' && state.activeLineIndex >= 0) {
          // If already following, immediately synchronize/teleport to song
          if (isFollowing) {
            if (selectedSongId !== state.songId) {
              setSelectedSongId(state.songId);
              setActiveTab('search');
            }
            if (adminBroadcast) setAdminBroadcast(null);
            return;
          }

          // If not following:
          if (selectedSongId === state.songId) {
            // Already viewing this exact song
            if (adminBroadcast) setAdminBroadcast(null);
            return;
          }

          // If dismissed for this song, do not prompt again for the same song
          if (dismissedBroadcastSongId === state.songId) {
            return;
          }

          const match = songs.find(s => s.id === state.songId);
          setAdminBroadcast({
            songId: state.songId,
            songTitle: match ? match.title : 'Live Worship Song'
          });
        } else {
          // Broadcast stopped by admin
          if (adminBroadcast) setAdminBroadcast(null);
          if (dismissedBroadcastSongId) setDismissedBroadcastSongId(null);
        }
      } catch (err) {
        console.warn('Follow mode check error:', err);
      }
    };

    checkBroadcast();
    const interval = setInterval(checkBroadcast, 2200);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isFollowing, selectedSongId, songs, dismissedBroadcastSongId, adminBroadcast]);

  const handleAcceptFollow = () => {
    if (!adminBroadcast) return;
    const targetSongId = adminBroadcast.songId;
    setIsFollowing(true);
    localStorage.setItem('dasong_live_follow', 'true');
    setAdminBroadcast(null);
    setSelectedSongId(targetSongId);
    setActiveTab('search');
  };

  const handleDismissFollow = () => {
    if (adminBroadcast) {
      setDismissedBroadcastSongId(adminBroadcast.songId);
      setAdminBroadcast(null);
    }
  };

  const handleToggleFollow = async (val: boolean) => {
    setIsFollowing(val);
    localStorage.setItem('dasong_live_follow', val ? 'true' : 'false');
    if (val) {
      try {
        const state = await getBroadcastState();
        if (state && state.songId) {
          setSelectedSongId(state.songId);
          setActiveTab('search');
        }
      } catch (err) {
        console.error('Initial follow sync error:', err);
      }
    }
  };

  const handleForceUpdateApp = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (const reg of registrations) {
          reg.unregister();
        }
      });
    }
    localStorage.removeItem('dasong_local_max_updated_at');
    window.location.reload();
  };

  const handleLogoutAdmin = () => {
    localStorage.removeItem('dasong_admin_token');
    localStorage.setItem('dasong_user_role', 'user');
    localStorage.setItem('dasong_user_name', 'User');
    setSession({ role: 'user', name: 'User' });
  };

  const handleAdminLoginSuccess = () => {
    setSession({ role: 'admin', name: 'Administrator' });
  };

  const handleForceSync = () => {
    localStorage.removeItem('dasong_local_max_updated_at');
    triggerMongoSync();
  };

  const handleSelectSong = useCallback((id: string | null, setlistSongIds?: string[]) => {
    setSelectedSongId(id);
    if (setlistSongIds) {
      setActiveSetlistQueue(setlistSongIds);
    } else if (!id) {
      setActiveSetlistQueue(null);
    }
    if (id) {
      setRecentSongIds(prev => {
        const filtered = prev.filter(x => x !== id);
        return [id, ...filtered].slice(0, 10);
      });
    }
  }, []);

  const handleToggleFavorite = async (id: string, currentFav: boolean) => {
    const nextSet = new Set(favoriteSongIds);
    if (currentFav) {
      nextSet.delete(id);
    } else {
      nextSet.add(id);
    }
    setFavoriteSongIds(nextSet);
    localStorage.setItem('dasong_favorites', JSON.stringify(Array.from(nextSet)));

    setSongs(prev => prev.map(s => s.id === id ? { ...s, favorite: !currentFav } : s));

    try {
      const fullSong = await getSongById(id);
      if (fullSong) {
        await saveSong({ ...fullSong, favorite: !currentFav });
      }
    } catch (err) {
      console.error('Failed to persist favorite toggle:', err);
    }
  };

  const handleDeleteSong = async (id: string) => {
    if (!confirm('Are you sure you want to delete this song?')) return;
    try {
      await deleteSong(id);
      if (selectedSongId === id) {
        setSelectedSongId(null);
      }
      await syncSongsList();
    } catch (err) {
      alert('Failed to delete song: ' + err);
    }
  };

  const handleAddSongSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.title.trim() || !addForm.lyrics.trim()) {
      alert('Please provide both song title and lyrics.');
      return;
    }

    const newSong: Song = {
      id: 'song_' + Date.now(),
      title: addForm.title.trim(),
      author: addForm.author.trim() || undefined,
      key: addForm.key.trim() || 'G',
      lyrics: addForm.lyrics.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    try {
      await saveSong(newSong);
      setShowAddModal(false);
      setAddForm({
        title: '',
        author: '',
        key: 'G',
        lyrics: ''
      });
      await syncSongsList();
      setSelectedSongId(newSong.id);
    } catch (err) {
      alert('Database error saving song: ' + err);
    }
  };

  const handleClearLibrary = async () => {
    if (!confirm('Are you sure you want to delete every song from both local and cloud databases permanently? This cannot be undone.')) {
      return;
    }
    try {
      localStorage.setItem('dasong_has_seeded', 'true');
      await clearAllSongs();
      setSelectedSongId(null);
      await syncSongsList();
      alert('All songs have been successfully removed!');
    } catch (err) {
      console.error(err);
      alert('Failed to clear library: ' + err);
    }
  };

  const handleEnterStageMode = async () => {
    if (!selectedSongId) return;
    try {
      const fullSong = await getSongById(selectedSongId);
      if (fullSong) {
        setStageModeSong(fullSong);
      }
    } catch (err) {
      alert('Error initializing stage mode: ' + err);
    }
  };

  const recentSongs = useMemo(() => {
    return recentSongIds
      .map(id => songs.find(s => s.id === id))
      .filter((s): s is SongMetadata => !!s);
  }, [recentSongIds, songs]);

  const stats = useMemo(() => {
    let favs = 0;
    songs.forEach(s => {
      if (s.favorite) favs++;
    });

    return {
      total: songs.length,
      favorites: favs,
      categories: 0
    };
  }, [songs]);

  return (
    <div id="app-root" className="bg-[#090A0F] text-zinc-300 transition-colors duration-150 flex flex-col font-sans relative min-h-[100dvh]">
      {/* Navigation Header */}
      <Header
        navigateTo={navigateTo}
        activeTab={activeTab}
        selectedSongId={selectedSongId}
        session={session}
        showInstallBanner={showInstallBanner}
        isInstalled={isInstalled}
        handleInstallApp={handleInstallApp}
        handleForceSync={handleForceSync}
        handleForceUpdateApp={handleForceUpdateApp}
        mongoStatus={mongoStatus}
        setShowAdminLoginModal={setShowAdminLoginModal}
        handleLogoutAdmin={handleLogoutAdmin}
        setShowAddModal={setShowAddModal}
        setShowUploadModal={setShowUploadModal}
      />

      {/* Live Admin Broadcast Invitation Toast / Banner */}
      <AnimatePresence>
        {adminBroadcast && (
          <motion.div
            initial={{ opacity: 0, y: -25, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -25, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="fixed top-16 md:top-20 left-1/2 -translate-x-1/2 z-[80] w-[calc(100vw-24px)] max-w-md bg-[#12131A] border-2 border-amber-500/80 rounded-2xl p-3.5 shadow-[0_20px_60px_rgba(0,0,0,0.9)] flex items-center justify-between gap-3 text-white backdrop-blur-xl ring-1 ring-amber-500/30"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <Radio className="w-5 h-5 text-amber-400 animate-pulse" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">
                    Live Broadcast
                  </span>
                </div>
                <p className="text-xs sm:text-sm font-bold text-white truncate mt-0.5">
                  {adminBroadcast.songTitle}
                </p>
                <p className="text-[11px] text-zinc-400 font-medium">Do you want to follow admin?</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleAcceptFollow}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-all cursor-pointer"
              >
                Follow
              </button>
              <button
                onClick={handleDismissFollow}
                className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content View */}
      <main className="flex-1 px-3 sm:px-6 py-4 pb-24 md:pb-6 max-w-[1850px] mx-auto w-full flex flex-col overflow-visible">
        <AnimatePresence mode="wait">
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <DashboardView
              session={session}
              songs={songs}
              mongoStatus={mongoStatus}
              currentRole={currentRole}
              isFollowing={isFollowing}
              handleToggleFollow={handleToggleFollow}
              showInstallBanner={showInstallBanner}
              isInstalled={isInstalled}
              dismissedInstall={dismissedInstall}
              handleDismissInstall={handleDismissInstall}
              handleInstallApp={handleInstallApp}
              setSongSourceTab={setSongSourceTab}
              setActiveTab={setActiveTab}
              handleSelectSong={handleSelectSong}
              stats={stats}
              recentSongs={recentSongs}
              setShowAddModal={setShowAddModal}
              setShowUploadModal={setShowUploadModal}
            />
          )}

          {/* TAB 2: LIBRARY / SEARCH */}
          {activeTab === 'search' && (
            <SongSearchView
              selectedSongId={selectedSongId}
              handleSelectSong={handleSelectSong}
              songSourceTab={songSourceTab}
              setActiveTab={setActiveTab}
              handleEnterStageMode={handleEnterStageMode}
              handleToggleFavorite={handleToggleFavorite}
              handleSongUpdateOrReview={handleSongUpdateOrReview}
              currentRole={currentRole}
              songs={songs}
              favoriteSongIds={favoriteSongIds}
              setSongSourceTab={setSongSourceTab}
              handleDeleteSong={handleDeleteSong}
              setShowAddModal={setShowAddModal}
              setShowUploadModal={setShowUploadModal}
              handleClearLibrary={handleClearLibrary}
              mongoStatus={mongoStatus}
              setlistSongIds={activeSetlistQueue}
              handleBack={handleBack}
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              filterFavorites={filterFavorites}
              onFilterFavoritesChange={handleFilterFavoritesChange}
            />
          )}

          {/* TAB 3: SETLISTS */}
          {activeTab === 'setlists' && (
            <SetlistManagerView
              currentRole={currentRole}
              setlists={setlists}
              songsCatalog={songs}
              onRefreshSetlists={refreshSetlists}
              onSelectSong={(songId, setlistSongIds) => {
                handleSelectSong(songId, setlistSongIds);
                setActiveTab('search');
              }}
              onEnterStageMode={handleEnterStageMode}
            />
          )}
        </AnimatePresence>
      </main>

      {/* Admin Login Modal */}
      <AdminLoginModal
        isOpen={showAdminLoginModal}
        onClose={() => setShowAdminLoginModal(false)}
        onLoginSuccess={handleAdminLoginSuccess}
      />

      {/* Add Song Modal */}
      <AddSongModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        addForm={addForm}
        setAddForm={setAddForm}
        onSubmit={handleAddSongSubmit}
      />

      {/* Bulk Upload Modal */}
      <BulkUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        syncSongsList={syncSongsList}
      />

      {/* Stage Mode (Teleprompter presentation) */}
      {stageModeSong && (
        <Suspense fallback={<ViewFallback />}>
          <StageMode 
            song={stageModeSong}
            onClose={() => setStageModeSong(null)}
            onSelectSong={(id) => {
              getSongById(id).then(fullSong => {
                if (fullSong) {
                  setStageModeSong(fullSong);
                }
              });
              handleSelectSong(id);
            }}
          />
        </Suspense>
      )}

      {/* iOS Installation Instructions Modal */}
      <IOSInstallModal
        isOpen={showIOSInstructions}
        onClose={() => setShowIOSInstructions(false)}
      />

      {/* Mobile Bottom Navigation Bar */}
      <MobileBottomNav
        session={session}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        navigateTo={navigateTo}
        showInstallBanner={showInstallBanner}
        isInstalled={isInstalled}
        handleInstallApp={handleInstallApp}
        setShowAddModal={setShowAddModal}
        setSelectedSongId={setSelectedSongId}
      />
    </div>
  );
}
