import React, { useState } from 'react';
import { Calendar } from 'lucide-react';
import { DatePickerModal } from './modals/DatePickerModal';

interface ScheduleButtonProps {
  song: {
    id: string;
    title?: string;
    name?: string;
    author?: string;
    artist?: string;
    artistName?: string;
  };
  onSchedule: (songData: {
    songId: string;
    songName: string;
    artist: string;
    scheduledDate: string;
    notes?: string;
  }) => void;
  isAlreadyScheduled?: boolean;
}

export const ScheduleButton: React.FC<ScheduleButtonProps> = ({
  song,
  onSchedule,
  isAlreadyScheduled = false,
}) => {
  const [showModal, setShowModal] = useState<boolean>(false);

  const handleSchedule = ({ scheduledDate, notes }: { scheduledDate: string; notes?: string }) => {
    onSchedule({
      songId: song.id,
      songName: song.title || song.name || 'Untitled Song',
      artist: song.author || song.artist || song.artistName || 'Traditional',
      scheduledDate,
      notes,
    });
    setShowModal(false);
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 rounded-lg text-xs font-bold text-amber-400 hover:text-amber-300 transition-all flex items-center gap-2 cursor-pointer active:scale-95 shadow-sm"
        title="Schedule for practice/singing"
      >
        <Calendar className="w-4 h-4 text-amber-500" />
        <span>{isAlreadyScheduled ? 'Already Scheduled' : 'Schedule Practice'}</span>
      </button>

      {showModal && (
        <DatePickerModal
          songName={song.title || song.name || 'Untitled Song'}
          onSave={handleSchedule}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
};
