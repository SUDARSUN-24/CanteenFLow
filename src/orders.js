// Order rules (US-04, US-05). The server never trusts the browser: prices,
// availability, stall, opening hours and the pickup slot are all re-checked
// here, at the moment of ordering, before anything is saved.
const crypto = require('node:crypto');
const Schedule = require('../public/js/schedule');
const { transaction } = require('./db');
const { getStall, slotsFor } = require('./data');

const MAX_QTY = 20;
const TOKEN_RE = /^[A-Za-z0-9-]{16,64}$/;
const STUDENT_ID_RE = /^[A-Za-z0-9]{1,20}$/;
const PHONE_RE = /^[0-9+\-() ]{7,20}$/;

class OrderError extends Error {
  constructor(status, message, fields = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

/** Check the student's details. Returns { field: message } for each problem. */
function validateCustomer(customer = {}) {
  const errors = {};
  const name = String(customer.name ?? '').trim();
  const studentId = String(customer.studentId ?? '').trim();
  const phone = String(customer.phone ?? '').trim();

  if (!name) errors.name = 'Enter your name.';
  else if (name.length > 100) errors.name = 'Name must be 100 characters or fewer.';

  if (!studentId) errors.studentId = 'Enter your student ID.';
  else if (!STUDENT_ID_RE.test(studentId)) errors.studentId = 'Student ID must be 1–20 letters or digits.';

  if (!phone) errors.phone = 'Enter your phone number.';
  else if (!PHONE_RE.test(phone) || phone.replace(/\D/g, '').length < 7) {
    errors.phone = 'Phone must have at least 7 digits (spaces, +, - and brackets allowed).';
  }
  return errors;
}

/** Short, hard-to-guess public order number, e.g. CF-7K3QXM. */
function newOrderNumber(db) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
  const exists = db.prepare('SELECT 1 FROM orders WHERE order_number = ?');
  for (;;) {
    const code = Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join('');
    const number = `CF-${code}`;
    if (!exists.get(number)) return number;
  }
}

/** Load a full order by its number, with the live status for `clock`. */
function getOrder(db, orderNumber, clock) {
  const o = db.prepare(`
    SELECT o.*, s.name AS stall_name, s.name_th AS stall_name_th, s.area AS stall_area,
           p.start_time, p.end_time
    FROM orders o
    JOIN stalls s ON s.stall_id = o.stall_id
    JOIN pickup_slots p ON p.pickup_slot_id = o.pickup_slot_id
    WHERE o.order_number = ?`).get(orderNumber);
  if (!o) return null;
  const items = db.prepare(`SELECT name, quantity, unit_price FROM order_items WHERE order_id = ? ORDER BY order_item_id`).all(o.order_id);

  const order = {
    orderNumber: o.order_number,
    storedStatus: o.status,
    total: o.total_amount,
    customerName: o.customer_name,
    note: o.note,
    date: o.order_date,
    placedMinutes: o.placed_minutes,
    placedAt: Schedule.toHHMM(o.placed_minutes),
    prepMinutes: o.prep_minutes,
    pickupStart: o.start_time,
    pickupEnd: o.end_time,
    stall: { id: o.stall_id, name: o.stall_name, nameTh: o.stall_name_th, area: o.stall_area },
    items: items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unit_price, lineTotal: i.quantity * i.unit_price })),
  };
  order.status = Schedule.orderStatus(order, clock).status;
  return order;
}

/**
 * Place an order at the time given by `clock`. Returns { created, order }.
 * Throws OrderError (400/404/409) when a rule fails; then nothing is saved.
 */
