import React, { useEffect } from 'react';
import { X, Keyboard, Music, ArrowDown, ArrowUp, ArrowRight, ArrowLeft, Maximize2, Sparkles } from 'lucide-react';

interface KeyboardHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function KeyboardHelpModal({ isOpen, onClose }: KeyboardHelpModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shortcutGroups = [
    {
      title: 'Lyrics & Stanza Highlighting',
      description: 'Navigate and highlight worship stanzas during singing',
      items: [
        { keys: ['↓', 'J', 'Enter'], desc: 'Next Stanza (highlights & centers)' },
        { keys: ['↑', 'K'], desc: 'Previous Stanza (highlights & centers)' },
        { keys: ['C'], desc: 'Jump directly to Chorus' },
        { keys: ['B'], desc: 'Jump directly to Bridge' },
        { keys: ['Home', '1'], desc: 'Jump to Verse 1 / Top of song' },
      ],
    },
    {
      title: 'Song Navigation',
      description: 'Switch between songs in your setlist or search queue',
      items: [
        { keys: ['→', 'D', 'N'], desc: 'Next Song in queue' },
        { keys: ['←', 'A', 'P'], desc: 'Previous Song in queue' },
        { keys: ['Esc'], desc: 'Back to previous song or search results' },
      ],
    },
    {
      title: 'Stage & Projection Mode',
      description: 'Full-screen projection, clicker remotes & pedals',
      items: [
        { keys: ['F'], desc: 'Toggle Fullscreen (covers entire screen)' },
        { keys: ['H'], desc: 'Hide / Show all options (Clean Screen)' },
        { keys: ['B', '.'], desc: 'Blackout / Blank Stage Screen toggle' },
        { keys: ['Space'], desc: 'Toggle Auto-scroll (Play / Pause)' },
        { keys: ['PageDown', 'PageUp'], desc: 'Next / Previous Slide' },
      ],
    },
    {
      title: 'View & Quick Controls',
      description: 'Fast font sizing and search shortcuts',
      items: [
        { keys: ['+'], desc: 'Increase lyrics font size' },
        { keys: ['-'], desc: 'Decrease lyrics font size' },
        { keys: ['/'], desc: 'Focus Library search bar instantly' },
        { keys: ['?'], desc: 'Show / hide this shortcuts cheat sheet' },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#12131A] border border-amber-500/30 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1E202B] pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl text-amber-400">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Worship Leader Hotkeys
                <span className="text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded">
                  STAGE READY
                </span>
              </h3>
              <p className="text-xs text-zinc-400">
                Optimized for keyboards, presenter remotes & Bluetooth foot pedals
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Shortcuts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {shortcutGroups.map((group, gIdx) => (
            <div
              key={gIdx}
              className="p-4 rounded-xl bg-black/40 border border-[#1E202B] space-y-2.5"
            >
              <div>
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider font-mono">
                  {group.title}
                </h4>
                <p className="text-[11px] text-zinc-500">{group.description}</p>
              </div>

              <div className="space-y-1.5 pt-1">
                {group.items.map((item, iIdx) => (
                  <div
                    key={iIdx}
                    className="flex items-center justify-between gap-2 text-xs py-1"
                  >
                    <span className="text-zinc-300 text-[11.5px] truncate">{item.desc}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.keys.map((k, kIdx) => (
                        <kbd
                          key={kIdx}
                          className="px-2 py-0.5 min-w-[22px] text-center font-mono font-bold text-[11px] bg-zinc-900 border border-zinc-700 text-amber-300 rounded shadow-sm"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Note */}
        <div className="pt-2 border-t border-[#1E202B] flex items-center justify-between text-[11px] text-zinc-500 font-mono">
          <span>Press <kbd className="px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 rounded text-zinc-300">?</kbd> anywhere to toggle this guide</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
