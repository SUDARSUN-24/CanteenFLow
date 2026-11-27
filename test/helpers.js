// Shared test setup: a fresh seeded database per test, the real API on a random
// port, and a fixed clock (Tuesday 24 November 2026, 10:00 Bangkok time) so
// results never depend on when the tests run.
const test = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');

const TUESDAY_10AM = Date.UTC(2026, 10, 24, 3, 0); // 10:00 in Bangkok (UTC+7)
const MIN = 60 * 1000;

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'canteenflow-test-'));
test.after(() => { try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch (e) { /* locked on Windows: OS cleans temp */ } });

/** Start the app on a random port with a fresh seeded DB and a movable clock. */
async function start() {
  // The app talks to the file through libSQL (as on the live site);
  // the test reads it directly with node:sqlite.
  const file = path.join(TMP_DIR, `${crypto.randomUUID()}.db`);
  const appDb = await openDb({ url: `file:${file.split(path.sep).join('/')}` });
  const db = new DatabaseSync(file);
  const clock = { ms: TUESDAY_10AM };
  const server = createApp(appDb, { now: () => clock.ms }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, data, headers = {}) => {
    const res = await fetch(base + p, {
      method, headers: { 'Content-Type': 'application/json', ...headers }, body: data ? JSON.stringify(data) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  const ctx = {
    db, clock,
    get: (p, headers) => call('GET', p, null, headers),
    post: (p, data, headers) => call('POST', p, data, headers),
    /** Move the fixed clock to Tuesday at HH:MM. */
    at(hhmm) { const [h, m] = hhmm.split(':').map(Number); clock.ms = TUESDAY_10AM + ((h - 10) * 60 + m) * MIN; },
    orderCount: () => db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,
    id: (table, col, where, ...args) => db.prepare(`SELECT ${col} AS v FROM ${table} WHERE ${where}`).get(...args).v,
    close: () => { server.close(); db.close(); appDb.close(); },
  };
  ctx.stallId = (slug) => ctx.id('stalls', 'stall_id', 'slug = ?', slug);
  ctx.itemId = (name) => ctx.id('menu_items', 'menu_item_id', 'name = ?', name);
  ctx.slotId = (slug, time) => ctx.id('pickup_slots', 'pickup_slot_id', 'stall_id = ? AND start_time = ?', ctx.stallId(slug), time);
  /** A valid Siam Cafe order for 11:30 from a new student (unless studentId is given); each test breaks one rule. */
  ctx.validOrder = (over = {}, studentId = newStudentId()) => ({
    submissionToken: crypto.randomUUID(),
    stallId: ctx.stallId('siam-cafe'),
    items: [
      { menuItemId: ctx.itemId('Stir-fried basil pork on rice'), quantity: 2 },
      { menuItemId: ctx.itemId('Thai iced tea'), quantity: 1 },
    ],
    pickupSlotId: ctx.slotId('siam-cafe', '11:30'),
    customer: { name: 'Somchai', studentId, phone: '081-234-5678' },
    ...over,
  });
  return ctx;
}

/** A demo student ID: 10 digits, different every call. */
let studentSeq = 0;
const newStudentId = () => String(6600000000 + (++studentSeq));

/** Runs before/after every test in the calling file; returns a getter for the current context. */
function useApp() {
  let ctx;
  test.beforeEach(async () => { ctx = await start(); });
  test.afterEach(() => ctx.close());
  return () => ctx;
}

module.exports = { useApp, newStudentId, MIN, TUESDAY_10AM };
