// API and order rules against a fresh in-memory database. Run: npm test
// The clock is fixed so results never depend on when the tests run:
// Tuesday 24 November 2026, 10:00 Bangkok time.
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/config');
const { useApp, MIN, TUESDAY_10AM } = require('./helpers');

const app = useApp();
let ctx;
test.beforeEach(() => { ctx = app(); });

const stallId = (slug) => ctx.stallId(slug);
const itemId = (name) => ctx.itemId(name);
const slotId = (slug, time) => ctx.slotId(slug, time);
const validOrder = (over) => ctx.validOrder(over);

// ---- US-01 Find a suitable campus stall ----

test('stall list shows cuisine, open/closed status and prep time for every stall', async () => {
  const { status, body } = await ctx.get('/api/stalls');
  assert.equal(status, 200);
  assert.ok(body.stalls.length >= 6);
  const closed = body.stalls.filter((s) => !s.acceptsOrders);
  assert.deepEqual(closed.map((s) => s.slug), ['sky-lounge']);
  assert.equal(closed[0].state, 'closed_today');
  for (const s of body.stalls) {
    assert.ok(s.cuisine && s.stateText && s.prepMinutes > 0);
  }
  assert.equal(body.stalls.at(-1).slug, 'sky-lounge', 'closed stalls are listed last');
});

test('search finds stalls by stall name and by dish name (English or Thai)', async () => {
  const byStall = await ctx.get('/api/stalls?q=siam%20cafe');
  assert.deepEqual(byStall.body.stalls.map((s) => s.slug), ['siam-cafe']);

  const byDish = await ctx.get('/api/stalls?q=tteok');
  assert.deepEqual(byDish.body.stalls.map((s) => s.slug), ['main-cafeteria-korean']);
  assert.deepEqual(byDish.body.stalls[0].matchedDishes, ['Tteokbokki']);

  const thai = await ctx.get('/api/stalls?q=' + encodeURIComponent('ก๋วยเตี๋ยวเรือ'));
  assert.deepEqual(thai.body.stalls.map((s) => s.slug), ['thai-pavilion-noodles']);
});

test('search with no match returns an empty list (the page shows a no-results message)', async () => {
  const { status, body } = await ctx.get('/api/stalls?q=pizza');
  assert.equal(status, 200);
  assert.deepEqual(body.stalls, []);
});

test('pickup-time filter keeps only stalls with an available slot at that time', async () => {
  const { body } = await ctx.get('/api/stalls?pickup=12:00');
  const slugs = body.stalls.map((s) => s.slug);
  assert.ok(!slugs.includes('sky-lounge'), 'closed stall is hidden');
  assert.ok(!slugs.includes('siam-cafe'), 'Siam Cafe paused its 12:00 slot');
  assert.ok(!slugs.includes('main-cafeteria-japanese'), 'Japanese counter paused its 12:00 slot');
  assert.ok(slugs.includes('krua-sai-jai'));
  assert.equal((await ctx.get('/api/stalls?pickup=noon')).status, 400);
});

test('opening hours follow the Bangkok clock (before opening, open, after closing, Sunday)', async () => {
  const state = async () => Object.fromEntries((await ctx.get('/api/stalls')).body.stalls.map((s) => [s.slug, s.state]));
  ctx.at('07:30');
  assert.equal((await state())['siam-cafe'], 'opens_later');
  ctx.at('10:00');
  assert.equal((await state())['siam-cafe'], 'open');
  ctx.at('16:30');
  assert.equal((await state())['siam-cafe'], 'closed_now');
  ctx.clock.ms = TUESDAY_10AM + 5 * 24 * 60 * MIN; // Sunday
  assert.ok(Object.values(await state()).every((s) => s === 'closed_day' || s === 'closed_today'));
});

// ---- US-02 Choose available food ----

test('menu shows price, image and availability, with Sold Out items marked', async () => {
  const { body } = await ctx.get('/api/stalls/siam-cafe');
  assert.equal(body.menu.find((m) => m.name === 'Thai omelette on rice').isAvailable, false);
  for (const m of body.menu) {
    assert.ok(Number.isInteger(m.price) && m.price > 0);
    assert.match(m.image, /^\/img\/.+\.svg$/);
  }
  const soldOut = ctx.db.prepare('SELECT COUNT(*) AS n FROM menu_items WHERE is_available = 0').get().n;
  assert.ok(soldOut >= 2, 'at least two Sold Out items are seeded');
});

