import React, { useState } from 'react';
import { DatePickerModal } from './DatePickerModal';

export const ScheduleButton = ({ song, onSchedule, isAlreadyScheduled }) => {
  const [showModal, setShowModal] = useState(false);

  const handleSchedule = ({ scheduledDate, notes }) => {
    onSchedule({
      songId: song.id,
      songName: song.title || song.name,
      artist: song.artist || song.artistName || 'Unknown',
      scheduledDate,
      notes,
    });
    setShowModal(false);
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          fontSize: '14px',
          fontWeight: 500,
          border: '0.5px solid var(--border-accent)',
          borderRadius: 'var(--radius)',
          backgroundColor: 'var(--fill-accent)',
          color: 'white',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = 'var(--fill-accent-hover, var(--fill-accent))';
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = 'var(--fill-accent)';
        }}
      >
        📅 {isAlreadyScheduled ? 'Already scheduled' : 'Schedule for singing'}
      </button>

      {showModal && (
        <DatePickerModal
          songName={song.title || song.name}
          onSave={handleSchedule}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
};
