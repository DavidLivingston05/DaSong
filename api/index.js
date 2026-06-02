import express from 'express';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Set MongoDB URI from environment variables or use the user's Atlas fallback
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://churchtechonly:Livingston@church.sn67zp8.mongodb.net/dasong?retryWrites=true&w=majority&appName=Church';

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  // Set up connection options
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(); // Default database name from the connection string path

  cachedClient = client;
  cachedDb = db;
  return { client, db };
}

// Global middleware to handle errors
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// --- API ENDPOINTS ---

// GET /api/songs
app.get('/api/songs', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const songs = await db.collection('songs').find({}).toArray();
  res.json(songs);
}));

// GET /api/songs/metadata
app.get('/api/songs/metadata', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const metadata = await db.collection('songs').find({}, {
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
    const bulkOps = body.map(song => ({
      updateOne: {
        filter: { id: song.id },
        update: { $set: song },
        upsert: true
      }
    }));
    if (bulkOps.length > 0) {
      await db.collection('songs').bulkWrite(bulkOps);
    }
    res.json({ success: true, count: body.length });
  } else {
    const song = body;
    if (!song.id || !song.title) {
      return res.status(400).json({ error: 'Song must contain id and title' });
    }

    // Use upsert to insert or update the song
    await db.collection('songs').updateOne(
      { id: song.id },
      { $set: song },
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
  const events = await db.collection('worship_events').find({}).toArray();
  res.json(events);
}));

// POST /api/events
app.post('/api/events', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const event = req.body;
  
  if (!event.id || !event.title) {
    return res.status(400).json({ error: 'Event must contain id and title' });
  }

  await db.collection('worship_events').updateOne(
    { id: event.id },
    { $set: event },
    { upsert: true }
  );
  res.json({ success: true, event });
}));

// DELETE /api/events/:id
app.delete('/api/events/:id', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const { id } = req.params;
  
  await db.collection('worship_events').deleteOne({ id });
  res.json({ success: true });
}));

// GET /api/suggestions
app.get('/api/suggestions', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const suggestions = await db.collection('suggestions').find({}).toArray();
  res.json(suggestions);
}));

// POST /api/suggestions
app.post('/api/suggestions', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const suggestion = req.body;
  
  if (!suggestion.id || !suggestion.songId) {
    return res.status(400).json({ error: 'Suggestion must contain id and songId' });
  }

  await db.collection('suggestions').updateOne(
    { id: suggestion.id },
    { $set: suggestion },
    { upsert: true }
  );
  res.json({ success: true, suggestion });
}));

// DELETE /api/suggestions/:id
app.delete('/api/suggestions/:id', asyncHandler(async (req, res) => {
  const { db } = await connectToDatabase();
  const { id } = req.params;
  
  await db.collection('suggestions').deleteOne({ id });
  res.json({ success: true });
}));

// Error handler middleware
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

export default app;
