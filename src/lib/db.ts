import { Song, ServerInfo, WorshipEvent, SetlistSongItem } from '../types';

const DB_NAME = 'ChristianLyricsDB';
const STORE_NAME = 'songs';
const DB_VERSION = 1;

export function getActiveServerId(): string {
  return localStorage.getItem('dasong_active_server_id') || 'default';
}

export function canMutateCloud(): boolean {
  if (typeof window === 'undefined') return false;
  const serverId = localStorage.getItem('dasong_active_server_id') || 'default';
  const savedRole = localStorage.getItem(`lyrasync_user_role_${serverId}`) || 'guest';
  return savedRole === 'admin';
}

export function shouldSkipSync(): boolean {
  // Read & fetch operations are never skipped so Guests get 100% of all songs from MongoDB
  return false;
}

export function switchActiveServer(serverId: string): void {
  localStorage.setItem('dasong_active_server_id', serverId);
  if (_cachedDB) {
    _cachedDB.close();
    _cachedDB = null;
  }
}

function getServerStorageKey(key: string): string {
  // If the key is related to songs catalog syncing, return it unpartitioned (global)
  if (
    key === 'dasong_unsynced_song_ids' || 
    key === 'dasong_local_max_updated_at' ||
    key === 'dasong_has_seeded'
  ) {
    return key;
  }
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
    // Open the global database (unpartitioned) so songs library cache is shared across workspaces
    const dbName = DB_NAME;
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
async function cleanupCorruptedLocalSongs(): Promise<void> {
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


function stripMongoId<T extends { _id?: string }>(obj: T): Omit<T, '_id'> {
  const { _id, ...rest } = obj;
  return rest;
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
  if (response.status === 204) {
    return null;
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



// Synchronizes the cloud MongoDB state back to local IndexedDB and localStorage using Delta/Timestamp Sync
export async function syncWithMongoDB(): Promise<void> {
  // Clean up any corrupted local songs (e.g. empty/missing titles) to prevent runtime sorting/rendering crashes
  try {
    await cleanupCorruptedLocalSongs();
  } catch (err) {
    console.warn('Cleanup of corrupted local songs failed:', err);
  }

  // 0. Sync unsynced songs to cloud first (Admin only)
  if (canMutateCloud()) {
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
  }

  // Check if we are already in sync by using a lightweight check endpoint
  try {
    const syncCheck: { count: number; lastUpdated: number } = await apiRequest('/api/songs/sync-check');
    const localCheck = await getLocalSongsCountAndMaxTimestamp();

    if (localCheck.count === syncCheck.count && localCheck.lastUpdated === syncCheck.lastUpdated) {
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

  // Pull missing/outdated songs in sequential batches of 500 to optimize network throughput and prevent connection timeouts
  if (missingOrOutdatedIds.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < missingOrOutdatedIds.length; i += chunkSize) {
      const chunk = missingOrOutdatedIds.slice(i, i + chunkSize);
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
    }
  }

  // Save the new max timestamp to localStorage so future checks can hit the cache!
  serverLocalStorage.setItem('dasong_local_max_updated_at', String(maxCloudTime));
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
  
  if (!canMutateCloud()) {
    return;
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
  
  if (!canMutateCloud()) {
    return;
  }

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
  
  if (!canMutateCloud()) {
    return;
  }

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
  
  if (!canMutateCloud()) {
    return;
  }

  // Background cloud sync
  apiRequest('/api/songs', {
    method: 'DELETE'
  }).catch(err => {
    console.error('Failed to sync library clear to MongoDB:', err);
  });
}


const inMemorySongCache = new Map<string, Song>();

// Lazy-load lyrics for a single song (reads local in-memory cache for instant 0ms access)
export async function getSongById(id: string): Promise<Song | null> {
  const cached = inMemorySongCache.get(id);
  if (cached) return cached;

  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const res = request.result || null;
      if (res) {
        if (inMemorySongCache.size > 2000) inMemorySongCache.clear();
        inMemorySongCache.set(id, res);
      }
      resolve(res);
    };
    request.onerror = () => reject(request.error);
  });
}

// Fast scan: retrieve only metadata fields to conserve memory
export interface SongMetadata {
  id: string;
  title: string;
  author?: string;
  key?: string;
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

export function getWorshipEvents(): WorshipEvent[] {
  const serverId = getActiveServerId();
  const saved = localStorage.getItem(`dasong_events_${serverId}`);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (err) {
      console.error('Failed to parse worship events:', err);
    }
  }
  return [];
}

export async function fetchWorshipEventsFromCloud(): Promise<WorshipEvent[]> {
  try {
    const serverEvents: WorshipEvent[] = await apiRequest('/api/events');
    if (Array.isArray(serverEvents)) {
      const serverId = getActiveServerId();
      serverEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      localStorage.setItem(`dasong_events_${serverId}`, JSON.stringify(serverEvents));
      return serverEvents;
    }
  } catch (err) {
    console.error('Failed to fetch worship events from cloud:', err);
  }
  return getWorshipEvents();
}

export function saveWorshipEvent(event: WorshipEvent): WorshipEvent[] {
  const serverId = getActiveServerId();
  const events = getWorshipEvents();
  const index = events.findIndex(e => e.id === event.id);
  
  const updatedEvent = { ...event, updatedAt: Date.now() };
  if (index >= 0) {
    events[index] = updatedEvent;
  } else {
    events.push(updatedEvent);
  }

  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  localStorage.setItem(`dasong_events_${serverId}`, JSON.stringify(events));

  // Sync to MongoDB Cloud ONLY if logged in as Admin
  if (canMutateCloud()) {
    apiRequest('/api/events', {
      method: 'POST',
      body: JSON.stringify(updatedEvent)
    }).catch(err => {
      console.error('Failed to sync worship event to cloud:', err);
    });
  }

  return events;
}

export function deleteWorshipEvent(eventId: string): WorshipEvent[] {
  const serverId = getActiveServerId();
  const events = getWorshipEvents().filter(e => e.id !== eventId);
  localStorage.setItem(`dasong_events_${serverId}`, JSON.stringify(events));

  // Delete from MongoDB Cloud ONLY if logged in as Admin
  if (canMutateCloud()) {
    apiRequest(`/api/events/${eventId}`, {
      method: 'DELETE'
    }).catch(err => {
      console.error('Failed to delete worship event from cloud:', err);
    });
  }

  return events;
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

// --- LIVE SERVICE LYRICS SYNC SYNCING ACTIONS ---

export interface BroadcastState {
  serverId: string;
  songId: string | null;
  activeLineIndex: number;
  updatedAt: number;
}

export async function broadcastState(songId: string | null, activeLineIndex: number): Promise<{ success: boolean; broadcast: BroadcastState }> {
  return apiRequest('/api/broadcast', {
    method: 'POST',
    body: JSON.stringify({ songId, activeLineIndex })
  });
}

export async function getBroadcastState(): Promise<BroadcastState | null> {
  try {
    return await apiRequest('/api/broadcast');
  } catch (err) {
    console.error('Failed to get broadcast state:', err);
    return null;
  }
}

