import express from 'express';
import compression from 'compression';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const app = express();
app.use(compression());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

function sanitizeString(val, maxLen = 5000) {
  if (typeof val !== 'string') return '';
  return val.trim().replace(/\0/g, '').slice(0, maxLen);
}

function validateSongBody(body) {
  if (!body || typeof body !== 'object') return 'Request body must be an object or array';
  if (Array.isArray(body)) {
    for (let i = 0; i < body.length; i++) {
      const s = body[i];
      if (!s || typeof s !== 'object') return `Item ${i} is not an object`;
      if (!s.id || typeof s.id !== 'string') return `Item ${i} missing string id`;
      if (!s.title || typeof s.title !== 'string') return `Item ${i} missing string title`;
      s.id = sanitizeString(s.id, 200);
      s.title = sanitizeString(s.title, 500);
      if (s.author) s.author = sanitizeString(s.author, 500);
      if (s.category) s.category = sanitizeString(s.category, 200);
      if (s.key) s.key = sanitizeString(s.key, 50);
      if (s.capo) s.capo = sanitizeString(s.capo, 50);
      if (s.bpm) s.bpm = sanitizeString(s.bpm, 50);
      if (s.lyrics) s.lyrics = sanitizeString(s.lyrics, 100000);
      if (s.notes) s.notes = sanitizeString(s.notes, 5000);
    }
  } else {
    if (!body.id || typeof body.id !== 'string') return 'Song must have a string id';
    if (!body.title || typeof body.title !== 'string') return 'Song must have a string title';
    body.id = sanitizeString(body.id, 200);
    body.title = sanitizeString(body.title, 500);
    if (body.author) body.author = sanitizeString(body.author, 500);
    if (body.category) body.category = sanitizeString(body.category, 200);
    if (body.key) body.key = sanitizeString(body.key, 50);
    if (body.capo) body.capo = sanitizeString(body.capo, 50);
    if (body.bpm) body.bpm = sanitizeString(body.bpm, 50);
    if (body.lyrics) body.lyrics = sanitizeString(body.lyrics, 100000);
    if (body.notes) body.notes = sanitizeString(body.notes, 5000);
  }
  return null;
}

// Disable browser caching for all API endpoints to prevent stale data on mobile devices
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

function getSongQuery(req, customQuery = {}) {
  return customQuery;
}

const MONGODB_URI = process.env.MONGODB_URI;

let cachedClient = null;
let cachedDb = null;

// Ensure database indexes for high performance
async function ensureIndexes(db) {
  try {
    // songs indexes
    await db.collection('songs').createIndex(
      { updatedAt: -1 },
      { name: 'songs_delta_sync_idx' }
    );
    await db.collection('songs').createIndex(
      { id: 1 },
      { unique: true, name: 'songs_id_unique_idx' }
    );
    await db.collection('songs').createIndex(
      { title: 'text', author: 'text' },
      { weights: { title: 10, author: 5 }, name: 'songs_text_search_idx' }
    );

    // setlists indexes
    await db.collection('setlists').createIndex({ id: 1 }, { unique: true });
    await db.collection('setlists').createIndex({ date: -1, updatedAt: -1 });

    // broadcasts indexes
    await db.collection('broadcasts').createIndex({ id: 1 }, { unique: true });

    console.log('MongoDB indexes created/verified successfully.');
  } catch (err) {
    console.error('Failed to create MongoDB indexes:', err);
  }
}

async function connectToDatabase() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is not configured. Please add it in your Vercel Project Settings.');
  }

  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = new MongoClient(MONGODB_URI, {
    maxPoolSize: 10,
    minPoolSize: 1,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 15000,
    serverSelectionTimeoutMS: 5000,
    maxIdleTimeMS: 30000,
  });
  
  await client.connect();
  const db = client.db();

  cachedClient = client;
  cachedDb = db;

  ensureIndexes(db);

  return { client, db };
}

// Global middleware to handle errors
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// --- AUTH & SECURITY MIDDLEWARE ---

function getAdminToken(adminPassword) {
  return crypto.createHmac('sha256', adminPassword).update('dasong-admin-secret-seed').digest('hex');
}

