// Sprint 2 stories (numbers from the team's Trello board): US-16 Cancel my order,
// US-17 Vendor accepts or rejects an order, US-18 Vendor marks a no-show,
// US-19 Limit orders per student, US-20 Slot capacity.
// Every number comes from src/config.js, so these tests follow the config.
// Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/config');
const { demoVendorPin } = require('../src/seed');
const { useApp, newStudentId } = require('./helpers');

const app = useApp();
let ctx;
test.beforeEach(() => { ctx = app(); });

const place = (over, studentId) => ctx.post('/api/orders', ctx.validOrder(over, studentId));
const cancel = (n, studentId) => ctx.post(`/api/orders/${n}/cancel`, { studentId });
const getOrder = async (n) => (await ctx.get(`/api/orders/${n}`)).body.order;

/** Sign in as the vendor of `slug`; returns helpers that send the token. */
async function vendorOf(slug) {
  const stallId = ctx.stallId(slug);
  const { status, body } = await ctx.post('/api/vendor/login', { stallId, pin: demoVendorPin(stallId) });
  assert.equal(status, 200);
  const auth = { Authorization: `Bearer ${body.token}` };
  return {
    orders: () => ctx.get('/api/vendor/orders', auth),
    act: (n, action, reason) => ctx.post(`/api/vendor/orders/${n}/${action}`, reason === undefined ? {} : { reason }, auth),
    menu: () => ctx.get('/api/vendor/menu', auth),
    setAvailable: (itemId, available) => ctx.post(`/api/vendor/menu/${itemId}/availability`, { available }, auth),
  };
}

/** Fill a Japanese-counter slot to capacity with orders from different students. */
async function fillSlot(time) {
  const order = () => ctx.validOrder({
    stallId: ctx.stallId('main-cafeteria-japanese'),
    items: [{ menuItemId: ctx.itemId('Salmon rice bowl'), quantity: 1 }],
    pickupSlotId: ctx.slotId('main-cafeteria-japanese', time),
  });
  const placed = [];
  for (let i = 0; i < config.SLOT_CAPACITY; i++) {
    const o = order();
    const r = await ctx.post('/api/orders', o);
    assert.equal(r.status, 201);
    placed.push({ number: r.body.order.orderNumber, studentId: o.customer.studentId });
  }
  return { placed, order };
}

const slotInMenu = async (slug, time) => (await ctx.get(`/api/stalls/${ctx.stallId(slug)}`)).body.slots.find((s) => s.start === time);

// ---- Config ----

test('rule numbers come from src/config.js and are published at /api/config', async () => {
  assert.equal(config.SLOT_CAPACITY, 5);
  assert.equal(config.MAX_ACTIVE_ORDERS_PER_STUDENT, 2);
  assert.equal(config.NO_SHOW_LIMIT, 3);
  assert.deepEqual(config.CANCEL_WINDOW_STATUSES, ['RECEIVED']);
  const { body } = await ctx.get('/api/config');
  assert.deepEqual(body.rules, JSON.parse(JSON.stringify(config)));
});

// US-19 Limit orders per student: the student ID that the limits are applied to.
test('ordering needs a demo student ID of exactly 10 digits', async () => {
  for (const bad of ['660514200', '66051420031', '66O5142003', '']) {
    const r = await place({}, bad);
    assert.equal(r.status, 400, bad);
    assert.ok(r.body.fields.studentId);
  }
  assert.equal((await place({}, '6605142003')).status, 201);
  assert.equal(ctx.orderCount(), 1);
});

// ---- US-16 Cancel my order ----

test('a student can cancel while the order is Received; it shows who cancelled and when', async () => {
  const sid = newStudentId();
  const n = (await place({}, sid)).body.order.orderNumber;
  ctx.at('10:05');
  const r = await cancel(n, sid);
  assert.equal(r.status, 200);
  assert.equal(r.body.order.status, 'CANCELLED');
  assert.equal(r.body.order.cancelledBy, 'student');
  assert.equal(r.body.order.statusChangedAt, '2026-11-24 10:05');
  assert.equal(r.body.order.canCancel, false);
  assert.equal((await getOrder(n)).status, 'CANCELLED');
});

test('cancelling after the stall starts Preparing is refused with a clear message', async () => {
  const sid = newStudentId();
  const n = (await place({}, sid)).body.order.orderNumber;
  const vendor = await vendorOf('siam-cafe');
  assert.equal((await vendor.act(n, 'accept')).body.order.status, 'PREPARING');
  const r = await cancel(n, sid);
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'TOO_LATE');
  assert.match(r.body.error, /Too late to cancel.*preparing/);
  assert.equal((await getOrder(n)).status, 'PREPARING');
});

