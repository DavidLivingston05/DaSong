export interface Song {
  id: string;
  title: string;
  lyrics: string;
  author?: string;
  key?: string; // Default key e.g., "G", "C"
  bpm?: number; // Metronome support
  category?: string; // e.g. "Worship", "Hymn", "Thanksgiving", "Christmas"
  favorite?: boolean;
  createdAt: number;
  updatedAt?: number;
}

export type PlaybackStatus = 'idle' | 'playing' | 'paused';

export interface MetronomeConfig {
  bpm: number;
  beatsPerMeasure: number; // 2, 3, 4, 6
  soundEnabled: boolean;
}

export interface PresentationConfig {
  fontSize: number; // 12px to 48px
  theme: 'parchment' | 'dark' | 'classic' | 'retro-terminal';
  twoColumns: boolean;
  autoScrollSpeed: number; // 0 to 10 scale
}

export interface WorshipEvent {
  id: string;
  title: string;
  date: string;
  time?: string;
  description?: string;
  songIds: string[]; // references of Song IDs
  updatedAt?: number;
}

export type UserRole = 'admin' | 'guest' | 'choir';

export interface SuggestedSong {
  id: string;
  songId: string;
  songTitle: string;
  suggestedBy: string;
  timestamp: number;
  note?: string;
}

export interface ServerInfo {
  id: string;
  name: string;
  showOnPublicList: boolean;
  createdAt: number;
}


