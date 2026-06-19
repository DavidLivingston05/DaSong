import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, RefreshCw, ZoomIn, ZoomOut, Check, ArrowUpRight, Award, Edit3, Save, Music, Heart, ChevronLeft, ChevronRight, Eye, EyeOff, Plus, Minus, ChevronUp, ChevronDown, Sliders, Share2, Radio, Copy, FileText, Link, Sparkles, Clock } from 'lucide-react';
import { Song, UserRole, WorshipEvent } from '../types';
import { getSongById, saveSong, getAllSongsMetadata, SongMetadata, saveSuggestion, getLocalSuggestions, getLocalWorshipEvents, saveWorshipEvent, broadcastState, getBroadcastState } from '../lib/db';
import { stripChords } from '../utils/chordTransposer';
import { parseTwoLineChords } from '../utils/lyricsParser';
import Metronome from './Metronome';


interface SongDetailProps {
  songId: string;
  onClose: () => void;
  onEnterStageMode: () => void;
  onToggleFavorite: (id: string, currentVal: boolean) => void;
  onLyricsUpdated: () => void; // Trigger list metadata refresh if changed
  onSelectSong: (id: string, setlistSongIds?: string[]) => void;
  currentRole: UserRole;
  backLabel?: string;
  setlistSongIds?: string[];
  tempBroadcastSong?: Song | null;
  songsMetadata?: SongMetadata[];
  isFavorite?: boolean;
}

