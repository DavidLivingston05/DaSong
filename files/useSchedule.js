import { useState, useEffect, useCallback } from 'react';

// Hook to manage scheduled songs with localStorage persistence
export const useSchedule = () => {
  const [scheduledSongs, setScheduledSongs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const STORAGE_KEY = 'dasong_scheduled_songs';

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setScheduledSongs(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load scheduled songs:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Save to localStorage whenever songs change
  useEffect(() => {
    if (!isLoading) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(scheduledSongs));
      } catch (error) {
        console.error('Failed to save scheduled songs:', error);
      }
    }
  }, [scheduledSongs, isLoading]);

  // Add or update a scheduled song
  const scheduleSong = useCallback((songData) => {
    const { songId, songName, artist, scheduledDate, notes = '' } = songData;

    setScheduledSongs((prev) => {
      // Check if already scheduled
      const existing = prev.findIndex((s) => s.songId === songId && s.scheduledDate === scheduledDate);
      
      if (existing >= 0) {
        // Update existing
        const updated = [...prev];
        updated[existing] = {
          ...updated[existing],
          notes,
          updatedOn: new Date().toISOString(),
        };
        return updated;
      }

      // Add new
      return [
        ...prev,
        {
          id: `${songId}-${scheduledDate}-${Date.now()}`,
          songId,
          songName,
          artist,
          scheduledDate,
          notes,
          status: 'pending',
          addedOn: new Date().toISOString(),
        },
      ];
    });
  }, []);

  // Remove a scheduled song
  const removeSong = useCallback((id) => {
    setScheduledSongs((prev) => prev.filter((song) => song.id !== id));
  }, []);

  // Mark song as completed
  const markCompleted = useCallback((id) => {
    setScheduledSongs((prev) =>
      prev.map((song) =>
        song.id === id ? { ...song, status: 'completed', completedOn: new Date().toISOString() } : song
      )
    );
  }, []);

  // Reschedule a song to a different date
  const rescheduleSong = useCallback((id, newDate) => {
    setScheduledSongs((prev) =>
      prev.map((song) =>
        song.id === id ? { ...song, scheduledDate: newDate, status: 'pending' } : song
      )
    );
  }, []);

  // Get songs sorted by date
  const getSongsSortedByDate = useCallback(() => {
    return [...scheduledSongs].sort(
      (a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate)
    );
  }, [scheduledSongs]);

  // Get songs for a specific date
  const getSongsForDate = useCallback((date) => {
    return scheduledSongs.filter((song) => song.scheduledDate === date);
  }, [scheduledSongs]);

  // Get upcoming songs (next 30 days)
  const getUpcomingSongs = useCallback((days = 30) => {
    const now = new Date();
    const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    
    return getSongsSortedByDate().filter(
      (song) => {
        const songDate = new Date(song.scheduledDate);
        return songDate >= now && songDate <= futureDate;
      }
    );
  }, [getSongsSortedByDate]);

  // Check if a song is already scheduled on a date
  const isScheduledOnDate = useCallback((songId, date) => {
    return scheduledSongs.some((s) => s.songId === songId && s.scheduledDate === date);
  }, [scheduledSongs]);

  return {
    scheduledSongs,
    isLoading,
    scheduleSong,
    removeSong,
    markCompleted,
    rescheduleSong,
    getSongsSortedByDate,
    getSongsForDate,
    getUpcomingSongs,
    isScheduledOnDate,
  };
};
