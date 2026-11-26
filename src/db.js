// Database access through the libSQL client. The same code talks to:
//   - a local SQLite file   (url "file:data/canteenflow.db", the default for npm start)
//   - Turso, hosted SQLite  (url "libsql://...", set by TURSO_DATABASE_URL on the live site)
// Turso keeps orders across Vercel restarts and shares them between server copies.
const { createClient } = require('@libsql/client');
const { seedStatements } = require('./seed');

// Bump when the schema or seed changes; an older database is rebuilt from the seed.
// (Rebuilding deletes old demo orders, which is fine for this demo.)
const SCHEMA_VERSION = 3;

const DROP = [
  'DROP TABLE IF EXISTS order_items', 'DROP TABLE IF EXISTS orders', 'DROP TABLE IF EXISTS pickup_slots',
  'DROP TABLE IF EXISTS menu_items', 'DROP TABLE IF EXISTS campus_places', 'DROP TABLE IF EXISTS stalls',
];

const SCHEMA = [
  `CREATE TABLE stalls (
    stall_id      INTEGER PRIMARY KEY,
    slug          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    name_th       TEXT,
    area          TEXT NOT NULL,
    cuisine       TEXT NOT NULL,
    hours_json    TEXT NOT NULL,            -- {"1":["08:00","16:00"], ...} weekday 0 = Sunday
    hours_label   TEXT NOT NULL,            -- verified | unverified | demo data
    prep_minutes  INTEGER NOT NULL CHECK (prep_minutes > 0),
    is_open_today INTEGER NOT NULL DEFAULT 1, -- vendor switch: 0 = closed all day
    closed_note   TEXT,
    description   TEXT,
    data_label    TEXT NOT NULL             -- how much of this stall is real
  )`,
  `CREATE TABLE menu_items (
    menu_item_id  INTEGER PRIMARY KEY,
    stall_id      INTEGER NOT NULL REFERENCES stalls(stall_id),
    name          TEXT NOT NULL,
    name_th       TEXT,
    category      TEXT NOT NULL,
    price         INTEGER NOT NULL CHECK (price > 0),   -- whole Thai baht
    image         TEXT NOT NULL,
    is_available  INTEGER NOT NULL DEFAULT 1,           -- 0 = Sold Out
    UNIQUE (stall_id, name)
  )`,
  `CREATE TABLE pickup_slots (
    pickup_slot_id INTEGER PRIMARY KEY,
    stall_id       INTEGER NOT NULL REFERENCES stalls(stall_id),
    start_time     TEXT NOT NULL,           -- 'HH:MM', 15-minute window
    end_time       TEXT NOT NULL,
    capacity       INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 500), -- orders per window per day
    is_blocked     INTEGER NOT NULL DEFAULT 0, -- vendor paused this window
    UNIQUE (stall_id, start_time)
  )`,
  `CREATE TABLE orders (
    order_id         INTEGER PRIMARY KEY,
    order_number     TEXT NOT NULL UNIQUE,
    submission_token TEXT NOT NULL UNIQUE,  -- duplicate-submit guard
    stall_id         INTEGER NOT NULL REFERENCES stalls(stall_id),
    pickup_slot_id   INTEGER NOT NULL REFERENCES pickup_slots(pickup_slot_id),
    order_date       TEXT NOT NULL,          -- Bangkok date the order is for (YYYY-MM-DD)
    placed_minutes   REAL NOT NULL,          -- Bangkok minutes after midnight when placed
    prep_minutes     INTEGER NOT NULL,       -- stall prep time when placed
    customer_name    TEXT NOT NULL,
    student_id       TEXT NOT NULL,
    phone            TEXT NOT NULL,
    note             TEXT,
    status           TEXT NOT NULL DEFAULT 'RECEIVED',
    total_amount     INTEGER NOT NULL CHECK (total_amount > 0),
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  'CREATE INDEX idx_orders_slot_day ON orders(pickup_slot_id, order_date)',
  `CREATE TABLE order_items (
    order_item_id INTEGER PRIMARY KEY,
    order_id      INTEGER NOT NULL REFERENCES orders(order_id),
    menu_item_id  INTEGER NOT NULL REFERENCES menu_items(menu_item_id),
    name          TEXT NOT NULL,
    quantity      INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 20),
    unit_price    INTEGER NOT NULL CHECK (unit_price > 0),
    UNIQUE (order_id, menu_item_id)
  )`,
  `CREATE TABLE campus_places (
    place_id  INTEGER PRIMARY KEY,
    area      TEXT NOT NULL,
    building  TEXT,
    name      TEXT NOT NULL,
    stall_id  INTEGER REFERENCES stalls(stall_id),   -- NULL = not orderable here
    note      TEXT,
    label     TEXT NOT NULL
  )`,
];

const isBusy = (err) => /SQLITE_BUSY|database is locked/i.test(`${err && err.code} ${err && err.message}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Small query helpers on top of a libSQL client or transaction. */
function helpers(target) {
  const q = (sql, args = []) => target.execute({ sql, args });
  return {
    all: async (sql, args) => (await q(sql, args)).rows,
    get: async (sql, args) => (await q(sql, args)).rows[0] || null,
    run: async (sql, args) => {
      const r = await q(sql, args);
      return { changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid == null ? null : Number(r.lastInsertRowid) };
    },
  };
}

/**
 * Open the database. Options: url (default local file), authToken (Turso), reset.
 * Returns { all, get, run, write, close, url } where all/get/run are async.
 */
async function openDb({ url = 'file:data/canteenflow.db', authToken, reset = false } = {}) {
  const client = createClient({ url, authToken });
  const db = { ...helpers(client), url, close: () => client.close() };

  // Write transactions run one at a time inside this server (a local SQLite
  // file allows only one writer). Across Vercel copies, Turso decides; if it
  // reports "busy" we wait a moment and try again.
  let queue = Promise.resolve();
  db.write = (fn) => {
    const job = queue.then(async () => {
      for (let attempt = 1; ; attempt++) {
        let tx;
        try {
          tx = await client.transaction('write');
          const result = await fn(helpers(tx));
          await tx.commit();
          return result;
        } catch (err) {
          if (tx) { try { await tx.rollback(); } catch (e) { /* already closed */ } }
          if (isBusy(err) && attempt < 5) { await sleep(60 * attempt); continue; }
          throw err;
        } finally {
          if (tx) tx.close();
        }
      }
    });
    queue = job.catch(() => {});
    return job;
  };

  await migrate(client, reset);
  return db;
}

/** Create the tables and seed data when the database is new or out of date. */
async function migrate(client, reset) {
  await client.execute('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const row = (await client.execute("SELECT value FROM meta WHERE key = 'schema_version'")).rows[0];
  if (!reset && row && Number(row.value) === SCHEMA_VERSION) return;
  // One atomic batch: drop, create, seed, record the version.
  await client.batch([
    ...DROP,
    ...SCHEMA,
    ...seedStatements(),
    { sql: "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)", args: [String(SCHEMA_VERSION)] },
  ], 'write');
}

/** Database settings from the environment (Turso on the live site, else a local file). */
function dbConfigFromEnv(defaultUrl) {
  const env = process.env;
  const url = env.TURSO_DATABASE_URL || env.LIBSQL_URL || env.DATABASE_URL_TURSO || defaultUrl;
  const authToken = env.TURSO_AUTH_TOKEN || env.LIBSQL_AUTH_TOKEN || undefined;
  return { url, authToken };
}

module.exports = { openDb, dbConfigFromEnv, SCHEMA_VERSION };