test('only the student who placed the order can cancel it', async () => {
  const n = (await place({}, newStudentId())).body.order.orderNumber;
  assert.equal((await cancel(n, newStudentId())).status, 403);
  assert.equal((await cancel(n, 'abc')).status, 400);
  assert.equal((await cancel('CF-NOPE00', newStudentId())).status, 404);
  assert.equal((await getOrder(n)).status, 'RECEIVED');
});

test('pressing Cancel twice (or at the same moment) cancels once and breaks nothing', async () => {
  const sid = newStudentId();
  const n = (await place({}, sid)).body.order.orderNumber;
  const results = await Promise.all([cancel(n, sid), cancel(n, sid), cancel(n, sid)]);
  assert.deepEqual(results.map((r) => r.status), [200, 200, 200]);
  assert.ok(results.every((r) => r.body.order.status === 'CANCELLED'));
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'CANCELLED'").get().n, 1);
  // The student can order again straight away.
  assert.equal((await place({}, sid)).status, 201);
});

test('a student cancel and a vendor accept at the same moment: exactly one wins', async () => {
  const sid = newStudentId();
  const n = (await place({}, sid)).body.order.orderNumber;
  const vendor = await vendorOf('siam-cafe');
  const [c, a] = await Promise.all([cancel(n, sid), vendor.act(n, 'accept')]);
  assert.equal([c.status, a.status].filter((s) => s === 200).length, 1);
  const final = (await getOrder(n)).status;
  assert.ok(final === (c.status === 200 ? 'CANCELLED' : 'PREPARING'));
});

// ---- US-20 Slot capacity ----

test('a full slot becomes unavailable and new orders for it are refused', async () => {
  const { order } = await fillSlot('11:00');
  const slot = await slotInMenu('main-cafeteria-japanese', '11:00');
  assert.equal(slot.isAvailable, false);
  assert.equal(slot.reason, 'Full');
  assert.equal(slot.spotsLeft, 0);
  const extra = await ctx.post('/api/orders', order());
  assert.equal(extra.status, 409);
  assert.match(extra.body.error, /full/);
});

test('cancelling an order releases its place in the slot', async () => {
  const { placed, order } = await fillSlot('11:00');
  assert.equal((await ctx.post('/api/orders', order())).status, 409);
  assert.equal((await cancel(placed[0].number, placed[0].studentId)).status, 200);
  const slot = await slotInMenu('main-cafeteria-japanese', '11:00');
  assert.equal(slot.isAvailable, true);
  assert.equal(slot.spotsLeft, 1);
  assert.equal((await ctx.post('/api/orders', order())).status, 201);
  assert.equal((await ctx.post('/api/orders', order())).status, 409);
});

test('a vendor rejection also releases the slot', async () => {
  const { placed, order } = await fillSlot('11:15');
  const vendor = await vendorOf('main-cafeteria-japanese');
  assert.equal((await vendor.act(placed[1].number, 'reject', 'Rice cooker broken')).status, 200);
  assert.equal((await ctx.post('/api/orders', order())).status, 201);
});

// ---- US-19 Limit orders per student ----

test(`a student can hold at most ${config.MAX_ACTIVE_ORDERS_PER_STUDENT} active orders`, async () => {
  const sid = newStudentId();
  const first = await place({}, sid);
  for (let i = 1; i < config.MAX_ACTIVE_ORDERS_PER_STUDENT; i++) assert.equal((await place({}, sid)).status, 201);
  const over = await place({}, sid);
  assert.equal(over.status, 409);
  assert.equal(over.body.code, 'ACTIVE_LIMIT');
  assert.match(over.body.error, new RegExp(`at most ${config.MAX_ACTIVE_ORDERS_PER_STUDENT}`));
  assert.equal(ctx.orderCount(), config.MAX_ACTIVE_ORDERS_PER_STUDENT);
  // Another student is not affected.
  assert.equal((await place({}, newStudentId())).status, 201);
  // Cancelling one frees a place for the same student.
  assert.equal((await cancel(first.body.order.orderNumber, sid)).status, 200);
  assert.equal((await place({}, sid)).status, 201);
});

