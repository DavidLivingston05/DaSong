import express from 'express';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Disable browser caching for all API endpoints to prevent stale data on mobile devices
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Middleware to extract server ID from headers
app.use('/api', (req, res, next) => {
  req.serverId = req.headers['x-server-id'] || 'default';
  next();
});

// Helper to partition queries. Matches exact serverId, or if serverId is 'default', matches default or missing serverId.
function getQueryWithServer(req, customQuery = {}) {
  const serverFilter = req.serverId === 'default'
    ? {
        $or: [
          { serverId: 'default' },
          { serverId: { $exists: false } }
        ]
      }
    : { serverId: req.serverId };

  if (Object.keys(customQuery).length > 0) {
    return {
      $and: [
        serverFilter,
        customQuery
      ]
    };
  }
  return serverFilter;
}

const MONGODB_URI = process.env.MONGODB_URI;

let cachedClient = null;
let cachedDb = null;

// Ensure database indexes for high performance on partitioned multi-tenant collections
async function ensureIndexes(db) {
  try {
    // songs indexes
    await db.collection('songs').createIndex({ serverId: 1 });
    await db.collection('songs').createIndex({ serverId: 1, id: 1 });
    await db.collection('songs').createIndex({ serverId: 1, updatedAt: -1, createdAt: -1 });

    // worship_events indexes
    await db.collection('worship_events').createIndex({ serverId: 1 });
    await db.collection('worship_events').createIndex({ serverId: 1, id: 1 });

    // suggestions indexes
    await db.collection('suggestions').createIndex({ serverId: 1 });
    await db.collection('suggestions').createIndex({ serverId: 1, id: 1 });

    // servers indexes
    await db.collection('servers').createIndex({ id: 1 }, { unique: true });
    await db.collection('servers').createIndex({ showOnPublicList: 1 });

    // broadcasts indexes
    await db.collection('broadcasts').createIndex({ serverId: 1 }, { unique: true });

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

  // Optimize MongoDB client options for serverless environments (limit pool size, enable quick timeout/reuse)
  const client = new MongoClient(MONGODB_URI, {
    maxPoolSize: 10,
    minPoolSize: 0,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 15000,
    serverSelectionTimeoutMS: 5000,
    maxIdleTimeMS: 15000,
  });
  
  await client.connect();
  const db = client.db(); // Default database name from the connection string path

  cachedClient = client;
  cachedDb = db;

  // Verify and create indexes in the background
  ensureIndexes(db);

  return { client, db };
}


// Global middleware to handle errors
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// --- AUTH ---

// POST /api/auth — verify admin password server-side (keeps password out of client bundle)
app.post('/api/auth', asyncHandler(async (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  if (!password) return res.status(400).json({ success: false, error: 'Password required' });
  if (password === adminPassword) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Incorrect password' });
  }
}));

// --- API ENDPOINTS ---

// GET /api/songs
app.get('/api/songs', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const songs = await db.collection('songs').find({}).toArray();
  res.json(songs);
}));

// GET /api/songs/sync-check
app.get('/api/songs/sync-check', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const count = await db.collection('songs').countDocuments({});
  const latestSong = await db.collection('songs')
    .find({}, { projection: { updatedAt: 1, createdAt: 1 } })
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
  const { db } = await connectToDatabase();
  const since = parseInt(req.query.since, 10) || 0;
  const query = since > 0 ? { $or: [{ updatedAt: { $gt: since } }, { createdAt: { $gt: since } }] } : {};
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

// POST /api/songs/fetch-batch
app.post('/api/songs/fetch-batch', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const ids = req.body.ids;
  if (!Array.isArray(ids)) {
    return res.status(400).json({ error: 'ids must be an array of IDs' });
  }
  const songs = await db.collection('songs').find({ id: { $in: ids } }).toArray();
  res.json(songs);
}));

// POST /api/songs
app.post('/api/songs', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const body = req.body;
  
  if (Array.isArray(body)) {
    // Bulk upsert songs
    const bulkOps = body.map(song => {
      const { _id, ...songData } = song; // Strip immutable _id before $set
      return {
        updateOne: {
          filter: { id: songData.id },
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

    // Use upsert to insert or update the song (strip _id to avoid immutable field error)
    const { _id: _songId, ...songData } = song;
    await db.collection('songs').updateOne(
      { id: songData.id },
      { $set: songData },
      { upsert: true }
    );
    res.json({ success: true, song });
  }
}));

// DELETE /api/songs
app.delete('/api/songs', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  await db.collection('songs').deleteMany({});
  res.json({ success: true });
}));

// DELETE /api/songs/:id
app.delete('/api/songs/:id', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const { id } = req.params;
  
  await db.collection('songs').deleteOne({ id });
  res.json({ success: true });
}));

// GET /api/events
app.get('/api/events', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const events = await db.collection('worship_events').find(getQueryWithServer(req)).toArray();
  res.json(events);
}));

