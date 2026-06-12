import React, { useEffect, useRef, useState } from 'react';
import { Minimize, Play, Pause, RotateCcw, ZoomIn, ZoomOut, Columns, Type, Check, RefreshCw, ChevronLeft, ChevronRight, Presentation, FileText } from 'lucide-react';
import { Song, PresentationConfig } from '../types';
import { transposeLyrics, stripChords } from '../utils/chordTransposer';

interface StageModeProps {
  song: Song;
  activeTranspose: number;
  onClose: () => void;
  broadcastSlideIndex?: number;
}

export default function StageMode({ song, activeTranspose, onClose, broadcastSlideIndex }: StageModeProps) {
  const [lyrics, setLyrics] = useState<string>('');
  const [config, setConfig] = useState<PresentationConfig>({
    fontSize: 28,
    theme: 'dark',
    showChords: false,
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

  // Sync transpose and chord preferences to display lyrics
  useEffect(() => {
    let baseLyrics = song.lyrics;
    
    // First apply transposition
    if (activeTranspose !== 0) {
      baseLyrics = transposeLyrics(baseLyrics, activeTranspose);
    }
    
    // Strip chords if hidden
    if (!config.showChords) {
      baseLyrics = stripChords(baseLyrics);
    }

    setLyrics(baseLyrics);
  }, [song.lyrics, activeTranspose, config.showChords]);

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

  // Auto-hide control header when scrolling starts
  useEffect(() => {
    let timer: number;
    if (scrolling) {
      timer = window.setTimeout(() => {
        setShowHeader(false);
      }, 2500);
    } else {
      setShowHeader(true);
    }
    return () => clearTimeout(timer);
  }, [scrolling]);


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

    return sections.map((section, idx) => {
      const isChorus = section.toLowerCase().startsWith('chorus:');
      const lines = section.split('\n');

      return (
        <div
          key={idx}
          className={`mb-6 p-4 rounded-xl break-inside-avoid ${
            isChorus
              ? 'border-l-4 border-amber-600 bg-amber-500/5 dark:bg-amber-400/5'
              : ''
          }`}
        >
          {lines.map((line, lIdx) => {
            // Check if line contains bracketed chords
            if (config.showChords && line.includes('[')) {
              // Parse chords and separate them above the lyrics block for authentic musical sheets
              const chordLine: { chord: string; index: number }[] = [];
              let cleanLine = '';
              let charIndex = 0;

              // Parse matching [CHORD] markers
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

              // Assign custom pro color schemes depending on physical theme
              const isLightTheme = config.theme === 'parchment' || config.theme === 'classic';
              const chordsColor = isLightTheme ? 'text-amber-700' : 'text-amber-400 font-black drop-shadow-[0_0_8px_rgba(245,158,11,0.25)]';
              const lyricsColor = isLightTheme ? 'text-stone-900 font-bold' : 'text-white font-black tracking-wide';

              return (
                <div key={lIdx} className="mb-3.5 leading-relaxed">
                  {/* Chords Line */}
                  <div className={`h-5 font-mono text-xs font-bold select-none relative whitespace-pre flex ${chordsColor}`}>
                    {chordLine.map((c, cIdx) => {
                      const prevOffset = cIdx > 0 ? chordLine[cIdx - 1].index : 0;
                      const spacing = ' '.repeat(Math.max(0, c.index - prevOffset - (cIdx > 0 ? chordLine[cIdx - 1].chord.length : 0)));
                      return (
                        <span key={cIdx}>
                          {spacing}
                          <span className="hover:text-amber-500 cursor-pointer">{c.chord}</span>
                        </span>
                      );
                    })}
                  </div>
                  {/* Lyrics Text Line */}
                  <div className={`font-serif leading-none tracking-wide uppercase ${lyricsColor}`} style={{ fontSize: `${config.fontSize}px` }}>
                    {cleanLine || ' '}
                  </div>
                </div>
              );
            }

            // Normal line or raw header line
            const isLightTheme = config.theme === 'parchment' || config.theme === 'classic';
            const headingColor = isLightTheme ? 'text-amber-800' : 'text-amber-500 font-extrabold';
            const normalColor = isLightTheme ? 'text-stone-900 font-bold' : 'text-zinc-100 font-black tracking-wide';

            return (
              <div
                key={lIdx}
                className={`font-serif leading-relaxed ${
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

    return (
      <div 
        className={`w-full max-w-4xl px-8 py-10 md:py-14 rounded-3xl text-center select-none animate-fadeIn ${
          isChorus 
            ? 'border-2 border-amber-500/20 bg-amber-500/5 shadow-[0_0_30px_rgba(245,158,11,0.05)]' 
            : 'bg-zinc-900/10 border border-white/5 shadow-lg'
        }`}
      >
        {isChorus && (
          <span className="text-[10px] md:text-[11px] font-mono tracking-widest text-amber-400 uppercase font-black px-3 py-1 bg-amber-500/10 border border-amber-500/25 rounded-full select-none mb-6 inline-block">
            Chorus
          </span>
        )}
        
        <div className="space-y-6 md:space-y-8 flex flex-col justify-center min-h-[40vh] py-4">
          {lines.map((line, lIdx) => {
            if (isChorus && line.toLowerCase().startsWith('chorus:')) {
              const remaining = line.slice(7).trim();
              if (!remaining) return null;
            }

            if (config.showChords && line.includes('[')) {
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

              const isLightTheme = config.theme === 'parchment' || config.theme === 'classic';
              const chordsColor = isLightTheme ? 'text-amber-700 font-bold' : 'text-amber-400 font-extrabold drop-shadow-[0_0_12px_rgba(245,158,11,0.3)]';
              const lyricsColor = isLightTheme ? 'text-stone-900 font-black' : 'text-white font-black tracking-wide';

              return (
                <div key={lIdx} className="mb-4 leading-relaxed text-center">
                  <div className={`h-6 font-mono text-sm font-black justify-center flex gap-4 ${chordsColor}`}>
                    {chordLine.map((c, cIdx) => (
                      <span key={cIdx} className="cursor-pointer hover:text-amber-500 transition-colors">
                        [{c.chord}]
                      </span>
                    ))}
                  </div>
                  <div className={`font-serif uppercase tracking-wide leading-normal ${lyricsColor}`} style={{ fontSize: `${config.fontSize * 1.3}px` }}>
                    {cleanLine || ' '}
                  </div>
                </div>
              );
            }

            const isLightTheme = config.theme === 'parchment' || config.theme === 'classic';
            const headingColor = isLightTheme ? 'text-amber-800 font-bold' : 'text-amber-500 font-black';
            const normalColor = isLightTheme ? 'text-stone-900 font-black' : 'text-zinc-100 font-extrabold tracking-wide';

            return (
              <div
                key={lIdx}
                className={`font-serif leading-relaxed ${
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
      
      {/* Dynamic Background Staff Notation Watermark */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] select-none flex items-center justify-center overflow-hidden">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-[120%] h-[120%] text-amber-900 fill-current">
          <path d="M10,20 H90 M10,30 H90 M10,40 H90 M10,50 H90 M10,60 H90" stroke="currentColor" strokeWidth="0.5" />
          <text x="15" y="48" fontSize="24" fontFamily="serif" className="font-bold">𝄞</text>
        </svg>
      </div>

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
              className="absolute left-4 top-1/2 -translate-y-1/2 p-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-slate-450 hover:text-white cursor-pointer active-touch z-25 shadow-lg"
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
              className="absolute right-4 top-1/2 -translate-y-1/2 p-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-slate-450 hover:text-white cursor-pointer active-touch z-25 shadow-lg"
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
          <div className="w-full max-w-xl flex flex-col items-center gap-3.5 z-20 mt-6 bg-black/40 backdrop-blur-xs p-3 rounded-2xl border border-white/5 shadow-md">
            {/* Jump Dots Rack */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-full">
              {lyrics.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\s*\n+/).filter(Boolean).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentSlideIndex(idx)}
                  className={`w-2.5 h-2.5 rounded-full transition-all cursor-pointer ${
                    currentSlideIndex === idx
                      ? 'bg-amber-500 scale-125 shadow-[0_0_10px_rgba(245,158,11,0.6)]'
                      : 'bg-white/20 hover:bg-white/45'
                  }`}
                  title={`Go to Slide ${idx + 1}`}
                />
              ))}
            </div>
            
            {/* Slide Index Summary */}
            <div className="text-[10px] font-mono font-bold tracking-widest text-slate-400 uppercase">
              Slide <span className="text-amber-500 font-extrabold">{currentSlideIndex + 1}</span> of {lyrics.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\s*\n+/).filter(Boolean).length}
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
