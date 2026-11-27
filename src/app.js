// Express app: JSON API + static frontend. `createApp(db)` is used by
// server.js (local), api/index.js (Vercel) and the tests.
const path = require('node:path');
const express = require('express');
const Schedule = require('../public/js/schedule');
const { getStall, slotsFor, loadAll } = require('./data');
const config = require('./config');
const {
  placeOrder, getOrder, cancelOrder, vendorAction, vendorOrders, setItemAvailability, OrderError, VENDOR_ACTIONS,
} = require('./orders');
const vendor = require('./vendor');

const TIME_RE = /^\d{2}:\d{2}$/;

/** Wrap an async route so errors become JSON responses instead of crashes. */
const route = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof OrderError) return res.status(err.status).json({ error: err.message, fields: err.fields, code: err.code || undefined });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server. Nothing was saved. Please try again.' });
  }
};

/**
 * @param dbOrPromise  database from openDb() (or a promise of one, so Vercel can start connecting early)
 * @param options.now  function returning the real time in ms (tests pass a fixed time)
 */
function createApp(dbOrPromise, { now = () => Date.now() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '20kb' }));

  let db = null;
  const ready = Promise.resolve(dbOrPromise).then((d) => { db = d; });
  ready.catch((err) => console.error('Database failed to open:', err));
  app.use('/api', (req, res, next) => {
    ready.then(() => next(), () => res.status(503).json({ error: 'The database is not available right now. Please try again in a minute.' }));
  });

  // Bangkok clock for this request. The browser may send X-Clock-Offset (ms)
  // when the student switches on the demo clock, e.g. to try lunchtime at night.
  const clockFor = (req) => Schedule.clockAt(now() + Schedule.safeOffset(req.get('X-Clock-Offset')));

  /** Stall + live state, as shown on the list and menu pages. */
  function present(stall, clock, slots, cover) {
    const st = Schedule.stallState(stall, clock);
    const open = slots.filter((s) => s.isAvailable);
    return {
      id: stall.id, slug: stall.slug, name: stall.name, nameTh: stall.nameTh, area: stall.area,
      cuisine: stall.cuisine, description: stall.description, dataLabel: stall.dataLabel,
      hours: stall.hoursText, hoursLabel: stall.hoursLabel, prepMinutes: stall.prepMinutes,
      state: st.state, stateText: st.text, isOpenNow: st.isOpenNow,
      // Can a student order right now? Open now, or opening later today (pre-order), with a slot left.
      acceptsOrders: (st.state === 'open' || st.state === 'opens_later') && open.length > 0,
      cover: cover || '/img/rice.svg',
      nextSlot: open.length ? open[0].start : null,
      slotsLeft: open.length,
    };
  }

  /** Menu rows for all stalls (for search and cover pictures). */
  const allMenuRows = () => db.all('SELECT stall_id, name, name_th, image FROM menu_items ORDER BY menu_item_id');
  const coverOf = (rows, stallId) => (rows.find((r) => Number(r.stall_id) === stallId) || {}).image;

  app.get('/api/clock', (req, res) => res.json({ clock: clockFor(req) }));

  // US-01: stall list with search (stall or dish name) and pickup-time filter.
  app.get('/api/stalls', route(async (req, res) => {
    const clock = clockFor(req);
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const pickup = String(req.query.pickup ?? '').trim();
    if (pickup && !TIME_RE.test(pickup)) return res.status(400).json({ error: 'Pickup time must look like 12:30.' });

    const [all, items] = await Promise.all([loadAll(db, clock), allMenuRows()]);
    const result = [];
    for (const { stall, slots } of all) {
      let matchedDishes = [];
      if (q) {
        const stallHit = [stall.name, stall.nameTh].some((t) => t && t.toLowerCase().includes(q));
        matchedDishes = items
          .filter((i) => Number(i.stall_id) === stall.id && [i.name, i.name_th].some((t) => t && t.toLowerCase().includes(q)))
          .map((i) => i.name);
        if (!stallHit && matchedDishes.length === 0) continue;
      }
      // Pickup filter: only stalls with an available window starting at that time.
      if (pickup && !slots.some((s) => s.start === pickup && s.isAvailable)) continue;
      result.push({ ...present(stall, clock, slots, coverOf(items, stall.id)), matchedDishes });
    }
    // Orderable stalls first, then the rest; keep seed order inside each group.
    result.sort((a, b) => Number(b.acceptsOrders) - Number(a.acceptsOrders));
    res.json({ clock, stalls: result });
  }));

  // Pickup times that at least one stall can still take today (for the filter).
  app.get('/api/pickup-times', route(async (req, res) => {
    const clock = clockFor(req);
    const times = new Set();
    for (const { slots } of await loadAll(db, clock)) {
      for (const s of slots) if (s.isAvailable) times.add(s.start);
    }
    res.json({ clock, times: [...times].sort() });
  }));

  // US-02: one stall with its menu and today's remaining pickup windows.
  app.get('/api/stalls/:id', route(async (req, res) => {
    const clock = clockFor(req);
    const stall = await getStall(db, req.params.id);
    if (!stall) return res.status(404).json({ error: 'Stall not found.' });
    const [slots, menu] = await Promise.all([
      slotsFor(db, stall, clock),
      db.all('SELECT * FROM menu_items WHERE stall_id = ? ORDER BY menu_item_id', [stall.id]),
    ]);
    res.json({
      clock,
      stall: present(stall, clock, slots, menu[0] && menu[0].image),
      menu: menu.map((m) => ({
        id: Number(m.menu_item_id), name: m.name, nameTh: m.name_th, category: m.category,
        price: Number(m.price), image: m.image, isAvailable: Boolean(m.is_available),
      })),
      // Hide windows outside today's hours and ones that have already started.
      slots: slots.filter((s) => s.reason !== 'Closed' && s.reason !== 'Past'),
    });
  }));

  // Campus area list.
  app.get('/api/places', route(async (req, res) => {
    const clock = clockFor(req);
    const [all, rows] = await Promise.all([loadAll(db, clock), db.all('SELECT * FROM campus_places ORDER BY place_id')]);
    const states = new Map(all.map(({ stall, slots }) => [stall.id, present(stall, clock, slots)]));
    res.json({
      places: rows.map((r) => {
        const st = r.stall_id != null ? states.get(Number(r.stall_id)) : null;
        return {
          area: r.area, building: r.building, name: r.name, stallId: r.stall_id == null ? null : Number(r.stall_id),
          state: st ? st.state : null, isOpenNow: st ? st.isOpenNow : null, note: r.note, label: r.label,
        };
      }),
    });
  }));

  // US-05: place an order. 201 = created, 200 = duplicate (same token).
  app.post('/api/orders', route(async (req, res) => {
    const { created, order } = await placeOrder(db, req.body, clockFor(req));
    res.status(created ? 201 : 200).json({ order, duplicate: !created });
  }));

  app.get('/api/orders/:number', route(async (req, res) => {
    const order = await getOrder(db, String(req.params.number).toUpperCase(), clockFor(req));
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    res.json({ order });
  }));

  // A student cancels their own order (only while it is Received). Body: { studentId }.
  app.post('/api/orders/:number/cancel', route(async (req, res) => {
    const order = await cancelOrder(db, String(req.params.number).toUpperCase(), (req.body || {}).studentId, clockFor(req));
    res.json({ order });
  }));

  // The business rules in force (from src/config.js), so pages can explain them.
  app.get('/api/config', (req, res) => res.json({ rules: config }));

  // ---- Vendor page (demo sign-in per stall; every call is limited to that stall) ----
  app.get('/api/vendor/stalls', route(async (req, res) => {
    const rows = await db.all('SELECT stall_id, name FROM stalls ORDER BY stall_id');
    res.json({ stalls: rows.map((r) => ({ id: Number(r.stall_id), name: r.name })) });
  }));

  app.post('/api/vendor/login', route(async (req, res) => {
    const { stallId, pin } = req.body || {};
    res.json(await vendor.login(db, stallId, pin, now()));
  }));

  const asVendor = vendor.requireVendor(now);

  app.get('/api/vendor/orders', asVendor, route(async (req, res) => {
    const clock = clockFor(req);
    const stall = await getStall(db, req.stallId);
    res.json({ clock, stall: { id: stall.id, name: stall.name }, orders: await vendorOrders(db, req.stallId, clock) });
  }));

  // action: accept | reject | ready | collected | no_show | cancel. Body: { reason } for reject/cancel.
  app.post('/api/vendor/orders/:number/:action', asVendor, route(async (req, res) => {
    if (!Object.hasOwn(VENDOR_ACTIONS, req.params.action)) return res.status(400).json({ error: 'Unknown action.' });
    const order = await vendorAction(db, req.stallId, String(req.params.number).toUpperCase(), req.params.action, (req.body || {}).reason, clockFor(req));
    res.json({ order });
  }));

  app.get('/api/vendor/menu', asVendor, route(async (req, res) => {
    const rows = await db.all('SELECT * FROM menu_items WHERE stall_id = ? ORDER BY menu_item_id', [req.stallId]);
    res.json({
      menu: rows.map((m) => ({ id: Number(m.menu_item_id), name: m.name, nameTh: m.name_th, category: m.category, price: Number(m.price), isAvailable: Boolean(m.is_available) })),
    });
  }));

  // Sold Out switch. Body: { available: true | false }.
  app.post('/api/vendor/menu/:id/availability', asVendor, route(async (req, res) => {
    res.json({ item: await setItemAvailability(db, req.stallId, req.params.id, (req.body || {}).available) });
  }));

  // Which database is in use (for checking the live setup; never shows secrets).
  app.get('/api/health', route(async (req, res) => {
    const { n } = await db.get('SELECT COUNT(*) AS n FROM orders');
    res.json({ ok: true, database: db.url.startsWith('libsql:') || db.url.startsWith('https:') ? 'turso' : 'local-file', orders: Number(n) });
  }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // Static frontend (on Vercel the CDN serves /public directly).
  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

  return app;
}

module.exports = { createApp };
