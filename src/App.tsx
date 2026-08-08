import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  Music, Sparkles, Layers, Sliders, Play, Settings, Plus, Star, Heart, 
  Trash2, X, AlertCircle, RefreshCw, Check, BookOpen, Database, Award, 
  ChevronRight, Compass, HelpCircle, Calendar, Download, Smartphone,
  Home, Search, LogOut
} from 'lucide-react';
import { Song, UserRole } from './types';
import { 
  initDB, 
  getAllSongsMetadata, 
  getSongById, 
  saveSongsBatch, 
  saveSong, 
  deleteSong, 
  clearAllSongs, 
  SongMetadata,
  syncWithMongoDB,
  deleteSuggestion,
  getActiveServerId,
  switchActiveServer,
  getPublicServers,
  createServer,
  authServerAdmin,
  getBroadcastState
} from './lib/db';
import BulkUpload from './components/BulkUpload';
import StageMode from './components/StageMode';
import SongList from './components/SongList';
import SongDetail from './components/SongDetail';
import { useSchedule } from './lib/useSchedule';
import { ScheduleView } from './views/AppViews';
import { motion, AnimatePresence } from 'motion/react';
import { parseTwoLineChords } from './utils/lyricsParser';

interface AppHistoryState {
  id: string;
  tab: 'dashboard' | 'search' | 'schedule';
  songId: string | null;
  stageMode: boolean;
  modal: 'add' | 'upload' | 'events' | 'join' | 'create' | null;
}

