// Example of how to integrate the Schedule feature into your DaSong app
// This shows the complete setup with all new components

import React, { useState } from 'react';
import { useSchedule } from './useSchedule';
import { ScheduleListView } from './ScheduleListView';
import { ScheduleButton } from './ScheduleButton';
import { DatePickerModal } from './DatePickerModal';

export const DaSongApp = () => {
  const [activeTab, setActiveTab] = useState('search'); // 'search' or 'schedule'
  const [selectedSong, setSelectedSong] = useState(null);
  
  // Initialize the schedule hook
  const {
    scheduledSongs,
    isLoading,
    scheduleSong,
    removeSong,
    markCompleted,
    rescheduleSong,
    getSongsSortedByDate,
    isScheduledOnDate,
  } = useSchedule();

  // Your existing search/song data logic
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // Handle scheduling a song
  const handleScheduleSong = (songData) => {
    scheduleSong(songData);
    // Optional: Show success toast
    console.log('Song scheduled!', songData);
  };

  // Get sorted songs for the schedule view
  const sortedScheduledSongs = getSongsSortedByDate();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Tab Navigation */}
      <div
        style={{
          display: 'flex',
          borderBottom: '0.5px solid var(--border)',
          backgroundColor: 'var(--surface-0)',
        }}
      >
        <button
          onClick={() => setActiveTab('search')}
          style={{
            flex: 1,
            padding: '16px',
            fontSize: '14px',
            fontWeight: 500,
            border: 'none',
            backgroundColor: activeTab === 'search' ? 'var(--surface-1)' : 'transparent',
            borderBottom: activeTab === 'search' ? '2px solid var(--fill-accent)' : 'none',
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          🎵 Search Songs
        </button>
        <button
          onClick={() => setActiveTab('schedule')}
          style={{
            flex: 1,
            padding: '16px',
            fontSize: '14px',
            fontWeight: 500,
            border: 'none',
            backgroundColor: activeTab === 'schedule' ? 'var(--surface-1)' : 'transparent',
            borderBottom: activeTab === 'schedule' ? '2px solid var(--fill-accent)' : 'none',
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          📅 Practice Schedule {sortedScheduledSongs.length > 0 && `(${sortedScheduledSongs.length})`}
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 'search' ? (
          // SEARCH TAB - Your existing search functionality
          <div style={{ padding: '16px' }}>
            {/* Search Input */}
            <input
              type="text"
              placeholder="Search songs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '14px',
                border: '0.5px solid var(--border)',
                borderRadius: 'var(--radius)',
                marginBottom: '16px',
                boxSizing: 'border-box',
              }}
            />

            {/* Song Results */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {searchResults.map((song) => (
                <div
                  key={song.id}
                  style={{
                    padding: '16px',
                    backgroundColor: 'var(--surface-1)',
                    border: '0.5px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                  }}
                  onClick={() => setSelectedSong(song)}
                >
                  <p
                    style={{
                      margin: '0 0 4px',
                      fontSize: '15px',
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {song.title}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {song.artist}
                  </p>
                </div>
              ))}
            </div>

            {/* Song Detail View */}
            {selectedSong && (
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 999,
                }}
                onClick={() => setSelectedSong(null)}
              >
                <div
                  style={{
                    backgroundColor: 'var(--surface-2)',
                    borderRadius: '12px',
                    padding: '24px',
                    maxWidth: '500px',
                    width: '90%',
                    maxHeight: '80vh',
                    overflow: 'auto',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <h2
                    style={{
                      margin: '0 0 8px',
                      fontSize: '18px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {selectedSong.title}
                  </h2>
                  <p
                    style={{
                      margin: '0 0 16px',
                      fontSize: '14px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {selectedSong.artist}
                  </p>

                  {/* Lyrics/Chords Preview */}
                  <div
                    style={{
                      padding: '12px',
                      backgroundColor: 'var(--surface-1)',
                      border: '0.5px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      marginBottom: '16px',
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'monospace',
                      maxHeight: '200px',
                      overflow: 'auto',
                    }}
                  >
                    {selectedSong.lyrics || selectedSong.content || 'No content available'}
                  </div>

                  {/* Schedule Button */}
                  <ScheduleButton
                    song={selectedSong}
                    onSchedule={handleScheduleSong}
                    isAlreadyScheduled={isScheduledOnDate(selectedSong.id, new Date().toISOString().split('T')[0])}
                  />

                  <button
                    onClick={() => setSelectedSong(null)}
                    style={{
                      width: '100%',
                      marginTop: '12px',
                      padding: '10px',
                      fontSize: '14px',
                      border: '0.5px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      backgroundColor: 'transparent',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          // SCHEDULE TAB - Your new practice schedule
          <ScheduleListView
            songs={sortedScheduledSongs}
            onRemove={removeSong}
            onMarkCompleted={markCompleted}
            onReschedule={rescheduleSong}
          />
        )}
      </div>
    </div>
  );
};

export default DaSongApp;
