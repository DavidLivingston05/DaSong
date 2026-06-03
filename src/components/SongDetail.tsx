import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, RefreshCw, ZoomIn, ZoomOut, Check, ArrowUpRight, Award, Edit3, Save, Music, Heart, ChevronLeft, Eye, EyeOff, Plus, Minus, ChevronUp, ChevronDown, Sliders } from 'lucide-react';
import { Song, UserRole, WorshipEvent } from '../types';
import { getSongById, saveSong, getAllSongsMetadata, SongMetadata, saveSuggestion, getLocalSuggestions, getLocalWorshipEvents, saveWorshipEvent } from '../lib/db';
import { transposeLyrics, stripChords } from '../utils/chordTransposer';
import { parseTwoLineChords } from '../utils/lyricsParser';
import Metronome from './Metronome';


interface SongDetailProps {
  songId: string;
  onClose: () => void;
  onEnterStageMode: (transposeStep: number) => void;
  onToggleFavorite: (id: string, currentVal: boolean) => void;
  onLyricsUpdated: () => void; // Trigger list metadata refresh if changed
  onSelectSong: (id: string, setlistSongIds?: string[]) => void;
  currentRole: UserRole;
  backLabel?: string;
  setlistSongIds?: string[];
  tempBroadcastSong?: Song | null;
  songsMetadata?: SongMetadata[];
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
  songsMetadata
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

  const handleSuggestThisSong = async () => {
    if (!song) return;
    const suggestions = getLocalSuggestions();
    
    if (suggestions.some((s: any) => s.songId === song.id)) {
      alert(`"${song.title}" has already been suggested to the Admin.`);
      return;
    }

    const newSuggestion = {
      id: `sug-${Date.now()}`,
      songId: song.id,
      songTitle: song.title,
      suggestedBy: 'Choir Member',
      timestamp: Date.now()
    };

    try {
      await saveSuggestion(newSuggestion);
      alert(`"${song.title}" has been successfully added to the Admin Review suggestions list!`);
      onLyricsUpdated(); // notify parent
    } catch (err) {
      alert('Failed to save suggestion: ' + err);
    }
  };
  
  // Custom interactive musician transposition controls
  const [transposeStep, setTransposeStep] = useState<number>(0);
  const [showChords, setShowChords] = useState<boolean>(false);
  const [fontSize, setFontSize] = useState<number>(16);
  const [showMobileDrawer, setShowMobileDrawer] = useState<boolean>(false);

