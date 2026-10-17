import React, { useState, useMemo, useCallback } from 'react';
import {
  Calendar, Music, Play, Plus, Trash2, Edit3, Share2, Copy, Check,
  ChevronUp, ChevronDown, Search, X, Sparkles, ArrowRight, Clock,
  RefreshCw, ArrowUp, ArrowDown
} from 'lucide-react';
import { Setlist, SetlistSong, UserRole } from '../types';
import { SongMetadata, saveSetlist, deleteSetlist, fetchSetlistsFromCloud } from '../lib/db';
import { motion, AnimatePresence } from 'motion/react';

interface SetlistManagerProps {
  currentRole: UserRole;
  setlists: Setlist[];
  songsCatalog: SongMetadata[];
  onRefreshSetlists: () => void;
  onSelectSong: (songId: string, setlistSongIds?: string[]) => void;
  onEnterStageMode?: () => void;
}

export default function SetlistManager({
  currentRole,
  setlists,
  songsCatalog,
  onRefreshSetlists,
  onSelectSong,
  onEnterStageMode,
}: SetlistManagerProps) {
  const isAdmin = currentRole === 'admin';
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showEditorModal, setShowEditorModal] = useState<boolean>(false);
  const [editingSetlist, setEditingSetlist] = useState<Setlist | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [quickDateModalSetlist, setQuickDateModalSetlist] = useState<Setlist | null>(null);

  // Manual trigger cloud sync with visual feedback
  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await fetchSetlistsFromCloud();
      onRefreshSetlists();
    } catch (err) {
      console.warn('Sync failed:', err);
    } finally {
      setTimeout(() => setIsSyncing(false), 600);
    }
  };

  // Filtered setlists based on search
  const filteredSetlists = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return setlists;
    return setlists.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.date.includes(q) ||
      (s.time && s.time.toLowerCase().includes(q)) ||
      (s.notes && s.notes.toLowerCase().includes(q)) ||
      s.songs.some(song => song.title.toLowerCase().includes(q) || (song.author && song.author.toLowerCase().includes(q)))
    );
  }, [setlists, searchQuery]);

  // Copy setlist formatted text for WhatsApp/Team sharing
  const handleCopySetlist = (setlist: Setlist) => {
    const lines = [
      `🎵 *${setlist.name.toUpperCase()}*`,
      `📅 *Date:* ${setlist.date}${setlist.time ? ` at ${setlist.time}` : ''}`,
      setlist.notes ? `📝 *Notes:* ${setlist.notes}` : '',
      ``,
      `*ORDER OF SONGS FOR CHOIR:*`,
      ...setlist.songs.map((s, idx) => `${idx + 1}. *${s.title}* ${s.customKey || s.key ? `[Key: ${s.customKey || s.key}]` : ''}`),
      ``,
      `_DaSong Worship Studio • Live Sync_`
    ].filter(Boolean);

    const text = lines.join('\n');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(setlist.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Launch entire setlist playback starting at first song
  const handlePlaySetlist = (setlist: Setlist) => {
    if (setlist.songs.length === 0) return;
    const songIds = setlist.songs.map(s => s.id);
    onSelectSong(songIds[0], songIds);
  };

  // Delete setlist confirm (Admin only)
  const handleDelete = async (id: string, name: string) => {
    if (!isAdmin) return;
    if (!confirm(`Are you sure you want to delete setlist "${name}"?`)) return;
    await deleteSetlist(id);
    onRefreshSetlists();
  };

  return (
    <div className="w-full space-y-6 select-none text-left font-sans">
      {/* 👑 CHOIR & WORSHIP LEADER HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-amber-950/40 via-zinc-900 to-zinc-950 p-5 sm:p-6 rounded-2xl border border-amber-500/25 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/25">
              <Calendar className="w-5 h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Choir & Worship Setlists
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
            Plan services, set theme names, order songs, assign keys, and sync across all devices.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {/* Cloud Sync Refresh */}
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-[#12131A] hover:bg-[#1A1C26] text-zinc-300 hover:text-white border border-[#1E202B] hover:border-amber-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
            title="Sync latest setlists across devices"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sync Cloud</span>
          </button>

          {/* Create New Setlist (Admin Only) */}
          {isAdmin ? (
            <button
              onClick={() => {
                setEditingSetlist(null);
                setShowEditorModal(true);
              }}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs rounded-xl transition-all shadow-lg shadow-amber-500/20 cursor-pointer active-touch shrink-0"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>+ Create Setlist</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-[#12131A] border border-[#1E202B] rounded-xl text-xs text-zinc-400">
              <Calendar className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-medium text-[11px]">Admin Managed Setlists</span>
            </div>
          )}
        </div>
      </div>

      {/* 🔍 SEARCH & FILTER BAR */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search setlists by theme, date (YYYY-MM-DD), or song title..."
            className="w-full bg-[#12131A] text-white text-xs sm:text-sm pl-10 pr-10 py-2.5 sm:py-3 rounded-xl border border-[#1E202B] focus:border-amber-500/50 outline-none transition-all placeholder:text-zinc-500 font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 📋 SETLISTS GRID */}
      {filteredSetlists.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredSetlists.map((setlist) => {
            const songIds = setlist.songs.map(s => s.id);

            return (
              <div
                key={setlist.id}
                className="p-5 rounded-2xl bg-[#12131A] border border-[#1E202B] hover:border-amber-500/35 transition-all shadow-lg flex flex-col justify-between space-y-4 group"
              >
                {/* Header info */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {/* Theme Name */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-base sm:text-lg text-white group-hover:text-amber-400 transition-colors truncate">
                          {setlist.name}
                        </h3>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                          {setlist.songs.length} {setlist.songs.length === 1 ? 'Song' : 'Songs'}
                        </span>
                      </div>

                      {/* Date & Time Badges */}
                      <div className="flex items-center gap-2 flex-wrap text-xs font-mono mt-1 text-zinc-400">
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => setQuickDateModalSetlist(setlist)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#090A0F] border border-[#1E202B] hover:border-amber-500/40 text-amber-400 transition-colors cursor-pointer group/date"
                            title="Click to quickly change date or time"
                          >
                            <Calendar className="w-3.5 h-3.5 text-amber-500" />
                            <span className="font-bold">{setlist.date}</span>
                            {setlist.time && (
                              <>
                                <span className="text-zinc-600">•</span>
                                <Clock className="w-3 h-3 text-zinc-400" />
                                <span>{setlist.time}</span>
                              </>
                            )}
                            <Edit3 className="w-3 h-3 text-zinc-500 group-hover/date:text-amber-400 ml-0.5" />
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#090A0F] border border-[#1E202B] text-amber-400">
                            <Calendar className="w-3.5 h-3.5 text-amber-500" />
                            <span className="font-bold">{setlist.date}</span>
                            {setlist.time && (
                              <>
                                <span className="text-zinc-600">•</span>
                                <Clock className="w-3 h-3 text-zinc-400" />
                                <span>{setlist.time}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleCopySetlist(setlist)}
                        className="p-2 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-[#1E202B] rounded-xl text-xs transition-colors cursor-pointer"
                        title="Copy formatted setlist for WhatsApp"
                      >
                        {copiedId === setlist.id ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Share2 className="w-4 h-4 text-amber-400" />
                        )}
                      </button>

                      {isAdmin && (
                        <>
                          <button
                            onClick={() => {
                              setEditingSetlist(setlist);
                              setShowEditorModal(true);
                            }}
                            className="p-2 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-[#1E202B] hover:border-amber-500/40 rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1"
                            title="Edit Setlist Order & Details"
                          >
                            <Edit3 className="w-4 h-4 text-amber-400" />
                            <span className="hidden sm:inline font-bold text-[11px]">Edit</span>
                          </button>

                          <button
                            onClick={() => handleDelete(setlist.id, setlist.name)}
                            className="p-2 bg-zinc-900/80 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-400 border border-[#1E202B] hover:border-rose-500/30 rounded-xl text-xs transition-colors cursor-pointer"
                            title="Delete Setlist"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {setlist.notes && (
                    <p className="text-xs text-zinc-400 italic line-clamp-2 bg-[#090A0F] p-2.5 rounded-xl border border-[#1E202B]">
                      📝 {setlist.notes}
                    </p>
                  )}
                </div>

                {/* Song List in Setlist (Ordered with Numbers & Keys) */}
                <div className="space-y-1.5 bg-[#090A0F] p-3 rounded-xl border border-[#1E202B]/60 max-h-60 overflow-y-auto">
                  {setlist.songs.length > 0 ? (
                    setlist.songs.map((song, idx) => (
                      <div
                        key={song.id + idx}
                        onClick={() => onSelectSong(song.id, songIds)}
                        className="p-2.5 rounded-xl bg-[#12131A] hover:bg-[#1A1C26] border border-[#1E202B] hover:border-amber-500/30 flex items-center justify-between gap-2 cursor-pointer transition-colors group/item"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-400 font-mono text-xs font-bold flex items-center justify-center shrink-0 border border-amber-500/20">
                            {idx + 1}
                          </span>
                          <span className="text-xs sm:text-sm font-bold text-zinc-200 group-hover/item:text-amber-400 transition-colors truncate">
                            {song.title}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-zinc-900 text-amber-400 border border-zinc-800">
                            Key: {song.customKey || song.key || 'G'}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover/item:text-amber-400 transition-colors" />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 space-y-2">
                      <p className="text-xs text-zinc-500 italic">No songs added to this service yet.</p>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSetlist(setlist);
                            setShowEditorModal(true);
                          }}
                          className="text-xs font-bold text-amber-400 hover:underline cursor-pointer"
                        >
                          + Add Songs to Order
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className="pt-2 border-t border-[#1E202B]/60 flex items-center justify-between gap-3">
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSetlist(setlist);
                        setShowEditorModal(true);
                      }}
                      className="text-xs font-bold text-zinc-400 hover:text-amber-400 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Reorder & Edit Songs</span>
                    </button>
                  ) : (
                    <span className="text-[11px] font-mono text-zinc-500">
                      {setlist.songs.length} {setlist.songs.length === 1 ? 'song' : 'songs'} in worship order
                    </span>
                  )}

                  {setlist.songs.length > 0 && (
                    <button
                      onClick={() => handlePlaySetlist(setlist)}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-xs transition-all shadow-md shadow-amber-500/20 cursor-pointer active-touch ml-auto"
                    >
                      <Play className="w-3.5 h-3.5 fill-black" />
                      <span>Start Worship Service</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty State */
        <div className="text-center py-16 px-4 bg-[#12131A] rounded-2xl border border-[#1E202B] space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-400">
            <Calendar className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-bold text-white">
              {searchQuery ? `No setlists matching "${searchQuery}"` : 'No Worship Setlists Yet'}
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto">
              {searchQuery
                ? 'Try a different search keyword or clear the search query filter.'
                : isAdmin
                  ? 'Create your first service order to organize songs, transpose keys, and sync across your choir team.'
                  : 'Setlists are created and managed by administrators. Once added, you can view and sing them here.'}
            </p>
          </div>
          {isAdmin ? (
            <button
              onClick={() => {
                setEditingSetlist(null);
                setShowEditorModal(true);
              }}
              className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs sm:text-sm rounded-xl transition-all shadow-lg shadow-amber-500/20 cursor-pointer inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Create First Setlist</span>
            </button>
          ) : (
            <p className="text-xs font-mono text-zinc-500">
              Check back soon or sync from the cloud to view new setlists.
            </p>
          )}
        </div>
      )}

      {/* 🚀 QUICK DATE & TIME CHANGER MODAL - Admin Only */}
      {isAdmin && quickDateModalSetlist && (
        <QuickDateChangerModal
          setlist={quickDateModalSetlist}
          onClose={() => setQuickDateModalSetlist(null)}
          onSave={async (updated) => {
            if (!isAdmin) return;
            await saveSetlist(updated);
            onRefreshSetlists();
            setQuickDateModalSetlist(null);
          }}
        />
      )}

      {/* 🛠️ FULL SETLIST EDITOR & SONG ORDER BUILDER MODAL - Admin Only */}
      {isAdmin && (
        <SetlistEditorModal
          isOpen={showEditorModal}
          onClose={() => setShowEditorModal(false)}
          initialSetlist={editingSetlist}
          songsCatalog={songsCatalog}
          onSave={async (setlist) => {
            if (!isAdmin) return;
            await saveSetlist(setlist);
            onRefreshSetlists();
            setShowEditorModal(false);
          }}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------------------
// QUICK DATE & TIME MODAL (1-TAP INSTANT DATE CHANGER)
// -------------------------------------------------------------------------

interface QuickDateChangerModalProps {
  setlist: Setlist;
  onClose: () => void;
  onSave: (setlist: Setlist) => Promise<void>;
}

function QuickDateChangerModal({ setlist, onClose, onSave }: QuickDateChangerModalProps) {
  const [date, setDate] = useState(setlist.date);
  const [time, setTime] = useState(setlist.time || '09:00 AM');
  const [saving, setSaving] = useState(false);

  // Quick preset shortcuts
  const setQuickSunday = (offsetWeeks: number = 0) => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() + (7 - day) % 7 + (offsetWeeks * 7);
    const targetSun = new Date(d.setDate(diff));
    setDate(targetSun.toISOString().split('T')[0]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date.trim()) return;
    setSaving(true);
    try {
      await onSave({
        ...setlist,
        date: date.trim(),
        time: time.trim() || undefined,
        updatedAt: Date.now()
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#12131A] w-full max-w-md rounded-2xl p-5 sm:p-6 space-y-4 border border-[#1E202B] shadow-2xl text-zinc-300">
        <div className="flex items-center justify-between border-b border-[#1E202B] pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-base text-white">Change Service Date & Time</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[#1A1C26] rounded-lg text-zinc-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Quick Date Presets */}
          <div className="space-y-1 text-left">
            <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold">1-Tap Shortcuts</label>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setQuickSunday(0)}
                className="px-2.5 py-1 rounded-lg bg-[#090A0F] hover:bg-[#1A1C26] border border-[#1E202B] text-amber-400 text-xs font-mono font-bold cursor-pointer"
              >
                This Sunday
              </button>
              <button
                type="button"
                onClick={() => setQuickSunday(1)}
                className="px-2.5 py-1 rounded-lg bg-[#090A0F] hover:bg-[#1A1C26] border border-[#1E202B] text-amber-400 text-xs font-mono font-bold cursor-pointer"
              >
                Next Sunday
              </button>
              <button
                type="button"
                onClick={() => setDate(new Date().toISOString().split('T')[0])}
                className="px-2.5 py-1 rounded-lg bg-[#090A0F] hover:bg-[#1A1C26] border border-[#1E202B] text-zinc-300 text-xs font-mono cursor-pointer"
              >
                Today
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1 text-left">
              <label className="text-[11px] font-mono uppercase font-bold text-zinc-400">Date (YYYY-MM-DD)</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full p-2.5 bg-[#090A0F] border border-[#1E202B] focus:border-amber-500/50 rounded-xl text-white outline-none text-xs font-mono"
              />
            </div>
            <div className="space-y-1 text-left">
              <label className="text-[11px] font-mono uppercase font-bold text-zinc-400">Time</label>
              <input
                type="text"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="09:00 AM"
                className="w-full p-2.5 bg-[#090A0F] border border-[#1E202B] focus:border-amber-500/50 rounded-xl text-white outline-none text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-[#1E202B]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl shadow-md cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Update Date & Time'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// FULL SETLIST EDITOR & SONG ORDER BUILDER MODAL
// -------------------------------------------------------------------------

interface SetlistEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSetlist: Setlist | null;
  songsCatalog: SongMetadata[];
  onSave: (setlist: Setlist) => Promise<void>;
}

const COMMON_KEYS = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Bb', 'Eb', 'Ab', 'F#', 'Db'];
const THEME_PRESETS = [
  'Sunday Morning Worship',
  'Sunday Evening Service',
  'Youth Fellowship',
  'Worship & Praise Night',
  'Prayer & Fasting Service',
  'Communion Service',
  'Easter Celebration',
  'Christmas Carol Service'
];

function SetlistEditorModal({
  isOpen,
  onClose,
  initialSetlist,
  songsCatalog,
  onSave,
}: SetlistEditorModalProps) {
  const [name, setName] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('09:00 AM');
  const [notes, setNotes] = useState<string>('');
  const [songs, setSongs] = useState<SetlistSong[]>([]);
  const [songSearchQuery, setSongSearchQuery] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  // Helper to get upcoming Sunday date as default YYYY-MM-DD
  const getDefaultDate = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() + (7 - day) % 7;
    const nextSun = new Date(d.setDate(diff));
    return nextSun.toISOString().split('T')[0];
  };

  React.useEffect(() => {
    if (initialSetlist) {
      setName(initialSetlist.name);
      setDate(initialSetlist.date);
      setTime(initialSetlist.time || '09:00 AM');
      setNotes(initialSetlist.notes || '');
      setSongs(initialSetlist.songs || []);
    } else {
      setName('Sunday Morning Worship');
      setDate(getDefaultDate());
      setTime('09:00 AM');
      setNotes('');
      setSongs([]);
    }
    setSongSearchQuery('');
  }, [initialSetlist, isOpen]);

  // Catalog filtered for adding songs
  const filteredCatalog = useMemo(() => {
    const q = songSearchQuery.trim().toLowerCase();
    if (!q) return songsCatalog.slice(0, 15);
    return songsCatalog
      .filter(s => s.title.toLowerCase().includes(q) || (s.author && s.author.toLowerCase().includes(q)))
      .slice(0, 25);
  }, [songsCatalog, songSearchQuery]);

  const handleAddSong = (catalogSong: SongMetadata) => {
    if (songs.some(s => s.id === catalogSong.id)) return;
    const newSong: SetlistSong = {
      id: catalogSong.id,
      title: catalogSong.title,
      author: catalogSong.author,
      key: catalogSong.key,
      customKey: catalogSong.key || 'G'
    };
    setSongs(prev => [...prev, newSong]);
  };

  const handleRemoveSong = (index: number) => {
    setSongs(prev => prev.filter((_, i) => i !== index));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setSongs(prev => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === songs.length - 1) return;
    setSongs(prev => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleMoveToTop = (index: number) => {
    if (index === 0) return;
    setSongs(prev => {
      const item = prev[index];
      const rest = prev.filter((_, i) => i !== index);
      return [item, ...rest];
    });
  };

  const handleMoveToBottom = (index: number) => {
    if (index === songs.length - 1) return;
    setSongs(prev => {
      const item = prev[index];
      const rest = prev.filter((_, i) => i !== index);
      return [...rest, item];
    });
  };

  const handleKeyChange = (index: number, newKey: string) => {
    setSongs(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], customKey: newKey.trim() };
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !date.trim()) {
      alert('Please provide a Setlist theme name and service date.');
      return;
    }

    setSaving(true);
    const toSave: Setlist = {
      id: initialSetlist?.id || `setlist_${Date.now()}`,
      name: name.trim(),
      date: date.trim(),
      time: time.trim() || undefined,
      notes: notes.trim() || undefined,
      songs,
      createdAt: initialSetlist?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    try {
      await onSave(toSave);
    } catch (err: any) {
      alert('Failed to save setlist: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 select-none"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="bg-[#12131A] w-full max-w-3xl rounded-2xl p-5 sm:p-6 space-y-5 shadow-2xl border border-[#1E202B] text-zinc-300 relative max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#1E202B] pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/25">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-white leading-tight">
                    {initialSetlist ? 'Edit Worship Service Setlist' : 'Create New Worship Setlist'}
                  </h3>
                  <p className="text-xs text-zinc-400">Order songs, set performance keys, and coordinate your choir</p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 hover:bg-[#1A1C26] rounded-xl text-zinc-400 hover:text-white transition-colors cursor-pointer border border-[#1E202B]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Theme Name & Preset Suggestions */}
              <div className="space-y-2 text-left">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-mono uppercase font-bold text-zinc-400">
                    Theme / Service Name *
                  </label>
                  <span className="text-[10px] text-zinc-500 font-mono">e.g. Sunday Morning Worship</span>
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sunday Morning Worship"
                  required
                  className="w-full p-3 bg-[#090A0F] border border-[#1E202B] focus:border-amber-500/50 rounded-xl text-white outline-none text-xs sm:text-sm font-bold"
                />

                {/* Theme Name Chip Presets */}
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-[10px] font-mono text-zinc-500">Presets:</span>
                  {THEME_PRESETS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setName(t)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-mono transition-colors cursor-pointer border ${
                        name === t
                          ? 'bg-amber-500 text-black font-bold border-amber-500'
                          : 'bg-[#090A0F] hover:bg-[#1A1C26] text-zinc-400 hover:text-white border-[#1E202B]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date & Time Row with 1-Tap Date Picker Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 text-left">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono uppercase font-bold text-zinc-400">
                      Service Date *
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const d = new Date();
                          const day = d.getDay();
                          const diff = d.getDate() + (7 - day) % 7;
                          setDate(new Date(d.setDate(diff)).toISOString().split('T')[0]);
                        }}
                        className="text-[10px] font-mono text-amber-400 hover:underline"
                      >
                        This Sun
                      </button>
                      <span className="text-zinc-600">|</span>
                      <button
                        type="button"
                        onClick={() => {
                          const d = new Date();
                          const day = d.getDay();
                          const diff = d.getDate() + (7 - day) % 7 + 7;
                          setDate(new Date(d.setDate(diff)).toISOString().split('T')[0]);
                        }}
                        className="text-[10px] font-mono text-amber-400 hover:underline"
                      >
                        Next Sun
                      </button>
                    </div>
                  </div>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="w-full p-2.5 bg-[#090A0F] border border-[#1E202B] focus:border-amber-500/50 rounded-xl text-white outline-none text-xs font-mono"
                  />
                </div>

                <div className="space-y-1.5 text-left">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono uppercase font-bold text-zinc-400">
                      Service Time
                    </label>
                    <div className="flex items-center gap-1.5">
                      {['09:00 AM', '10:30 AM', '06:30 PM'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setTime(preset)}
                          className="text-[10px] font-mono text-zinc-400 hover:text-amber-400"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    placeholder="e.g. 09:00 AM"
                    className="w-full p-2.5 bg-[#090A0F] border border-[#1E202B] focus:border-amber-500/50 rounded-xl text-white outline-none text-xs font-mono"
                  />
                </div>
              </div>

              {/* 🎵 SETLIST SONG ORDER BUILDER */}
              <div className="space-y-2.5 text-left">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono uppercase font-bold text-white flex items-center gap-2">
                    <Music className="w-4 h-4 text-amber-400" />
                    <span>Songs In Order ({songs.length})</span>
                  </label>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    Use ▲ ▼ to arrange the order of worship
                  </span>
                </div>

                <div className="bg-[#090A0F] border border-[#1E202B] rounded-2xl p-3 space-y-2 max-h-64 overflow-y-auto">
                  {songs.length > 0 ? (
                    songs.map((song, idx) => (
                      <div
                        key={song.id + idx}
                        className="p-2.5 rounded-xl bg-[#12131A] border border-[#1E202B] flex items-center justify-between gap-3 group/item"
                      >
                        {/* Number & Song Title */}
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-400 font-mono text-xs font-bold flex items-center justify-center shrink-0 border border-amber-500/25">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <span className="text-xs sm:text-sm font-bold text-white truncate block">
                              {song.title}
                            </span>
                            {song.author && (
                              <span className="text-[10px] text-zinc-500 truncate block font-mono">
                                by {song.author}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Key Tag & Reorder Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Key Selection */}
                          <div className="flex items-center gap-1 bg-[#090A0F] px-2 py-1 rounded-lg border border-[#1E202B]">
                            <span className="text-[10px] font-mono text-zinc-400 font-bold">Key:</span>
                            <select
                              value={song.customKey || song.key || 'G'}
                              onChange={(e) => handleKeyChange(idx, e.target.value)}
                              className="bg-transparent text-amber-400 font-mono font-bold text-xs outline-none cursor-pointer"
                            >
                              {COMMON_KEYS.map((k) => (
                                <option key={k} value={k} className="bg-[#12131A] text-white">
                                  {k}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Reordering Controls */}
                          <div className="flex items-center bg-[#090A0F] rounded-lg border border-[#1E202B] p-0.5">
                            <button
                              type="button"
                              onClick={() => handleMoveUp(idx)}
                              disabled={idx === 0}
                              className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-20 rounded cursor-pointer transition-colors"
                              title="Move Up in Order"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveDown(idx)}
                              disabled={idx === songs.length - 1}
                              className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-20 rounded cursor-pointer transition-colors"
                              title="Move Down in Order"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Move to Top Shortcut */}
                          <button
                            type="button"
                            onClick={() => handleMoveToTop(idx)}
                            disabled={idx === 0}
                            className="p-1.5 bg-[#090A0F] hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 disabled:opacity-20 rounded-lg border border-[#1E202B] cursor-pointer"
                            title="Move to First Song"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete from Setlist */}
                          <button
                            type="button"
                            onClick={() => handleRemoveSong(idx)}
                            className="p-1.5 bg-[#090A0F] hover:bg-rose-950/40 text-zinc-500 hover:text-rose-400 rounded-lg border border-[#1E202B] hover:border-rose-500/30 cursor-pointer ml-1"
                            title="Remove song"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 text-zinc-500 space-y-1">
                      <Music className="w-6 h-6 mx-auto text-zinc-600" />
                      <p className="text-xs font-semibold">No songs selected for this service.</p>
                      <p className="text-[11px] text-zinc-600">Search songs below to add them to your order.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 🔍 ADD SONGS FROM CATALOG */}
              <div className="space-y-2 text-left">
                <label className="text-[11px] font-mono uppercase font-bold text-zinc-400">
                  + Add Songs from Catalog ({songsCatalog.length} available)
                </label>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                  <input
                    type="text"
                    value={songSearchQuery}
                    onChange={(e) => setSongSearchQuery(e.target.value)}
                    placeholder="Search song to add to service order..."
                    className="w-full p-2.5 pl-9 bg-[#090A0F] border border-[#1E202B] focus:border-amber-500/50 rounded-xl text-white outline-none text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto p-1">
                  {filteredCatalog.map((catSong) => {
                    const isAdded = songs.some(s => s.id === catSong.id);
                    return (
                      <button
                        key={catSong.id}
                        type="button"
                        onClick={() => handleAddSong(catSong)}
                        disabled={isAdded}
                        className={`p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-colors cursor-pointer text-xs ${
                          isAdded
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400/80 cursor-default'
                            : 'bg-[#090A0F] border-[#1E202B] hover:border-amber-500/40 text-zinc-300 hover:text-white'
                        }`}
                      >
                        <div className="min-w-0">
                          <span className="truncate font-bold block">{catSong.title}</span>
                          {catSong.author && (
                            <span className="text-[10px] text-zinc-500 truncate block font-mono">
                              {catSong.author}
                            </span>
                          )}
                        </div>
                        {isAdded ? (
                          <span className="text-[10px] font-mono text-emerald-400 font-bold shrink-0">In Setlist</span>
                        ) : (
                          <Plus className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Service Notes for Choir Team */}
              <div className="space-y-1 text-left">
                <label className="text-[11px] font-mono uppercase font-bold text-zinc-400">
                  Choir Team Notes / Flow Instructions (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Lead with acoustic guitar on song 1, smooth transition directly into song 2 in key of D, prayer pause before song 3..."
                  rows={2}
                  className="w-full p-2.5 bg-[#090A0F] border border-[#1E202B] focus:border-amber-500/50 rounded-xl text-white outline-none text-xs"
                />
              </div>

              {/* Submit / Cancel Footer */}
              <div className="flex gap-2.5 justify-end pt-3 border-t border-[#1E202B]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-xs sm:text-sm transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active-touch"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{saving ? 'Saving...' : initialSetlist ? 'Save Setlist Order' : 'Create Worship Setlist'}</span>
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
