// Order rules (US-04, US-05). The server never trusts the browser: prices,
// availability, stall and slot are all re-checked here before anything is saved.
const crypto = require('node:crypto');
const { transaction } = require('./db');

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
  else if (!PHONE_RE.test(phone)) errors.phone = 'Phone must be 7–20 digits (spaces, +, - and brackets allowed).';

  return errors;
}

/** Short, hard-to-guess public order number, e.g. CF-7K3QXM. */
function newOrderNumber(db) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
  const exists = db.prepare('SELECT 1 FROM orders WHERE order_number = ?');
  for (;;) {
    const bytes = crypto.randomBytes(6);
    const code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
    const number = `CF-${code}`;
    if (!exists.get(number)) return number;
  }
}

/** Load a full order (with items, stall and slot) by order number. */
function getOrder(db, orderNumber) {
  const order = db.prepare(`
    SELECT o.order_number, o.status, o.total_amount, o.customer_name, o.created_at,
           s.name AS stall_name, s.area AS stall_area, s.prep_minutes,
           p.start_time, p.end_time
    FROM orders o
    JOIN stalls s ON s.stall_id = o.stall_id
    JOIN pickup_slots p ON p.pickup_slot_id = o.pickup_slot_id
    WHERE o.order_number = ?`).get(orderNumber);
  if (!order) return null;
  const items = db.prepare(`
    SELECT oi.name, oi.quantity, oi.unit_price, oi.quantity * oi.unit_price AS line_total
    FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
    WHERE o.order_number = ? ORDER BY oi.order_item_id`).all(orderNumber);
  return {
    orderNumber: order.order_number,
    status: order.status,
    total: order.total_amount,
    customerName: order.customer_name,
    createdAt: order.created_at,
    stall: { name: order.stall_name, area: order.stall_area, prepMinutes: order.prep_minutes },
    pickup: { start: order.start_time, end: order.end_time },
    items: items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unit_price, lineTotal: i.line_total })),
  };
}

/**
 * Place an order. Returns { created: boolean, order }.
 * Throws OrderError (400/404/409) when a rule fails; in that case nothing is saved.
 */
function placeOrder(db, body = {}) {
  const token = String(body.submissionToken ?? '');
  if (!TOKEN_RE.test(token)) throw new OrderError(400, 'Missing or invalid submission token.');

  // Duplicate check: the same token means the same click (double press, retry).
  const existing = db.prepare('SELECT order_number FROM orders WHERE submission_token = ?').get(token);
  if (existing) return { created: false, order: getOrder(db, existing.order_number) };

  const fields = validateCustomer(body.customer);

  // Items: at least one, whole-number quantities 1-20, no repeats.
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0) fields.items = 'Your order is empty. Add at least one item.';
  const seen = new Set();
  for (const it of rawItems) {
    const q = it?.quantity;
    if (!Number.isInteger(q) || q < 1 || q > MAX_QTY) {
      fields.items = `Each quantity must be a whole number from 1 to ${MAX_QTY}.`;
    }
    if (seen.has(it?.menuItemId)) fields.items = 'The same item appears twice.';
    seen.add(it?.menuItemId);
  }

  if (body.pickupSlotId == null || body.pickupSlotId === '') fields.pickupSlotId = 'Choose a pickup time.';

  if (Object.keys(fields).length) throw new OrderError(400, 'Please fix the highlighted fields.', fields);

  const stall = db.prepare('SELECT * FROM stalls WHERE stall_id = ?').get(Number(body.stallId));
  if (!stall) throw new OrderError(404, 'Stall not found.');
  if (!stall.is_open) throw new OrderError(409, `${stall.name} is closed, so it cannot take orders right now.`);

  // Every item must belong to this one stall and be available right now.
  const getItem = db.prepare('SELECT * FROM menu_items WHERE menu_item_id = ?');
  const lines = rawItems.map((it) => {
    const item = getItem.get(Number(it.menuItemId));
    if (!item) throw new OrderError(404, 'A menu item in your order no longer exists.', { items: 'Remove the missing item.' });
    if (item.stall_id !== stall.stall_id) {
      throw new OrderError(409, 'One order can only contain food from one stall.', { items: `"${item.name}" is from a different stall.` });
    }
    if (!item.is_available) {
      throw new OrderError(409, `"${item.name}" is Sold Out.`, { items: `Remove "${item.name}" (Sold Out).` });
    }
    return { item, quantity: it.quantity };
  });

  const slot = db.prepare('SELECT * FROM pickup_slots WHERE pickup_slot_id = ?').get(Number(body.pickupSlotId));
  if (!slot || slot.stall_id !== stall.stall_id) {
    throw new OrderError(409, 'That pickup time does not belong to this stall.', { pickupSlotId: 'Choose another pickup time.' });
  }
  if (!slot.is_available) {
    throw new OrderError(409, `The ${slot.start_time} pickup slot is unavailable.`, { pickupSlotId: 'Choose another available pickup time.' });
  }

  // Total is always calculated from database prices, never from the browser.
  const total = lines.reduce((sum, l) => sum + l.item.price * l.quantity, 0);
  const c = body.customer;
  const note = String(body.note ?? '').trim().slice(0, 200) || null;

  const orderNumber = transaction(db, () => {
    const number = newOrderNumber(db);
    const { lastInsertRowid } = db.prepare(`INSERT INTO orders
      (order_number, submission_token, stall_id, pickup_slot_id, customer_name, student_id, phone, note, status, total_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', ?)`).run(
      number, token, stall.stall_id, slot.pickup_slot_id,
      String(c.name).trim(), String(c.studentId).trim(), String(c.phone).trim(), note, total);
    const insLine = db.prepare(`INSERT INTO order_items (order_id, menu_item_id, name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)`);
    for (const l of lines) insLine.run(lastInsertRowid, l.item.menu_item_id, l.item.name, l.quantity, l.item.price);
    return number;
  });

  return { created: true, order: getOrder(db, orderNumber) };
}

module.exports = { placeOrder, getOrder, validateCustomer, OrderError, MAX_QTY };
