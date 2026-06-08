import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Music, Sparkles, Layers, Sliders, Play, Settings, Plus, Star, Heart, 
  Trash2, X, AlertCircle, RefreshCw, Check, BookOpen, Database, Award, 
  ChevronRight, Compass, HelpCircle, Calendar, Download, Smartphone,
  Home, Search, LogOut
} from 'lucide-react';
import { Song, UserRole, WorshipEvent } from './types';
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
  getLocalWorshipEvents,
  saveWorshipEvent,
  deleteSuggestion,
  getActiveServerId,
  switchActiveServer,
  getPublicServers,
  createServer,
  authServerAdmin
} from './lib/db';
import BulkUpload from './components/BulkUpload';
import StageMode from './components/StageMode';
import SongList from './components/SongList';
import SongDetail from './components/SongDetail';
import WorshipEvents from './components/WorshipEvents';
import { motion, AnimatePresence } from 'motion/react';
import { parseTwoLineChords } from './utils/lyricsParser';


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

  const [session, setSession] = useState<UserSession | null>(() => {
    const serverId = getActiveServerId();
    if (serverId === 'default') {
      return { role: 'guest', name: 'Guest Browser' };
    }
    const savedRole = localStorage.getItem(`lyrasync_user_role_${serverId}`);
    const savedName = localStorage.getItem(`lyrasync_user_name_${serverId}`);
    if (savedRole === 'admin' || savedRole === 'choir') {
      return {
        role: savedRole as UserRole,
        name: savedName || (savedRole === 'admin' ? 'Administrator' : '')
      };
    }
    return null; // Force login/role selection for this server
  });

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



  // Choir Suggestions Review State & Helpers
  const [suggestions, setSuggestions] = useState<any[]>([]);

  // Worship Calendar Events State & Helpers
  const [events, setEvents] = useState<WorshipEvent[]>([]);

  const loadEvents = useCallback(() => {
    setEvents(getLocalWorshipEvents());
  }, []);

  const linkSongsToEvent = useCallback(async (eventId: string, songIds: string[]) => {
    const localEvents = getLocalWorshipEvents();
    const ev = localEvents.find(e => e.id === eventId);
    if (!ev) return;
    
    const currentSongIds = ev.songIds || [];
    const updatedIds = [...currentSongIds];
    songIds.forEach(id => {
      if (!updatedIds.includes(id)) {
        updatedIds.push(id);
      }
    });
    
    const updatedEv = { ...ev, songIds: updatedIds };
    try {
      await saveWorshipEvent(updatedEv);
    } catch (err) {
      console.error('Failed to link songs to event:', err);
    } finally {
      loadEvents();
    }
  }, [loadEvents]);

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




  
  // App view toggle states
  const [activeTab, setActiveTab] = useState<'dashboard' | 'search' | 'calendar'>('dashboard');
  const [songSourceTab, setSongSourceTab] = useState<'search' | 'calendar' | 'dashboard'>('search');

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
  const navigateTo = useCallback((tab: 'dashboard' | 'search' | 'calendar') => {
    setActiveTab(tab);
    history.pushState({ tab, songId: null }, '', window.location.pathname);
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

  // Seed the initial history entry so there is always something to pop back to,
  // and handle Android back button presses via popstate.
  useEffect(() => {
    // Replace the very first entry so we control it
    history.replaceState({ tab: 'dashboard', songId: null }, '', window.location.pathname);

    const handlePopState = (e: PopStateEvent) => {
      const state = e.state as { tab?: string; songId?: string | null } | null;

      // If a song is open, close it first (back = close song detail)
      setSelectedSongId(prev => {
        if (prev) {
          setActiveSetlistIds([]);
          // Re-push so next back press handles tab level
          history.pushState({ tab: activeTab, songId: null }, '', window.location.pathname);
          return null;
        }
        return prev;
      });

      // If no song was open and state carries a tab, restore it
      if (state?.tab && !state.songId) {
        setActiveTab(state.tab as 'dashboard' | 'search' | 'calendar');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  
  // Stage (full-screen presenting) control
  const [stageModeSong, setStageModeSong] = useState<{ song: Song; transpose: number } | null>(null);

  // Manual Add Form structure
  const [addForm, setAddForm] = useState({
    title: '',
    author: '',
    key: 'G',
    bpm: 72,
    category: 'Worship',
    lyrics: ''
  });



  // Load / Sync songs metadata on load
  const syncSongsList = useCallback(async () => {
    try {
      const list = await getAllSongsMetadata();
      // Sort primarily by favorites, then creation date or title
      const sorted = [...list].sort((a, b) => {
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
      loadEvents();
      setMongoStatus('connected');
    } catch (err) {
      console.error('Failed to synchronize with MongoDB Cloud:', err);
      setMongoStatus('error');
    }
  }, [syncSongsList, loadSuggestions, loadEvents]);

  const handleSwitchServer = useCallback(async (newServerId: string) => {
    switchActiveServer(newServerId);
    setActiveServerId(newServerId);

    const savedRole = localStorage.getItem(`lyrasync_user_role_${newServerId}`);
    const savedName = localStorage.getItem(`lyrasync_user_name_${newServerId}`);

    if (newServerId === 'default') {
      setSession({ role: 'guest', name: 'Guest Browser' });
    } else if (savedRole === 'admin' || savedRole === 'choir') {
      setSession({
        role: savedRole as UserRole,
        name: savedName || (savedRole === 'admin' ? 'Administrator' : '')
      });
    } else {
      setSession(null); // Force role selection for the server
    }

    // Clear/reload states
    setSongs([]);
    setEvents([]);
    setSuggestions([]);
    
    // Trigger database re-initialization and background sync
    try {
      await initDB();
      await syncSongsList();
      loadSuggestions();
      loadEvents();
      triggerMongoSync();
    } catch (err) {
      console.error('Error switching server DB:', err);
    }
  }, [syncSongsList, loadSuggestions, loadEvents, triggerMongoSync]);

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
    if (confirm('Are you sure you want to exit this server and return to the Guest public library?')) {
      await handleSwitchServer('default');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(`lyrasync_user_role_${activeServerId}`);
    localStorage.removeItem(`lyrasync_user_name_${activeServerId}`);
    setSession(null);
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
        const hasSeeded = localStorage.getItem(`dasong_has_seeded_${activeServerId}`) === 'true';
        if (list.length === 0 && !hasSeeded) {
          console.log(`Song library for ${activeServerId} is empty. Seeding default worship songbook...`);
          const { SEED_SONGS } = await import('./data/seedSongs');
          await saveSongsBatch(SEED_SONGS);
          localStorage.setItem(`dasong_has_seeded_${activeServerId}`, 'true');
        }
        
        await syncSongsList();
        loadSuggestions();
        loadEvents();
      } catch (err) {
        console.error('Database setup error:', err);
      } finally {
        setInitialLoading(false);
      }
    }
    bootApp();
  }, [activeServerId, syncSongsList, loadSuggestions, loadEvents]);

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
      // Push history so Android back button closes the song detail instead of exiting
      history.pushState({ songId: id }, '', window.location.pathname);
      setRecentSongIds(prev => {
        const next = [id, ...prev.filter(x => x !== id)].slice(0, 5);
        localStorage.setItem(`dasong_recent_songs_${activeServerId}`, JSON.stringify(next));
        return next;
      });
    }
  }, []);

  // Handle single chord toggle favorite
  const handleToggleFavorite = useCallback(async (id: string, currentFav: boolean) => {
    try {
      const fullSong = await getSongById(id);
      if (fullSong) {
        fullSong.favorite = !currentFav;
        await saveSong(fullSong);
      }
    } catch (err) {
      console.error('Failed toggling favorited state:', err);
    } finally {
      await syncSongsList();
    }
  }, [syncSongsList]);

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

      if (targetEventIdForAdd) {
        await linkSongsToEvent(targetEventIdForAdd, [newSong.id]);
      }

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
      localStorage.setItem(`dasong_has_seeded_${activeServerId}`, 'true');
      await clearAllSongs();
      setSelectedSongId(null);
      await syncSongsList();
      alert('All songs have been successfully removed!');
    } catch (err) {
      console.error(err);
      alert('Failed to clear library: ' + err);
    }
  };

  // Presentation Trigger handlers
  const handleEnterStageMode = async (transposeStep: number) => {
    if (!selectedSongId) return;
    try {
      const fullSong = await getSongById(selectedSongId);
      if (fullSong) {
        setStageModeSong({ song: fullSong, transpose: transposeStep });
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
      <div className="flex flex-col items-center py-8 md:py-16 px-4 w-full max-w-5xl mx-auto select-none">
        {/* Ambient glow backgrounds */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-amber-500/[0.03] rounded-full blur-3xl pointer-events-none"></div>

        {/* Hero Section */}
        <div className="text-center max-w-2xl mb-12 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider mb-4 animate-bounce">
            <Sparkles className="w-3.5 h-3.5" /> Premium Worship Companion
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-none bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            DaSong Songbook Portal
          </h1>
          <p className="text-sm md:text-base text-zinc-400 mt-4 leading-relaxed font-medium">
            A secure multi-tenant platform for churches, choirs, and worship groups. Browse public song sheets, sync setlists, and manage team chord libraries.
          </p>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full relative z-10">
          {/* Browse Library */}
          <div 
            onClick={() => setActiveTab('search')}
            className="group relative p-6 bg-zinc-900/40 hover:bg-zinc-900/70 border border-zinc-800/80 hover:border-amber-500/30 rounded-3xl transition-all duration-300 text-center cursor-pointer shadow-lg active-touch flex flex-col items-center justify-between min-h-[240px]"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.02] to-transparent rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="w-12 h-12 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform duration-300">
              <BookOpen className="w-6 h-6" />
            </div>
            <div className="mt-4">
              <h3 className="text-base font-extrabold text-white group-hover:text-amber-450 transition-colors">Public Library</h3>
              <p className="text-xs text-zinc-450 mt-2 leading-relaxed">
                Browse our default collection of worship lyrics and chords in read-only mode.
              </p>
            </div>
            <span className="text-[10px] font-mono font-bold text-amber-500/80 mt-4 group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
              Browse Songs <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>

          {/* Join Server */}
          <div 
            onClick={() => {
              setShowJoinModal(true);
              fetchServers();
            }}
            className="group relative p-6 bg-zinc-900/40 hover:bg-zinc-900/70 border border-zinc-800/80 hover:border-amber-500/30 rounded-3xl transition-all duration-300 text-center cursor-pointer shadow-lg active-touch flex flex-col items-center justify-between min-h-[240px]"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.02] to-transparent rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="w-12 h-12 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-emerald-450 group-hover:scale-110 transition-transform duration-300">
              <Layers className="w-6 h-6" />
            </div>
            <div className="mt-4">
              <h3 className="text-base font-extrabold text-white group-hover:text-emerald-400 transition-colors">Join Church Server</h3>
              <p className="text-xs text-zinc-450 mt-2 leading-relaxed">
                Connect to an existing workspace for your local church choir or worship team.
              </p>
            </div>
            <span className="text-[10px] font-mono font-bold text-emerald-450 mt-4 group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
              Find Server <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>

          {/* Create Server */}
          <div 
            onClick={() => setShowCreateModal(true)}
            className="group relative p-6 bg-zinc-900/40 hover:bg-zinc-900/70 border border-zinc-800/80 hover:border-amber-500/30 rounded-3xl transition-all duration-300 text-center cursor-pointer shadow-lg active-touch flex flex-col items-center justify-between min-h-[240px]"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-rose-500/[0.02] to-transparent rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="w-12 h-12 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-rose-450 group-hover:scale-110 transition-transform duration-300">
              <Plus className="w-6 h-6" />
            </div>
            <div className="mt-4">
              <h3 className="text-base font-extrabold text-white group-hover:text-rose-400 transition-colors">Create Server</h3>
              <p className="text-xs text-zinc-455 mt-2 leading-relaxed">
                Initialize a clean, dedicated workspace with isolated database and team permissions.
              </p>
            </div>
            <span className="text-[10px] font-mono font-bold text-rose-455 mt-4 group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
              Start Workspace <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>
    );
  };

  if (activeServerId !== 'default' && !session) {
    const serverName = localStorage.getItem(`dasong_server_name_${activeServerId}`) || activeServerId;
    return (
      <div id="login-portal" className="flex items-center justify-center min-h-[100dvh] bg-[#070708] text-white p-4 font-sans relative overflow-hidden">
        {/* Backdrop patterns */}
        <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:16px_16px]"></div>
        <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-amber-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-rose-500/5 rounded-full blur-3xl"></div>

        <div className="w-full max-w-md p-6 bg-zinc-950/40 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_40px_rgba(245,158,11,0.05)] relative z-10 animate-in fade-in zoom-in-95 duration-350">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-black tracking-tight text-white mb-2">{serverName}</h1>
            <p className="text-zinc-550 text-xs font-mono uppercase tracking-widest">Workspace ID: {activeServerId}</p>
            <p className="text-zinc-400 text-xs mt-2">Select your access role to enter this church server workspace.</p>
          </div>

          {joinError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-550/20 text-red-405 text-[11px] rounded-xl text-center font-bold">
              ⚠️ {joinError}
            </div>
          )}

          {joinRole === null ? (
            <div className="space-y-3">
              <button 
                onClick={() => {
                  setJoinRole('choir');
                  setJoinError('');
                }}
                className="w-full flex items-center justify-between p-4 bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-900 hover:border-amber-500/30 rounded-2xl transition-all text-left outline-none cursor-pointer group active-touch"
              >
                <div>
                  <p className="font-bold text-xs text-white flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Join as Choir Member
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-1 font-medium">Access songs, worship setlists, and suggest songs sheets.</p>
                </div>
                <span className="text-amber-500 font-bold group-hover:translate-x-1.5 transition-transform">→</span>
              </button>

              <button 
                onClick={() => {
                  setJoinRole('admin');
                  setJoinError('');
                }}
                className="w-full flex items-center justify-between p-4 bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-900 hover:border-amber-500/30 rounded-2xl transition-all text-left outline-none cursor-pointer group active-touch"
              >
                <div>
                  <p className="font-bold text-xs text-white flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                    Login as Administrator
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-1 font-medium">Enter password to unlock song creation, imports, and full management.</p>
                </div>
                <span className="text-amber-500 font-bold group-hover:translate-x-1.5 transition-transform">→</span>
              </button>

              <div className="pt-4 border-t border-white/5 flex gap-2">
                <button 
                  onClick={async () => {
                    await handleSwitchServer('default');
                  }}
                  className="w-full p-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs font-bold rounded-2xl text-center transition-all cursor-pointer active-touch"
                >
                  ← Return to Guest Library
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-2.5 mb-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-500">{joinRole === 'admin' ? '👑 Admin' : '🧑‍🎤 Choir'} Access</h3>
                <button 
                  onClick={() => { setJoinRole(null); setJoinError(''); }}
                  className="text-xs text-zinc-400 hover:text-white font-bold cursor-pointer transition-colors"
                >
                  ← Back
                </button>
              </div>

              {joinRole === 'admin' && (
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-zinc-500 mb-1 uppercase font-mono tracking-wider">Admin Workspace Password</label>
                  <input 
                    type="password"
                    placeholder="••••••••"
                    value={joinPasswordInput}
                    onChange={(e) => setJoinPasswordInput(e.target.value)}
                    className="w-full p-3 bg-zinc-950 border border-zinc-900 rounded-xl text-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 text-xs font-mono tracking-widest shadow-inner"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleJoinServerSubmit();
                    }}
                  />
                </div>
              )}

              {joinRole === 'choir' && (
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-zinc-500 mb-1 uppercase font-mono tracking-wider">Enter Your Name</label>
                  <input 
                    type="text"
                    placeholder="e.g. John"
                    value={joinNameInput}
                    onChange={(e) => setJoinNameInput(e.target.value)}
                    className="w-full p-3 bg-zinc-950 border border-zinc-900 rounded-xl text-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 text-xs font-sans shadow-inner"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleJoinServerSubmit();
                    }}
                  />
                </div>
              )}

              <button 
                onClick={handleJoinServerSubmit}
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-black py-3 px-4 rounded-xl text-xs transition-all cursor-pointer shadow-md active:scale-98 active-touch"
              >
                Access Server Workspace
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div id="app-root" className={`h-[100dvh] md:h-auto overflow-hidden md:overflow-visible bg-[#08080a] text-zinc-300 transition-colors duration-300 flex flex-col font-sans relative`}>
      {/* Dynamic hardware grid pattern */}
      <div className="absolute inset-0 pointer-events-none opacity-2 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      
      {/* Top Professional Navigation Header - Styled like a premium MIDI master strip */}
      <header id="main-header" className="bg-zinc-950/95 border-b border-zinc-800/80 text-white shadow-[0_4px_20px_rgba(0,0,0,0.6)] z-20 p-3 md:p-4 sticky top-0 md:relative backdrop-blur-md">
        <div className="w-full max-w-[1850px] mx-auto flex flex-col gap-3.5">
          {/* Row 1: Brand Logo & Telemetry Strip */}
          <div className="flex items-center justify-between w-full gap-4">
          <div className="flex items-center gap-2.5 md:gap-3.5 select-none">
            {/* Ultra-Stylish CSS Gradient Vector Logo */}
            <div className="w-9 h-9 md:w-11 md:h-11 bg-zinc-900/60 border border-zinc-800/85 rounded-xl md:rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.12)] shrink-0 relative overflow-hidden group hover:border-amber-500/35 transition-all duration-300">
              {/* Glowing backdrop aura */}
              <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 to-rose-500/10 opacity-60 group-hover:opacity-100 transition-opacity duration-300"></div>
              
              {/* Sleek Custom Vector SVG Logo with Glowing Gradients: Equalizer Crossbeam + Vertical Cross */}
              <svg className="w-5 h-5 md:w-6.5 md:h-6.5 relative z-10 drop-shadow-[0_2px_10px_rgba(245,158,11,0.45)]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="cross-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#fbbf24" /> {/* Gold */}
                    <stop offset="100%" stopColor="#f97316" /> {/* Orange */}
                  </linearGradient>
                  <linearGradient id="wave-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ef4444" /> {/* Red */}
                    <stop offset="50%" stopColor="#f43f5e" /> {/* Rose */}
                    <stop offset="100%" stopColor="#ec4899" /> {/* Pink */}
                  </linearGradient>
                </defs>
                
                {/* Modern Equalizer Soundwaves forming the horizontal crossbeam */}
                <rect x="3" y="11" width="1.5" height="2" rx="0.75" fill="url(#wave-grad)" />
                <rect x="5.75" y="9" width="1.5" height="6" rx="0.75" fill="url(#wave-grad)" />
                <rect x="8.5" y="6" width="1.5" height="12" rx="0.75" fill="url(#wave-grad)" />
                <rect x="14" y="6" width="1.5" height="12" rx="0.75" fill="url(#wave-grad)" />
                <rect x="16.75" y="9" width="1.5" height="6" rx="0.75" fill="url(#wave-grad)" />
                <rect x="19.5" y="11" width="1.5" height="2" rx="0.75" fill="url(#wave-grad)" />

                {/* Sleek Vertical Cross Beam in the center */}
                <rect x="11.25" y="2" width="1.5" height="20" rx="0.75" fill="url(#cross-grad)" />
              </svg>
              
              {/* Dynamic live red indicator dot */}
              <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_6px_#ef4444]" />
            </div>

            {/* Stylish Gradient App Name */}
            <div className="flex flex-col text-left">
              <h1 className="text-base md:text-2xl font-black tracking-tight select-none leading-none bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 bg-clip-text text-transparent drop-shadow-[0_2px_12px_rgba(245,158,11,0.15)]">
                DaSong
              </h1>
              <span className="text-[8px] md:text-[9.5px] font-mono tracking-[0.25em] text-zinc-500 font-extrabold uppercase mt-1 block">
                SONGBOOK
              </span>
            </div>
          </div>

          {/* Real-time sync counters & Telemetry strip */}
          <div id="stats-dashboard" className="flex items-center gap-3 md:gap-3.5 flex-wrap ml-auto">
            {activeServerId !== 'default' && (
              <div className="text-right hidden md:block">
                <span className="text-[9px] font-mono tracking-widest uppercase block text-zinc-500">Workspace</span>
                <span className="font-mono text-xs leading-none text-zinc-300 block font-black max-w-[120px] truncate">
                  {localStorage.getItem(`dasong_server_name_${activeServerId}`) || activeServerId}
                </span>
              </div>
            )}

            <div className="text-right hidden md:block">
              <span className="text-[9px] font-mono tracking-widest uppercase block text-zinc-500">Total Songs</span>
              <span className="font-mono text-xs leading-none text-zinc-300 block font-black">
                {stats.total.toLocaleString()} Songs
              </span>
            </div>

            <div className="h-5 w-[1px] bg-zinc-800 hidden md:block" />

            {/* Quick theme selections and toggles */}
            <div className="flex items-center gap-2">
              
              {activeServerId === 'default' ? (
                <>
                  {showInstallBanner && !isInstalled && (
                    <button 
                      onClick={handleInstallApp}
                      className="hidden sm:flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded-full text-[10px] font-mono font-bold transition-all cursor-pointer active-touch shrink-0"
                      title="Install DaSong Songbook App"
                    >
                      <Download className="h-3.5 w-3.5 stroke-[2.5]" /> Install App
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowJoinModal(true);
                      fetchServers();
                    }}
                    className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-450 text-black font-extrabold px-3 py-1.5 rounded-full text-[10px] uppercase font-mono tracking-wider transition-all cursor-pointer active-touch shrink-0"
                  >
                    🔌 Join Server
                  </button>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-350 hover:text-white font-extrabold px-3 py-1.5 rounded-full text-[10px] uppercase font-mono tracking-wider transition-all cursor-pointer active-touch shrink-0"
                  >
                    ➕ Add Server
                  </button>
                </>
              ) : (
                session && (
                  <div className="flex items-center gap-2 sm:gap-3">

                    {/* MongoDB Cloud Sync Status Badge */}
                    <button
                      id="mongodb-sync-status-badge"
                      onClick={handleForceSync}
                      disabled={mongoStatus === 'connecting'}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono font-bold border transition-all cursor-pointer active-touch shrink-0 ${
                        mongoStatus === 'connected'
                          ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                          : mongoStatus === 'connecting'
                            ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20 animate-pulse'
                            : mongoStatus === 'error'
                              ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/20 shadow-[0_0_10px_rgba(239,68,68,0.15)]'
                              : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border-zinc-800'
                      }`}
                      title="Click to Force Sync with Cloud Database"
                    >
                      <span className="text-xs leading-none">🍃</span>
                      <span>
                        {mongoStatus === 'connected'
                          ? <><span className="hidden xs:inline">Cloud Saved</span><span className="xs:hidden">Saved</span></>
                          : mongoStatus === 'connecting'
                            ? 'Syncing...'
                            : mongoStatus === 'error'
                              ? <><span className="hidden xs:inline">Sync Error</span><span className="xs:hidden">Error</span></>
                              : 'Offline'}
                      </span>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        mongoStatus === 'connected'
                          ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]'
                          : mongoStatus === 'connecting'
                            ? 'bg-amber-500 animate-pulse shadow-[0_0_6px_#f59e0b]'
                            : mongoStatus === 'error'
                              ? 'bg-rose-500 shadow-[0_0_6px_#ef4444]'
                              : 'bg-zinc-650'
                      }`} />
                    </button>


                    
                    {/* Secondary Header PWA Install Shortcut Badge */}
                    {showInstallBanner && !isInstalled && (
                      <button 
                        onClick={handleInstallApp}
                        className="hidden sm:flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded-full text-[10px] font-mono font-bold transition-all cursor-pointer active-touch mr-1 shrink-0 animate-in fade-in"
                        title="Install DaSong Songbook App"
                      >
                        <Download className="h-3.5 w-3.5 stroke-[2.5]" /> Install App
                      </button>
                    )}
                    
                    {/* User Profile Pill - Highly optimized and space-efficient on mobile */}
                    <div 
                      className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-2 py-1.5 sm:px-3.5 sm:py-1.5 rounded-full shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)] shrink-0"
                      title={`${session.role}: ${session.name}`}
                    >
                      <span className={`text-[10px] font-mono font-extrabold px-1.5 py-0.2 rounded border uppercase shrink-0 ${
                        session.role === 'admin' 
                          ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-[0_0_8px_rgba(245,158,11,0.1)]' 
                          : session.role === 'choir'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}>
                        <span className="sm:hidden">
                          {session.role === 'admin' ? '👑' : session.role === 'choir' ? '🧑‍🎤' : '👤'}
                        </span>
                        <span className="hidden sm:inline">{session.role}</span>
                      </span>
                      <span className="hidden sm:inline text-xs text-zinc-300 font-bold max-w-[120px] truncate">
                        {session.role === 'choir' ? `👋 ${session.name}` : session.name}
                      </span>
                    </div>
                    
                    {/* Compact Sign Out / Leave Server */}
                    <button 
                      onClick={handleLeaveServer}
                      className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-1.5 text-xs font-bold bg-zinc-900 hover:bg-rose-950/20 text-zinc-400 hover:text-rose-455 rounded-full border border-zinc-800 hover:border-rose-900/45 transition-all cursor-pointer active:scale-95 active-touch shrink-0"
                      title="Leave Server Workspace"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-455" />
                      <span className="hidden xs:inline">Leave Workspace</span>
                    </button>
                  </div>
                )
              )}

            </div>

          </div>
        </div>

        {/* Row 2: Unified Action & Navigation Bar */}
        <div id="unified-action-bar" className="hidden md:flex items-center justify-between w-full border-t border-zinc-800/80 pt-3 relative">
          <div className="flex items-center gap-2.5">
            {/* Dashboard Home Button */}
            <button 
              id="tab-dashboard"
              onClick={() => navigateTo('dashboard')}
              className={`flex items-center gap-2 px-4 rounded-xl text-xs font-black tracking-wider transition-all h-10 border cursor-pointer select-none ${
                activeTab === 'dashboard' 
                  ? 'bg-zinc-950 border-amber-500 text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.15)] font-black' 
                  : 'bg-zinc-900/60 border-zinc-850 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              {activeTab === 'dashboard' ? (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444] mr-0.5 shrink-0" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-zinc-800 mr-0.5 shrink-0" />
              )}
              🏠 Home
            </button>

            {/* Song Library Navigation */}
            <button 
              id="tab-search"
              onClick={() => navigateTo('search')}
              className={`flex items-center gap-2 px-4 rounded-xl text-xs font-black tracking-wider transition-all h-10 border cursor-pointer select-none ${
                activeTab === 'search' 
                  ? 'bg-zinc-950 border-amber-500 text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.15)] font-black' 
                  : 'bg-zinc-900/60 border-zinc-850 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              {activeTab === 'search' ? (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_#f59e0b] mr-0.5 shrink-0" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-zinc-800 mr-0.5 shrink-0" />
              )}
              📖 Song Library
            </button>

            {/* Worship Setlists Navigation (Hidden for Guests) */}
            {session && session.role !== 'guest' && (
              <button 
                id="tab-calendar"
                onClick={() => navigateTo('calendar')}
                className={`flex items-center gap-2 px-4 rounded-xl text-xs font-black tracking-wider transition-all h-10 border cursor-pointer select-none ${
                  activeTab === 'calendar' 
                    ? 'bg-zinc-950 border-amber-500 text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.15)] font-black' 
                    : 'bg-zinc-900/60 border-zinc-850 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                {activeTab === 'calendar' ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981] mr-0.5 shrink-0" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-zinc-800 mr-0.5 shrink-0" />
                )}
                <Calendar className="h-3.5 w-3.5 shrink-0" /> Worship Setlists
              </button>
            )}
          </div>

          {/* Right Side: Admin Tools */}
          {session && session.role === 'admin' && (
            <div className="flex items-center gap-2 ml-auto">
              <button 
                onClick={() => setShowAddModal(true)}
                className="bg-amber-500 hover:bg-amber-400 text-black font-black px-4 rounded-xl text-xs transition-all shadow-[0_0_10px_rgba(245,158,11,0.1)] flex items-center gap-1.5 h-10 cursor-pointer active:scale-95"
              >
                <Plus className="h-4 w-4 text-black stroke-[3]" /> Add Song
              </button>
              
              <button 
                onClick={() => setShowUploadModal(true)}
                className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white px-4 rounded-xl text-xs font-bold border border-zinc-800 transition-all h-10 cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <Database className="h-4 w-4 text-amber-500" /> Import File
              </button>
            </div>
          )}
        </div>
        </div>
      </header>

      {/* Main content body grid splits */}
      <main className={`flex-1 p-4 md:p-6 pb-20 md:pb-6 max-w-[1850px] mx-auto w-full min-h-0 flex flex-col ${selectedSongId ? 'overflow-hidden h-full' : 'overflow-y-auto md:overflow-visible'}`}>
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
                <h2 className="text-lg font-black text-white tracking-tight leading-tight">
                  Welcome, <span className="text-amber-500">{session?.name?.split(' ')[0] || 'User'}</span>
                  <span className="ml-1.5 text-base">{session?.role === 'admin' ? '👑' : session?.role === 'choir' ? '🧑‍🎤' : '👤'}</span>
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-mono font-bold px-2 py-1 rounded-lg border uppercase ${
                  mongoStatus === 'connected' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                  mongoStatus === 'connecting' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                  'bg-zinc-800 text-zinc-500 border-zinc-700'
                }`}>
                  {mongoStatus === 'connected' ? '● Live' : mongoStatus === 'connecting' ? '◌ Sync' : '○ Local'}
                </span>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1 px-2.5 py-1 bg-zinc-900 hover:bg-rose-950/20 text-rose-400 border border-zinc-800 hover:border-rose-950/40 rounded-lg transition-all text-[11px] font-mono font-bold cursor-pointer active-touch"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Exit</span>
                </button>
              </div>
            </div>


            {/* === DESKTOP GREETING CARD (hidden on mobile) === */}
            <div className="hidden md:block w-full text-left mb-6 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 rounded-3xl border border-zinc-800/80 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/5 rounded-full blur-3xl"></div>
              <span className="text-[9px] font-mono tracking-widest text-amber-500 font-extrabold uppercase bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">Active Session</span>
              <h2 className="text-xl md:text-3xl font-black text-white tracking-tight mt-2.5">
                Welcome back, <span className="text-amber-500">{session?.name || 'User'}</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-1 select-none font-mono">
                Logged in as: <span className="text-amber-400 font-bold uppercase">{session?.role}</span>
              </p>
            </div>

            {/* Elegant PWA Browser Install Banner */}
            {showInstallBanner && !isInstalled && !dismissedInstall && (
              <div className="w-full text-left mb-6 bg-gradient-to-r from-zinc-900 via-zinc-950 to-amber-955/25 p-5 md:p-6 rounded-3xl border border-amber-500/20 shadow-lg relative overflow-hidden group animate-in slide-in-from-top duration-300">
                {/* Background ambient gold aura */}
                <div className="absolute top-1/2 -right-4 -translate-y-1/2 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl group-hover:bg-amber-500/10 transition-all duration-500"></div>
                
                {/* Close Button top-right */}
                <button 
                  onClick={handleDismissInstall}
                  className="absolute top-3.5 right-3.5 p-1.5 rounded-full text-zinc-500 hover:text-zinc-350 hover:bg-white/5 transition-colors cursor-pointer active-touch"
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
                      className="flex-1 sm:flex-none bg-amber-500 hover:bg-amber-400 text-black font-extrabold px-4 py-2 rounded-full text-[11px] transition-all shadow-md active-touch flex items-center justify-center gap-1.5 cursor-pointer shadow-amber-500/15"
                    >
                      <Download className="h-3.5 w-3.5 stroke-[3]" /> Install Now
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ⚡ Quick Song Access (Phonetic Search Engine) */}
            <div className="w-full mb-6 relative">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-4.5 w-4.5 text-zinc-500" />
                </div>
                <input
                  type="text"
                  placeholder="⚡ Quick song access... (Type title, author, or lyrics)"
                  value={quickSearchInput}
                  onChange={(e) => setQuickSearchInput(e.target.value)}
                  className="block w-full pl-11 pr-10 py-3.5 border border-zinc-800 rounded-2xl leading-5 bg-zinc-900 text-zinc-200 placeholder-zinc-550 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 text-sm transition-all shadow-md"
                />
                {quickSearchInput && (
                  <button
                    onClick={() => setQuickSearchInput('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-350 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Autocomplete Popup List */}
              {quickSearchInput.trim() && (
                <div className="absolute left-0 right-0 mt-2 bg-zinc-950 border border-zinc-850 rounded-2xl shadow-2xl z-30 overflow-hidden max-h-[350px] overflow-y-auto divide-y divide-zinc-900 animate-in fade-in slide-in-from-top-2 duration-150">
                  {quickSearchMatches.length === 0 ? (
                    <div className="p-4 text-center text-zinc-500 text-xs font-sans italic">
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
                        className="w-full p-3.5 hover:bg-zinc-900/60 transition-colors flex items-center justify-between text-left cursor-pointer group"
                      >
                        <div className="flex items-center gap-3 truncate">
                          <div className="h-8 w-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-amber-500 transition-colors">
                            <Music className="h-4 w-4" />
                          </div>
                          <div className="truncate">
                            <div className="text-xs font-bold text-zinc-200 group-hover:text-amber-450 transition-colors truncate">
                              {song.title}
                            </div>
                            <div className="text-[10px] text-zinc-550 font-mono mt-0.5">
                              {song.author || 'Traditional'}
                            </div>
                          </div>
                        </div>
                        {song.category && (
                          <span className="text-[9px] font-extrabold uppercase font-mono bg-amber-500/10 border border-amber-500/20 text-amber-500 px-2 py-0.5 rounded shrink-0">
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
            <div className="grid grid-cols-3 gap-2 md:gap-3 w-full mb-5 select-none">
              <div className="premium-glass-card p-3 md:p-4 rounded-2xl text-center relative overflow-hidden group">
                <span className="text-[9px] md:text-[9px] font-mono tracking-widest uppercase block text-zinc-500">Songs</span>
                <span className="font-mono text-xl md:text-2xl text-amber-500 block font-black mt-1">
                  {stats.total}
                </span>
                <span className="text-[9px] md:text-[10px] text-zinc-500 mt-0.5 block font-sans">Total</span>
              </div>
              <div className="premium-glass-card p-3 md:p-4 rounded-2xl text-center relative overflow-hidden group">
                <span className="text-[9px] md:text-[9px] font-mono tracking-widest uppercase block text-zinc-500">Stars</span>
                <span className="font-mono text-xl md:text-2xl text-amber-500 block font-black mt-1">
                  {stats.favorites}
                </span>
                <span className="text-[9px] md:text-[10px] text-zinc-500 mt-0.5 block font-sans">Favorites</span>
              </div>
              <div className="premium-glass-card p-3 md:p-4 rounded-2xl text-center relative overflow-hidden group">
                <span className="text-[9px] md:text-[9px] font-mono tracking-widest uppercase block text-zinc-500">Cats</span>
                <span className="font-mono text-xl md:text-2xl text-amber-500 block font-black mt-1">
                  {stats.categories}
                </span>
                <span className="text-[9px] md:text-[10px] text-zinc-500 mt-0.5 block font-sans">Categories</span>
              </div>
            </div>
            
            {/* Quick Actions Navigation Cards */}
            <div className="grid grid-cols-2 gap-3 md:gap-4 w-full">
              <button 
                onClick={() => setActiveTab('search')}
                className="p-4 md:p-5 bg-zinc-900/60 hover:bg-zinc-800/40 border border-zinc-850 hover:border-amber-500/30 rounded-2xl md:rounded-3xl text-left transition-all cursor-pointer shadow-lg group flex flex-col md:flex-row md:items-start gap-2 md:gap-4 active-touch"
              >
                <div className="text-2xl md:text-3xl p-2.5 md:p-3 bg-zinc-950 border border-zinc-800 rounded-xl md:rounded-2xl group-hover:scale-110 transition-transform w-fit">🎵</div>
                <div>
                  <div className="text-[13px] md:text-sm font-bold text-white tracking-wide">Song Library</div>
                  <p className="text-[11px] md:text-xs text-zinc-400 mt-0.5 md:mt-1">Search and browse all songs.</p>
                </div>
              </button>
              
              <button 
                onClick={() => session?.role !== 'guest' ? setActiveTab('calendar') : alert('Guests do not have access to setlists')}
                className={`p-4 md:p-5 border rounded-2xl md:rounded-3xl text-left transition-all shadow-lg group flex flex-col md:flex-row md:items-start gap-2 md:gap-4 active-touch ${
                  session?.role === 'guest' 
                    ? 'bg-zinc-950/30 border-zinc-900/40 opacity-40 cursor-not-allowed text-slate-650' 
                    : 'bg-zinc-900/60 hover:bg-zinc-800/40 border-zinc-850 hover:border-amber-500/30 cursor-pointer'
                }`}
              >
                <div className="text-2xl md:text-3xl p-2.5 md:p-3 bg-zinc-950 border border-zinc-800 rounded-xl md:rounded-2xl group-hover:scale-110 transition-transform w-fit">📅</div>
                <div>
                  <div className="text-[13px] md:text-sm font-bold text-white tracking-wide">Worship Setlists</div>
                  <p className="text-[11px] md:text-xs text-zinc-400 mt-0.5 md:mt-1">Plan services and arrange setlists.</p>
                </div>
              </button>
            </div>

            {/* === RESPONSIVE JUMP BACK IN === */}
            {recentSongs.length > 0 && (
              <div className="w-full mt-6">
                <span className="text-[10px] font-mono tracking-widest uppercase text-amber-500 font-black block mb-3 pl-0.5 text-left">
                  ⚡ Jump Back In
                </span>
                
                {/* Desktop View: list */}
                <div className="hidden md:block space-y-2 bg-zinc-900/60 p-5 md:p-6 rounded-3xl border border-zinc-850 shadow-md relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/[0.02] rounded-full blur-2xl"></div>
                  {recentSongs.map(song => (
                    <button
                      key={song.id}
                      onClick={() => {
                        setActiveTab('search');
                        setSongSourceTab('search');
                        handleSelectSong(song.id);
                      }}
                      className="w-full p-3.5 bg-zinc-950/50 hover:bg-zinc-950 hover:border-amber-500/30 border border-zinc-850 rounded-2xl flex items-center justify-between gap-3 text-left transition-all cursor-pointer group active-touch"
                    >
                      <div className="flex items-center gap-3 truncate">
                        <div className="h-7 w-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-amber-500 transition-colors">
                          <Music className="h-3.5 w-3.5" />
                        </div>
                        <div className="truncate">
                          <div className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors truncate">{song.title}</div>
                          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{song.author || 'Traditional'}</div>
                        </div>
                      </div>
                      {song.category && (
                        <span className="text-[9px] font-extrabold uppercase font-mono bg-amber-500/10 border border-amber-500/20 text-amber-500 px-2 py-0.5 rounded shrink-0">
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
                      <div className="text-[10px] text-zinc-500 font-mono mt-1 truncate">{song.author || 'Traditional'}</div>
                      {song.category && (
                        <div className="text-[9px] font-extrabold uppercase text-amber-500/90 mt-1">{song.category}</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
            </div> {/* Close Left Column wrapper */}

            {/* Right Column Wrapper (Admin Only) */}
            {session?.role === 'admin' && (
              <div className="lg:sticky lg:top-6 flex flex-col gap-5 md:gap-6 h-fit w-full mt-5 lg:mt-0">
                {/* Administrative Quick Actions Console */}
                <div className="w-full text-left premium-glass-card p-4 md:p-5 rounded-2xl md:rounded-3xl shadow-md select-none">
                <span className="text-[10px] font-mono tracking-widest uppercase text-amber-500 font-black">Admin Actions</span>
                <div className="grid grid-cols-2 gap-2.5 mt-3">
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-amber-500 hover:bg-amber-400 text-black font-extrabold px-4 py-3.5 rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active-touch"
                  >
                    <Plus className="h-4 w-4 text-black stroke-[3]" /> Create Song
                  </button>
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="bg-zinc-950 hover:bg-zinc-900 text-zinc-350 hover:text-white px-4 py-3.5 rounded-xl text-xs font-bold border border-zinc-800 transition-all flex items-center justify-center gap-2 cursor-pointer active-touch"
                  >
                    <Database className="h-4 w-4 text-amber-500" /> Import Files
                  </button>
                </div>
              </div>

              {/* Choir Requests Review Panel */}
              <div className="w-full text-left premium-glass-card p-5 md:p-6 rounded-2xl md:rounded-3xl shadow-md">
                <div className="flex items-center justify-between border-b border-zinc-850 pb-3 mb-4 select-none">
                  <div>
                    <span className="text-[10px] font-mono tracking-widest uppercase text-amber-500 font-black">Song Requests</span>
                    <h3 className="text-sm font-bold text-white tracking-wide mt-1">Choir Requests Review</h3>
                  </div>
                  <span className="bg-amber-500/10 text-amber-400 text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-amber-500/20">
                    {suggestions.length} Requested
                  </span>
                </div>

                {suggestions.length > 0 ? (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {suggestions.map((sug) => (
                      <div 
                        key={sug.id} 
                        className="p-4 bg-zinc-950/60 hover:bg-zinc-950 border border-zinc-850/80 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-all"
                      >
                        <div className="text-left">
                          <h4 className="text-xs font-black text-white">{sug.songTitle}</h4>
                          <p className="text-[10px] text-zinc-500 mt-1 font-mono">
                            Suggested by <span className="text-zinc-400 font-bold">{sug.suggestedBy || 'Choir Member'}</span> • {new Date(sug.timestamp).toLocaleDateString()} at {new Date(sug.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-2 shrink-0 select-none">
                          <button
                            onClick={() => {
                              // Direct inspection of the song
                              setSongSourceTab('search');
                              handleSelectSong(sug.songId);
                              setActiveTab('search');
                            }}
                            className="bg-amber-500 hover:bg-amber-400 text-black font-extrabold px-4 py-2 rounded-xl text-[11px] uppercase font-mono tracking-wider transition-all active:scale-95 cursor-pointer active-touch flex items-center gap-1 min-h-[40px]"
                          >
                            🔍 View
                          </button>
                          
                          <button
                            onClick={() => {
                              if (confirm(`Remove "${sug.songTitle}" from the suggestions list?`)) {
                                handleDismissSuggestion(sug.id);
                              }
                            }}
                            className="bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-rose-450 px-4 py-2 rounded-xl text-[11px] uppercase font-mono tracking-wider transition-all active:scale-95 cursor-pointer active-touch min-h-[40px]"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 bg-zinc-950/30 rounded-2xl border border-dashed border-zinc-850/65 select-none">
                    <Music className="h-8 w-8 text-zinc-800 mx-auto mb-2.5 animate-pulse" />
                    <p className="font-bold text-zinc-500 text-[10px] font-mono uppercase tracking-widest">Request Queue Empty</p>
                    <p className="text-[9.5px] text-zinc-650 mt-1 uppercase font-mono">
                      Song requests submitted by choir members will appear here in real-time.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
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
              className={`w-full min-h-0 ${selectedSongId ? 'flex-1 flex flex-col h-full' : ''}`}
            >
            {selectedSongId ? (
              /* Dedicated full-page lyric reading panel */
              <div className="w-full flex-1 flex flex-col min-h-0 h-full">
                <SongDetail 
                  songId={selectedSongId}
                  onClose={() => {
                    handleSelectSong(null);
                    if (songSourceTab === 'calendar') {
                      setActiveTab('calendar');
                    }
                    loadEvents();
                  }}
                  onEnterStageMode={handleEnterStageMode}
                  onToggleFavorite={handleToggleFavorite}
                  onLyricsUpdated={handleSongUpdateOrReview}
                  onSelectSong={handleSelectSong}
                  currentRole={currentRole}
                  backLabel={songSourceTab === 'calendar' ? 'Back to Setlist' : 'Back to Search'}
                  setlistSongIds={activeSetlistIds}
                  songsMetadata={songs}
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

          {/* VIEW 3: CALENDAR VIEW */}
          {activeTab === 'calendar' && session?.role !== 'guest' && (
            <motion.div
              key="calendar"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
              className="w-full min-h-0"
            >
            <WorshipEvents
              songs={songs}
              events={events}
              onEventsChange={loadEvents}
              onClose={() => setActiveTab('dashboard')}
              onSelectSong={(id, setlistSongIds) => {
                setSongSourceTab('calendar');
                handleSelectSong(id, setlistSongIds);
                setActiveTab('search');
              }}
              selectedSongId={selectedSongId}
              currentRole={currentRole}
              onOpenAddModal={(eventId) => {
                setTargetEventIdForAdd(eventId);
                setShowAddModal(true);
              }}
              onOpenUploadModal={(eventId) => {
                setTargetEventIdForAdd(eventId);
                setShowUploadModal(true);
              }}
            />
          </motion.div>
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
                  🔌 Join Church Server
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
                <div className="p-3 bg-red-500/10 border border-red-550/20 text-red-400 text-[11px] rounded-xl text-center font-bold">
                  ⚠️ {joinError}
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
                          <p className="text-[10px] text-zinc-500 mt-1">Read sheets, transpose, and suggest songs.</p>
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
                          {joinRole === 'admin' ? '👑 Admin Login' : '🧑‍🎤 Choir Member Name'}
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
                  ➕ Add New Server Workspace
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
                <div className="p-3 bg-red-500/10 border border-red-550/20 text-red-400 text-[11px] rounded-xl text-center font-bold">
                  ⚠️ {createError}
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
              className="bg-[#070708] w-full h-full md:h-auto md:max-w-2xl rounded-t-3xl md:rounded-3xl p-5 md:p-6 space-y-4 shadow-2xl border-t md:border border-white/10 text-slate-350 overflow-y-auto pb-safe"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="font-bold text-lg text-white flex items-center gap-1.5">
                <BookOpen className="h-5 w-5 text-amber-500" /> Add New Lyric Sheet
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-white/5 rounded-full text-slate-400 cursor-pointer"
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
                    className="mt-1 w-full text-xs p-2.5 rounded-xl border border-white/10 bg-[#09090B] text-white outline-none focus:border-amber-500"
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
                    className="mt-1 w-full text-xs p-2.5 rounded-xl border border-white/10 bg-[#09090B] text-white outline-none focus:border-amber-500"
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
                    className="mt-1 w-full text-xs p-2.5 rounded-xl border border-white/10 bg-[#09090B] text-white outline-none focus:border-amber-500 font-mono"
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
                    className="mt-1 w-full text-xs p-2.5 rounded-xl border border-white/10 bg-[#09090B] text-white outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400">Song Category</label>
                  <select
                    id="add-category"
                    value={addForm.category}
                    onChange={(e) => setAddForm(p => ({ ...p, category: e.target.value }))}
                    className="mt-1 w-full text-xs p-2.5 rounded-xl border border-white/10 bg-[#09090B] text-white outline-none focus:border-amber-500 cursor-pointer"
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
                <label className="text-xs font-semibold text-slate-400 flex items-center justify-between">
                  <span>Lyrics Sheet with Bracket Chords *</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!addForm.lyrics) return;
                        const formatted = parseTwoLineChords(addForm.lyrics);
                        setAddForm(p => ({ ...p, lyrics: formatted }));
                      }}
                      className="text-[9px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono font-bold transition-all cursor-pointer"
                      title="Convert traditional chords-above-lyrics formatting into bracketed format"
                    >
                      🪄 Auto-Format Two-Line Chords
                    </button>
                    <span className="text-[10px] text-amber-450 font-mono hidden sm:inline">Format: [C] Amazing...</span>
                  </div>
                </label>
                <textarea
                  id="add-lyrics"
                  required
                  rows={8}
                  value={addForm.lyrics}
                  onChange={(e) => setAddForm(p => ({ ...p, lyrics: e.target.value }))}
                  className="mt-1 w-full text-xs p-3 rounded-xl border border-white/10 bg-[#09090B] text-white font-mono outline-none focus:border-amber-500"
                  placeholder={`[G] Amazing grace! How [C] sweet the [G] sound
