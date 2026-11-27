// Order rules (US-04, US-05, cancellation, vendor actions). The server never
// trusts the browser: prices, availability, stall, opening hours, the pickup
// slot, the student's limits and every status change are re-checked here,
// inside one write transaction, before anything is saved.
// Every rule number comes from src/config.js.
const crypto = require('node:crypto');
const Schedule = require('../public/js/schedule');
const config = require('./config');
const { getStall, slotStates } = require('./data');

const MAX_QTY = 20;
const TOKEN_RE = /^[A-Za-z0-9-]{16,64}$/;
const STUDENT_ID_RE = new RegExp(`^\\d{${config.STUDENT_ID_DIGITS}}$`);
const PHONE_RE = /^[0-9+\-() ]{7,20}$/;

/** Statuses of an order that is still going: it counts toward the per-student limit. */
const ACTIVE_STATUSES = ['RECEIVED', 'PREPARING', 'READY'];
const inList = (list) => list.map((s) => `'${s}'`).join(', '); // fixed constants only, never user input

class OrderError extends Error {
  constructor(status, message, fields = {}, code = null) {
    super(message);
    this.status = status;
    this.fields = fields;
    this.code = code;
  }
}

/** Bangkok 'YYYY-MM-DD HH:MM' for the request clock (follows the demo clock). */
const stamp = (clock) => `${clock.date} ${clock.hhmm}`;