function requireAdmin(req, res, next) {
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const expectedToken = getAdminToken(adminPassword);
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Admin authentication required' });
  }

  if (token !== expectedToken && token !== adminPassword) {
    return res.status(403).json({ error: 'Forbidden: Invalid administrator credentials' });
  }

  next();
}

// POST /api/auth — verify admin password server-side and issue token
app.post('/api/auth', asyncHandler(async (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  if (!password) return res.status(400).json({ success: false, error: 'Password required' });
  if (password === adminPassword) {
    const token = getAdminToken(adminPassword);
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, error: 'Incorrect password' });
  }
}));

// --- SONG ENDPOINTS ---

// GET /api/songs
app.get('/api/songs', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const query = getSongQuery(req);
  const songs = await db.collection('songs').find(query).toArray();
  res.json(songs);
}));

// GET /api/songs/sync-check
app.get('/api/songs/sync-check', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const query = getSongQuery(req);
  const isGlobalQuery = Object.keys(query).length === 0;

  const count = isGlobalQuery
    ? await db.collection('songs').estimatedDocumentCount()
    : await db.collection('songs').countDocuments(query);

  const latestSong = await db.collection('songs')
    .find(query, { projection: { updatedAt: 1, createdAt: 1 } })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(1)
    .toArray();
  const lastUpdated = latestSong.length > 0
    ? (latestSong[0].updatedAt || latestSong[0].createdAt || 0)
    : 0;
  res.json({ count, lastUpdated });
}));

// GET /api/songs/metadata
app.get('/api/songs/metadata', asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
  const { db } = await connectToDatabase();
  const since = parseInt(req.query.since, 10) || 0;
  const sinceQuery = since > 0 ? { $or: [{ updatedAt: { $gt: since } }, { createdAt: { $gt: since } }] } : {};
  const query = getSongQuery(req, sinceQuery);
  const metadata = await db.collection('songs').find(query, {
    projection: {
      id: 1,
      title: 1,
      author: 1,
      key: 1,
      bpm: 1,
      category: 1,
      favorite: 1,
      createdAt: 1,
      updatedAt: 1
    }
  }).toArray();
  res.json(metadata);
}));

// POST /api/songs/bulk-sync - High-throughput bulkWrite upsert endpoint
app.post('/api/songs/bulk-sync', requireAdmin, asyncHandler(async (req, res) => {
  const songs = req.body;
  const error = validateSongBody(songs);
  if (error) return res.status(400).json({ error });

  const songArray = Array.isArray(songs) ? songs : [songs];
  if (songArray.length === 0) {
    return res.json({ success: true, count: 0 });
  }

  const { db } = await connectToDatabase();
  const operations = songArray.map(song => ({
    updateOne: {
      filter: { id: song.id },
      update: { $set: song },
      upsert: true
    }
  }));

  const result = await db.collection('songs').bulkWrite(operations);
  res.json({
    success: true,
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
    upsertedCount: result.upsertedCount
  });
}));

// POST /api/songs/fetch-batch
app.post('/api/songs/fetch-batch', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const ids = req.body.ids;
  if (!Array.isArray(ids)) {
    return res.status(400).json({ error: 'ids must be an array of IDs' });
  }
  const query = getSongQuery(req, { id: { $in: ids } });
  const songs = await db.collection('songs').find(query).toArray();
  res.json(songs);
}));

// POST /api/songs
app.post('/api/songs', requireAdmin, asyncHandler(async (req, res) => {
  const error = validateSongBody(req.body);
  if (error) return res.status(400).json({ error });

  const { db } = await connectToDatabase();
  const body = req.body;
  
  if (Array.isArray(body)) {
    const bulkOps = body.map(song => {
      const { _id, ...songData } = song;
      return {
        updateOne: {
          filter: getSongQuery(req, { id: songData.id }),
          update: { $set: songData },
          upsert: true
        }
      };
    });
    if (bulkOps.length > 0) {
      await db.collection('songs').bulkWrite(bulkOps);
    }
    res.json({ success: true, count: body.length });
  } else {
    const song = body;
    if (!song.id || !song.title) {
      return res.status(400).json({ error: 'Song must contain id and title' });
    }

    const { _id: _songId, ...songData } = song;
    await db.collection('songs').updateOne(
      getSongQuery(req, { id: songData.id }),
      { $set: songData },
      { upsert: true }
    );
    res.json({ success: true, song });
  }
}));