// POST /api/events
app.post('/api/events', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const event = req.body;
  
  if (!event.id || !event.title) {
    return res.status(400).json({ error: 'Event must contain id and title' });
  }

  // Strip MongoDB's immutable _id field to prevent update errors on existing documents
  const { _id, ...eventData } = event;
  eventData.serverId = req.serverId;
  await db.collection('worship_events').updateOne(
    { id: eventData.id, serverId: req.serverId },
    { $set: eventData },
    { upsert: true }
  );
  res.json({ success: true, event: eventData });
}));

// DELETE /api/events/:id
app.delete('/api/events/:id', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const { id } = req.params;
  
  await db.collection('worship_events').deleteOne({ id, serverId: req.serverId });
  res.json({ success: true });
}));

// GET /api/suggestions
app.get('/api/suggestions', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const suggestions = await db.collection('suggestions').find(getQueryWithServer(req)).toArray();
  res.json(suggestions);
}));

// POST /api/suggestions
app.post('/api/suggestions', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const suggestion = req.body;
  
  if (!suggestion.id || !suggestion.songId) {
    return res.status(400).json({ error: 'Suggestion must contain id and songId' });
  }

  const { _id, ...sugData } = suggestion;
  sugData.serverId = req.serverId;
  await db.collection('suggestions').updateOne(
    { id: sugData.id, serverId: req.serverId },
    { $set: sugData },
    { upsert: true }
  );
  res.json({ success: true, suggestion: sugData });
}));

// DELETE /api/suggestions/:id
app.delete('/api/suggestions/:id', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const { id } = req.params;
  
  await db.collection('suggestions').deleteOne({ id, serverId: req.serverId });
  res.json({ success: true });
}));

// --- SERVER (TENANT) MANAGEMENT ENDPOINTS ---

// GET /api/servers — list public servers
app.get('/api/servers', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const servers = await db.collection('servers')
    .find({ showOnPublicList: true })
    .project({ id: 1, name: 1, showOnPublicList: 1, createdAt: 1 })
    .toArray();
  res.json(servers);
}));

// POST /api/servers — register a new server
app.post('/api/servers', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const { id, name, adminPassword, showOnPublicList } = req.body;
  if (!id || !name || !adminPassword) {
    return res.status(400).json({ error: 'Server ID, name, and adminPassword are required' });
  }

  // Validate ID format (alphanumeric, dashes, lowercase)
  const idRegex = /^[a-z0-9-]+$/;
  if (!idRegex.test(id)) {
    return res.status(400).json({ error: 'Server ID must be lowercase alphanumeric characters and dashes only.' });
  }

  // Check uniqueness
  const existing = await db.collection('servers').findOne({ id });
  if (existing) {
    return res.status(400).json({ error: 'Server ID already exists. Please pick a different unique ID.' });
  }

  const newServer = {
    id,
    name,
    adminPassword, // Note: In a production app, we would hash this, but we store it as is for design simplicity
    showOnPublicList: !!showOnPublicList,
    createdAt: Date.now()
  };

  await db.collection('servers').insertOne(newServer);
  res.json({ success: true, server: { id, name, showOnPublicList: newServer.showOnPublicList } });
}));

// POST /api/servers/:id/auth — authenticate server admin access
app.post('/api/servers/:id/auth', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const { id } = req.params;
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  const server = await db.collection('servers').findOne({ id });
  if (!server) {
    return res.status(404).json({ error: 'Server workspace not found' });
  }

  if (server.adminPassword === password) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Incorrect administrative password' });
  }
}));

// POST /api/lyrics/scrape-url
app.post('/api/lyrics/scrape-url', asyncHandler(async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'url parameter is required' });
  }

  try {
    new URL(url);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format' });
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

  // Try to find pre-formatted text (which usually holds chords)
  const preMatches = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi)];
  let extractedText = '';

  if (preMatches.length > 0) {
    extractedText = preMatches.map(m => m[1]).join('\n\n');
  } else {
    // Try common container patterns
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
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');

      extractedText = bodyContent;
    }
  }

  // Convert HTML line breaks to newline characters
  let cleanText = extractedText
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<[^>]*>/g, '');

  // Decode common HTML entities
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

// POST /api/broadcast - update active broadcast state
app.post('/api/broadcast', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const { songId, activeLineIndex } = req.body;
  const serverId = req.serverId || 'default';

  const broadcastState = {
    serverId,
    songId: songId || null,
    activeLineIndex: typeof activeLineIndex === 'number' ? activeLineIndex : -1,
    updatedAt: Date.now()
  };

  await db.collection('broadcasts').updateOne(
    { serverId },
    { $set: broadcastState },
    { upsert: true }
  );

  res.json({ success: true, broadcast: broadcastState });
}));

// GET /api/broadcast - get current active broadcast
app.get('/api/broadcast', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const serverId = req.serverId || 'default';

  const broadcast = await db.collection('broadcasts').findOne({ serverId });
  if (!broadcast) {
    return res.status(204).end(); // No content
  }

  // Expire broadcast if older than 15 minutes of inactivity
  const idleThreshold = 15 * 60 * 1000;
  if (Date.now() - broadcast.updatedAt > idleThreshold) {
    return res.status(204).end();
  }

  res.json(broadcast);
}));

// Error handler middleware
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

export default app;
