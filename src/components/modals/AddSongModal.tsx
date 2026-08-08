import React from 'react';
import { BookOpen, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AddSongForm {
  title: string;
  author: string;
  key: string;
  bpm: number;
  category: string;
  lyrics: string;
}

interface AddSongModalProps {
  isOpen: boolean;
  onClose: () => void;
  addForm: AddSongForm;
  setAddForm: React.Dispatch<React.SetStateAction<AddSongForm>>;
  onSubmit: (e: React.FormEvent) => Promise<void>;
}

export default function AddSongModal({
  isOpen,
  onClose,
  addForm,
  setAddForm,
  onSubmit,
}: AddSongModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-xs z-40 flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={onClose}
        >
          <motion.div
            id="add-song-modal" role="dialog" aria-modal="true" aria-label="Add New Lyric Sheet"
            initial={{ y: '20px', opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: '20px', opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="bg-[#12131A] w-full h-full md:h-auto md:max-w-2xl rounded-md p-5 md:p-6 space-y-4 shadow-lg border border-[#1E202B] text-zinc-300 overflow-y-auto pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#1E202B] pb-3">
              <h3 className="font-bold text-lg text-white flex items-center gap-1.5 font-sans">
                <BookOpen className="h-5 w-5 text-amber-500" /> Add New Lyric Sheet
              </h3>
              <button
                onClick={onClose}
                className="p-2 hover:bg-[#1A1C26] rounded text-zinc-400 cursor-pointer border border-[#1E202B] hover:text-white transition-colors"
                aria-label="Close dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="md:col-span-2">
                  <label htmlFor="add-title" className="text-xs font-semibold text-slate-400">Song Title *</label>
                  <input
                    id="add-title"
                    type="text"
                    required
                    value={addForm.title}
                    onChange={(e) => setAddForm(p => ({ ...p, title: e.target.value }))}
                    className="mt-1 w-full text-xs p-2.5 rounded border border-[#1E202B] bg-[#090A0F] text-white outline-none focus:border-amber-500/35 transition-all"
                    placeholder="e.g. Cornerstone"
                  />
                </div>

                <div>
                  <label htmlFor="add-author" className="text-xs font-semibold text-slate-400">Author / Artist Name</label>
                  <input
                    id="add-author"
                    type="text"
                    value={addForm.author}
                    onChange={(e) => setAddForm(p => ({ ...p, author: e.target.value }))}
                    className="mt-1 w-full text-xs p-2.5 rounded border border-[#1E202B] bg-[#090A0F] text-white outline-none focus:border-amber-500/35 transition-all"
                    placeholder="e.g. Hillsong Worship"
                  />
                </div>

                <div>
                  <label htmlFor="add-key" className="text-xs font-semibold text-slate-400">Original Key</label>
                  <input
                    id="add-key"
                    type="text"
                    value={addForm.key}
                    onChange={(e) => setAddForm(p => ({ ...p, key: e.target.value }))}
                    className="mt-1 w-full text-xs p-2.5 rounded border border-[#1E202B] bg-[#090A0F] text-white outline-none focus:border-amber-500/35 transition-all font-mono"
                    placeholder="e.g. G"
                  />
                </div>

                <div>
                  <label htmlFor="add-bpm" className="text-xs font-semibold text-slate-400">Tempo Speed (BPM)</label>
                  <input
                    id="add-bpm"
                    type="number"
                    value={addForm.bpm}
                    onChange={(e) => setAddForm(p => ({ ...p, bpm: parseInt(e.target.value) || 72 }))}
                    className="mt-1 w-full text-xs p-2.5 rounded border border-[#1E202B] bg-[#090A0F] text-white outline-none focus:border-amber-500/35 transition-all font-mono"
                  />
                </div>

                <div>
                  <label htmlFor="add-category" className="text-xs font-semibold text-slate-400">Song Category</label>
                  <select
                    id="add-category"
                    value={addForm.category}
                    onChange={(e) => setAddForm(p => ({ ...p, category: e.target.value }))}
                    className="mt-1 w-full text-xs p-2.5 rounded border border-[#1E202B] bg-[#090A0F] text-white outline-none focus:border-amber-500/35 transition-all cursor-pointer"
                  >
                    <option value="Worship">Worship & Adoration (ஆராதனை)</option>
                    <option value="Praise & Thanksgiving">Praise & Thanksgiving (துதி பாடல்கள்)</option>
                    <option value="Holy Spirit">Holy Spirit & Anointing (பரிசுத்த ஆவி)</option>
                    <option value="Communion">Cross & Communion (நற்கருணை)</option>
                    <option value="Grace & Mercy">Grace & Mercy (கிருபை)</option>
                    <option value="Youth">Youth & Celebration (இளைஞர்)</option>
                    <option value="Tamil Worship">Tamil Worship (தமிழ் கீதங்கள்)</option>
                    <option value="Christmas">Christmas & Advent (கிறிஸ்துமஸ்)</option>
                    <option value="Classic Hymn">Classic Hymn (பாரம்பரிய கீதனை)</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="add-lyrics" className="text-xs font-semibold text-slate-400">
                  Song Lyrics / Content *
                </label>
                <textarea
                  id="add-lyrics"
                  required
                  rows={8}
                  value={addForm.lyrics}
                  onChange={(e) => setAddForm(p => ({ ...p, lyrics: e.target.value }))}
                  className="mt-1 w-full text-xs p-3 rounded border border-[#1E202B] bg-[#090A0F] text-white font-mono outline-none focus:border-amber-500/35 transition-all"
                  placeholder={`Amazing grace! How sweet the sound
That saved a wretch like me!`}
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-[#1E202B] pb-6 md:pb-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="premium-btn-secondary px-4 py-2 rounded text-xs font-bold"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  className="premium-btn-primary px-5 py-2 rounded text-xs font-bold flex items-center gap-1.5"
                >
                  <Check className="h-4 w-4 stroke-[3]" /> Save Song to Library
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
