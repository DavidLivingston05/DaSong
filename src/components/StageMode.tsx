import React, { useEffect, useRef, useState } from 'react';
import { Minimize, Play, Pause, RotateCcw, ZoomIn, ZoomOut, Columns, Type, Check, RefreshCw, ChevronLeft, ChevronRight, Presentation, FileText, Radio } from 'lucide-react';
import { Song, PresentationConfig } from '../types';
import { stripChords } from '../utils/chordTransposer';
import { getBroadcastState } from '../lib/db';

interface StageModeProps {
  song: Song;
  onClose: () => void;
  broadcastSlideIndex?: number;
  onSelectSong?: (id: string) => void;
}

export default function StageMode({ song, onClose, broadcastSlideIndex, onSelectSong }: StageModeProps) {
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
    const intervalId = setInterval(checkBroadcast, 2000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [isFollowing, song.id, onSelectSong, viewMode, lyrics]);

  // Listen for screen dimensions to restrict slides option on mobile
  useEffect(() => {
    const checkScreenSize = () => {
      const isLarge = window.innerWidth >= 768;
      setIsLargeScreen(isLarge);
      if (!isLarge) {
        setViewMode('scroll');
      }
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
          className={`mb-6 p-5 rounded-2xl break-inside-avoid transition-all duration-300 ${
            isSectionHighlighted
              ? 'bg-amber-500/10 border border-amber-500/35 shadow-[0_0_20px_rgba(245,158,11,0.15)]'
              : (isChorus
                  ? 'border-l-4 border-amber-600 bg-amber-500/5 dark:bg-amber-400/5 border-transparent'
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
              : (isLightTheme ? 'text-stone-900 font-bold' : 'text-zinc-350 font-medium tracking-wide');

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
        return 'bg-black text-zinc-150';
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
      <div id="stage-bar" className={`flex items-center justify-between p-3.5 border-b border-white/10 bg-[#070708] backdrop-blur-md z-10 font-sans transition-transform duration-300 ${showHeader ? 'translate-y-0' : '-translate-y-full absolute w-full'}`}>

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
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border cursor-pointer transition-all text-[10px] font-bold uppercase tracking-wider ${
              isFollowing
                ? 'bg-emerald-500 border-emerald-500 text-black shadow-[0_0_10px_rgba(16,185,129,0.3)] animate-pulse'
                : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
            }`}
            title="Follow Live Service Broadcast"
          >
            <Radio className="h-3 w-3" />
            <span>{isFollowing ? 'Syncing' : 'Follow'}</span>
          </button>

          {/* Scroll vs Slides View Toggles (Visible only on Tablets & Desktops) */}
          {isLargeScreen && (
            <div className="flex gap-1 bg-white/5 p-1 rounded-full border border-white/10 shrink-0 select-none">
              <button
                onClick={() => {
                  setViewMode('scroll');
                  setScrolling(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-bold transition-all cursor-pointer ${
                  viewMode === 'scroll'
                    ? 'bg-amber-500 text-black font-black'
                    : 'text-slate-450 hover:text-white'
                }`}
                title="Continuous Scroll View"
              >
                <FileText className="h-3 w-3" /> Scroll
              </button>
              <button
                onClick={() => {
                  setViewMode('slides');
                  setScrolling(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-bold transition-all cursor-pointer ${
                  viewMode === 'slides'
                    ? 'bg-amber-500 text-black font-black'
                    : 'text-slate-450 hover:text-white'
                }`}
                title="Stanza Slide Presentation"
              >
                <Presentation className="h-3 w-3" /> Slides
              </button>
            </div>
          )}
          {/* Font Controls */}
          <div className="flex items-center bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
            <button
              onClick={() => setConfig((p) => ({ ...p, fontSize: Math.max(16, p.fontSize - 3) }))}
              className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
              title="Decrease font size"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs font-mono font-bold px-2 text-white">
              {config.fontSize}px
            </span>
            <button
              onClick={() => setConfig((p) => ({ ...p, fontSize: Math.min(50, p.fontSize + 3) }))}
              className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
              title="Increase font size"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Toggle Column structure */}
          <button
            onClick={() => setConfig((p) => ({ ...p, twoColumns: !p.twoColumns }))}
            className={`p-2 rounded-full border cursor-pointer transition-all ${
              config.twoColumns ? 'bg-amber-500 border-amber-500 text-black' : 'bg-white/5 border-white/10 text-slate-400'
            }`}
            title="Toggle double columns layout"
          >
            <Columns className="h-3.5 w-3.5" />
          </button>

          {/* Auto Scroll Controller */}
          <div className="flex items-center gap-2 bg-white/5 p-1 rounded-full border border-white/10">
            <button
              onClick={() => setScrolling((prev) => !prev)}
              className={`p-1.5 rounded-full cursor-pointer ${scrolling ? 'bg-amber-500 text-black' : 'text-slate-400'}`}
              title={scrolling ? 'Pause scroll' : 'Start auto-scroll'}
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
            />
            <span className="text-[10px] font-mono text-slate-400 pr-2">
              Spd {config.autoScrollSpeed}
            </span>
          </div>

          {/* Theme selection dropdown/buttons */}
          <div className="flex gap-1 bg-white/5 p-1 rounded-full border border-white/10">
            {(['dark', 'parchment', 'classic', 'retro-terminal'] as const).map((t) => (
              <button
                key={t}
                onClick={() => changeTheme(t)}
                className={`w-5 h-5 rounded-full border flex items-center justify-center capitalize text-[8px] transition-all cursor-pointer ${
                  t === 'dark'
                    ? 'bg-stone-900 border-white/10'
                    : t === 'parchment'
                      ? 'bg-[#F9F6EE] border-stone-400'
                      : t === 'classic'
                        ? 'bg-white border-slate-300'
                        : 'bg-black border-emerald-500 text-[#00FF55]'
                }`}
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
            className="cursor-pointer p-2 hover:bg-rose-500/15 text-slate-450 hover:text-rose-450 rounded-full transition-all"
            title="Exit Presentation"
          >
            <Minimize className="h-4 w-4" />
          </button>
        </div>
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
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full bg-black/60 border border-white/8 text-[10px] text-stone-400 flex items-center gap-2.5 backdrop-blur-sm select-none pointer-events-none whitespace-nowrap">
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
                className="w-10 h-10 rounded-xl bg-black/70 border border-white/15 text-white text-lg font-bold flex items-center justify-center active:scale-90 transition-all backdrop-blur-sm shadow-lg"
                title="Faster"
              >＋</button>
              <div className="w-10 h-8 rounded-lg bg-black/50 border border-white/10 text-amber-400 text-[10px] font-mono font-bold flex items-center justify-center">
                {config.autoScrollSpeed}x
              </div>
              <button
                onClick={() => setConfig(p => ({ ...p, autoScrollSpeed: Math.max(1, p.autoScrollSpeed - 1) }))}
                className="w-10 h-10 rounded-xl bg-black/70 border border-white/15 text-white text-lg font-bold flex items-center justify-center active:scale-90 transition-all backdrop-blur-sm shadow-lg"
                title="Slower"
              >－</button>
              <button
                onClick={() => setScrolling(false)}
                className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold flex items-center justify-center active:scale-90 transition-all backdrop-blur-sm shadow-lg mt-1"
                title="Stop scroll"
              >⏹</button>
            </div>
          )}
        </div>
      ) : (
        /* Immersive Slides Presentation Stage */
        <div className="flex-1 flex flex-col justify-between items-center relative py-8 px-12 md:px-24 select-none">
          
          {/* Edge Left Navigation Arrow */}
          {currentSlideIndex > 0 ? (
            <button
              onClick={() => setCurrentSlideIndex(prev => Math.max(0, prev - 1))}
              className={`absolute left-4 top-1/2 -translate-y-1/2 p-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-slate-450 hover:text-white cursor-pointer active-touch z-25 shadow-lg duration-300 ${showHeader ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              title="Previous Slide"
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
              className={`absolute right-4 top-1/2 -translate-y-1/2 p-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-slate-450 hover:text-white cursor-pointer active-touch z-25 shadow-lg duration-300 ${showHeader ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              title="Next Slide"
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
                      ? 'bg-amber-500 scale-125 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                      : 'bg-white/20 hover:bg-white/40'
                  }`}
                  title={`Go to Slide ${idx + 1}`}
                />
              ))}
            </div>
            
            {/* Slide Index Summary */}
            <div className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase">
              Slide <span className="text-amber-500/80 font-bold">{currentSlideIndex + 1}</span> of {lyrics.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\s*\n+/).filter(Boolean).length}
            </div>
          </div>

        </div>
      )}
      {/* Mobile close button — large tap target at the very bottom, always visible */}
      {!isLargeScreen && (
        <button
          onClick={onClose}
          className="absolute bottom-6 pb-safe right-4 z-30 flex items-center gap-2 px-5 py-3 bg-zinc-900/90 border border-zinc-700 text-white text-xs font-bold rounded-2xl shadow-xl backdrop-blur-sm active:scale-95 transition-all cursor-pointer"
          title="Close Presentation"
        >
          <span className="text-base leading-none">✕</span>
          <span>Close</span>
        </button>
      )}

    </div>
  );
}
