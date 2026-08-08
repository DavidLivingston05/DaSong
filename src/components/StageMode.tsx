import React, { useEffect, useRef, useState } from 'react';
import { Minimize, Play, Pause, ZoomIn, ZoomOut, Columns, Type, Check, ChevronLeft, ChevronRight, Presentation, FileText, Radio } from 'lucide-react';
import { Song, PresentationConfig } from '../types';
import { stripChords } from '../utils/chordTransposer';
import { getBroadcastState } from '../lib/db';

interface StageModeProps {
  song: Song;
  onClose: () => void;
  broadcastSlideIndex?: number;
  onSelectSong?: (id: string) => void;
}

export default React.memo(function StageMode({ song, onClose, broadcastSlideIndex, onSelectSong }: StageModeProps) {
  const [lyrics, setLyrics] = useState<string>('');
  const [config, setConfig] = useState<PresentationConfig>({
    fontSize: 28,
    theme: 'dark',
    twoColumns: false,
    autoScrollSpeed: 0 // 0 means stopped
  });

  const [scrolling, setScrolling] = useState<boolean>(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<number | null>(null);
  const [showHeader, setShowHeader] = useState<boolean>(true);
  const lastTapRef = useRef<number>(0);

  // View mode, screen size, and slide presentation states
  const [viewMode, setViewMode] = useState<'scroll' | 'slides'>('scroll');
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0);
  const [isLargeScreen, setIsLargeScreen] = useState<boolean>(false);
  const [showMobileSettings, setShowMobileSettings] = useState<boolean>(false);

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
      const normalizedLyrics = lyrics.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const sections = normalizedLyrics.split(/\n\s*\n+/).filter(Boolean);
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
              const normalizedLyrics = lyrics.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
              const sections = normalizedLyrics.split(/\n\s*\n+/).filter(Boolean);

              let lineCount = 0;
              let targetSlideIndex = 0;
              for (let sIdx = 0; sIdx < sections.length; sIdx++) {
                const sectionLines = sections[sIdx].split('\n').length;
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
    const intervalId = setInterval(checkBroadcast, 400);

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
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (viewMode === 'scroll') {
        if (e.key === ' ') {
          e.preventDefault();
          setScrolling((prev) => !prev);
        } else if (e.key === 'ArrowUp') {
          if (scrollContainerRef.current) scrollContainerRef.current.scrollTop -= 50;
        } else if (e.key === 'ArrowDown') {
          if (scrollContainerRef.current) scrollContainerRef.current.scrollTop += 50;
        }
      } else {
        // Slides presentation mode navigation
        const normalizedLyrics = lyrics.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const sections = normalizedLyrics.split(/\n\s*\n+/).filter(Boolean);
        
        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          setCurrentSlideIndex((prev) => Math.min(sections.length - 1, prev + 1));
        } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
          e.preventDefault();
          setCurrentSlideIndex((prev) => Math.max(0, prev - 1));
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onClose, viewMode, lyrics]);

  // Format the lines beautifully - parse [brackets] into superscript lines or keep inline
  const renderFormattedLyrics = () => {
    // Normalize CRLF to LF and handle spaces/tabs on empty lines separating paragraphs
    const normalizedLyrics = lyrics.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const sections = normalizedLyrics.split(/\n\s*\n+/).filter(Boolean);

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
          className={`mb-6 p-5 rounded break-inside-avoid transition-all duration-300 ${
            isSectionHighlighted
              ? 'bg-amber-500/10 border border-amber-500/35 text-white'
              : (isChorus
                  ? 'border-l-4 border-amber-600 bg-amber-500/5 dark:bg-amber-400/5'
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
            const normalColor = isSectionHighlighted
              ? 'text-white font-extrabold tracking-wide'
              : (isLightTheme ? 'text-stone-900 font-bold' : 'text-zinc-400 font-medium tracking-wide');

            return (
              <div
                key={lIdx}
                id={lineId}
                className={`font-serif leading-relaxed p-1 ${highlightClass} ${
                  line.endsWith(':')
                    ? `mt-3 text-xs uppercase tracking-widest ${headingColor}`
                    : `${normalColor}`
                }`}
                style={{ fontSize: `${line.endsWith(':') ? '12px' : `${config.fontSize}px`}` }}
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
    const normalizedLyrics = lyrics.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const sections = normalizedLyrics.split(/\n\s*\n+/).filter(Boolean);
    
    if (sections.length === 0) return null;
    const section = sections[currentSlideIndex];
    if (!section) return null;

    const isChorus = section.toLowerCase().startsWith('chorus:');
    const lines = section.split('\n');

    // Compute lines offset for slide highlighting
    let activeSlideLineOffset = 0;
    for (let sIdx = 0; sIdx < currentSlideIndex; sIdx++) {
      activeSlideLineOffset += sections[sIdx].split('\n').length;
    }

    const slideLineCount = lines.length;
    const hasActiveLineOnSlide = highlightedLineIndex >= activeSlideLineOffset && highlightedLineIndex < activeSlideLineOffset + slideLineCount;

    return (
      <div className="w-full max-w-5xl px-6 py-6 text-center select-none animate-fadeIn">
        {isChorus && (
          <span className="text-[11px] font-mono tracking-widest text-amber-500/80 uppercase font-bold select-none mb-6 block">
            Chorus
          </span>
        )}
        
        <div className="space-y-6 md:space-y-8 flex flex-col justify-center min-h-[40vh] py-4">
          {lines.map((line, lIdx) => {
            const currentLineIndex = activeSlideLineOffset + lIdx;
            const isHighlighted = currentLineIndex === highlightedLineIndex;
            
            const highlightClass = hasActiveLineOnSlide
              ? (isHighlighted
                  ? 'scale-[1.03] opacity-100 transition-all duration-300 origin-center'
                  : 'opacity-35 transition-all duration-300 origin-center')
              : 'opacity-100 transition-all duration-300 origin-center';

            if (isChorus && line.toLowerCase().startsWith('chorus:')) {
              const remaining = line.slice(7).trim();
              if (!remaining) return null;
            }



            const isLightTheme = config.theme === 'parchment' || config.theme === 'classic';
            const headingColor = isLightTheme ? 'text-amber-800 font-bold' : 'text-amber-500 font-black';
            const normalColor = isLightTheme ? 'text-stone-900 font-black' : 'text-zinc-100 font-extrabold tracking-wide';

            return (
              <div
                key={lIdx}
                className={`font-serif leading-relaxed p-1 ${highlightClass} ${
                  line.endsWith(':')
                    ? `text-sm uppercase tracking-widest ${headingColor} mb-4`
                    : `${normalColor}`
                }`}
                style={{ fontSize: `${line.endsWith(':') ? '14px' : `${config.fontSize * 1.3}px`}` }}
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
      case 'parchment':
        return 'bg-[#F9F6EE] text-[#1C1A17]';
      case 'classic':
        return 'bg-white text-black';
      case 'retro-terminal':
        return 'bg-black text-[#00FF66] font-mono border-emerald-950';
      default: // Pitch black backstage pro teleprompter theme
        return 'bg-black text-zinc-200';
    }
  };

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


  return (
    <div className={`fixed inset-0 z-50 flex flex-col transition-all duration-300 ${currentThemeClasses()}`}>

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
                  onClick={() => {
                    setViewMode('scroll');
                    setScrolling(false);
                  }}
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
                  onClick={() => {
                    setViewMode('slides');
                    setScrolling(false);
                  }}
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
                  title="Decrease font size"
                  aria-label="Decrease font size"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs font-mono font-bold px-2 text-white">
                  {config.fontSize}px
                </span>
                <button
                  onClick={() => setConfig((p) => ({ ...p, fontSize: Math.min(50, p.fontSize + 3) }))}
                  className="p-3 min-w-[44px] min-h-[44px] text-slate-400 hover:text-white rounded cursor-pointer"
                  title="Increase font size"
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

              {/* Auto Scroll Controller */}
              <div className="flex items-center gap-2 bg-zinc-900/60 p-1 rounded border border-[#1E202B]">
                <button
                  onClick={() => setScrolling((prev) => !prev)}
                  className={`p-1.5 rounded cursor-pointer ${scrolling ? 'bg-amber-500 text-black' : 'text-slate-400'}`}
                  title={scrolling ? 'Pause scroll' : 'Start auto-scroll'}
                  aria-label={scrolling ? 'Pause scroll' : 'Start auto-scroll'}
                >
                  {scrolling ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={config.autoScrollSpeed}
                  onChange={(e) => {
                    const speed = parseInt(e.target.value);
                    setConfig((p) => ({ ...p, autoScrollSpeed: speed }));
                    if (speed > 0) setScrolling(true);
                    else setScrolling(false);
                  }}
                  className="w-16 h-1 bg-white/15 rounded accent-amber-500 appearance-none cursor-pointer"
                  title="Auto scroll speed"
                  aria-label="Auto scroll speed"
                />
                <span className="text-[10px] font-mono text-slate-400 pr-2">
                  Spd {config.autoScrollSpeed}
                </span>
              </div>

              {/* Theme selection dropdown/buttons */}
              <div className="flex gap-1 bg-zinc-900/60 p-1 rounded border border-[#1E202B]">
                {(['dark', 'parchment', 'classic', 'retro-terminal'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => changeTheme(t)}
                    className={`w-11 h-11 rounded border flex items-center justify-center capitalize text-[8px] transition-all cursor-pointer ${
                      t === 'dark'
                        ? 'bg-stone-900 border-[#1E202B]'
                        : t === 'parchment'
                          ? 'bg-[#F9F6EE] border-stone-400'
                          : t === 'classic'
                            ? 'bg-white border-slate-355'
                            : 'bg-black border-emerald-500/80 text-[#00FF55]'
                    }`}
                    aria-label={`${t} theme`}
                  >
                    {config.theme === t && (
                      <Check className={`h-2.5 w-2.5 ${t === 'classic' || t === 'parchment' ? 'text-black' : 'text-amber-500'}`} />
                    )}
                   </button>
                ))}
              </div>

              {/* Exit Presentation */}
              <button
                id="close-stage-btn"
                onClick={onClose}
                className="cursor-pointer p-2 hover:bg-rose-500/15 text-slate-400 hover:text-rose-455 rounded transition-all"
                title="Exit Presentation"
                aria-label="Exit presentation"
              >
                <Minimize className="h-4 w-4" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between w-full gap-2 select-none">
            <button 
              onClick={onClose} 
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
              <button
                onClick={() => setShowMobileSettings(true)}
                className="p-2 bg-zinc-900/60 border border-[#1E202B] text-zinc-400 hover:text-white rounded active-touch"
                title="Settings"
                aria-label="Open settings"
              >
                <Type className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hint bar — keyboard shortcuts on desktop, touch gestures on mobile */}
      {isLargeScreen ? (
        <div className="absolute bottom-4 left-4 z-20 px-3 py-1.5 rounded-lg bg-black/60 border border-white/5 text-[10px] text-stone-400 flex items-center gap-3 backdrop-blur-xs select-none pointer-events-none">
          {viewMode === 'scroll' ? (
            <>
              <span><kbd className="bg-white/10 px-1 rounded">Space</kbd> Play/Pause Scroll</span>
              <span>•</span>
              <span><kbd className="bg-white/10 px-1 rounded">↑/↓</kbd> Scroll</span>
            </>
          ) : (
            <>
              <span><kbd className="bg-white/10 px-1 rounded">Space</kbd> / <kbd className="bg-white/10 px-1 rounded">Enter</kbd> / <kbd className="bg-white/10 px-1 rounded">→</kbd> Next Slide</span>
              <span>•</span>
              <span><kbd className="bg-white/10 px-1 rounded">←</kbd> / <kbd className="bg-white/10 px-1 rounded">Backspace</kbd> Prev Slide</span>
            </>
          )}
          <span>•</span>
          <span><kbd className="bg-white/10 px-1 rounded">ESC</kbd> Close</span>
        </div>
      ) : (
        /* Mobile: touch gesture hints instead of keyboard shortcuts */
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-md bg-black/60 border border-[#1E202B] text-[10px] text-stone-400 flex items-center gap-2.5 select-none pointer-events-none whitespace-nowrap">
          <span>👆 Tap – controls</span>
          <span className="text-white/20">·</span>
          <span>👆👆 Double-tap – scroll</span>
          {viewMode === 'slides' && (
            <>
              <span className="text-white/20">·</span>
              <span>◀ ▶ Swipe slides</span>
            </>
          )}
        </div>
      )}

      {viewMode === 'scroll' ? (
        /* Immersive Scroll container */
        <div
          id="lyrics-scroll-container"
          ref={scrollContainerRef}
          onClick={handleLyricsTouch}
          className="flex-1 overflow-y-auto px-6 py-12 md:px-16 cursor-pointer relative"
        >
          <div
            className={`mx-auto transition-all ${
              config.twoColumns
                ? 'max-w-7xl columns-1 lg:columns-2 gap-x-12'
                : 'max-w-3xl'
            }`}
          >
            {renderFormattedLyrics()}
            
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
        /* Immersive Slides Presentation Stage */
        <div 
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="flex-1 flex flex-col justify-between items-center relative py-8 px-12 md:px-24 select-none"
        >
          
          {/* Edge Left Navigation Arrow */}
          {currentSlideIndex > 0 ? (
            <button
              onClick={() => setCurrentSlideIndex(prev => Math.max(0, prev - 1))}
              className={`absolute left-4 top-1/2 -translate-y-1/2 p-4 rounded bg-[#12131A] border border-[#1E202B] hover:bg-zinc-800 transition-all text-slate-400 hover:text-white cursor-pointer active-touch z-25 duration-300 ${showHeader ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              title="Previous Slide"
              aria-label="Previous slide"
            >
              <ChevronLeft className="h-6 w-6 stroke-[3]" />
            </button>
          ) : (
            <div className="absolute left-4 w-14 h-14" />
          )}

          {/* Edge Right Navigation Arrow */}
          {currentSlideIndex < (lyrics.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\s*\n+/).filter(Boolean).length - 1) ? (
            <button
              onClick={() => setCurrentSlideIndex(prev => Math.min(lyrics.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\s*\n+/).filter(Boolean).length - 1, prev + 1))}
              className={`absolute right-4 top-1/2 -translate-y-1/2 p-4 rounded bg-[#12131A] border border-[#1E202B] hover:bg-zinc-800 transition-all text-slate-400 hover:text-white cursor-pointer active-touch z-25 duration-300 ${showHeader ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              title="Next Slide"
              aria-label="Next slide"
            >
              <ChevronRight className="h-6 w-6 stroke-[3]" />
            </button>
          ) : (
            <div className="absolute right-4 w-14 h-14" />
          )}

          {/* Active slide container */}
          <div className="flex-1 flex items-center justify-center w-full my-auto animate-in fade-in duration-300">
            {renderActiveSlide()}
          </div>

          {/* Bottom Slides progress navigation bar */}
          <div className={`w-full max-w-xl flex flex-col items-center gap-2.5 z-20 mt-6 select-none transition-all duration-300 ${showHeader ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {/* Jump Dots Rack */}
            <div className="flex flex-wrap items-center justify-center gap-2 max-w-full">
              {lyrics.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\s*\n+/).filter(Boolean).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentSlideIndex(idx)}
                  className={`w-1.5 h-1.5 rounded-full transition-all cursor-pointer ${
                    currentSlideIndex === idx
                      ? 'bg-amber-500 scale-125'
                      : 'bg-white/20 hover:bg-white/40'
                  }`}
                  title={`Go to Slide ${idx + 1}`}
                />
              ))}
            </div>
            
            {/* Slide Index Summary */}
            <div className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase">
              Slide <span className="text-amber-505 font-bold">{currentSlideIndex + 1}</span> of {lyrics.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\s*\n+/).filter(Boolean).length}
            </div>
          </div>

        </div>
      )}
      {/* Mobile Settings Drawer for Stage Mode */}
      {showMobileSettings && (
        <div 
          className="fixed inset-0 bg-black/85 backdrop-blur-xs z-50 flex items-end justify-center md:hidden"
          onClick={() => setShowMobileSettings(false)}
        >
          <div 
            className="bg-[#12131A] border-t border-[#1E202B] rounded-t-md w-full max-w-md p-5 pb-safe space-y-5 select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header handle */}
            <div className="flex flex-col items-center gap-1.5 cursor-pointer pb-1" onClick={() => setShowMobileSettings(false)}>
              <div className="w-12 h-1 bg-zinc-800 rounded-full"></div>
              <span className="text-[9px] font-mono font-bold tracking-widest text-zinc-500 uppercase mt-1">Stage Settings</span>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 text-left">
              {/* View Mode Selection */}
              <div className="space-y-2 border-b border-[#1E202B] pb-3">
                <span className="text-xs font-bold text-white block font-sans">View Format</span>
                <div className="flex gap-2 p-0.5 bg-zinc-950 rounded border border-[#1E202B]">
                  <button
                    onClick={() => {
                      setViewMode('scroll');
                      setScrolling(false);
                    }}
                    className={`flex-1 py-2 rounded text-[10px] font-bold font-mono uppercase transition-all cursor-pointer ${
                      viewMode === 'scroll'
                        ? 'bg-amber-500 text-black font-extrabold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Scroll
                  </button>
                  <button
                    onClick={() => {
                      setViewMode('slides');
                      setScrolling(false);
                    }}
                    className={`flex-1 py-2 rounded text-[10px] font-bold font-mono uppercase transition-all cursor-pointer ${
                      viewMode === 'slides'
                        ? 'bg-amber-500 text-black font-extrabold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Slides
                  </button>
                </div>
              </div>

              {/* Font controls */}
              <div className="space-y-2 border-b border-[#1E202B] pb-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white block font-sans">Font Scale</span>
                  <span className="text-xs font-mono font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">{config.fontSize}px</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfig((p) => ({ ...p, fontSize: Math.max(16, p.fontSize - 3) }))}
                    className="flex-1 h-10 premium-btn-secondary text-zinc-200 rounded active-touch font-bold cursor-pointer font-sans"
                  >
                    Smaller
                  </button>
                  <button
                    onClick={() => setConfig((p) => ({ ...p, fontSize: Math.min(50, p.fontSize + 3) }))}
                    className="flex-1 h-10 premium-btn-secondary text-zinc-200 rounded active-touch font-bold cursor-pointer font-sans"
                  >
                    Larger
                  </button>
                </div>
              </div>

              {/* Auto Scroll controls */}
              {viewMode === 'scroll' && (
                <div className="space-y-2 border-b border-[#1E202B] pb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white block font-sans">Auto Scroll Speed</span>
                    <span className="text-xs font-mono font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      {scrolling && config.autoScrollSpeed > 0 ? `Speed ${config.autoScrollSpeed}` : 'Stopped'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setScrolling(!scrolling)}
                      className={`flex-1 h-10 border rounded active-touch text-xs font-bold transition-all cursor-pointer font-sans ${
                        scrolling
                          ? 'bg-amber-500 border-amber-500 text-black font-extrabold'
                          : 'bg-zinc-900 border-[#1E202B] text-zinc-305'
                      }`}
                    >
                      {scrolling ? 'Pause Scroll' : 'Start Scroll'}
                    </button>
                    <select
                      value={config.autoScrollSpeed}
                      onChange={(e) => {
                        const speed = Number(e.target.value);
                        setConfig(p => ({ ...p, autoScrollSpeed: speed }));
                        if (speed > 0) setScrolling(true);
                      }}
                      className="bg-zinc-900 text-xs font-bold h-10 px-3 rounded text-amber-550 border border-[#1E202B]"
                    >
                      <option value={0}>0 (Stop)</option>
                      <option value={1}>1x Speed</option>
                      <option value={2}>2x Speed</option>
                      <option value={3}>3x Speed</option>
                      <option value={4}>4x Speed</option>
                      <option value={5}>5x Speed</option>
                      <option value={8}>8x Speed</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Column toggle */}
              {viewMode === 'scroll' && (
                <div className="flex items-center justify-between border-b border-[#1E202B] pb-3">
                  <div>
                    <span className="text-xs font-bold text-white block font-sans">Split Columns</span>
                    <span className="text-[10px] text-zinc-550">Show side-by-side pages on landscape</span>
                  </div>
                  <button
                    onClick={() => setConfig(p => ({ ...p, twoColumns: !p.twoColumns }))}
                    className={`px-4 py-2 rounded border text-xs font-mono font-bold transition-all cursor-pointer ${
                      config.twoColumns ? 'bg-amber-500 border-amber-500 text-black' : 'bg-zinc-900 border-[#1E202B] text-zinc-400'
                    }`}
                  >
                    {config.twoColumns ? 'Double' : 'Single'}
                  </button>
                </div>
              )}

              {/* Theme Selector */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-white block font-sans">Theme Mode</span>
                <div className="grid grid-cols-4 gap-2">
                  {(['dark', 'parchment', 'classic', 'retro-terminal'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => changeTheme(t)}
                      className={`py-2 px-1 rounded border text-[9px] font-bold uppercase transition-all truncate text-center cursor-pointer ${
                        config.theme === t
                          ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                          : 'border-[#1E202B] bg-zinc-955 text-zinc-500'
                      }`}
                    >
                      {t === 'retro-terminal' ? 'Terminal' : t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowMobileSettings(false)}
              className="w-full py-3 premium-btn-primary text-xs font-extrabold rounded active-touch transition-all cursor-pointer"
            >
              DONE / BACK TO STAND
            </button>
          </div>
        </div>
      )}

    </div>
  );
});
