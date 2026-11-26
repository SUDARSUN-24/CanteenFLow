// Local server: `npm start`, then open http://localhost:3000
// Uses data/canteenflow.db unless TURSO_DATABASE_URL is set (then the hosted Turso database).
// `npm run reset-db` rebuilds the database from the seed data.
const path = require('node:path');
const { openDb, dbConfigFromEnv } = require('./src/db');
const { createApp } = require('./src/app');

const localFile = process.env.DB_FILE || path.join(__dirname, 'data', 'canteenflow.db');
const config = dbConfigFromEnv(`file:${localFile.replace(/\\/g, '/')}`);
const resetOnly = process.argv.includes('--reset-only');

openDb({ ...config, reset: resetOnly || process.argv.includes('--reset') }).then((db) => {
  if (resetOnly) {
    console.log(`Database reset: ${config.url.startsWith('file:') ? config.url : 'Turso'}`);
    db.close();
    return;
  }
  const port = Number(process.env.PORT) || 3000;
  createApp(db).listen(port, () => {
    console.log(`CanteenFlow running at http://localhost:${port} (${config.url.startsWith('file:') ? 'local SQLite file' : 'Turso'})`);
  });
}).catch((err) => {
  console.error('Could not open the database:', err.message);
  process.exit(1);
});