test('collected orders no longer count toward the per-student limit', async () => {
  const sid = newStudentId();
  const vendor = await vendorOf('siam-cafe');
  const numbers = [];
  for (let i = 0; i < config.MAX_ACTIVE_ORDERS_PER_STUDENT; i++) numbers.push((await place({}, sid)).body.order.orderNumber);
  assert.equal((await place({}, sid)).status, 409);
  for (const action of ['accept', 'ready', 'collected']) assert.equal((await vendor.act(numbers[0], action)).status, 200);
  assert.equal((await place({}, sid)).status, 201);
});

test('Place Order sent twice still returns the same order, even at the limit', async () => {
  const sid = newStudentId();
  await place({}, sid);
  const order = ctx.validOrder({}, sid);
  const first = await ctx.post('/api/orders', order); // reaches the limit of 2
  const again = await ctx.post('/api/orders', order); // same token: not a new order, not a limit error
  assert.equal(first.status, 201);
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
  assert.equal(again.body.order.orderNumber, first.body.order.orderNumber);
});

// ---- US-18 Vendor marks a no-show (and the no-show limit) ----

/** Place an order and take it through to No-show (after its pickup window). */
async function noShow(sid, vendor) {
  ctx.at('10:00');
  const n = (await place({}, sid)).body.order.orderNumber;
  for (const action of ['accept', 'ready']) assert.equal((await vendor.act(n, action)).status, 200);
  ctx.at('11:45'); // the 11:30-11:45 window has ended
  const r = await vendor.act(n, 'no_show');
  assert.equal(r.status, 200);
  assert.equal(r.body.order.status, 'NO_SHOW');
  return n;
}

test('a No-show can be marked only on a Ready order after its pickup window', async () => {
  const vendor = await vendorOf('siam-cafe');
  const n = (await place({}, newStudentId())).body.order.orderNumber;
  assert.equal((await vendor.act(n, 'no_show')).status, 409, 'not Ready yet');
  await vendor.act(n, 'accept');
  await vendor.act(n, 'ready');
  ctx.at('11:40');
  const early = await vendor.act(n, 'no_show');
  assert.equal(early.status, 409);
  assert.match(early.body.error, /after the pickup window ends \(11:45\)/);
  ctx.at('11:45');
  assert.equal((await vendor.act(n, 'no_show')).status, 200);
  assert.equal((await getOrder(n)).status, 'NO_SHOW');
});

test(`after ${config.NO_SHOW_LIMIT} No-shows a student cannot order and sees a polite message`, async () => {
  const sid = newStudentId();
  const vendor = await vendorOf('siam-cafe');
  for (let i = 0; i < config.NO_SHOW_LIMIT - 1; i++) await noShow(sid, vendor);
  ctx.at('10:00');
  const stillOk = await place({}, sid);
  assert.equal(stillOk.status, 201, 'one below the limit can still order');
  assert.equal((await cancel(stillOk.body.order.orderNumber, sid)).status, 200);

  await noShow(sid, vendor);
  ctx.at('10:00');
  const before = ctx.orderCount();
  const blocked = await place({}, sid);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, 'NO_SHOW_LIMIT');
  assert.match(blocked.body.error, /Sorry.*contact the stall/);
  assert.equal(ctx.orderCount(), before, 'no order is created');
  assert.equal((await place({}, newStudentId())).status, 201, 'other students are not affected');
});

// ---- US-17 Vendor accepts or rejects an order ----

test('vendor sign-in needs the right PIN for that stall', async () => {
  const id = ctx.stallId('siam-cafe');
  assert.equal((await ctx.post('/api/vendor/login', { stallId: id, pin: '0000' })).status, 401);
  assert.equal((await ctx.post('/api/vendor/login', { stallId: id, pin: demoVendorPin(id + 1) })).status, 401);
  assert.equal((await ctx.get('/api/vendor/orders')).status, 401);
  assert.equal((await ctx.get('/api/vendor/orders', { Authorization: 'Bearer 1.9999999999999.forged' })).status, 401);
  assert.equal((await ctx.post('/api/vendor/login', { stallId: id, pin: demoVendorPin(id) })).status, 200);
});

test('a vendor sees only their own stall\'s orders and cannot touch another stall\'s', async () => {
  const cafe = (await place()).body.order.orderNumber;
  const korean = (await place({
    stallId: ctx.stallId('main-cafeteria-korean'),
    items: [{ menuItemId: ctx.itemId('Bibimbap'), quantity: 1 }],
    pickupSlotId: ctx.slotId('main-cafeteria-korean', '11:30'),
  })).body.order.orderNumber;
  const vendor = await vendorOf('siam-cafe');
  const { body } = await vendor.orders();
  assert.deepEqual(body.orders.map((o) => o.orderNumber), [cafe]);
  assert.match(body.orders[0].studentIdMasked, /^•+\d{4}$/);
  assert.ok(!JSON.stringify(body).includes('"studentId"'), 'full student IDs are not sent');
  // The other stall's order looks like it does not exist.
  assert.equal((await vendor.act(korean, 'accept')).status, 404);
  assert.equal((await vendor.act(korean, 'reject', 'x')).status, 404);
  assert.equal((await getOrder(korean)).status, 'RECEIVED');
});