// DELETE /api/songs
app.delete('/api/songs', requireAdmin, asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const query = getSongQuery(req);
  const count = await db.collection('songs').countDocuments(query);
  if (count === 0) {
    return res.status(404).json({ error: 'No songs found to delete' });
  }
  await db.collection('songs').deleteMany(query);
  res.json({ success: true, deletedCount: count });
}));

// DELETE /api/songs/:id
app.delete('/api/songs/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const { id } = req.params;
  const query = getSongQuery(req, { id });
  
  await db.collection('songs').deleteOne(query);
  res.json({ success: true });
}));

// --- SETLISTS ENDPOINTS ---

// GET /api/setlists
app.get('/api/setlists', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const setlists = await db.collection('setlists').find({}).sort({ date: -1, updatedAt: -1 }).toArray();
  res.json(setlists);
}));

// POST /api/setlists
app.post('/api/setlists', asyncHandler(async (req, res) => {
  const setlist = req.body;
  if (!setlist || !setlist.id || !setlist.name) {
    return res.status(400).json({ error: 'Setlist requires id and name' });
  }

  const { db } = await connectToDatabase();
  const { _id, ...setlistData } = setlist;
  setlistData.name = sanitizeString(setlistData.name, 500);
  setlistData.date = sanitizeString(setlistData.date, 50);
  if (setlistData.time) setlistData.time = sanitizeString(setlistData.time, 50);
  if (setlistData.notes) setlistData.notes = sanitizeString(setlistData.notes, 5000);
  setlistData.updatedAt = Date.now();

  await db.collection('setlists').updateOne(
    { id: setlistData.id },
    { $set: setlistData },
    { upsert: true }
  );
  res.json({ success: true, setlist: setlistData });
}));

// POST /api/setlists/bulk-sync
app.post('/api/setlists/bulk-sync', asyncHandler(async (req, res) => {
  const list = req.body;
  const setlistArray = Array.isArray(list) ? list : [list];
  if (setlistArray.length === 0) {
    return res.json({ success: true, count: 0 });
  }

  const { db } = await connectToDatabase();
  const operations = setlistArray.map(item => {
    const { _id, ...itemData } = item;
    itemData.name = sanitizeString(itemData.name, 500);
    itemData.date = sanitizeString(itemData.date, 50);
    if (itemData.time) itemData.time = sanitizeString(itemData.time, 50);
    if (itemData.notes) itemData.notes = sanitizeString(itemData.notes, 5000);
    return {
      updateOne: {
        filter: { id: itemData.id },
        update: { $set: itemData },
        upsert: true
      }
    };
  });

  const result = await db.collection('setlists').bulkWrite(operations);
  res.json({
    success: true,
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
    upsertedCount: result.upsertedCount
  });
}));

// DELETE /api/setlists/:id
app.delete('/api/setlists/:id', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const { id } = req.params;
  await db.collection('setlists').deleteOne({ id });
  res.json({ success: true });
}));

