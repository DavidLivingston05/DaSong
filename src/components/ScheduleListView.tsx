import React, { useState } from 'react';
import { Calendar, Check, Trash2, Clock, Music, AlertCircle, FileText, ChevronRight } from 'lucide-react';
import { ScheduledSong } from '../lib/useSchedule';
import { DatePickerModal } from './modals/DatePickerModal';

interface ScheduleListViewProps {
  songs: ScheduledSong[];
  onRemove: (id: string) => void;
  onMarkCompleted: (id: string) => void;
  onReschedule: (id: string, newDate: string) => void;
  onSelectSong?: (songId: string) => void;
}

export const ScheduleListView: React.FC<ScheduleListViewProps> = ({
  songs,
  onRemove,
  onMarkCompleted,
  onReschedule,
  onSelectSong,
}) => {
  const [rescheduleModal, setRescheduleModal] = useState<ScheduledSong | null>(null);

  if (!songs || songs.length === 0) {
    return (
      <div className="w-full py-16 px-6 bg-[#12131A] border border-[#1E202B] rounded-2xl text-center space-y-3 max-w-xl mx-auto my-6">
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl w-fit mx-auto text-amber-500">
          <Calendar className="w-8 h-8" />
        </div>
        <h3 className="text-base font-bold text-white tracking-wide">No Songs Scheduled Yet</h3>
        <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
          Search for any song in your library and click <span className="text-amber-400 font-semibold">Schedule Practice</span> to set practice dates and notes.
        </p>
      </div>
    );
  }

  // Group songs by date
  const songsByDate = songs.reduce<Record<string, ScheduledSong[]>>((acc, song) => {
    if (!acc[song.scheduledDate]) {
      acc[song.scheduledDate] = [];
    }
    acc[song.scheduledDate].push(song);
    return acc;
  }, {});

  // Sort dates chronologically
  const sortedDates = Object.keys(songsByDate).sort();

  const formatDateLabel = (dateStr: string): { label: string; isPast: boolean } => {
    const songDate = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const isPast = songDate < today;

    if (songDate.toDateString() === today.toDateString()) {
      return { label: 'Today', isPast: false };
    }
    if (songDate.toDateString() === tomorrow.toDateString()) {
      return { label: 'Tomorrow', isPast: false };
    }

    const formatted = songDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return { label: formatted, isPast };
  };

  return (
    <div className="w-full space-y-6 max-w-4xl mx-auto py-2">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#12131A] border border-[#1E202B] p-5 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-500 shrink-0">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-wide">Practice Schedule</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              {songs.length} {songs.length === 1 ? 'song' : 'songs'} scheduled for practice & worship
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono bg-[#1A1C26] px-3 py-2 rounded-xl border border-[#272A37] text-zinc-300 w-fit">
          <Clock className="w-3.5 h-3.5 text-amber-500" />
          <span>{songs.filter(s => s.status === 'completed').length} / {songs.length} Completed</span>
        </div>
      </div>

      {/* Date Groups */}
      <div className="space-y-6">
        {sortedDates.map((dateStr) => {
          const { label, isPast } = formatDateLabel(dateStr);
          const dateSongs = songsByDate[dateStr];

          return (
            <div key={dateStr} className="bg-[#12131A] border border-[#1E202B] rounded-2xl overflow-hidden shadow-sm">
              {/* Date Header */}
              <div className="bg-zinc-950/80 px-5 py-3 border-b border-[#1E202B] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono font-bold uppercase tracking-widest ${isPast ? 'text-rose-400' : 'text-amber-500'}`}>
                    {label}
                  </span>
                  {isPast && (
                    <span className="text-[9px] font-mono font-bold px-2 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded">
                      Overdue
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-mono text-zinc-500">{dateStr}</span>
              </div>

              {/* Songs List */}
              <div className="divide-y divide-[#1E202B]">
                {dateSongs.map((song) => {
                  const isCompleted = song.status === 'completed';

                  return (
                    <div
                      key={song.id}
                      className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
                        isCompleted ? 'bg-zinc-950/30' : 'hover:bg-[#1A1C26]/40'
                      }`}
                    >
                      <div className="flex items-start gap-3.5 flex-1 min-w-0">
                        {/* Completion Checkbox */}
                        <button
                          onClick={() => onMarkCompleted(song.id)}
                          className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                            isCompleted
                              ? 'bg-amber-500 border-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                              : 'border-zinc-700 hover:border-amber-500/60 bg-zinc-900/60 text-transparent'
                          }`}
                          title={isCompleted ? 'Mark as incomplete' : 'Mark as completed'}
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </button>

                        {/* Song Details */}
                        <div className="flex-1 min-w-0 text-left">
                          <div className="flex items-center gap-2">
                            <h4
                              onClick={() => onSelectSong?.(song.songId)}
                              className={`text-sm font-bold tracking-tight cursor-pointer hover:text-amber-400 transition-colors truncate ${
                                isCompleted ? 'text-zinc-500 line-through' : 'text-white'
                              }`}
                            >
                              {song.songName}
                            </h4>
                          </div>

                          <p className="text-xs text-zinc-500 font-normal mt-0.5 truncate">
                            by {song.artist}
                          </p>

                          {song.notes && (
                            <div className="mt-2 text-xs text-amber-300/80 bg-amber-500/5 border border-amber-500/15 px-3 py-1.5 rounded-lg flex items-start gap-2 max-w-xl">
                              <FileText className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                              <span className="italic leading-normal">{song.notes}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action Controls */}
                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        {onSelectSong && (
                          <button
                            onClick={() => onSelectSong(song.songId)}
                            className="px-3 py-1.5 bg-[#1A1C26] hover:bg-zinc-800 border border-[#272A37] rounded-lg text-xs font-bold text-zinc-300 hover:text-white transition-all flex items-center gap-1 cursor-pointer"
                            title="Open Song details"
                          >
                            <span>Open</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          onClick={() => setRescheduleModal(song)}
                          className="p-2 bg-[#1A1C26] hover:bg-zinc-800 border border-[#272A37] rounded-lg text-zinc-400 hover:text-amber-400 transition-all cursor-pointer"
                          title="Reschedule Practice"
                        >
                          <Calendar className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => {
                            if (confirm(`Remove "${song.songName}" from schedule?`)) {
                              onRemove(song.id);
                            }
                          }}
                          className="p-2 bg-[#1A1C26] hover:bg-rose-950/30 border border-[#272A37] hover:border-rose-500/40 rounded-lg text-zinc-400 hover:text-rose-400 transition-all cursor-pointer"
                          title="Remove from schedule"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Reschedule Modal */}
      {rescheduleModal && (
        <DatePickerModal
          songName={rescheduleModal.songName}
          onSave={({ scheduledDate }) => {
            onReschedule(rescheduleModal.id, scheduledDate);
            setRescheduleModal(null);
          }}
          onClose={() => setRescheduleModal(null)}
        />
      )}
    </div>
  );
};
