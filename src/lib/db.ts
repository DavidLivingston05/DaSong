import { Song, Setlist, SetlistSong } from '../types';

const DB_NAME = 'ChristianLyricsDB';
const STORE_NAME = 'songs';
const DB_VERSION = 1;

export function canMutateCloud(): boolean {
  if (typeof window === 'undefined') return false;
  const savedRole = localStorage.getItem('dasong_user_role') || 'user';
  return savedRole === 'admin';
}

export function shouldSkipSync(): boolean {
  return false;
}

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
  const saved = localStorage.getItem('dasong_unsynced_song_ids');
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
  localStorage.setItem('dasong_unsynced_song_ids', JSON.stringify(Array.from(current)));
}

function removeUnsyncedSongIds(ids: string[]): void {
  const current = new Set(getUnsyncedSongIds());
  ids.forEach(id => current.delete(id));
  localStorage.setItem('dasong_unsynced_song_ids', JSON.stringify(Array.from(current)));
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
  const token = typeof window !== 'undefined' ? localStorage.getItem('dasong_admin_token') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...((options?.headers as Record<string, string>) || {})
  };
  const response = await fetch(url, {
    ...options,
    headers
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
      const cachedTimeStr = localStorage.getItem('dasong_local_max_updated_at');
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

  // 0. Sync unsynced songs to cloud first in bulk-sync batches of 50
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
      const batchSize = 50;
      for (let i = 0; i < songsToSync.length; i += batchSize) {
        const batch = songsToSync.slice(i, i + batchSize);
        const batchIds = batch.map(s => s.id);
        try {
          await apiRequest('/api/songs/bulk-sync', {
            method: 'POST',
            body: JSON.stringify(batch)
          });
          removeUnsyncedSongIds(batchIds);
        } catch (err) {
          console.error('Failed to sync queued unsynced songs batch to MongoDB:', err);
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
  localStorage.setItem('dasong_local_max_updated_at', String(maxCloudTime));
  invalidateMetadataCache();
}

// -------------------------------------------------------------------------
// PUBLIC CODES ROUTING (LOCAL + MONGO CLOUD)
// -------------------------------------------------------------------------

// Bulk insert songs in unified single transaction
export async function saveSongsBatch(songs: Song[]): Promise<void> {
  await saveSongsBatchIndexedDB(songs);
  invalidateMetadataCache();
  let maxTime = 0;
  for (const s of songs) {
    const t = s.updatedAt || s.createdAt || 0;
    if (t > maxTime) maxTime = t;
  }
  if (maxTime > 0) {
    localStorage.setItem('dasong_local_max_updated_at', String(maxTime));
  }

  // Everyone can upload/add songs to MongoDB Cloud
  const ids = songs.map(s => s.id);
  addUnsyncedSongIds(ids);
  
  // Background cloud sync in 50-item batches to prevent server payload bottlenecks
  const batchSize = 50;
  for (let i = 0; i < songs.length; i += batchSize) {
    const chunk = songs.slice(i, i + batchSize);
    const chunkIds = chunk.map(s => s.id);
    apiRequest('/api/songs/bulk-sync', {
      method: 'POST',
      body: JSON.stringify(chunk)
    }).then(() => {
      removeUnsyncedSongIds(chunkIds);
    }).catch(err => {
      console.warn('Failed to sync batch chunk to MongoDB, queued for background sync:', err);
    });
  }
}

export async function saveSong(song: Song): Promise<void> {
  await saveSongIndexedDB(song);
  invalidateMetadataCache();
  const now = song.updatedAt || song.createdAt || Date.now();
  localStorage.setItem('dasong_local_max_updated_at', String(now));

  // Everyone can upload/add songs to MongoDB Cloud
  addUnsyncedSongIds([song.id]);
  
  // Background cloud sync via bulk-sync endpoint
  apiRequest('/api/songs/bulk-sync', {
    method: 'POST',
    body: JSON.stringify([song])
  }).then(() => {
    removeUnsyncedSongIds([song.id]);
  }).catch(err => {
    console.warn('Failed to sync song to MongoDB, queued for background sync:', err);
  });
}

export async function deleteSong(id: string): Promise<void> {
  await deleteSongIndexedDB(id);
  invalidateMetadataCache();
  // Remove last updated cache to force recalculation on next sync check
  localStorage.removeItem('dasong_local_max_updated_at');
  
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
  invalidateMetadataCache();
  localStorage.removeItem('dasong_local_max_updated_at');
  localStorage.removeItem('dasong_unsynced_song_ids');
  
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
  lyricsSnippet?: string; // First 1500 chars of lyrics for full-text search (#2)
}

let _cachedMetadata: SongMetadata[] | null = null;

export function invalidateMetadataCache(): void {
  _cachedMetadata = null;
}

export async function getAllSongsMetadata(forceRefresh = false): Promise<SongMetadata[]> {
  if (!forceRefresh && _cachedMetadata) {
    return _cachedMetadata;
  }

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
        _cachedMetadata = metadataList;
        resolve(metadataList);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

// -------------------------------------------------------------------------
// AUTHENTICATION API ACTIONS
// -------------------------------------------------------------------------

export async function authAdmin(password: string): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    const res = await apiRequest('/api/auth', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
    return res;
  } catch (err: any) {
    return { success: false, error: err.message || 'Authentication failed' };
  }
}

// --- LIVE SERVICE LYRICS SYNC SYNCING ACTIONS ---

export interface BroadcastState {
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

// -------------------------------------------------------------------------
// SETLISTS MANAGEMENT & CLOUD ACTIONS
// -------------------------------------------------------------------------

const SETLISTS_STORAGE_KEY = 'dasong_setlists';

export function getSetlists(): Setlist[] {
  try {
    const raw = localStorage.getItem(SETLISTS_STORAGE_KEY);
    if (!raw) return [];
    const list: Setlist[] = JSON.parse(raw);
    return list.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
  } catch (err) {
    console.error('Failed to load local setlists:', err);
    return [];
  }
}

export function saveLocalSetlists(setlists: Setlist[]): void {
  localStorage.setItem(SETLISTS_STORAGE_KEY, JSON.stringify(setlists));
}

export async function saveSetlist(setlist: Setlist): Promise<void> {
  const current = getSetlists();
  const existingIdx = current.findIndex(s => s.id === setlist.id);
  const updatedSetlist: Setlist = {
    ...setlist,
    updatedAt: Date.now()
  };

  let updatedList: Setlist[];
  if (existingIdx >= 0) {
    updatedList = current.map(s => s.id === setlist.id ? updatedSetlist : s);
  } else {
    updatedList = [updatedSetlist, ...current];
  }

  saveLocalSetlists(updatedList);

  // Sync to MongoDB Cloud
  try {
    await apiRequest('/api/setlists', {
      method: 'POST',
      body: JSON.stringify(updatedSetlist)
    });
  } catch (err) {
    console.warn('Setlist cloud sync notice:', err);
  }
}

export async function deleteSetlist(id: string): Promise<void> {
  const current = getSetlists();
  const updatedList = current.filter(s => s.id !== id);
  saveLocalSetlists(updatedList);

  try {
    await apiRequest(`/api/setlists/${id}`, {
      method: 'DELETE'
    });
  } catch (err) {
    console.warn('Setlist cloud delete notice:', err);
  }
}

export async function addSongToSetlist(
  setlistId: string,
  song: { id: string; title: string; author?: string; key?: string },
  customKey?: string
): Promise<{ success: boolean; setlist?: Setlist; message?: string }> {
  const current = getSetlists();
  const target = current.find(s => s.id === setlistId);
  if (!target) {
    return { success: false, message: 'Setlist not found' };
  }

  // Check if song already in setlist
  if (target.songs.some(s => s.id === song.id)) {
    return { success: false, message: `"${song.title}" is already in this setlist.` };
  }

  const newSongItem: SetlistSong = {
    id: song.id,
    title: song.title,
    author: song.author,
    key: song.key,
    customKey: customKey || song.key
  };

  const updatedSetlist: Setlist = {
    ...target,
    songs: [...target.songs, newSongItem],
    updatedAt: Date.now()
  };

  await saveSetlist(updatedSetlist);
  return { success: true, setlist: updatedSetlist };
}

export async function fetchSetlistsFromCloud(): Promise<Setlist[]> {
  try {
    const cloudSetlists: Setlist[] = await apiRequest('/api/setlists');
    if (Array.isArray(cloudSetlists)) {
      const local = getSetlists();
      const localMap = new Map(local.map(s => [s.id, s]));
      const cloudMap = new Map(cloudSetlists.map(s => [s.id, s]));

      const merged: Setlist[] = [];
      const allIds = new Set([...localMap.keys(), ...cloudMap.keys()]);

      let needsCloudUpload = false;
      const toUpload: Setlist[] = [];

      for (const id of allIds) {
        const l = localMap.get(id);
        const c = cloudMap.get(id);
        if (l && c) {
          if ((l.updatedAt || 0) > (c.updatedAt || 0)) {
            merged.push(l);
            toUpload.push(l);
            needsCloudUpload = true;
          } else {
            merged.push(c);
          }
        } else if (c) {
          merged.push(c);
        } else if (l) {
          merged.push(l);
          toUpload.push(l);
          needsCloudUpload = true;
        }
      }

      merged.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.updatedAt || 0) - (a.updatedAt || 0));
      saveLocalSetlists(merged);

      if (needsCloudUpload && toUpload.length > 0) {
        apiRequest('/api/setlists/bulk-sync', {
          method: 'POST',
          body: JSON.stringify(toUpload)
        }).catch(err => console.warn('Setlist auto-sync push error:', err));
      }

      return merged;
    }
  } catch (err) {
    console.warn('Failed to fetch setlists from cloud:', err);
  }
  return getSetlists();
}

