// Vercel serverless entry. Vercel's file system is read-only except /tmp, so
// the SQLite file lives in /tmp and is re-seeded whenever a new instance starts.
// That means demo orders on the live site are temporary (see README).
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');

const db = openDb('/tmp/canteenflow.db');
module.exports = createApp(db);
