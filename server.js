// Local server: `npm start`, then open http://localhost:3000
// `npm run reset-db` rebuilds data/canteenflow.db from the seed data.
const path = require('node:path');
const { openDb } = require('./src/db');
const { createApp } = require('./src/app');

const file = process.env.DB_FILE || path.join(__dirname, 'data', 'canteenflow.db');
const resetOnly = process.argv.includes('--reset-only');
const db = openDb(file, { reset: resetOnly || process.argv.includes('--reset') });

if (resetOnly) {
  console.log(`Database reset: ${file}`);
  process.exit(0);
}

const port = Number(process.env.PORT) || 3000;
createApp(db).listen(port, () => {
  console.log(`CanteenFlow running at http://localhost:${port}`);
});
