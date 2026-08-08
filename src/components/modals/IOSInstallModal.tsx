import React from 'react';
import { Smartphone, X, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface IOSInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function IOSInstallModal({ isOpen, onClose }: IOSInstallModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={onClose}
        >
          <motion.div
            id="ios-install-modal" role="dialog" aria-modal="true" aria-label="Save to Home Screen"
            initial={{ y: '20px', opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: '20px', opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="bg-[#070708] w-full h-auto md:max-w-md rounded-t-3xl md:rounded-3xl p-6 space-y-5 shadow-2xl border-t md:border border-white/10 text-slate-350 bottom-sheet-mobile overflow-y-auto pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-amber-500" /> Save to Home Screen
              </h3>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-white/5 rounded-full text-slate-400 cursor-pointer active-touch transition-colors"
                aria-label="Close dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-amber-500/5 rounded-2xl border border-amber-500/10 text-[11px] text-amber-400 font-medium leading-relaxed flex gap-2">
                <HelpCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p>
                  To install, you must open this website in the iOS <strong className="text-white">Safari</strong> browser. Third-party in-app browsers do not support direct addition.
                </p>
              </div>

              <div className="space-y-4 pt-1 font-sans">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-mono font-bold text-amber-500 flex items-center justify-center shrink-0">
                    1
                  </div>
                  <div className="flex-1 text-xs">
                    <p className="text-white font-bold">Tap the Safari Share Button</p>
                    <p className="text-zinc-400 mt-0.5 leading-relaxed">
                      Tap the standard sharing icon in Safari's bottom browser bar (or top toolbar on iPad):
                    </p>
                    <div className="mt-2 inline-flex items-center gap-1.5 bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800">
                      <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />
                      </svg>
                      <span className="text-[10px] text-zinc-300 font-bold uppercase tracking-wider font-mono">Safari Share</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-mono font-bold text-amber-500 flex items-center justify-center shrink-0">
                    2
                  </div>
                  <div className="flex-1 text-xs">
                    <p className="text-white font-bold">Select "Add to Home Screen"</p>
                    <p className="text-zinc-400 mt-0.5 leading-relaxed">
                      Scroll down the options page in the share menu sheet and select:
                    </p>
                    <div className="mt-2 inline-flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800">
                      <div className="w-[18px] h-[18px] rounded bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-300 font-extrabold text-[10px]">
                        +
                      </div>
                      <span className="text-[10px] text-zinc-300 font-bold uppercase tracking-wider font-mono">Add to Home Screen</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-mono font-bold text-amber-500 flex items-center justify-center shrink-0">
                    3
                  </div>
                  <div className="flex-1 text-xs">
                    <p className="text-white font-bold">Confirm App Details</p>
                    <p className="text-zinc-400 mt-0.5 leading-relaxed">
                      Tap the <strong className="text-white">Add</strong> button in the top-right corner to complete the installation process. The icon will appear instantly on your home screen!
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-white/5 flex">
              <button
                type="button"
                onClick={onClose}
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-extrabold py-2.5 px-4 rounded-xl text-xs transition-colors cursor-pointer active-touch text-center"
              >
                Close Instructions
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