test('vendor Reject needs a reason, and the student sees it', async () => {
  const n = (await place()).body.order.orderNumber;
  const vendor = await vendorOf('siam-cafe');
  for (const reason of [undefined, '', '   ']) {
    const r = await vendor.act(n, 'reject', reason);
    assert.equal(r.status, 400);
    assert.ok(r.body.fields.reason);
  }
  assert.equal((await vendor.act(n, 'reject', 'x'.repeat(config.REASON_MAX_CHARS + 1))).status, 400);
  assert.equal((await getOrder(n)).status, 'RECEIVED');
  const ok = await vendor.act(n, 'reject', 'Out of pork today, sorry');
  assert.equal(ok.status, 200);
  const seen = await getOrder(n);
  assert.equal(seen.status, 'CANCELLED');
  assert.equal(seen.cancelledBy, 'vendor');
  assert.equal(seen.statusReason, 'Out of pork today, sorry');
});

test('vendor moves an order Received -> Preparing -> Ready -> Collected; wrong steps are refused', async () => {
  const n = (await place()).body.order.orderNumber;
  const vendor = await vendorOf('siam-cafe');
  assert.equal((await vendor.act(n, 'ready')).status, 409, 'cannot skip Preparing');
  assert.equal((await vendor.act(n, 'collected')).status, 409);
  assert.equal((await vendor.act(n, 'accept')).body.order.status, 'PREPARING');
  assert.equal((await vendor.act(n, 'accept')).status, 200, 'pressing Accept twice is harmless');
  assert.equal((await vendor.act(n, 'reject', 'too late')).status, 409, 'Reject is only for new orders');
  assert.equal((await vendor.act(n, 'ready')).body.order.status, 'READY');
  assert.equal((await vendor.act(n, 'collected')).body.order.status, 'COLLECTED');
  assert.equal((await vendor.act(n, 'cancel', 'x')).status, 409);
  assert.equal((await vendor.act(n, 'explode')).status, 400);
});

test('a vendor can cancel a Preparing order with a reason, shown to the student', async () => {
  const n = (await place()).body.order.orderNumber;
  const vendor = await vendorOf('siam-cafe');
  await vendor.act(n, 'accept');
  assert.equal((await vendor.act(n, 'cancel')).status, 400);
  assert.equal((await vendor.act(n, 'cancel', 'Gas ran out')).status, 200);
  const seen = await getOrder(n);
  assert.deepEqual([seen.status, seen.cancelledBy, seen.statusReason], ['CANCELLED', 'vendor', 'Gas ran out']);
});

// ---- US-17 Vendor accepts or rejects an order: Sold Out switch ----

test('vendor Sold Out switch stops new orders for that item, and back again', async () => {
  const vendor = await vendorOf('siam-cafe');
  const basil = ctx.itemId('Stir-fried basil pork on rice');
  assert.equal((await vendor.setAvailable(basil, false)).status, 200);
  const menu = (await ctx.get(`/api/stalls/${ctx.stallId('siam-cafe')}`)).body.menu;
  assert.equal(menu.find((m) => m.id === basil).isAvailable, false);
  const refused = await place();
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /Sold Out/);
  assert.equal(ctx.orderCount(), 0);
  assert.equal((await vendor.setAvailable(basil, true)).status, 200);
  assert.equal((await place()).status, 201);
});

test('a vendor cannot change another stall\'s menu', async () => {
  const vendor = await vendorOf('siam-cafe');
  const bibimbap = ctx.itemId('Bibimbap');
  assert.equal((await vendor.setAvailable(bibimbap, false)).status, 404);
  assert.equal((await vendor.setAvailable(ctx.itemId('Thai iced tea'), 'no')).status, 400);
  assert.equal(ctx.id('menu_items', 'is_available', 'menu_item_id = ?', bibimbap), 1);
  const own = (await vendor.menu()).body.menu;
  assert.ok(own.length > 0 && own.every((m) => typeof m.isAvailable === 'boolean'));
  assert.ok(!own.some((m) => m.id === bibimbap));
});