export default function SongDetail({
  songId,
  onClose,
  onEnterStageMode,
  onToggleFavorite,
  onLyricsUpdated,
  onSelectSong,
  currentRole,
  backLabel,
  setlistSongIds = [],
  tempBroadcastSong = null,
  songsMetadata,
  isFavorite = false
}: SongDetailProps) {
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [allMetadataState, setAllMetadataState] = useState<SongMetadata[]>([]);
  const allMetadata = songsMetadata || allMetadataState;

  const [events, setEvents] = useState<WorshipEvent[]>([]);
  const [showSetlistDropdown, setShowSetlistDropdown] = useState<boolean>(false);

  useEffect(() => {
    setEvents(getLocalWorshipEvents());
  }, [songId]);

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => b.date.localeCompare(a.date));
  }, [events]);

  const handleToggleSongInSetlist = async (ev: WorshipEvent) => {
    const songIds = ev.songIds || [];
    const exists = songIds.includes(songId);
    const updatedIds = exists 
      ? songIds.filter(id => id !== songId) 
      : [...songIds, songId];
    
    const updatedEv = { ...ev, songIds: updatedIds, updatedAt: Date.now() };
    
    setEvents(prev => prev.map(e => e.id === ev.id ? updatedEv : e));
    
    try {
      await saveWorshipEvent(updatedEv);
    } catch (err) {
      console.error('Failed to toggle song in event:', err);
    }
  };


  // Setup active worship set sequence helpers based on passed array
  const worshipSetList = useMemo(() => {
    return setlistSongIds || [];
  }, [setlistSongIds]);

  const setlistIndex = useMemo(() => {
    return worshipSetList.indexOf(songId);
  }, [worshipSetList, songId]);

  // --- LIVE SERVICE LYRICS SYNC STATE & LOGIC ---
  const [isBroadcasting, setIsBroadcasting] = useState<boolean>(() => localStorage.getItem('dasong_live_broadcast') === 'true');
  const [isFollowing, setIsFollowing] = useState<boolean>(() => localStorage.getItem('dasong_live_follow') === 'true');
  const [highlightedLineIndex, setHighlightedLineIndex] = useState<number>(-1);
  const highlightedLineRef = useRef<number>(-1);

  useEffect(() => {
    highlightedLineRef.current = highlightedLineIndex;
  }, [highlightedLineIndex]);

  // Synchronize follow mode state with global changes (e.g. toggled from dashboard)
  useEffect(() => {
    const handleStorageChange = () => {
      const stored = localStorage.getItem('dasong_live_follow') === 'true';
      if (stored !== isFollowing) {
        setIsFollowing(stored);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    const interval = setInterval(handleStorageChange, 1000);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [isFollowing]);

  // Poll broadcast state if following
  useEffect(() => {
    if (!isFollowing || !songId) return;

    let active = true;

    const checkBroadcast = async () => {
      try {
        const state = await getBroadcastState();
        if (!active) return;
        if (state) {
          // If song changed
          if (state.songId && state.songId !== songId) {
            onSelectSong(state.songId, setlistSongIds);
            return;
          }

          // Update highlighted line
          if (typeof state.activeLineIndex === 'number' && state.activeLineIndex >= 0) {
            const hasLineChanged = state.activeLineIndex !== highlightedLineRef.current;
            setHighlightedLineIndex(state.activeLineIndex);
            
            // Scroll to this line ONLY if it actually changed
            if (hasLineChanged) {
              setTimeout(() => {
                const el = document.getElementById(`lyric-line-${state.activeLineIndex}`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }, 100);
            }
          }
        }
      } catch (err) {
        console.warn('Error polling broadcast:', err);
      }
    };

    checkBroadcast();
    const intervalId = setInterval(checkBroadcast, 2000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [isFollowing, songId, onSelectSong, setlistSongIds]);

  // Broadcast song changes if leader
  useEffect(() => {
    if (isBroadcasting && song?.id) {
      broadcastState(song.id, 0);
      setHighlightedLineIndex(0);
    }
  }, [song?.id, isBroadcasting]);

  const handleLineSelect = async (lineIdx: number) => {
    setHighlightedLineIndex(lineIdx);
    
    if (isBroadcasting && song) {
      try {
        await broadcastState(song.id, lineIdx);
      } catch (err) {
        console.error('Failed to broadcast line selection:', err);
      }
    }
  };

  const handleToggleBroadcast = async (val: boolean) => {
    setIsBroadcasting(val);
    localStorage.setItem('dasong_live_broadcast', val ? 'true' : 'false');
    if (val) {
      setIsFollowing(false);
      localStorage.setItem('dasong_live_follow', 'false');
      if (song) {
        try {
          await broadcastState(song.id, 0);
          setHighlightedLineIndex(0);
        } catch (err) {
          console.error('Failed to start broadcast:', err);
        }
      }
    } else {
      try {
        await broadcastState(null, -1);
      } catch (err) {
        console.warn('Failed to stop broadcast:', err);
      }
    }
  };

  const handleToggleFollow = (val: boolean) => {
    setIsFollowing(val);
    localStorage.setItem('dasong_live_follow', val ? 'true' : 'false');
    if (val) {
      setIsBroadcasting(false);
      localStorage.setItem('dasong_live_broadcast', 'false');
    }
  };

  const hasNextSong = setlistIndex >= 0 && setlistIndex < worshipSetList.length - 1;
  const hasPrevSong = setlistIndex > 0;

  const nextSongId = hasNextSong ? worshipSetList[setlistIndex + 1] : null;
  const prevSongId = hasPrevSong ? worshipSetList[setlistIndex - 1] : null;

  const nextSongTitle = useMemo(() => {
    if (!nextSongId) return null;
    const match = allMetadata.find(s => s.id === nextSongId);
    return match ? match.title : 'Next Song';
  }, [nextSongId, allMetadata]);

  const prevSongTitle = useMemo(() => {
    if (!prevSongId) return null;
    const match = allMetadata.find(s => s.id === prevSongId);
    return match ? match.title : 'Previous Song';
  }, [prevSongId, allMetadata]);

  // Suggestion modal states
  const [showSuggestModal, setShowSuggestModal] = useState<boolean>(false);
  const [sugName, setSugName] = useState<string>(() => localStorage.getItem('lyrasync_user_name') || 'Choir Member');
  const [sugEventId, setSugEventId] = useState<string>('');
  const [sugNote, setSugNote] = useState<string>('');

  const handleOpenSuggestModal = () => {
    if (!song) return;
    setSugNote('');
    setSugEventId('');
    setShowSuggestModal(true);
  };

  const handleSubmitSuggestion = async () => {
    if (!song) return;
    const suggestions = getLocalSuggestions();
    
    if (suggestions.some((s: any) => s.songId === song.id && s.eventId === (sugEventId || undefined))) {
      alert(`"${song.title}" has already been suggested for this meeting.`);
      return;
    }

    const nameToSave = sugName.trim() || 'Choir Member';
    localStorage.setItem('lyrasync_user_name', nameToSave);

    const localEvents = getLocalWorshipEvents();
    const selectedEvent = localEvents.find(e => e.id === sugEventId);

    const newSuggestion = {
      id: `sug-${Date.now()}`,
      songId: song.id,
      songTitle: song.title,
      suggestedBy: nameToSave,
      timestamp: Date.now(),
      eventId: sugEventId || undefined,
      eventTitle: selectedEvent ? selectedEvent.title : undefined,
      eventDate: selectedEvent ? selectedEvent.date : undefined,
      note: sugNote.trim() || undefined
    };

    try {
      await saveSuggestion(newSuggestion);
      alert(`"${song.title}" has been successfully suggested for ${selectedEvent ? `"${selectedEvent.title}"` : 'General Catalog'}!`);
      setShowSuggestModal(false);
      onLyricsUpdated(); // notify parent
    } catch (err) {
      alert('Failed to save suggestion: ' + err);
    }
  };
  
  const [fontSize, setFontSize] = useState<number>(16);
  const [showMobileDrawer, setShowMobileDrawer] = useState<boolean>(false);

  // Share and copy states & helpers
  const [showShareDropdown, setShowShareDropdown] = useState<boolean>(false);
  const [copyToast, setCopyToast] = useState<string>('');

  useEffect(() => {
    if (copyToast) {
      const t = setTimeout(() => setCopyToast(''), 2000);
      return () => clearTimeout(t);
    }
  }, [copyToast]);

  const copyTextToClipboard = async (text: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.warn("Clipboard API write failed, falling back", err);
      }
    }

    // Fallback to legacy execCommand
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (!successful) throw new Error("copy command unsuccessful");
      return true;
    } catch (err) {
      document.body.removeChild(textArea);
      console.error("Fallback copy failed", err);
      return false;
    }
  };

  const handleCopyLyrics = async () => {
    try {
      let processed = stripChords(song.lyrics);
      const rawLines = processed.split('\n');
      const cleanLyricsLines: string[] = [];
      let lyricsStarted = false;
      for (const line of rawLines) {
        const trimmed = line.trim();
        if (!lyricsStarted) {
          const isMetadata = 
            /^(?:Title|Name|Author|Artist|Composer|Writer|Key|Chord\s*Key|Bpm|Tempo|Category|Genre|Theme)\s*:/i.test(trimmed) ||
            /^lyrics\s*:/i.test(trimmed);
          if (isMetadata) continue;
          if (trimmed === '') continue;
          lyricsStarted = true;
        }
        cleanLyricsLines.push(line);
      }
      processed = cleanLyricsLines.join('\n').trim();

      const header = `${song.title}\nBy: ${song.author || 'Traditional'}\n\n`;
      const copySuccess = await copyTextToClipboard(header + processed);
      if (copySuccess) {
        setCopyToast('Lyrics copied to clipboard!');
      } else {
        alert('Failed to copy lyrics');
      }
      setShowShareDropdown(false);
    } catch (err) {
      console.error(err);
      alert('Failed to copy lyrics');
    }
  };

  const getSongLinkUrl = () => {
    const currentUrl = window.location.href;
    const url = new URL(currentUrl);
    url.searchParams.set('song', song.id);
    
    const serverId = localStorage.getItem('dasong_active_server_id') || 'default';
    if (serverId !== 'default') {
      url.searchParams.set('server', serverId);
    }
    return url.toString();
  };

  const handleCopyWebLink = async () => {
    try {
      const shareUrl = getSongLinkUrl();
      const copySuccess = await copyTextToClipboard(shareUrl);
      if (copySuccess) {
        setCopyToast('Link copied to clipboard!');
      } else {
        alert('Failed to copy link');
      }
      setShowShareDropdown(false);
    } catch (err) {
      console.error(err);
      alert('Failed to copy link');
    }
  };

  const handleNativeShare = async () => {
    try {
      const shareUrl = getSongLinkUrl();
      if (navigator.share) {
        await navigator.share({
          title: song.title,
          text: `Check out "${song.title}" on DaSong!`,
          url: shareUrl
        });
        setShowShareDropdown(false);
      } else {
        await handleCopyWebLink();
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error(err);
        alert('Failed to share');
      }
    }
  };

  
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editForm, setEditForm] = useState({ title: '', author: '', key: '', bpm: 75, category: '', lyrics: '' });
  const [saveToast, setSaveToast] = useState<boolean>(false);
  const [formatMsg, setFormatMsg] = useState<string>('');
  
  const lyricContainerRef = useRef<HTMLDivElement>(null);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState<number>(0);
  const [scrolling, setScrolling] = useState<boolean>(false);
  const scrollTimerRef = useRef<number | null>(null);

  // Keyboard control shortcuts for instant Stage/Musician projection control
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isTyping = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        (activeEl as HTMLElement).isContentEditable
      );

      // Disable keyboard shortcuts when editing or typing
      if (isTyping || isEditing) return;

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case '[':
        case '{':
          e.preventDefault();
          setFontSize(p => Math.max(12, p - 1));
          break;
        case ']':
        case '}':
          e.preventDefault();
          setFontSize(p => Math.min(28, p + 1));
          break;
        case ' ':
          e.preventDefault();
          setAutoScrollSpeed(speed => {
            if (speed === 0) return 2;
            return speed;
          });
          setScrolling(prev => !prev);
          break;
        case 'ArrowUp':
          e.preventDefault();
          // Increase scrolling speed
          setAutoScrollSpeed(speed => Math.min(speed + 1, 10));
          setScrolling(true);
          break;
        case 'ArrowDown':
          e.preventDefault();
          // Decrease scrolling speed
          setAutoScrollSpeed(speed => Math.max(speed - 1, 1));
          setScrolling(true);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          if (nextSongId) {
            e.preventDefault();
            onSelectSong(nextSongId, worshipSetList);
          }
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          if (prevSongId) {
            e.preventDefault();
            onSelectSong(prevSongId, worshipSetList);
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [songId, nextSongId, prevSongId, worshipSetList, autoScrollSpeed, isEditing, onClose, onSelectSong]);



  // Load all song metadata to support smart related/alternative songs logic
  useEffect(() => {
    if (songsMetadata) return;
    async function loadMetadata() {
      try {
        const meta = await getAllSongsMetadata();
        setAllMetadataState(meta);
      } catch (err) {
        console.error('Failed loading metadata for suggestions:', err);
      }
    }
    loadMetadata();
  }, [songId, songsMetadata]);


  // 1. Lazy load full song sheet from Database tables safely
  useEffect(() => {
    async function loadSong() {
      setLoading(true);
      try {
        if (songId === 'dalyric-broadcast-temp' && tempBroadcastSong) {
          setSong(tempBroadcastSong);
          setEditForm({
            title: tempBroadcastSong.title,
            author: tempBroadcastSong.author || 'DaLyric Broadcast',
            key: tempBroadcastSong.key || 'G',
            bpm: tempBroadcastSong.bpm || 75,
            category: tempBroadcastSong.category || 'Worship',
            lyrics: tempBroadcastSong.lyrics
          });
        } else {
          const fullSong = await getSongById(songId);
          if (fullSong) {
            setSong(fullSong);
            setEditForm({
              title: fullSong.title,
              author: fullSong.author || 'Unknown Author',
              key: fullSong.key || 'G',
              bpm: fullSong.bpm || 75,
              category: fullSong.category || 'Worship',
              lyrics: fullSong.lyrics
            });
          }
        }
        
        // Smoother automatic scroll trigger
        setTimeout(() => {
          const lyricsSection = document.getElementById('lyric-presentation-panel');
          if (lyricsSection) {
            lyricsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 80);
      } catch (err) {
        console.error('Failed to retrieve full lyrics detail:', err);
      } finally {
        setLoading(false);
      }
    }
    
    // Stop scroll when loading another song
    setScrolling(false);
    setAutoScrollSpeed(0);
    loadSong();
  }, [songId, tempBroadcastSong]);

  // Handle auto-scroll loop ticks
  useEffect(() => {
    if (scrolling && autoScrollSpeed > 0) {
      const scrollStep = () => {
        if (lyricContainerRef.current) {
          const container = lyricContainerRef.current;
          container.scrollTop += autoScrollSpeed * 0.18; // smooth divisor
          
          if (container.scrollTop + container.clientHeight >= container.scrollHeight - 1) {
            setScrolling(false);
            return;
          }
        }
        scrollTimerRef.current = requestAnimationFrame(scrollStep);
      };
      
      scrollTimerRef.current = requestAnimationFrame(scrollStep);
    } else {
      if (scrollTimerRef.current) {
        cancelAnimationFrame(scrollTimerRef.current);
        scrollTimerRef.current = null;
      }
    }

    return () => {
      if (scrollTimerRef.current) {
        cancelAnimationFrame(scrollTimerRef.current);
      }
    };
  }, [scrolling, autoScrollSpeed]);

  const handleSaveEdit = async () => {
    if (!song) return;

    const updatedSong: Song = {
      ...song,
      title: editForm.title,
      author: editForm.author,
      key: editForm.key,
      bpm: Number(editForm.bpm) || 75,
      category: editForm.category,
      lyrics: editForm.lyrics,
      updatedAt: Date.now()
    };

    try {
      await saveSong(updatedSong);
      setSong(updatedSong);
      setIsEditing(false);
      onLyricsUpdated();
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2500);
    } catch (err) {
      alert('Failed saving changes: ' + err);
    }
  };

  // Calculate recommended related songs based on category, title overlaps, author, and BPM
  const relatedSongs = useMemo(() => {
    if (!song || allMetadata.length === 0) return [];
    
    const getWords = (str: string) => 
      new Set(str.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2));
    
    const songTitleWords = getWords(song.title);
    
    return allMetadata
      .filter(m => m.id !== song.id)
      .map(m => {
        let score = 0;
        
        // Category similarity (high weight)
        if (m.category === song.category) {
          score += 10;
        }
        
        // Title similarity (word matching matches potential typos / duplicate subparts)
        const otherTitleWords = getWords(m.title);
        otherTitleWords.forEach(w => {
          if (songTitleWords.has(w)) {
            score += 15; // super strong match if words overlap
          }
        });
        
        // Artist/Author match
        if (m.author && song.author && m.author.toLowerCase() === song.author.toLowerCase()) {
          score += 8;
        }
        
        // BPM closeness (similar tempo is useful for playlists/melodies)
        if (m.bpm && song.bpm) {
          const diff = Math.abs(m.bpm - song.bpm);
          if (diff < 10) score += 4;
          else if (diff < 20) score += 2;
        }
        
        return { metadata: m, score };
      })
      .filter(item => item.score > 2) // Must have some meaningful relevance
      .sort((a, b) => b.score - a.score)
      .slice(0, 4) // Fetch up to 4 suggestions
      .map(item => item.metadata);
  }, [song, allMetadata]);

  if (loading) {
    return (
      <div className="bg-[#12131A] rounded-md border border-[#1E202B] p-12 text-center animate-pulse">
        <Music className="h-10 w-10 text-amber-500/25 mx-auto animate-spin" />
        <h4 className="font-sans font-bold text-zinc-300 mt-4">Loading lyrics sheet...</h4>
      </div>
    );
  }

  if (!song) {
    return (
      <div className="bg-[#12131A] rounded-md border border-[#1E202B] p-12 text-center">
        <p className="text-zinc-400 select-none">Selected song could not be fetched.</p>
      </div>
    );
  }

  // Pre-process and render sheet lyrics
  let processedLyrics = song.lyrics || '';

  // Strip metadata headers from raw lyrics block to prevent duplication
  const rawLines = processedLyrics.split('\n');
  const cleanLyricsLines: string[] = [];
  let lyricsStarted = false;
  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!lyricsStarted) {
      const isMetadata = 
        /^(?:Title|Name|Author|Artist|Composer|Writer|Key|Chord\s*Key|Bpm|Tempo|Category|Genre|Theme)\s*:/i.test(trimmed) ||
        /^lyrics\s*:/i.test(trimmed);
      if (isMetadata) {
        continue;
      }
      if (trimmed === '') {
        continue;
      }
      lyricsStarted = true;
    }
    cleanLyricsLines.push(line);
  }
  processedLyrics = cleanLyricsLines.join('\n').trim();

  processedLyrics = stripChords(processedLyrics);

  // Normalize CRLF to LF and handle spaces/tabs on empty lines separating paragraphs
  const normalizedLyrics = processedLyrics.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const sections = normalizedLyrics.split(/\n\s*\n+/).filter(Boolean);

  return (
    <div id="lyric-presentation-panel" className="bg-[#12131A] rounded-md border border-[#1E202B] overflow-hidden flex flex-col h-full md:min-h-[550px]">
      {/* Save success toast */}
      {saveToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-5 py-2 bg-emerald-500 text-black font-black text-xs rounded shadow-2xl animate-in fade-in slide-in-from-top-2 flex items-center gap-2 pointer-events-none">
          <Check className="h-3.5 w-3.5 stroke-[3]" /> Changes saved successfully
        </div>
      )}
      
      {/* Copy success toast */}
      {copyToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-5 py-2 bg-amber-500 text-black font-black text-xs rounded shadow-2xl animate-in fade-in slide-in-from-top-2 flex items-center gap-2 pointer-events-none">
          <Check className="h-3.5 w-3.5 stroke-[3]" /> {copyToast}
        </div>
      )}
      
      {/* Detail Header Strip - Masterfully designed for both Desktop (Windows) and Mobile (iOS/Android) */}
      <div className="p-4 border-b border-[#1E202B] bg-[#12131A] flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        
        {/* Left Side: Back Trigger */}
        <button
          onClick={() => {
            if (isBroadcasting) {
              broadcastState(null, -1).catch(() => {});
            }
            onClose();
          }}
          className="h-10 px-4 premium-btn-secondary text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer rounded active-touch shrink-0"
          title={backLabel || "Back to Search"}
        >
          ← <span className="hidden xs:inline">{backLabel || "Back to Search"}</span>
        </button>

        {/* Right Side: Primary Responsive Actions Control Panel */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 ml-auto">
          {/* Follow Live Service (For all users) */}
          <button
            onClick={() => handleToggleFollow(!isFollowing)}
            className={`h-10 px-2.5 sm:px-4 rounded flex items-center justify-center gap-1.5 cursor-pointer transition-all shrink-0 text-xs font-bold ${
              isFollowing
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse'
                : 'premium-btn-secondary'
            }`}
            title={isFollowing ? "Following active live service broadcast" : "Follow active live service broadcast"}
          >
            <Radio className="h-4 w-4" />
            <span className="hidden sm:inline">{isFollowing ? 'Syncing' : 'Follow'}</span>
          </button>

          {/* Broadcast Live Service (For admin role only) */}
          {currentRole === 'admin' && (
            <button
              onClick={() => handleToggleBroadcast(!isBroadcasting)}
              className={`h-10 px-2.5 sm:px-4 rounded flex items-center justify-center gap-1.5 cursor-pointer transition-all shrink-0 text-xs font-bold relative ${
                isBroadcasting
                  ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                  : 'premium-btn-secondary'
              }`}
              title={isBroadcasting ? "Broadcasting live screen state" : "Broadcast live screen state"}
            >
              {isBroadcasting && (
                <Radio className="h-4 w-4 animate-ping duration-1000 absolute opacity-30" />
              )}
              <Radio className="h-4 w-4" />
              <span className="hidden sm:inline">{isBroadcasting ? 'Broadcasting' : 'Broadcast'}</span>
            </button>
          )}

          {/* Favorite Indicator Action Button */}
          <button
            onClick={() => onToggleFavorite(song.id, isFavorite)}
            className={`h-10 w-10 rounded flex items-center justify-center cursor-pointer transition-all shrink-0 ${
              isFavorite
                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                : 'premium-btn-secondary'
            }`}
            title="Toggle Favorite"
          >
            <Heart className={`h-4 w-4 ${isFavorite ? 'fill-amber-500 text-amber-500' : ''}`} />
          </button>

          {/* Share Dropdown Button */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowShareDropdown(!showShareDropdown)}
              className={`h-10 w-10 rounded flex items-center justify-center cursor-pointer transition-all shrink-0 ${
                showShareDropdown
                  ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                  : 'premium-btn-secondary'
              }`}
              title="Share / Copy Options"
            >
              <Share2 className="h-4 w-4" />
            </button>
            {showShareDropdown && (
              <div className="absolute right-0 bottom-12 md:bottom-auto md:top-12 w-48 bg-[#12131A] border border-[#1E202B] rounded z-50 p-2 space-y-1 animate-in fade-in slide-in-from-top-2 duration-150">
                <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-500 font-bold px-2.5 py-1.5 border-b border-[#1E202B]">Share / Copy Options</p>
                {typeof navigator.share !== 'undefined' && (
                  <button
                    onClick={handleNativeShare}
                    className="w-full text-left p-2 rounded text-xs text-zinc-300 hover:bg-white/5 transition-all cursor-pointer flex items-center gap-2"
                  >
                    <Share2 className="h-3.5 w-3.5 text-zinc-500" /> Share Song...
                  </button>
                )}
                <button
                  onClick={handleCopyLyrics}
                  className="w-full text-left p-2 rounded text-xs text-zinc-300 hover:bg-white/5 transition-all cursor-pointer flex items-center gap-2"
                >
                  <FileText className="h-3.5 w-3.5 text-zinc-500" /> Copy Lyrics
                </button>
                <button
                  onClick={handleCopyWebLink}
                  className="w-full text-left p-2 rounded text-xs text-zinc-300 hover:bg-white/5 transition-all cursor-pointer flex items-center gap-2"
                >
                  <Link className="h-3.5 w-3.5 text-zinc-500" /> Copy Song Link
                </button>
              </div>
            )}
          </div>

          {/* Admin Editorial Trigger Switch */}
          {(currentRole === 'admin' || currentRole === 'guest') && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="h-10 px-4 premium-btn-secondary rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              title="Edit Lyrics"
            >
              <Edit3 className="h-4 w-4 shrink-0" /> 
              <span className="hidden sm:inline">Edit Lyrics</span>
            </button>
          )}

          {/* Add to Setlist Dropdown Trigger */}
          {(currentRole === 'admin' || currentRole === 'guest') && song && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowSetlistDropdown(!showSetlistDropdown)}
                className="h-10 px-4 premium-btn-secondary rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                title="Add to Setlist"
              >
                <Plus className="h-4 w-4 shrink-0" /> 
                <span className="hidden sm:inline">Add to Setlist</span>
              </button>
              {showSetlistDropdown && (
                <div className="absolute right-0 bottom-12 md:bottom-auto md:top-12 w-60 bg-[#12131A] border border-[#1E202B] rounded z-50 p-2 space-y-1 animate-in fade-in slide-in-from-top-2 duration-150">
                  <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-500 font-bold px-2.5 py-1.5 border-b border-[#1E202B]">Select Target Setlist</p>
                  <div className="max-h-[160px] overflow-y-auto pr-1">
                    {sortedEvents.length === 0 ? (
                      <p className="text-[10px] text-zinc-500 italic p-3 text-center">No setlists created yet.</p>
                    ) : (
                      sortedEvents.map(ev => {
                        const isAdded = (ev.songIds || []).includes(song.id);
                        return (
                          <button
                            type="button"
                            key={ev.id}
                            onClick={() => handleToggleSongInSetlist(ev)}
                            className={`w-full text-left p-2.5 rounded text-xs flex items-center justify-between gap-2 hover:bg-white/5 transition-all cursor-pointer ${
                              isAdded ? 'text-emerald-400 font-bold' : 'text-zinc-300'
                            }`}
                          >
                            <span className="truncate">{ev.title}</span>
                            {isAdded ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            ) : (
                              <Plus className="h-3.5 w-3.5 text-zinc-650 shrink-0" />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Fullscreen Presentation Trigger Selection */}
          <button
            id="stage-presentation-trigger"
            onClick={() => onEnterStageMode()}
            className="h-10 px-5 premium-btn-primary rounded text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
            title="Present Fullscreen"
          >
            <ArrowUpRight className="h-4 w-4 stroke-[3] shrink-0" />
            <span className="hidden sm:inline">Present Fullscreen</span> 
          </button>
        </div>
      </div>

      {/* Editing panel state */}
      {isEditing ? (
        <div className="p-6 flex-1 overflow-y-auto space-y-5 bg-[#12131A]">
          <h4 className="font-bold text-sm text-white uppercase tracking-wider font-mono">Manual Lyrics Editor</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-zinc-400">Song Title</label>
              <input
                id="edit-title"
                type="text"
                value={editForm.title}
                onChange={(e) => setEditForm(p => ({ ...p, title: e.target.value }))}
                className="mt-1 w-full text-xs p-2.5 rounded font-sans premium-input focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-zinc-400">Author</label>
              <input
                id="edit-author"
                type="text"
                value={editForm.author}
                onChange={(e) => setEditForm(p => ({ ...p, author: e.target.value }))}
                className="mt-1 w-full text-xs p-2.5 rounded font-sans premium-input focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-zinc-400">Original Key</label>
              <input
                id="edit-key"
                type="text"
                value={editForm.key}
                onChange={(e) => setEditForm(p => ({ ...p, key: e.target.value }))}
                className="mt-1 w-full text-xs p-2.5 rounded font-mono premium-input focus:outline-none"
                placeholder="e.g. G"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-zinc-400">Tempo BPM</label>
              <input
                id="edit-bpm"
                type="number"
                value={editForm.bpm}
                onChange={(e) => setEditForm(p => ({ ...p, bpm: parseInt(e.target.value) || 75 }))}
                className="mt-1 w-full text-xs p-2.5 rounded font-mono premium-input focus:outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-mono text-zinc-400">Song Category</label>
              <select
                id="edit-category"
                value={editForm.category}
                onChange={(e) => setEditForm(p => ({ ...p, category: e.target.value }))}
                className="mt-1 w-full text-xs p-2.5 rounded cursor-pointer font-sans premium-input focus:outline-none"
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
            <label className="text-xs font-mono text-zinc-400 block mb-1">
              <span>Song Lyrics / Content</span>
            </label>
            <textarea
              id="edit-lyrics"
              value={editForm.lyrics}
              onChange={(e) => setEditForm(p => ({ ...p, lyrics: e.target.value }))}
              rows={12}
              className="mt-1 w-full text-xs p-3 rounded font-mono outline-none premium-input focus:outline-none"
            />
          </div>
          <div className="flex gap-2.5 justify-end">
            <button
              onClick={() => setIsEditing(false)}
              className="premium-btn-secondary px-5 py-2.5 rounded text-xs font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              className="premium-btn-primary px-6 py-2.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="h-3.5 w-3.5 text-black stroke-[3]" /> Save Changes
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          
          {/* Main Lyrics Area */}
          <div className="flex-1 flex flex-col min-h-0">            {/* Custom Interactive Musician Control Ribbon - Highly Optimized for both Mobile Touch and Desktop Windows */}
            <div className="hidden md:flex p-4 border-b border-[#1E202B] bg-[#12131A] items-center justify-between gap-4 select-none">

              {/* 1. COMFORTABLE FONT SIZE ADJUSTMENTS */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold font-mono text-zinc-500 uppercase tracking-widest">Size:</span>
                <div className="flex items-center gap-1.5 p-1 rounded bg-[#12131A] border border-[#1E202B]">
                  <button
                    onClick={() => setFontSize(p => Math.max(12, p - 1))}
                    className="w-10 h-10 flex items-center justify-center bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded border border-[#1E202B] active:scale-90 transition-all cursor-pointer"
                    title="Smaller text font size"
                  >
                    <ZoomOut className="h-4 w-4 stroke-[2.5]" />
                  </button>
                  
                  <span className="px-5 text-center font-mono font-black text-xs text-zinc-300 min-w-[70px]">
                    {fontSize}pt
                  </span>
                  
                  <button
                    onClick={() => setFontSize(p => Math.min(28, p + 1))}
                    className="w-10 h-10 flex items-center justify-center bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded border border-[#1E202B] active:scale-90 transition-all cursor-pointer"
                    title="Larger text font size"
                  >
                    <ZoomIn className="h-4 w-4 stroke-[2.5]" />
                  </button>
                </div>
              </div>

              {/* 2. AUTO SCROLL CONTROLLER */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold font-mono text-zinc-500 uppercase tracking-widest">Scroll:</span>
                <div className="flex items-center gap-1.5 p-1 rounded bg-[#12131A] border border-[#1E202B]">
                  <button
                    onClick={() => {
                      if (autoScrollSpeed === 0) setAutoScrollSpeed(2);
                      setScrolling(!scrolling);
                    }}
                    className={`w-10 h-10 flex items-center justify-center rounded border transition-all active:scale-90 cursor-pointer ${
                      scrolling && autoScrollSpeed > 0
                        ? 'bg-amber-500 border-amber-500 text-black font-black'
                        : 'bg-zinc-950 border-[#1E202B] text-zinc-400 hover:text-white'
                    }`}
                    title={scrolling && autoScrollSpeed > 0 ? 'Pause scroll' : 'Start auto-scroll'}
                  >
                    {scrolling && autoScrollSpeed > 0 ? <Pause className="h-4 w-4 stroke-[2.5]" /> : <Play className="h-4 w-4 stroke-[2.5]" />}
                  </button>
                  
                  {scrolling && (
                    <select
                      value={autoScrollSpeed}
                      onChange={(e) => setAutoScrollSpeed(Number(e.target.value))}
                      className="bg-zinc-950 text-xs font-bold font-mono h-10 px-2 rounded text-amber-500 border border-[#1E202B] focus:outline-none cursor-pointer"
                    >
                      <option value={1}>1x Speed</option>
                      <option value={2}>2x Speed</option>
                      <option value={3}>3x Speed</option>
                      <option value={4}>4x Speed</option>
                      <option value={5}>5x Speed</option>
                    </select>
                  )}
                </div>
              </div>
            </div>

            {/* Scrolling Lyric Sheet Canvas */}
            <div
              id="lyric-sheet"
              ref={lyricContainerRef}
              className="flex-1 overflow-y-auto md:max-h-[70vh] p-6 md:p-8 space-y-4 relative font-serif text-slate-200 selection:bg-amber-500/20"
              style={{ fontSize: `${fontSize}px` }}
            >
              {/* Dynamic Metadata Block with custom visual separator */}
              <div className="mb-6 select-none font-sans text-left">
                <span className="text-xs font-bold font-mono text-amber-500 tracking-wider uppercase block mb-1">
                  {song.category || 'Uploaded General'}
                </span>
                <h3 className="text-2xl md:text-3xl font-serif font-black text-white tracking-tight leading-snug">{song.title}</h3>
                <p className="text-xs text-slate-400 mt-1.5 font-medium">
                  Author/Credits: <span className="text-slate-300 font-semibold">{song.author || 'Traditional'}</span>
                </p>
                <div className="border-t border-[#1E202B] my-4 pt-4 flex flex-wrap items-center justify-between select-none pointer-events-none gap-2">
                  <span className="text-[10px] font-mono tracking-wider text-zinc-550 uppercase flex items-center gap-1.5">
                    Tempo: <span className="text-amber-550 font-bold">{song.bpm || 72} BPM</span>
                  </span>
                </div>
              </div>

              {sections.length > 0 ? (
                (() => {
                  let globalLineCounter = 0;
                  return sections.map((section, idx) => {
                    const isChorus = section.toLowerCase().startsWith('chorus:');
                    const lines = section.split('\n');

                    // Calculate index range for this section
                    const startIdx = globalLineCounter;
                    const endIdx = globalLineCounter + lines.length - 1;
                    const isSectionHighlighted = highlightedLineIndex >= startIdx && highlightedLineIndex <= endIdx;

                    return (
                      <div
                        key={idx}
                        className={`mb-6 p-4 rounded transition-all duration-300 ${
                          isSectionHighlighted
                            ? 'bg-amber-500/10 border border-amber-500/30'
                            : (isChorus
                                ? 'border-l-4 border-amber-500 bg-amber-500/5 pl-4 text-slate-350'
                                : 'border border-transparent text-slate-350')
                        }`}
                      >
                        {lines.map((line, lIdx) => {
                          const currentLineIndex = globalLineCounter++;
                          const lineId = `lyric-line-${currentLineIndex}`;
                          
                          const clickHandler = () => {
                            handleLineSelect(currentLineIndex);
                          };
                          
                          const highlightClass = 'transition-all duration-200';

                          // Normal lyric block
                          return (
                            <div
                              key={lIdx}
                              id={lineId}
                              onClick={clickHandler}
                              className={`leading-relaxed p-1 cursor-pointer hover:bg-white/5 rounded ${highlightClass} ${
                                line.endsWith(':')
                                  ? 'font-bold text-amber-500 mt-2 text-[11px] uppercase tracking-widest'
                                  : (isSectionHighlighted ? 'text-white font-semibold' : 'text-slate-200 font-medium')
                              }`}
                              style={{ fontSize: `${line.endsWith(':') ? '11px' : 'inherit'}` }}
                            >
                              {line}
                            </div>
                          );
                        })}
                      </div>
                    );
                  });
                })()
              ) : (
                <p className="text-slate-500 py-10 text-center italic">Lyrics Empty</p>
              )}
              
              {/* Bottom scroll padding spacer */}
              <div className="h-24" />
            </div>
            {/* Bottom Worship Setlist Navigation Bar */}
            {worshipSetList.length > 0 && setlistIndex >= 0 ? (
              <div className="p-4 border-t border-[#1E202B] bg-[#12131A] flex flex-col md:flex-row items-center justify-between gap-4 select-none relative">
                
                {/* Progress metadata */}
                <div className="flex items-center gap-2 font-mono text-[10px] md:text-xs text-zinc-400">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  <span>SETLIST STATUS: <span className="font-black text-amber-500 font-sans">SONG {setlistIndex + 1} OF {worshipSetList.length}</span></span>
                </div>
                
                {/* Previous & Next controls */}
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto md:justify-end">
                  {hasPrevSong && (
                    <button
                      onClick={() => onSelectSong(prevSongId!, worshipSetList)}
                      className="w-full sm:w-auto h-10 px-5 rounded text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 premium-btn-secondary shrink-0"
                      title={`Previous: ${prevSongTitle}`}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span>PREV: {prevSongTitle}</span>
                    </button>
                  )}

                  {hasNextSong ? (
                    <button
                      onClick={() => onSelectSong(nextSongId!, worshipSetList)}
                      className="w-full sm:w-auto h-10 px-6 rounded text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 premium-btn-primary"
                      title={`Next up: ${nextSongTitle}`}
                    >
                      <span>NEXT: {nextSongTitle}</span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <div className="w-full sm:w-auto h-10 px-5 rounded bg-zinc-900/40 border border-[#1E202B] text-zinc-500 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                      <Sparkles className="h-4 w-4 text-amber-550" />
                      <span>LAST SONG IN SETLIST</span>
                    </div>
                  )}

                  {currentRole === 'choir' && (
                    <button
                      onClick={handleOpenSuggestModal}
                      className="w-full sm:w-auto bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 text-xs font-mono uppercase tracking-wider font-bold px-4 h-10 rounded cursor-pointer flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                      <Heart className="h-4 w-4 text-amber-500" />
                      <span>Suggest Song</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Simple general catalog bottom bar */
              <div className="hidden md:flex p-4 border-t border-[#1E202B] bg-[#12131A] flex-col sm:flex-row items-center justify-between gap-4 select-none relative">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase text-zinc-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
                  <span>General Catalog Explorer Mode</span>
                </div>
                
                <div className="flex items-center gap-3">
                  {currentRole === 'choir' && (
                    <button
                      onClick={handleOpenSuggestModal}
                      className="w-full sm:w-auto px-5 py-2 premium-btn-primary text-xs font-mono uppercase tracking-wider font-bold rounded cursor-pointer flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                      <Heart className="h-4 w-4 text-black" />
                      <span>Suggest Song</span>
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* Related / Suggested Songs sidebar */}
          {relatedSongs.length > 0 && (
            <div className="hidden md:flex md:w-64 border-t md:border-t-0 md:border-l border-[#1E202B] p-5 bg-[#12131A] flex-col min-h-0 font-sans select-none">
              <h5 className="font-bold text-xs text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-[#1E202B] pb-2">
                <Music className="h-3.5 w-3.5 text-amber-500" /> Related Songs
              </h5>
              <p className="text-[10px] text-slate-500 mt-1 pb-1">
                Suggested based on category or name matches:
              </p>
              
              <div className="space-y-2.5 mt-3 overflow-y-auto pr-1 flex-1">
                {relatedSongs.map((meta) => (
                  <button
                    key={meta.id}
                    onClick={() => onSelectSong(meta.id)}
                    className="w-full text-left p-3 rounded border border-[#1E202B] bg-[#12131A] hover:bg-zinc-900/40 hover:border-amber-500/30 transition-all group flex flex-col gap-1 cursor-pointer"
                  >
                    <div className="font-semibold text-xs text-white group-hover:text-amber-400 font-sans transition-colors line-clamp-1">
                      {meta.title}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>{meta.author || 'Traditional'}</span>
                      {meta.bpm && (
                        <span className="font-mono text-slate-400">{meta.bpm} BPM</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
      {/* Mobile Floating Sliders Deck Button */}
      {!isEditing && (
        <button
          onClick={() => setShowMobileDrawer(true)}
          className="fixed bottom-20 right-4 z-40 bg-amber-505 hover:bg-amber-500 active:scale-95 text-black p-3.5 rounded-full md:hidden active-touch flex items-center justify-center border border-[#1E202B]"
          title="Open Musician controls"
        >
          <Sliders className="h-5 w-5 stroke-[2.5]" />
        </button>
      )}

      {/* Slide-up Musician Control Drawer */}
      <div className={showMobileDrawer ? 'fixed inset-0 bg-black/85 backdrop-blur-xs z-50 flex items-end justify-center md:hidden' : 'hidden'} onClick={() => setShowMobileDrawer(false)}>
          <div 
            className="bg-[#12131A] border-t border-[#1E202B] rounded-t-md w-full max-w-md p-5 pb-safe space-y-6 animate-slideUp select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Handle */}
            <div className="flex flex-col items-center gap-1.5 cursor-pointer pb-2" onClick={() => setShowMobileDrawer(false)}>
              <div className="w-12 h-1 bg-zinc-800 rounded-full"></div>
              <span className="text-[10px] font-mono font-bold tracking-widest text-zinc-550 uppercase mt-1">Reader Settings</span>
            </div>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {/* Font scaling */}
              <div className="space-y-2.5 border-b border-[#1E202B] pb-4">
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <span className="text-xs font-bold text-white block">Font Scale</span>
                    <span className="text-[10px] text-zinc-550">Adjust text size in window</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">{fontSize}pt</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFontSize(p => Math.max(12, p - 2))}
                    className="flex-1 h-10 premium-btn-secondary text-zinc-200 rounded active-touch font-bold cursor-pointer"
                  >
                    Smaller Text
                  </button>
                  <button
                    onClick={() => setFontSize(p => Math.min(28, p + 2))}
                    className="flex-1 h-10 premium-btn-secondary text-zinc-200 rounded active-touch font-bold cursor-pointer"
                  >
                    Larger Text
                  </button>
                </div>
              </div>

              {/* Auto Scroll Controls */}
              <div className="space-y-2.5 border-b border-[#1E202B] pb-4">
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <span className="text-xs font-bold text-white block">Auto Scroll Sheet</span>
                    <span className="text-[10px] text-zinc-550">Hands-free scrolling speed</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    {scrolling && autoScrollSpeed > 0 ? `Speed ${autoScrollSpeed}` : 'Stopped'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (autoScrollSpeed === 0) setAutoScrollSpeed(2); // default speed
                      setScrolling(!scrolling);
                    }}
                    className={`flex-1 h-11 border rounded active-touch text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      scrolling && autoScrollSpeed > 0
                        ? 'bg-amber-500 border-amber-500 text-black font-extrabold'
                        : 'bg-zinc-900 border-[#1E202B] text-zinc-300'
                    }`}
                  >
                    {scrolling && autoScrollSpeed > 0 ? (
                      <>
                        <Pause className="h-3.5 w-3.5 stroke-[2.5]" /> Pause Scroll
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 stroke-[2.5]" /> Start Scroll
                      </>
                    )}
                  </button>
                  
                  {scrolling && (
                    <select
                      value={autoScrollSpeed}
                      onChange={(e) => setAutoScrollSpeed(Number(e.target.value))}
                      className="bg-zinc-900 text-xs font-bold h-11 px-3.5 rounded text-amber-500 border border-[#1E202B] active-touch"
                    >
                      <option value={1}>1x Speed</option>
                      <option value={2}>2x Speed</option>
                      <option value={3}>3x Speed</option>
                      <option value={4}>4x Speed</option>
                      <option value={5}>5x Speed</option>
                    </select>
                  )}
                </div>
              </div>

              {/* Present Fullscreen Shortcut */}
              <div className="border-b border-[#1E202B] pb-4">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="text-left">
                    <span className="text-xs font-bold text-white block">Present on Stage</span>
                    <span className="text-[10px] text-zinc-500">Launch fullscreen presentation</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowMobileDrawer(false);
                    onEnterStageMode();
                  }}
                  className="w-full h-11 premium-btn-primary font-extrabold text-xs rounded active-touch transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <ArrowUpRight className="h-4 w-4 stroke-[3]" /> Present Fullscreen
                </button>
              </div>

              {/* Integrated Visual Metronome Module */}
              <div className="pt-2">
                <Metronome initialBpm={song.bpm || 72} compact={true} />
              </div>
            </div>

            {/* Confirm button */}
            <button
              onClick={() => setShowMobileDrawer(false)}
              className="w-full py-3.5 premium-btn-primary font-black text-xs rounded active-touch transition-all cursor-pointer"
            >
              DONE / BACK TO SHEET
            </button>
          </div>
        </div>

      {/* Suggest for Service Modal Dialog */}
      {showSuggestModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4" onClick={() => setShowSuggestModal(false)}>
          <div 
            className="bg-[#12131A] border border-[#1E202B] rounded-md w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200 select-none text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#1E202B] pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Heart className="h-4.5 w-4.5 text-amber-500 fill-amber-500/10" /> Suggest for Service
              </h3>
              <button 
                onClick={() => setShowSuggestModal(false)}
                className="text-zinc-500 hover:text-white transition-colors cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            <div className="bg-amber-500/5 border border-amber-500/15 p-3.5 rounded-md">
              <span className="text-[10px] text-amber-500 font-mono tracking-widest uppercase block font-semibold">SUGGESTING SONG</span>
              <span className="text-sm font-bold text-white block mt-0.5">{song?.title}</span>
              {song?.author && <span className="text-[11px] text-zinc-400 block mt-0.5">by {song.author}</span>}
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Your Name</label>
                <input 
                  type="text"
                  value={sugName}
                  onChange={(e) => setSugName(e.target.value)}
                  className="w-full text-xs p-2.5 rounded premium-input focus:outline-none"
                  placeholder="e.g. Choir Member, Guest"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Target Worship Event / Meeting</label>
                <select
                  value={sugEventId}
                  onChange={(e) => setSugEventId(e.target.value)}
                  className="w-full text-xs p-2.5 rounded cursor-pointer premium-input focus:outline-none"
                >
                  <option value="">General Catalog (No specific meeting)</option>
                  {getLocalWorshipEvents()
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    .map(ev => (
                      <option key={ev.id} value={ev.id}>
                         {ev.title} ({new Date(ev.date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})})
                      </option>
                    ))
                  }
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Optional Note (e.g. key, order, memo)</label>
                <textarea
                  value={sugNote}
                  onChange={(e) => setSugNote(e.target.value)}
                  className="w-full text-xs p-2.5 h-16 rounded premium-input focus:outline-none resize-none"
                  placeholder="e.g. Suggesting this as the opening praise song"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowSuggestModal(false)}
                className="flex-1 py-2.5 text-xs font-bold premium-btn-secondary cursor-pointer transition-all active:scale-95 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitSuggestion}
                className="flex-1 py-2.5 text-xs font-bold premium-btn-primary cursor-pointer transition-all active:scale-95 rounded"
              >
                Submit Suggestion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

