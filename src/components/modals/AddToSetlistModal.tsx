import React, { useState } from 'react';
import { Calendar, Plus, Check, X, Music } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Setlist, Song } from '../../types';
import { addSongToSetlist, saveSetlist, SongMetadata } from '../../lib/db';

interface AddToSetlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  song: Song | SongMetadata | null;
  setlists: Setlist[];
  onRefreshSetlists: () => void;
}

export default function AddToSetlistModal({
  isOpen,
  onClose,
  song,
  setlists,
  onRefreshSetlists,
}: AddToSetlistModalProps) {
  const [showNewSetlistForm, setShowNewSetlistForm] = useState<boolean>(false);
  const [newSetName, setNewSetName] = useState<string>('Sunday Morning Worship');
  const [newSetTime, setNewSetTime] = useState<string>('09:00 AM');
  const [newSetDate, setNewSetDate] = useState<string>(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() + (7 - day) % 7;
    const nextSun = new Date(d.setDate(diff));
    return nextSun.toISOString().split('T')[0];
  });
  const [addedSetlistId, setAddedSetlistId] = useState<string | null>(null);
  const [customKey, setCustomKey] = useState<string>(song?.key || 'G');

  React.useEffect(() => {
    if (song?.key) setCustomKey(song.key);
  }, [song]);

  if (!song) return null;

  const handleAdd = async (setlistId: string) => {
    const res = await addSongToSetlist(setlistId, song, customKey);
    if (res.success) {
      setAddedSetlistId(setlistId);
      onRefreshSetlists();
      setTimeout(() => {
        setAddedSetlistId(null);
        onClose();
      }, 1000);
    } else {
      alert(res.message || 'Failed to add song to setlist');
    }
  };

  const handleCreateAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSetName.trim() || !newSetDate.trim()) return;

    const newSetlist: Setlist = {
      id: `setlist_${Date.now()}`,
      name: newSetName.trim(),
      date: newSetDate.trim(),
      time: newSetTime.trim() || undefined,
      songs: [
        {
          id: song.id,
          title: song.title,
          author: song.author,
          key: song.key,
          customKey: customKey || song.key || 'G'
        }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await saveSetlist(newSetlist);
    onRefreshSetlists();
    setShowNewSetlistForm(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none font-sans text-left"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="bg-[#12131A] w-full max-w-md rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xl border border-[#1E202B] text-zinc-300 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#1E202B] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/25">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white leading-tight">Add to Setlist</h3>
                  <p className="text-[11px] text-zinc-400 truncate max-w-[200px]">"{song.title}"</p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-1.5 hover:bg-[#1A1C26] rounded-xl text-zinc-400 hover:text-white transition-colors cursor-pointer border border-[#1E202B]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Key Selector */}
            <div className="flex items-center justify-between bg-[#090A0F] p-3 rounded-xl border border-[#1E202B]">
              <span className="text-xs font-mono text-zinc-400">Perform in Key:</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={customKey}
                  onChange={(e) => setCustomKey(e.target.value)}
                  placeholder="G"
                  className="w-12 text-center text-xs font-mono font-bold text-amber-400 bg-[#12131A] border border-[#1E202B] rounded-lg py-1 outline-none"
                />
              </div>
            </div>

            {/* Existing Setlists List */}
            {!showNewSetlistForm ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-bold">
                    Select Target Service
                  </span>
                  <button
                    onClick={() => setShowNewSetlistForm(true)}
                    className="text-xs font-mono text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Setlist</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {setlists.length > 0 ? (
                    setlists.map((sl) => {
                      const isAlreadyIn = sl.songs.some(s => s.id === song.id);
                      const isJustAdded = addedSetlistId === sl.id;

                      return (
                        <div
                          key={sl.id}
                          onClick={() => !isAlreadyIn && handleAdd(sl.id)}
                          className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                            isJustAdded
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                              : isAlreadyIn
                              ? 'bg-[#090A0F] border-[#1E202B] opacity-60 cursor-default'
                              : 'bg-[#090A0F] border-[#1E202B] hover:border-amber-500/40 hover:bg-[#1A1C26] cursor-pointer'
                          }`}
                        >
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-white truncate">{sl.name}</h4>
                            <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                              📅 {sl.date} • {sl.songs.length} songs
                            </p>
                          </div>

                          <div className="shrink-0">
                            {isJustAdded ? (
                              <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 font-bold">
                                <Check className="w-3.5 h-3.5" /> Added!
                              </span>
                            ) : isAlreadyIn ? (
                              <span className="text-[10px] font-mono text-zinc-500">In Setlist</span>
                            ) : (
                              <button
                                type="button"
                                className="px-3 py-1 bg-amber-500/10 hover:bg-amber-500 text-amber-400 hover:text-black font-bold text-xs rounded-lg transition-all border border-amber-500/20"
                              >
                                + Add
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-6 text-zinc-500 space-y-2">
                      <p className="text-xs">No setlists created yet.</p>
                      <button
                        onClick={() => setShowNewSetlistForm(true)}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl transition-all"
                      >
                        + Create First Setlist
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* New Setlist Quick Form */
              <form onSubmit={handleCreateAndAdd} className="space-y-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[11px] font-mono uppercase font-bold text-zinc-400">
                    Service Name
                  </label>
                  <input
                    type="text"
                    value={newSetName}
                    onChange={(e) => setNewSetName(e.target.value)}
                    placeholder="e.g. Sunday Morning Service"
                    required
                    className="w-full p-2.5 bg-[#090A0F] border border-[#1E202B] focus:border-amber-500/50 rounded-xl text-white outline-none text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-mono uppercase font-bold text-zinc-400">
                      Date
                    </label>
                    <input
                      type="date"
                      value={newSetDate}
                      onChange={(e) => setNewSetDate(e.target.value)}
                      required
                      className="w-full p-2.5 bg-[#090A0F] border border-[#1E202B] focus:border-amber-500/50 rounded-xl text-white outline-none text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-mono uppercase font-bold text-zinc-400">
                      Time
                    </label>
                    <input
                      type="text"
                      value={newSetTime}
                      onChange={(e) => setNewSetTime(e.target.value)}
                      placeholder="09:00 AM"
                      className="w-full p-2.5 bg-[#090A0F] border border-[#1E202B] focus:border-amber-500/50 rounded-xl text-white outline-none text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowNewSetlistForm(false)}
                    className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
                  >
                    Back to List
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl transition-all shadow-md shadow-amber-500/20"
                  >
                    Create & Add Song
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
