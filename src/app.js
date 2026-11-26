// Express app: JSON API + static frontend. `createApp(db)` is used by
// server.js (local), api/index.js (Vercel) and the tests.
const path = require('node:path');
const express = require('express');
const Schedule = require('../public/js/schedule');
const { allStalls, getStall, slotUsage, slotsFor } = require('./data');
const { placeOrder, getOrder, OrderError } = require('./orders');

const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * @param db      node:sqlite database
 * @param options.now  function returning the real time in ms (tests pass a fixed time)
 */
function createApp(db, { now = () => Date.now() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '20kb' }));

  // Bangkok clock for this request. The browser may send X-Clock-Offset (ms)
  // when the student switches on the demo clock, e.g. to try lunchtime at night.
  const clockFor = (req) => Schedule.clockAt(now() + Schedule.safeOffset(req.get('X-Clock-Offset')));

  /** Stall + live state, as shown on the list and menu pages. */
  function present(stall, clock, slots) {
    const st = Schedule.stallState(stall, clock);
    const open = slots.filter((s) => s.isAvailable);
    return {
      id: stall.id, slug: stall.slug, name: stall.name, nameTh: stall.nameTh, area: stall.area,
      cuisine: stall.cuisine, description: stall.description, dataLabel: stall.dataLabel,
      hours: stall.hoursText, hoursLabel: stall.hoursLabel, prepMinutes: stall.prepMinutes,
      state: st.state, stateText: st.text, isOpenNow: st.isOpenNow,
      // Can a student order right now? Open now, or opening later today (pre-order), with a slot left.
      acceptsOrders: (st.state === 'open' || st.state === 'opens_later') && open.length > 0,
      nextSlot: open.length ? open[0].start : null,
      slotsLeft: open.length,
    };
  }

  app.get('/api/clock', (req, res) => res.json({ clock: clockFor(req) }));

  // US-01: stall list with search (stall or dish name) and pickup-time filter.
  app.get('/api/stalls', (req, res) => {
    const clock = clockFor(req);
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const pickup = String(req.query.pickup ?? '').trim();
    if (pickup && !TIME_RE.test(pickup)) return res.status(400).json({ error: 'Pickup time must look like 12:30.' });

    const usage = slotUsage(db, clock.date);
    const items = db.prepare('SELECT stall_id, name, name_th FROM menu_items').all();
    const result = [];
    for (const stall of allStalls(db)) {
      let matchedDishes = [];
      if (q) {
        const stallHit = [stall.name, stall.nameTh].some((t) => t && t.toLowerCase().includes(q));
        matchedDishes = items
          .filter((i) => i.stall_id === stall.id && [i.name, i.name_th].some((t) => t && t.toLowerCase().includes(q)))
          .map((i) => i.name);
        if (!stallHit && matchedDishes.length === 0) continue;
      }
      const slots = slotsFor(db, stall, clock, usage);
      // Pickup filter: only stalls with an available window starting at that time.
      if (pickup && !slots.some((s) => s.start === pickup && s.isAvailable)) continue;
      result.push({ ...present(stall, clock, slots), matchedDishes });
    }
    // Orderable stalls first, then the rest; keep seed order inside each group.
    result.sort((a, b) => Number(b.acceptsOrders) - Number(a.acceptsOrders));
    res.json({ clock, stalls: result });
  });

  // Pickup times that at least one stall can still take today (for the filter).
  app.get('/api/pickup-times', (req, res) => {
    const clock = clockFor(req);
    const usage = slotUsage(db, clock.date);
    const times = new Set();
    for (const stall of allStalls(db)) {
      for (const s of slotsFor(db, stall, clock, usage)) if (s.isAvailable) times.add(s.start);
    }
    res.json({ clock, times: [...times].sort() });
  });

  // US-02: one stall with its menu and today's remaining pickup windows.
  app.get('/api/stalls/:id', (req, res) => {
    const clock = clockFor(req);
    const stall = getStall(db, req.params.id);
    if (!stall) return res.status(404).json({ error: 'Stall not found.' });
    const slots = slotsFor(db, stall, clock);
    const menu = db.prepare('SELECT * FROM menu_items WHERE stall_id = ? ORDER BY menu_item_id').all(stall.id);
    res.json({
      clock,
      stall: present(stall, clock, slots),
      menu: menu.map((m) => ({
        id: m.menu_item_id, name: m.name, nameTh: m.name_th, category: m.category,
        price: m.price, image: m.image, isAvailable: Boolean(m.is_available),
      })),
      // Hide windows outside today's hours and ones that have already started.
      slots: slots.filter((s) => s.reason !== 'Closed' && s.reason !== 'Past'),
    });
  });

  // Campus area list.
  app.get('/api/places', (req, res) => {
    const clock = clockFor(req);
    const usage = slotUsage(db, clock.date);
    const states = new Map(allStalls(db).map((s) => [s.id, present(s, clock, slotsFor(db, s, clock, usage))]));
    const rows = db.prepare('SELECT * FROM campus_places ORDER BY place_id').all();
    res.json({
      places: rows.map((r) => {
        const st = r.stall_id ? states.get(r.stall_id) : null;
        return {
          area: r.area, building: r.building, name: r.name, stallId: r.stall_id,
          state: st ? st.state : null, isOpenNow: st ? st.isOpenNow : null, note: r.note, label: r.label,
        };
      }),
    });
  });

  // US-05: place an order. 201 = created, 200 = duplicate (same token).
  app.post('/api/orders', (req, res) => {
    try {
      const { created, order } = placeOrder(db, req.body, clockFor(req));
      res.status(created ? 201 : 200).json({ order, duplicate: !created });
    } catch (err) {
      if (err instanceof OrderError) return res.status(err.status).json({ error: err.message, fields: err.fields });
      console.error(err);
      res.status(500).json({ error: 'Something went wrong. Your order was not placed.' });
    }
  });

  app.get('/api/orders/:number', (req, res) => {
    const order = getOrder(db, String(req.params.number).toUpperCase(), clockFor(req));
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    res.json({ order });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // Static frontend (on Vercel the CDN serves /public directly).
  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

  return app;
}

module.exports = { createApp };
