import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  X, Calendar as CalendarIcon, Clock, Plus, Trash2, ChevronLeft, ChevronRight, 
  Music, BookOpen, Layers, Sparkles, Check, ArrowRight, ArrowUpRight, Search, ListPlus, MoveUp, MoveDown, ZoomIn, ZoomOut, Play, Pause,
  Upload, GripVertical, Maximize2
} from 'lucide-react';
import { WorshipEvent, UserRole, Song } from '../types';
import { SongMetadata, getSongById, getLocalWorshipEvents, saveWorshipEvent, deleteWorshipEvent } from '../lib/db';
import { transposeLyrics, stripChords } from '../utils/chordTransposer';

interface Stanza {
  label: string;
  text: string;
  isChorus: boolean;
}

function parseLyricsToStanzas(lyrics: string): Stanza[] {
  if (!lyrics) return [];
  
  let cleanLyrics = lyrics.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  
  // Split by double newlines or multiple blank lines
  const sections = cleanLyrics.split(/\n\s*\n+/).filter(Boolean);
  
  // Filter out any metadata blocks like Title, Key, BPM, etc.
  const lyricsSections = sections.filter(section => {
    const trimmed = section.trim().toLowerCase();
    return !trimmed.startsWith('title:') && 
           !trimmed.startsWith('title :') &&
           !trimmed.startsWith('key:') &&
           !trimmed.startsWith('key :') &&
           !trimmed.startsWith('bpm:') &&
           !trimmed.startsWith('bpm :');
  });

  return lyricsSections.map((section, idx) => {
    let text = section.trim();
    let label = `Slide ${idx + 1}`;
    let isChorus = false;

    // Check if starts with a number like "1.", "2 ", "3)"
    const numMatch = text.match(/^(\d+)[\s\.\)]+(.*)/s);
    
    // Check if it's explicitly labeled as Chorus or Refrain or Tamil equivalents
    const isExplicitChorus = /^(chorus|refrain|பல்லவி|pallavi)\b/i.test(text);

    if (numMatch) {
      text = numMatch[2].trim();
    } else if (isExplicitChorus) {
      isChorus = true;
      const chorusLabelMatch = text.match(/^(chorus|refrain|பல்லவி|pallavi)[:\s-]*(.*)/is);
      if (chorusLabelMatch) {
        text = chorusLabelMatch[2].trim();
      }
      label = 'Chorus';
    }

    return {
      label,
      text,
      isChorus
    };
  });
}

interface WorshipEventsProps {
  songs: SongMetadata[];
  events: WorshipEvent[];
  onEventsChange: () => void;
  onClose: () => void;
  onSelectSong: (id: string, setlistSongIds?: string[]) => void;
  selectedSongId: string | null;
  currentRole: UserRole;
  onOpenAddModal?: (eventId: string) => void;
  onOpenUploadModal?: (eventId: string) => void;
}

