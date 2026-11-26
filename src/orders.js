// Order rules (US-04, US-05). The server never trusts the browser: prices,
// availability, stall, opening hours and the pickup slot are all re-checked
// here, at the moment of ordering, before anything is saved.
const crypto = require('node:crypto');
const Schedule = require('../public/js/schedule');
const { getStall, slotStates } = require('./data');

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

/** Check the parts of an order that need no database. Returns field errors. */
function validateShape(body) {
  const fields = validateCustomer(body.customer);
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
  return { fields, rawItems };
}

/** Short, hard-to-guess public order number, e.g. CF-7K3QXM. */
async function newOrderNumber(db) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
  for (;;) {
    const code = Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join('');
    const number = `CF-${code}`;
    if (!(await db.get('SELECT 1 FROM orders WHERE order_number = ?', [number]))) return number;
  }
}

/** Load a full order by its number, with the live status for `clock`. */
async function getOrder(db, orderNumber, clock) {
  const o = await db.get(`
    SELECT o.*, s.name AS stall_name, s.name_th AS stall_name_th, s.area AS stall_area,
           p.start_time, p.end_time
    FROM orders o
    JOIN stalls s ON s.stall_id = o.stall_id
    JOIN pickup_slots p ON p.pickup_slot_id = o.pickup_slot_id
    WHERE o.order_number = ?`, [orderNumber]);
  if (!o) return null;
  const items = await db.all('SELECT name, quantity, unit_price FROM order_items WHERE order_id = ? ORDER BY order_item_id', [o.order_id]);

  const order = {
    orderNumber: o.order_number,
    storedStatus: o.status,
    total: Number(o.total_amount),
    customerName: o.customer_name,
    note: o.note,
    date: o.order_date,
    placedMinutes: Number(o.placed_minutes),
    placedAt: Schedule.toHHMM(Number(o.placed_minutes)),
    prepMinutes: Number(o.prep_minutes),
    pickupStart: o.start_time,
    pickupEnd: o.end_time,
    stall: { id: Number(o.stall_id), name: o.stall_name, nameTh: o.stall_name_th, area: o.stall_area },
    items: items.map((i) => ({
      name: i.name, quantity: Number(i.quantity), unitPrice: Number(i.unit_price), lineTotal: Number(i.quantity) * Number(i.unit_price),
    })),
  };
  order.status = Schedule.orderStatus(order, clock).status;
  return order;
}

/**
 * Place an order at the time given by `clock`. Returns { created, order }.
 * Throws OrderError (400/404/409) when a rule fails; then nothing is saved.
 *
 * Everything that could change between two clicks (duplicate token, Sold Out,
 * slot capacity) is checked inside ONE write transaction together with the
 * insert, so two server copies can never overbook a slot or double-create.
 */
async function placeOrder(db, body = {}, clock) {
  const token = String(body.submissionToken ?? '');
  if (!TOKEN_RE.test(token)) throw new OrderError(400, 'Missing or invalid submission token.');
  const { fields, rawItems } = validateShape(body);

  const result = await db.write(async (tx) => {
    // Duplicate check: the same token means the same press of Place Order
    // (double tap, slow network retry). Return the order that already exists.
    const existing = await tx.get('SELECT order_number FROM orders WHERE submission_token = ?', [token]);
    if (existing) return { created: false, number: existing.order_number };

    if (Object.keys(fields).length) throw new OrderError(400, 'Please fix the highlighted fields.', fields);

    const stall = await getStall(tx, Number(body.stallId));
    if (!stall) throw new OrderError(404, 'Stall not found.');
    const state = Schedule.stallState(stall, clock);
    if (state.state === 'closed_today' || state.state === 'closed_day' || state.state === 'closed_now') {
      throw new OrderError(409, `${stall.name} is closed, so it cannot take orders right now. ${state.text}.`);
    }

    // Every item must belong to this one stall and be available right now.
    const lines = [];
    for (const it of rawItems) {
      const item = await tx.get('SELECT * FROM menu_items WHERE menu_item_id = ?', [Number(it.menuItemId)]);
      if (!item) throw new OrderError(404, 'A menu item in your order no longer exists.', { items: 'Remove the missing item.' });
      if (Number(item.stall_id) !== stall.id) {
        throw new OrderError(409, 'One order can only contain food from one stall.', { items: `“${item.name}” is from a different stall.` });
      }
      if (!item.is_available) throw new OrderError(409, `“${item.name}” is Sold Out.`, { items: `Remove “${item.name}” (Sold Out).` });
      lines.push({ item, quantity: it.quantity });
    }

    // The slot must belong to this stall and be available at this moment
    // (not past, enough time to cook, not paused, not full).
    const slotRow = await tx.get('SELECT * FROM pickup_slots WHERE pickup_slot_id = ? AND stall_id = ?', [Number(body.pickupSlotId), stall.id]);
    if (!slotRow) throw new OrderError(409, 'That pickup time does not belong to this stall.', { pickupSlotId: 'Choose another pickup time.' });
    const booked = await tx.get(`SELECT COUNT(*) AS n FROM orders WHERE pickup_slot_id = ? AND order_date = ? AND status != 'CANCELLED'`,
      [Number(slotRow.pickup_slot_id), clock.date]);
    const usage = new Map([[Number(slotRow.pickup_slot_id), Number(booked.n)]]);
    const [slot] = slotStates(stall, [slotRow], clock, usage);
    if (!slot.isAvailable) {
      throw new OrderError(409, `The ${slot.start} pickup slot is unavailable (${slot.reason.toLowerCase()}).`, { pickupSlotId: 'Choose another available pickup time.' });
    }

    // The total always comes from database prices, never from the browser.
    const total = lines.reduce((sum, l) => sum + Number(l.item.price) * l.quantity, 0);
    const c = body.customer;
    const note = String(body.note ?? '').trim().slice(0, 200) || null;
    const number = await newOrderNumber(tx);
    const { lastInsertRowid } = await tx.run(`INSERT INTO orders
      (order_number, submission_token, stall_id, pickup_slot_id, order_date, placed_minutes, prep_minutes,
       customer_name, student_id, phone, note, status, total_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', ?)`, [
      number, token, stall.id, slot.id, clock.date, clock.minutes, stall.prepMinutes,
      String(c.name).trim(), String(c.studentId).trim(), String(c.phone).trim(), note, total]);
    for (const l of lines) {
      await tx.run('INSERT INTO order_items (order_id, menu_item_id, name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)',
        [lastInsertRowid, Number(l.item.menu_item_id), l.item.name, l.quantity, Number(l.item.price)]);
    }
    return { created: true, number };
  });

  return { created: result.created, order: await getOrder(db, result.number, clock) };
}

module.exports = { placeOrder, getOrder, validateCustomer, OrderError, MAX_QTY };
