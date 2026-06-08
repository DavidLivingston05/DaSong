import { Song, WorshipEvent, SuggestedSong, ServerInfo } from '../types';

const DB_NAME = 'ChristianLyricsDB';
const STORE_NAME = 'songs';
const DB_VERSION = 1;

export function getActiveServerId(): string {
  return localStorage.getItem('dasong_active_server_id') || 'default';
}

export function switchActiveServer(serverId: string): void {
  localStorage.setItem('dasong_active_server_id', serverId);
  if (_cachedDB) {
    _cachedDB.close();
    _cachedDB = null;
  }
}

export function getServerStorageKey(key: string): string {
  const serverId = getActiveServerId();
  return `${key}_${serverId}`;
}

const serverLocalStorage = {
  getItem: (key: string) => localStorage.getItem(getServerStorageKey(key)),
  setItem: (key: string, value: string) => localStorage.setItem(getServerStorageKey(key), value),
  removeItem: (key: string) => localStorage.removeItem(getServerStorageKey(key))
};

// Module-level IDB connection cache — opened once, reused for all operations (#14)
let _cachedDB: IDBDatabase | null = null;

export function initDB(): Promise<IDBDatabase> {
  if (_cachedDB) return Promise.resolve(_cachedDB);

  return new Promise((resolve, reject) => {
    const serverId = getActiveServerId();
    const dbName = `${DB_NAME}_${serverId}`;
    const request = indexedDB.open(dbName, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      _cachedDB = request.result;
      // Clear cache if the connection closes unexpectedly
      _cachedDB.onclose = () => { _cachedDB = null; };
      resolve(_cachedDB);
    };

    request.onupgradeneeded = () => {
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
export async function cleanupCorruptedLocalSongs(): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        const val = cursor.value;
        if (!val || !val.id || !val.title || String(val.title).trim() === '') {
          console.warn('Deleting corrupted local song from IndexedDB:', val);
          cursor.delete();
        }
        cursor.continue();
      } else {
        resolve();
      }
    };

    request.onerror = () => reject(request.error);
  });
}

// -------------------------------------------------------------------------
// BACKEND API INTEGRATION HELPERS
// -------------------------------------------------------------------------

