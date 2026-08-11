import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, RefreshCw, ZoomIn, ZoomOut, Check, ArrowUpRight, Award, Edit3, Save, Music, Heart, ChevronLeft, ChevronRight, Eye, EyeOff, Plus, Minus, ChevronUp, ChevronDown, Sliders, Share2, Radio, Copy, FileText, Link, Sparkles, Clock, Printer, X } from 'lucide-react';
import { Song, UserRole } from '../types';
import { getSongById, saveSong, getAllSongsMetadata, SongMetadata, broadcastState, getBroadcastState } from '../lib/db';
import { stripChords } from '../utils/chordTransposer';
import { parseTwoLineChords } from '../utils/lyricsParser';
import FocusTrap from './FocusTrap';
import { getRecommendedSongs } from '../lib/recommendations';



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
  onExportSong?: (song: Song) => void;
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
  isFavorite = false,
  onExportSong,
}: SongDetailProps) {
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [showFontControl, setShowFontControl] = useState<boolean>(false);
  const [allMetadataState, setAllMetadataState] = useState<SongMetadata[]>([]);
  const allMetadata = songsMetadata || allMetadataState;


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
    const intervalId = setInterval(checkBroadcast, 400);

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
    if (!song) return;
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
    if (!song) return '';
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
    if (!song) return;
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
    if (!song) return;
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
  const [editForm, setEditForm] = useState({ title: '', author: '', key: '', lyrics: '' });
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

  // Calculate recommended related songs based on key match, theme, and author
  const relatedSongs = useMemo(() => {
    if (!song || allMetadata.length === 0) return [];
    return getRecommendedSongs(song as any, allMetadata as any, 6).map(item => item.song as SongMetadata);
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
      
      {/* Detail Header Strip - Masterfully designed for both Desktop and Mobile */}
      <div className="px-3 sm:px-5 py-2.5 sm:py-3.5 border-b border-[#1E202B] bg-[#12131A] flex items-center justify-between gap-2">
        
        {/* Left Side: Back Trigger */}
        <button
          onClick={() => {
            if (isBroadcasting) {
              broadcastState(null, -1).catch(() => {});
            }
            onClose();
          }}
          className="h-9 px-3 bg-zinc-900/80 hover:bg-zinc-800 border border-[#1E202B] text-zinc-300 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active-touch shrink-0"
          title={backLabel || "Back"}
        >
          <ChevronLeft className="w-4 h-4 text-amber-500" />
          <span className="text-xs font-bold font-sans">{backLabel || "Back"}</span>
        </button>

        {/* Right Side: Primary Responsive Actions Control Panel */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Follow Live Service (For all users) */}
          {isFollowing && (
            <button
              onClick={() => handleToggleFollow(!isFollowing)}
              className="h-9 px-2.5 rounded-xl flex items-center justify-center gap-1 cursor-pointer transition-all shrink-0 text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 animate-pulse"
              title="Following active live service broadcast"
            >
              <Radio className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Live</span>
            </button>
          )}

          {/* Broadcast Live Service (For admin role only) */}
          {currentRole === 'admin' && (
            <button
              onClick={() => handleToggleBroadcast(!isBroadcasting)}
              className={`h-9 px-2.5 rounded-xl flex items-center justify-center gap-1 cursor-pointer transition-all shrink-0 text-xs font-bold ${
                isBroadcasting
                  ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
                  : 'bg-zinc-900/80 border border-[#1E202B] text-zinc-400'
              }`}
              title="Broadcast live screen state"
            >
              <Radio className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Broadcast</span>
            </button>
          )}

          {/* Favorite Action Button */}
          <button
            onClick={() => onToggleFavorite(song.id, isFavorite)}
            className={`h-9 w-9 rounded-xl flex items-center justify-center cursor-pointer transition-all shrink-0 ${
              isFavorite
                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                : 'bg-zinc-900/80 border border-[#1E202B] text-zinc-400 hover:text-white'
            }`}
            title="Favorite"
          >
            <Heart className={`h-4 w-4 ${isFavorite ? 'fill-amber-500 text-amber-500' : ''}`} />
          </button>

          {/* Share Dropdown Button */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowShareDropdown(!showShareDropdown)}
              className={`h-9 w-9 rounded-xl flex items-center justify-center cursor-pointer transition-all shrink-0 ${
                showShareDropdown
                  ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                  : 'bg-zinc-900/80 border border-[#1E202B] text-zinc-400 hover:text-white'
              }`}
              title="Share / Copy Options"
            >
              <Share2 className="h-4 w-4" />
            </button>
            {showShareDropdown && (
              <div className="absolute right-0 top-11 w-48 bg-[#12131A] border border-[#1E202B] rounded-xl z-50 p-2 space-y-1 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150">
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

          {/* Edit Lyrics Trigger */}
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`h-9 px-2.5 sm:px-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              isEditing
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                : 'bg-zinc-900/80 border border-[#1E202B] text-zinc-400 hover:text-white'
            }`}
            title="Edit Lyrics"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>

          {/* Font Scale Control Toggle */}
          <button
            onClick={() => setShowFontControl(!showFontControl)}
            className={`h-9 w-9 rounded-xl flex items-center justify-center cursor-pointer transition-all shrink-0 ${
              showFontControl
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                : 'bg-zinc-900/80 border border-[#1E202B] text-zinc-400 hover:text-white'
            }`}
            title="Adjust Font Size"
          >
            <ZoomIn className="h-4 w-4" />
          </button>



          {/* Present Fullscreen */}
          <button
            id="stage-presentation-trigger"
            onClick={() => onEnterStageMode()}
            className="h-9 px-3 sm:px-4 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shrink-0 shadow-md"
            title="Present Fullscreen"
          >
            <ArrowUpRight className="h-4 w-4 stroke-[3]" />
            <span className="hidden sm:inline">Stage</span>
          </button>
        </div>
      </div>

      {/* Inline Live Font Scale Control Bar */}
      {showFontControl && (
        <div className="px-4 py-2.5 bg-[#171821] border-b border-[#1E202B] flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1 select-none shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-amber-500 uppercase tracking-widest">SIZE:</span>
            <span className="text-xs font-mono font-bold text-zinc-200 bg-white/5 px-2 py-0.5 rounded border border-white/10">{fontSize}pt</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFontSize(p => Math.max(12, p - 1))}
              className="w-9 h-9 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-lg border border-[#1E202B] active:scale-90 transition-all cursor-pointer"
              title="Smaller Text"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              onClick={() => setFontSize(p => Math.min(32, p + 1))}
              className="w-9 h-9 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-lg border border-[#1E202B] active:scale-90 transition-all cursor-pointer"
              title="Larger Text"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowFontControl(false)}
              className="p-1 text-zinc-500 hover:text-white transition-colors ml-1 cursor-pointer"
              title="Close Size Bar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

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
                <h3 className="text-2xl md:text-3xl font-serif font-black text-white tracking-tight leading-snug">{song.title}</h3>
                <p className="text-xs text-slate-400 mt-1.5 font-medium">
                  Author/Credits: <span className="text-slate-300 font-semibold">{song.author || 'Traditional'}</span>
                </p>

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
                </div>
              </div>
            ) : (
              /* Simple general catalog bottom bar */
              <div className="p-4 border-t border-[#1E202B] bg-[#12131A] flex flex-col sm:flex-row items-center justify-between gap-4 select-none relative">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase text-zinc-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
                  <span>Library Song View</span>
                </div>
              </div>
            )}

          </div>

          {/* Related / Suggested Songs sidebar */}
          {relatedSongs.length > 0 && (
            <div className="hidden md:flex md:w-64 border-t md:border-t-0 md:border-l border-[#1E202B] p-5 bg-[#12131A] flex-col min-h-0 font-sans select-none">
              <h5 className="font-bold text-xs text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-[#1E202B] pb-2">
                <Music className="h-3.5 w-3.5 text-amber-500" /> Recommended Songs
              </h5>
              <p className="text-[10px] text-zinc-400 mt-1 pb-1">
                Suggested next tracks by key & theme:
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
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      )}




    </div>
  );
}

