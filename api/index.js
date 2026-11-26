// Vercel serverless entry.
// With TURSO_DATABASE_URL + TURSO_AUTH_TOKEN set (Vercel → Storage → Turso), orders
// are stored in Turso and persist. Without them it falls back to a temporary
// SQLite file in /tmp (the only writable folder on Vercel), re-seeded on each cold start.
const { openDb, dbConfigFromEnv } = require('../src/db');
const { createApp } = require('../src/app');

module.exports = createApp(openDb(dbConfigFromEnv('file:/tmp/canteenflow.db')));
