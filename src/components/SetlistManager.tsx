import React, { useState, useEffect } from 'react';
import { 
  Calendar, Music, Plus, Trash2, Check,
  ChevronRight, ChevronLeft, Sparkles, Clock, MapPin, Play, ArrowUp, ArrowDown, X, Edit3
} from 'lucide-react';
import { UserRole, WorshipEvent, SetlistSongItem } from '../types';
import { SongMetadata, saveWorshipEvent, deleteWorshipEvent } from '../lib/db';

interface SetlistManagerProps {
  currentRole: UserRole;
  events: WorshipEvent[];
  songsCatalog: SongMetadata[];
  onRefreshEvents: () => void;
  onSelectSong: (id: string) => void;
  onEnterStageMode?: () => void;
}

export default function SetlistManager({
  currentRole,
  events,
  songsCatalog,
  onRefreshEvents,
  onSelectSong,
  onEnterStageMode
}: SetlistManagerProps) {
  const isAdmin = currentRole === 'admin';
  const isChoir = currentRole === 'choir';
  const isGuest = currentRole === 'guest';
  const canEdit = currentRole === 'admin' || currentRole === 'guest';

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [showCreateEventModal, setShowCreateEventModal] = useState<boolean>(false);
  const [showSongPickerModal, setShowSongPickerModal] = useState<boolean>(false);

  // New Event Form State
  const [newEventForm, setNewEventForm] = useState({
    name: '',
    date: new Date().toISOString().split('T')[0],
    time: '09:30 AM',
    venue: 'Main Sanctuary',
    notes: ''
  });

  // Active Selected Event
  const selectedEvent = events.find(e => e.id === selectedEventId) || null;

  // Setlist editing state for selected event
  const [editingSetlist, setEditingSetlist] = useState<SetlistSongItem[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [songSearchQuery, setSongSearchQuery] = useState<string>('');

  useEffect(() => {
    if (selectedEvent) {
      setEditingSetlist(selectedEvent.songs || []);
      setHasUnsavedChanges(false);
    }
  }, [selectedEvent?.id]);

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    const newEv: WorshipEvent = {
      id: 'event_' + Date.now(),
      name: newEventForm.name,
      date: newEventForm.date,
      time: newEventForm.time,
      venue: newEventForm.venue,
      notes: newEventForm.notes,
      published: false,
      songs: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    saveWorshipEvent(newEv);
    onRefreshEvents();
    setSelectedEventId(newEv.id);
    setShowCreateEventModal(false);
    setNewEventForm({
      name: '',
      date: new Date().toISOString().split('T')[0],
      time: '09:30 AM',
      venue: 'Main Sanctuary',
      notes: ''
    });
  };

  const handleAddSongToSetlist = (song: SongMetadata) => {
    if (!canEdit) return;
    const newItem: SetlistSongItem = {
      songId: song.id,
      title: song.title,
      customKey: song.key || 'G',
      leadVocalist: '',
      notes: ''
    };
    setEditingSetlist(prev => [...prev, newItem]);
    setHasUnsavedChanges(true);
    setShowSongPickerModal(false);
  };

  const handleRemoveSongFromSetlist = (index: number) => {
    if (!canEdit) return;
    setEditingSetlist(prev => prev.filter((_, i) => i !== index));
    setHasUnsavedChanges(true);
  };

  const handleMoveSong = (index: number, direction: 'up' | 'down') => {
    if (!canEdit) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= editingSetlist.length) return;

    const updated = [...editingSetlist];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    setEditingSetlist(updated);
    setHasUnsavedChanges(true);
  };

  const handleUpdateSetlistSongItem = (index: number, field: keyof SetlistSongItem, value: string) => {
    if (!canEdit) return;
    setEditingSetlist(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    setHasUnsavedChanges(true);
  };

  const handleSaveAndPublishSetlist = (publishState: boolean) => {
    if (!canEdit || !selectedEvent) return;
    const updatedEv: WorshipEvent = {
      ...selectedEvent,
      songs: editingSetlist,
      published: publishState,
      updatedAt: Date.now()
    };
    saveWorshipEvent(updatedEv);
    onRefreshEvents();
    setHasUnsavedChanges(false);
  };

  const handleDeleteEvent = (eventId: string) => {
    if (!canEdit) return;
    if (window.confirm('Are you sure you want to delete this worship event?')) {
      deleteWorshipEvent(eventId);
      onRefreshEvents();
      if (selectedEventId === eventId) {
        setSelectedEventId(null);
      }
    }
  };

  // Filter songs for the song picker modal
  const filteredCatalog = songsCatalog.filter(s =>
    s.title.toLowerCase().includes(songSearchQuery.toLowerCase()) ||
    (s.author && s.author.toLowerCase().includes(songSearchQuery.toLowerCase()))
  );

  return (
    <div id="setlist-manager-module" className="w-full space-y-6 text-zinc-300">
      
      {/* Quick-action toolbar */}
      {canEdit && (
        <div className={`flex justify-end ${selectedEvent ? 'hidden lg:flex' : ''}`}>
          <button
            onClick={() => setShowCreateEventModal(true)}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-xs transition-all shadow-md flex items-center gap-1.5 cursor-pointer active-touch shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Create Worship Event</span>
          </button>
        </div>
      )}

      {/* 📅 MAIN EVENTS & SETLIST DASHBOARD GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Worship Event Selector List — hidden on mobile when an event is selected */}
        <div className={`lg:col-span-4 space-y-3 ${selectedEvent ? 'hidden lg:block' : ''}`}>
          <div className="flex items-center justify-between pb-2 border-b border-zinc-900">
            <h3 className="text-xs font-mono font-bold uppercase text-zinc-400 tracking-wider flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-amber-500" />
              Worship Events ({events.length})
            </h3>
            {canEdit && events.some(e => (!e.songs || e.songs.length === 0) && !e.published) && (
              <button
                onClick={() => {
                  if (window.confirm('Delete all empty draft events?')) {
                    const emptyDrafts = events.filter(e => (!e.songs || e.songs.length === 0) && !e.published);
                    emptyDrafts.forEach(ev => deleteWorshipEvent(ev.id));
                    onRefreshEvents();
                    setSelectedEventId(null);
                  }
                }}
                className="text-[10px] font-mono text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
              >
                Clear Drafts
              </button>
            )}
          </div>

          {events.length > 0 ? (
            <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
              {events.map(ev => {
                const isSelected = selectedEvent?.id === ev.id;

                return (
                  <div
                    key={ev.id}
                    onClick={() => setSelectedEventId(ev.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer select-none space-y-2 ${
                      isSelected
                        ? 'bg-[#1A1C26] border-amber-500/40 shadow-lg'
                        : 'bg-[#12131A] border-[#1E202B] hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className={`font-bold text-sm truncate ${isSelected ? 'text-amber-400' : 'text-white'}`}>
                          {ev.name}
                        </h4>
                        <div className="flex items-center gap-3 text-[11px] text-zinc-400 mt-1 font-mono">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-500/80" />
                            {ev.date} {ev.time && `• ${ev.time}`}
                          </span>
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 text-[9px] font-mono font-bold rounded uppercase tracking-wider border shrink-0 ${
                        ev.published 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      }`}>
                        {ev.published ? 'PUBLISHED' : 'DRAFT'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-2 border-t border-zinc-900/60 font-mono">
                      <span>{ev.songs?.length || 0} Songs in Setlist</span>
                      <div className="flex items-center gap-2">
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteEvent(ev.id);
                            }}
                            className="p-1 hover:bg-red-950/40 text-zinc-600 hover:text-red-400 rounded transition-all cursor-pointer"
                            title="Delete Event"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isSelected && <span className="text-amber-400 font-bold">Selected →</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center bg-[#12131A] border border-[#1E202B] rounded-xl space-y-3">
              <Calendar className="w-8 h-8 text-zinc-600 mx-auto" />
              <p className="text-xs text-zinc-400 font-bold">No Worship Events Found</p>
              {isAdmin && (
                <button
                  onClick={() => setShowCreateEventModal(true)}
                  className="px-3.5 py-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 rounded text-xs font-mono transition-colors"
                >
                  + Create First Event
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Selected Event Setlist Detail & Editor */}
        <div className="lg:col-span-8 space-y-4">
          {selectedEvent ? (
            <div className="rounded-2xl bg-[#0E0F14] border border-white/6 shadow-2xl overflow-hidden">

              {/* Mobile back */}
              <div className="flex lg:hidden items-center gap-2 px-5 pt-4 pb-0">
                <button
                  onClick={() => setSelectedEventId(null)}
                  className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-amber-400 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Events
                </button>
              </div>

              {/* Event Header */}
              <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-white/5">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <h2 className="text-lg sm:text-2xl font-bold text-white tracking-tight leading-snug break-words">{selectedEvent.name}</h2>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] sm:text-xs text-zinc-500 font-mono">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-amber-500/70" />
                        {selectedEvent.date}{selectedEvent.time && ` · ${selectedEvent.time}`}
                      </span>
                      {selectedEvent.venue && (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="w-3 h-3 text-amber-500/70" />
                          {selectedEvent.venue}
                        </span>
                      )}
                      {/* Status dot — only shown to admin */}
                      {isAdmin && (
                        <span className={`flex items-center gap-1 font-bold ${selectedEvent.published ? 'text-emerald-400' : 'text-amber-400'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${selectedEvent.published ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                          {selectedEvent.published ? 'Published' : 'Draft'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Edit/Admin actions */}
                  {canEdit && (
                    <div className="flex items-center gap-2 shrink-0">
                      {isAdmin ? (
                        <button
                          onClick={() => handleSaveAndPublishSetlist(!selectedEvent.published)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer border ${
                            selectedEvent.published
                              ? 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/8'
                              : 'bg-emerald-500 hover:bg-emerald-400 text-black border-emerald-600 shadow-lg shadow-emerald-500/20'
                          }`}
                        >
                          {selectedEvent.published ? 'Unpublish' : 'Publish to Choir'}
                        </button>
                      ) : (
                        <span className="text-[10px] font-mono text-amber-500/90 bg-amber-500/10 px-2.5 py-1.5 rounded-lg border border-amber-500/20">
                          Saved on Device
                        </span>
                      )}
                      <button
                        onClick={() => handleDeleteEvent(selectedEvent.id)}
                        className="p-2 bg-white/3 hover:bg-red-950/40 border border-white/8 hover:border-red-900/40 text-zinc-500 hover:text-red-400 rounded-xl transition-colors cursor-pointer"
                        title="Delete Event"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Setlist */}
              <div className="p-3 sm:p-6 space-y-3">
                {/* Setlist header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Music className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-bold uppercase tracking-widest text-zinc-400 font-mono">
                      Setlist
                    </span>
                    <span className="px-1.5 py-0.5 bg-white/5 rounded text-[10px] font-mono text-zinc-500">
                      {editingSetlist.length}
                    </span>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => setShowSongPickerModal(true)}
                      className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/18 text-amber-400 border border-amber-500/25 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[3]" /> Add Song
                    </button>
                  )}
                </div>

                {editingSetlist.length > 0 ? (
                  <div className="space-y-2">
                    {editingSetlist.map((item, idx) => (
                      <div
                        key={item.songId + '_' + idx}
                        className="group flex items-center gap-2.5 sm:gap-4 px-3 sm:px-4 py-2.5 sm:py-3.5 rounded-xl bg-white/3 border border-white/5 hover:bg-white/5 hover:border-amber-500/15 transition-all cursor-pointer"
                        onClick={() => onSelectSong(item.songId)}
                      >
                        {/* Index */}
                        <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-mono font-black flex items-center justify-center shrink-0 group-hover:bg-amber-500/20 transition-colors">
                          {idx + 1}
                        </span>

                        {/* Title */}
                        <span className="flex-1 font-semibold text-xs sm:text-sm text-zinc-200 group-hover:text-white transition-colors break-words leading-snug">
                          {item.title}
                        </span>

                        {/* Edit reorder & delete */}
                        {canEdit && (
                          <div
                            className="flex items-center gap-0.5 sm:gap-1 shrink-0 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              onClick={() => handleMoveSong(idx, 'up')}
                              disabled={idx === 0}
                              className="p-1 sm:p-1.5 hover:bg-white/8 text-zinc-500 hover:text-white rounded-lg disabled:opacity-25 transition-all cursor-pointer"
                              title="Move Up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleMoveSong(idx, 'down')}
                              disabled={idx === editingSetlist.length - 1}
                              className="p-1 sm:p-1.5 hover:bg-white/8 text-zinc-500 hover:text-white rounded-lg disabled:opacity-25 transition-all cursor-pointer"
                              title="Move Down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleRemoveSongFromSetlist(idx)}
                              className="p-1 sm:p-1.5 hover:bg-red-950/40 text-zinc-600 hover:text-red-400 rounded-lg transition-all cursor-pointer"
                              title="Remove"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {/* Tap arrow for read-only view */}
                        {!canEdit && (
                          <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-amber-400 transition-colors shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-14 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center mx-auto">
                      <Music className="w-5 h-5 text-zinc-600" />
                    </div>
                    <p className="text-sm font-bold text-zinc-500">No songs in this setlist yet</p>
                    {canEdit && (
                      <button
                        onClick={() => setShowSongPickerModal(true)}
                        className="px-4 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/25 hover:bg-amber-500/18 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        + Add First Song
                      </button>
                    )}
                  </div>
                )}

                {/* Unsaved changes banner */}
                {canEdit && hasUnsavedChanges && (
                  <div className="mt-4 p-4 bg-amber-500/8 border border-amber-500/20 rounded-xl flex items-center justify-between gap-4">
                    <span className="text-xs font-mono text-amber-300 font-bold">Unsaved changes</span>
                    <button
                      onClick={() => handleSaveAndPublishSetlist(selectedEvent.published)}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-lg transition-all shadow-md cursor-pointer"
                    >
                      Save Changes ({isGuest ? 'Local Device' : 'Cloud'})
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="py-20 text-center bg-[#0E0F14] border border-white/5 rounded-2xl space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center mx-auto">
                <Calendar className="w-6 h-6 text-zinc-600" />
              </div>
              <p className="text-sm text-zinc-500 font-bold">Select an event to view its setlist</p>
            </div>
          )}
        </div>

      </div>

      {/* ➕ CREATE EVENT MODAL */}
      {showCreateEventModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#12131A] border border-[#1E202B] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl text-zinc-300">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-500" />
                Create Worship Event
              </h3>
              <button
                onClick={() => setShowCreateEventModal(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-400 block mb-1">Event Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sunday Worship Service"
                  value={newEventForm.name}
                  onChange={(e) => setNewEventForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white outline-none focus:border-amber-500 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-400 block mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={newEventForm.date}
                    onChange={(e) => setNewEventForm(p => ({ ...p, date: e.target.value }))}
                    className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white outline-none focus:border-amber-500 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-400 block mb-1">Time</label>
                  <input
                    type="text"
                    placeholder="e.g. 09:30 AM"
                    value={newEventForm.time}
                    onChange={(e) => setNewEventForm(p => ({ ...p, time: e.target.value }))}
                    className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white outline-none focus:border-amber-500 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-400 block mb-1">Venue / Sanctuary</label>
                <input
                  type="text"
                  placeholder="e.g. Main Auditorium"
                  value={newEventForm.venue}
                  onChange={(e) => setNewEventForm(p => ({ ...p, venue: e.target.value }))}
                  className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white outline-none focus:border-amber-500 text-xs"
                />
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-zinc-900">
                <button
                  type="button"
                  onClick={() => setShowCreateEventModal(false)}
                  className="px-4 py-2 text-xs font-semibold bg-zinc-900 text-zinc-300 hover:text-white rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl transition-all shadow-md cursor-pointer"
                >
                  Save Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🎵 ADD SONG TO SETLIST PICKER MODAL */}
      {showSongPickerModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#12131A] border border-[#1E202B] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl text-zinc-300 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Music className="w-4 h-4 text-amber-500" />
                Select Song from Catalog
              </h3>
              <button
                onClick={() => setShowSongPickerModal(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <input
              type="text"
              placeholder="Search song catalog..."
              value={songSearchQuery}
              onChange={(e) => setSongSearchQuery(e.target.value)}
              className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white outline-none focus:border-amber-500 text-xs"
            />

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[200px]">
              {filteredCatalog.length > 0 ? (
                filteredCatalog.map(s => (
                  <div
                    key={s.id}
                    onClick={() => handleAddSongToSetlist(s)}
                    className="p-3 bg-zinc-950 hover:bg-zinc-900 border border-zinc-850 hover:border-amber-500/30 rounded-xl flex items-center justify-between cursor-pointer transition-all group"
                  >
                    <div>
                      <h4 className="font-bold text-xs text-white group-hover:text-amber-400 transition-colors">
                        {s.title}
                      </h4>
                      {s.author && <p className="text-[10px] text-zinc-500 font-mono mt-0.5">by {s.author}</p>}
                    </div>
                    <span className="text-[10px] font-mono font-bold text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      + Add
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-center text-xs text-zinc-500 py-8">No matching songs found</p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