// POST /api/lyrics/scrape-url
app.post('/api/lyrics/scrape-url', asyncHandler(async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'url parameter is required' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // Security: Only allow HTTP/HTTPS and block internal/private IPs (SSRF mitigation)
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only http and https protocols are supported' });
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const isPrivateHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
    /^169\.254\./.test(hostname);

  if (isPrivateHost) {
    return res.status(403).json({ error: 'Access to private or local network hosts is restricted' });
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  if (!response.ok) {
    return res.status(response.status).json({ error: `Failed to fetch URL: ${response.statusText}` });
  }

  const html = await response.text();

  const preMatches = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi)];
  let extractedText = '';

  if (preMatches.length > 0) {
    extractedText = preMatches.map(m => m[1]).join('\n\n');
  } else {
    const containerRegexes = [
      /<div[^>]+(?:class|id)=["'][^"']*(?:lyrics|lyric|chords|chord|tab-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi
    ];
    
    let containerMatch = null;
    for (const regex of containerRegexes) {
      const matches = [...html.matchAll(regex)];
      if (matches.length > 0) {
        containerMatch = matches.map(m => m[1]).join('\n\n');
        break;
      }
    }

    if (containerMatch) {
      extractedText = containerMatch;
    } else {
      let bodyContent = html;
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        bodyContent = bodyMatch[1];
      }

      bodyContent = bodyContent
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi);

      extractedText = bodyContent;
    }
  }

  let cleanText = extractedText
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<[^>]*>/g, '');

  const htmlEntities = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&rsquo;': "'",
    '&lsquo;': "'",
    '&ldquo;': '"',
    '&rdquo;': '"',
    '&ndash;': '-',
    '&mdash;': '--',
    '&copy;': '©'
  };

  for (const [entity, value] of Object.entries(htmlEntities)) {
    cleanText = cleanText.replace(new RegExp(entity, 'g'), value);
  }

  cleanText = cleanText
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim();

  let title = '';
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    title = titleMatch[1]
      .replace(/Chords.*|Tab.*|Lyrics.*/gi, '')
      .replace(/ - Ultimate Guitar.*/gi, '')
      .trim();
  }

  res.json({
    success: true,
    title: title || 'Scraped Song',
    lyrics: cleanText
  });
}));

// --- LIVE SERVICE LYRICS SYNC (LEADER BROADCAST & FOLLOWER MODE) ---

let inMemoryBroadcast = null;

// POST /api/broadcast - update active broadcast state
app.post('/api/broadcast', requireAdmin, asyncHandler(async (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body must be an object' });
  }

  const songId = typeof req.body.songId === 'string' ? sanitizeString(req.body.songId, 200) : null;
  const activeLineIndex = typeof req.body.activeLineIndex === 'number' ? req.body.activeLineIndex : -1;

  const broadcastState = {
    id: 'global',
    songId: songId || null,
    activeLineIndex: typeof activeLineIndex === 'number' ? activeLineIndex : -1,
    updatedAt: Date.now()
  };

  inMemoryBroadcast = {
    state: broadcastState,
    cachedAt: Date.now()
  };

  try {
    const { db } = await connectToDatabase();
    await db.collection('broadcasts').updateOne(
      { id: 'global' },
      { $set: broadcastState },
      { upsert: true }
    );
  } catch (err) {
    console.warn('MongoDB broadcast persist notice:', err.message);
  }

  res.json({ success: true, broadcast: broadcastState });
}));

// GET /api/broadcast - get current active broadcast
app.get('/api/broadcast', asyncHandler(async (req, res) => {
  const idleThreshold = 15 * 60 * 1000;
  const shortCacheMs = 1000;

  // Short 1s memory cache to reduce DB load under high poll volume, while keeping serverless instances fresh
  if (inMemoryBroadcast && (Date.now() - inMemoryBroadcast.cachedAt < shortCacheMs)) {
    if (Date.now() - inMemoryBroadcast.state.updatedAt > idleThreshold) {
      return res.status(204).end();
    }
    return res.json(inMemoryBroadcast.state);
  }

  try {
    const { db } = await connectToDatabase();
    const broadcast = await db.collection('broadcasts').findOne({ id: 'global' }, { projection: { _id: 0 } });
    if (!broadcast || (Date.now() - broadcast.updatedAt > idleThreshold)) {
      return res.status(204).end();
    }
    inMemoryBroadcast = {
      state: broadcast,
      cachedAt: Date.now()
    };
    return res.json(broadcast);
  } catch (err) {
    if (inMemoryBroadcast?.state && (Date.now() - inMemoryBroadcast.state.updatedAt <= idleThreshold)) {
      return res.json(inMemoryBroadcast.state);
    }
    return res.status(204).end();
  }
}));

// Error handler middleware
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

export default app;