  // Compute transposed key
  const transposedKey = useMemo(() => {
    const originalKey = song?.key || 'G';
    if (transposeStep === 0) return originalKey;

    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const flats: Record<string, string> = {
      'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#',
      'db': 'C#', 'eb': 'D#', 'gb': 'F#', 'ab': 'G#', 'bb': 'A#'
    };
    
    let cleanKey = originalKey.trim();
    const isMinor = cleanKey.endsWith('m') && cleanKey.length > 1 && !cleanKey.endsWith('im');
    let baseNote = isMinor ? cleanKey.slice(0, -1) : cleanKey;
    
    if (flats[baseNote]) {
      baseNote = flats[baseNote];
    }
    
    let idx = notes.findIndex(n => n.toUpperCase() === baseNote.toUpperCase());
    if (idx === -1) return originalKey;
    
    let targetIdx = (idx + transposeStep) % 12;
    if (targetIdx < 0) targetIdx += 12;
    
    return notes[targetIdx] + (isMinor ? 'm' : '');
  }, [song?.key, transposeStep]);

  
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editForm, setEditForm] = useState({ title: '', author: '', key: '', bpm: 75, category: '', lyrics: '' });
  
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
        case '+':
        case '=':
          e.preventDefault();
          if (showChords) setTransposeStep(prev => prev + 1);
          break;
        case '-':
        case '_':
          e.preventDefault();
          if (showChords) setTransposeStep(prev => prev - 1);
          break;
        case '0':
          e.preventDefault();
          if (showChords) setTransposeStep(0);
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
  }, [songId, nextSongId, prevSongId, worshipSetList, showChords, autoScrollSpeed, isEditing, onClose, onSelectSong]);



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
          setTransposeStep(0);
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
            setTransposeStep(0);
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
      <div className="bg-white rounded-3xl border border-amber-950/10 p-12 text-center animate-pulse dark:bg-stone-900 dark:border-white/5">
        <Music className="h-10 w-10 text-amber-900/10 mx-auto animate-spin" />
        <h4 className="font-serif font-bold text-amber-950 mt-4 dark:text-stone-300">Loading lyrics sheet...</h4>
      </div>
    );
  }

  if (!song) {
    return (
      <div className="bg-white rounded-3xl border border-amber-950/10 p-12 text-center dark:bg-stone-900 dark:border-white/5">
        <p className="text-amber-950 select-none dark:text-stone-300">Selected song could not be fetched.</p>
      </div>
    );
  }

  // Pre-process and render sheet lyrics
  let processedLyrics = song.lyrics || '';
  if (transposeStep !== 0) {
    processedLyrics = transposeLyrics(processedLyrics, transposeStep);
  }
  if (!showChords) {
    processedLyrics = stripChords(processedLyrics);
  }

  // Normalize CRLF to LF and handle spaces/tabs on empty lines separating paragraphs
  const normalizedLyrics = processedLyrics.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const sections = normalizedLyrics.split(/\n\s*\n+/).filter(Boolean);

  return (
    <div id="lyric-presentation-panel" className="bg-[#070708] rounded-3xl border border-white/10 overflow-hidden shadow-2xl flex flex-col h-full md:min-h-[550px]">
      
      {/* Detail Header Strip - Masterfully designed for both Desktop (Windows) and Mobile (iOS/Android) */}
      <div className="p-4 border-b border-zinc-800/80 bg-[#050506] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        
        {/* Left Side: Back Trigger + Metadata Information */}
        <div className="flex items-start sm:items-center gap-3">
          <button
            onClick={onClose}
            className="h-12 px-4 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-amber-500 hover:text-amber-400 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md active:scale-95 shrink-0"
            title={backLabel || "Back to Search"}
          >
            ← <span className="hidden xs:inline">{backLabel || "Back to Search"}</span>
          </button>
          
          <div className="min-w-0">
            <span className="text-[9px] font-mono font-black tracking-widest text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 uppercase">
              {song.category || 'Uploaded General'}
            </span>
            <h2 className="text-lg md:text-xl font-bold text-white leading-tight mt-1.5 truncate">
              {song.title}
            </h2>
            <p className="text-xs text-zinc-500 truncate">
              Author: <span className="text-zinc-400 font-semibold">{song.author || 'Traditional'}</span>
            </p>
          </div>
        </div>

        {/* Right Side: Primary Responsive Actions Control Panel */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Favorite Indicator Action Button */}
          <button
            onClick={() => onToggleFavorite(song.id, !song.favorite)}
            className={`h-12 w-12 rounded-2xl border flex items-center justify-center cursor-pointer transition-all shrink-0 ${
              song.favorite
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
            title="Toggle Favorite"
          >
            <Heart className={`h-4 w-4 ${song.favorite ? 'fill-amber-400 text-amber-400' : ''}`} />
          </button>

          {/* Admin Editorial Trigger Switch */}
          {currentRole === 'admin' && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="flex-1 sm:flex-initial h-12 bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-850 hover:text-white px-4 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Edit3 className="h-4 w-4 shrink-0" /> 
              <span>Edit Lyrics</span>
            </button>
          )}

          {/* Add to Setlist Dropdown Trigger */}
          {currentRole === 'admin' && song && (
            <div className="relative flex-1 sm:flex-initial">
              <button
                type="button"
                onClick={() => setShowSetlistDropdown(!showSetlistDropdown)}
                className="w-full h-12 bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-850 hover:text-white px-4 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="h-4 w-4 shrink-0" /> 
                <span>Add to Setlist</span>
              </button>
              {showSetlistDropdown && (
                <div className="absolute right-0 bottom-14 md:bottom-auto md:top-14 w-60 bg-zinc-950 border border-zinc-850 rounded-2xl shadow-2xl z-50 p-2 space-y-1 animate-in fade-in slide-in-from-top-2 duration-150">
                  <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-500 font-bold px-2.5 py-1.5 border-b border-zinc-900">Select Target Setlist</p>
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
                            className={`w-full text-left p-2.5 rounded-xl text-xs flex items-center justify-between gap-2 hover:bg-white/5 transition-all cursor-pointer ${
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
            onClick={() => onEnterStageMode(transposeStep)}
            className="flex-1 sm:flex-initial h-12 bg-amber-500 hover:bg-amber-400 text-black px-5 rounded-2xl text-xs font-extrabold transition-all shadow-md flex items-center justify-center gap-1.5 hover:shadow-[0_0_15px_rgba(245,158,11,0.25)] cursor-pointer active:scale-95"
          >
            <span>Present Fullscreen</span> 
            <ArrowUpRight className="h-4 w-4 stroke-[3] shrink-0" />
          </button>
        </div>

      </div>

      {/* Editing panel state */}
      {isEditing ? (
        <div className="p-5 flex-1 overflow-y-auto space-y-4 bg-[#050506]">
          <h4 className="font-bold text-sm text-white uppercase tracking-wider">Manual Chord Sheet Editor</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="text-xs font-mono text-slate-400">Song Title</label>
              <input
                id="edit-title"
                type="text"
                value={editForm.title}
                onChange={(e) => setEditForm(p => ({ ...p, title: e.target.value }))}
                className="mt-1 w-full text-xs p-2.5 rounded-xl border border-white/10 bg-[#09090B] text-white outline-none focus:border-amber-500 font-sans"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-slate-400">Author</label>
              <input
                id="edit-author"
                type="text"
                value={editForm.author}
                onChange={(e) => setEditForm(p => ({ ...p, author: e.target.value }))}
                className="mt-1 w-full text-xs p-2.5 rounded-xl border border-white/10 bg-[#09090B] text-white outline-none focus:border-amber-500 font-sans"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-mono text-slate-400">Tempo BPM</label>
              <input
                id="edit-bpm"
                type="number"
                value={editForm.bpm}
                onChange={(e) => setEditForm(p => ({ ...p, bpm: parseInt(e.target.value) || 75 }))}
                className="mt-1 w-full text-xs p-2.5 rounded-xl border border-white/10 bg-[#09090B] text-white outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-mono text-slate-400 flex items-center justify-between">
              <span>Sheet Content (Brackets formatted chords for transposing)</span>
              <button
                type="button"
                onClick={() => {
                  if (!editForm.lyrics) return;
                  const formatted = parseTwoLineChords(editForm.lyrics);
                  setEditForm(p => ({ ...p, lyrics: formatted }));
                }}
                className="text-[9px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono font-bold transition-all cursor-pointer"
                title="Convert traditional chords-above-lyrics formatting into bracketed format"
              >
                🪄 Auto-Format Two-Line Chords
              </button>
            </label>
            <textarea
              id="edit-lyrics"
              value={editForm.lyrics}
              onChange={(e) => setEditForm(p => ({ ...p, lyrics: e.target.value }))}
              rows={12}
              className="mt-1 w-full text-xs p-3.5 rounded-xl border border-white/10 bg-[#09090B] text-white font-mono outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 text-xs font-semibold bg-white/5 text-slate-300 hover:bg-white/10 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              className="px-5 py-2 text-xs text-black font-bold bg-amber-500 hover:bg-amber-400 rounded-full flex items-center gap-1 shadow-md cursor-pointer"
            >
              <Save className="h-3.5 w-3.5 stroke-[2.5]" /> Save Changes
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          
          {/* Main Lyrics Area */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Custom Interactive Musician Control Ribbon - Highly Optimized for both Mobile Touch and Desktop Windows */}
            <div className="hidden md:flex p-4 border-b border-white/10 bg-[#050506] flex-col md:flex-row md:items-center md:justify-between gap-4 select-none">

              
              {/* 1. CHORD VISIBILITY TRIGGER */}
              <div className="flex-1 flex items-center justify-between sm:justify-start gap-3">
                <span className="text-xs font-bold font-mono text-zinc-500 uppercase tracking-widest block md:hidden">Display:</span>
                <button
                  onClick={() => {
                    setShowChords(!showChords);
                    // Reset transpose if chords are being turned off
                    if (showChords) setTransposeStep(0);
                  }}
                  className={`flex-1 sm:flex-initial h-12 px-6 rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-2 border cursor-pointer active:scale-95 shadow-lg ${
                    showChords
                      ? 'bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/30 text-amber-400 font-extrabold shadow-[inset_0_1px_0_rgba(245,158,11,0.05),0_4px_12px_rgba(245,158,11,0.06)]'
                      : 'bg-zinc-900 hover:bg-zinc-850 border-zinc-800 text-zinc-400 hover:text-zinc-200 shadow-sm'
                  }`}
                >
                  {showChords ? (
                    <>
                      <Eye className="h-4 w-4 animate-pulse stroke-[2.5]" />
                      <span>Chords & Lyrics Active</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="h-4 w-4 stroke-[2.5]" />
                      <span>Lyrics Only Mode</span>
                    </>
                  )}
                </button>
              </div>

              {/* 2. DYNAMIC CHORD TRANSPOSER (Only active & highlighted if chords are turned on) */}
              <div className="flex-1 flex items-center justify-between sm:justify-start md:justify-center gap-3">
                <span className="text-xs font-bold font-mono text-zinc-500 uppercase tracking-widest block md:hidden">Key Pitch:</span>
                <div className={`flex items-center gap-1.5 p-1 rounded-2xl border transition-all w-full sm:w-auto ${
                  showChords 
                    ? 'bg-zinc-900 border-zinc-800' 
                    : 'bg-zinc-950 border-zinc-900/60 opacity-45 pointer-events-none'
                }`}>
                  <button
                    disabled={!showChords}
                    onClick={() => setTransposeStep(p => p - 1)}
                    className="w-10 h-10 flex items-center justify-center bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl border border-zinc-800 active:scale-90 transition-all cursor-pointer disabled:opacity-50"
                    title="Transpose Down (Flat ♭)"
                  >
                    <Minus className="h-4 w-4 stroke-[2.5]" />
                  </button>

                  <button
                    disabled={!showChords || transposeStep === 0}
                    onClick={() => setTransposeStep(0)}
                    className={`px-4 h-10 flex flex-col items-center justify-center rounded-xl text-[10px] font-mono font-black tracking-wider transition-all min-w-[100px] sm:min-w-[120px] ${
                      transposeStep !== 0
                        ? 'bg-amber-500 text-zinc-950 cursor-pointer scale-105 shadow-md shadow-amber-500/10'
                        : 'bg-zinc-950 text-zinc-505 font-bold'
                    }`}
                    title="Click to reset key pitch"
                  >
                    <span className="text-[9px] uppercase tracking-normal opacity-70">
                      Key: <span className="underline font-bold">{transposeStep === 0 ? (song.key || 'G') : `${song.key || 'G'} → ${transposedKey}`}</span>
                    </span>
                    <span className="font-bold leading-none mt-0.5 text-xs">
                      {transposeStep === 0 ? 'Original' : `${transposeStep > 0 ? '+' : ''}${transposeStep} Shift`}
                    </span>
                  </button>

                  <button
                    disabled={!showChords}
                    onClick={() => setTransposeStep(p => p + 1)}
                    className="w-10 h-10 flex items-center justify-center bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl border border-zinc-800 active:scale-90 transition-all cursor-pointer disabled:opacity-50"
                    title="Transpose Up (Sharp ♯)"
                  >
                    <Plus className="h-4 w-4 stroke-[2.5]" />
                  </button>
                </div>
              </div>

              {/* 3. COMFORTABLE FONT SIZE ADJUSTMENTS */}
              <div className="flex-1 flex items-center justify-between sm:justify-start md:justify-center gap-3">
                <span className="text-xs font-bold font-mono text-zinc-500 uppercase tracking-widest block md:hidden">Size:</span>
                <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-zinc-900 border border-zinc-800 w-full sm:w-auto">
                  <button
                    onClick={() => setFontSize(p => Math.max(12, p - 1))}
                    className="w-10 h-10 flex items-center justify-center bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl border border-zinc-800 active:scale-90 transition-all cursor-pointer"
                    title="Smaller text font size"
                  >
                    <ZoomOut className="h-4 w-4 stroke-[2.5]" />
                  </button>
                  
                  <span className="px-5 text-center font-mono font-black text-xs text-zinc-300 min-w-[70px]">
                    {fontSize}pt
                  </span>
                  
                  <button
                    onClick={() => setFontSize(p => Math.min(28, p + 1))}
                    className="w-10 h-10 flex items-center justify-center bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl border border-zinc-800 active:scale-90 transition-all cursor-pointer"
                    title="Larger text font size"
                  >
                    <ZoomIn className="h-4 w-4 stroke-[2.5]" />
                  </button>
                </div>
              </div>

              {/* 4. AUTO SCROLL CONTROLLER */}
              <div className="flex-1 flex items-center justify-between sm:justify-start md:justify-end gap-3">
                <span className="text-xs font-bold font-mono text-zinc-500 uppercase tracking-widest block md:hidden">Scroll:</span>
                <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-zinc-900 border border-zinc-800 w-full sm:w-auto">
                  <button
                    onClick={() => {
                      if (autoScrollSpeed === 0) setAutoScrollSpeed(2);
                      setScrolling(!scrolling);
                    }}
                    className={`w-10 h-10 flex items-center justify-center rounded-xl border transition-all active:scale-90 cursor-pointer ${
                      scrolling && autoScrollSpeed > 0
                        ? 'bg-amber-500 border-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.3)] font-black'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                    title={scrolling && autoScrollSpeed > 0 ? 'Pause scroll' : 'Start auto-scroll'}
                  >
                    {scrolling && autoScrollSpeed > 0 ? <Pause className="h-4 w-4 stroke-[2.5]" /> : <Play className="h-4 w-4 stroke-[2.5]" />}
                  </button>
                  
                  {scrolling && (
                    <select
                      value={autoScrollSpeed}
                      onChange={(e) => setAutoScrollSpeed(Number(e.target.value))}
                      className="bg-zinc-950 text-xs font-bold font-mono h-10 px-2 rounded-xl text-amber-500 border border-zinc-800 focus:outline-none cursor-pointer"
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
              className="flex-1 overflow-y-auto md:max-h-[70vh] p-6 md:p-8 space-y-4 bg-[#050506] relative font-serif text-slate-200 selection:bg-amber-500/20"
              style={{ fontSize: `${fontSize}px` }}
            >
              {/* Dynamic Metadata Block with custom visual separator */}
              <div className="mb-6 select-none font-sans text-left">
                <span className="text-xs font-bold font-mono text-amber-500 tracking-wider uppercase block mb-1">
                  {song.category || 'Uploaded General'}
                </span>
                <h3 className="text-2xl md:text-3xl font-black text-white tracking-tight">{song.title}</h3>
                <p className="text-xs text-slate-400 mt-1.5 font-medium">
                  Author/Credits: <span className="text-slate-300 font-semibold">{song.author || 'Traditional'}</span>
                </p>
                <div className="border-t border-dashed border-zinc-800/80 my-4 pt-4 flex flex-wrap items-center justify-between select-none pointer-events-none gap-2">
                  <span className="text-[10px] font-mono tracking-wider text-zinc-550 uppercase flex items-center gap-1.5">
                    Tempo: <span className="text-amber-500 font-bold">{song.bpm || 72} BPM</span>
                  </span>
                </div>
              </div>

              {sections.length > 0 ? (
                sections.map((section, idx) => {
                  const isChorus = section.toLowerCase().startsWith('chorus:');
                  const lines = section.split('\n');

                  return (
                    <div
                      key={idx}
                      className={`mb-6 p-2 rounded-lg transition-all ${
                        isChorus
                          ? 'border-l-4 border-amber-500 bg-amber-500/5 pl-4'
                          : ''
                      }`}
                    >
                      {lines.map((line, lIdx) => {
                        // Superscript rendering logic for active musician chords
                        if (showChords && line.includes('[')) {
                          const chordLine: { chord: string; index: number }[] = [];
                          let cleanLine = '';
                          let charIndex = 0;

                          const segments = line.split(/(\[[^[\]]+\])/);
                          segments.forEach((seg) => {
                            if (seg.startsWith('[') && seg.endsWith(']')) {
                              const chord = seg.slice(1, -1);
                              chordLine.push({ chord, index: charIndex });
                            } else {
                              cleanLine += seg;
                              charIndex += seg.length;
                            }
                          });

                          return (
                            <div key={lIdx} className="mb-2.5 leading-tight">
                              {/* Superscript chords line */}
                              <div className="h-5.5 font-mono text-[10px] font-bold text-amber-400 select-none relative whitespace-pre flex items-center mb-1">
                                {chordLine.map((c, cIdx) => {
                                  const prevOffset = cIdx > 0 ? chordLine[cIdx - 1].index : 0;
                                  const spacing = ' '.repeat(Math.max(0, c.index - prevOffset - (cIdx > 0 ? chordLine[cIdx - 1].chord.length : 0)));
                                  return (
                                    <span key={cIdx}>
                                      {spacing}
                                      <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:text-amber-300 hover:bg-amber-500/20 px-1 py-0.5 rounded-md font-extrabold mx-0.5 shadow-sm transition-all cursor-pointer">
                                        {c.chord}
                                      </span>
                                    </span>
                                  );
                                })}
                              </div>
                              {/* Lyrics Line */}
                              <div className="text-slate-200 font-medium tracking-wide">
                                {cleanLine || ' '}
                              </div>
                            </div>
                          );
                        }

                        // Normal lyric block
                        return (
                          <div
                            key={lIdx}
                            className={`leading-relaxed ${
                              line.endsWith(':')
                                ? 'font-bold text-amber-500 mt-2 text-[11px] uppercase tracking-widest'
                                : 'text-slate-200 font-medium'
                            }`}
                            style={{ fontSize: `${line.endsWith(':') ? '11px' : 'inherit'}` }}
                          >
                            {line}
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              ) : (
                <p className="text-slate-500 py-10 text-center italic">Lyrics Empty</p>
              )}
              
              {/* Bottom scroll padding spacer */}
              <div className="h-24" />
            </div>

            {/* Bottom Worship Setlist Navigation Bar */}
            {worshipSetList.length > 0 && setlistIndex >= 0 ? (
              <div className="p-4 border-t border-zinc-800/80 bg-zinc-950 flex flex-col md:flex-row items-center justify-between gap-4 select-none relative">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-amber-500/10 to-transparent"></div>
                
                {/* Progress metadata */}
                <div className="flex items-center gap-2 font-mono text-[10px] md:text-xs text-zinc-400">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_#f59e0b]" />
                  <span>SETLIST STATUS: <span className="font-black text-amber-500 font-sans">SONG {setlistIndex + 1} OF {worshipSetList.length}</span></span>
                </div>
                
                {/* Previous & Next controls */}
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto md:justify-end">
                  {hasPrevSong && (
                    <button
                      onClick={() => onSelectSong(prevSongId!, worshipSetList)}
                      className="w-full sm:w-auto h-12 px-5 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-850 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shadow-md shrink-0"
                      title={`Previous: ${prevSongTitle}`}
                    >
                      <span>← PREV: {prevSongTitle}</span>
                    </button>
                  )}

                  {hasNextSong ? (
                    <button
                      onClick={() => onSelectSong(nextSongId!, worshipSetList)}
                      className="w-full sm:w-auto h-12 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shadow-[0_4px_15px_rgba(245,158,11,0.2)]"
                      title={`Next up: ${nextSongTitle}`}
                    >
                      <span className="font-extrabold">NEXT: {nextSongTitle} →</span>
                    </button>
                  ) : (
                    <div className="w-full sm:w-auto h-12 px-5 rounded-xl border border-zinc-800/60 bg-zinc-900/30 text-zinc-500 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                      <span>🎉 LAST SONG IN SETLIST</span>
                    </div>
                  )}

                  {currentRole === 'choir' && (
                    <button
                      onClick={handleSuggestThisSong}
                      className="w-full sm:w-auto bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/35 text-amber-400 text-xs font-mono uppercase tracking-wider font-bold px-4 h-12 rounded-xl cursor-pointer flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                      📝 Suggest Set
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Simple general catalog bottom bar */
              <div className="p-4 border-t border-zinc-800/80 bg-zinc-950 flex flex-col sm:flex-row items-center justify-between gap-4 select-none relative">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase text-zinc-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
                  <span>General Catalog Explorer Mode</span>
                </div>
                
                <div className="flex items-center gap-3">
                  {currentRole === 'choir' && (
                    <button
                      onClick={handleSuggestThisSong}
                      className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-black text-xs font-mono uppercase tracking-wider font-black px-5 py-3 rounded-xl cursor-pointer flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
                    >
                      📝 Suggest Set
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* Related / Suggested Songs sidebar */}
          {relatedSongs.length > 0 && (
            <div className="w-full md:w-64 border-t md:border-t-0 md:border-l border-white/10 p-5 bg-[#050506] flex flex-col min-h-0 font-sans select-none">
              <h5 className="font-bold text-xs text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-white/10 pb-2">
                <Music className="h-3.5 w-3.5 text-amber-500 animate-pulse" /> Related Songs
              </h5>
              <p className="text-[10px] text-slate-500 mt-1 pb-1">
                Suggested based on category or name matches:
              </p>
              
              <div className="space-y-2.5 mt-3 overflow-y-auto pr-1 flex-1">
                {relatedSongs.map((meta) => (
                  <button
                    key={meta.id}
                    onClick={() => onSelectSong(meta.id)}
                    className="w-full text-left p-3 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.06] hover:border-amber-500/30 transition-all group flex flex-col gap-1 cursor-pointer"
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
          className="fixed bottom-20 right-4 z-40 bg-amber-500 hover:bg-amber-400 active:scale-95 text-black p-3.5 rounded-full shadow-2xl md:hidden active-touch flex items-center justify-center border border-amber-400/20"
          title="Open Musician controls"
        >
          <Sliders className="h-5 w-5 stroke-[2.5]" />
        </button>
      )}

      {/* Slide-up Musician Control Drawer */}
      {showMobileDrawer && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs z-50 flex items-end justify-center md:hidden" onClick={() => setShowMobileDrawer(false)}>
          <div 
            className="bg-[#09090b] border-t border-zinc-800 rounded-t-3xl w-full max-w-md p-5 space-y-6 shadow-2xl animate-slideUp select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Handle */}
            <div className="flex flex-col items-center gap-1.5 cursor-pointer pb-2" onClick={() => setShowMobileDrawer(false)}>
              <div className="w-12 h-1 bg-zinc-800 rounded-full"></div>
              <span className="text-[10px] font-mono font-bold tracking-widest text-zinc-500 uppercase mt-1">Musician Deck Console</span>
            </div>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {/* Display Options */}
              <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                <div className="text-left">
                  <span className="text-xs font-bold text-white block">Chord Sheets</span>
                  <span className="text-[10px] text-zinc-550">Show bracketed pitch chords inline</span>
                </div>
                <button
                  onClick={() => {
                    setShowChords(!showChords);
                    if (showChords) setTransposeStep(0);
                  }}
                  className={`h-10 px-4 rounded-xl text-xs font-bold transition-all active-touch cursor-pointer ${
                    showChords ? 'bg-amber-500 text-black' : 'bg-zinc-900 text-zinc-400 border border-zinc-850'
                  }`}
                >
                  {showChords ? 'ACTIVE' : 'MUTED'}
                </button>
              </div>

              {/* Transposer Shifts */}
              <div className={`space-y-2.5 border-b border-zinc-900 pb-4 ${!showChords ? 'opacity-40 pointer-events-none' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <span className="text-xs font-bold text-white block">Key Pitch shift</span>
                    <span className="text-[10px] text-zinc-550">
                      {transposeStep === 0 ? `Current Key: ${song?.key || 'G'}` : `Key: ${song?.key || 'G'} → ${transposedKey}`}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 uppercase">
                    {transposeStep === 0 ? 'Original' : `${transposeStep > 0 ? '+' : ''}${transposeStep} Shift`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setTransposeStep(p => p - 1)}
                    className="flex-1 h-11 bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-zinc-200 rounded-xl active-touch font-mono font-bold cursor-pointer"
                  >
                    ♭ Flat
                  </button>
                  <button
                    onClick={() => setTransposeStep(0)}
                    disabled={transposeStep === 0}
                    className="flex-1 h-11 bg-zinc-950 border border-zinc-850 text-zinc-400 hover:text-white rounded-xl active-touch text-xs font-mono font-bold disabled:opacity-30 cursor-pointer"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => setTransposeStep(p => p + 1)}
                    className="flex-1 h-11 bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-zinc-200 rounded-xl active-touch font-mono font-bold cursor-pointer"
                  >
                    ♯ Sharp
                  </button>
                </div>
              </div>

              {/* Font scaling */}
              <div className="space-y-2.5 border-b border-zinc-900 pb-4">
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
                    className="flex-1 h-10 bg-zinc-900 border border-zinc-850 text-zinc-200 rounded-xl active-touch font-bold cursor-pointer"
                  >
                    Smaller Text
                  </button>
                  <button
                    onClick={() => setFontSize(p => Math.min(28, p + 2))}
                    className="flex-1 h-10 bg-zinc-900 border border-zinc-850 text-zinc-200 rounded-xl active-touch font-bold cursor-pointer"
                  >
                    Larger Text
                  </button>
                </div>
              </div>

              {/* Auto Scroll Controls */}
              <div className="space-y-2.5 border-b border-zinc-900 pb-4">
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
                    className={`flex-1 h-11 border rounded-xl active-touch text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      scrolling && autoScrollSpeed > 0
                        ? 'bg-amber-500 border-amber-500 text-black font-extrabold'
                        : 'bg-zinc-900 border-zinc-850 text-zinc-300'
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
                      className="bg-zinc-900 text-xs font-bold h-11 px-3.5 rounded-xl text-[#f59e0b] border border-zinc-850 active-touch"
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

              {/* Integrated Visual Metronome Module */}
              <div className="pt-2">
                <Metronome initialBpm={song.bpm || 72} compact={true} />
              </div>
            </div>

            {/* Confirm button */}
            <button
              onClick={() => setShowMobileDrawer(false)}
              className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-2xl active-touch transition-all shadow-md cursor-pointer"
            >
              DONE / BACK TO SHEET
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