test('menu page lists only pickup windows that have not started', async () => {
  ctx.at('11:20');
  const { body } = await ctx.get('/api/stalls/siam-cafe');
  assert.ok(body.slots.every((s) => s.start > '11:20'));
  const first = body.slots[0];
  assert.equal(first.start, '11:30');
  assert.equal(first.isAvailable, true, '11:30 is 10 min away = exactly the prep time');
  assert.equal(body.slots.find((s) => s.start === '12:00').reason, 'Paused');
});

// ---- US-05 Place an order for a pickup time ----

test('a valid order gets a unique order number and status Received', async () => {
  const a = await ctx.post('/api/orders', validOrder());
  const b = await ctx.post('/api/orders', validOrder());
  assert.equal(a.status, 201);
  assert.equal(a.body.order.status, 'RECEIVED');
  assert.match(a.body.order.orderNumber, /^CF-[A-Z0-9]{6}$/);
  assert.notEqual(a.body.order.orderNumber, b.body.order.orderNumber);
  assert.equal(ctx.orderCount(), 2);
});

test('the total is calculated on the server from database prices', async () => {
  const body = validOrder();
  body.items = body.items.map((i) => ({ ...i, price: 1 })); // a tampered price is ignored
  const { body: res } = await ctx.post('/api/orders', body);
  assert.equal(res.order.total, 2 * 50 + 1 * 30);
});

test('an empty order is rejected and creates no order', async () => {
  const { status, body } = await ctx.post('/api/orders', validOrder({ items: [] }));
  assert.equal(status, 400);
  assert.ok(body.fields.items);
  assert.equal(ctx.orderCount(), 0);
});

test('a Sold Out item is rejected and creates no order', async () => {
  const order = validOrder();
  order.items.push({ menuItemId: itemId('Thai omelette on rice'), quantity: 1 });
  const { status, body } = await ctx.post('/api/orders', order);
  assert.equal(status, 409);
  assert.match(body.error, /Sold Out/);
  assert.equal(ctx.orderCount(), 0);
});

test('one order is for one stall only', async () => {
  const order = validOrder();
  order.items.push({ menuItemId: itemId('Bibimbap'), quantity: 1 });
  const { status, body } = await ctx.post('/api/orders', order);
  assert.equal(status, 409);
  assert.match(body.error, /one stall/);
  assert.equal(ctx.orderCount(), 0);
});

test('a paused (unavailable) pickup slot is rejected and creates no order', async () => {
  const { status, body } = await ctx.post('/api/orders', validOrder({ pickupSlotId: slotId('siam-cafe', '12:00') }));
  assert.equal(status, 409);
  assert.ok(body.fields.pickupSlotId);
  assert.equal(ctx.orderCount(), 0);
});

test('a slot that has passed, or is too soon to cook, is unavailable', async () => {
  ctx.at('11:25');
  const past = await ctx.post('/api/orders', validOrder({ pickupSlotId: slotId('siam-cafe', '11:15') }));
  assert.equal(past.status, 409);
  assert.match(past.body.error, /past/);
  const tooSoon = await ctx.post('/api/orders', validOrder({ pickupSlotId: slotId('siam-cafe', '11:30') }));
  assert.equal(tooSoon.status, 409);
  assert.match(tooSoon.body.error, /too soon/);
  assert.equal(ctx.orderCount(), 0);
});

test('a slot becomes unavailable when it is full', async () => {
  const slot = slotId('main-cafeteria-japanese', '11:00'); // capacity = config.SLOT_CAPACITY
  const order = () => validOrder({
    stallId: stallId('main-cafeteria-japanese'),
    items: [{ menuItemId: itemId('Chicken teriyaki rice bowl'), quantity: 1 }],
    pickupSlotId: slot,
  });
  for (let i = 0; i < config.SLOT_CAPACITY; i++) assert.equal((await ctx.post('/api/orders', order())).status, 201);
  const extra = await ctx.post('/api/orders', order());
  assert.equal(extra.status, 409);
  assert.match(extra.body.error, /full/);
  assert.equal(ctx.orderCount(), config.SLOT_CAPACITY);
});

test('a slot from another stall is rejected', async () => {
  const { status } = await ctx.post('/api/orders', validOrder({ pickupSlotId: slotId('krua-sai-jai', '11:30') }));
  assert.equal(status, 409);
  assert.equal(ctx.orderCount(), 0);
});

test('missing required fields are reported one by one and create no order', async () => {
  const { status, body } = await ctx.post('/api/orders', validOrder({
    customer: { name: '  ', studentId: '', phone: '' },
    pickupSlotId: null,
  }));
  assert.equal(status, 400);
  assert.deepEqual(Object.keys(body.fields).sort(), ['name', 'phone', 'pickupSlotId', 'studentId']);
  assert.equal(ctx.orderCount(), 0);
});

