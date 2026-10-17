import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Minimize, Play, Pause, ZoomIn, ZoomOut, Columns, Type, Check, ChevronLeft, ChevronRight, Presentation, FileText, Radio, Paintbrush, Palette, EyeOff, Keyboard, Maximize2, Minimize2 } from 'lucide-react';
import { Song, PresentationConfig } from '../types';
import { stripChords, parseSongSections } from '../utils/chordTransposer';
import { getBroadcastState } from '../lib/db';
import ColorPickerModal from './modals/ColorPickerModal';
import KeyboardHelpModal from './modals/KeyboardHelpModal';

interface StageModeProps {
  song: Song;
  onClose: () => void;
  broadcastSlideIndex?: number;
  onSelectSong?: (id: string) => void;
}

export default React.memo(function StageMode({ song, onClose, broadcastSlideIndex, onSelectSong }: StageModeProps) {
  const [lyrics, setLyrics] = useState<string>('');
  const [activeColorPicker, setActiveColorPicker] = useState<'bg' | 'text' | null>(null);
  const [isBlackout, setIsBlackout] = useState<boolean>(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState<boolean>(false);

  const sections = useMemo(() => {
    return parseSongSections(song.lyrics || lyrics || '');
  }, [song.lyrics, lyrics]);

  const [config, setConfig] = useState<PresentationConfig>(() => {
    const saved = localStorage.getItem('dasong_stage_config');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return {
      fontSize: 28,
      theme: 'dark',
      twoColumns: false,
      autoScrollSpeed: 0,
      customBg: '#0d0d0d',
      customTextColor: '#f4f4f5',
      fontFamily: 'serif',
    };
  });

  const [scrolling, setScrolling] = useState<boolean>(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<number | null>(null);
  const [showHeader, setShowHeader] = useState<boolean>(true);
  const lastTapRef = useRef<number>(0);

  // Persist stage config to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('dasong_stage_config', JSON.stringify(config));
  }, [config]);

  // View mode, screen size, and slide presentation states
  const [viewMode, setViewMode] = useState<'scroll' | 'slides'>(() => {
    return (localStorage.getItem('dasong_stage_view_mode') as 'scroll' | 'slides') || 'slides';
  });

  const handleSetViewMode = (mode: 'scroll' | 'slides') => {
    setViewMode(mode);
    setScrolling(false);
    localStorage.setItem('dasong_stage_view_mode', mode);
  };

  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0);
  const [isLargeScreen, setIsLargeScreen] = useState<boolean>(false);
  const [showDesktopCustomizer, setShowDesktopCustomizer] = useState<boolean>(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState<boolean>(() => !!document.fullscreenElement);

  // Sync native fullscreen changes (e.g. user pressed F11, Esc, or browser exit)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsNativeFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleNativeFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        } else if ((document.documentElement as any).webkitRequestFullscreen) {
          await (document.documentElement as any).webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document.exitFullscreen as any).webkitExitFullscreen) {
          await (document.exitFullscreen as any).webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('Native fullscreen error:', err);
    }
  }, []);

  // When stage mode is closed, safely exit native fullscreen
  const handleExitStage = useCallback(() => {
    if (document.fullscreenElement) {
      try {
        if (document.exitFullscreen) document.exitFullscreen();
        else if ((document.exitFullscreen as any).webkitExitFullscreen) (document.exitFullscreen as any).webkitExitFullscreen();
      } catch {}
    }
    onClose();
  }, [onClose]);

  // Request native fullscreen automatically when entering Stage Mode if supported
  useEffect(() => {
    if (!document.fullscreenElement) {
      toggleNativeFullscreen().catch(() => {});
    }
  }, [toggleNativeFullscreen]);

  const touchStartRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartRef.current === null) return;
    const diffX = touchStartRef.current - e.changedTouches[0].clientX;
    const swipeThreshold = 50; // pixels
    
    if (diffX > swipeThreshold) {
      // Swiped left -> next slide
      setCurrentSlideIndex((prev) => Math.min(sections.length - 1, prev + 1));
    } else if (diffX < -swipeThreshold) {
      // Swiped right -> prev slide
      setCurrentSlideIndex((prev) => Math.max(0, prev - 1));
    }
    
    touchStartRef.current = null;
  };

  // Live follow state
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
    if (!isFollowing || !song.id) return;

    let active = true;

    const checkBroadcast = async () => {
      try {
        const state = await getBroadcastState();
        if (!active) return;
        if (state) {
          // If song changed
          if (state.songId && state.songId !== song.id && onSelectSong) {
            onSelectSong(state.songId);
            return;
          }

          // Update highlighted line
          if (typeof state.activeLineIndex === 'number' && state.activeLineIndex >= 0) {
            const hasLineChanged = state.activeLineIndex !== highlightedLineRef.current;
            setHighlightedLineIndex(state.activeLineIndex);

            // If in continuous scroll view, scroll the line into view only when it changes
            if (viewMode === 'scroll') {
              if (hasLineChanged) {
                setTimeout(() => {
                  const el = document.getElementById(`stage-line-${state.activeLineIndex}`);
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }, 100);
              }
            } else {
              // If in slides view, compute slide index containing the active line
              let lineCount = 0;
              let targetSlideIndex = 0;
              for (let sIdx = 0; sIdx < sections.length; sIdx++) {
                const sectionLines = sections[sIdx].split('\n').filter(l => l.trim().length > 0).length;
                if (state.activeLineIndex >= lineCount && state.activeLineIndex < lineCount + sectionLines) {
                  targetSlideIndex = sIdx;
                  break;
                }
                lineCount += sectionLines;
              }
              setCurrentSlideIndex(targetSlideIndex);
            }
          }
        }
      } catch (err) {
        console.warn('Error polling broadcast in StageMode:', err);
      }
    };

    checkBroadcast();
    const intervalId = setInterval(checkBroadcast, 1200);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [isFollowing, song.id, onSelectSong, viewMode, lyrics]);

  // Listen for screen dimensions to detect mobile vs desktop
  useEffect(() => {
    const checkScreenSize = () => {
      const isLarge = window.innerWidth >= 768;
      setIsLargeScreen(isLarge);
    };
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Listen for real-time slide broadcast updates from DaLyric TV
  useEffect(() => {
    if (typeof broadcastSlideIndex === 'number' && viewMode === 'slides') {
      setCurrentSlideIndex(broadcastSlideIndex);
    }
  }, [broadcastSlideIndex, viewMode]);

  // Sync display lyrics
  useEffect(() => {
    setLyrics(stripChords(song.lyrics));
  }, [song.lyrics]);

  // Handle auto scrolling
  useEffect(() => {
    if (scrolling && config.autoScrollSpeed > 0) {
      const scrollStep = () => {
        if (scrollContainerRef.current) {
          const container = scrollContainerRef.current;
          // Calculate step size based on speed scale 1-10
          const step = config.autoScrollSpeed * 0.45;
          container.scrollTop += step;

          // Stop scrolling if reached bottom
          if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
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
  }, [scrolling, config.autoScrollSpeed]);

  // Auto-hide control header when scrolling starts or when idle in slides mode
  useEffect(() => {
    let timer: number;
    
    const resetTimer = () => {
      setShowHeader(true);
      clearTimeout(timer);
      // Auto hide after 3 seconds of inactivity
      timer = window.setTimeout(() => {
        setShowHeader(false);
      }, 3000);
    };

    if (scrolling) {
      timer = window.setTimeout(() => {
        setShowHeader(false);
      }, 2500);
    } else if (viewMode === 'slides') {
      resetTimer();

      window.addEventListener('mousemove', resetTimer);
      window.addEventListener('mousedown', resetTimer);
      window.addEventListener('touchstart', resetTimer);
      window.addEventListener('keydown', resetTimer);
    } else {
      setShowHeader(true);
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('mousedown', resetTimer);
      window.removeEventListener('touchstart', resetTimer);
      window.removeEventListener('keydown', resetTimer);
    };
  }, [scrolling, viewMode]);


  // Key shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      // Blackout toggle (Standard presenter B or .)
      if (e.key === 'b' || e.key === 'B' || e.key === '.') {
        e.preventDefault();
        setIsBlackout((prev) => !prev);
        return;
      }

      // Any key press exits blackout if active
      if (isBlackout) {
        setIsBlackout(false);
        return;
      }

      if (e.key === 'Escape') {
        if (showKeyboardHelp) {
          setShowKeyboardHelp(false);
          return;
        }
        handleExitStage();
        return;
      }

      // Native Fullscreen Toggle (F)
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleNativeFullscreen();
        return;
      }

      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setShowKeyboardHelp((prev) => !prev);
        return;
      }

      // Direct Chorus jump
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        const cIdx = sections.findIndex((s) => /^(?:chorus|பல்லவி)/i.test(s.trim()));
        if (cIdx !== -1) {
          if (viewMode === 'slides') {
            setCurrentSlideIndex(cIdx);
          } else {
            const el = document.getElementById(`stage-line-${cIdx}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
        return;
      }

      // Verse 1 / Top of song
      if (e.key === 'Home' || e.key === '1') {
        e.preventDefault();
        if (viewMode === 'slides') {
          setCurrentSlideIndex(0);
        } else if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return;
      }

      // Last slide / End of song
      if (e.key === 'End') {
        e.preventDefault();
        if (viewMode === 'slides') {
          setCurrentSlideIndex(Math.max(0, sections.length - 1));
        } else if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' });
        }
        return;
      }

      // Fast font scaling (up to 120px for massive auditorium displays)
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setConfig((prev) => ({ ...prev, fontSize: Math.min(120, prev.fontSize + 3) }));
        return;
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setConfig((prev) => ({ ...prev, fontSize: Math.max(16, prev.fontSize - 3) }));
        return;
      }

      if (viewMode === 'scroll') {
        if (e.key === ' ') {
          e.preventDefault();
          setScrolling((prev) => !prev);
        } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'k' || e.key === 'K') {
          e.preventDefault();
          if (scrollContainerRef.current) scrollContainerRef.current.scrollBy({ top: -160, behavior: 'smooth' });
        } else if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'j' || e.key === 'J') {
          e.preventDefault();
          if (scrollContainerRef.current) scrollContainerRef.current.scrollBy({ top: 160, behavior: 'smooth' });
        }
      } else {
        // Slides presentation mode navigation
        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'j' || e.key === 'J' || e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          setCurrentSlideIndex((prev) => Math.min(sections.length - 1, prev + 1));
        } else if (e.key === 'ArrowLeft' || e.key === 'Backspace' || e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'k' || e.key === 'K' || e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          setCurrentSlideIndex((prev) => Math.max(0, prev - 1));
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onClose, viewMode, sections, isBlackout, showKeyboardHelp]);

  // Format the lines beautifully - parse [brackets] into superscript lines or keep inline
  const renderFormattedLyrics = (lyricsOverride?: string) => {
    const targetSections = lyricsOverride ? parseSongSections(lyricsOverride) : sections;

    let globalLineCounter = 0;

    return targetSections.map((section, idx) => {
      const isChorus = section.toLowerCase().startsWith('chorus:');
      const lines = section.split('\n');

      // Calculate index range for this section
      const startIdx = globalLineCounter;
      const endIdx = globalLineCounter + lines.length - 1;
      const isSectionHighlighted = highlightedLineIndex >= startIdx && highlightedLineIndex <= endIdx;

      return (
        <div
          key={idx}
          className={`mb-6 p-5 rounded break-inside-avoid transition-all duration-300 ${
            isSectionHighlighted
              ? 'bg-white/10 border border-white/30 text-white font-extrabold'
              : (isChorus
                  ? 'border-l-4 border-zinc-500 bg-white/5'
                  : 'border border-transparent')
          }`}
        >
          {lines.map((line, lIdx) => {
            const currentLineIndex = globalLineCounter++;
            const lineId = `stage-line-${currentLineIndex}`;
            
            const highlightClass = 'transition-all duration-200';



            // Normal line or raw header line
            const isLightTheme = config.theme === 'parchment' || config.theme === 'classic';
            const headingColor = isLightTheme ? 'text-amber-800' : 'text-amber-500 font-extrabold';
            const textStyle: React.CSSProperties = {
              fontSize: line.endsWith(':') ? '12px' : `${config.fontSize}px`,
              color: line.endsWith(':')
                ? undefined // let headingColor class handle it
                : isSectionHighlighted
                  ? '#ffffff'
                  : config.theme === 'custom'
                    ? config.customTextColor
                    : undefined, // inherit from parent for preset themes
            };

            return (
              <div
                key={lIdx}
                id={lineId}
                className={`leading-relaxed p-1 ${highlightClass} ${
                  line.endsWith(':')
                    ? `mt-3 text-xs uppercase tracking-widest ${headingColor}`
                    : isSectionHighlighted ? 'font-extrabold tracking-wide' : 'font-medium tracking-wide'
                }`}
                style={textStyle}
              >
                {line}
              </div>
            );
          })}
        </div>
      );
    });
  };

  const renderActiveSlide = () => {
    if (sections.length === 0) return null;
    const section = sections[currentSlideIndex];
    if (!section) return null;

    const isChorus = section.toLowerCase().startsWith('chorus:') || /^(?:chorus|பல்லவி)/i.test(section.trim());
    const lines = section.split('\n');

    // Compute lines offset for slide highlighting
    let activeSlideLineOffset = 0;
    for (let sIdx = 0; sIdx < currentSlideIndex; sIdx++) {
      activeSlideLineOffset += sections[sIdx].split('\n').length;
    }

    const slideLineCount = lines.length;
    const hasActiveLineOnSlide = highlightedLineIndex >= activeSlideLineOffset && highlightedLineIndex < activeSlideLineOffset + slideLineCount;

    // Calculate dynamic screen-filling font size so lyrics cover the entire screen
    const cleanLines = lines.filter(l => !l.endsWith(':') && l.trim().length > 0 && !(isChorus && l.toLowerCase().startsWith('chorus:')));
    const lineCount = cleanLines.length || 1;
    const baseScale = (config.fontSize || 28) / 28;

    // Scale dynamically to fill the whole screen:
    // 1 line: 1.6x, 2 lines: 1.4x, 3-4 lines: 1.18x, 5-6 lines: 0.98x, 7+ lines: 0.82x
    const lineScaleFactor = lineCount <= 1 ? 1.6 : lineCount <= 2 ? 1.4 : lineCount <= 4 ? 1.18 : lineCount <= 6 ? 0.98 : 0.82;
    const responsivePx = Math.round(48 * baseScale * lineScaleFactor);

    return (
      <div className="w-full h-full max-w-none flex flex-col justify-center items-center text-center select-none px-4 sm:px-8 md:px-14 animate-in fade-in duration-200">
        {isChorus && (
          <span className="text-xs sm:text-sm font-mono tracking-widest text-amber-500/90 uppercase font-black select-none mb-3 sm:mb-6 block">
            Chorus • பல்லவி
          </span>
        )}
        
        <div className="w-full flex flex-col justify-center items-center gap-4 sm:gap-6 md:gap-8 lg:gap-10 py-2">
          {lines.map((line, lIdx) => {
            const currentLineIndex = activeSlideLineOffset + lIdx;
            const isHighlighted = currentLineIndex === highlightedLineIndex;
            
            const highlightClass = hasActiveLineOnSlide
              ? (isHighlighted ? 'scale-[1.02] opacity-100 text-white font-black drop-shadow-xl' : 'opacity-85')
              : 'opacity-100';

            if (isChorus && line.toLowerCase().startsWith('chorus:')) {
              const remaining = line.slice(7).trim();
              if (!remaining) return null;
            }

            const isLightTheme = config.theme === 'parchment' || config.theme === 'classic';
            const headingColor = isLightTheme ? 'text-amber-800 font-bold' : 'text-amber-500 font-black';
            const slideTextStyle: React.CSSProperties = {
              fontSize: line.endsWith(':')
                ? '14px'
                : `clamp(24px, ${responsivePx}px, 6.5vw)`,
              lineHeight: 1.35,
              color: line.endsWith(':')
                ? undefined
                : isHighlighted
                  ? '#ffffff'
                  : config.theme === 'custom'
                    ? config.customTextColor
                    : undefined,
            };

            return (
              <div
                key={lIdx}
                className={`leading-tight p-1 w-full max-w-full break-words transition-all duration-200 ${highlightClass} ${
                  line.endsWith(':')
                    ? `text-sm uppercase tracking-widest ${headingColor} mb-2`
                    : 'font-extrabold tracking-wide'
                }`}
                style={slideTextStyle}
              >
                {line}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const currentThemeClasses = () => {
    switch (config.theme) {
      case 'parchment': return 'bg-[#F9F6EE] text-[#1C1A17]';
      case 'classic':   return 'bg-white text-black';
      case 'retro-terminal': return 'bg-black text-[#00FF66] font-mono border-emerald-950';
      case 'custom':    return ''; // handled via inline styles
      default:          return 'bg-black text-zinc-200';
    }
  };

  const customStyles = config.theme === 'custom'
    ? { backgroundColor: config.customBg, color: config.customTextColor }
    : {};

  const fontClass = config.fontFamily === 'sans' ? 'font-sans'
    : (config.fontFamily === 'baloo' || config.fontFamily === 'bold' || config.fontFamily === 'mono') ? 'font-baloo'
    : 'font-serif';

  const changeTheme = (theme: PresentationConfig['theme']) => {
    setConfig((prev) => ({ ...prev, theme }));
  };

  const handleLyricsTouch = (e: React.MouseEvent) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Double tap: play/pause scrolling
      setScrolling(prev => !prev);
      setShowHeader(true);
    } else {
      // Single tap: toggle header visibility
      setShowHeader(prev => !prev);
    }
    lastTapRef.current = now;
  };

  const renderCustomizerPopover = () => (
    <div
      className="absolute right-0 top-12 z-50 w-[calc(100vw-24px)] max-w-xs sm:w-80 bg-[#0E0F14] border border-white/8 rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.9)] font-sans overflow-hidden max-h-[85vh] flex flex-col"
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/6 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-amber-500/15 flex items-center justify-center">
            <Paintbrush className="h-3 w-3 text-amber-400" />
          </div>
          <span className="text-xs font-bold text-white tracking-wide">Appearance</span>
        </div>
        <button
          onClick={() => setShowDesktopCustomizer(false)}
          className="w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-500 hover:text-white transition-all cursor-pointer text-xs"
        >✕</button>
      </div>

      <div className="p-5 space-y-5 overflow-y-auto">
        {/* Theme Section */}
        <div className="space-y-2.5">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.12em]">Theme</p>
          <div className="grid grid-cols-5 gap-2">
            {([
              { id: 'dark',           label: 'Dark',     bg: '#000000', text: '#e4e4e7', ring: 'border-zinc-700' },
              { id: 'parchment',      label: 'Parch',    bg: '#F9F6EE', text: '#1C1A17', ring: 'border-stone-300' },
              { id: 'classic',        label: 'White',    bg: '#ffffff', text: '#111111', ring: 'border-slate-200' },
              { id: 'retro-terminal', label: 'Term',     bg: '#000000', text: '#00FF66', ring: 'border-emerald-700' },
              { id: 'custom',         label: 'Custom',   bg: config.customBg, text: config.customTextColor, ring: 'border-amber-500/40' },
            ] as const).map(({ id, label, bg, text, ring }) => (
              <button
                key={id}
                onClick={() => changeTheme(id)}
                className={`flex flex-col items-center gap-1.5 p-0 rounded-lg border-2 transition-all cursor-pointer overflow-hidden ${
                  config.theme === id
                    ? 'border-amber-500 shadow-[0_0_0_1px_rgba(245,158,11,0.3)]'
                    : `${ring} opacity-70 hover:opacity-100`
                }`}
                title={label}
              >
                {/* Color swatch */}
                <div
                  className="w-full h-9 flex items-center justify-center text-[10px] font-black"
                  style={{ backgroundColor: bg, color: text }}
                >
                  Aa
                </div>
                <span className={`text-[8px] font-bold pb-1 uppercase tracking-wide ${config.theme === id ? 'text-amber-400' : 'text-zinc-500'}`}>
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/5" />

        {/* Font Style Section */}
        <div className="space-y-2.5">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.12em]">Font Style</p>
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: 'serif', label: 'Elegant', sample: 'Aa', cls: 'font-serif' },
              { id: 'sans',  label: 'Clean',   sample: 'Aa', cls: 'font-sans'  },
              { id: 'baloo', label: 'Bold',    sample: 'Aa', cls: 'font-baloo' },
            ] as const).map(({ id, label, sample, cls }) => {
              const isSelected = config.fontFamily === id || (id === 'baloo' && (config.fontFamily === 'bold' || config.fontFamily === 'mono'));
              return (
                <button
                  key={id}
                  onClick={() => setConfig(p => ({ ...p, fontFamily: id }))}
                  className={`flex flex-col items-center gap-1 py-3 rounded-lg border-2 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-amber-500 bg-amber-500/8 shadow-[0_0_0_1px_rgba(245,158,11,0.2)]'
                      : 'border-white/6 bg-white/2 hover:bg-white/5 hover:border-white/12'
                  }`}
                >
                  <span className={`text-xl font-bold ${cls} ${isSelected ? 'text-white' : 'text-zinc-400'}`}>
                    {sample}
                  </span>
                  <span className={`text-[9px] font-bold uppercase tracking-wide ${isSelected ? 'text-amber-400' : 'text-zinc-600'}`}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/5" />

        {/* Font Size Section */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.12em]">Font Size</p>
            <span className="text-[11px] font-mono font-bold text-amber-400">{config.fontSize}px</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfig(p => ({ ...p, fontSize: Math.max(16, p.fontSize - 4) }))}
              className="flex-1 py-2 rounded-lg border border-white/8 bg-white/4 hover:bg-white/10 active:scale-95 transition-all text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer text-xs"
              title="Decrease font size"
              aria-label="Decrease font size"
            >
              <ZoomOut className="h-3.5 w-3.5 text-zinc-400" /> A-
            </button>
            <div className="px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 font-mono font-bold text-xs text-center min-w-[56px]">
              {config.fontSize}px
            </div>
            <button
              onClick={() => setConfig(p => ({ ...p, fontSize: Math.min(80, p.fontSize + 4) }))}
              className="flex-1 py-2 rounded-lg border border-white/8 bg-white/4 hover:bg-white/10 active:scale-95 transition-all text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer text-xs"
              title="Increase font size"
              aria-label="Increase font size"
            >
              <ZoomIn className="h-3.5 w-3.5 text-amber-400" /> A+
            </button>
          </div>
        </div>

        {/* Custom Colors — Interactive Draggable Color Pickers */}
        {config.theme === 'custom' && (
          <>
            <div className="h-px bg-white/5" />
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.12em]">Custom Colors</p>
              <div className="grid grid-cols-2 gap-3">
                {/* Background color trigger */}
                <button
                  type="button"
                  onClick={() => setActiveColorPicker('bg')}
                  className="block cursor-pointer group text-left w-full"
                >
                  <span className="text-[9px] text-zinc-400 uppercase tracking-wider block mb-1.5 font-semibold">Background</span>
                  <div className="flex items-center gap-2.5 bg-white/4 border border-white/10 rounded-xl p-2.5 group-hover:border-amber-500/40 transition-all shadow-sm">
                    <div
                      className="w-8 h-8 rounded-lg border border-white/20 shrink-0 shadow-inner"
                      style={{ backgroundColor: config.customBg }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-mono text-white font-bold truncate">{config.customBg}</p>
                      <p className="text-[9px] text-amber-400 font-medium">Open Color Picker</p>
                    </div>
                  </div>
                </button>

                {/* Text color trigger */}
                <button
                  type="button"
                  onClick={() => setActiveColorPicker('text')}
                  className="block cursor-pointer group text-left w-full"
                >
                  <span className="text-[9px] text-zinc-400 uppercase tracking-wider block mb-1.5 font-semibold">Text Color</span>
                  <div className="flex items-center gap-2.5 bg-white/4 border border-white/10 rounded-xl p-2.5 group-hover:border-amber-500/40 transition-all shadow-sm">
                    <div
                      className="w-8 h-8 rounded-lg border border-white/20 shrink-0 shadow-inner"
                      style={{ backgroundColor: config.customTextColor }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-mono text-white font-bold truncate">{config.customTextColor}</p>
                      <p className="text-[9px] text-amber-400 font-medium">Open Color Picker</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );


  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col transition-all duration-300 ${fontClass} ${currentThemeClasses()}`}
      style={{
        ...customStyles,
        fontFamily: (config.fontFamily === 'baloo' || config.fontFamily === 'bold' || config.fontFamily === 'mono')
          ? '"Baloo Thambi 2", "Noto Sans Tamil", sans-serif'
          : config.fontFamily === 'sans'
            ? '"Noto Sans Tamil", "Inter", sans-serif'
            : '"Noto Serif Tamil", "Playfair Display", Georgia, serif',
      }}
    >

      {/* Presentation Top bar Controls */}
      <div id="stage-bar" className={`flex items-center justify-between p-3 border-b border-[#1E202B] bg-[#12131A] z-10 font-sans transition-transform duration-300 ${showHeader ? 'translate-y-0' : '-translate-y-full absolute w-full'}`}>
        {isLargeScreen ? (
          <>
            <div className="flex items-center gap-3">
              <div>
                <span className="text-[9px] text-amber-500 tracking-widest font-mono uppercase font-bold">LIVE STAGE PRESENTATION</span>
                <h1 className="text-lg font-bold text-white select-none leading-none mt-1">
                  {song.title}
                </h1>
              </div>
            </div>

            {/* Display Actions Strip */}
            <div className="flex items-center gap-3">
              {/* Follow Live Broadcast Toggle */}
              <button
                onClick={() => {
                  const val = !isFollowing;
                  setIsFollowing(val);
                  localStorage.setItem('dasong_live_follow', val ? 'true' : 'false');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer transition-all text-[10px] font-bold uppercase tracking-wider ${
                  isFollowing
                    ? 'bg-emerald-500 text-black animate-pulse'
                    : 'bg-zinc-900/60 text-slate-400 hover:text-white border border-[#1E202B]'
                }`}
                title="Follow Live Service Broadcast"
              >
                <Radio className="h-3 w-3" aria-hidden={true} />
                <span>{isFollowing ? 'Syncing' : 'Follow'}</span>
              </button>

              {/* Scroll vs Slides View Toggles */}
              <div className="flex gap-1 bg-zinc-900/60 p-1 rounded border border-[#1E202B] shrink-0 select-none">
                <button
                  onClick={() => handleSetViewMode('scroll')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                    viewMode === 'scroll'
                      ? 'bg-amber-500 text-black font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Continuous Scroll View"
                >
                  <FileText className="h-3 w-3" aria-hidden={true} /> Scroll
                </button>
                <button
                  onClick={() => handleSetViewMode('slides')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                    viewMode === 'slides'
                      ? 'bg-amber-500 text-black font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Stanza Slide Presentation"
                >
                  <Presentation className="h-3 w-3" aria-hidden={true} /> Slides
                </button>
              </div>

              {/* Font Controls */}
              <div className="flex items-center bg-zinc-900/60 px-2.5 py-1 rounded border border-[#1E202B]">
                <button
                  onClick={() => setConfig((p) => ({ ...p, fontSize: Math.max(16, p.fontSize - 3) }))}
                  className="p-3 min-w-[44px] min-h-[44px] text-slate-400 hover:text-white rounded cursor-pointer"
                  title="Decrease font size (-)"
                  aria-label="Decrease font size"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs font-mono font-bold px-2 text-white">
                  {config.fontSize}px
                </span>
                <button
                  onClick={() => setConfig((p) => ({ ...p, fontSize: Math.min(120, p.fontSize + 3) }))}
                  className="p-3 min-w-[44px] min-h-[44px] text-slate-400 hover:text-white rounded cursor-pointer"
                  title="Increase font size (+)"
                  aria-label="Increase font size"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Toggle Column structure */}
              <button
                onClick={() => setConfig((p) => ({ ...p, twoColumns: !p.twoColumns }))}
                className={`p-2 rounded cursor-pointer transition-all border ${
                  config.twoColumns ? 'bg-amber-500 border-amber-500 text-black' : 'bg-zinc-900/60 border-[#1E202B] text-slate-400'
                }`}
                title="Toggle double columns layout"
                aria-label="Toggle columns layout"
              >
                <Columns className="h-3.5 w-3.5" />
              </button>

              {/* Native Browser Full Screen Toggle */}
              <button
                onClick={toggleNativeFullscreen}
                className={`p-2 rounded cursor-pointer transition-all border ${
                  isNativeFullscreen
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                    : 'bg-zinc-900/60 border-[#1E202B] text-slate-400 hover:text-white'
                }`}
                title={isNativeFullscreen ? "Exit Fullscreen (F)" : "Cover Full Screen (F)"}
                aria-label="Toggle Fullscreen"
              >
                {isNativeFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>

              {/* Blackout Toggle Button */}
              <button
                onClick={() => setIsBlackout((p) => !p)}
                className={`p-2 rounded cursor-pointer transition-all border ${
                  isBlackout
                    ? 'bg-rose-500 border-rose-500 text-white animate-pulse'
                    : 'bg-zinc-900/60 border-[#1E202B] text-slate-400 hover:text-white'
                }`}
                title="Toggle Blackout Stage (B or .)"
                aria-label="Toggle Blackout"
              >
                <EyeOff className="h-3.5 w-3.5" />
              </button>

              {/* Keyboard Shortcuts Guide */}
              <button
                onClick={() => setShowKeyboardHelp(true)}
                className="p-2 rounded cursor-pointer transition-all border bg-zinc-900/60 border-[#1E202B] text-slate-400 hover:text-amber-400 hover:border-amber-500/40"
                title="Worship Leader Hotkeys (?)"
                aria-label="Worship Leader Hotkeys"
              >
                <Keyboard className="h-3.5 w-3.5" />
              </button>

              {/* 🎨 Brush Customizer Button + Floating Popover */}
              <div className="relative">
                <button
                  onClick={() => setShowDesktopCustomizer(p => !p)}
                  className={`p-2 rounded cursor-pointer transition-all border ${
                    showDesktopCustomizer
                      ? 'bg-amber-500 border-amber-500 text-black'
                      : 'bg-zinc-900/60 border-[#1E202B] text-slate-400 hover:text-amber-400 hover:border-amber-500/40'
                  }`}
                  title="Customize appearance"
                  aria-label="Open theme customizer"
                >
                  <Paintbrush className="h-3.5 w-3.5" />
                </button>

                {showDesktopCustomizer && renderCustomizerPopover()}
              </div>

              {/* Exit Presentation */}
              <button
                id="close-stage-btn"
                onClick={handleExitStage}
                className="cursor-pointer p-2 hover:bg-rose-500/15 text-slate-400 hover:text-rose-455 rounded transition-all"
                title="Exit Presentation (Esc)"
                aria-label="Exit presentation"
              >
                <Minimize className="h-4 w-4" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between w-full gap-2 select-none">
            <button 
              onClick={handleExitStage} 
              className="p-2 bg-zinc-900/60 border border-[#1E202B] text-zinc-400 hover:text-white rounded active-touch"
              aria-label="Exit presentation"
            >
              <Minimize className="h-[18px] w-[18px]" />
            </button>
            <div className="text-center select-none truncate flex-1 px-2">
              <div className="text-xs font-bold text-white truncate">{song.title}</div>
              <div className="text-[9px] font-mono text-zinc-555 uppercase mt-0.5 tracking-wider">
                {viewMode === 'scroll' ? 'Scroll View' : `Stanza ${currentSlideIndex + 1}`}
                {isFollowing && <span className="text-emerald-500 ml-1.5 font-bold animate-pulse">• Live Sync</span>}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {/* Native Fullscreen Button Mobile */}
              <button
                onClick={toggleNativeFullscreen}
                className={`p-2 rounded border active-touch transition-all ${
                  isNativeFullscreen
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                    : 'bg-zinc-900/60 border border-[#1E202B] text-zinc-400'
                }`}
                title={isNativeFullscreen ? "Exit Fullscreen (F)" : "Cover Full Screen (F)"}
                aria-label="Toggle Fullscreen"
              >
                {isNativeFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setIsBlackout((p) => !p)}
                className={`p-2 rounded border active-touch transition-all ${
                  isBlackout
                    ? 'bg-rose-500 border-rose-500 text-white'
                    : 'bg-zinc-900/60 border border-[#1E202B] text-zinc-400'
                }`}
                title="Blackout Stage (B)"
                aria-label="Toggle Blackout"
              >
                <EyeOff className="h-4 w-4" />
              </button>
              <button
                onClick={() => setShowKeyboardHelp(true)}
                className="p-2 bg-zinc-900/60 border border-[#1E202B] text-zinc-400 hover:text-amber-400 rounded active-touch"
                title="Shortcuts (?)"
                aria-label="Keyboard Shortcuts"
              >
                <Keyboard className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  const val = !isFollowing;
                  setIsFollowing(val);
                  localStorage.setItem('dasong_live_follow', val ? 'true' : 'false');
                }}
                className={`p-2 rounded border active-touch transition-all ${
                  isFollowing
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse'
                    : 'bg-zinc-900/60 border border-[#1E202B] text-zinc-400'
                }`}
                title="Follow Live Sync"
                aria-label="Follow live broadcast"
              >
                <Radio className="h-4 w-4" />
              </button>
              {/* 🎨 Brush Customizer Button (Same as Desktop) */}
              <div className="relative">
                <button
                  onClick={() => setShowDesktopCustomizer(p => !p)}
                  className={`p-2 rounded cursor-pointer transition-all border ${
                    showDesktopCustomizer
                      ? 'bg-amber-500 border-amber-500 text-black'
                      : 'bg-zinc-900/60 border-[#1E202B] text-slate-400 hover:text-amber-400 hover:border-amber-500/40'
                  }`}
                  title="Customize appearance"
                  aria-label="Open theme customizer"
                >
                  <Paintbrush className="h-4 w-4" />
                </button>

                {showDesktopCustomizer && renderCustomizerPopover()}
              </div>
            </div>
          </div>
        )}
      </div>


      {viewMode === 'scroll' ? (
        /* Immersive Scroll container */
        <div
          id="lyrics-scroll-container"
          ref={scrollContainerRef}
          onClick={handleLyricsTouch}
          className="flex-1 overflow-y-auto px-6 py-12 md:px-16 cursor-pointer relative"
        >
          <div className={`mx-auto transition-all ${config.twoColumns ? 'max-w-7xl' : 'max-w-3xl'}`}>
            {config.twoColumns ? (
              (() => {
                const mid = Math.ceil(sections.length / 2);
                const leftSections = sections.slice(0, mid).join('\n\n');
                const rightSections = sections.slice(mid).join('\n\n');
                return (
                  <div className="grid grid-cols-2 gap-x-12 items-start">
                    <div>{renderFormattedLyrics(leftSections)}</div>
                    <div>{renderFormattedLyrics(rightSections)}</div>
                  </div>
                );
              })()
            ) : (
              renderFormattedLyrics()
            )}

            {/* Scroll bottom spacer padding */}
            <div className="h-[40vh]" />
          </div>

          {/* Mobile floating speed controls — visible during auto-scroll */}
          {!isLargeScreen && scrolling && (
            <div className="fixed right-3 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setConfig(p => ({ ...p, autoScrollSpeed: Math.min(10, p.autoScrollSpeed + 1) }))}
                className="w-11 h-11 rounded bg-black/75 border border-[#1E202B] text-white text-lg font-bold flex items-center justify-center active:scale-90 transition-all"
                title="Faster"
                aria-label="Increase scroll speed"
              >＋</button>
              <div className="w-11 h-8 rounded bg-black/50 border border-[#1E202B] text-amber-400 text-[10px] font-mono font-bold flex items-center justify-center">
                {config.autoScrollSpeed}x
              </div>
              <button
                onClick={() => setConfig(p => ({ ...p, autoScrollSpeed: Math.max(1, p.autoScrollSpeed - 1) }))}
                className="w-11 h-11 rounded bg-black/75 border border-[#1E202B] text-white text-lg font-bold flex items-center justify-center active:scale-90 transition-all"
                title="Slower"
                aria-label="Decrease scroll speed"
              >－</button>
              <button
                onClick={() => setScrolling(false)}
                className="w-11 h-11 rounded bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold flex items-center justify-center active:scale-90 transition-all mt-1"
                title="Stop scroll"
                aria-label="Stop auto-scroll"
              >⏹</button>
            </div>
          )}
        </div>
      ) : (
        /* Immersive Slides Presentation Stage — Covers 100% of Entire Screen */
        <div 
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="flex-1 w-full h-full flex flex-col justify-center items-center relative p-0 select-none overflow-hidden"
        >
          {/* Edge Left Navigation Arrow */}
          {currentSlideIndex > 0 && (
            <button
              onClick={() => setCurrentSlideIndex(prev => Math.max(0, prev - 1))}
              className={`absolute left-3 md:left-6 top-1/2 -translate-y-1/2 p-3 sm:p-4 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 hover:bg-black/90 transition-all text-slate-300 hover:text-white cursor-pointer active-touch z-25 duration-300 ${showHeader ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              title="Previous Slide (← / ↑)"
              aria-label="Previous slide"
            >
              <ChevronLeft className="h-6 w-6 sm:h-8 sm:w-8 stroke-[3]" />
            </button>
          )}

          {/* Edge Right Navigation Arrow */}
          {currentSlideIndex < sections.length - 1 && (
            <button
              onClick={() => setCurrentSlideIndex(prev => Math.min(sections.length - 1, prev + 1))}
              className={`absolute right-3 md:right-6 top-1/2 -translate-y-1/2 p-3 sm:p-4 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 hover:bg-black/90 transition-all text-slate-300 hover:text-white cursor-pointer active-touch z-25 duration-300 ${showHeader ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              title="Next Slide (→ / ↓ / Space)"
              aria-label="Next slide"
            >
              <ChevronRight className="h-6 w-6 sm:h-8 sm:w-8 stroke-[3]" />
            </button>
          )}

          {/* Active slide container — Takes 100% full screen edge-to-edge */}
          <div className="w-full h-full flex items-center justify-center p-2 sm:p-6 md:p-10 my-auto">
            {renderActiveSlide()}
          </div>

          {/* Bottom Slides progress navigation bar overlay */}
          <div className={`absolute bottom-3 left-0 right-0 flex flex-col items-center gap-1.5 z-20 select-none transition-all duration-300 ${showHeader ? 'opacity-100 translate-y-0' : 'opacity-0 pointer-events-none translate-y-3'}`}>
            {/* Jump Dots Rack */}
            <div className="flex flex-wrap items-center justify-center gap-2 max-w-[85vw] bg-black/50 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10">
              {sections.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentSlideIndex(idx)}
                  className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
                    currentSlideIndex === idx
                      ? 'bg-amber-400 scale-150 ring-2 ring-amber-400/40'
                      : 'bg-white/30 hover:bg-white/60'
                  }`}
                  title={`Go to Slide ${idx + 1}`}
                />
              ))}
            </div>
            
            {/* Slide Index Summary */}
            <div className="text-[10px] font-mono tracking-widest text-zinc-400 uppercase bg-black/50 backdrop-blur-md px-2.5 py-0.5 rounded-md border border-white/10">
              Slide <span className="text-amber-400 font-bold">{currentSlideIndex + 1}</span> of {sections.length}
            </div>
          </div>

        </div>
      )}

      {/* Precision 2D Color Picker Modal for Stage Mode */}
      <ColorPickerModal
        isOpen={activeColorPicker !== null}
        onClose={() => setActiveColorPicker(null)}
        title={activeColorPicker === 'bg' ? 'Stage Background Color' : 'Stage Text Color'}
        currentColorHex={activeColorPicker === 'bg' ? config.customBg : config.customTextColor}
        defaultColor={activeColorPicker === 'bg' ? '#0d0d0d' : '#f4f4f5'}
        resetLabel={activeColorPicker === 'bg' ? 'Reset to Dark' : 'Reset to White'}
        disableGlobalThemeAccent={true}
        onColorChange={(hex) => {
          if (activeColorPicker === 'bg') {
            setConfig(p => ({ ...p, customBg: hex }));
          } else if (activeColorPicker === 'text') {
            setConfig(p => ({ ...p, customTextColor: hex }));
          }
        }}
      />

      {/* Blackout Fullscreen Screen */}
      {isBlackout && (
        <div
          onClick={() => setIsBlackout(false)}
          className="fixed inset-0 z-[100] bg-black cursor-pointer flex flex-col items-center justify-center select-none group"
        >
          <div className="opacity-40 group-hover:opacity-100 transition-opacity bg-zinc-900/90 border border-zinc-700/60 px-5 py-2.5 rounded-2xl flex items-center gap-3 text-xs text-zinc-300 shadow-2xl backdrop-blur-md">
            <EyeOff className="h-4 w-4 text-rose-400" />
            <span>Blackout Active — Press <kbd className="font-mono font-bold text-amber-400 bg-black/60 px-2 py-0.5 rounded border border-zinc-700">B</kbd> or tap anywhere to resume</span>
          </div>
        </div>
      )}

      {/* Keyboard Help Modal */}
      <KeyboardHelpModal
        isOpen={showKeyboardHelp}
        onClose={() => setShowKeyboardHelp(false)}
      />

    </div>
  );
});
