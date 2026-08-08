import React, { useState } from 'react';
import { DatePickerModal } from './DatePickerModal';

export const ScheduleListView = ({ songs, onRemove, onMarkCompleted, onReschedule }) => {
  const [rescheduleModal, setRescheduleModal] = useState(null);

  if (!songs || songs.length === 0) {
    return (
      <div
        style={{
          padding: '40px 24px',
          textAlign: 'center',
          color: 'var(--text-secondary)',
        }}
      >
        <p style={{ fontSize: '14px', margin: '0 0 8px' }}>No songs scheduled yet</p>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          Search for a song and click "Schedule" to add it to your practice list
        </p>
      </div>
    );
  }

  // Group songs by date
  const songsByDate = songs.reduce((acc, song) => {
    if (!acc[song.scheduledDate]) {
      acc[song.scheduledDate] = [];
    }
    acc[song.scheduledDate].push(song);
    return acc;
  }, {});

  // Sort dates chronologically
  const sortedDates = Object.keys(songsByDate).sort();

  const formatDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }
    if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    }

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div style={{ padding: '16px' }}>
      {sortedDates.map((date) => (
        <div key={date} style={{ marginBottom: '24px' }}>
          {/* Date Header */}
          <h3
            style={{
              margin: '0 0 12px',
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {formatDate(date)}
          </h3>

          {/* Songs for this date */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {songsByDate[date].map((song) => (
              <div
                key={song.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px',
                  backgroundColor: 'var(--surface-1)',
                  border: '0.5px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  gap: '12px',
                }}
              >
                {/* Checkbox for completion */}
                <input
                  type="checkbox"
                  checked={song.status === 'completed'}
                  onChange={() => onMarkCompleted(song.id)}
                  style={{
                    cursor: 'pointer',
                    width: '18px',
                    height: '18px',
                  }}
                />

                {/* Song Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: '0 0 4px',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: song.status === 'completed' ? 'var(--text-secondary)' : 'var(--text-primary)',
                      textDecoration: song.status === 'completed' ? 'line-through' : 'none',
                    }}
                  >
                    {song.songName}
                  </p>
                  <p
                    style={{
                      margin: '0 0 4px',
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {song.artist}
                  </p>
                  {song.notes && (
                    <p
                      style={{
                        margin: 0,
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        fontStyle: 'italic',
                      }}
                    >
                      💡 {song.notes}
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => setRescheduleModal(song)}
                    title="Reschedule"
                    style={{
                      padding: '6px 10px',
                      fontSize: '12px',
                      border: '0.5px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      backgroundColor: 'transparent',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.backgroundColor = 'var(--surface-2)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.backgroundColor = 'transparent';
                    }}
                  >
                    📅
                  </button>
                  <button
                    onClick={() => onRemove(song.id)}
                    title="Delete"
                    style={{
                      padding: '6px 10px',
                      fontSize: '12px',
                      border: '0.5px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      backgroundColor: 'transparent',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.backgroundColor = 'var(--bg-danger)';
                      e.target.style.color = 'var(--text-danger)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.backgroundColor = 'transparent';
                      e.target.style.color = 'var(--text-secondary)';
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

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