test('invalid student ID, phone or quantity are rejected', async () => {
  const bad = [
    validOrder({ customer: { name: 'A', studentId: '66-05', phone: '0812345678' } }),
    validOrder({ customer: { name: 'A', studentId: '6605142003', phone: 'call me' } }),
    validOrder({ customer: { name: 'A', studentId: '6605142003', phone: '-------' } }),
    validOrder({ items: [{ menuItemId: 1, quantity: 0 }] }),
    validOrder({ items: [{ menuItemId: 1, quantity: 21 }] }),
    validOrder({ items: [{ menuItemId: 1, quantity: 1.5 }] }),
  ];
  for (const order of bad) assert.equal((await ctx.post('/api/orders', order)).status, 400);
  assert.equal(ctx.orderCount(), 0);
});

test('pressing Place Order twice (same token) creates only one order', async () => {
  const order = validOrder();
  const [first, second] = await Promise.all([ctx.post('/api/orders', order), ctx.post('/api/orders', order)]);
  assert.deepEqual([first.status, second.status].sort(), [200, 201]);
  assert.equal(first.body.order.orderNumber, second.body.order.orderNumber);
  assert.equal(ctx.orderCount(), 1);
  assert.equal([first, second].find((r) => r.status === 200).body.duplicate, true);
});

test('closed stalls cannot take orders (vendor closed today, or after hours)', async () => {
  const sky = stallId('sky-lounge');
  const closedToday = await ctx.post('/api/orders', validOrder({
    stallId: sky,
    items: [{ menuItemId: itemId('Caesar salad'), quantity: 1 }],
    pickupSlotId: slotId('sky-lounge', '12:00'),
  }));
  assert.equal(closedToday.status, 409);
  assert.match(closedToday.body.error, /closed/);

  ctx.at('16:30');
  const afterHours = await ctx.post('/api/orders', validOrder({ pickupSlotId: slotId('siam-cafe', '15:45') }));
  assert.equal(afterHours.status, 409);
  assert.equal(ctx.orderCount(), 0);
});

test('students can pre-order before a stall opens', async () => {
  ctx.at('07:30');
  const { status, body } = await ctx.post('/api/orders', validOrder({ pickupSlotId: slotId('siam-cafe', '09:00') }));
  assert.equal(status, 201);
  assert.equal(body.order.status, 'RECEIVED');
});

test('order status is set by the vendor, not by the clock', async () => {
  // Sprint 1 moved the status on a timer. Now the stall's vendor moves it, so
  // passing time alone leaves the order Received (see test/rules.test.js).
  const { body } = await ctx.post('/api/orders', validOrder()); // 11:30 pickup, 10 min prep
  const n = body.order.orderNumber;
  const status = async () => (await ctx.get(`/api/orders/${n}`)).body.order.status;
  assert.equal(await status(), 'RECEIVED');
  ctx.at('11:31');
  assert.equal(await status(), 'RECEIVED');
  assert.equal((await ctx.get('/api/orders/CF-NOPE00')).status, 404);
});

test('the demo clock header moves the server clock (bounded)', async () => {
  const sunday = await ctx.get('/api/clock', { 'X-Clock-Offset': String(5 * 24 * 60 * MIN) });
  assert.equal(sunday.body.clock.weekday, 0);
  const huge = await ctx.get('/api/clock', { 'X-Clock-Offset': String(365 * 24 * 60 * MIN) });
  assert.equal(huge.body.clock.label, 'Wed 10:00', 'offset is capped at 8 days');
  const junk = await ctx.get('/api/clock', { 'X-Clock-Offset': 'abc' });
  assert.equal(junk.body.clock.label, 'Tue 10:00');
});

test('orders arriving at the same moment never overbook a slot', async () => {
  const order = () => validOrder({
    stallId: stallId('main-cafeteria-japanese'),
    items: [{ menuItemId: itemId('Salmon rice bowl'), quantity: 1 }],
    pickupSlotId: slotId('main-cafeteria-japanese', '13:00'), // capacity = config.SLOT_CAPACITY
  });
  const tries = config.SLOT_CAPACITY + 3;
  const results = await Promise.all(Array.from({ length: tries }, () => ctx.post('/api/orders', order())));
  assert.equal(results.filter((r) => r.status === 201).length, config.SLOT_CAPACITY);
  assert.equal(results.filter((r) => r.status === 409).length, 3);
  assert.equal(ctx.orderCount(), config.SLOT_CAPACITY);
});