export default function App() {
  const [songs, setSongs] = useState<SongMetadata[]>([]);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [recentSongIds, setRecentSongIds] = useState<string[]>([]);
  const [mongoStatus, setMongoStatus] = useState<'connecting' | 'connected' | 'error' | 'offline'>('connecting');

  // Authentication session tracking
  interface UserSession {
    role: UserRole;
    name?: string;
  }

  const [activeServerId, setActiveServerId] = useState<string>(() => getActiveServerId());

  const [favoriteSongIds, setFavoriteSongIds] = useState<Set<string>>(() => {
    const serverId = getActiveServerId();
    const saved = localStorage.getItem(`dasong_favorites_${serverId}`);
    return saved ? new Set(JSON.parse(saved)) : new Set<string>();
  });

  const [session, setSession] = useState<UserSession | null>(() => {
    const serverId = getActiveServerId();
    const savedRole = localStorage.getItem(`lyrasync_user_role_${serverId}`);
    const savedName = localStorage.getItem(`lyrasync_user_name_${serverId}`);
    if (savedRole === 'admin' || savedRole === 'choir' || (serverId === 'default' && savedRole === 'guest')) {
      return {
        role: savedRole as UserRole,
        name: savedName || (savedRole === 'admin' ? 'Administrator' : savedRole === 'guest' ? 'Guest Browser' : '')
      };
    }
    return null; // Force login/role selection / Portal
  });

  const [portalView, setPortalView] = useState<'menu' | 'join' | 'create'>('menu');

  const currentRole = session ? session.role : 'guest';

  // Server Join and Create State Variables
  const [showJoinModal, setShowJoinModal] = useState<boolean>(false);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [publicServers, setPublicServers] = useState<any[]>([]);
  const [serverSearchQuery, setServerSearchQuery] = useState<string>('');
  const [loadingServers, setLoadingServers] = useState<boolean>(false);
  
  // Selected server for role selection during join flow
  const [joiningServer, setJoiningServer] = useState<any | null>(null);
  const [joinRole, setJoinRole] = useState<'choir' | 'admin' | null>(null);
  const [joinNameInput, setJoinNameInput] = useState<string>('');
  const [joinPasswordInput, setJoinPasswordInput] = useState<string>('');
  const [joinError, setJoinError] = useState<string>('');

  // Create Server Form State
  const [createForm, setCreateForm] = useState({
    id: '',
    name: '',
    adminPassword: '',
    showOnPublicList: true
  });
  const [createError, setCreateError] = useState<string>('');
  const [creatingServerStatus, setCreatingServerStatus] = useState<boolean>(false);

  const fetchServers = async () => {
    setLoadingServers(true);
    try {
      const list = await getPublicServers();
      setPublicServers(list);
    } catch (err) {
      console.error('Failed to fetch public servers:', err);
    } finally {
      setLoadingServers(false);
    }
  };

  useEffect(() => {
    if (showJoinModal) {
      fetchServers();
    }
  }, [showJoinModal]);




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



  // Choir Suggestions Review State & Helpers
  const [suggestions, setSuggestions] = useState<any[]>([]);

  const loadSuggestions = useCallback(() => {
    const saved = localStorage.getItem(`lyrasync_guideline_suggestions_${activeServerId}`);
    if (saved) {
      try {
        setSuggestions(JSON.parse(saved));
      } catch {
        setSuggestions([]);
      }
    } else {
      setSuggestions([]);
    }
  }, [activeServerId]);

  const handleDismissSuggestion = useCallback(async (id: string) => {
    try {
      await deleteSuggestion(id);
    } catch (err) {
      console.error('Failed to sync suggestion deletion to MongoDB:', err);
    }
    const saved = localStorage.getItem(`lyrasync_guideline_suggestions_${activeServerId}`);
    setSuggestions(saved ? JSON.parse(saved) : []);
  }, [activeServerId]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'search' | 'schedule'>('dashboard');
  const [songSourceTab, setSongSourceTab] = useState<'search' | 'dashboard'>('search');

  // Practice Schedule Hook
  const {
    scheduledSongs,
    scheduleSong,
    removeSong,
    markCompleted,
    rescheduleSong,
    getSongsSortedByDate,
    isScheduledOnDate,
  } = useSchedule();

  // Quick Search Dashboard State
  const [quickSearchInput, setQuickSearchInput] = useState<string>('');
  const [quickSearchQuery, setQuickSearchQuery] = useState<string>('');

  // Debounce dashboard quick search input by 150ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setQuickSearchQuery(quickSearchInput);
    }, 150);
    return () => clearTimeout(handler);
  }, [quickSearchInput]);

  // Compute matched songs for quick search
  const quickSearchMatches = useMemo(() => {
    const query = quickSearchQuery.trim().toLowerCase();
    if (!query) return [];
    
    const filtered = songs.filter(s => 
      (s.title || '').toLowerCase().includes(query) || 
      (s.author && s.author.toLowerCase().includes(query)) ||
      (s.lyricsSnippet && s.lyricsSnippet.toLowerCase().includes(query))
    );
    return [...filtered].sort((a, b) => (a.title || '').localeCompare(b.title || '')).slice(0, 6);
  }, [songs, quickSearchQuery]);

  // ── Android Back Button / History API ──────────────────────────────────────
  // Push a history entry on every meaningful navigation so Android's back button
  // steps back through in-app screens instead of closing the PWA.
  const navigateTo = useCallback((tab: 'dashboard' | 'search' | 'schedule') => {
    setActiveTab(tab);
  }, []);
  // ───────────────────────────────────────────────────────────────────────────
  const [activeSetlistIds, setActiveSetlistIds] = useState<string[]>([]);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showEventsModal, setShowEventsModal] = useState<boolean>(false);
  const [targetEventIdForAdd, setTargetEventIdForAdd] = useState<string | null>(null);

  useEffect(() => {
    if (!showAddModal && !showUploadModal) {
      setTargetEventIdForAdd(null);
    }
  }, [showAddModal, showUploadModal]);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  
  // Stage (full-screen presenting) control
  const [stageModeSong, setStageModeSong] = useState<Song | null>(null);

  // Manual Add Form structure
  const [addForm, setAddForm] = useState({
    title: '',
    author: '',
    key: 'G',
    bpm: 72,
    category: 'Worship',
    lyrics: ''
  });

  const historyStackRef = useRef<AppHistoryState[]>([]);
  const currentStackIndexRef = useRef<number>(-1);
  const isPoppingStateRef = useRef<boolean>(false);

  // Seed the initial history entry so there is always something to pop back to,
  // and handle Android back button presses via popstate.
  useEffect(() => {
    const initialState: AppHistoryState = {
      id: Math.random().toString(36).substring(2),
      tab: activeTab,
      songId: selectedSongId,
      stageMode: stageModeSong !== null,
      modal: showAddModal ? 'add' :
             showUploadModal ? 'upload' :
             showEventsModal ? 'events' :
             showJoinModal ? 'join' :
             showCreateModal ? 'create' : null
    };

    history.replaceState(initialState, '', window.location.pathname);
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
        if (!state.songId) {
          setActiveSetlistIds([]);
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
        setShowEventsModal(state.modal === 'events');
        setShowJoinModal(state.modal === 'join');
        setShowCreateModal(state.modal === 'create');
      } else {
        // Fallback baseline reset
        historyStackRef.current = [state];
        currentStackIndexRef.current = 0;
        isPoppingStateRef.current = true;

        setActiveTab(state.tab);
        setSelectedSongId(state.songId);
        if (!state.songId) {
          setActiveSetlistIds([]);
        }

        if (state.stageMode && state.songId) {
          getSongById(state.songId).then(fullSong => {
            if (fullSong) {
              setStageModeSong(fullSong);
            }
          }).catch(() => setStageModeSong(null));
        } else {
          setStageModeSong(null);
        }

        setShowAddModal(state.modal === 'add');
        setShowUploadModal(state.modal === 'upload');
        setShowEventsModal(state.modal === 'events');
        setShowJoinModal(state.modal === 'join');
        setShowCreateModal(state.modal === 'create');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Synchronize state changes to browser history
  useEffect(() => {
    if (isPoppingStateRef.current) {
      isPoppingStateRef.current = false;
      return;
    }

    if (currentStackIndexRef.current === -1) {
      return;
    }

    const currentModal: 'add' | 'upload' | 'events' | 'join' | 'create' | null =
      showAddModal ? 'add' :
      showUploadModal ? 'upload' :
      showEventsModal ? 'events' :
      showJoinModal ? 'join' :
      showCreateModal ? 'create' : null;

    const currentValues = {
      tab: activeTab,
      songId: selectedSongId,
      stageMode: stageModeSong !== null,
      modal: currentModal
    };

    const currentStackState = historyStackRef.current[currentStackIndexRef.current];

    const isDifferent =
      !currentStackState ||
      currentStackState.tab !== currentValues.tab ||
      currentStackState.songId !== currentValues.songId ||
      currentStackState.stageMode !== currentValues.stageMode ||
      currentStackState.modal !== currentValues.modal;

    if (isDifferent) {
      const prevStackState =
        currentStackIndexRef.current > 0
          ? historyStackRef.current[currentStackIndexRef.current - 1]
          : null;

      const matchesPrev =
        prevStackState &&
        prevStackState.tab === currentValues.tab &&
        prevStackState.songId === currentValues.songId &&
        prevStackState.stageMode === currentValues.stageMode &&
        prevStackState.modal === currentValues.modal;

      if (matchesPrev) {
        history.back();
      } else {
        const newState: AppHistoryState = {
          id: Math.random().toString(36).substring(2),
          tab: activeTab,
          songId: selectedSongId,
          stageMode: stageModeSong !== null,
          modal: currentModal
        };

        const newStack = historyStackRef.current.slice(0, currentStackIndexRef.current + 1);
        newStack.push(newState);
        historyStackRef.current = newStack;
        currentStackIndexRef.current = newStack.length - 1;

        history.pushState(newState, '', window.location.pathname);
      }
    }
  }, [
    activeTab,
    selectedSongId,
    stageModeSong,
    showAddModal,
    showUploadModal,
    showEventsModal,
    showJoinModal,
    showCreateModal
  ]);



  // Load / Sync songs metadata on load
  const syncSongsList = useCallback(async () => {
    try {
      const list = await getAllSongsMetadata();
      const serverId = localStorage.getItem('dasong_active_server_id') || 'default';
      const savedFavs = localStorage.getItem(`dasong_favorites_${serverId}`);
      const favIds = savedFavs ? new Set<string>(JSON.parse(savedFavs)) : new Set<string>();

      const mappedList = list.map(s => ({
        ...s,
        favorite: favIds.has(s.id)
      }));

      // Sort primarily by favorites, then creation date or title
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
    loadSuggestions();
  }, [syncSongsList, loadSuggestions]);

  // MongoDB sync background worker
  const triggerMongoSync = useCallback(async () => {
    setMongoStatus('connecting');
    try {
      await syncWithMongoDB();
      await syncSongsList();
      loadSuggestions();
      setMongoStatus('connected');
    } catch (err) {
      console.error('Failed to synchronize with MongoDB Cloud:', err);
      setMongoStatus('error');
    }
  }, [syncSongsList, loadSuggestions]);

  const handleSwitchServer = useCallback(async (newServerId: string) => {
    switchActiveServer(newServerId);
    setActiveServerId(newServerId);

    const savedRole = localStorage.getItem(`lyrasync_user_role_${newServerId}`);
    const savedName = localStorage.getItem(`lyrasync_user_name_${newServerId}`);

    if (savedRole === 'admin' || savedRole === 'choir' || (newServerId === 'default' && savedRole === 'guest')) {
      setSession({
        role: savedRole as UserRole,
        name: savedName || (savedRole === 'admin' ? 'Administrator' : savedRole === 'guest' ? 'Guest Browser' : '')
      });
    } else {
      setSession(null); // Force role selection for the server
    }

    const savedFavs = localStorage.getItem(`dasong_favorites_${newServerId}`);
    setFavoriteSongIds(savedFavs ? new Set(JSON.parse(savedFavs)) : new Set<string>());

    // Clear/reload states
    setSongs([]);
    setSuggestions([]);
    
    // Trigger database re-initialization and background sync
    try {
      await initDB();
      await syncSongsList();
      loadSuggestions();
      triggerMongoSync();
    } catch (err) {
      console.error('Error switching server DB:', err);
    }
  }, [syncSongsList, loadSuggestions, triggerMongoSync]);

  // Handle shared link query parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const querySong = params.get('song');
    const queryServer = params.get('server');

    const initializeFromUrl = async () => {
      let changed = false;
      if (queryServer && queryServer !== getActiveServerId()) {
        await handleSwitchServer(queryServer);
        changed = true;
      }
      if (querySong) {
        setSelectedSongId(querySong);
        changed = true;
      }
      if (changed || querySong || queryServer) {
        const cleanUrl = window.location.pathname;
        history.replaceState(history.state, '', cleanUrl);
      }
    };

    initializeFromUrl();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleJoinServerSubmit = async () => {
    if (!joiningServer) return;
    setJoinError('');

    if (joinRole === 'choir') {
      if (joinNameInput.trim().length < 2) {
        setJoinError('Please enter a valid name (at least 2 characters).');
        return;
      }
      localStorage.setItem(`lyrasync_user_role_${joiningServer.id}`, 'choir');
      localStorage.setItem(`lyrasync_user_name_${joiningServer.id}`, joinNameInput.trim());
      
      await handleSwitchServer(joiningServer.id);
      
      setShowJoinModal(false);
      setJoiningServer(null);
      setJoinRole(null);
      setJoinNameInput('');
    } else if (joinRole === 'admin') {
      if (!joinPasswordInput) {
        setJoinError('Password is required.');
        return;
      }
      try {
        const res = await authServerAdmin(joiningServer.id, joinPasswordInput);
        if (res.success) {
          localStorage.setItem(`lyrasync_user_role_${joiningServer.id}`, 'admin');
          localStorage.setItem(`lyrasync_user_name_${joiningServer.id}`, 'Administrator');
          
          await handleSwitchServer(joiningServer.id);
          
          setShowJoinModal(false);
          setJoiningServer(null);
          setJoinRole(null);
          setJoinPasswordInput('');
        } else {
          setJoinError('Incorrect admin password.');
        }
      } catch (err: any) {
        setJoinError(err.message || 'Verification failed. Please check the password.');
      }
    }
  };

  const handleCreateServerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    if (!createForm.id.trim() || !createForm.name.trim() || !createForm.adminPassword.trim()) {
      setCreateError('All fields are required.');
      return;
    }
    
    const idRegex = /^[a-z0-9-]+$/;
    if (!idRegex.test(createForm.id.trim())) {
      setCreateError('Server ID must contain lowercase alphanumeric characters and dashes only.');
      return;
    }

    setCreatingServerStatus(true);
    try {
      const res = await createServer({
        id: createForm.id.trim().toLowerCase(),
        name: createForm.name.trim(),
        adminPassword: createForm.adminPassword,
        showOnPublicList: createForm.showOnPublicList
      });
      if (res.success) {
        localStorage.setItem(`lyrasync_user_role_${res.server.id}`, 'admin');
        localStorage.setItem(`lyrasync_user_name_${res.server.id}`, 'Administrator');
        localStorage.setItem(`dasong_server_name_${res.server.id}`, res.server.name);
        
        await handleSwitchServer(res.server.id);
        
        setCreateForm({
          id: '',
          name: '',
          adminPassword: '',
          showOnPublicList: true
        });
        setShowCreateModal(false);
      }
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create server workspace.');
    } finally {
      setCreatingServerStatus(false);
    }
  };

  const handleLeaveServer = async () => {
    if (confirm('Are you sure you want to exit this workspace and return to the Portal?')) {
      // Clear saved session info for the server we are leaving
      localStorage.removeItem(`lyrasync_user_role_${activeServerId}`);
      localStorage.removeItem(`lyrasync_user_name_${activeServerId}`);
      
      // Reset default server preferences too if any, so they return to portal menu
      localStorage.removeItem(`lyrasync_user_role_default`);
      localStorage.removeItem(`lyrasync_user_name_default`);
      
      // Reset server back to default
      switchActiveServer('default');
      setActiveServerId('default');
      setSession(null);
      setPortalView('menu');
      
      // Clear states
      setSongs([]);
      setSuggestions([]);
      
      try {
        await initDB();
        await syncSongsList();
      } catch (err) {
        console.error('Error switching server DB:', err);
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(`lyrasync_user_role_${activeServerId}`);
    localStorage.removeItem(`lyrasync_user_name_${activeServerId}`);
    if (activeServerId === 'default') {
      localStorage.removeItem(`lyrasync_user_role_default`);
      localStorage.removeItem(`lyrasync_user_name_default`);
    }
    handleSwitchServer('default');
  };


  const handleForceSync = () => {
    localStorage.removeItem(`dasong_local_max_updated_at_${activeServerId}`);
    triggerMongoSync();
  };

  // Perform full database sync on load, focus, and every 60 seconds
  useEffect(() => {
    triggerMongoSync();

    // Throttle window-focus sync: at most once every 30 seconds to avoid
    // hammering the API when the user switches tabs or unlocks their phone.
    let lastFocusSync = 0;
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastFocusSync > 30_000) {
        lastFocusSync = now;
        triggerMongoSync();
      }
    };
    window.addEventListener('focus', handleFocus);

    // Polling interval every 60 seconds (was 10s — reduces background traffic)
    const interval = setInterval(() => {
      triggerMongoSync();
    }, 60_000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [triggerMongoSync]);

  // Initialize DB and load existing songs per server
  useEffect(() => {
    // Load recently viewed songs
    try {
      const stored = localStorage.getItem(`dasong_recent_songs_${activeServerId}`);
      if (stored) {
        setRecentSongIds(JSON.parse(stored));
      } else {
        setRecentSongIds([]);
      }
    } catch (e) {
      console.error('Failed loading recent songs from localStorage:', e);
    }

    async function bootApp() {
      setInitialLoading(true);
      try {
        await initDB();
        let list = await getAllSongsMetadata();
        
        // Auto-seed database with default worship songsheets if completely empty and not seeded before
        const hasSeeded = localStorage.getItem('dasong_has_seeded') === 'true';
        if (list.length === 0 && !hasSeeded) {
          console.log('Song library is empty. Seeding default worship songbook...');
          const { SEED_SONGS } = await import('./data/seedSongs');
          await saveSongsBatch(SEED_SONGS);
          localStorage.setItem('dasong_has_seeded', 'true');
        }
        
        await syncSongsList();
        loadSuggestions();
      } catch (err) {
        console.error('Database setup error:', err);
      } finally {
        setInitialLoading(false);
      }
    }
    bootApp();
  }, [activeServerId, syncSongsList, loadSuggestions]);

  // Auto-reload the page when a new Service Worker (Vercel deploy) takes control
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const handleControllerChange = () => {
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
      return () => {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      };
    }
  }, []);

  // Set dark mode configuration to document body
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Monitor and handle PWA installation parameters
  useEffect(() => {
    // Check if the application is running in standalone mode (already installed)
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone 
      || document.referrer.includes('android-app://');
    
    if (isStandaloneMode) {
      setIsInstalled(true);
    }

    // Identify iOS devices
    const userAgent = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(ios);

    // Capture standard browser beforeinstallprompt triggers
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Only display the banner if the user hasn't explicitly dismissed it
      if (localStorage.getItem('dasong_dismiss_install') !== 'true') {
        setShowInstallBanner(true);
      }
    };

    // Monitor appinstalled complete trigger
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowInstallBanner(false);
      setDeferredPrompt(null);
      console.log('DaSong Studio app installed successfully!');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    // If it's iOS and not already installed, and not dismissed, we show the banner
    if (ios && !isStandaloneMode && localStorage.getItem('dasong_dismiss_install') !== 'true') {
      setShowInstallBanner(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallApp = async () => {
    if (isIOS) {
      setShowIOSInstructions(true);
      return;
    }

    if (!deferredPrompt) {
      alert("PWA installation is supported in your browser settings. Look for the install icon in your address bar!");
      return;
    }

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User installation choice outcome: ${outcome}`);
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setShowInstallBanner(false);
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.error('Error triggering PWA installation:', err);
    }
  };

  const handleDismissInstall = () => {
    localStorage.setItem('dasong_dismiss_install', 'true');
    setDismissedInstall(true);
    setShowInstallBanner(false);
  };

  // Handle seamless song selection with automated scroll targeting
  const handleSelectSong = useCallback((id: string | null, setlistSongIds?: string[]) => {
    setSelectedSongId(id);
    if (setlistSongIds) {
      setActiveSetlistIds(setlistSongIds);
    } else if (!id) {
      setActiveSetlistIds([]);
    }

    if (id && id !== 'dalyric-broadcast-temp') {
      setRecentSongIds(prev => {
        const next = [id, ...prev.filter(x => x !== id)].slice(0, 5);
        localStorage.setItem(`dasong_recent_songs_${activeServerId}`, JSON.stringify(next));
        return next;
      });
    }
  }, [activeServerId]);

  const handleToggleFollow = useCallback((val: boolean) => {
    setIsFollowing(val);
    localStorage.setItem('dasong_live_follow', val ? 'true' : 'false');
    if (val) {
      localStorage.setItem('dasong_live_broadcast', 'false');
      window.dispatchEvent(new Event('storage'));
    }
  }, []);

  // Global Live Broadcast follow polling - automatically navigate and open the led song
  useEffect(() => {
    if (!isFollowing) return;

    let active = true;
    const pollInterval = setInterval(async () => {
      if (!active) return;
      try {
        const state = await getBroadcastState();
        if (state && state.songId && state.songId !== selectedSongId) {
          // Found a new active song! Automatically navigate and open it.
          setSongSourceTab('search'); // Set source to search
          setActiveTab('search');     // Open search tab (where song detail is shown)
          handleSelectSong(state.songId);
        }
      } catch (err) {
        console.error("Global follow polling error:", err);
      }
    }, 2000);

    return () => {
      active = false;
      clearInterval(pollInterval);
    };
  }, [isFollowing, selectedSongId, handleSelectSong]);

  // Handle single chord toggle favorite
  const handleToggleFavorite = useCallback(async (id: string, currentFav: boolean) => {
    setFavoriteSongIds(prev => {
      const next = new Set(prev);
      if (currentFav) {
        next.delete(id);
      } else {
        next.add(id);
      }
      localStorage.setItem(`dasong_favorites_${activeServerId}`, JSON.stringify(Array.from(next)));
      return next;
    });
    await syncSongsList();
  }, [activeServerId, syncSongsList]);

  // Delete song
  const handleDeleteSong = useCallback(async (id: string) => {
    try {
      await deleteSong(id);
      if (selectedSongId === id) {
        setSelectedSongId(null);
      }
    } catch (err) {
      console.error('Failed deleting song:', err);
    } finally {
      await syncSongsList();
    }
  }, [selectedSongId, syncSongsList]);

  // Triggered when a song is manually populated inside Add Dialog
  const handleAddSongSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.title.trim() || !addForm.lyrics.trim()) {
      alert('Title and Lyrics are mandatory.');
      return;
    }

    const newSong: Song = {
      id: `manual-song-${Date.now()}`,
      title: addForm.title,
      author: addForm.author || 'Traditional',
      key: addForm.key || 'G',
      bpm: Number(addForm.bpm) || 72,
      category: addForm.category,
      lyrics: addForm.lyrics,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    try {
      await saveSong(newSong);
      await syncSongsList();
      setSelectedSongId(newSong.id);
      setShowAddModal(false);

      setAddForm({
        title: '',
        author: '',
        key: 'G',
        bpm: 72,
        category: 'Worship',
        lyrics: ''
      });
    } catch (err) {
      alert('Database error saving song: ' + err);
    }
  };

  // Clear library and format DB
  const handleClearLibrary = async () => {
    if (!confirm('Are you sure you want to delete every song from both local and cloud databases permanently? This cannot be undone.')) {
      return;
    }
    try {
      // Mark as seeded so that empty database does not trigger re-seeding on reload
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

  const handleSelectGuestMode = async () => {
    localStorage.setItem('lyrasync_user_role_default', 'guest');
    localStorage.setItem('lyrasync_user_name_default', 'Guest Browser');
    await handleSwitchServer('default');
  };

  // Presentation Trigger handlers
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

  // Memoized recently viewed songs mapping
  const recentSongs = useMemo(() => {
    return recentSongIds
      .map(id => songs.find(s => s.id === id))
      .filter((s): s is SongMetadata => !!s);
  }, [recentSongIds, songs]);

  // Total calculated statistics for dashboard boxes
  const stats = React.useMemo(() => {
    let favs = 0;
    const catsSet = new Set<string>();
    songs.forEach(s => {
      if (s.favorite) favs++;
      if (s.category) catsSet.add(s.category);
    });

    return {
      total: songs.length,
      favorites: favs,
      categories: catsSet.size
    };
  }, [songs]);

  const renderGuestWelcome = () => {
    return (
      <div className="flex flex-col items-center py-12 md:py-20 px-4 w-full max-w-6xl mx-auto select-none relative">
        
        {/* Hero Section */}
        <div className="text-center max-w-3xl mb-16 relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-450 rounded text-[11px] font-mono uppercase tracking-wider mb-6">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Premium Worship Companion
          </div>
          <h1 className="text-4xl md:text-6xl font-serif font-bold text-white tracking-tight leading-none">
            DaSong <span className="text-amber-500 font-sans font-black">Studio</span>
          </h1>
          <p className="text-sm md:text-base text-zinc-400 mt-5 leading-relaxed font-medium max-w-2xl mx-auto">
            A secure multi-tenant platform for churches, choirs, and worship groups. Browse public song sheets, sync setlists, and manage team lyric catalogs.
          </p>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full relative z-10">
          {/* Browse Library */}
          <div 
            onClick={() => setActiveTab('search')}
            className="group p-8 bg-[#12131A] border border-[#1E202B] hover:border-amber-500/50 rounded-md transition-all duration-150 text-center cursor-pointer flex flex-col items-center justify-between min-h-[280px] active-touch"
          >
            <div className="w-14 h-14 rounded bg-[#1A1C26] border border-[#272A37] flex items-center justify-center text-amber-550 group-hover:scale-110 transition-transform duration-150">
              <BookOpen className="w-6 h-6" />
            </div>
            <div className="mt-6">
              <h3 className="text-base font-extrabold text-white group-hover:text-amber-400 transition-colors">Offline Songbook & Library</h3>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed font-sans">
                Browse cataloged songbooks, transpose chords, and practice. Stored locally on your device for offline use!
              </p>
            </div>
            <span className="text-[10px] font-mono font-bold text-amber-500/80 mt-6 group-hover:translate-x-1.5 transition-transform inline-flex items-center gap-1">
              Browse Songs <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>

          {/* Join Server */}
          <div 
            onClick={() => {
              setShowJoinModal(true);
              fetchServers();
            }}
            className="group p-8 bg-[#12131A] border border-[#1E202B] hover:border-emerald-500/50 rounded-md transition-all duration-150 text-center cursor-pointer flex flex-col items-center justify-between min-h-[280px] active-touch"
          >
            <div className="w-14 h-14 rounded bg-[#1A1C26] border border-[#272A37] flex items-center justify-center text-emerald-450 group-hover:scale-110 transition-transform duration-150">
              <Layers className="w-6 h-6" />
            </div>
            <div className="mt-6">
              <h3 className="text-base font-extrabold text-white group-hover:text-emerald-400 transition-colors">Join Church Server</h3>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                Connect to your local church choir or praise team workspace to view scheduled setlists and updates.
              </p>
            </div>
            <span className="text-[10px] font-mono font-bold text-emerald-450 mt-6 group-hover:translate-x-1.5 transition-transform inline-flex items-center gap-1">
              Find Server <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>

          {/* Create Server */}
          <div 
            onClick={() => setShowCreateModal(true)}
            className="group p-8 bg-[#12131A] border border-[#1E202B] hover:border-rose-500/50 rounded-md transition-all duration-150 text-center cursor-pointer flex flex-col items-center justify-between min-h-[280px] active-touch"
          >
            <div className="w-14 h-14 rounded bg-[#1A1C26] border border-[#272A37] flex items-center justify-center text-rose-550 group-hover:scale-110 transition-transform duration-150">
              <Plus className="w-6 h-6" />
            </div>
            <div className="mt-6">
              <h3 className="text-base font-extrabold text-white group-hover:text-rose-550 transition-colors">Create Server</h3>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                Initialize a dedicated team workspace with custom database isolation, roles, and cloud synchronization.
              </p>
            </div>
            <span className="text-[10px] font-mono font-bold text-rose-500 mt-6 group-hover:translate-x-1.5 transition-transform inline-flex items-center gap-1">
              Start Workspace <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>
    );
  };

  if (!session) {
    if (activeServerId !== 'default') {
      const serverName = localStorage.getItem(`dasong_server_name_${activeServerId}`) || activeServerId;
      return (
        <div id="login-portal" className="flex items-center justify-center min-h-[100dvh] bg-[#090A0F] text-white p-4 font-sans relative overflow-hidden">
          {/* Backdrop patterns */}
          <div className="absolute inset-0 pointer-events-none opacity-3 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:20px_20px]"></div>

          <div className="w-full max-w-md p-8 bg-[#12131A] rounded-md border border-[#1E202B] relative z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-serif font-bold text-white mb-2">{serverName}</h1>
              <p className="text-zinc-500 text-[10px] font-mono uppercase tracking-widest bg-[#090A0F] w-fit mx-auto px-2.5 py-0.5 rounded border border-[#1E202B]">Workspace ID: {activeServerId}</p>
              <p className="text-zinc-400 text-xs mt-4">Select your access role to enter this church server workspace.</p>
            </div>

            {joinError && (
              <div className="mb-5 p-3 bg-red-500/10 border border-red-550/20 text-red-400 text-[11px] rounded text-center font-bold flex items-center justify-center gap-1.5 animate-pulse">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                <span>{joinError}</span>
              </div>
            )}

            {joinRole === null ? (
              <div className="space-y-4">
                <button 
                  onClick={() => {
                    setJoinRole('choir');
                    setJoinError('');
                  }}
                  className="w-full flex items-center justify-between p-5 bg-[#1A1C26] hover:bg-[#222433] border border-[#272A37] hover:border-amber-500/40 rounded transition-all text-left outline-none cursor-pointer group active-touch"
                >
                  <div>
                    <p className="font-bold text-xs text-white flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-450 animate-pulse"></span>
                      Join as Choir Member
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-1 font-medium leading-relaxed">Access songs, worship setlists, and suggest songs sheets.</p>
                  </div>
                  <span className="text-amber-500 font-bold group-hover:translate-x-1.5 transition-transform text-sm">→</span>
                </button>

                <button 
                  onClick={() => {
                    setJoinRole('admin');
                    setJoinError('');
                  }}
                  className="w-full flex items-center justify-between p-5 bg-[#1A1C26] hover:bg-[#222433] border border-[#272A37] hover:border-amber-500/40 rounded transition-all text-left outline-none cursor-pointer group active-touch"
                >
                  <div>
                    <p className="font-bold text-xs text-white flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                      Login as Administrator
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-1 font-medium leading-relaxed">Enter password to unlock song creation, imports, and full management.</p>
                  </div>
                  <span className="text-amber-500 font-bold group-hover:translate-x-1.5 transition-transform text-sm">→</span>
                </button>

                <div className="pt-4 border-t border-[#1E202B] flex gap-2">
                  <button 
                    onClick={async () => {
                      await handleSwitchServer('default');
                    }}
                    className="w-full premium-btn-secondary p-3 rounded text-xs transition-all cursor-pointer active-touch"
                  >
                    ← Return to Portal
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[#1E202B] pb-3 mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-amber-500">{joinRole === 'admin' ? 'Admin' : 'Choir'} Access</h3>
                  <button 
                    onClick={() => { setJoinRole(null); setJoinError(''); }}
                    className="text-xs text-zinc-400 hover:text-white font-bold cursor-pointer transition-colors"
                  >
                    ← Back
                  </button>
                </div>

                {joinRole === 'admin' && (
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase font-mono tracking-widest">Admin Workspace Password</label>
                    <input 
                      type="password"
                      placeholder="••••••••"
                      value={joinPasswordInput}
                      onChange={(e) => setJoinPasswordInput(e.target.value)}
                      className="w-full p-3 rounded text-white outline-none text-xs font-mono tracking-widest premium-input"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleJoinServerSubmit();
                      }}
                    />
                  </div>
                )}

                {joinRole === 'choir' && (
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase font-mono tracking-widest">Enter Your Name</label>
                    <input 
                      type="text"
                      placeholder="e.g. David"
                      value={joinNameInput}
                      onChange={(e) => setJoinNameInput(e.target.value)}
                      className="w-full p-3 rounded text-white outline-none text-xs font-sans premium-input"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleJoinServerSubmit();
                      }}
                    />
                  </div>
                )}

                <button 
                  onClick={handleJoinServerSubmit}
                  className="w-full premium-btn-primary py-3 px-4 rounded text-xs font-bold transition-all cursor-pointer active-touch"
                >
                  Access Server Workspace
                </button>
              </div>
            )}
          </div>
        </div>
      );
    } else {
      return (
        <div id="welcome-portal" className="flex flex-col items-center justify-center min-h-[100dvh] bg-[#090A0F] text-white p-4 font-sans relative overflow-hidden">
          {/* Backdrop patterns */}
          <div className="absolute inset-0 pointer-events-none opacity-3 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:20px_20px]"></div>

          <div className="w-full max-w-5xl px-4 py-8 relative z-10">
            {/* Header/Hero Section */}
            <div className="text-center mb-16 animate-in fade-in slide-in-from-top duration-500">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-500/10 text-amber-450 rounded text-[11px] font-mono uppercase tracking-wider mb-6">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Premium Worship Companion
              </div>
              <h1 className="text-4xl md:text-6xl font-serif font-bold text-white tracking-tight leading-none">
                DaSong <span className="text-amber-500 font-sans font-black">Studio Portal</span>
              </h1>
              <p className="text-sm md:text-base text-zinc-400 mt-5 leading-relaxed font-medium max-w-2xl mx-auto">
                A secure multi-tenant platform for churches, choirs, and worship groups. Browse public song sheets, sync setlists, and manage team lyric catalogs.
              </p>
            </div>

            {/* Conditional Subviews */}
            {portalView === 'menu' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full animate-in fade-in zoom-in-95 duration-200">
                {/* Guest Card */}
                <div 
                  onClick={handleSelectGuestMode}
                  className="group p-8 bg-[#12131A] border border-[#1E202B] hover:border-amber-500/50 rounded-md transition-all duration-150 text-center cursor-pointer flex flex-col items-center justify-between min-h-[260px] active-touch"
                >
                  <div className="w-14 h-14 rounded bg-[#1A1C26] border border-[#272A37] flex items-center justify-center text-amber-550 group-hover:scale-110 transition-transform duration-150">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div className="mt-4">
                    <h3 className="text-base font-extrabold text-white group-hover:text-amber-400 transition-colors">Guest Mode</h3>
                    <p className="text-xs text-zinc-400 mt-2 leading-relaxed font-sans">
                      Browse offline songs, read lyrics, create local setlists, and access offline calendar. Stored locally on your device!
                    </p>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-amber-500/80 mt-4 group-hover:translate-x-1.5 transition-transform inline-flex items-center gap-1">
                    Enter Guest Mode <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>

                {/* Join Server Card */}
                <div 
                  onClick={() => {
                    setPortalView('join');
                    fetchServers();
                  }}
                  className="group p-8 bg-[#12131A] border border-[#1E202B] hover:border-emerald-500/50 rounded-md transition-all duration-150 text-center cursor-pointer flex flex-col items-center justify-between min-h-[260px] active-touch"
                >
                  <div className="w-14 h-14 rounded bg-[#1A1C26] border border-[#272A37] flex items-center justify-center text-emerald-450 group-hover:scale-110 transition-transform duration-150">
                    <Layers className="w-6 h-6" />
                  </div>
                  <div className="mt-4">
                    <h3 className="text-base font-extrabold text-white group-hover:text-emerald-400 transition-colors">Join Church Server</h3>
                    <p className="text-xs text-zinc-400 mt-2 leading-relaxed font-sans">
                      Connect to an existing workspace for your local church choir or worship team.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-emerald-450 mt-4 group-hover:translate-x-1.5 transition-transform inline-flex items-center gap-1">
                    Find Server <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>

                {/* Create Server Card */}
                <div 
                  onClick={() => setPortalView('create')}
                  className="group p-8 bg-[#12131A] border border-[#1E202B] hover:border-rose-500/50 rounded-md transition-all duration-150 text-center cursor-pointer flex flex-col items-center justify-between min-h-[260px] active-touch"
                >
                  <div className="w-14 h-14 rounded bg-[#1A1C26] border border-[#272A37] flex items-center justify-center text-rose-500 group-hover:scale-110 transition-transform duration-150">
                    <Plus className="w-6 h-6" />
                  </div>
                  <div className="mt-4">
                    <h3 className="text-base font-extrabold text-white group-hover:text-rose-500 transition-colors">Create Server</h3>
                    <p className="text-xs text-zinc-400 mt-2 leading-relaxed font-sans">
                      Initialize a clean, dedicated workspace with isolated database and team permissions.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-rose-500 mt-4 group-hover:translate-x-1.5 transition-transform inline-flex items-center gap-1">
                    Start Workspace <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            )}

            {/* Portal Subview: Join Server */}
            {portalView === 'join' && (
              <div className="w-full max-w-md mx-auto p-8 bg-[#12131A] rounded-md border border-[#1E202B] relative z-10 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between border-b border-[#1E202B] pb-3 mb-4">
                  <h3 className="font-bold text-base text-white flex items-center gap-1.5 font-sans">
                    <Layers className="h-4 w-4 text-amber-500" /> Join Church Server
                  </h3>
                  <button
                    onClick={() => {
                      setPortalView('menu');
                      setJoiningServer(null);
                      setJoinRole(null);
                      setJoinError('');
                    }}
                    className="text-xs text-zinc-400 hover:text-white font-bold cursor-pointer transition-colors font-sans"
                  >
                    ← Back
                  </button>
                </div>

                {joinError && (
                  <div className="mb-5 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] rounded text-center font-bold flex items-center justify-center gap-1.5 animate-pulse">
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                    <span>{joinError}</span>
                  </div>
                )}

                {joiningServer === null ? (
                  // Screen 1: List public servers
                  <div className="space-y-4">
                    {/* Search input */}
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-zinc-550" />
                      </div>
                      <input
                        type="text"
                        placeholder="Search church or choir server..."
                        value={serverSearchQuery}
                        onChange={(e) => setServerSearchQuery(e.target.value)}
                        className="block w-full pl-10 pr-4 py-2.5 rounded text-white placeholder-zinc-550 outline-none text-xs font-sans premium-input"
                      />
                    </div>

                    {/* Available list */}
                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                      {loadingServers ? (
                        <div className="text-center py-6 text-zinc-555 text-xs font-mono">
                          Loading active servers...
                        </div>
                      ) : (
                        (() => {
                          const filtered = publicServers.filter(s => 
                            s.name.toLowerCase().includes(serverSearchQuery.toLowerCase()) ||
                            s.id.toLowerCase().includes(serverSearchQuery.toLowerCase())
                          );
                          if (filtered.length === 0) {
                            return (
                              <div className="text-center py-6 text-zinc-555 text-xs font-sans italic">
                                No servers found. Type a private ID below!
                              </div>
                            );
                          }
                          return filtered.map(s => (
                            <button
                              key={s.id}
                              onClick={() => {
                                localStorage.setItem(`dasong_server_name_${s.id}`, s.name);
                                setJoiningServer(s);
                              }}
                              className="w-full p-4 bg-[#1A1C26]/40 hover:bg-[#1A1C26] border border-[#1E202B] hover:border-amber-500/30 rounded flex items-center justify-between text-left transition-all cursor-pointer group active-touch"
                            >
                              <div>
                                <div className="text-xs font-bold text-white group-hover:text-amber-450 transition-colors">
                                  {s.name}
                                </div>
                                <div className="text-[10px] text-zinc-550 font-mono mt-0.5">
                                  ID: {s.id}
                                </div>
                              </div>
                              <span className="text-[10px] font-mono font-bold text-emerald-450 opacity-0 group-hover:opacity-100 transition-opacity">
                                [ Join ]
                              </span>
                            </button>
                          ));
                        })()
                      )}
                    </div>

                    {/* Private server entry */}
                    <div className="pt-4 border-t border-[#1E202B] space-y-2">
                      <span className="text-[10px] font-mono uppercase text-zinc-500 font-bold block">
                        Join Private Server (by ID)
                      </span>
                      <div className="flex gap-2">
                        <input
                          id="portal-private-server-id-input"
                          type="text"
                          placeholder="e.g. grace-chapel"
                          className="flex-1 px-3 py-2.5 rounded text-white outline-none text-xs font-mono premium-input"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const val = (e.target as HTMLInputElement).value.trim().toLowerCase();
                              if (val) {
                                setJoiningServer({ id: val, name: val });
                              }
                            }
                          }}
                        />
                        <button
                          onClick={() => {
                            const input = document.getElementById('portal-private-server-id-input') as HTMLInputElement;
                            const val = input?.value.trim().toLowerCase();
                            if (val) {
                              setJoiningServer({ id: val, name: val });
                            } else {
                              setJoinError('Please enter a server ID.');
                            }
                          }}
                          className="premium-btn-secondary px-5 py-2.5 rounded text-xs font-bold cursor-pointer transition-all active-touch"
                        >
                          Find
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-[#090A0F] border border-[#1E202B] rounded text-center">
                      <span className="text-[10px] font-mono uppercase text-zinc-550">Selected Workspace</span>
                      <h4 className="text-sm font-bold text-white mt-1">{joiningServer.name}</h4>
                      <span className="text-[9px] font-mono text-zinc-500 block mt-0.5">ID: {joiningServer.id}</span>
                    </div>

                    {joinRole === null ? (
                      <div className="space-y-3">
                        <button 
                          onClick={() => {
                            setJoinRole('choir');
                            setJoinError('');
                          }}
                          className="w-full flex items-center justify-between p-4 bg-[#1A1C26] hover:bg-[#222433] border border-[#272A37] hover:border-amber-500/40 rounded transition-all text-left outline-none cursor-pointer group active-touch"
                        >
                          <div>
                            <p className="font-bold text-xs text-white flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              Join as Choir Member
                            </p>
                            <p className="text-[10px] text-zinc-400 mt-1">Read lyrics, build setlists, and suggest songs.</p>
                          </div>
                          <span className="text-amber-500 font-bold group-hover:translate-x-1.5 transition-transform">→</span>
                        </button>

                        <button 
                          onClick={() => {
                            setJoinRole('admin');
                            setJoinError('');
                          }}
                          className="w-full flex items-center justify-between p-4 bg-[#1A1C26] hover:bg-[#222433] border border-[#272A37] hover:border-amber-500/40 rounded transition-all text-left outline-none cursor-pointer group active-touch"
                        >
                          <div>
                            <p className="font-bold text-xs text-white flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                              Login as Admin
                            </p>
                            <p className="text-[10px] text-zinc-400 mt-1">Prompts password to unlock libraries management.</p>
                          </div>
                          <span className="text-amber-500 font-bold group-hover:translate-x-1.5 transition-transform">→</span>
                        </button>

                        <button 
                          onClick={() => {
                            setJoiningServer(null);
                            setJoinRole(null);
                            setJoinError('');
                          }}
                          className="w-full p-3 bg-[#1A1C26] hover:bg-[#222433] border border-[#272A37] text-zinc-300 hover:text-white text-xs font-semibold rounded text-center cursor-pointer transition-colors"
                        >
                          ← Select Different Server
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-[#1E202B] pb-2">
                          <h4 className="text-xs font-bold text-amber-500 uppercase font-mono tracking-wider">
                            {joinRole === 'admin' ? 'Admin Login' : 'Choir Member Name'}
                          </h4>
                          <button 
                            onClick={() => { setJoinRole(null); setJoinError(''); }}
                            className="text-[10px] text-zinc-500 hover:text-white font-bold"
                          >
                            ← Change Role
                          </button>
                        </div>

                        {joinRole === 'admin' ? (
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-mono text-zinc-500 block uppercase">Admin Password</label>
                            <input 
                              type="password"
                              placeholder="Enter password..."
                              value={joinPasswordInput}
                              onChange={(e) => setJoinPasswordInput(e.target.value)}
                              className="w-full p-3 rounded text-white outline-none text-xs font-mono tracking-widest premium-input"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleJoinServerSubmit();
                              }}
                            />
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-mono text-zinc-500 block uppercase">Enter Your Name</label>
                            <input 
                              type="text"
                              placeholder="e.g. John"
                              value={joinNameInput}
                              onChange={(e) => setJoinNameInput(e.target.value)}
                              className="w-full p-3 rounded text-white outline-none text-xs font-sans premium-input"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleJoinServerSubmit();
                              }}
                            />
                          </div>
                        )}

                        <button 
                          onClick={handleJoinServerSubmit}
                          className="w-full premium-btn-primary py-3 px-4 rounded text-xs font-bold transition-all cursor-pointer active-touch"
                        >
                          Access Server Workspace
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Portal Subview: Create Server */}
            {portalView === 'create' && (
              <div className="w-full max-w-md mx-auto p-8 bg-[#12131A] rounded-md border border-[#1E202B] relative z-10 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between border-b border-[#1E202B] pb-3 mb-4">
                  <h3 className="font-bold text-base text-white flex items-center gap-1.5 font-sans">
                    <Plus className="h-4.5 w-4.5 text-amber-500" /> Create Server Workspace
                  </h3>
                  <button
                    onClick={() => {
                      setPortalView('menu');
                      setCreateError('');
                    }}
                    className="text-xs text-zinc-400 hover:text-white font-bold cursor-pointer transition-colors"
                  >
                    ← Back
                  </button>
                </div>

                {createError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] rounded text-center mb-4 font-sans flex items-center justify-center gap-1.5 animate-pulse">
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                    <span>{createError}</span>
                  </div>
                )}

                <form onSubmit={handleCreateServerSubmit} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1 font-sans">Server ID (Alphanumeric, dashes, lowercase only) *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. city-church-choir"
                      value={createForm.id}
                      onChange={(e) => setCreateForm(p => ({ ...p, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                      className="w-full text-xs p-3 rounded font-mono premium-input"
                    />
                    <span className="text-[9px] text-zinc-500 block mt-1">This forms your unique workspace identifier.</span>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1 font-sans">Church / Choir Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. City Church Praise Team"
                      value={createForm.name}
                      onChange={(e) => setCreateForm(p => ({ ...p, name: e.target.value }))}
                      className="w-full text-xs p-3 rounded font-sans premium-input"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1 font-sans">Admin Password *</label>
                    <input
                      type="password"
                      required
                      placeholder="Create admin password..."
                      value={createForm.adminPassword}
                      onChange={(e) => setCreateForm(p => ({ ...p, adminPassword: e.target.value }))}
                      className="w-full text-xs p-3 rounded font-mono tracking-widest premium-input"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1 select-none">
                    <input
                      id="portal-checkbox-show-list"
                      type="checkbox"
                      checked={createForm.showOnPublicList}
                      onChange={(e) => setCreateForm(p => ({ ...p, showOnPublicList: e.target.checked }))}
                      className="w-4 h-4 rounded border-[#1E202B] bg-[#12131A] text-amber-500 focus:ring-amber-500/20 cursor-pointer"
                    />
                    <label htmlFor="portal-checkbox-show-list" className="text-xs text-zinc-400 cursor-pointer font-sans">
                      Show this workspace in the public servers directory
                    </label>
                  </div>

                  <div className="flex gap-2 justify-end pt-3 border-t border-[#1E202B]">
                    <button
                      type="button"
                      onClick={() => {
                        setPortalView('menu');
                        setCreateError('');
                      }}
                      className="premium-btn-secondary px-4 py-2 rounded text-xs font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={creatingServerStatus}
                      className="premium-btn-primary px-5 py-2 rounded text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {creatingServerStatus ? 'Creating...' : 'Create Server'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      );
    }
  }

  return (
    <div id="app-root" className="bg-[#090A0F] text-zinc-300 transition-colors duration-150 flex flex-col font-sans relative min-h-[100dvh]">
      
      {/* Top Professional Navigation Header - Single Row Consolidated Navbar */}
      <header id="main-header" className={`bg-[#090A0F] border-b border-[#1E202B] text-white z-20 px-6 py-4 relative ${selectedSongId ? 'hidden md:block' : ''}`}>
        <div className="w-full max-w-[1850px] mx-auto flex items-center justify-between gap-6">
          {/* Brand Logo */}
          <div 
            onClick={() => navigateTo('dashboard')}
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

          {/* Centered Navigation Tabs */}
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
              onClick={() => navigateTo('schedule')}
              className={`px-4 py-2 rounded text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'schedule'
                  ? 'bg-[#1E202B] text-amber-500 border border-amber-500/25'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1E202B]/40'
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>Schedule</span>
              {scheduledSongs.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-amber-500/20 text-amber-400 font-mono text-[9px] font-bold rounded-full border border-amber-500/30">
                  {scheduledSongs.length}
                </span>
              )}
            </button>
          </nav>

          {/* Right Action / Profile Controls */}
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
                  className="flex items-center gap-1.5 bg-[#12131A] hover:bg-[#1A1C26] border border-[#1E202B] hover:border-zinc-700 text-zinc-350 hover:text-white px-3.5 py-1.5 rounded text-[10px] uppercase font-mono tracking-wider transition-all cursor-pointer shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Server</span>
                </button>
              </div>
            ) : (
              session && (
                <div className="flex items-center gap-3">
                  {/* MongoDB Cloud Sync Status Badge */}
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

                  {/* Add Song & Import File buttons for admin/guest */}
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
                        className="bg-[#12131A] hover:bg-[#1A1C26] text-zinc-350 hover:text-white px-3.5 py-1.5 rounded text-xs font-semibold border border-[#1E202B] transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                      >
                        <Database className="h-3.5 w-3.5 text-amber-555" />
                        <span>Import</span>
                      </button>
                    </div>
                  )}

                  {/* User Profile Capsule */}
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

                  {/* Exit Workspace */}
                  <button 
                    onClick={handleLeaveServer}
                    className="flex items-center justify-center p-2 text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 rounded transition-all border border-[#1E202B] hover:border-rose-900/35 cursor-pointer shrink-0"
                    title="Leave Workspace"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      </header>

      {/* Main content body grid splits */}
      <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 max-w-[1850px] mx-auto w-full flex flex-col overflow-visible">
        <AnimatePresence mode="wait">
          {/* VIEW 1: CLEAN LANDING DASHBOARD */}
          {activeTab === 'dashboard' && (
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
              <span className="text-[9px] font-mono tracking-widest text-amber-500 font-bold uppercase bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">Active Session</span>
              <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight mt-2.5">
                Welcome back, <span className="text-amber-500">{session?.name || 'User'}</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-1 select-none font-mono">
                Logged in as: <span className="text-amber-400 font-bold uppercase">{session?.role}</span>
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
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Live Broadcast Follower Mode</h3>
                    <p className="text-[11px] text-zinc-400 mt-1 select-none font-medium leading-relaxed max-w-xl">
                      {isFollowing 
                        ? 'Actively listening for live broadcast... Your screen will automatically navigate to the active song.' 
                        : 'Enable to automatically open the song being projected/led by the worship leader.'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleFollow(!isFollowing)}
                  className={`relative z-10 px-5 py-2.5 rounded-full text-xs font-bold font-mono tracking-wider uppercase transition-all cursor-pointer active-touch shrink-0 ${
                    isFollowing 
                      ? 'bg-amber-500 text-black shadow-md hover:bg-amber-400 shadow-amber-500/25' 
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-350 hover:text-white hover:border-zinc-700'
                  }`}
                >
                  {isFollowing ? 'Syncing' : 'Follow'}
                </button>
              </div>
            )}

            {/* Elegant PWA Browser Install Banner */}
            {showInstallBanner && !isInstalled && !dismissedInstall && (
              <div className="w-full text-left mb-6 bg-gradient-to-r from-zinc-900 via-zinc-950 to-amber-955/25 p-5 md:p-6 rounded-3xl border border-amber-500/20 shadow-lg relative overflow-hidden group animate-in slide-in-from-top duration-300">
                {/* Background ambient gold aura */}
                <div className="absolute top-1/2 -right-4 -translate-y-1/2 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl group-hover:bg-amber-500/10 transition-all duration-500"></div>
                
                {/* Close Button top-right */}
                <button 
                  onClick={handleDismissInstall}
                  className="absolute top-3.5 right-3.5 p-1.5 rounded-full text-zinc-505 hover:text-zinc-350 hover:bg-white/5 transition-colors cursor-pointer active-touch"
                  title="Dismiss Banner"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 relative z-10">
                  {/* Left Column: Visual Icon with Glowing Ring */}
                  <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-amber-500/20 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.1)] relative">
                    <Smartphone className="h-6 w-6 text-amber-500" />
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center border-2 border-zinc-950">
                      <Download className="h-2.5 w-2.5 text-black stroke-[3]" />
                    </div>
                  </div>

                  {/* Middle Column: Explanatory Copy */}
                  <div className="flex-1 min-w-0 pr-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                      Install DaSong Songbook App
                      <span className="bg-amber-500/10 text-amber-400 text-[8px] font-mono font-bold px-1.5 py-0.2 rounded border border-amber-500/20 uppercase tracking-wide">PWA Active</span>
                    </h3>
                    <p className="text-[11.5px] text-zinc-400 mt-1 select-none font-medium leading-relaxed">
                      Pin to your Home Screen or Desktop for a premium offline experience, native fullscreen display, and notch-safe bounds for live worship sets.
                    </p>
                  </div>

                  {/* Right Column: Interactive Buttons */}
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
                  <Search className="h-4.5 w-4.5 text-zinc-550" />
                </div>
                <input
                  type="text"
                  placeholder="Quick song access... (Type title, author, or lyrics)"
                  value={quickSearchInput}
                  onChange={(e) => setQuickSearchInput(e.target.value)}
                  className="block w-full pl-11 pr-10 py-3 border border-[#1E202B] bg-[#12131A] text-white placeholder-zinc-550 focus:outline-none focus:border-amber-500/35 text-xs font-sans transition-all rounded"
                />
                {quickSearchInput && (
                  <button
                    onClick={() => setQuickSearchInput('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-355 cursor-pointer"
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
                        <div className="flex items-center gap-3 truncate">
                          <div className="h-8 w-8 rounded bg-[#1A1C26] border border-[#272A37] flex items-center justify-center text-zinc-400 group-hover:text-amber-500 transition-colors">
                            <Music className="h-4 w-4" />
                          </div>
                          <div className="truncate">
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

            {/* Quick Metrics Cards — 2 cols on mobile, 3 on sm+ */}
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
                      <div className="flex items-center gap-3 truncate">
                        <div className="h-7 w-7 rounded bg-[#1A1C26] border border-[#272A37] flex items-center justify-center text-zinc-400 group-hover:text-amber-500 transition-colors">
                          <Music className="h-3.5 w-3.5" />
                        </div>
                        <div className="truncate">
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
  )}

          {/* VIEW 2: DEDICATED SONG SEARCH VIEW */}
          {activeTab === 'search' && (
            <motion.div
              key="search"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
              className="w-full min-h-0"
            >
            {selectedSongId ? (
              /* Dedicated full-page lyric reading panel */
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
                  onScheduleSong={scheduleSong}
                  isScheduled={selectedSongId ? isScheduledOnDate(selectedSongId, new Date().toISOString().split('T')[0]) : false}
                />

              </div>
            ) : (
              /* Full-page Core Directory Grid Index List */
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
          )}

          {/* VIEW 3: PRACTICE SCHEDULE VIEW */}
          {activeTab === 'schedule' && (
            <ScheduleView
              songs={getSongsSortedByDate()}
              onRemove={removeSong}
              onMarkCompleted={markCompleted}
              onReschedule={rescheduleSong}
              onSelectSong={(id) => {
                setSongSourceTab('search');
                handleSelectSong(id);
                setActiveTab('search');
              }}
            />
          )}

        </AnimatePresence>
      </main>

      {/* Join Server Modal */}
      <AnimatePresence>
        {showJoinModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-xs z-40 flex items-end md:items-center justify-center p-0 md:p-4"
            onClick={() => {
              setShowJoinModal(false);
              setJoiningServer(null);
              setJoinRole(null);
              setJoinError('');
            }}
          >
            <motion.div
              initial={{ y: '20px', opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: '20px', opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="bg-[#070708] w-full h-[85vh] md:h-auto md:max-w-md rounded-t-3xl md:rounded-3xl p-5 md:p-6 space-y-4 shadow-2xl border-t md:border border-white/10 text-slate-350 overflow-y-auto pb-safe animate-in fade-in-50 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <h3 className="font-bold text-lg text-white flex items-center gap-1.5">
                  <Layers className="h-4.5 w-4.5 text-amber-500" /> Join Church Server
                </h3>
                <button
                  onClick={() => {
                    setShowJoinModal(false);
                    setJoiningServer(null);
                    setJoinRole(null);
                    setJoinError('');
                  }}
                  className="p-2 hover:bg-white/5 rounded-full text-slate-400 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {joinError && (
                <div className="p-3 bg-red-500/10 border border-red-550/20 text-red-400 text-[11px] rounded-xl text-center font-bold flex items-center justify-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                  <span>{joinError}</span>
                </div>
              )}

              {joiningServer === null ? (
                // Screen 1: List public servers
                <div className="space-y-4">
                  {/* Search input */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-zinc-550" />
                    </div>
                    <input
                      type="text"
                      placeholder="Search church or choir server..."
                      value={serverSearchQuery}
                      onChange={(e) => setServerSearchQuery(e.target.value)}
                      className="block w-full pl-10 pr-4 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950 text-white placeholder-zinc-550 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 text-xs shadow-inner"
                    />
                  </div>

                  {/* Available list */}
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {loadingServers ? (
                      <div className="text-center py-8 text-zinc-550 text-xs font-mono">
                        Loading active servers...
                      </div>
                    ) : (
                      (() => {
                        const filtered = publicServers.filter(s => 
                          s.name.toLowerCase().includes(serverSearchQuery.toLowerCase()) ||
                          s.id.toLowerCase().includes(serverSearchQuery.toLowerCase())
                        );
                        if (filtered.length === 0) {
                          return (
                            <div className="text-center py-8 text-zinc-550 text-xs font-sans italic">
                              No servers found. You can type a private server ID below or create a new server!
                            </div>
                          );
                        }
                        return filtered.map(s => (
                          <button
                            key={s.id}
                            onClick={() => {
                              // Cache server name to support page reload display
                              localStorage.setItem(`dasong_server_name_${s.id}`, s.name);
                              setJoiningServer(s);
                            }}
                            className="w-full p-3.5 bg-zinc-950/50 hover:bg-zinc-950 hover:border-amber-500/30 border border-zinc-850 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer group active-touch"
                          >
                            <div>
                              <div className="text-xs font-bold text-white group-hover:text-amber-450 transition-colors">
                                {s.name}
                              </div>
                              <div className="text-[10px] text-zinc-550 font-mono mt-0.5">
                                ID: {s.id}
                              </div>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-emerald-450 opacity-0 group-hover:opacity-100 transition-opacity">
                              [ Join ]
                            </span>
                          </button>
                        ));
                      })()
                    )}
                  </div>

                  {/* Private server entry */}
                  <div className="pt-3 border-t border-white/5 space-y-2">
                    <span className="text-[10px] font-mono uppercase text-zinc-500 font-bold block">
                      Join Private Server (by ID)
                    </span>
                    <div className="flex gap-2">
                      <input
                        id="private-server-id-input"
                        type="text"
                        placeholder="e.g. grace-chapel"
                        className="flex-1 px-3 py-2 border border-zinc-850 bg-zinc-950 rounded-xl text-white outline-none focus:border-amber-500 text-xs font-mono"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = (e.target as HTMLInputElement).value.trim().toLowerCase();
                            if (val) {
                              setJoiningServer({ id: val, name: val });
                            }
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          const input = document.getElementById('private-server-id-input') as HTMLInputElement;
                          const val = input?.value.trim().toLowerCase();
                          if (val) {
                            setJoiningServer({ id: val, name: val });
                          } else {
                            setJoinError('Please enter a server ID.');
                          }
                        }}
                        className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all active-touch"
                      >
                        Find
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                // Screen 2: Choose role
                <div className="space-y-4">
                  <div className="p-3 bg-zinc-900 border border-zinc-850 rounded-xl text-center">
                    <span className="text-[10px] font-mono uppercase text-zinc-500">Selected Workspace</span>
                    <h4 className="text-sm font-bold text-white mt-1">{joiningServer.name}</h4>
                    <span className="text-[9px] font-mono text-zinc-555 block mt-0.5">ID: {joiningServer.id}</span>
                  </div>

                  {joinRole === null ? (
                    <div className="space-y-3">
                      <button 
                        onClick={() => {
                          setJoinRole('choir');
                          setJoinError('');
                        }}
                        className="w-full flex items-center justify-between p-4 bg-zinc-950 border border-zinc-900 hover:border-amber-500/20 rounded-2xl transition-all text-left outline-none cursor-pointer group active-touch"
                      >
                        <div>
                          <p className="font-bold text-xs text-white flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Join as Choir Member
                          </p>
                          <p className="text-[10px] text-zinc-500 mt-1">Read lyrics, build setlists, and suggest songs.</p>
                        </div>
                        <span className="text-amber-500 font-bold group-hover:translate-x-1.5 transition-transform">→</span>
                      </button>

                      <button 
                        onClick={() => {
                          setJoinRole('admin');
                          setJoinError('');
                        }}
                        className="w-full flex items-center justify-between p-4 bg-zinc-950 border border-zinc-900 hover:border-amber-500/20 rounded-2xl transition-all text-left outline-none cursor-pointer group active-touch"
                      >
                        <div>
                          <p className="font-bold text-xs text-white flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                            Login as Admin
                          </p>
                          <p className="text-[10px] text-zinc-500 mt-1">Prompts password to unlock libraries management.</p>
                        </div>
                        <span className="text-amber-500 font-bold group-hover:translate-x-1.5 transition-transform">→</span>
                      </button>

                      <button 
                        onClick={() => {
                          setJoiningServer(null);
                          setJoinRole(null);
                          setJoinError('');
                        }}
                        className="w-full p-2.5 bg-zinc-900 text-zinc-400 hover:text-white text-xs font-bold rounded-xl text-center cursor-pointer transition-colors"
                      >
                        ← Select Different Server
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-white/5 pb-2">
                        <h4 className="text-xs font-bold text-amber-500 uppercase font-mono tracking-wider">
                          {joinRole === 'admin' ? 'Admin Login' : 'Choir Member Name'}
                        </h4>
                        <button 
                          onClick={() => { setJoinRole(null); setJoinError(''); }}
                          className="text-[10px] text-zinc-500 hover:text-white font-bold"
                        >
                          ← Change Role
                        </button>
                      </div>

                      {joinRole === 'admin' ? (
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono text-zinc-500 block uppercase">Admin Password</label>
                          <input 
                            type="password"
                            placeholder="Enter password..."
                            value={joinPasswordInput}
                            onChange={(e) => setJoinPasswordInput(e.target.value)}
                            className="w-full p-2.5 bg-zinc-950 border border-zinc-900 rounded-xl text-white outline-none focus:border-amber-500 text-xs font-mono"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleJoinServerSubmit();
                            }}
                          />
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono text-zinc-500 block uppercase">Your Full Name</label>
                          <input 
                            type="text"
                            placeholder="e.g. Dave"
                            value={joinNameInput}
                            onChange={(e) => setJoinNameInput(e.target.value)}
                            className="w-full p-2.5 bg-zinc-950 border border-zinc-900 rounded-xl text-white outline-none focus:border-amber-500 text-xs"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleJoinServerSubmit();
                            }}
                          />
                        </div>
                      )}

                      <div className="flex gap-2 justify-end pt-2">
                        <button
                          type="button"
                          onClick={() => { setJoinRole(null); setJoinError(''); }}
                          className="px-4 py-2 text-xs font-semibold bg-white/5 text-slate-300 hover:bg-white/10 rounded-xl"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleJoinServerSubmit}
                          className="bg-amber-500 hover:bg-amber-400 text-black px-5 py-2 rounded-full text-xs font-bold transition-all shadow-md cursor-pointer active-touch"
                        >
                          Enter Server
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Server Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-xs z-40 flex items-end md:items-center justify-center p-0 md:p-4"
            onClick={() => {
              setShowCreateModal(false);
              setCreateError('');
            }}
          >
            <motion.div
              initial={{ y: '20px', opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: '20px', opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="bg-[#070708] w-full h-auto md:max-w-md rounded-t-3xl md:rounded-3xl p-5 md:p-6 space-y-4 shadow-2xl border-t md:border border-white/10 text-slate-350 overflow-y-auto pb-safe animate-in fade-in-50 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <h3 className="font-bold text-lg text-white flex items-center gap-1.5">
                  <Plus className="h-4.5 w-4.5 text-amber-500" /> Add New Server Workspace
                </h3>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreateError('');
                  }}
                  className="p-2 hover:bg-white/5 rounded-full text-slate-400 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {createError && (
                <div className="p-3 bg-red-500/10 border border-red-550/20 text-red-400 text-[11px] rounded-xl text-center font-bold flex items-center justify-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <form onSubmit={handleCreateServerSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Server ID (Alphanumeric, dashes, lowercase only) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. city-church-choir"
                    value={createForm.id}
                    onChange={(e) => setCreateForm(p => ({ ...p, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                    className="w-full text-xs p-2.5 rounded-xl border border-white/10 bg-[#09090B] text-white outline-none focus:border-amber-500 font-mono"
                  />
                  <span className="text-[9px] text-zinc-550 block mt-1">This forms your unique workspace identifier.</span>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Church / Choir Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. City Church Praise Team"
                    value={createForm.name}
                    onChange={(e) => setCreateForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full text-xs p-2.5 rounded-xl border border-white/10 bg-[#09090B] text-white outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Admin Password *</label>
                  <input
                    type="password"
                    required
                    placeholder="Create admin password..."
                    value={createForm.adminPassword}
                    onChange={(e) => setCreateForm(p => ({ ...p, adminPassword: e.target.value }))}
                    className="w-full text-xs p-2.5 rounded-xl border border-white/10 bg-[#09090B] text-white outline-none focus:border-amber-500 font-mono tracking-widest"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1 select-none">
                  <input
                    id="checkbox-show-list"
                    type="checkbox"
                    checked={createForm.showOnPublicList}
                    onChange={(e) => setCreateForm(p => ({ ...p, showOnPublicList: e.target.checked }))}
                    className="w-4 h-4 rounded border-zinc-800 bg-zinc-950 text-amber-500 focus:ring-amber-500/20 cursor-pointer"
                  />
                  <label htmlFor="checkbox-show-list" className="text-xs text-zinc-400 cursor-pointer">
                    Show this workspace in the public servers directory
                  </label>
                </div>

                <div className="flex gap-2 justify-end pt-3 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setCreateError('');
                    }}
                    className="px-4 py-2 text-xs font-semibold bg-white/5 text-slate-300 hover:bg-white/10 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingServerStatus}
                    className="bg-amber-500 hover:bg-amber-400 text-black px-5 py-2 rounded-full text-xs font-bold transition-all shadow-md disabled:opacity-50 cursor-pointer"
                  >
                    {creatingServerStatus ? 'Creating...' : 'Create Server'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual ADD individual Song dialog Overlay */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-xs z-40 flex items-end md:items-center justify-center p-0 md:p-4"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              id="add-song-modal"
              initial={{ y: '20px', opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: '20px', opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="bg-[#12131A] w-full h-full md:h-auto md:max-w-2xl rounded-md p-5 md:p-6 space-y-4 shadow-lg border border-[#1E202B] text-zinc-300 overflow-y-auto pb-safe"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-center justify-between border-b border-[#1E202B] pb-3">
              <h3 className="font-bold text-lg text-white flex items-center gap-1.5 font-sans">
                <BookOpen className="h-5 w-5 text-amber-500" /> Add New Lyric Sheet
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-[#1A1C26] rounded text-zinc-400 cursor-pointer border border-[#1E202B] hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddSongSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-slate-400">Song Title *</label>
                  <input
                    id="add-title"
                    type="text"
                    required
                    value={addForm.title}
                    onChange={(e) => setAddForm(p => ({ ...p, title: e.target.value }))}
                    className="mt-1 w-full text-xs p-2.5 rounded border border-[#1E202B] bg-[#090A0F] text-white outline-none focus:border-amber-500/35 transition-all"
                    placeholder="e.g. Cornerstone"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400">Author / Artist Name</label>
                  <input
                    id="add-author"
                    type="text"
                    value={addForm.author}
                    onChange={(e) => setAddForm(p => ({ ...p, author: e.target.value }))}
                    className="mt-1 w-full text-xs p-2.5 rounded border border-[#1E202B] bg-[#090A0F] text-white outline-none focus:border-amber-500/35 transition-all"
                    placeholder="e.g. Hillsong Worship"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400">Original Key</label>
                  <input
                    id="add-key"
                    type="text"
                    value={addForm.key}
                    onChange={(e) => setAddForm(p => ({ ...p, key: e.target.value }))}
                    className="mt-1 w-full text-xs p-2.5 rounded border border-[#1E202B] bg-[#090A0F] text-white outline-none focus:border-amber-500/35 transition-all font-mono"
                    placeholder="e.g. G"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400">Tempo Speed (BPM)</label>
                  <input
                    id="add-bpm"
                    type="number"
                    value={addForm.bpm}
                    onChange={(e) => setAddForm(p => ({ ...p, bpm: parseInt(e.target.value) || 72 }))}
                    className="mt-1 w-full text-xs p-2.5 rounded border border-[#1E202B] bg-[#090A0F] text-white outline-none focus:border-amber-500/35 transition-all font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400">Song Category</label>
                  <select
                    id="add-category"
                    value={addForm.category}
                    onChange={(e) => setAddForm(p => ({ ...p, category: e.target.value }))}
                    className="mt-1 w-full text-xs p-2.5 rounded border border-[#1E202B] bg-[#090A0F] text-white outline-none focus:border-amber-500/35 transition-all cursor-pointer"
                  >
                    <option value="Worship">Contemporary Worship</option>
                    <option value="Classic">Classic Lyric</option>
                    <option value="Praise & Thanksgiving">Praise & Thanksgiving</option>
                    <option value="Christmas">Christmas Carol</option>
                    <option value="Gospel">Gospel Music</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">
                  Song Lyrics / Content *
                </label>
                <textarea
                  id="add-lyrics"
                  required
                  rows={8}
                  value={addForm.lyrics}
                  onChange={(e) => setAddForm(p => ({ ...p, lyrics: e.target.value }))}
                  className="mt-1 w-full text-xs p-3 rounded border border-[#1E202B] bg-[#090A0F] text-white font-mono outline-none focus:border-amber-500/35 transition-all"
                  placeholder={`Amazing grace! How sweet the sound
That saved a wretch like me!`}
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-[#1E202B] pb-6 md:pb-0">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="premium-btn-secondary px-4 py-2 rounded text-xs font-bold"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  className="premium-btn-primary px-5 py-2 rounded text-xs font-bold flex items-center gap-1.5"
                >
                  <Check className="h-4 w-4 stroke-[3]" /> Save Song to Library
                </button>
              </div>
            </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Uploader dialog modal Overlay */}
      <AnimatePresence>
        {showUploadModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-xs z-40 flex items-end md:items-center justify-center p-0 md:p-4"
            onClick={() => setShowUploadModal(false)}
          >
            <motion.div
              id="bulk-upload-modal"
              initial={{ y: '20px', opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: '20px', opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="bg-[#12131A] w-full h-full md:h-auto md:max-w-4xl rounded-md p-5 md:p-6 space-y-4 shadow-lg border border-[#1E202B] text-zinc-300 overflow-y-auto pb-safe"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-center justify-between border-b border-[#1E202B] pb-3">
              <h3 className="font-bold text-lg text-white flex items-center gap-1.5 font-sans">
                <Database className="h-5 w-5 text-amber-500" /> Bulk Lyrics Import Wizard
              </h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-2 hover:bg-[#1A1C26] rounded text-zinc-400 cursor-pointer border border-[#1E202B] hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <BulkUpload onSuccess={async () => {
              await syncSongsList();
            }} />

            <div className="flex gap-2 justify-end pt-3 border-t border-[#1E202B] pb-6 md:pb-0">
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="premium-btn-secondary px-5 py-2 rounded text-xs font-bold"
              >
                Done / Close Wizard
              </button>
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-screen Presentation View Overlay triggers if loaded */}
      {stageModeSong && (
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
      )}

      {/* Responsive Mobile Bottom Navigation Dock */}
      {session && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-zinc-950/90 border-t border-zinc-800/50 backdrop-blur-xl flex justify-around items-end shadow-[0_-8px_30px_rgba(0,0,0,0.7)] pb-safe animate-slideUp"
          style={{ paddingTop: '10px', paddingBottom: 'max(14px, env(safe-area-inset-bottom, 14px))' }}
        >
          {/* HOME */}
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center gap-1 px-5 pt-1 pb-0 text-xs transition-all active-touch cursor-pointer relative min-w-[56px] ${
              activeTab === 'dashboard' ? 'text-amber-500' : 'text-zinc-500'
            }`}
          >
            {activeTab === 'dashboard' && <span className="nav-tab-active-bar" />}
            <Home className={`w-6 h-6 transition-transform duration-200 ${activeTab === 'dashboard' ? 'drop-shadow-[0_0_8px_rgba(245,158,11,0.6)] scale-110' : ''}`} />
            <span className={`text-[11px] font-bold uppercase tracking-wider ${activeTab === 'dashboard' ? 'font-black' : ''}`}>Home</span>
          </button>

          {/* FIND */}
          <button
            onClick={() => {
              setSelectedSongId(null);
              navigateTo('search');
            }}
            className={`flex flex-col items-center gap-1 px-4 pt-1 pb-0 text-xs transition-all active-touch cursor-pointer relative min-w-[48px] ${
              activeTab === 'search' ? 'text-amber-500' : 'text-zinc-500'
            }`}
          >
            {activeTab === 'search' && <span className="nav-tab-active-bar" />}
            <BookOpen className={`w-5 h-5 transition-transform duration-200 ${activeTab === 'search' ? 'drop-shadow-[0_0_8px_rgba(245,158,11,0.6)] scale-110' : ''}`} />
            <span className={`text-[10px] font-bold uppercase tracking-wider ${activeTab === 'search' ? 'font-black' : ''}`}>Library</span>
          </button>

          {/* SCHEDULE */}
          <button
            onClick={() => {
              setSelectedSongId(null);
              navigateTo('schedule');
            }}
            className={`flex flex-col items-center gap-1 px-4 pt-1 pb-0 text-xs transition-all active-touch cursor-pointer relative min-w-[48px] ${
              activeTab === 'schedule' ? 'text-amber-500' : 'text-zinc-500'
            }`}
          >
            {activeTab === 'schedule' && <span className="nav-tab-active-bar" />}
            <Calendar className={`w-5 h-5 transition-transform duration-200 ${activeTab === 'schedule' ? 'drop-shadow-[0_0_8px_rgba(245,158,11,0.6)] scale-110' : ''}`} />
            <span className={`text-[10px] font-bold uppercase tracking-wider ${activeTab === 'schedule' ? 'font-black' : ''}`}>Schedule</span>
          </button>

          {/* ADMIN/GUEST FAB — center elevated button for quick actions */}
          {(session.role === 'admin' || session.role === 'guest') && (
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



          {/* INSTALL PWA (shown when installable and guest/choir nav would leave empty slot) */}
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
      )}

      {/* iOS Safari Custom Installation Instructions Drawer */}
      <AnimatePresence>
        {showIOSInstructions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-end md:items-center justify-center p-0 md:p-4"
            onClick={() => setShowIOSInstructions(false)}
          >
            <motion.div 
              id="ios-install-modal" 
              initial={{ y: '20px', opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: '20px', opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="bg-[#070708] w-full h-auto md:max-w-md rounded-t-3xl md:rounded-3xl p-6 space-y-5 shadow-2xl border-t md:border border-white/10 text-slate-350 bottom-sheet-mobile overflow-y-auto pb-safe"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-amber-500" /> Save to Home Screen
              </h3>
              <button
                onClick={() => setShowIOSInstructions(false)}
                className="p-1.5 hover:bg-white/5 rounded-full text-slate-400 cursor-pointer active-touch transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-amber-500/5 rounded-2xl border border-amber-500/10 text-[11px] text-amber-400 font-medium leading-relaxed flex gap-2">
                <HelpCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p>
                  To install, you must open this website in the iOS <strong className="text-white">Safari</strong> browser. Third-party in-app browsers do not support direct addition.
                </p>
              </div>

              <div className="space-y-4 pt-1 font-sans">
                {/* Step 1 */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-mono font-bold text-amber-500 flex items-center justify-center shrink-0">
                    1
                  </div>
                  <div className="flex-1 text-xs">
                    <p className="text-white font-bold">Tap the Safari Share Button</p>
                    <p className="text-zinc-400 mt-0.5 leading-relaxed">
                      Tap the standard sharing icon in Safari's bottom browser bar (or top toolbar on iPad):
                    </p>
                    <div className="mt-2 inline-flex items-center gap-1.5 bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800">
                      {/* Custom Safari Share Icon SVG */}
                      <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />
                      </svg>
                      <span className="text-[10px] text-zinc-300 font-bold uppercase tracking-wider font-mono">Safari Share</span>
                    </div>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-mono font-bold text-amber-500 flex items-center justify-center shrink-0">
                    2
                  </div>
                  <div className="flex-1 text-xs">
                    <p className="text-white font-bold">Select "Add to Home Screen"</p>
                    <p className="text-zinc-400 mt-0.5 leading-relaxed">
                      Scroll down the options page in the share menu sheet and select:
                    </p>
                    <div className="mt-2 inline-flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800">
                      <div className="w-4.5 h-4.5 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-300 font-extrabold text-[10px]">
                        +
                      </div>
                      <span className="text-[10px] text-zinc-300 font-bold uppercase tracking-wider font-mono">Add to Home Screen</span>
                    </div>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-mono font-bold text-amber-500 flex items-center justify-center shrink-0">
                    3
                  </div>
                  <div className="flex-1 text-xs">
                    <p className="text-white font-bold">Confirm App Details</p>
                    <p className="text-zinc-400 mt-0.5 leading-relaxed">
                      Tap the <strong className="text-white">Add</strong> button in the top-right corner to complete the installation process. The icon will appear instantly on your home screen!
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-white/5 flex">
              <button
                type="button"
                onClick={() => setShowIOSInstructions(false)}
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-extrabold py-2.5 px-4 rounded-xl text-xs transition-colors cursor-pointer active-touch text-center"
              >
                Close Instructions
              </button>
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>



    </div>
  );
}

