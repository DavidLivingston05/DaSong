import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Volume2, VolumeX, Compass } from 'lucide-react';
import { PlaybackStatus } from '../types';

interface MetronomeProps {
  initialBpm?: number;
  compact?: boolean;
}

function Metronome({ initialBpm = 72, compact = false }: MetronomeProps) {
  const [bpm, setBpm] = useState<number>(initialBpm);
  const [beatsPerMeasure, setBeatsPerMeasure] = useState<number>(4);
  const [status, setStatus] = useState<PlaybackStatus>('idle');
  const [currentBeat, setCurrentBeat] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const audioContextRef = useRef<AudioContext | null>(null);
  const timerIdRef = useRef<number | null>(null);
  const nextNoteTimeRef = useRef<number>(0);
  const beatRef = useRef<number>(0);
  const secondsPerBeatRef = useRef<number>(60 / bpm);

  // Sync state BPM to ref
  useEffect(() => {
    secondsPerBeatRef.current = 60 / bpm;
  }, [bpm]);

  // Handle external initial BPM change
  useEffect(() => {
    if (initialBpm) {
      setBpm(initialBpm);
    }
  }, [initialBpm]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      stopMetronome();
    };
  }, []);

  const initAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  };

  const playClick = (time: number, isFirstBeat: boolean) => {
    if (!audioContextRef.current || !soundEnabled) return;

    const osc = audioContextRef.current.createOscillator();
    const gainNode = audioContextRef.current.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);

    // High accent tone for first beat of measure, lower for normal beats
    osc.frequency.setValueAtTime(isFirstBeat ? 1000 : 700, time);
    
    // Smooth decay to sound like woodblock
    gainNode.gain.setValueAtTime(0.6, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    osc.start(time);
    osc.stop(time + 0.12);
  };

  const scheduler = () => {
    if (!audioContextRef.current) return;

    // Schedule 100ms in advance
    while (nextNoteTimeRef.current < audioContextRef.current.currentTime + 0.1) {
      const beat = beatRef.current;
      const isFirstBeat = beat === 0;

      // Queue audio click
      playClick(nextNoteTimeRef.current, isFirstBeat);

      // Trigger UI change at the same time
      const scheduledTime = nextNoteTimeRef.current;
      const delayedBeatNum = beat;
      
      const delayMs = Math.max(0, (scheduledTime - audioContextRef.current.currentTime) * 1000);
      setTimeout(() => {
        if (audioContextRef.current) {
          setCurrentBeat(delayedBeatNum + 1);
        }
      }, delayMs);

      // Advance next click time
      nextNoteTimeRef.current += secondsPerBeatRef.current;
      // Increment beat
      beatRef.current = (beat + 1) % beatsPerMeasure;
    }

    timerIdRef.current = window.setTimeout(scheduler, 25);
  };

  const startMetronome = () => {
    initAudio();
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    setStatus('playing');
    beatRef.current = 0;
    nextNoteTimeRef.current = audioContextRef.current ? audioContextRef.current.currentTime + 0.05 : 0;
    
    scheduler();
  };

  const stopMetronome = () => {
    if (timerIdRef.current) {
      clearTimeout(timerIdRef.current);
      timerIdRef.current = null;
    }
    setStatus('idle');
    setCurrentBeat(0);
  };

  const toggleMetronome = () => {
    if (status === 'playing') {
      stopMetronome();
    } else {
      startMetronome();
    }
  };

  return (
    <div id="metronome" className={`rounded-md border border-[#1E202B] bg-[#12131A] p-4.5 transition-all duration-300 ${
      compact ? 'w-full' : 'max-w-md'
    }`}>
      <div className="flex items-center justify-between mb-4 border-b border-zinc-900/20 pb-2.5 select-none">
        <div className="flex items-center gap-2">
          <Compass className="h-[18px] w-[18px] text-amber-500 animate-spin" style={{ animationDuration: status === 'playing' ? `${60 / bpm * 2}s` : '8s' }} />
          <span className="text-[10px] font-mono font-bold text-white uppercase tracking-widest">Worship Metronome</span>
        </div>
        <div className="flex items-center gap-1.5 bg-zinc-900/60 px-2.5 py-0.5 rounded border border-[#1E202B]">
          <span className="text-[9px] font-mono font-bold text-amber-500 tracking-wider">
            {beatsPerMeasure}/4 TIME
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* Large Dial & Controls */}
        <div className="flex flex-col items-center justify-center py-2 relative select-none">
          {/* Swinging Pendulum Visualizer */}
          <div className="w-full flex justify-center gap-3 mb-3.5 h-8 items-end relative overflow-hidden">
            {Array.from({ length: beatsPerMeasure }).map((_, index) => {
              const isActive = currentBeat === index + 1;
              const isFirst = index === 0;
              return (
                <div
                  key={index}
                  style={{ transition: 'all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                  className={`h-[18px] rounded-full ${
                    isActive
                      ? isFirst
                        ? 'w-8 bg-amber-500 scale-125' 
                        : 'w-6 bg-amber-500 scale-110'
                      : 'w-[18px] bg-zinc-900/80'
                  }`}
                />
              );
            })}
          </div>

          <div className="text-center">
            <div className="text-3xl font-mono font-bold text-white tracking-tight leading-none">
              {bpm} <span className="text-[10px] font-sans tracking-widest font-extrabold uppercase text-zinc-550 ml-1">BPM</span>
            </div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-amber-500 mt-1.5 font-bold">
              {bpm <= 60 ? 'Adagio (Largo)' : bpm <= 76 ? 'Andante' : bpm <= 120 ? 'Moderato' : bpm <= 156 ? 'Allegro' : 'Presto'}
            </div>
          </div>
        </div>

        {/* BPM Slider */}
        <div className="space-y-2">
          <input
            id="bpm-slider"
            type="range"
            min="40"
            max="220"
            value={bpm}
            onChange={(e) => setBpm(parseInt(e.target.value))}
            className="w-full h-1.5 bg-zinc-900 rounded appearance-none cursor-pointer accent-amber-500 focus:outline-none"
          />
          <div className="flex justify-between text-[9px] font-mono text-zinc-550 font-bold select-none">
            <span>40</span>
            <span>72</span>
            <span>100</span>
            <span>140</span>
            <span>220</span>
          </div>
        </div>

        {/* Control Button Strip */}
        <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-zinc-900/20">
          <div className="flex gap-1 bg-zinc-900/40 p-0.5 rounded select-none">
            {[2, 3, 4, 6].map((bt) => (
              <button
                key={bt}
                onClick={() => {
                  setBeatsPerMeasure(bt);
                  stopMetronome();
                }}
                className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded transition-all cursor-pointer ${
                  beatsPerMeasure === bt
                    ? 'bg-amber-500 text-black font-extrabold shadow-sm'
                    : 'text-zinc-500 hover:text-white hover:bg-zinc-900/60'
                }`}
              >
                {bt}
              </button>
            ))}
          </div>

          <button
            id="metronome-toggle-sound"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-1.5 px-3 text-zinc-400 bg-zinc-900/40 hover:bg-zinc-900 rounded hover:text-white cursor-pointer transition-colors"
            title={soundEnabled ? 'Mute click sound' : 'Enable click sound'}
          >
            {soundEnabled ? <Volume2 className="h-[18px] w-[18px] text-amber-500" /> : <VolumeX className="h-[18px] w-[18px] text-rose-500" />}
          </button>

          <button
            id="metronome-play-btn"
            onClick={toggleMetronome}
            className={`cursor-pointer px-4 py-2 rounded text-[10px] font-mono uppercase tracking-widest font-extrabold leading-normal flex items-center gap-1.5 shadow-sm transition-all duration-300 transform active:scale-95 ${
              status === 'playing'
                ? 'bg-zinc-900/60 text-amber-500 shadow-inner'
                : 'bg-amber-500 hover:bg-amber-400 text-black'
            }`}
          >
            {status === 'playing' ? (
              <>
                <Square className="h-3.5 w-3.5 fill-current" /> Stop
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" /> Play
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default React.memo(Metronome);
