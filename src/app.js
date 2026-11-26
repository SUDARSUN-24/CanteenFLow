// Express app: JSON API + static frontend. `createApp(db)` is used by
// server.js (local), api/index.js (Vercel) and the tests.
const path = require('node:path');
const express = require('express');
const { placeOrder, getOrder, OrderError } = require('./orders');

const TIME_RE = /^\d{2}:\d{2}$/;

function stallSummary(s, slots) {
  const mine = slots.filter((p) => p.stall_id === s.stall_id);
  const next = mine.find((p) => p.is_available);
  return {
    id: s.stall_id,
    slug: s.slug,
    name: s.name,
    nameTh: s.name_th,
    area: s.area,
    cuisine: s.cuisine,
    hours: s.hours_text,
    hoursLabel: s.hours_label,
    prepMinutes: s.prep_minutes,
    isOpen: Boolean(s.is_open),
    closedNote: s.closed_note,
    description: s.description,
    dataLabel: s.data_label,
    nextSlot: s.is_open && next ? next.start_time : null,
  };
}

function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '20kb' }));

  // US-01: stall list with search (stall or dish name) and pickup-time filter.
  app.get('/api/stalls', (req, res) => {
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const pickup = String(req.query.pickup ?? '').trim();
    if (pickup && !TIME_RE.test(pickup)) return res.status(400).json({ error: 'Pickup time must look like 12:30.' });

    const stalls = db.prepare('SELECT * FROM stalls ORDER BY is_open DESC, stall_id').all();
    const slots = db.prepare('SELECT * FROM pickup_slots ORDER BY start_time').all();
    const items = db.prepare('SELECT stall_id, name, name_th FROM menu_items').all();

    const result = [];
    for (const s of stalls) {
      let matchedDishes = [];
      if (q) {
        const stallHit = [s.name, s.name_th].some((t) => t && t.toLowerCase().includes(q));
        matchedDishes = items
          .filter((i) => i.stall_id === s.stall_id && [i.name, i.name_th].some((t) => t && t.toLowerCase().includes(q)))
          .map((i) => i.name);
        if (!stallHit && matchedDishes.length === 0) continue;
      }
      if (pickup) {
        // Only open stalls with an available slot at that time.
        const ok = s.is_open && slots.some((p) => p.stall_id === s.stall_id && p.start_time === pickup && p.is_available);
        if (!ok) continue;
      }
      result.push({ ...stallSummary(s, slots), matchedDishes });
    }
    res.json({ stalls: result });
  });

  // All slot start times that exist, for the pickup-time filter.
  app.get('/api/pickup-times', (req, res) => {
    const rows = db.prepare('SELECT DISTINCT start_time FROM pickup_slots ORDER BY start_time').all();
    res.json({ times: rows.map((r) => r.start_time) });
  });

  // US-02: one stall with its menu and pickup slots.
  app.get('/api/stalls/:id', (req, res) => {
    const s = db.prepare('SELECT * FROM stalls WHERE stall_id = ? OR slug = ?').get(Number(req.params.id) || -1, req.params.id);
    if (!s) return res.status(404).json({ error: 'Stall not found.' });
    const slots = db.prepare('SELECT * FROM pickup_slots WHERE stall_id = ? ORDER BY start_time').all(s.stall_id);
    const menu = db.prepare('SELECT * FROM menu_items WHERE stall_id = ? ORDER BY menu_item_id').all(s.stall_id);
    res.json({
      stall: stallSummary(s, slots),
      menu: menu.map((m) => ({
        id: m.menu_item_id, name: m.name, nameTh: m.name_th, category: m.category,
        price: m.price, image: m.image, isAvailable: Boolean(m.is_available),
      })),
      slots: slots.map((p) => ({ id: p.pickup_slot_id, start: p.start_time, end: p.end_time, isAvailable: Boolean(p.is_available) })),
    });
  });

  // Campus area list.
  app.get('/api/places', (req, res) => {
    const rows = db.prepare(`SELECT p.*, s.is_open FROM campus_places p LEFT JOIN stalls s ON s.stall_id = p.stall_id ORDER BY p.place_id`).all();
    res.json({
      places: rows.map((r) => ({
        area: r.area, building: r.building, name: r.name, stallId: r.stall_id,
        isOpen: r.stall_id ? Boolean(r.is_open) : null, note: r.note, label: r.label,
      })),
    });
  });

  // US-05: place an order. 201 = created, 200 = duplicate (same token).
  app.post('/api/orders', (req, res) => {
    try {
      const { created, order } = placeOrder(db, req.body);
      res.status(created ? 201 : 200).json({ order, duplicate: !created });
    } catch (err) {
      if (err instanceof OrderError) return res.status(err.status).json({ error: err.message, fields: err.fields });
      console.error(err);
      res.status(500).json({ error: 'Something went wrong. Your order was not placed.' });
    }
  });

  app.get('/api/orders/:number', (req, res) => {
    const order = getOrder(db, String(req.params.number).toUpperCase());
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    res.json({ order });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // Static frontend (on Vercel the CDN serves /public directly).
  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

  return app;
}

module.exports = { createApp };
