export interface Song {
  id: string;
  title: string;
  lyrics: string;
  author?: string;
  key?: string; // Default key e.g., "G", "C"
  favorite?: boolean;
  createdAt: number;
  updatedAt?: number;
}

export type PlaybackStatus = 'idle' | 'playing' | 'paused';

export interface PresentationConfig {
  fontSize: number; // 12px to 48px
  theme: 'parchment' | 'dark' | 'classic' | 'retro-terminal' | 'custom';
  twoColumns: boolean;
  autoScrollSpeed: number; // 0 to 10 scale
  customBg: string;        // hex color for custom background
  customTextColor: string; // hex color for custom text
  fontFamily: 'serif' | 'sans' | 'mono';
}

export type UserRole = 'admin' | 'guest' | 'choir';

export interface ServerInfo {
  id: string;
  name: string;
  showOnPublicList: boolean;
  createdAt: number;
}

export interface SetlistSongItem {
  songId: string;
  title: string;
  customKey?: string;
  leadVocalist?: string;
  notes?: string;
}

export interface WorshipEvent {
  id: string;
  name: string;
  date: string; // ISO format e.g., "2026-08-16"
  time?: string; // e.g., "09:30 AM"
  venue?: string; // e.g., "Main Sanctuary"
  notes?: string;
  published: boolean; // Only published setlists are visible to Choir Members & Guests
  songs: SetlistSongItem[];
  createdAt: number;
  updatedAt: number;
}
