import { Song, WorshipEvent, SuggestedSong } from '../types';
import { getFirestoreDB, isFirebaseActive } from './firebase';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  writeBatch,
  onSnapshot
} from 'firebase/firestore';

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
// PUBLIC CODES ROUTING (HYBRID INTERACTION)
// -------------------------------------------------------------------------

// Bulk insert songs in unified single transaction for maximum upload speed
export async function saveSongsBatch(songs: Song[]): Promise<void> {
  // Always save locally first
  await saveSongsBatchIndexedDB(songs);

  if (isFirebaseActive()) {
    const db = getFirestoreDB()!;
    // Firestore batch writes are capped at 500 documents per batch
    const chunks: Song[][] = [];
    for (let i = 0; i < songs.length; i += 500) {
      chunks.push(songs.slice(i, i + 500));
    }
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      for (const song of chunk) {
        const docRef = doc(db, 'songs', song.id);
        batch.set(docRef, song);
      }
      await batch.commit();
    }
  }
}

export async function saveSong(song: Song): Promise<void> {
  // Always save locally first for immediate offline availability
  await saveSongIndexedDB(song);

  if (isFirebaseActive()) {
    const db = getFirestoreDB()!;
    const docRef = doc(db, 'songs', song.id);
    await setDoc(docRef, song);
  }
}

export async function deleteSong(id: string): Promise<void> {
  // Always delete locally first
  await deleteSongIndexedDB(id);

  if (isFirebaseActive()) {
    const db = getFirestoreDB()!;
    const docRef = doc(db, 'songs', id);
    await deleteDoc(docRef);
  }
}

export async function clearAllSongs(): Promise<void> {
  await clearAllSongsIndexedDB();

  if (isFirebaseActive()) {
    const db = getFirestoreDB()!;
    const snapshot = await getDocs(collection(db, 'songs'));
    const batch = writeBatch(db);
    snapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  }
}

// Lazy-load lyrics for a single song (reads local for instant 0ms access)
export async function getSongById(id: string): Promise<Song | null> {
  // Try IndexedDB local cache first (keeps application functional offline & 0ms speed)
  const db = await initDB();
  const localSong = await new Promise<Song | null>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });

  if (localSong) return localSong;

  // Fallback to direct Firestore if missing locally
  if (isFirebaseActive()) {
    try {
      const db = getFirestoreDB()!;
      const docSnap = await getDoc(doc(db, 'songs', id));
      if (docSnap.exists()) {
        const cloudSong = docSnap.data() as Song;
        // Cache it locally too
        await saveSongIndexedDB(cloudSong);
        return cloudSong;
      }
    } catch (err) {
      console.error('Failed to fetch song from Firestore:', err);
    }
  }

  return null;
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
// REAL-TIME FIRESTORE SUBSCRIPTIONS (MIRRORS CLOUD TO LOCAL CACHE)
// -------------------------------------------------------------------------

export function subscribeToSongs(onUpdate: () => void): () => void {
  if (!isFirebaseActive()) return () => {};

  const db = getFirestoreDB()!;
  const songsCol = collection(db, 'songs');

  return onSnapshot(songsCol, async (snapshot) => {
    const promises: Promise<void>[] = [];

    for (const change of snapshot.docChanges()) {
      if (change.type === 'added' || change.type === 'modified') {
        promises.push(saveSongIndexedDB(change.doc.data() as Song));
      } else if (change.type === 'removed') {
        promises.push(deleteSongIndexedDB(change.doc.id));
      }
    }

    try {
      await Promise.all(promises);
      onUpdate();
    } catch (err) {
      console.error('Error writing batch Firestore changes to local IndexedDB:', err);
    }
  }, (error) => {
    console.error('Firestore songs snapshot listener error:', error);
  });
}

// -------------------------------------------------------------------------
// WORSHIP EVENTS SYNC SYSTEM
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

  if (isFirebaseActive()) {
    const db = getFirestoreDB()!;
    await setDoc(doc(db, 'worship_events', event.id), event);
  }
}

export async function deleteWorshipEvent(id: string): Promise<void> {
  const localEvents = getLocalWorshipEvents().filter(e => e.id !== id);
  saveLocalWorshipEvents(localEvents);

  if (isFirebaseActive()) {
    const db = getFirestoreDB()!;
    await deleteDoc(doc(db, 'worship_events', id));
  }
}

export function subscribeToWorshipEvents(onUpdate: (events: WorshipEvent[]) => void): () => void {
  if (!isFirebaseActive()) return () => {};

  const db = getFirestoreDB()!;
  const eventsCol = collection(db, 'worship_events');

  return onSnapshot(eventsCol, (snapshot) => {
    const eventsList: WorshipEvent[] = [];
    snapshot.forEach((doc) => {
      eventsList.push(doc.data() as WorshipEvent);
    });

    eventsList.sort((a, b) => a.date.localeCompare(b.date));
    saveLocalWorshipEvents(eventsList);
    onUpdate(eventsList);
  }, (error) => {
    console.error('Firestore worship events snapshot listener error:', error);
  });
}

// -------------------------------------------------------------------------
// CHOIR SUGGESTIONS SYNC SYSTEM
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

  if (isFirebaseActive()) {
    const db = getFirestoreDB()!;
    await setDoc(doc(db, 'suggestions', suggestion.id), suggestion);
  }
}

export async function deleteSuggestion(id: string): Promise<void> {
  const localSuggestions = getLocalSuggestions().filter(s => s.id !== id);
  saveLocalSuggestions(localSuggestions);

  if (isFirebaseActive()) {
    const db = getFirestoreDB()!;
    await deleteDoc(doc(db, 'suggestions', id));
  }
}

export function subscribeToSuggestions(onUpdate: (suggestions: SuggestedSong[]) => void): () => void {
  if (!isFirebaseActive()) return () => {};

  const db = getFirestoreDB()!;
  const suggestionsCol = collection(db, 'suggestions');

  return onSnapshot(suggestionsCol, (snapshot) => {
    const suggestionsList: SuggestedSong[] = [];
    snapshot.forEach((doc) => {
      suggestionsList.push(doc.data() as SuggestedSong);
    });

    suggestionsList.sort((a, b) => b.timestamp - a.timestamp);
    saveLocalSuggestions(suggestionsList);
    onUpdate(suggestionsList);
  }, (error) => {
    console.error('Firestore suggestions snapshot listener error:', error);
  });
}

// -------------------------------------------------------------------------
// INITIAL DATABASE MIGRATION TOOL (LOCAL TO FIREBASE)
// -------------------------------------------------------------------------

export async function migrateLocalDataToCloud(
  onProgress?: (progressText: string) => void
): Promise<void> {
  if (!isFirebaseActive()) throw new Error('Firebase is not active. Connect first!');

  onProgress?.('Reading local IndexedDB song library...');
  const localSongs: Song[] = [];
  const db = await initDB();
  
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        localSongs.push(cursor.value);
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });

  if (localSongs.length > 0) {
    onProgress?.(`Uploading ${localSongs.length} local songs to Firestore...`);
    await saveSongsBatch(localSongs);
  }

  onProgress?.('Migrating worship calendar events...');
  const localEvents = getLocalWorshipEvents();
  for (const event of localEvents) {
    if (event.id !== 'event-starter-1' || event.songIds.length > 0) {
      await saveWorshipEvent(event);
    }
  }

  onProgress?.('Migrating choir song suggestions...');
  const localSuggestions = getLocalSuggestions();
  for (const sug of localSuggestions) {
    await saveSuggestion(sug);
  }

  onProgress?.('Migration completed successfully!');
}