function getUnsyncedSongIds(): string[] {
  const saved = serverLocalStorage.getItem('dasong_unsynced_song_ids');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function addUnsyncedSongIds(ids: string[]): void {
  const current = new Set(getUnsyncedSongIds());
  ids.forEach(id => current.add(id));
  serverLocalStorage.setItem('dasong_unsynced_song_ids', JSON.stringify(Array.from(current)));
}

function removeUnsyncedSongIds(ids: string[]): void {
  const current = new Set(getUnsyncedSongIds());
  ids.forEach(id => current.delete(id));
  serverLocalStorage.setItem('dasong_unsynced_song_ids', JSON.stringify(Array.from(current)));
}

function getUnsyncedEventIds(): string[] {
  const saved = serverLocalStorage.getItem('dasong_unsynced_event_ids');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function addUnsyncedEventIds(ids: string[]): void {
  const current = new Set(getUnsyncedEventIds());
  ids.forEach(id => current.add(id));
  serverLocalStorage.setItem('dasong_unsynced_event_ids', JSON.stringify(Array.from(current)));
}

function removeUnsyncedEventIds(ids: string[]): void {
  const current = new Set(getUnsyncedEventIds());
  ids.forEach(id => current.delete(id));
  serverLocalStorage.setItem('dasong_unsynced_event_ids', JSON.stringify(Array.from(current)));
}

function getUnsyncedDeletedEventIds(): string[] {
  const saved = serverLocalStorage.getItem('dasong_unsynced_deleted_event_ids');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function addUnsyncedDeletedEventIds(ids: string[]): void {
  const current = new Set(getUnsyncedDeletedEventIds());
  ids.forEach(id => current.add(id));
  serverLocalStorage.setItem('dasong_unsynced_deleted_event_ids', JSON.stringify(Array.from(current)));
}

function removeUnsyncedDeletedEventIds(ids: string[]): void {
  const current = new Set(getUnsyncedDeletedEventIds());
  ids.forEach(id => current.delete(id));
  serverLocalStorage.setItem('dasong_unsynced_deleted_event_ids', JSON.stringify(Array.from(current)));
}

function getUnsyncedSuggestionIds(): string[] {
  const saved = serverLocalStorage.getItem('dasong_unsynced_suggestion_ids');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function addUnsyncedSuggestionIds(ids: string[]): void {
  const current = new Set(getUnsyncedSuggestionIds());
  ids.forEach(id => current.add(id));
  serverLocalStorage.setItem('dasong_unsynced_suggestion_ids', JSON.stringify(Array.from(current)));
}

function removeUnsyncedSuggestionIds(ids: string[]): void {
  const current = new Set(getUnsyncedSuggestionIds());
  ids.forEach(id => current.delete(id));
  serverLocalStorage.setItem('dasong_unsynced_suggestion_ids', JSON.stringify(Array.from(current)));
}

function getUnsyncedDeletedSuggestionIds(): string[] {
  const saved = serverLocalStorage.getItem('dasong_unsynced_deleted_suggestion_ids');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function addUnsyncedDeletedSuggestionIds(ids: string[]): void {
  const current = new Set(getUnsyncedDeletedSuggestionIds());
  ids.forEach(id => current.add(id));
  serverLocalStorage.setItem('dasong_unsynced_deleted_suggestion_ids', JSON.stringify(Array.from(current)));
}

function removeUnsyncedDeletedSuggestionIds(ids: string[]): void {
  const current = new Set(getUnsyncedDeletedSuggestionIds());
  ids.forEach(id => current.delete(id));
  serverLocalStorage.setItem('dasong_unsynced_deleted_suggestion_ids', JSON.stringify(Array.from(current)));
}

async function apiRequest(path: string, options?: RequestInit): Promise<any> {
  let url = path;
  const method = options?.method || 'GET';
  if (method.toUpperCase() === 'GET') {
    const buster = `t=${Date.now()}`;
    url = url.includes('?') ? `${url}&${buster}` : `${url}?${buster}`;
  }
  const serverId = getActiveServerId();
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-server-id': serverId,
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
      const cachedTimeStr = serverLocalStorage.getItem('dasong_local_max_updated_at');
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
  
  const deletedIds = new Set(getUnsyncedDeletedEventIds());
  
  cloudEvents.forEach(cloudEv => {
    // If this event has a pending local deletion, ignore it
    if (deletedIds.has(cloudEv.id)) {
      return;
    }

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
  const unsyncedSaves = new Set(getUnsyncedEventIds());

  localEvents.forEach(localEv => {
    if (!cloudEventsIds.has(localEv.id) && !unsyncedSaves.has(localEv.id) && !deletedIds.has(localEv.id)) {
      eventsToSyncToCloud.push(localEv);
    }
  });

  saveLocalWorshipEvents(mergedEvents);
  
  if (eventsToSyncToCloud.length > 0) {
    for (const ev of eventsToSyncToCloud) {
      try {
        // Strip MongoDB's _id before sending — it cannot be updated via $set
        const { _id, ...evData } = ev as any;
        await apiRequest('/api/events', {
          method: 'POST',
          body: JSON.stringify(evData)
        });
      } catch (err) {
        console.error(`Failed to background sync event ${ev.id} to cloud:`, err);
      }
    }
  }
}

// Synchronizes the cloud MongoDB state back to local IndexedDB and localStorage using Delta/Timestamp Sync
export async function syncWithMongoDB(): Promise<void> {
  // Clean up any corrupted local songs (e.g. empty/missing titles) to prevent runtime sorting/rendering crashes
  try {
    await cleanupCorruptedLocalSongs();
  } catch (err) {
    console.warn('Cleanup of corrupted local songs failed:', err);
  }

  // 0. Sync unsynced songs to cloud first
  const unsyncedIds = getUnsyncedSongIds();
  if (unsyncedIds.length > 0) {
    const songsToSync: Song[] = [];
    for (const id of unsyncedIds) {
      const song = await getSongById(id);
      if (song) {
        songsToSync.push(song);
      }
    }
    if (songsToSync.length > 0) {
      try {
        await apiRequest('/api/songs', {
          method: 'POST',
          body: JSON.stringify(songsToSync)
        });
        removeUnsyncedSongIds(unsyncedIds);
      } catch (err) {
        console.error('Failed to sync queued unsynced songs to MongoDB:', err);
      }
    }
  }

  // A. Flush pending event deletions
  const unsyncedDeletedEventIds = getUnsyncedDeletedEventIds();
  if (unsyncedDeletedEventIds.length > 0) {
    for (const id of unsyncedDeletedEventIds) {
      try {
        await apiRequest(`/api/events/${id}`, { method: 'DELETE' });
        removeUnsyncedDeletedEventIds([id]);
      } catch (err) {
        console.error(`Failed to background sync event deletion for ${id}:`, err);
      }
    }
  }

  // B. Flush pending event saves
  const unsyncedEventIds = getUnsyncedEventIds();
  if (unsyncedEventIds.length > 0) {
    const localEvents = getLocalWorshipEvents();
    for (const id of unsyncedEventIds) {
      const event = localEvents.find(e => e.id === id);
      if (event) {
        try {
          const { _id, ...eventPayload } = event as any;
          await apiRequest('/api/events', {
            method: 'POST',
            body: JSON.stringify(eventPayload)
          });
          removeUnsyncedEventIds([id]);
        } catch (err) {
          console.error(`Failed to background sync event save for ${id}:`, err);
        }
      } else {
        removeUnsyncedEventIds([id]);
      }
    }
  }

  // C. Flush pending suggestion deletions
  const unsyncedDeletedSuggestionIds = getUnsyncedDeletedSuggestionIds();
  if (unsyncedDeletedSuggestionIds.length > 0) {
    for (const id of unsyncedDeletedSuggestionIds) {
      try {
        await apiRequest(`/api/suggestions/${id}`, { method: 'DELETE' });
        removeUnsyncedDeletedSuggestionIds([id]);
      } catch (err) {
        console.error(`Failed to background sync suggestion deletion for ${id}:`, err);
      }
    }
  }

  // D. Flush pending suggestion saves
  const unsyncedSuggestionIds = getUnsyncedSuggestionIds();
  if (unsyncedSuggestionIds.length > 0) {
    const localSuggestions = getLocalSuggestions();
    for (const id of unsyncedSuggestionIds) {
      const suggestion = localSuggestions.find(s => s.id === id);
      if (suggestion) {
        try {
          await apiRequest('/api/suggestions', {
            method: 'POST',
            body: JSON.stringify(suggestion)
          });
          removeUnsyncedSuggestionIds([id]);
        } catch (err) {
          console.error(`Failed to background sync suggestion save for ${id}:`, err);
        }
      } else {
        removeUnsyncedSuggestionIds([id]);
      }
    }
  }

  // Check if we are already in sync by using a lightweight check endpoint
  try {
    const syncCheck: { count: number; lastUpdated: number } = await apiRequest('/api/songs/sync-check');
    const localCheck = await getLocalSongsCountAndMaxTimestamp();

    if (localCheck.count === syncCheck.count && localCheck.lastUpdated === syncCheck.lastUpdated) {
      // Local is in sync, only sync calendar events and choir suggestions to keep things light
      const cloudEvents: WorshipEvent[] = await apiRequest('/api/events');
      await syncEventsBiDirectional(cloudEvents);

      const cloudSuggestions: SuggestedSong[] = await apiRequest('/api/suggestions');
      const deletedSuggIds = new Set(getUnsyncedDeletedSuggestionIds());
      const filteredSuggestions = cloudSuggestions.filter(s => !deletedSuggIds.has(s.id));
      saveLocalSuggestions(filteredSuggestions);
      return;
    }
  } catch (err) {
    console.warn('API sync-check failed, falling back to full delta sync check:', err);
  }

  // 1. Sync Songs in an optimized Delta fashion to scale to 15,000+ songs
  const localCheck = await getLocalSongsCountAndMaxTimestamp();
  
  // Try to query count check to see if we are out of sync or if a deletion happened
  let isFullReconciliationRequired = false;
  try {
    const syncCheck: { count: number; lastUpdated: number } = await apiRequest('/api/songs/sync-check');
    if (syncCheck.count !== localCheck.count) {
      isFullReconciliationRequired = true;
    }
  } catch (err) {
    console.warn('Sync check query failed:', err);
    // If it fails, fallback to full sync to be safe
    isFullReconciliationRequired = true;
  }

  // If full reconciliation is required (or count check failed), since must be 0 to fetch all metadata.
  // Otherwise, we only fetch metadata for songs updated since our last local max timestamp!
  const since = isFullReconciliationRequired ? 0 : localCheck.lastUpdated;
  const cloudMetadata: SongMetadata[] = await apiRequest(`/api/songs/metadata?since=${since}`);
  const localMetadata = await getAllSongsMetadata();

  const localMetadataMap = new Map<string, SongMetadata>();
  for (const s of localMetadata) {
    localMetadataMap.set(s.id, s);
  }

  const cloudIds = new Set<string>();
  const missingOrOutdatedIds: string[] = [];

  let maxCloudTime = since;
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

  // Delete local songs that were deleted from the cloud database, unless they are unsynced new additions
  // BUT only perform this delete check if we fetched the FULL metadata (since === 0)!
  if (since === 0) {
    const currentUnsynced = new Set(getUnsyncedSongIds());
    for (const localSong of localMetadata) {
      if (!cloudIds.has(localSong.id) && !currentUnsynced.has(localSong.id)) {
        await deleteSongIndexedDB(localSong.id);
      }
    }
  }

  // Pull missing/outdated songs in parallel batches of 500 to optimize network throughput and prevent timeouts
  if (missingOrOutdatedIds.length > 0) {
    const chunkSize = 500;
    const fetchPromises: Promise<void>[] = [];
    
    for (let i = 0; i < missingOrOutdatedIds.length; i += chunkSize) {
      const chunk = missingOrOutdatedIds.slice(i, i + chunkSize);
      const fetchPromise = (async () => {
        try {
          const fullSongsChunk: Song[] = await apiRequest('/api/songs/fetch-batch', {
            method: 'POST',
            body: JSON.stringify({ ids: chunk })
          });
          if (fullSongsChunk.length > 0) {
            await saveSongsBatchIndexedDB(fullSongsChunk);
          }
        } catch (err) {
          console.error('Failed to sync batch chunk:', err);
          throw err;
        }
      })();
      fetchPromises.push(fetchPromise);
    }
    
    // Concurrently await all batch chunks
    await Promise.all(fetchPromises);
  }

  // Save the new max timestamp to localStorage so future checks can hit the cache!
  serverLocalStorage.setItem('dasong_local_max_updated_at', String(maxCloudTime));

  // 2. Sync Worship Calendar Events
  const cloudEvents: WorshipEvent[] = await apiRequest('/api/events');
  await syncEventsBiDirectional(cloudEvents);

  // 3. Sync Choir Guidelines Suggestions
  const cloudSuggestions: SuggestedSong[] = await apiRequest('/api/suggestions');
  const deletedSuggIds = new Set(getUnsyncedDeletedSuggestionIds());
  const filteredSuggestions = cloudSuggestions.filter(s => !deletedSuggIds.has(s.id));
  saveLocalSuggestions(filteredSuggestions);
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
    serverLocalStorage.setItem('dasong_local_max_updated_at', String(maxTime));
  }
  const ids = songs.map(s => s.id);
  addUnsyncedSongIds(ids);
  
  // Background cloud sync
  apiRequest('/api/songs', {
    method: 'POST',
    body: JSON.stringify(songs)
  }).then(() => {
    removeUnsyncedSongIds(ids);
  }).catch(err => {
    console.warn('Failed to sync batch to MongoDB, queued for background sync:', err);
  });
}

export async function saveSong(song: Song): Promise<void> {
  await saveSongIndexedDB(song);
  const now = song.updatedAt || song.createdAt || Date.now();
  serverLocalStorage.setItem('dasong_local_max_updated_at', String(now));
  addUnsyncedSongIds([song.id]);
  
  // Background cloud sync
  apiRequest('/api/songs', {
    method: 'POST',
    body: JSON.stringify(song)
  }).then(() => {
    removeUnsyncedSongIds([song.id]);
  }).catch(err => {
    console.warn('Failed to sync song to MongoDB, queued for background sync:', err);
  });
}

export async function deleteSong(id: string): Promise<void> {
  await deleteSongIndexedDB(id);
  // Remove last updated cache to force recalculation on next sync check
  serverLocalStorage.removeItem('dasong_local_max_updated_at');
  removeUnsyncedSongIds([id]);
  
  // Background cloud sync
  apiRequest(`/api/songs/${id}`, {
    method: 'DELETE'
  }).catch(err => {
    console.error('Failed to sync song deletion to MongoDB:', err);
  });
}

export async function clearAllSongs(): Promise<void> {
  await clearAllSongsIndexedDB();
  serverLocalStorage.removeItem('dasong_local_max_updated_at');
  serverLocalStorage.removeItem('dasong_unsynced_song_ids');
  
  // Background cloud sync
  apiRequest('/api/songs', {
    method: 'DELETE'
  }).catch(err => {
    console.error('Failed to sync library clear to MongoDB:', err);
  });
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
  lyricsSnippet?: string; // First 300 chars of lyrics for full-text search (#2)
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
          updatedAt: val.updatedAt,
          lyricsSnippet: val.lyrics ? (val.lyrics as string).slice(0, 1500) : undefined
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
  const saved = serverLocalStorage.getItem('lyrasync_events');
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
  serverLocalStorage.setItem('lyrasync_events', JSON.stringify(normalized));
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

  removeUnsyncedDeletedEventIds([event.id]);
  addUnsyncedEventIds([event.id]);

  // Strip MongoDB's _id before sending to prevent immutable field error
  const { _id, ...eventPayload } = eventWithTimestamp as any;
  apiRequest('/api/events', {
    method: 'POST',
    body: JSON.stringify(eventPayload)
  }).then(() => {
    removeUnsyncedEventIds([event.id]);
  }).catch(err => {
    console.warn('Failed to sync worship event to MongoDB, queued for background sync:', err);
  });
}

export async function deleteWorshipEvent(id: string): Promise<void> {
  const localEvents = getLocalWorshipEvents().filter(e => e.id !== id);
  saveLocalWorshipEvents(localEvents);

  removeUnsyncedEventIds([id]);
  addUnsyncedDeletedEventIds([id]);

  apiRequest(`/api/events/${id}`, {
    method: 'DELETE'
  }).then(() => {
    removeUnsyncedDeletedEventIds([id]);
  }).catch(err => {
    console.warn('Failed to sync worship event deletion to MongoDB, queued for background sync:', err);
  });
}

// -------------------------------------------------------------------------
// CHOIR SUGGESTIONS LOCAL SYSTEM + MONGO CLOUD
// -------------------------------------------------------------------------

export function getLocalSuggestions(): SuggestedSong[] {
  const saved = serverLocalStorage.getItem('lyrasync_guideline_suggestions');
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
  serverLocalStorage.setItem('lyrasync_guideline_suggestions', JSON.stringify(suggestions));
}

export async function saveSuggestion(suggestion: SuggestedSong): Promise<void> {
  const localSuggestions = getLocalSuggestions();
  if (!localSuggestions.some(s => s.songId === suggestion.songId)) {
    localSuggestions.push(suggestion);
    saveLocalSuggestions(localSuggestions);
  }

  removeUnsyncedDeletedSuggestionIds([suggestion.id]);
  addUnsyncedSuggestionIds([suggestion.id]);

  apiRequest('/api/suggestions', {
    method: 'POST',
    body: JSON.stringify(suggestion)
  }).then(() => {
    removeUnsyncedSuggestionIds([suggestion.id]);
  }).catch(err => {
    console.warn('Failed to sync suggestion to MongoDB, queued for background sync:', err);
  });
}

export async function deleteSuggestion(id: string): Promise<void> {
  const localSuggestions = getLocalSuggestions().filter(s => s.id !== id);
  saveLocalSuggestions(localSuggestions);

  removeUnsyncedSuggestionIds([id]);
  addUnsyncedDeletedSuggestionIds([id]);

  apiRequest(`/api/suggestions/${id}`, {
    method: 'DELETE'
  }).then(() => {
    removeUnsyncedDeletedSuggestionIds([id]);
  }).catch(err => {
    console.warn('Failed to sync suggestion deletion to MongoDB, queued for background sync:', err);
  });
}

// -------------------------------------------------------------------------
// SERVER/TENANT API ACTIONS
// -------------------------------------------------------------------------

export async function getPublicServers(): Promise<ServerInfo[]> {
  return apiRequest('/api/servers');
}

export async function createServer(serverData: { id: string; name: string; adminPassword?: string; showOnPublicList: boolean }): Promise<{ success: boolean; server: ServerInfo }> {
  return apiRequest('/api/servers', {
    method: 'POST',
    body: JSON.stringify(serverData)
  });
}

export async function authServerAdmin(serverId: string, password?: string): Promise<{ success: boolean }> {
  return apiRequest(`/api/servers/${serverId}/auth`, {
    method: 'POST',
    body: JSON.stringify({ password })
  });
}