export default function WorshipEvents({
  songs,
  events,
  onEventsChange,
  onClose,
  onSelectSong,
  selectedSongId,
  currentRole,
  onOpenAddModal,
  onOpenUploadModal
}: WorshipEventsProps) {



  // Calendar Month Navigation State
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Modal / Creator triggers
  const [showCreateDialog, setShowCreateDialog] = useState<boolean>(false);
  const [createTitle, setCreateTitle] = useState<string>('');
  const [createDate, setCreateDate] = useState<string>(selectedDateStr);
  const [createTime, setCreateTime] = useState<string>('09:00');
  const [createDesc, setCreateDesc] = useState<string>('');
  const [createSongIds, setCreateSongIds] = useState<string[]>([]);

  // Active viewing/editing event on agenda for desktop
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  // Mobile navigation stages
  // 'calendar' -> Full month grid page
  // 'eventDetail' -> Full page detail of clicked date & setlist management
  // 'lyrics' -> Full screen immersive responsive chord reader
  const [mobileStage, setMobileStage] = useState<'calendar' | 'eventDetail' | 'lyrics'>('calendar');
  const [activeLyricsSong, setActiveLyricsSong] = useState<Song | null>(null);
  const [mobileFontSize, setMobileFontSize] = useState<number>(18);
  const [mobileScrolling, setMobileScrolling] = useState<boolean>(false);
  const [mobileScrollSpeed, setMobileScrollSpeed] = useState<number>(2);
  const [mobileShowChords, setMobileShowChords] = useState<boolean>(false);
  const [mobileTransposeStep, setMobileTransposeStep] = useState<number>(0);
  const [mobileViewMode, setMobileViewMode] = useState<'calendar' | 'timeline'>('calendar');

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);

  // Full-screen Presentation Console state
  const [showLiveConsole, setShowLiveConsole] = useState<boolean>(false);
  const [liveSongId, setLiveSongId] = useState<string | null>(null);
  const [liveSong, setLiveSong] = useState<Song | null>(null);
  const [liveFontSize, setLiveFontSize] = useState<number>(24);
  const [liveShowChords, setLiveShowChords] = useState<boolean>(false);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const touchStartTime = useRef<number>(0);
  const isDragging = useRef<boolean>(false);
  const isScrolling = useRef<boolean>(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const [liveSetlistSongIds, setLiveSetlistSongIds] = useState<string[]>([]);
  const [activeStanzaIndex, setActiveStanzaIndex] = useState<number>(0);
  const targetSlideDirectionRef = useRef<'first' | 'last'>('first');

  useEffect(() => {
    if (!liveSongId) {
      setLiveSong(null);
      return;
    }
    const loadSong = async () => {
      try {
        const fullSong = await getSongById(liveSongId);
        if (fullSong) {
          setLiveSong(fullSong);
          const stanzas = parseLyricsToStanzas(fullSong.lyrics);
          if (targetSlideDirectionRef.current === 'last' && stanzas.length > 0) {
            setActiveStanzaIndex(stanzas.length - 1);
          } else {
            setActiveStanzaIndex(0);
          }
        }
      } catch (err) {
        console.error('Failed to load song for live presentation:', err);
      }
    };
    loadSong();
  }, [liveSongId]);

  // Wake lock ref
  const wakeLockRef = useRef<any>(null);

  useEffect(() => {
    async function requestWakeLock() {
      if ('wakeLock' in navigator) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } catch (err) {
          console.warn('Failed to obtain screen wake lock:', err);
        }
      }
    }

    function releaseWakeLock() {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().then(() => {
          wakeLockRef.current = null;
        }).catch((err: any) => {
          console.error('Failed to release wake lock:', err);
        });
      }
    }

    if (showLiveConsole && liveSong) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    return () => {
      releaseWakeLock();
    };
  }, [showLiveConsole, liveSong]);

  const liveObserverRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (!showLiveConsole || !liveSong) {
      if (liveObserverRef.current) {
        liveObserverRef.current.disconnect();
        liveObserverRef.current = null;
      }
      return;
    }

    const timer = setTimeout(() => {
      if (liveObserverRef.current) {
        liveObserverRef.current.disconnect();
      }

      const options = {
        root: null,
        rootMargin: '-30% 0px -30% 0px',
        threshold: 0.1
      };

      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            const match = id.match(/live-stanza-(\d+)/);
            if (match) {
              const idx = parseInt(match[1], 10);
              setActiveStanzaIndex(idx);
            }
          }
        });
      }, options);

      liveObserverRef.current = observer;

      const elements = document.querySelectorAll('.live-stanza-item');
      elements.forEach((el) => observer.observe(el));
    }, 150);

    return () => {
      clearTimeout(timer);
      if (liveObserverRef.current) {
        liveObserverRef.current.disconnect();
        liveObserverRef.current = null;
      }
    };
  }, [showLiveConsole, liveSong, liveSongId]);

  const handleNextSlide = () => {
    if (!liveSong) return;
    const stanzas = parseLyricsToStanzas(liveSong.lyrics);
    if (stanzas.length === 0) return;

    if (activeStanzaIndex >= stanzas.length - 1) {
      const curSongIdx = liveSetlistSongIds.indexOf(liveSongId || '');
      if (curSongIdx !== -1 && curSongIdx < liveSetlistSongIds.length - 1) {
        targetSlideDirectionRef.current = 'first';
        setLiveSongId(liveSetlistSongIds[curSongIdx + 1]);
      }
    } else {
      setActiveStanzaIndex(prev => prev + 1);
    }
  };

  const handlePrevSlide = () => {
    if (!liveSong) return;
    const stanzas = parseLyricsToStanzas(liveSong.lyrics);
    if (stanzas.length === 0) return;

    if (activeStanzaIndex <= 0) {
      const curSongIdx = liveSetlistSongIds.indexOf(liveSongId || '');
      if (curSongIdx > 0) {
        targetSlideDirectionRef.current = 'last';
        setLiveSongId(liveSetlistSongIds[curSongIdx - 1]);
      }
    } else {
      setActiveStanzaIndex(prev => prev - 1);
    }
  };

  useEffect(() => {
    if (!showLiveConsole || !liveSong) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowLiveConsole(false);
        setLiveSongId(null);
        return;
      }

      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleNextSlide();
      } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        e.preventDefault();
        handlePrevSlide();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showLiveConsole, liveSong, liveSongId, liveSetlistSongIds, activeStanzaIndex]);

  const mobileScrollTimerRef = useRef<number | null>(null);

  // Active event on the selected date
  const activeEvent = useMemo(() => {
    return events.find(e => e.date === selectedDateStr) || null;
  }, [events, selectedDateStr]);

  // Auto Scroll logic inside active mini stage lyrics canvas
  useEffect(() => {
    if (mobileScrolling && mobileScrollSpeed > 0 && mobileStage === 'lyrics' && activeLyricsSong) {
      const scrollContainer = document.getElementById('mobile-stage-lyrics-canvas');
      if (scrollContainer) {
        const interval = Math.max(15, 120 - (mobileScrollSpeed * 18));
        mobileScrollTimerRef.current = window.setInterval(() => {
          scrollContainer.scrollBy({ top: 1, behavior: 'auto' });
        }, interval);
      }
    } else {
      if (mobileScrollTimerRef.current) {
        clearInterval(mobileScrollTimerRef.current);
      }
    }

    return () => {
      if (mobileScrollTimerRef.current) {
        clearInterval(mobileScrollTimerRef.current);
      }
    };
  }, [mobileScrolling, mobileScrollSpeed, mobileStage, activeLyricsSong]);

  // Click triggers on dates for Mobile Navigation Flow
  const handleDateClick = (dateStr: string) => {
    setSelectedDateStr(dateStr);
    setMobileStage('eventDetail');
  };

  const handleSongClick = async (songMetadata: SongMetadata) => {
    try {
      const fullSong = await getSongById(songMetadata.id);
      if (fullSong) {
        setActiveLyricsSong(fullSong);
        setMobileTransposeStep(0);
        onSelectSong(songMetadata.id, activeEvent ? (activeEvent.songIds || []) : []); // Triggers selection globally
        setMobileStage('lyrics');
      }
    } catch (err) {
      console.error('Failed loading active lyrics song details:', err);
    }
  };

  // Month navigation helpers
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  // Build Month Calendar Days Matrix
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // First day of current month offset
    const firstDayIndex = new Date(year, month, 1).getDay();
    // Count days in month
    const totalDays = new Date(year, month + 1, 0).getDate();
    // Count days in previous month
    const prevTotalDays = new Date(year, month, 0).getDate();
    
    const days: { dateStr: string; dayNum: number; isCurrentMonth: boolean; hasEvent: boolean }[] = [];
    
    // Fill previous month trailing days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevTotalDays - i;
      const d = new Date(year, month - 1, dayNum);
      const str = d.toISOString().split('T')[0];
      days.push({
        dateStr: str,
        dayNum,
        isCurrentMonth: false,
        hasEvent: events.some(e => e.date === str)
      });
    }
    
    // Fill current month days
    for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
      const d = new Date(year, month, dayNum);
      const offset = d.getTimezoneOffset();
      const localD = new Date(d.getTime() - (offset * 60 * 1000));
      const str = localD.toISOString().split('T')[0];
      days.push({
        dateStr: str,
        dayNum,
        isCurrentMonth: true,
        hasEvent: events.some(e => e.date === str)
      });
    }
    
    // Fill next month leading days to complete 42 grids
    const remaining = 42 - days.length;
    for (let dayNum = 1; dayNum <= remaining; dayNum++) {
      const d = new Date(year, month + 1, dayNum);
      const str = d.toISOString().split('T')[0];
      days.push({
        dateStr: str,
        dayNum,
        isCurrentMonth: false,
        hasEvent: events.some(e => e.date === str)
      });
    }
    
    return days;
  }, [currentDate, events]);

  // Filtered list of events corresponding to selected calendar date (desktop)
  const dateEvents = useMemo(() => {
    return events.filter(e => e.date === selectedDateStr);
  }, [events, selectedDateStr]);

  const [songSearchInput, setSongSearchInput] = useState<string>('');
  const [songSearchQuery, setSongSearchQuery] = useState<string>('');

  // Debounce search input by 150ms to prevent lag when typing
  useEffect(() => {
    const handler = setTimeout(() => {
      setSongSearchQuery(songSearchInput);
    }, 150);
    return () => clearTimeout(handler);
  }, [songSearchInput]);

  // Song catalogs sorted alphabetically by title and optionally filtered by search query
  const filteredSongs = useMemo(() => {
    let sorted = [...songs].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    if (songSearchQuery.trim()) {
      const q = songSearchQuery.toLowerCase();
      sorted = sorted.filter(s => 
        (s.title || '').toLowerCase().includes(q) || 
        (s.author && s.author.toLowerCase().includes(q))
      );
    }
    return sorted;
  }, [songs, songSearchQuery]);

  const handleCreateEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTitle.trim()) {
      alert('Setlist title is required.');
      return;
    }

    const newEvent: WorshipEvent = {
      id: `event-${Date.now()}`,
      title: createTitle,
      date: createDate,
      time: createTime,
      description: createDesc,
      songIds: createSongIds
    };

    try {
      await saveWorshipEvent(newEvent);
    } catch (err) {
      console.warn('Setlist cloud sync warning:', err);
    } finally {
      onEventsChange();
      // Reset forms
      setCreateTitle('');
      setCreateDesc('');
      setCreateSongIds([]);
      setShowCreateDialog(false);
    }
  };

  const handleDeleteEvent = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this setlist permanently?')) {
      try {
        await deleteWorshipEvent(id);
      } catch (err) {
        console.warn('Setlist cloud delete warning:', err);
      } finally {
        onEventsChange();
        if (editingEventId === id) setEditingEventId(null);
      }
    }
  };

  // Manage songs inside an event live
  const toggleSongInEvent = async (eventId: string, songId: string) => {
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;

    const songIds = ev.songIds || [];
    const exists = songIds.includes(songId);
    const updatedIds = exists 
      ? songIds.filter(id => id !== songId) 
      : [...songIds, songId];
      
    const updatedEv = { ...ev, songIds: updatedIds };

    try {
      await saveWorshipEvent(updatedEv);
    } catch (err) {
      console.error('Failed to toggle song in event:', err);
    } finally {
      onEventsChange();
    }
  };

  const moveSongInEvent = async (eventId: string, index: number, direction: 'up' | 'down') => {
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;

    const songIds = ev.songIds || [];
    const list = [...songIds];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;
    
    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;
    
    const updatedEv = { ...ev, songIds: list };

    try {
      await saveWorshipEvent(updatedEv);
    } catch (err) {
      console.error('Failed to reorder song in event:', err);
    } finally {
      onEventsChange();
    }
  };

  const handleDragStart = (e: React.DragEvent, eventId: string, index: number) => {
    setDraggedIndex(index);
    setDraggedEventId(eventId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, eventId: string, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedEventId !== eventId || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDraggedEventId(null);
      return;
    }

    const ev = events.find(event => event.id === eventId);
    if (!ev) return;

    const songIds = ev.songIds || [];
    const list = [...songIds];
    
    // Reorder
    const [removed] = list.splice(draggedIndex, 1);
    list.splice(targetIndex, 0, removed);

    const updatedEv = { ...ev, songIds: list };
    try {
      await saveWorshipEvent(updatedEv);
    } catch (err) {
      console.error('Failed to reorder song in event via drag-and-drop:', err);
    } finally {
      setDraggedIndex(null);
      setDraggedEventId(null);
      onEventsChange();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
    isDragging.current = false;
    isScrolling.current = false;

    if (trackRef.current) {
      trackRef.current.style.transition = 'none';
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartX.current;
    const diffY = currentY - touchStartY.current;

    // Detect if swipe is horizontal vs scroll vertical
    if (!isDragging.current && !isScrolling.current) {
      if (Math.abs(diffX) > 10 && Math.abs(diffX) > Math.abs(diffY)) {
        isDragging.current = true;
        if (trackRef.current) {
          trackRef.current.style.transition = 'none';
        }
      } else if (Math.abs(diffY) > 10 && Math.abs(diffY) > Math.abs(diffX)) {
        isScrolling.current = true;
      }
    }

    if (isDragging.current) {
      if (e.cancelable) e.preventDefault();
      
      const stanzasCount = liveSong ? parseLyricsToStanzas(liveSong.lyrics).length : 0;
      const curIndex = liveSongId && liveSetlistSongIds ? liveSetlistSongIds.indexOf(liveSongId) : -1;
      const isFirstSlideOfFirstSong = activeStanzaIndex === 0 && curIndex <= 0;
      const isLastSlideOfLastSong = activeStanzaIndex === stanzasCount - 1 && curIndex >= liveSetlistSongIds.length - 1;

      let offset = diffX;
      if ((isFirstSlideOfFirstSong && diffX > 0) || (isLastSlideOfLastSong && diffX < 0)) {
        offset = diffX * 0.25; // added drag resistance
      }

      // Direct DOM update bypasses React re-render, ensuring 60fps/120fps smooth movement
      if (trackRef.current) {
        trackRef.current.style.transform = `translateX(calc(-${activeStanzaIndex * 100}% + ${offset}px))`;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const diffX = endX - touchStartX.current;
    const diffY = endY - touchStartY.current;
    const duration = Date.now() - touchStartTime.current;

    if (!isDragging.current && !isScrolling.current && Math.abs(diffX) < 15 && Math.abs(diffY) < 15 && duration < 300) {
      // Tap detected! Immediately switch slides to skip 300ms mobile tap delay
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const relativeX = endX - rect.left;
      const isRightHalf = relativeX > rect.width / 2;

      if (isRightHalf) {
        handleNextSlide();
      } else {
        handlePrevSlide();
      }
    } else if (isDragging.current) {
      const threshold = 60; // swipe threshold in pixels
      if (diffX < -threshold) {
        handleNextSlide();
      } else if (diffX > threshold) {
        handlePrevSlide();
      } else {
        // Snap back directly in DOM
        if (trackRef.current) {
          trackRef.current.style.transition = 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1)';
          trackRef.current.style.transform = `translateX(-${activeStanzaIndex * 100}%)`;
        }
      }
    }

    isDragging.current = false;
    isScrolling.current = false;
  };

  const renderStanzaText = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, lIdx) => {
      if (liveShowChords && line.includes('[')) {
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
          <div key={lIdx} className="mb-4 leading-relaxed flex flex-col items-center select-none">
            {/* Chords Line */}
            <div className="h-5 font-mono text-xs font-bold text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.25)] select-none relative whitespace-pre flex">
              {chordLine.map((c, cIdx) => {
                const prevOffset = cIdx > 0 ? chordLine[cIdx - 1].index : 0;
                const spacing = ' '.repeat(Math.max(0, c.index - prevOffset - (cIdx > 0 ? chordLine[cIdx - 1].chord.length : 0)));
                return (
                  <span key={cIdx}>
                    {spacing}
                    <span>{c.chord}</span>
                  </span>
                );
              })}
            </div>
            {/* Lyrics Text Line */}
            <div className="text-zinc-100 text-center font-bold tracking-wide">
              {cleanLine || ' '}
            </div>
          </div>
        );
      } else {
        const cleanLine = stripChords(line);
        return (
          <div key={lIdx} className="py-1 text-zinc-150 text-center select-none font-bold tracking-wide">
            {cleanLine || ' '}
          </div>
        );
      }
    });
  };

  const renderLiveConsole = () => {
    if (!showLiveConsole || !liveSong) return null;

    const isSongLoaded = liveSong && liveSong.id === liveSongId;
    if (!isSongLoaded) {
      return (
        <div className="fixed inset-0 bg-[#050505] text-white z-50 flex flex-col items-center justify-center font-sans">
          <div className="animate-pulse flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full border-2 border-amber-500/20 border-t-amber-500 animate-spin" />
            <span className="text-zinc-500 text-xs font-mono tracking-widest uppercase">Loading Song...</span>
          </div>
        </div>
      );
    }

    const stanzas = parseLyricsToStanzas(liveSong.lyrics);
    const curIndex = liveSongId && liveSetlistSongIds ? liveSetlistSongIds.indexOf(liveSongId) : -1;
    const hasPrev = curIndex > 0;
    const hasNext = liveSetlistSongIds && curIndex < liveSetlistSongIds.length - 1;

    return (
      <div 
        className="fixed inset-0 bg-[#050505] text-white z-50 flex flex-col font-sans select-none animate-in fade-in duration-150"
      >
        {/* Top Navbar */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#0c0c0e] border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button 
              onClick={() => {
                setShowLiveConsole(false);
                setLiveSongId(null);
              }}
              className="p-2 -ml-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-full cursor-pointer transition-colors"
              title="Exit Presenter Portal"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <div className="truncate">
              <h3 className="text-sm font-black tracking-tight text-white truncate">
                {liveSong.title}
              </h3>
              {liveSong.author && (
                <span className="text-[10px] text-zinc-500 font-mono block truncate">
                  {liveSong.author}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3 shrink-0">
            {liveSetlistSongIds.length > 0 && curIndex !== -1 && (
              <span className="text-[10px] font-mono font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full uppercase">
                Song {curIndex + 1} of {liveSetlistSongIds.length}
              </span>
            )}
            <button 
              onClick={() => {
                setShowLiveConsole(false);
                setLiveSongId(null);
              }}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-full cursor-pointer transition-colors"
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Stanza Pills Quick Jump */}
        {stanzas.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto px-4 py-2 bg-[#08080a] border-b border-white/5 scrollbar-none shrink-0">
            {stanzas.map((stanza, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setActiveStanzaIndex(idx);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-mono font-bold shrink-0 transition-all cursor-pointer ${
                  activeStanzaIndex === idx
                    ? 'bg-amber-500 text-black border border-amber-400 font-black'
                    : stanza.isChorus
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'
                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:bg-zinc-850'
                }`}
              >
                {stanza.label}
              </button>
            ))}
          </div>
        )}

        {/* Main Lyrics Slide Canvas */}
        <div 
          key={liveSongId}
          className="flex-1 overflow-hidden relative select-none w-full h-full animate-in fade-in duration-200"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={(e) => {
            // Ignore clicks if user was dragging/swiping
            if (isDragging.current) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const isRightHalf = x > rect.width / 2;
            if (isRightHalf) {
              handleNextSlide();
            } else {
              handlePrevSlide();
            }
          }}
        >
          {stanzas.length > 0 ? (
            <div 
              ref={trackRef}
              className="flex w-full h-full will-change-transform"
              style={{ 
                transform: `translateX(-${activeStanzaIndex * 100}%)`,
                transition: 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            >
              {stanzas.map((stanza, idx) => (
                <div 
                  key={idx}
                  className="w-full h-full shrink-0 overflow-y-auto scrollbar-none flex flex-col justify-start"
                  style={{ contentVisibility: 'auto' }}
                >
                  <div className="w-full min-h-full flex flex-col justify-center items-center px-6 py-10">
                    <div className="w-full max-w-4xl text-center space-y-6 select-none my-auto">
                      <div className="mb-4">
                        <span className={`text-[10px] font-mono font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                          stanza.isChorus 
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 font-black' 
                            : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                        }`}>
                          {stanza.label}
                        </span>
                      </div>

                      <div 
                        className="whitespace-pre-line leading-relaxed font-black tracking-wide select-none"
                        style={{ fontSize: `${liveFontSize}px` }}
                      >
                        {renderStanzaText(stanza.text)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center w-full h-full text-zinc-500 italic text-sm">
              No lyrics parsed. Double check if this song has text content configured.
            </div>
          )}
        </div>

        {/* Bottom Control Bar */}
        <div className="px-4 py-3 bg-[#0c0c0e] border-t border-white/5 flex items-center justify-between shrink-0">
          {/* Prev Song */}
          <button
            disabled={!hasPrev}
            onClick={() => {
              if (hasPrev) {
                setLiveSongId(liveSetlistSongIds[curIndex - 1]);
              }
            }}
            className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-20 text-zinc-300 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors border border-zinc-800 cursor-pointer disabled:cursor-not-allowed select-none animate-in fade-in"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Prev Song</span>
          </button>

          {/* Middle controls: Font & Chords */}
          <div className="flex items-center gap-4">
            {/* Font Size Zoom */}
            <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1.5 rounded-full border border-zinc-900 select-none">
              <button
                onClick={() => setLiveFontSize(prev => Math.max(16, prev - 2))}
                className="p-1 text-zinc-400 hover:text-white rounded-full cursor-pointer transition-colors"
                title="Decrease font size"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="text-xs font-mono font-bold text-zinc-300 min-w-[32px] text-center">
                {liveFontSize}px
              </span>
              <button
                onClick={() => setLiveFontSize(prev => Math.min(64, prev + 2))}
                className="p-1 text-zinc-400 hover:text-white rounded-full cursor-pointer transition-colors"
                title="Increase font size"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>

            {/* Show/Hide Chords (if song contains chords) */}
            {liveSong.lyrics.includes('[') && (
              <button
                onClick={() => setLiveShowChords(prev => !prev)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold font-mono transition-colors flex items-center gap-1.5 border cursor-pointer select-none ${
                  liveShowChords
                    ? 'bg-amber-500 text-black border-amber-400'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-900 hover:text-white'
                }`}
              >
                <Music className="h-3.5 w-3.5" />
                <span>Chords: {liveShowChords ? 'ON' : 'OFF'}</span>
              </button>
            )}
          </div>

          {/* Next Song */}
          <button
            disabled={!hasNext}
            onClick={() => {
              if (hasNext) {
                setLiveSongId(liveSetlistSongIds[curIndex + 1]);
              }
            }}
            className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-20 text-zinc-300 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors border border-zinc-800 cursor-pointer disabled:cursor-not-allowed select-none animate-in fade-in"
          >
            <span className="hidden sm:inline">Next Song</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  const selectedDateLabel = useMemo(() => {
    const d = new Date(selectedDateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  }, [selectedDateStr]);

  return (
    <div id="calendar-popup-root" className="fixed inset-0 bg-black/85 backdrop-blur-md z-40 flex items-center justify-center p-0 md:p-4 overflow-y-auto">
      
      {/* ----------------------------------------------------
          DESKTOP VIEW: Beautiful dual-pane side-by-side dashboard layout
         ---------------------------------------------------- */}
      <div className="hidden md:flex bg-[#09090b] rounded-3xl border border-white/10 max-w-[1700px] w-full flex-row shadow-2xl overflow-hidden min-h-[700px] max-h-[850px] animate-in fade-in zoom-in-95 duration-250">
        
        {/* Left Google Calendar sidebar panel: Month visual grid & Create button */}
        <div className="w-80 border-r border-white/10 p-5 bg-[#060608] flex flex-col justify-between select-none">
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 bg-amber-500/10 rounded-lg flex items-center justify-center border border-amber-500/20">
                  <CalendarIcon className="h-4 w-4 text-amber-500" />
                </div>
                <h4 className="text-sm font-bold text-white tracking-wide">Worship Setlists</h4>
              </div>
            </div>

            {/* Redesigned G-Calendar style "Create Event" Button */}
            {(currentRole === 'admin' || currentRole === 'guest') && (
              <button
                onClick={() => {
                  setCreateDate(selectedDateStr);
                  setCreateSongIds([]);
                  setCreateTitle('Sunday Worship');
                  setShowCreateDialog(true);
                }}
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs py-3 rounded-2xl shadow-[0_0_20px_rgba(245,158,11,0.15)] flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <Plus className="h-4 w-4 stroke-[3]" /> Create Setlist
              </button>
            )}

            {/* Interactive Monthly Grid */}
            <div className="p-1 bg-[#09090b] rounded-2xl border border-white/5">
              <div className="flex items-center justify-between p-1">
                <span className="text-xs font-bold text-white uppercase tracking-wider pl-1">
                  {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={handlePrevMonth} className="p-1 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white cursor-pointer">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button onClick={handleNextMonth} className="p-1 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white cursor-pointer">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Day Headers */}
              <div className="grid grid-cols-7 gap-1 text-center mt-2">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, dIdx) => (
                  <span key={dIdx} className="text-[10px] font-mono font-extrabold text-slate-500 uppercase">{day}</span>
                ))}
              </div>

              {/* 42 grid cells */}
              <div className="grid grid-cols-7 gap-1 mt-1">
                {calendarDays.map((cell, idx) => {
                  const isSelected = selectedDateStr === cell.dateStr;
                  const isToday = new Date().toISOString().split('T')[0] === cell.dateStr;
                  
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedDateStr(cell.dateStr)}
                      className={`h-7 rounded-lg text-[10px] sm:text-xs font-mono relative flex items-center justify-center transition-all cursor-pointer ${
                        !cell.isCurrentMonth ? 'text-slate-600' : 'text-slate-300'
                      } ${
                        isSelected 
                          ? 'bg-amber-500 text-black font-bold shadow-md' 
                          : isToday 
                            ? 'bg-amber-500/10 border border-amber-500/40 text-amber-400 font-bold'
                            : 'hover:bg-white/5'
                      }`}
                    >
                      <span>{cell.dayNum}</span>
                      {cell.hasEvent && !isSelected && (
                        <span className="absolute bottom-1 left-1.5 right-1.5 h-1 rounded-full bg-amber-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Prompt footer */}
          <div className="text-[10px] text-slate-500 leading-relaxed font-sans pt-4 border-t border-white/5">
            <span className="font-semibold text-amber-500 block mb-1">💡 Interactive Setlists</span>
            Select a date to inspect or build sets for services. Click songs to launch lyrics directly on the display stand.
          </div>
        </div>

        {/* Right Pane: Agenda view of selected day's events */}
        <div className="flex-1 p-6 flex flex-col min-h-0 bg-black/10 text-slate-300">
          <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
            <div>
              <span className="text-[10px] uppercase font-mono tracking-wider font-extrabold text-amber-500">Service Schedule</span>
              <h3 className="text-base md:text-lg font-bold text-white tracking-tight mt-0.5">
                {selectedDateLabel}
              </h3>
            </div>
            <button 
              onClick={onClose}
              className="p-1.5 hover:bg-white/5 rounded-full text-slate-400 hover:text-white cursor-pointer transition-colors"
              title="Close Panel"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Agenda Grid or List representation */}
          <div className="flex-1 overflow-y-auto mt-4 space-y-4 pr-1">
            {dateEvents.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-white/[0.01] rounded-3xl border border-white/5 border-dashed">
                <CalendarIcon className="h-10 w-10 text-slate-700 animate-pulse mb-3" />
                <h5 className="font-bold text-sm text-slate-300">No Setlists Scheduled</h5>
                <p className="text-xs text-slate-500 max-w-xs mt-1">
                  There are no song setlists for this day yet. Click "+ Create Setlist" to create one!
                </p>
              </div>
            ) : (
              dateEvents.map((ev) => {
                const isExpanded = editingEventId === ev.id;
                
                return (
                  <div 
                    key={ev.id} 
                    className={`rounded-2xl border transition-all overflow-hidden ${
                      isExpanded 
                        ? 'bg-amber-500/[0.03] border-amber-500/30 shadow-lg' 
                        : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                    }`}
                  >
                    {/* Event summary header box */}
                    <div 
                      onClick={() => setEditingEventId(isExpanded ? null : ev.id)}
                      className="p-4 flex items-center justify-between gap-3 cursor-pointer select-none"
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center shrink-0 mt-0.5">
                          <Clock className="h-4.5 w-4.5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-white hover:text-amber-400 transition-colors">
                            {ev.title}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                            <span className="font-semibold text-amber-500 font-mono text-[11px] bg-amber-500/10 px-1.5 py-0.5 rounded">
                              {ev.time || 'All Day'}
                            </span>
                            {ev.description && (
                              <span className="truncate max-w-[150px] md:max-w-[250px] italic text-[11px] text-slate-500">
                                — {ev.description}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setEditingEventId(isExpanded ? null : ev.id)}
                          className="text-[11px] font-bold text-slate-400 hover:text-white bg-white/5 border border-white/10 px-3 py-1.5 rounded-full cursor-pointer transition-colors"
                        >
                          {isExpanded ? 'Fold List' : (currentRole === 'admin' || currentRole === 'guest') ? `Manage Setup (${(ev.songIds || []).length})` : `View Setlist (${(ev.songIds || []).length})`}
                        </button>
                        {(currentRole === 'admin' || currentRole === 'guest') && (
                          <button 
                            onClick={(e) => handleDeleteEvent(ev.id, e)}
                            className="p-2 text-rose-500 hover:bg-rose-500/10 hover:text-rose-400 rounded-xl cursor-pointer transition-colors"
                            title="Wipe Schedule block"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expandable Worship Playlist manager */}
                    {isExpanded && (
                      <div className="border-t border-white/10 p-4 bg-black/40">
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                          {/* Left Column: Setlist Arrangement Order */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <h5 className="text-[10px] font-mono tracking-wider text-amber-400 uppercase font-bold flex items-center gap-1">
                                  <Layers className="h-3 w-3" /> Arrangement Grid Order:
                                </h5>
                                <p className="text-[10px] text-slate-500 mt-0.5">
                                  Reorder alignment or click on individual tracks to load lyrics on screen.
                                </p>
                              </div>
                              {(ev.songIds || []).length > 0 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLiveSongId(ev.songIds[0]);
                                    setLiveSetlistSongIds(ev.songIds || []);
                                    setShowLiveConsole(true);
                                  }}
                                  className="text-[10px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full cursor-pointer hover:bg-amber-500/20 transition-colors flex items-center gap-1 uppercase shrink-0"
                                >
                                  <Maximize2 className="h-3 w-3" /> Present Setlist
                                </button>
                              )}
                            </div>

                            {(ev.songIds || []).length === 0 ? (
                              <div className="py-6 text-center text-xs text-slate-500 italic bg-white/[0.01] rounded-xl border border-white/5">
                                No songs currently placed. Link a song from your repertory catalogue on the right!
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {(ev.songIds || []).map((sId, index) => {
                                  const matchSong = songs.find(s => s.id === sId);
                                  const isPlayActive = sId === selectedSongId;
                                  
                                  if (!matchSong) return null;
                                  
                                  const isDragging = draggedIndex === index && draggedEventId === ev.id;
                                  return (
                                    <div 
                                      key={sId}
                                      draggable={(currentRole === 'admin' || currentRole === 'guest')}
                                      onDragStart={(e) => handleDragStart(e, ev.id, index)}
                                      onDragOver={handleDragOver}
                                      onDrop={(e) => handleDrop(e, ev.id, index)}
                                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs transition-all ${
                                        isDragging ? 'opacity-40 border-dashed border-amber-500/50 bg-amber-500/5' : ''
                                      } ${
                                        isPlayActive 
                                          ? 'border-amber-500/50 bg-amber-500/10' 
                                          : 'border-white/5 bg-white/[0.01] hover:bg-white/[0.03]'
                                      } ${(currentRole === 'admin' || currentRole === 'guest') ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                    >
                                      {/* Song title and indicator arrow */}
                                      <div className="flex items-center gap-2 truncate">
                                        {(currentRole === 'admin' || currentRole === 'guest') && (
                                          <GripVertical className="h-3.5 w-3.5 text-slate-500 hover:text-slate-350 cursor-grab shrink-0" />
                                        )}
                                        <span className="text-amber-500 font-extrabold font-mono text-[10px]">
                                          {index + 1}
                                        </span>
                                        <span className="text-slate-500 font-bold">--&gt;</span>
                                        <button
                                          onClick={() => {
                                            onSelectSong(matchSong.id, ev.songIds || []);
                                          }}
                                          className="font-bold text-white hover:text-amber-400 text-left truncate cursor-pointer transition-colors"
                                          title="Load on lyrics screen"
                                        >
                                          {matchSong.title}
                                        </button>
                                        {matchSong.author && (
                                          <span className="text-[10px] text-slate-500 font-sans truncate hidden sm:inline">
                                            ({matchSong.author})
                                          </span>
                                        )}
                                      </div>

                                      {/* Reordering controllers inside the setlist */}
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setLiveSongId(matchSong.id);
                                            setLiveSetlistSongIds(ev.songIds || []);
                                            setShowLiveConsole(true);
                                          }}
                                          className="p-1 rounded-lg text-amber-500 hover:text-amber-400 hover:bg-white/5 cursor-pointer"
                                          title="Full Screen Presentation"
                                        >
                                          <Maximize2 className="h-3.5 w-3.5" />
                                        </button>
                                        {(currentRole === 'admin' || currentRole === 'guest') ? (
                                          <>
                                            <button
                                              disabled={index === 0}
                                              onClick={() => moveSongInEvent(ev.id, index, 'up')}
                                              className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 disabled:opacity-20 cursor-pointer"
                                              title="Shift Up"
                                            >
                                              <MoveUp className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                              disabled={index === (ev.songIds || []).length - 1}
                                              onClick={() => moveSongInEvent(ev.id, index, 'down')}
                                              className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 disabled:opacity-20 cursor-pointer"
                                              title="Shift Down"
                                            >
                                              <MoveDown className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                              onClick={() => toggleSongInEvent(ev.id, matchSong.id)}
                                              className="p-1 rounded-lg text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                                              title="De-list"
                                            >
                                              <X className="h-3.5 w-3.5" />
                                            </button>
                                          </>
                                        ) : (
                                          <div className="text-[10px] text-amber-500 font-mono font-bold uppercase tracking-wider select-none shrink-0 opacity-80">
                                            View Lyrics ➔
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Right Column: Fast inline song add search console */}
                          <div className="space-y-3 xl:border-l xl:border-white/5 xl:pl-6 pt-4 xl:pt-0">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                                {(currentRole === 'admin' || currentRole === 'guest') ? 'Link Catalog Songs:' : 'Search Catalog Songs:'}
                              </label>
                              {(currentRole === 'admin' || currentRole === 'guest') && (
                                <div className="flex items-center gap-1.5 select-none">
                                  <button
                                    type="button"
                                    onClick={() => onOpenAddModal?.(ev.id)}
                                    className="text-[9px] font-bold text-amber-500 hover:text-amber-400 flex items-center gap-1 transition-all bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded-lg border border-amber-500/20 cursor-pointer"
                                  >
                                    <Plus className="h-2.5 w-2.5" /> Create Song
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onOpenUploadModal?.(ev.id)}
                                    className="text-[9px] font-bold text-amber-500 hover:text-amber-400 flex items-center gap-1 transition-all bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded-lg border border-amber-500/20 cursor-pointer"
                                  >
                                    <Upload className="h-2.5 w-2.5" /> Upload Files
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                                <Search className="h-3 w-3 text-slate-505" />
                              </div>
                              <input
                                type="text"
                                placeholder="Search songs to add..."
                                value={songSearchInput}
                                onChange={(e) => setSongSearchInput(e.target.value)}
                                className="block w-full pl-8 pr-3 py-1.5 border border-white/10 rounded-lg bg-black/40 text-slate-300 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 text-[11px] transition-all"
                              />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                              {filteredSongs.length === 0 ? (
                                <div className="col-span-full py-2 text-center text-slate-650 text-[11px] italic">
                                  No songs in library catalog
                                </div>
                              ) : (
                                filteredSongs.slice(0, 30).map(song => {
                                  const isAdded = (ev.songIds || []).includes(song.id);
                                  return (
                                    <button
                                      key={song.id}
                                      onClick={() => {
                                        if ((currentRole === 'admin' || currentRole === 'guest')) {
                                          toggleSongInEvent(ev.id, song.id);
                                        } else {
                                          onSelectSong(song.id, ev.songIds || []);
                                        }
                                      }}
                                      className={`p-2 rounded-xl text-left border text-[11px] transition-all flex items-center justify-between gap-2 cursor-pointer ${
                                        isAdded 
                                          ? 'border-emerald-500/30 bg-emerald-500/[0.03] text-emerald-400 font-bold' 
                                          : 'border-white/5 bg-white/[0.01] hover:bg-white/5 text-slate-300'
                                      }`}
                                    >
                                      <span className="truncate">{song.title}</span>
                                      <span className="shrink-0 text-[10px]">
                                        {(currentRole === 'admin' || currentRole === 'guest') ? (
                                          isAdded ? (
                                            <Check className="h-3.5 w-3.5 text-emerald-400 stroke-[3]" />
                                          ) : (
                                            <ListPlus className="h-3.5 w-3.5 text-slate-550 hover:text-white" />
                                          )
                                        ) : (
                                          <span className="text-amber-500 font-medium font-sans">View ➔</span>
                                        )}
                                      </span>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>


      {/* --------------------------------------------------------------------------------------------------------------------------------------
          MOBILE VIEW: Native smartphone-style full-screen sequential pages (Replacing whole screen)
         -------------------------------------------------------------------------------------------------------------------------------------- */}
      <div className={`md:hidden flex-1 flex flex-col min-h-[100dvh] w-full bg-[#070708] text-zinc-100 font-sans ${mobileStage === 'lyrics' ? 'overflow-hidden h-[100dvh]' : 'select-none overflow-y-auto'}`}>
        
        {/* ----------------------------------------------------
            STAGE 1: FRESH CALENDAR MONTH PAGE
           ---------------------------------------------------- */}
        {mobileStage === 'calendar' && (
          <div className="w-full min-h-[100dvh] flex flex-col p-5 pt-safe bg-[#070708] animate-fadeIn">
            <div className="flex justify-between items-center mb-6 border-b border-zinc-850 pb-4 shrink-0">
              <div>
                <h1 className="text-2xl font-black text-amber-500 tracking-tight">Worship Setlists</h1>
                <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider mt-0.5">Worship Setlists Directory</p>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/5 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-400 hover:text-white cursor-pointer transition-colors"
                title="Exit"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="bg-zinc-950 rounded-2xl border border-zinc-900 p-4 space-y-4">
              
              {/* Creator Button for Admins in Stage 1 */}
              {(currentRole === 'admin' || currentRole === 'guest') && (
                <button
                  onClick={() => {
                    setCreateDate(selectedDateStr);
                    setCreateSongIds([]);
                    setCreateTitle('Worship Session');
                    setShowCreateDialog(true);
                  }}
                  className="w-full bg-[#f59e0b] text-black font-extrabold text-xs py-3.5 rounded-xl shadow-[0_4px_16px_rgba(242,158,11,0.1)] flex items-center justify-center gap-2 cursor-pointer transition-transform"
                >
                  <Plus className="h-4.5 w-4.5 stroke-[2.5]" /> Create Setlist
                </button>
              )}
                           {/* Responsive View Switcher Tabs */}

              <div className="flex bg-[#0a0a0c] border border-zinc-900 p-1 rounded-xl">
                <button
                  onClick={() => setMobileViewMode('calendar')}
                  className={`flex-1 py-2 text-xs font-bold font-mono rounded-lg transition-all active-touch cursor-pointer ${
                    mobileViewMode === 'calendar'
                      ? 'bg-amber-500 text-black font-extrabold shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  📅 Month Grid
                </button>
                <button
                  onClick={() => setMobileViewMode('timeline')}
                  className={`flex-1 py-2 text-xs font-bold font-mono rounded-lg transition-all active-touch cursor-pointer ${
                    mobileViewMode === 'timeline'
                      ? 'bg-amber-500 text-black font-extrabold shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  🗓️ Timeline List
                </button>
              </div>

              {/* Toggle-able Month Calendar Navigation Grid vs Timeline List View */}
              {mobileViewMode === 'calendar' ? (
                <div className="p-1.5 bg-[#0a0a0c] rounded-xl border border-zinc-900 select-none">
                  <div className="flex items-center justify-between p-1">
                    <span className="text-sm font-black text-white uppercase tracking-wider pl-1 font-mono">
                      {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </span>
                    <div className="flex items-center gap-1">
                      <button onClick={handlePrevMonth} className="p-1.5 hover:bg-zinc-800/60 rounded-lg text-zinc-400">
                        <ChevronLeft className="h-4.5 w-4.5" />
                      </button>
                      <button onClick={handleNextMonth} className="p-1.5 hover:bg-zinc-800/60 rounded-lg text-zinc-400">
                        <ChevronRight className="h-4.5 w-4.5" />
                      </button>
                    </div>
                  </div>

                  {/* Day Titles */}
                  <div className="grid grid-cols-7 gap-1 text-center mt-3 border-b border-zinc-900 pb-1">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, dIdx) => (
                      <span key={dIdx} className="text-[10.5px] font-mono font-bold text-zinc-650 uppercase">{day}</span>
                    ))}
                  </div>

                  {/* Viewport calendar grid */}
                  <div className="grid grid-cols-7 gap-1.5 mt-2">
                    {calendarDays.map((cell, idx) => {
                      const isSelected = selectedDateStr === cell.dateStr;
                      const isToday = new Date().toISOString().split('T')[0] === cell.dateStr;
                      
                      return (
                        <button
                          key={idx}
                          onClick={() => handleDateClick(cell.dateStr)}
                          className={`h-9 rounded-lg text-xs font-mono relative flex items-center justify-center transition-all cursor-pointer ${
                            !cell.isCurrentMonth ? 'text-zinc-700' : 'text-zinc-350 font-medium'
                          } ${
                            isSelected 
                              ? 'bg-amber-500 text-black font-extrabold shadow-lg shadow-amber-500/10' 
                              : isToday 
                                ? 'bg-amber-500/10 border border-amber-500/30 text-amber-500 font-extrabold'
                                : 'hover:bg-zinc-900/60'
                          }`}
                        >
                          <span>{cell.dayNum}</span>
                          {cell.hasEvent && !isSelected && (
                            <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Timeline List of Upcoming Events */
                <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                  {events.length === 0 ? (
                    <div className="text-center py-10 bg-zinc-950/40 rounded-xl border border-dashed border-zinc-900">
                      <CalendarIcon className="h-8 w-8 text-zinc-700 mx-auto mb-2 animate-pulse" />
                      <p className="text-zinc-500 text-xs font-mono">No upcoming worship schedules</p>
                    </div>
                  ) : (
                    [...events]
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((ev) => {
                        const d = new Date(ev.date + 'T12:00:00');
                        
                        return (
                          <div
                            key={ev.id}
                            onClick={() => {
                              setSelectedDateStr(ev.date);
                              setMobileStage('eventDetail');
                            }}
                            className="p-4 bg-zinc-900 border border-zinc-850 hover:border-amber-500/35 rounded-2xl flex items-center justify-between gap-3 cursor-pointer active-touch transition-all"
                          >
                            <div className="flex items-center gap-3 text-left min-w-0">
                              {/* Date box */}
                              <div className="h-11 w-11 bg-zinc-950 border border-zinc-800 rounded-xl flex flex-col items-center justify-center shrink-0">
                                <span className="text-[8px] font-mono font-bold text-amber-500 uppercase leading-none">
                                  {d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3)}
                                </span>
                                <span className="text-sm font-black text-white leading-none mt-1">
                                  {d.getDate()}
                                </span>
                              </div>
                              
                              <div className="truncate">
                                <h4 className="text-xs font-bold text-white truncate">{ev.title}</h4>
                                <p className="text-[9px] text-zinc-500 font-mono mt-0.5 uppercase tracking-wide">
                                  {ev.time || 'All Day'} • {(ev.songIds || []).length} Songs
                                </p>
                              </div>
                            </div>
                            
                            <ChevronRight className="h-4 w-4 text-zinc-650 shrink-0" />
                          </div>
                        );
                      })
                  )}
                </div>
              )}
            </div>


            <div className="text-[11px] text-zinc-500 leading-relaxed font-mono mt-auto pt-4 border-t border-zinc-900 flex items-center gap-1.5">
              <span className="text-amber-500 font-bold">💡 Tip:</span>
              Tap a date to inspect or construct setlists and sing lyrics instantly.
            </div>
          </div>
        )}

        {/* ----------------------------------------------------
            STAGE 2: FRESH EVENT DETAILS & SETLIST PAGE
           ---------------------------------------------------- */}
        {mobileStage === 'eventDetail' && (
          <div className="w-full min-h-[100dvh] flex flex-col justify-between p-5 pt-safe bg-[#09090b] animate-slideInRight">
            <div className="flex-1 flex flex-col min-h-0">
              
              {/* Header Navigation */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-900 shrink-0">
                <button 
                  onClick={() => setMobileStage('calendar')}
                  className="flex items-center text-zinc-400 text-xs font-semibold hover:text-amber-500 transition-colors cursor-pointer py-1"
                >
                  <ChevronLeft className="h-5 w-5 mr-1" /> Calendar
                </button>
                <div className="text-[11px] font-mono text-zinc-500 font-bold uppercase tracking-wider bg-zinc-950 px-3 py-1 rounded-full border border-zinc-900">
                  Setlist Master
                </div>
              </div>

              {/* Title Header */}
              <div className="mt-5 mb-6 shrink-0">
                <span className="text-[10px] font-mono font-black tracking-widest text-[#f59e0b] bg-amber-500/10 px-2.5 py-1 rounded-full uppercase">
                  {selectedDateLabel || 'Scheduled Service'}
                </span>
                <h2 className="text-2xl font-black text-zinc-100 mt-2.5 leading-tight tracking-tight">
                  {activeEvent ? activeEvent.title : 'No Service Configured'}
                </h2>
                {activeEvent && activeEvent.description && (
                  <p className="text-xs text-zinc-400 italic mt-1 pl-0.5">— {activeEvent.description}</p>
                )}
              </div>

              {/* Setlist Loop Render Frame */}
              <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                <div className="flex items-center justify-between pl-0.5">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold">
                    Order of Worship Songs
                  </p>
                  {activeEvent && (activeEvent.songIds || []).length > 0 && (
                    <button
                      onClick={() => {
                        setLiveSongId(activeEvent.songIds[0]);
                        setLiveSetlistSongIds(activeEvent.songIds || []);
                        setShowLiveConsole(true);
                      }}
                      className="text-[10px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full cursor-pointer hover:bg-amber-500/20 transition-colors flex items-center gap-1 uppercase"
                    >
                      <Maximize2 className="h-2.5 w-2.5" /> Present
                    </button>
                  )}
                </div>

                {activeEvent && (activeEvent.songIds || []).length > 0 ? (
                  <div className="space-y-2.5">
                    {(activeEvent.songIds || []).map((songId, index) => {
                      const matchSong = songs.find(s => s.id === songId);
                      if (!matchSong) return null;

                      const isDragging = draggedIndex === index && draggedEventId === activeEvent.id;

                      return (
                        <div 
                          key={songId}
                          draggable={(currentRole === 'admin' || currentRole === 'guest')}
                          onDragStart={(e) => handleDragStart(e, activeEvent.id, index)}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, activeEvent.id, index)}
                          onClick={() => handleSongClick(matchSong)}
                          className={`p-4 bg-zinc-900 border hover:border-zinc-700 rounded-xl flex items-center justify-between gap-3 hover:bg-zinc-850/50 transition-all cursor-pointer active:scale-[0.99] select-none ${
                            isDragging ? 'opacity-40 border-dashed border-amber-500/50 bg-amber-500/5 font-bold' : 'border-zinc-850'
                          }`}
                        >
                          <div className="flex-1 text-left flex items-center space-x-2.5 min-w-0">
                            {(currentRole === 'admin' || currentRole === 'guest') && (
                              <GripVertical className="h-4 w-4 text-zinc-500 hover:text-zinc-350 cursor-grab shrink-0" onClick={(e) => e.stopPropagation()} />
                            )}
                            <span className="text-[11px] font-mono font-black text-amber-500/60 bg-zinc-950 border border-zinc-850 px-2 py-0.5 rounded-md shrink-0">
                              {index + 1}
                            </span>
                            <div className="truncate shrink">
                              <span className="text-[14px] font-bold text-zinc-100 hover:text-amber-400 transition-colors block truncate">
                                {matchSong.title}
                              </span>
                              {matchSong.author && (
                                <span className="text-[10px] text-zinc-500 block truncate font-mono">({matchSong.author})</span>
                              )}
                            </div>
                          </div>

                          {/* Reordering and remove logic inside portable lists for Admins */}
                          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setLiveSongId(matchSong.id);
                                setLiveSetlistSongIds(activeEvent.songIds || []);
                                setShowLiveConsole(true);
                              }}
                              className="p-1.5 bg-zinc-950 text-amber-500 hover:text-amber-400 border border-zinc-850 rounded cursor-pointer"
                              title="Full Screen Presentation"
                            >
                              <Maximize2 className="h-3.5 w-3.5" />
                            </button>
                            {(currentRole === 'admin' || currentRole === 'guest') ? (
                              <>
                                <button
                                  disabled={index === 0}
                                  onClick={(e) => { e.stopPropagation(); moveSongInEvent(activeEvent.id, index, 'up'); }}
                                  className="p-1 bg-zinc-950 text-zinc-400 border border-zinc-850 rounded disabled:opacity-20 cursor-pointer"
                                >
                                  <MoveUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  disabled={index === (activeEvent.songIds || []).length - 1}
                                  onClick={(e) => { e.stopPropagation(); moveSongInEvent(activeEvent.id, index, 'down'); }}
                                  className="p-1 bg-zinc-950 text-zinc-400 border border-zinc-850 rounded disabled:opacity-20 cursor-pointer"
                                >
                                  <MoveDown className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleSongInEvent(activeEvent.id, matchSong.id); }}
                                  className="p-1 bg-zinc-950 text-rose-500 border border-zinc-850 rounded cursor-pointer"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </>
                            ) : (
                              <span className="text-[10px] text-amber-500 font-mono font-bold uppercase tracking-wider select-none shrink-0 opacity-80">
                                Present ➔
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-10 bg-zinc-950/40 rounded-2xl border border-dashed border-zinc-900 flex flex-col items-center justify-center p-6">
                    <Music className="h-8 w-8 text-zinc-700 mb-2 animate-bounce" />
                    <p className="text-zinc-500 text-xs font-mono">No songs added to this sequence yet.</p>
                  </div>
                )}
                {activeEvent && (
                  <div className="mt-6 pt-5 border-t border-zinc-900 space-y-3 shrink-0">
                    <div className="flex items-center justify-between pl-0.5">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold block">
                        {(currentRole === 'admin' || currentRole === 'guest') ? 'Link Catalog Songs:' : 'Search Catalog Songs:'}
                      </label>
                      {(currentRole === 'admin' || currentRole === 'guest') && (
                        <div className="flex items-center gap-1.5 select-none">
                          <button
                            type="button"
                            onClick={() => onOpenAddModal?.(activeEvent.id)}
                            className="text-[9px] font-bold text-amber-500 hover:text-amber-400 flex items-center gap-1 transition-all bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded-lg border border-amber-500/20 cursor-pointer"
                          >
                            <Plus className="h-2.5 w-2.5" /> Create Song
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenUploadModal?.(activeEvent.id)}
                            className="text-[9px] font-bold text-amber-500 hover:text-amber-400 flex items-center gap-1 transition-all bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded-lg border border-amber-500/20 cursor-pointer"
                          >
                            <Upload className="h-2.5 w-2.5" /> Upload Files
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                        <Search className="h-3 w-3 text-zinc-500" />
                      </div>
                      <input
                        type="text"
                        placeholder="Search songs..."
                        value={songSearchInput}
                        onChange={(e) => setSongSearchInput(e.target.value)}
                        className="block w-full pl-8 pr-3 py-1.5 border border-zinc-800 rounded-lg bg-zinc-900/50 text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 text-[11px] transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2 max-h-[120px] overflow-y-auto pr-1">
                      {filteredSongs.slice(0, 30).map(song => {
                        const isAdded = (activeEvent.songIds || []).includes(song.id);
                        return (
                          <button
                            key={song.id}
                            onClick={() => {
                              if ((currentRole === 'admin' || currentRole === 'guest')) {
                                toggleSongInEvent(activeEvent.id, song.id);
                              } else {
                                handleSongClick(song);
                              }
                            }}
                            className={`p-2 rounded-xl text-left border text-[11px] transition-all flex items-center justify-between gap-1 cursor-pointer ${
                              isAdded 
                                ? 'border-emerald-500/30 bg-emerald-500/[0.04] text-emerald-400 font-bold' 
                                : 'border-zinc-900 bg-[#0a0a0c] hover:bg-zinc-900/40 text-zinc-300'
                            }`}
                          >
                            <span className="truncate">{song.title}</span>
                            {(currentRole === 'admin' || currentRole === 'guest') ? (
                              isAdded ? (
                                <Check className="h-3 w-3 text-emerald-400 shrink-0" />
                              ) : (
                                <Plus className="h-3 w-3 text-zinc-500 shrink-0" />
                              )
                            ) : (
                              <span className="text-[10px] text-amber-500 font-medium font-sans">View ➔</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Create Trigger form on Mobile if Empty layout */}
            {!activeEvent && (currentRole === 'admin' || currentRole === 'guest') && (
              <div className="my-6 p-6 bg-zinc-950/50 border border-dashed border-zinc-900 rounded-2xl flex flex-col items-center">
                <p className="text-zinc-500 text-xs font-mono text-center mb-4 leading-relaxed">
                  Would you like to schedule and customize a brand new Sunday service for this date?
                </p>
                <button
                  onClick={() => {
                    setCreateDate(selectedDateStr);
                    setCreateSongIds([]);
                    setCreateTitle('Sunday Worship Service');
                    setShowCreateDialog(true);
                  }}
                  className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-[#f59e0b] border border-amber-500/25 rounded-xl text-xs font-bold font-mono transition-transform"
                >
                  Create Setlist
                </button>
              </div>
            )}

            {/* Admin Event Settings Customizer Trigger */}
            {(currentRole === 'admin' || currentRole === 'guest') && activeEvent && (
              <div className="mt-4 pt-3 border-t border-zinc-900 shrink-0 flex items-center gap-2">
                <button 
                  onClick={async () => {
                    setCreateTitle(activeEvent.title);
                    setCreateDate(activeEvent.date);
                    setCreateTime(activeEvent.time || '09:00');
                    setCreateDesc(activeEvent.description || '');
                    setCreateSongIds(activeEvent.songIds || []);
                    // Open simple quick form by deleting first or just saving over-write:
                    // Deleting and styling
                    try {
                      await deleteWorshipEvent(activeEvent.id);
                    } catch (err) {
                      console.error(err);
                    }
                    onEventsChange();
                    setShowCreateDialog(true);
                  }}
                  className="flex-1 py-3 bg-zinc-900 border border-zinc-800 text-zinc-300 font-bold text-xs rounded-xl text-center active:scale-[0.98] transition-transform"
                >
                  Edit Information
                </button>
                <button 
                  onClick={(e) => {
                    handleDeleteEvent(activeEvent.id, e);
                    setMobileStage('calendar');
                  }}
                  className="px-3.5 py-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-450 rounded-xl"
                  title="Delete event"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ----------------------------------------------------
            STAGE 3: FRESH FULL-SCREEN LYRICS FRAME
           ---------------------------------------------------- */}
        {mobileStage === 'lyrics' && activeLyricsSong && (
          <div className="w-full min-h-[100dvh] p-5 pt-safe bg-[#050506] flex flex-col justify-start animate-slideInRight">
            
            {/* Top Back Header navigation */}
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3 shrink-0">
              <button 
                onClick={() => setMobileStage('eventDetail')}
                className="flex items-center text-zinc-400 text-xs font-semibold py-1 hover:text-amber-500 transition-colors"
              >
                <ChevronLeft className="h-5 w-5 mr-1" /> Setlist
              </button>

              {/* Quick transposition and chord toggles inline */}
              <div className="flex items-center gap-1.5 text-zinc-300">
                <button
                  onClick={() => setMobileShowChords(!mobileShowChords)}
                  className={`px-2.5 py-1 rounded-lg text-[10.5px] font-mono font-black transition-all border ${
                    mobileShowChords 
                      ? 'bg-amber-500/10 border-amber-500 text-amber-500' 
                      : 'bg-zinc-900 border-zinc-850 text-zinc-450 hover:text-white'
                  }`}
                >
                  Chord Box: {mobileShowChords ? 'ON' : 'OFF'}
                </button>

                {mobileShowChords && (
                  <div className="flex items-center bg-zinc-900 rounded-lg border border-zinc-850 px-2 py-1 gap-1.5">
                    <span className="text-[9px] font-sans text-zinc-500 font-bold uppercase">Pitch:</span>
                    <button 
                      onClick={() => setMobileTransposeStep(p => p - 1)}
                      className="text-xs font-mono font-extrabold text-zinc-400 hover:text-white"
                    >
                      -
                    </button>
                    <span className="text-[10px] font-mono font-bold text-amber-400">
                      {mobileTransposeStep === 0 ? '0' : (mobileTransposeStep > 0 ? `+${mobileTransposeStep}` : mobileTransposeStep)}
                    </span>
                    <button 
                      onClick={() => setMobileTransposeStep(p => p + 1)}
                      className="text-xs font-mono font-extrabold text-zinc-400 hover:text-white"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Title Block */}
            <div className="mt-4 mb-4 pb-3 border-b border-zinc-900 shrink-0">
              <h3 className="text-xl font-black text-amber-500 leading-snug">{activeLyricsSong.title}</h3>
              <div className="flex items-center justify-between mt-1 text-[10px] text-zinc-500 font-mono">
                {activeLyricsSong.author && <span>By: {activeLyricsSong.author}</span>}
                {activeLyricsSong.key && <span>Original Key: {activeLyricsSong.key}</span>}
              </div>
            </div>

            {/* Lyric Core canvas box */}
            <div 
              id="mobile-stage-lyrics-canvas"
              className="flex-1 w-full overflow-y-auto py-2 pr-1"
              style={{ maxHeight: 'calc(100vh - 180px)' }}
            >
              <pre 
                className="whitespace-pre-wrap font-sans leading-relaxed text-zinc-200 tracking-wide pb-20 font-medium"
                style={{ fontSize: `${mobileFontSize}px` }}
              >
                {mobileShowChords 
                  ? transposeLyrics(activeLyricsSong.lyrics, mobileTransposeStep)
                  : stripChords(activeLyricsSong.lyrics)
                }
              </pre>
            </div>

            {/* Mobile floating Font Changer & Scrolling controls on bottom bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-[#09090b]/90 backdrop-blur-md border-t border-zinc-900 px-4 py-3 pb-safe flex items-center justify-between shadow-2xl z-20">
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => setMobileFontSize(prev => Math.max(12, prev - 2))} 
                  className="p-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white"
                >
                  <ZoomOut className="h-4.5 w-4.5" />
                </button>
                <span className="text-xs font-mono text-zinc-450 font-black">{mobileFontSize}px</span>
                <button 
                  onClick={() => setMobileFontSize(prev => Math.min(32, prev + 2))} 
                  className="p-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white"
                >
                  <ZoomIn className="h-4.5 w-4.5" />
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => setMobileScrolling(!mobileScrolling)} 
                  className={`py-2 px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md ${
                    mobileScrolling 
                      ? 'bg-amber-500 text-black shadow-amber-500/10' 
                      : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-850'
                  }`}
                >
                  {mobileScrolling ? <Pause className="h-3.5 w-3.5 stroke-[2.5]" /> : <Play className="h-3.5 w-3.5 stroke-[2.5]" />}
                  <span>Auto Scroll</span>
                </button>

                {mobileScrolling && (
                  <select 
                    value={mobileScrollSpeed} 
                    onChange={e => setMobileScrollSpeed(Number(e.target.value))}
                    className="bg-zinc-900 text-xs font-bold py-2 px-2.5 rounded-xl text-[#f59e0b] border border-zinc-850"
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
        )}
      </div>

      {/* Google Calendar-style popup modal dialog for rapid Event creation */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/92 backdrop-blur-md z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <form 
            onSubmit={handleCreateEventSubmit}
            className="bg-[#070708] w-full h-full md:h-auto md:max-w-md rounded-t-3xl md:rounded-3xl p-5 md:p-6 space-y-4 shadow-3xl border-t md:border border-white/10 text-slate-350 animate-slideUp md:animate-in md:fade-in md:zoom-in-95 overflow-y-auto pb-safe"
          >
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h4 className="font-bold text-base text-white flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-amber-500" /> Create Worship Setlist
              </h4>
              <button 
                type="button"
                onClick={() => setShowCreateDialog(false)}
                className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5 font-sans">
              <div>
                <label className="text-[10px] font-mono uppercase text-slate-400 font-bold block mb-1">Setlist Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sunday Morning Worship"
                  value={createTitle}
                  onChange={e => setCreateTitle(e.target.value)}
                  className="w-full bg-[#09090b] border border-white/10 rounded-xl px-3.5 py-2.5 text-slate-200 placeholder-slate-550 focus:outline-none focus:border-amber-500 text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400 font-bold block mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={createDate}
                    onChange={e => setCreateDate(e.target.value)}
                    className="w-full bg-[#09090b] border border-white/10 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-amber-500 text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400 font-bold block mb-1">Time</label>
                  <input
                    type="time"
                    value={createTime}
                    onChange={e => setCreateTime(e.target.value)}
                    className="w-full bg-[#09090b] border border-white/10 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-amber-500 text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-slate-400 font-bold block mb-1">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="Morning assembly setlist"
                  value={createDesc}
                  onChange={e => setCreateDesc(e.target.value)}
                  className="w-full bg-[#09090b] border border-white/10 rounded-xl px-3.5 py-2.5 text-slate-200 placeholder-slate-550 focus:outline-none focus:border-amber-500 text-xs"
                />
              </div>
            </div>

            <div className="flex gap-2.5 pt-4 pb-6 md:pb-0">
              <button
                type="button"
                onClick={() => setShowCreateDialog(false)}
                className="flex-1 bg-white/5 hover:bg-white/10 text-white font-extrabold text-xs py-2.5 rounded-xl cursor-pointer transition-colors border border-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs py-2.5 rounded-xl cursor-pointer transition-all shadow-md"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {renderLiveConsole()}

    </div>
  );
}
