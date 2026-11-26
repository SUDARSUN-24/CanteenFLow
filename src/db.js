// SQLite access. Uses Node's built-in `node:sqlite` (Node 22.13+), so there is
// no native module to compile on Windows, macOS or Vercel.
const { DatabaseSync } = require('node:sqlite');
const { seed } = require('./seed');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS stalls (
  stall_id      INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  name_th       TEXT,
  area          TEXT NOT NULL,
  cuisine       TEXT NOT NULL,
  hours_json    TEXT NOT NULL,           -- {"1":["08:00","16:00"], ...} weekday 0 = Sunday
  hours_label   TEXT NOT NULL,           -- verified | unverified | demo data
  prep_minutes  INTEGER NOT NULL CHECK (prep_minutes > 0),
  is_open_today INTEGER NOT NULL DEFAULT 1, -- vendor switch: 0 = closed all day
  closed_note   TEXT,
  description   TEXT,
  data_label    TEXT NOT NULL            -- how much of this stall is real
);

CREATE TABLE IF NOT EXISTS menu_items (
  menu_item_id  INTEGER PRIMARY KEY,
  stall_id      INTEGER NOT NULL REFERENCES stalls(stall_id),
  name          TEXT NOT NULL,
  name_th       TEXT,
  category      TEXT NOT NULL,
  price         INTEGER NOT NULL CHECK (price > 0),   -- whole Thai baht
  image         TEXT NOT NULL,
  is_available  INTEGER NOT NULL DEFAULT 1,           -- 0 = Sold Out
  UNIQUE (stall_id, name)
);

CREATE TABLE IF NOT EXISTS pickup_slots (
  pickup_slot_id INTEGER PRIMARY KEY,
  stall_id       INTEGER NOT NULL REFERENCES stalls(stall_id),
  start_time     TEXT NOT NULL,          -- 'HH:MM', 15-minute window
  end_time       TEXT NOT NULL,
  capacity       INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 500), -- orders per window per day
  is_blocked     INTEGER NOT NULL DEFAULT 0, -- vendor paused this window
  UNIQUE (stall_id, start_time)
);

CREATE TABLE IF NOT EXISTS orders (
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
);
-- Counting orders per pickup window per day (slot capacity).
CREATE INDEX IF NOT EXISTS idx_orders_slot_day ON orders(pickup_slot_id, order_date);

CREATE TABLE IF NOT EXISTS order_items (
  order_item_id INTEGER PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(order_id),
  menu_item_id  INTEGER NOT NULL REFERENCES menu_items(menu_item_id),
  name          TEXT NOT NULL,
  quantity      INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  unit_price    INTEGER NOT NULL CHECK (unit_price > 0),
  UNIQUE (order_id, menu_item_id)
);

CREATE TABLE IF NOT EXISTS campus_places (
  place_id  INTEGER PRIMARY KEY,
  area      TEXT NOT NULL,
  building  TEXT,
  name      TEXT NOT NULL,
  stall_id  INTEGER REFERENCES stalls(stall_id),   -- NULL = not orderable here
  note      TEXT,
  label     TEXT NOT NULL
);
`;

// Bump when the schema changes; an older database file is rebuilt from the seed.
const SCHEMA_VERSION = 2;

/** Open (or create) the database at `file`. ':memory:' is used by the tests. */
function openDb(file = ':memory:', { reset = false } = {}) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  const { user_version: version } = db.prepare('PRAGMA user_version').get();
  if (reset || version !== SCHEMA_VERSION) {
    db.exec(`DROP TABLE IF EXISTS order_items; DROP TABLE IF EXISTS orders;
             DROP TABLE IF EXISTS pickup_slots; DROP TABLE IF EXISTS menu_items;
             DROP TABLE IF EXISTS campus_places; DROP TABLE IF EXISTS stalls;`);
  }
  db.exec(SCHEMA);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM stalls').get();
  if (n === 0) seed(db);
  return db;
}

/** Run `fn` inside a transaction; roll back if it throws. */
function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { openDb, transaction };
