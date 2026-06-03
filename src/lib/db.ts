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
// BACKEND API INTEGRATION HELPERS
// -------------------------------------------------------------------------

async function apiRequest(path: string, options?: RequestInit): Promise<any> {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {})
    }
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || `API error: ${response.status}`);
  }
  return response.json();
}

async function getLocalSongsCountAndMaxTimestamp(): Promise<{ count: number, lastUpdated: number }> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const countRequest = store.count();

    countRequest.onerror = () => reject(countRequest.error);
    countRequest.onsuccess = () => {
      const count = countRequest.result;
      const cachedTimeStr = localStorage.getItem('dasong_local_max_updated_at');
      const lastUpdated = cachedTimeStr ? parseInt(cachedTimeStr, 10) : 0;
      resolve({ count, lastUpdated });
    };
  });
}

// Bi-directional event synchronization to prevent local event changes from being overwritten by sync
async function syncEventsBiDirectional(cloudEvents: WorshipEvent[]): Promise<void> {
  const localEvents = getLocalWorshipEvents();
  const localEventsMap = new Map<string, WorshipEvent>();
  localEvents.forEach(e => localEventsMap.set(e.id, e));
  
  const mergedEvents = [...localEvents];
  const eventsToSyncToCloud: WorshipEvent[] = [];
  
  cloudEvents.forEach(cloudEv => {
    const localEv = localEventsMap.get(cloudEv.id);
    const cloudTime = cloudEv.updatedAt || 0;
    const localTime = localEv ? (localEv.updatedAt || 0) : 0;
    
    if (!localEv) {
      // Missing locally
      mergedEvents.push(cloudEv);
    } else if (cloudTime > localTime) {
      // Cloud is newer, overwrite local
      const idx = mergedEvents.findIndex(e => e.id === cloudEv.id);
      if (idx >= 0) mergedEvents[idx] = cloudEv;
    } else if (localTime > cloudTime) {
      // Local is newer, sync back to cloud
      eventsToSyncToCloud.push(localEv);
    }
  });
  
  // Sync local events not present in cloud
  const cloudEventsIds = new Set(cloudEvents.map(e => e.id));
  localEvents.forEach(localEv => {
    if (!cloudEventsIds.has(localEv.id)) {
      eventsToSyncToCloud.push(localEv);
    }
  });

  saveLocalWorshipEvents(mergedEvents);
  
  if (eventsToSyncToCloud.length > 0) {
    for (const ev of eventsToSyncToCloud) {
      try {
        await apiRequest('/api/events', {
          method: 'POST',
          body: JSON.stringify(ev)
        });
      } catch (err) {
        console.error(`Failed to background sync event ${ev.id} to cloud:`, err);
      }
    }
  }
}

// Synchronizes the cloud MongoDB state back to local IndexedDB and localStorage using Delta/Timestamp Sync
export async function syncWithMongoDB(): Promise<void> {
  // Check if we are already in sync by using a lightweight check endpoint
  try {
    const syncCheck: { count: number; lastUpdated: number } = await apiRequest('/api/songs/sync-check');
    const localCheck = await getLocalSongsCountAndMaxTimestamp();

    if (localCheck.count === syncCheck.count && localCheck.lastUpdated === syncCheck.lastUpdated) {
      // Local is in sync, only sync calendar events and choir suggestions to keep things light
      const cloudEvents: WorshipEvent[] = await apiRequest('/api/events');
      await syncEventsBiDirectional(cloudEvents);

      const cloudSuggestions: SuggestedSong[] = await apiRequest('/api/suggestions');
      saveLocalSuggestions(cloudSuggestions);
      return;
    }
  } catch (err) {
    console.warn('API sync-check failed, falling back to full delta sync check:', err);
  }

  // 1. Sync Songs in an optimized Delta fashion to scale to 15,000+ songs
  const cloudMetadata: SongMetadata[] = await apiRequest('/api/songs/metadata');
  const localMetadata = await getAllSongsMetadata();

  const localMetadataMap = new Map<string, SongMetadata>();
  for (const s of localMetadata) {
    localMetadataMap.set(s.id, s);
  }

  const cloudIds = new Set<string>();
  const missingOrOutdatedIds: string[] = [];

  let maxCloudTime = 0;
  for (const cloudSong of cloudMetadata) {
    cloudIds.add(cloudSong.id);
    const localSong = localMetadataMap.get(cloudSong.id);

    const cloudTime = cloudSong.updatedAt || cloudSong.createdAt || 0;
    if (cloudTime > maxCloudTime) maxCloudTime = cloudTime;

    if (!localSong) {
      // Missing locally
      missingOrOutdatedIds.push(cloudSong.id);
    } else {
      // Compare timestamps
      const localTime = localSong.updatedAt || localSong.createdAt || 0;
      if (cloudTime > localTime) {
        missingOrOutdatedIds.push(cloudSong.id);
      }
    }
  }

  // Delete local songs that were deleted from the cloud database
  for (const localSong of localMetadata) {
    if (!cloudIds.has(localSong.id)) {
      await deleteSongIndexedDB(localSong.id);
    }
  }

  // Pull missing/outdated songs in batches of 200 to prevent server/Vercel payload limits
  if (missingOrOutdatedIds.length > 0) {
    const chunkSize = 200;
    for (let i = 0; i < missingOrOutdatedIds.length; i += chunkSize) {
      const chunk = missingOrOutdatedIds.slice(i, i + chunkSize);
      const fullSongsChunk: Song[] = await apiRequest('/api/songs/fetch-batch', {
        method: 'POST',
        body: JSON.stringify({ ids: chunk })
      });
      if (fullSongsChunk.length > 0) {
        await saveSongsBatchIndexedDB(fullSongsChunk);
      }
    }
  }

  // Save the new max timestamp to localStorage so future checks can hit the cache!
  localStorage.setItem('dasong_local_max_updated_at', String(maxCloudTime));

  // 2. Sync Worship Calendar Events
  const cloudEvents: WorshipEvent[] = await apiRequest('/api/events');
  await syncEventsBiDirectional(cloudEvents);

  // 3. Sync Choir Guidelines Suggestions
  const cloudSuggestions: SuggestedSong[] = await apiRequest('/api/suggestions');
  saveLocalSuggestions(cloudSuggestions);
}