function placeOrder(db, body = {}, clock) {
  const token = String(body.submissionToken ?? '');
  if (!TOKEN_RE.test(token)) throw new OrderError(400, 'Missing or invalid submission token.');

  // Duplicate check: the same token means the same press of Place Order
  // (double tap, slow network retry). Return the order that already exists.
  const existing = db.prepare('SELECT order_number FROM orders WHERE submission_token = ?').get(token);
  if (existing) return { created: false, order: getOrder(db, existing.order_number, clock) };

  const fields = validateCustomer(body.customer);

  // Items: at least one, whole-number quantities 1-20, no repeats.
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0) fields.items = 'Your order is empty. Add at least one item.';
  const seen = new Set();
  for (const it of rawItems) {
    const q = it?.quantity;
    if (!Number.isInteger(q) || q < 1 || q > MAX_QTY) fields.items = `Each quantity must be a whole number from 1 to ${MAX_QTY}.`;
    if (seen.has(it?.menuItemId)) fields.items = 'The same item appears twice.';
    seen.add(it?.menuItemId);
  }
  if (body.pickupSlotId == null || body.pickupSlotId === '') fields.pickupSlotId = 'Choose a pickup time.';
  if (Object.keys(fields).length) throw new OrderError(400, 'Please fix the highlighted fields.', fields);

  const stall = getStall(db, Number(body.stallId));
  if (!stall) throw new OrderError(404, 'Stall not found.');
  const state = Schedule.stallState(stall, clock);
  if (state.state === 'closed_today' || state.state === 'closed_day' || state.state === 'closed_now') {
    throw new OrderError(409, `${stall.name} is closed, so it cannot take orders right now. ${state.text}.`);
  }

  // Every item must belong to this one stall and be available right now.
  const getItem = db.prepare('SELECT * FROM menu_items WHERE menu_item_id = ?');
  const lines = rawItems.map((it) => {
    const item = getItem.get(Number(it.menuItemId));
    if (!item) throw new OrderError(404, 'A menu item in your order no longer exists.', { items: 'Remove the missing item.' });
    if (item.stall_id !== stall.id) {
      throw new OrderError(409, 'One order can only contain food from one stall.', { items: `“${item.name}” is from a different stall.` });
    }
    if (!item.is_available) throw new OrderError(409, `“${item.name}” is Sold Out.`, { items: `Remove “${item.name}” (Sold Out).` });
    return { item, quantity: it.quantity };
  });

  // The slot must belong to this stall and be available at this moment
  // (not past, enough time to cook, not paused, not full).
  const slot = slotsFor(db, stall, clock).find((s) => s.id === Number(body.pickupSlotId));
  if (!slot) throw new OrderError(409, 'That pickup time does not belong to this stall.', { pickupSlotId: 'Choose another pickup time.' });
  if (!slot.isAvailable) {
    throw new OrderError(409, `The ${slot.start} pickup slot is unavailable (${slot.reason.toLowerCase()}).`, { pickupSlotId: 'Choose another available pickup time.' });
  }

  // The total always comes from database prices, never from the browser.
  const total = lines.reduce((sum, l) => sum + l.item.price * l.quantity, 0);
  const c = body.customer;
  const note = String(body.note ?? '').trim().slice(0, 200) || null;

  const orderNumber = transaction(db, () => {
    const number = newOrderNumber(db);
    const { lastInsertRowid } = db.prepare(`INSERT INTO orders
      (order_number, submission_token, stall_id, pickup_slot_id, order_date, placed_minutes, prep_minutes,
       customer_name, student_id, phone, note, status, total_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', ?)`).run(
      number, token, stall.id, slot.id, clock.date, clock.minutes, stall.prepMinutes,
      String(c.name).trim(), String(c.studentId).trim(), String(c.phone).trim(), note, total);
    const insLine = db.prepare('INSERT INTO order_items (order_id, menu_item_id, name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)');
    for (const l of lines) insLine.run(lastInsertRowid, l.item.menu_item_id, l.item.name, l.quantity, l.item.price);
    return number;
  });

  return { created: true, order: getOrder(db, orderNumber, clock) };
}

module.exports = { placeOrder, getOrder, validateCustomer, OrderError, MAX_QTY };
