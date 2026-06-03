import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Music, Sparkles, Layers, Sliders, Play, Settings, Plus, Star, Heart, 
  Trash2, X, AlertCircle, RefreshCw, Check, BookOpen, Database, Award, 
  ChevronRight, Compass, HelpCircle, Calendar, Download, Smartphone, Search,
  Home
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
  saveWorshipEvent
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



  // PWA Installation & OS Detection States
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState<boolean>(false);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState<boolean>(false);
  const [dismissedInstall, setDismissedInstall] = useState<boolean>(() => {
    return localStorage.getItem('dasong_dismiss_install') === 'true';
  });

  // DaLyric TV Cloud WebSocket Sync States
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [wsRoomCode, setWsRoomCode] = useState<string>(() => localStorage.getItem('dasong_dalyric_room_code') || '');
  const [autoFollowTV, setAutoFollowTV] = useState<boolean>(true);
  const [tvActiveTitle, setTvActiveTitle] = useState<string>('');
  const [tvActiveSlide, setTvActiveSlide] = useState<number>(0);
  const [tempBroadcastSong, setTempBroadcastSong] = useState<Song | null>(null);
  const [showSyncModal, setShowSyncModal] = useState<boolean>(false);

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
    const saved = localStorage.getItem('lyrasync_guideline_suggestions');
    if (saved) {
      try {
        setSuggestions(JSON.parse(saved));
      } catch {
        setSuggestions([]);
      }
    } else {
      setSuggestions([]);
    }
  }, []);

  const handleDismissSuggestion = useCallback((id: string) => {
    const saved = localStorage.getItem('lyrasync_guideline_suggestions');
    if (saved) {
      try {
        const list = JSON.parse(saved);
        const filtered = list.filter((s: any) => s.id !== id);
        localStorage.setItem('lyrasync_guideline_suggestions', JSON.stringify(filtered));
        setSuggestions(filtered);
      } catch (err) {
        console.error(err);
      }
    }
  }, []);

  // Authentication session tracking
  interface UserSession {
    role: UserRole;
    name?: string;
  }

  const [session, setSession] = useState<UserSession | null>(() => {
    const savedRole = localStorage.getItem('lyrasync_user_role');
    const savedName = localStorage.getItem('lyrasync_user_name');
    if (savedRole === 'admin' || savedRole === 'choir' || savedRole === 'guest') {
      return {
        role: savedRole as UserRole,
        name: savedName || (savedRole === 'admin' ? 'Administrator' : savedRole === 'guest' ? 'Guest Browser' : '')
      };
    }
    return null; // Force login at first
  });

  const currentRole = session ? session.role : 'guest';

  // Temporary input states for the authentication portal
  const [selectedPortal, setSelectedPortal] = useState<UserRole | null>(null);
  const [inputName, setInputName] = useState('');
  const [inputPassword, setInputPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Authentication handler logic
  const handleSignIn = (role: UserRole) => {
    setAuthError('');

    if (role === 'admin') {
      if (inputPassword === 'admin123') {
        const adminSession: UserSession = { role: 'admin', name: 'Administrator' };
        setSession(adminSession);
        localStorage.setItem('lyrasync_user_role', 'admin');
        localStorage.setItem('lyrasync_user_name', 'Administrator');
        setSelectedPortal(null);
        setInputPassword('');
      } else {
        setAuthError('Incorrect Admin Password! Please try again.');
      }
    } else if (role === 'choir') {
      if (inputName.trim().length >= 2) {
        const choirSession: UserSession = { role: 'choir', name: inputName.trim() };
        setSession(choirSession);
        localStorage.setItem('lyrasync_user_role', 'choir');
        localStorage.setItem('lyrasync_user_name', inputName.trim());
        setSelectedPortal(null);
        setInputName('');
      } else {
        setAuthError('Please enter a valid full name to log in.');
      }
    } else if (role === 'guest') {
      const guestSession: UserSession = { role: 'guest', name: 'Guest Browser' };
      setSession(guestSession);
      localStorage.setItem('lyrasync_user_role', 'guest');
      localStorage.setItem('lyrasync_user_name', 'Guest Browser');
      setSelectedPortal(null);
    }
  };

  const handleLogout = () => {
    setSession(null);
    localStorage.removeItem('lyrasync_user_role');
    localStorage.removeItem('lyrasync_user_name');
    setSelectedPortal(null);
  };
  
  // App view toggle states
  const [activeTab, setActiveTab] = useState<'dashboard' | 'search' | 'calendar'>('dashboard');
  const [songSourceTab, setSongSourceTab] = useState<'search' | 'calendar' | 'dashboard'>('search');

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
        return a.title.localeCompare(b.title);
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

  const handleForceSync = () => {
    triggerMongoSync();
  };

  // Perform full database sync on load, focus, and every 10 seconds
  useEffect(() => {
    triggerMongoSync();

    // Sync on window focus for immediate live refresh
    const handleFocus = () => {
      triggerMongoSync();
    };
    window.addEventListener('focus', handleFocus);

    // Polling interval every 10 seconds
    const interval = setInterval(() => {
      triggerMongoSync();
    }, 10000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [triggerMongoSync]);

  // Initialize DB and load existing songs
  useEffect(() => {
    // Load recently viewed songs
    try {
      const stored = localStorage.getItem('dasong_recent_songs');
      if (stored) {
        setRecentSongIds(JSON.parse(stored));
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
        loadEvents();
      } catch (err) {
        console.error('Database setup error:', err);
      } finally {
        setInitialLoading(false);
      }
    }
    bootApp();
  }, [syncSongsList, loadSuggestions, loadEvents]);

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
        localStorage.setItem('dasong_recent_songs', JSON.stringify(next));
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

  // Mobile Quick Search for Guest users
  const handleMobileGuestQuickSearch = useCallback(() => {
    setActiveTab('search');
    setSelectedSongId(null);
    setTimeout(() => {
      const input = document.getElementById('song-search');
      if (input) {
        input.focus();
        (input as HTMLInputElement).select();
      }
    }, 120);
  }, []);

  // Connect to the Cloud WebSocket Relay room using the 6-digit sync code
  const connectToDaLyric = useCallback((roomCode: string) => {
    const trimmedCode = roomCode.trim();
    if (!trimmedCode || trimmedCode.length !== 6) {
      alert('Please enter a valid 6-digit session code to sync.');
      return;
    }

    // If there is an existing socket open, disconnect it first
    if (ws) {
      ws.close();
    }

    setWsStatus('connecting');
    localStorage.setItem('dasong_dalyric_room_code', trimmedCode);
    setWsRoomCode(trimmedCode);

    // Establish socket connection to Sockets Bay public room
    const targetUrl = `wss://socketsbay.com/wss/v2/dasong-room-${trimmedCode}/`;
    const socket = new WebSocket(targetUrl);

    socket.onopen = () => {
      setWsStatus('connected');
      console.log(`Successfully connected to DaLyric TV Cloud Sync Room: ${trimmedCode}`);
    };

    socket.onclose = () => {
      setWsStatus('disconnected');
      setWs(null);
      console.log('DaLyric TV sync connection closed.');
    };

    socket.onerror = (err) => {
      console.error('Sync socket error:', err);
      setWsStatus('disconnected');
      setWs(null);
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        console.log('Sync broadcast received:', payload);
        
        // Skip messages that do not contain the slide changed signature
        if (payload.event !== 'SLIDE_CHANGED' || !payload.title) return;

        setTvActiveTitle(payload.title);
        setTvActiveSlide(payload.slideIndex || 0);

        if (autoFollowTV) {
          // Perform local case-insensitive search by song title in the loaded songs
          const searchTitle = payload.title.trim().toLowerCase();
          const match = songs.find(s => s.title.trim().toLowerCase() === searchTitle);

          if (match) {
            // Found locally: clear any temp broadcast, select matching song, and route tab
            setTempBroadcastSong(null);
            handleSelectSong(match.id);
            setActiveTab('search');
          } else {
            // Not found in local index: construct a temporary Song sheet in memory
            const tempSong: Song = {
              id: 'dalyric-broadcast-temp',
              title: payload.title,
              author: payload.author || 'DaLyric Broadcast',
              lyrics: payload.lyrics || payload.rawLyrics || '',
              bpm: payload.bpm || 72,
              category: payload.category || 'Worship',
              key: payload.key || '',
              createdAt: Date.now()
            };
            setTempBroadcastSong(tempSong);
            handleSelectSong('dalyric-broadcast-temp');
            setActiveTab('search');
          }
        }
      } catch (err) {
        console.error('Error parsing sync message:', err);
      }
    };

    setWs(socket);
  }, [ws, songs, autoFollowTV, handleSelectSong]);

  const disconnectFromDaLyric = useCallback(() => {
    if (ws) {
      ws.close();
      setWs(null);
    }
    setWsStatus('disconnected');
    setTempBroadcastSong(null);
    setTvActiveTitle('');
    setTvActiveSlide(0);
  }, [ws]);

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
      key: '',
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

  if (!session) {
    return (
      <div id="login-portal" className="flex items-center justify-center min-h-screen bg-[#070708] text-white p-4 font-sans relative overflow-hidden">
        {/* Dynamic synth matrix grid line visualizer in backdrop */}
        <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:16px_16px]"></div>
        
        {/* Glowing backdrop ambient background auras */}
        <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-amber-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-rose-500/5 rounded-full blur-3xl"></div>

        <div className="w-full max-w-sm p-6 bg-zinc-950/40 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_40px_rgba(245,158,11,0.05)] relative z-10 animate-in fade-in zoom-in-95 duration-350">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center p-3 bg-amber-500/10 rounded-2xl text-amber-500 mb-4 border border-amber-500/20 relative shadow-[0_0_20px_rgba(245,158,11,0.15)] overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/5 to-rose-500/5"></div>
              {/* Dynamic pulsing visualizer bars representing station active telemetry */}
              <div className="flex items-end gap-1 h-6 relative z-10 px-1 select-none pointer-events-none">
                <div className="w-1 h-3 bg-amber-500 rounded-full animate-pulse" />
                <div className="w-1 h-5 bg-amber-400 rounded-full animate-pulse" />
                <div className="w-1 h-6 bg-orange-500 rounded-full animate-pulse" />
                <div className="w-1 h-4 bg-rose-500 rounded-full animate-pulse" />
                <div className="w-1 h-2 bg-amber-500 rounded-full animate-pulse" />
              </div>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white select-none">DaSong <span className="text-amber-500 text-[10px] font-mono tracking-widest border border-amber-500/30 px-2 py-0.5 rounded ml-1.5 uppercase">Songbook</span></h1>
            <p className="text-zinc-500 text-xs mt-1.5 font-medium leading-relaxed">Choose your login portal to continue</p>
          </div>

          {authError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-550/20 text-red-400 text-[11px] rounded-xl text-center font-bold">
              ⚠️ {authError}
            </div>
          )}

          {!selectedPortal ? (
            /* MAIN ACCESS SELECTOR CONTAINER */
            <div className="space-y-3">
              <button 
                id="portal-select-admin"
                onClick={() => setSelectedPortal('admin')}
                className="w-full flex items-center justify-between p-4 bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-900 hover:border-amber-500/30 rounded-2xl transition-all text-left outline-none cursor-pointer group active-touch"
              >
                <div>
                  <p className="font-bold text-xs text-white flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    System Administrator
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-1 font-medium">Manage song library, import files, and build service schedules</p>
                </div>
                <span className="text-amber-500 font-bold group-hover:translate-x-1.5 transition-transform">→</span>
              </button>

              <button 
                id="portal-select-choir"
                onClick={() => setSelectedPortal('choir')}
                className="w-full flex items-center justify-between p-4 bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-900 hover:border-amber-500/30 rounded-2xl transition-all text-left outline-none cursor-pointer group active-touch"
              >
                <div>
                  <p className="font-bold text-xs text-white flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                    Choir & Musicians
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-1 font-medium">Read chord sheets, transpose pitch, and suggest song selections</p>
                </div>
                <span className="text-amber-500 font-bold group-hover:translate-x-1.5 transition-transform">→</span>
              </button>

              <button 
                id="portal-select-guest"
                onClick={() => handleSignIn('guest')}
                className="w-full p-3.5 bg-zinc-950/50 hover:bg-zinc-900/60 text-zinc-400 hover:text-white text-xs font-bold rounded-2xl text-center border border-dashed border-zinc-900 hover:border-zinc-800 transition-all mt-4 cursor-pointer active-touch"
              >
                Continue as Guest (Browse lyrics only)
              </button>
            </div>
          ) : (
            /* DYNAMIC FORM VIEWS */
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-2.5 mb-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-500">{selectedPortal === 'admin' ? '👑 Admin' : '🧑‍🎤 Choir'} Login</h3>
                <button 
                  id="portal-back-btn"
                  onClick={() => { setSelectedPortal(null); setAuthError(''); }}
                  className="text-xs text-zinc-400 hover:text-white font-bold cursor-pointer transition-colors"
                >
                  ← Back
                </button>
              </div>

              {selectedPortal === 'admin' && (
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-zinc-500 mb-1 uppercase font-mono tracking-wider">Security Key Password</label>
                  <input 
                    id="portal-password-input"
                    type="password"
                    placeholder="••••••••"
                    value={inputPassword}
                    onChange={(e) => setInputPassword(e.target.value)}
                    className="w-full p-3 bg-zinc-950 border border-zinc-900 rounded-xl text-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 text-xs font-mono tracking-widest shadow-inner"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSignIn('admin');
                    }}
                  />
                </div>
              )}

              {selectedPortal === 'choir' && (
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-zinc-500 mb-1 uppercase font-mono tracking-wider">Enter Your Name</label>
                  <input 
                    id="portal-name-input"
                    type="text"
                    placeholder="e.g. Brother John"
                    value={inputName}
                    onChange={(e) => setInputName(e.target.value)}
                    className="w-full p-3 bg-zinc-950 border border-zinc-900 rounded-xl text-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 text-xs font-sans shadow-inner"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSignIn('choir');
                    }}
                  />
                </div>
              )}

              <button 
                id="portal-verify-btn"
                onClick={() => handleSignIn(selectedPortal)}
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-black py-3 px-4 rounded-xl text-xs transition-all cursor-pointer shadow-md shadow-amber-500/10 active:scale-98 active-touch"
              >
                Verify & Authorize
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div id="app-root" className={`h-screen md:h-auto overflow-hidden md:overflow-visible bg-[#08080a] text-zinc-300 transition-colors duration-300 flex flex-col font-sans relative`}>
      {/* Dynamic hardware grid pattern */}
      <div className="absolute inset-0 pointer-events-none opacity-2 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      
      {/* Top Professional Navigation Header - Styled like a premium MIDI master strip */}
      <header id="main-header" className="bg-zinc-950/95 border-b border-zinc-800/80 text-white shadow-[0_4px_20px_rgba(0,0,0,0.6)] z-20 p-3 md:p-4 flex flex-col gap-3.5 sticky top-0 md:relative backdrop-blur-md">
        
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
          <div id="stats-dashboard" className="flex items-center gap-3 md:gap-3.5 flex-wrap">
            <div className="text-right hidden md:block">
              <span className="text-[9px] font-mono tracking-widest uppercase block text-zinc-500">Total Songs</span>
              <span className="font-mono text-xs leading-none text-zinc-300 block font-black">
                {stats.total.toLocaleString()} Songs
              </span>
            </div>

            <div className="h-5 w-[1px] bg-zinc-800 hidden md:block" />

            {/* Quick theme selections and toggles */}
            <div className="flex items-center gap-2">
              
              {/* Display User Profile & Logout Link in Header */}
              {session && (
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* TV Sync Badge Status Button */}
                  <button
                    id="tv-sync-status-badge"
                    onClick={() => setShowSyncModal(true)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono font-bold border transition-all cursor-pointer active-touch shrink-0 ${
                      wsStatus === 'connected'
                        ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                        : wsStatus === 'connecting'
                          ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20 animate-pulse'
                          : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                    }`}
                    title="Live Projection Sync Console"
                  >
                    <span className="text-xs leading-none">📺</span>
                    <span>
                      {wsStatus === 'connected' ? (
                        <>
                          <span className="hidden xs:inline">TV Linked </span>
                          <span>({wsRoomCode})</span>
                        </>
                      ) : wsStatus === 'connecting' ? (
                        'Connecting...'
                      ) : (
                        <>
                          <span className="hidden xs:inline">TV Link </span>
                          <span>Offline</span>
                        </>
                      )}
                    </span>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      wsStatus === 'connected'
                        ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]'
                        : wsStatus === 'connecting'
                          ? 'bg-amber-500 animate-pulse shadow-[0_0_6px_#f59e0b]'
                          : 'bg-zinc-600'
                    }`} />
                  </button>

                  {/* MongoDB Cloud Sync Status Badge */}
                  <button
                    id="mongodb-sync-status-badge"
                    onClick={handleForceSync}
                    disabled={mongoStatus === 'connecting'}
                    className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono font-bold border transition-all cursor-pointer active-touch shrink-0 ${
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
                        ? 'Cloud Saved'
                        : mongoStatus === 'connecting'
                          ? 'Syncing...'
                          : mongoStatus === 'error'
                            ? 'Sync Error'
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


                  {/* Mobile Guest Quick Search Icon */}
                  {session.role === 'guest' && (
                    <button
                      onClick={handleMobileGuestQuickSearch}
                      className="md:hidden flex items-center justify-center w-9 h-9 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 rounded-xl transition-all cursor-pointer active-touch mr-1 shrink-0 animate-in fade-in"
                      title="Quick Search Songs"
                    >
                      <Search className="w-4.5 h-4.5 stroke-[3]" />
                    </button>
                  )}
                  
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
                  
                  {/* Compact Sign Out - Elegant power icon trigger on mobile, full label on desktop */}
                  <button 
                    onClick={handleLogout}
                    className="flex items-center justify-center w-8 h-8 sm:w-auto sm:h-auto sm:px-3.5 sm:py-1.5 text-xs font-bold bg-zinc-900 hover:bg-rose-950/20 text-zinc-400 hover:text-rose-400 rounded-full border border-zinc-800 hover:border-rose-900/40 transition-all cursor-pointer active:scale-95 active-touch shrink-0"
                    title="Sign Out / Exit"
                  >
                    <span className="sm:hidden text-[11px] leading-none">🚪</span>
                    <span className="hidden sm:inline">Sign Out</span>
                  </button>
                </div>
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
              🔍 Song Library
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
      </header>

      {/* Main content body grid splits */}
      <main className={`flex-1 p-4 md:p-6 pb-20 md:pb-6 max-w-[1700px] mx-auto w-full min-h-0 flex flex-col ${selectedSongId ? 'overflow-hidden h-full' : 'overflow-y-auto md:overflow-visible'}`}>
        <AnimatePresence mode="wait">
          {/* VIEW 1: CLEAN LANDING DASHBOARD */}
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col items-center py-4 md:py-12 px-0 md:px-4 w-full max-w-4xl mx-auto"
            >

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
              </div>
            </div>

            {/* === JUMP BACK IN — Recent Songs (mobile horizontal carousel, top priority) === */}
            {recentSongs.length > 0 && (
              <div className="w-full mb-4 md:mb-6">
                <span className="text-[10px] font-mono tracking-widest uppercase text-amber-500 font-black block mb-3 md:mb-3.5 px-0 md:px-0">
                  ⚡ Jump Back In
                </span>
                {/* Mobile: horizontal scroll pill strip */}
                <div className="md:hidden flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
                  {recentSongs.map(song => (
                    <button
                      key={song.id}
                      onClick={() => handleSelectSong(song.id)}
                      className="recent-song-pill active-touch text-left"
                    >
                      <div className="text-[13px] font-bold text-white truncate leading-tight">{song.title}</div>
                      <div className="text-[10px] text-zinc-500 font-mono mt-1 truncate">{song.author || 'Traditional'}</div>
                      {song.category && (
                        <div className="text-[9px] font-extrabold uppercase text-amber-500/90 mt-1">{song.category}</div>
                      )}
                    </button>
                  ))}
                </div>
                {/* Desktop: vertical list */}
                <div className="hidden md:block space-y-2 bg-zinc-900/60 p-5 md:p-6 rounded-3xl border border-zinc-850 shadow-md relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/[0.02] rounded-full blur-2xl"></div>
                  {recentSongs.map(song => (
                    <button
                      key={song.id}
                      onClick={() => handleSelectSong(song.id)}
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
              </div>
            )}

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

            {/* Quick Metrics Cards — 2 cols on mobile, 3 on sm+ */}
            <div className="grid grid-cols-3 gap-2 md:gap-3 w-full mb-5 select-none">
              <div className="bg-zinc-900/60 border border-zinc-850 p-3 md:p-4 rounded-2xl text-center relative overflow-hidden group">
                <span className="text-[9px] md:text-[9px] font-mono tracking-widest uppercase block text-zinc-500">Songs</span>
                <span className="font-mono text-xl md:text-2xl text-amber-500 block font-black mt-1">
                  {stats.total}
                </span>
                <span className="text-[9px] md:text-[10px] text-zinc-500 mt-0.5 block font-sans">Total</span>
              </div>
              <div className="bg-zinc-900/60 border border-zinc-850 p-3 md:p-4 rounded-2xl text-center relative overflow-hidden group">
                <span className="text-[9px] md:text-[9px] font-mono tracking-widest uppercase block text-zinc-500">Stars</span>
                <span className="font-mono text-xl md:text-2xl text-amber-500 block font-black mt-1">
                  {stats.favorites}
                </span>
                <span className="text-[9px] md:text-[10px] text-zinc-500 mt-0.5 block font-sans">Favorites</span>
              </div>
              <div className="bg-zinc-900/60 border border-zinc-850 p-3 md:p-4 rounded-2xl text-center relative overflow-hidden group">
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

            {/* Administrative Quick Actions Console */}
            {session?.role === 'admin' && (
              <div className="w-full text-left mt-5 md:mt-6 bg-zinc-900/60 p-4 md:p-5 rounded-2xl md:rounded-3xl border border-zinc-850 shadow-md select-none">
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
            )}

            {/* Choir Requests Review Panel */}
            {session?.role === 'admin' && (
              <div className="w-full text-left mt-5 md:mt-6 bg-zinc-900/60 p-5 md:p-6 rounded-2xl md:rounded-3xl border border-zinc-850 shadow-md">
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
              <div className="w-full flex flex-col min-h-0 animate-in slide-in-from-right-5 duration-200">
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
                  tempBroadcastSong={tempBroadcastSong}
                  songsMetadata={songs}
                />

              </div>
            ) : (
              /* Full-page Core Directory Grid Index List */
              <div className="flex flex-col space-y-5 min-h-[400px]">
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
                  <label className="text-xs font-semibold text-slate-400">Tempo Speed (BPM)</label>
                  <input
                    id="add-bpm"
                    type="number"
                    value={addForm.bpm}
                    onChange={(e) => setAddForm(p => ({ ...p, bpm: parseInt(e.target.value) || 72 }))}
                    className="mt-1 w-full text-xs p-2.5 rounded-xl border border-white/10 bg-[#09090B] text-white outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div className="md:col-span-2">
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
          broadcastSlideIndex={tvActiveSlide}
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
            <Search className={`w-6 h-6 transition-transform duration-200 ${activeTab === 'search' ? 'drop-shadow-[0_0_8px_rgba(245,158,11,0.6)] scale-110' : ''}`} />
            <span className={`text-[11px] font-bold uppercase tracking-wider ${activeTab === 'search' ? 'font-black' : ''}`}>Find</span>
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
                  To install, you must open this website in the iOS **Safari** browser. Third-party in-app browsers do not support direct addition.
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
                      Tap the **Add** button in the top-right corner to complete the installation process. The icon will appear instantly on your home screen!
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

      {/* DaLyric TV Cloud Sync Console Drawer Modal */}
      <AnimatePresence>
        {showSyncModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-end md:items-center justify-center p-0 md:p-4"
            onClick={() => setShowSyncModal(false)}
          >
            <motion.div 
              id="tv-sync-modal" 
              initial={{ y: '20px', opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: '20px', opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="bg-[#070708] w-full h-auto md:max-w-md rounded-t-3xl md:rounded-3xl p-6 space-y-5 shadow-2xl border-t md:border border-white/10 text-slate-350 bottom-sheet-mobile overflow-y-auto pb-safe"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <span className="text-xl">📺</span> DaLyric TV Sync Console
              </h3>
              <button
                onClick={() => setShowSyncModal(false)}
                className="p-1.5 hover:bg-white/5 rounded-full text-slate-400 cursor-pointer active-touch transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Dynamic Status Section */}
              <div className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${
                wsStatus === 'connected'
                  ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
                  : wsStatus === 'connecting'
                    ? 'bg-amber-500/5 border-amber-500/20 text-amber-400'
                    : 'bg-zinc-950 border-zinc-850 text-zinc-400'
              }`}>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-mono tracking-widest uppercase font-extrabold text-zinc-500">SYNCHRONIZER STATE</span>
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    {wsStatus === 'connected' ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                        Connected & Active
                      </>
                    ) : wsStatus === 'connecting' ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        Acquiring Handshake...
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-zinc-600" />
                        Offline Mode
                      </>
                    )}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-mono tracking-widest uppercase font-extrabold text-zinc-500 block">CHANNEL CODE</span>
                  <span className="font-mono text-sm font-black text-amber-500 tracking-wider">
                    {wsRoomCode || '------'}
                  </span>
                </div>
              </div>

              {/* Action Form */}
              <div className="space-y-3.5 bg-zinc-900/40 p-4 rounded-2xl border border-zinc-800">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase font-mono tracking-wider">Pairing Sync Code</label>
                  <div className="flex gap-2">
                    <input 
                      id="sync-room-input"
                      type="text"
                      maxLength={6}
                      pattern="[0-9]*"
                      inputMode="numeric"
                      placeholder="Enter 6-Digit Code"
                      defaultValue={wsRoomCode}
                      className="flex-1 p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white outline-none focus:border-amber-500 text-xs font-mono text-center tracking-widest"
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        e.target.value = val;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const input = document.getElementById('sync-room-input') as HTMLInputElement;
                          if (input) connectToDaLyric(input.value);
                        }
                      }}
                    />
                    
                    {wsStatus === 'connected' ? (
                      <button
                        onClick={disconnectFromDaLyric}
                        className="bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 text-red-400 hover:text-red-300 font-extrabold px-4 py-2.5 rounded-xl text-xs transition-all active:scale-95 cursor-pointer active-touch shrink-0"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          const input = document.getElementById('sync-room-input') as HTMLInputElement;
                          if (input) connectToDaLyric(input.value);
                        }}
                        className="bg-amber-500 hover:bg-amber-400 text-black font-extrabold px-5 py-2.5 rounded-xl text-xs transition-all active:scale-95 shadow-md shadow-amber-500/10 cursor-pointer active-touch shrink-0"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-2 font-mono leading-relaxed font-semibold">
                    Check the top status bar in the DaLyric desktop app to find your active 6-digit room code.
                  </p>
                </div>

                <div className="h-[1px] bg-zinc-800 my-3" />

                {/* Auto-Follow Toggle */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <span className="text-[11px] font-bold text-white font-mono uppercase tracking-wider block">Auto-Follow TV Stream</span>
                    <span className="text-[10.5px] text-zinc-400 leading-relaxed block mt-0.5 font-medium">
                      Instantly jump song tabs and advance stanzas to match the active projector screen.
                    </span>
                  </div>
                  <button
                    onClick={() => setAutoFollowTV(prev => !prev)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none mt-1 ${
                      autoFollowTV ? 'bg-amber-500' : 'bg-zinc-800'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-black shadow-lg ring-0 transition duration-200 ease-in-out ${
                        autoFollowTV ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Feed Monitor */}
              {wsStatus === 'connected' && (
                <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-900 relative overflow-hidden select-none animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* Backdrop glowing grid overlay */}
                  <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:8px_8px]"></div>
                  
                  <span className="text-[9px] font-mono tracking-widest uppercase font-black text-amber-500 block mb-2 relative z-10 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                    LIVE PRESENTATION FEED
                  </span>
                  
                  <div className="space-y-2 relative z-10 font-mono text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-500 font-medium">TV Song:</span>
                      <span className="text-zinc-200 font-extrabold max-w-[190px] truncate text-right">
                        {tvActiveTitle || 'Waiting for stream...'}
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-zinc-500 font-medium">Active Slide:</span>
                      <span className="text-zinc-200 font-bold">
                        {tvActiveTitle ? `Slide ${tvActiveSlide + 1}` : 'N/A'}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-zinc-500 font-medium">Resolution:</span>
                      <span className={`font-bold ${
                        tvActiveTitle 
                          ? tempBroadcastSong 
                            ? 'text-amber-500' 
                            : 'text-emerald-500' 
                          : 'text-zinc-650'
                      }`}>
                        {tvActiveTitle 
                          ? tempBroadcastSong 
                            ? 'Temp Feed (Unindexed Song)' 
                            : 'Vault Match (Synced)' 
                          : 'Waiting...'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-white/5 flex">
              <button
                type="button"
                onClick={() => setShowSyncModal(false)}
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-extrabold py-2.5 px-4 rounded-xl text-xs transition-colors cursor-pointer active-touch text-center shadow-md shadow-amber-500/10"
              >
                Close Sync Console
           
              </button>
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