/** Check the student's details. Returns { field: message } for each problem. */
function validateCustomer(customer = {}) {
  const errors = {};
  const name = String(customer.name ?? '').trim();
  const studentId = String(customer.studentId ?? '').trim();
  const phone = String(customer.phone ?? '').trim();

  if (!name) errors.name = 'Enter your name.';
  else if (name.length > 100) errors.name = 'Name must be 100 characters or fewer.';

  if (!studentId) errors.studentId = 'Enter your student ID.';
  else if (!STUDENT_ID_RE.test(studentId)) errors.studentId = `Student ID must be exactly ${config.STUDENT_ID_DIGITS} digits.`;

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

/** Database row (orders + stall + slot) -> order object for the API. */
async function toOrder(db, o, clock) {
  const items = await db.all('SELECT name, quantity, unit_price FROM order_items WHERE order_id = ? ORDER BY order_item_id', [o.order_id]);
  const order = {
    orderNumber: o.order_number,
    storedStatus: o.status,
    status: o.status,
    cancelledBy: o.cancelled_by || null,
    statusReason: o.status_reason || null,
    statusChangedAt: o.status_changed_at || null,
    canCancel: config.CANCEL_WINDOW_STATUSES.includes(o.status),
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

const ORDER_SELECT = `
  SELECT o.*, s.name AS stall_name, s.name_th AS stall_name_th, s.area AS stall_area, p.start_time, p.end_time
  FROM orders o
  JOIN stalls s ON s.stall_id = o.stall_id
  JOIN pickup_slots p ON p.pickup_slot_id = o.pickup_slot_id`;

/** Load a full order by its number. */
async function getOrder(db, orderNumber, clock) {
  const o = await db.get(`${ORDER_SELECT} WHERE o.order_number = ?`, [orderNumber]);
  return o ? toOrder(db, o, clock) : null;
}

/**
 * Place an order at the time given by `clock`. Returns { created, order }.
 * Throws OrderError (400/403/404/409) when a rule fails; then nothing is saved.
 *
 * Everything that could change between two clicks (duplicate token, the
 * student's limits, Sold Out, slot capacity) is checked inside ONE write
 * transaction together with the insert, so two server copies can never
 * overbook a slot, pass a limit or double-create.
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
    const studentId = String(body.customer.studentId).trim();

    // Vendor protection: too many missed pickups blocks new orders.
    const noShows = Number((await tx.get(`SELECT COUNT(*) AS n FROM orders WHERE student_id = ? AND status = 'NO_SHOW'`, [studentId])).n);
    if (noShows >= config.NO_SHOW_LIMIT) {
      throw new OrderError(403,
        `Sorry, we can't take new orders from this student ID because ${noShows} earlier orders were not collected (No-show). ` +
        'Please contact the stall to sort it out.', {}, 'NO_SHOW_LIMIT');
    }
    // Limit of orders one student can hold at once (today and later).
    const active = Number((await tx.get(
      `SELECT COUNT(*) AS n FROM orders WHERE student_id = ? AND status IN (${inList(ACTIVE_STATUSES)}) AND order_date >= ?`,
      [studentId, clock.date])).n);
    if (active >= config.MAX_ACTIVE_ORDERS_PER_STUDENT) {
      throw new OrderError(409,
        `You already have ${active} active order${active === 1 ? '' : 's'}. One student can hold at most ` +
        `${config.MAX_ACTIVE_ORDERS_PER_STUDENT} at a time. Collect or cancel one first.`, {}, 'ACTIVE_LIMIT');
    }

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
       customer_name, student_id, phone, note, status, status_changed_at, total_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', ?, ?)`, [
      number, token, stall.id, slot.id, clock.date, clock.minutes, stall.prepMinutes,
      String(c.name).trim(), studentId, String(c.phone).trim(), note, stamp(clock), total]);
    for (const l of lines) {
      await tx.run('INSERT INTO order_items (order_id, menu_item_id, name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)',
        [lastInsertRowid, Number(l.item.menu_item_id), l.item.name, l.quantity, Number(l.item.price)]);
    }
    return { created: true, number };
  });

  return { created: result.created, order: await getOrder(db, result.number, clock) };
}

/** Why a student can no longer cancel an order with this status. */
function tooLateMessage(o) {
  switch (o.status) {
    case 'PREPARING': return 'Too late to cancel: the stall has already started preparing this order. Please talk to the stall.';
    case 'READY': return 'Too late to cancel: this order is ready for pickup. Please talk to the stall.';
    case 'COLLECTED': return 'This order has already been collected.';
    case 'NO_SHOW': return 'This order was marked as not collected (No-show).';
    case 'CANCELLED': return 'This order was already cancelled by the stall.';
    default: return 'This order can no longer be cancelled.';
  }
}

/**
 * A student cancels their own order. Allowed only inside the cancel window
 * (config.CANCEL_WINDOW_STATUSES). The student ID must match the order.
 * Cancelling twice is harmless: the second call returns the cancelled order.
 * The cancelled order no longer holds its pickup slot.
 */
async function cancelOrder(db, orderNumber, studentId, clock) {
  const sid = String(studentId ?? '').trim();
  if (!STUDENT_ID_RE.test(sid)) {
    throw new OrderError(400, 'Enter the student ID you used for this order.', { studentId: `Student ID must be exactly ${config.STUDENT_ID_DIGITS} digits.` });
  }
  await db.write(async (tx) => {
    const o = await tx.get('SELECT order_id, student_id, status, cancelled_by FROM orders WHERE order_number = ?', [orderNumber]);
    if (!o) throw new OrderError(404, 'Order not found.');
    if (o.student_id !== sid) throw new OrderError(403, 'That student ID does not match this order, so it cannot be cancelled here.', { studentId: 'Not the student ID used for this order.' });
    if (o.status === 'CANCELLED' && o.cancelled_by === 'student') return; // double click: already done
    if (!config.CANCEL_WINDOW_STATUSES.includes(o.status)) throw new OrderError(409, tooLateMessage(o), {}, 'TOO_LATE');
    const r = await tx.run(`UPDATE orders SET status = 'CANCELLED', cancelled_by = 'student', status_reason = NULL, status_changed_at = ?
      WHERE order_id = ? AND status IN (${inList(config.CANCEL_WINDOW_STATUSES)})`, [stamp(clock), o.order_id]);
    if (!r.changes) throw new OrderError(409, 'The order changed while you were cancelling. Please check its status.');
  });
  return getOrder(db, orderNumber, clock);
}

/**
 * What a vendor can do to an order, and from which statuses.
 * reason: a reason is required (shown to the student).
 * afterWindow: only once the pickup window has ended.
 */
const VENDOR_ACTIONS = Object.freeze({
  accept: { from: ['RECEIVED'], to: 'PREPARING', label: 'Accept' },
  reject: { from: ['RECEIVED'], to: 'CANCELLED', reason: true, label: 'Reject' },
  ready: { from: ['PREPARING'], to: 'READY', label: 'Mark Ready' },
  collected: { from: ['READY'], to: 'COLLECTED', label: 'Mark Collected' },
  no_show: { from: ['READY'], to: 'NO_SHOW', afterWindow: true, label: 'Mark No-show' },
  cancel: { from: ['PREPARING', 'READY'], to: 'CANCELLED', reason: true, label: 'Cancel' },
});

/**
 * A vendor changes the status of one of THEIR stall's orders.
 * An order of another stall is reported as "not found", so its existence is not revealed.
 * Repeating the same action (double click) is harmless.
 */
async function vendorAction(db, stallId, orderNumber, action, reasonRaw, clock) {
  const rule = VENDOR_ACTIONS[action];
  if (!rule) throw new OrderError(400, 'Unknown action.');
  const reason = String(reasonRaw ?? '').trim();
  if (rule.reason) {
    if (!reason) throw new OrderError(400, 'Give a reason. The student will see it.', { reason: 'A reason is required.' });
    if (reason.length > config.REASON_MAX_CHARS) {
      throw new OrderError(400, `The reason must be ${config.REASON_MAX_CHARS} characters or fewer.`, { reason: 'Too long.' });
    }
  }
  await db.write(async (tx) => {
    const o = await tx.get(`SELECT o.order_id, o.status, o.cancelled_by, o.order_date, p.end_time FROM orders o
      JOIN pickup_slots p ON p.pickup_slot_id = o.pickup_slot_id
      WHERE o.order_number = ? AND o.stall_id = ?`, [orderNumber, stallId]);
    if (!o) throw new OrderError(404, 'Order not found.');
    const cancelledByVendor = rule.to === 'CANCELLED';
    // Already done (double click): nothing to change. An order the STUDENT
    // cancelled is not "rejected" again; that falls through to the error below.
    if (o.status === rule.to && (!cancelledByVendor || o.cancelled_by === 'vendor')) return;
    if (!rule.from.includes(o.status)) {
      const now = o.status === 'CANCELLED' ? 'Cancelled' : o.status === 'NO_SHOW' ? 'No-show' : o.status.charAt(0) + o.status.slice(1).toLowerCase();
      throw new OrderError(409, `Cannot ${rule.label.toLowerCase()} this order: it is ${now}.`, {}, 'BAD_TRANSITION');
    }
    if (rule.afterWindow) {
      const ended = o.order_date < clock.date || (o.order_date === clock.date && clock.minutes >= Schedule.toMin(o.end_time));
      if (!ended) throw new OrderError(409, `A No-show can be marked only after the pickup window ends (${o.end_time}).`, {}, 'TOO_EARLY');
    }
    const r = await tx.run(`UPDATE orders SET status = ?, status_changed_at = ?,
        cancelled_by = ?, status_reason = ?
      WHERE order_id = ? AND status IN (${inList(rule.from)})`,
    [rule.to, stamp(clock), cancelledByVendor ? 'vendor' : null, rule.reason ? reason : null, o.order_id]);
    if (!r.changes) throw new OrderError(409, 'The order changed at the same moment. Refresh and try again.');
  });
  return getOrder(db, orderNumber, clock);
}

/** A vendor's view of their own stall's orders: today's, plus older ones still unresolved. */
async function vendorOrders(db, stallId, clock) {
  const rows = await db.all(`${ORDER_SELECT}
    WHERE o.stall_id = ? AND (o.order_date = ? OR (o.order_date < ? AND o.status IN (${inList(ACTIVE_STATUSES)})))
    ORDER BY o.order_date, p.start_time, o.order_id`, [stallId, clock.date, clock.date]);
  const out = [];
  for (const r of rows) {
    const order = await toOrder(db, r, clock);
    // The vendor needs to recognise the student at pickup, not their full ID.
    order.studentIdMasked = `••••••${String(r.student_id).slice(-4)}`;
    order.phone = r.phone;
    order.actions = Object.entries(VENDOR_ACTIONS).filter(([, a]) => a.from.includes(r.status)).map(([k]) => k);
    out.push(order);
  }
  return out;
}

/** A vendor marks one of their own menu items Sold Out (available = false) or available. */
async function setItemAvailability(db, stallId, itemId, available) {
  if (typeof available !== 'boolean') throw new OrderError(400, 'Say whether the item is available (true or false).');
  const r = await db.write((tx) => tx.run('UPDATE menu_items SET is_available = ? WHERE menu_item_id = ? AND stall_id = ?',
    [available ? 1 : 0, Number(itemId), stallId]));
  if (!r.changes) throw new OrderError(404, 'Menu item not found.');
  return { id: Number(itemId), isAvailable: available };
}

module.exports = {
  placeOrder, getOrder, cancelOrder, vendorAction, vendorOrders, setItemAvailability,
  validateCustomer, OrderError, MAX_QTY, VENDOR_ACTIONS, ACTIVE_STATUSES,
};
