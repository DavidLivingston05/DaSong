import { Song, WorshipEvent, SuggestedSong } from '../types';

const DB_NAME = 'ChristianLyricsDB';
const STORE_NAME = 'songs';
const DB_VERSION = 1;

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('title', 'title', { unique: false });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('favorite', 'favorite', { unique: false });
      }
    };
  });
}

// -------------------------------------------------------------------------
// INNER LOCAL INDEXEDDB HELPERS
// -------------------------------------------------------------------------

async function saveSongIndexedDB(song: Song): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(song);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function deleteSongIndexedDB(id: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function saveSongsBatchIndexedDB(songs: Song[]): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);

    for (const song of songs) {
      store.put(song);
    }
  });
}

async function clearAllSongsIndexedDB(): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// -------------------------------------------------------------------------
// PUBLIC CODES ROUTING (LOCAL ONLY)
// -------------------------------------------------------------------------

// Bulk insert songs in unified single transaction for maximum upload speed
export async function saveSongsBatch(songs: Song[]): Promise<void> {
  await saveSongsBatchIndexedDB(songs);
}

export async function saveSong(song: Song): Promise<void> {
  await saveSongIndexedDB(song);
}

export async function deleteSong(id: string): Promise<void> {
  await deleteSongIndexedDB(id);
}

export async function clearAllSongs(): Promise<void> {
  await clearAllSongsIndexedDB();
}

// Lazy-load lyrics for a single song (reads local for instant 0ms access)
export async function getSongById(id: string): Promise<Song | null> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

// Fast scan: retrieve only metadata fields to conserve memory
export interface SongMetadata {
  id: string;
  title: string;
  author?: string;
  key?: string;
  bpm?: number;
  category?: string;
  favorite?: boolean;
}

export async function getAllSongsMetadata(): Promise<SongMetadata[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const metadataList: SongMetadata[] = [];

    // Use a cursor to step through records, grabbing metadata without storing massive lyrics arrays
    const request = store.openCursor();

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        const val = cursor.value;
        metadataList.push({
          id: val.id,
          title: val.title,
          author: val.author,
          key: val.key,
          bpm: val.bpm,
          category: val.category,
          favorite: !!val.favorite
        });
        cursor.continue();
      } else {
        resolve(metadataList);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

// -------------------------------------------------------------------------
// WORSHIP EVENTS LOCAL SYSTEM
// -------------------------------------------------------------------------

export function getLocalWorshipEvents(): WorshipEvent[] {
  const saved = localStorage.getItem('lyrasync_events');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return [];
    }
  }
  // Default starter event
  return [
    {
      id: 'event-starter-1',
      title: 'Sunday Service 1 - Morning Praise',
      date: new Date().toISOString().split('T')[0],
      time: '09:00',
      description: 'Morning praise & devotion segment',
      songIds: []
    }
  ];
}

export function saveLocalWorshipEvents(events: WorshipEvent[]) {
  localStorage.setItem('lyrasync_events', JSON.stringify(events));
}

export async function saveWorshipEvent(event: WorshipEvent): Promise<void> {
  const localEvents = getLocalWorshipEvents();
  const index = localEvents.findIndex(e => e.id === event.id);
  if (index >= 0) {
    localEvents[index] = event;
  } else {
    localEvents.push(event);
  }
  saveLocalWorshipEvents(localEvents);
}

export async function deleteWorshipEvent(id: string): Promise<void> {
  const localEvents = getLocalWorshipEvents().filter(e => e.id !== id);
  saveLocalWorshipEvents(localEvents);
}

// -------------------------------------------------------------------------
// CHOIR SUGGESTIONS LOCAL SYSTEM
// -------------------------------------------------------------------------

export function getLocalSuggestions(): SuggestedSong[] {
  const saved = localStorage.getItem('lyrasync_guideline_suggestions');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return [];
    }
  }
  return [];
}

export function saveLocalSuggestions(suggestions: SuggestedSong[]) {
  localStorage.setItem('lyrasync_guideline_suggestions', JSON.stringify(suggestions));
}

export async function saveSuggestion(suggestion: SuggestedSong): Promise<void> {
  const localSuggestions = getLocalSuggestions();
  if (!localSuggestions.some(s => s.songId === suggestion.songId)) {
    localSuggestions.push(suggestion);
    saveLocalSuggestions(localSuggestions);
  }
}

export async function deleteSuggestion(id: string): Promise<void> {
  const localSuggestions = getLocalSuggestions().filter(s => s.id !== id);
  saveLocalSuggestions(localSuggestions);
}