// -------------------------------------------------------------------------
// PUBLIC CODES ROUTING (LOCAL + MONGO CLOUD)
// -------------------------------------------------------------------------

// Bulk insert songs in unified single transaction
export async function saveSongsBatch(songs: Song[]): Promise<void> {
  await saveSongsBatchIndexedDB(songs);
  let maxTime = 0;
  for (const s of songs) {
    const t = s.updatedAt || s.createdAt || 0;
    if (t > maxTime) maxTime = t;
  }
  if (maxTime > 0) {
    localStorage.setItem('dasong_local_max_updated_at', String(maxTime));
  }
  try {
    await apiRequest('/api/songs', {
      method: 'POST',
      body: JSON.stringify(songs)
    });
  } catch (err) {
    console.error('Failed to sync batch to MongoDB:', err);
    throw err;
  }
}

export async function saveSong(song: Song): Promise<void> {
  await saveSongIndexedDB(song);
  const now = song.updatedAt || song.createdAt || Date.now();
  localStorage.setItem('dasong_local_max_updated_at', String(now));
  try {
    await apiRequest('/api/songs', {
      method: 'POST',
      body: JSON.stringify(song)
    });
  } catch (err) {
    console.error('Failed to sync song to MongoDB:', err);
    throw err;
  }
}

export async function deleteSong(id: string): Promise<void> {
  await deleteSongIndexedDB(id);
  // Remove last updated cache to force recalculation on next sync check
  localStorage.removeItem('dasong_local_max_updated_at');
  try {
    await apiRequest(`/api/songs/${id}`, {
      method: 'DELETE'
    });
  } catch (err) {
    console.error('Failed to sync song deletion to MongoDB:', err);
    throw err;
  }
}

export async function clearAllSongs(): Promise<void> {
  await clearAllSongsIndexedDB();
  localStorage.removeItem('dasong_local_max_updated_at');
  try {
    await apiRequest('/api/songs', {
      method: 'DELETE'
    });
  } catch (err) {
    console.error('Failed to sync library clear to MongoDB:', err);
    throw err;
  }
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
  createdAt?: number;
  updatedAt?: number;
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
          favorite: !!val.favorite,
          createdAt: val.createdAt,
          updatedAt: val.updatedAt
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
// WORSHIP EVENTS LOCAL SYSTEM + MONGO CLOUD
// -------------------------------------------------------------------------

export function getLocalWorshipEvents(): WorshipEvent[] {
  const saved = localStorage.getItem('lyrasync_events');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.map(e => ({
          ...e,
          songIds: Array.isArray(e.songIds) ? e.songIds : []
        }));
      }
      return [];
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
  const normalized = events.map(e => ({
    ...e,
    songIds: Array.isArray(e.songIds) ? e.songIds : []
  }));
  localStorage.setItem('lyrasync_events', JSON.stringify(normalized));
}

export async function saveWorshipEvent(event: WorshipEvent): Promise<void> {
  const eventWithTimestamp = { ...event, updatedAt: Date.now() };
  const localEvents = getLocalWorshipEvents();
  const index = localEvents.findIndex(e => e.id === event.id);
  if (index >= 0) {
    localEvents[index] = eventWithTimestamp;
  } else {
    localEvents.push(eventWithTimestamp);
  }
  saveLocalWorshipEvents(localEvents);

  try {
    await apiRequest('/api/events', {
      method: 'POST',
      body: JSON.stringify(eventWithTimestamp)
    });
  } catch (err) {
    console.error('Failed to sync worship event to MongoDB:', err);
    throw err;
  }
}

export async function deleteWorshipEvent(id: string): Promise<void> {
  const localEvents = getLocalWorshipEvents().filter(e => e.id !== id);
  saveLocalWorshipEvents(localEvents);

  try {
    await apiRequest(`/api/events/${id}`, {
      method: 'DELETE'
    });
  } catch (err) {
    console.error('Failed to sync worship event deletion to MongoDB:', err);
    throw err;
  }
}

// -------------------------------------------------------------------------
// CHOIR SUGGESTIONS LOCAL SYSTEM + MONGO CLOUD
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

  try {
    await apiRequest('/api/suggestions', {
      method: 'POST',
      body: JSON.stringify(suggestion)
    });
  } catch (err) {
    console.error('Failed to sync suggestion to MongoDB:', err);
    throw err;
  }
}

export async function deleteSuggestion(id: string): Promise<void> {
  const localSuggestions = getLocalSuggestions().filter(s => s.id !== id);
  saveLocalSuggestions(localSuggestions);

  try {
    await apiRequest(`/api/suggestions/${id}`, {
      method: 'DELETE'
    });
  } catch (err) {
    console.error('Failed to sync suggestion deletion to MongoDB:', err);
    throw err;
  }
}