That [G] saved a wretch like [D] me!`}
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-white/5 pb-6 md:pb-0">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold bg-white/5 text-slate-300 hover:bg-white/10 rounded-xl"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 hover:shadow-[0_0_15px_rgba(245,158,11,0.25)] text-black px-5 py-2 rounded-full text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
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
              className="bg-[#070708] w-full h-full md:h-auto md:max-w-4xl rounded-t-3xl md:rounded-3xl p-5 md:p-6 space-y-4 shadow-2xl border-t md:border border-white/10 text-slate-350 overflow-y-auto pb-safe"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="font-bold text-lg text-white flex items-center gap-1.5">
                <Database className="h-5 w-5 text-amber-500" /> Bulk Lyrics Import Wizard
              </h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-2 hover:bg-white/5 rounded-full text-slate-400 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <BulkUpload onSuccess={async (importedSongIds) => {
              await syncSongsList();
              if (targetEventIdForAdd && importedSongIds && importedSongIds.length > 0) {
                await linkSongsToEvent(targetEventIdForAdd, importedSongIds);
              }
            }} />

            <div className="flex gap-2 justify-end pt-3 border-t border-white/5 pb-6 md:pb-0">
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="bg-white/5 hover:bg-white/10 hover:border-white/20 text-slate-200 border border-white/10 px-5 py-2 rounded-full text-xs font-bold shadow-xs transition-all"
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
          song={stageModeSong.song}
          activeTranspose={stageModeSong.transpose}
          onClose={() => setStageModeSong(null)}
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
            className={`flex flex-col items-center gap-1 px-5 pt-1 pb-0 text-xs transition-all active-touch cursor-pointer relative min-w-[56px] ${
              activeTab === 'search' ? 'text-amber-500' : 'text-zinc-500'
            }`}
          >
            {activeTab === 'search' && <span className="nav-tab-active-bar" />}
            <BookOpen className={`w-6 h-6 transition-transform duration-200 ${activeTab === 'search' ? 'drop-shadow-[0_0_8px_rgba(245,158,11,0.6)] scale-110' : ''}`} />
            <span className={`text-[11px] font-bold uppercase tracking-wider ${activeTab === 'search' ? 'font-black' : ''}`}>Library</span>
          </button>

          {/* ADMIN FAB — center elevated button for quick actions */}
          {session.role === 'admin' && (
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

          {/* SETLISTS — non-guest only */}
          {session.role !== 'guest' && (
            <button
              onClick={() => navigateTo('calendar')}
              className={`flex flex-col items-center gap-1 px-5 pt-1 pb-0 text-xs transition-all active-touch cursor-pointer relative min-w-[56px] ${
                activeTab === 'calendar' ? 'text-amber-500' : 'text-zinc-500'
              }`}
            >
              {activeTab === 'calendar' && <span className="nav-tab-active-bar" />}
              <Calendar className={`w-6 h-6 transition-transform duration-200 ${activeTab === 'calendar' ? 'drop-shadow-[0_0_8px_rgba(245,158,11,0.6)] scale-110' : ''}`} />
              <span className={`text-[11px] font-bold uppercase tracking-wider ${activeTab === 'calendar' ? 'font-black' : ''}`}>Setlists</span>
            </button>
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
                <span className="text-sm shrink-0">💡</span>
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

