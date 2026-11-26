// API and order rules against a fresh in-memory database. Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');

/** Start the app on a random port with a fresh seeded DB. */
async function start() {
  const db = openDb(':memory:');
  const server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (p) => {
    const res = await fetch(base + p);
    return { status: res.status, body: await res.json() };
  };
  const post = async (p, data) => {
    const res = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    return { status: res.status, body: await res.json() };
  };
  const orderCount = () => db.prepare('SELECT COUNT(*) AS n FROM orders').get().n;
  const id = (table, col, where, ...args) => db.prepare(`SELECT ${col} AS v FROM ${table} WHERE ${where}`).get(...args).v;
  return { db, get, post, orderCount, id, close: () => server.close() };
}

let ctx;
test.beforeEach(async () => { ctx = await start(); });
test.afterEach(() => ctx.close());

/** A valid order body for Siam Cafe, which tests then break one rule at a time. */
function validOrder(over = {}) {
  const stallId = ctx.id('stalls', 'stall_id', 'slug = ?', 'siam-cafe');
  return {
    submissionToken: crypto.randomUUID(),
    stallId,
    items: [
      { menuItemId: ctx.id('menu_items', 'menu_item_id', 'stall_id = ? AND name = ?', stallId, 'Stir-fried basil pork on rice'), quantity: 2 },
      { menuItemId: ctx.id('menu_items', 'menu_item_id', 'stall_id = ? AND name = ?', stallId, 'Thai iced tea'), quantity: 1 },
    ],
    pickupSlotId: ctx.id('pickup_slots', 'pickup_slot_id', 'stall_id = ? AND start_time = ?', stallId, '11:30'),
    customer: { name: 'Somchai', studentId: '6605142003', phone: '081-234-5678' },
    ...over,
  };
}

// ---- US-01 Find a suitable campus stall ----

test('stall list shows every stall with cuisine, open/closed status and prep time', async () => {
  const { status, body } = await ctx.get('/api/stalls');
  assert.equal(status, 200);
  assert.ok(body.stalls.length >= 6);
  const closed = body.stalls.filter((s) => !s.isOpen);
  assert.equal(closed.length, 1);
  assert.equal(closed[0].name, 'Sky Lounge Restaurant');
  for (const s of body.stalls) {
    assert.ok(s.cuisine);
    assert.ok(s.prepMinutes > 0);
  }
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

test('search with no match returns an empty list (UI shows a no-results message)', async () => {
  const { status, body } = await ctx.get('/api/stalls?q=pizza');
  assert.equal(status, 200);
  assert.deepEqual(body.stalls, []);
});

test('pickup-time filter hides closed stalls and stalls whose slot is unavailable', async () => {
  const { body } = await ctx.get('/api/stalls?pickup=12:00');
  const slugs = body.stalls.map((s) => s.slug);
  assert.ok(!slugs.includes('sky-lounge'), 'closed stall is hidden');
  assert.ok(!slugs.includes('siam-cafe'), 'Siam Cafe 12:00 slot is unavailable');
  assert.ok(!slugs.includes('main-cafeteria-japanese'), 'Japanese 12:00 slot is unavailable');
  assert.ok(slugs.includes('krua-sai-jai'));
  assert.equal((await ctx.get('/api/stalls?pickup=noon')).status, 400);
});

// ---- US-02 Choose available food ----

test('menu shows price, image and availability, with Sold Out items marked', async () => {
  const { body } = await ctx.get('/api/stalls/siam-cafe');
  const omelette = body.menu.find((m) => m.name === 'Thai omelette on rice');
  assert.equal(omelette.isAvailable, false);
  for (const m of body.menu) {
    assert.ok(Number.isInteger(m.price) && m.price > 0);
    assert.match(m.image, /^\/img\/.+\.svg$/);
  }
  const all = (await ctx.get('/api/stalls')).body.stalls;
  let soldOut = 0;
  for (const s of all) soldOut += (await ctx.get(`/api/stalls/${s.id}`)).body.menu.filter((m) => !m.isAvailable).length;
  assert.ok(soldOut >= 2, 'at least two Sold Out items are seeded');
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
  order.items.push({ menuItemId: ctx.id('menu_items', 'menu_item_id', 'name = ?', 'Thai omelette on rice'), quantity: 1 });
  const { status, body } = await ctx.post('/api/orders', order);
  assert.equal(status, 409);
  assert.match(body.error, /Sold Out/);
  assert.equal(ctx.orderCount(), 0);
});

test('one order is for one stall only', async () => {
  const order = validOrder();
  order.items.push({ menuItemId: ctx.id('menu_items', 'menu_item_id', 'name = ?', 'Bibimbap'), quantity: 1 });
  const { status, body } = await ctx.post('/api/orders', order);
  assert.equal(status, 409);
  assert.match(body.error, /one stall/);
  assert.equal(ctx.orderCount(), 0);
});

test('an unavailable pickup slot is rejected and creates no order', async () => {
  const stallId = ctx.id('stalls', 'stall_id', 'slug = ?', 'siam-cafe');
  const slot = ctx.id('pickup_slots', 'pickup_slot_id', 'stall_id = ? AND is_available = 0', stallId);
  const { status, body } = await ctx.post('/api/orders', validOrder({ pickupSlotId: slot }));
  assert.equal(status, 409);
  assert.ok(body.fields.pickupSlotId);
  assert.equal(ctx.orderCount(), 0);
});

test('a slot from another stall is rejected', async () => {
  const other = ctx.id('pickup_slots', 'pickup_slot_id', 'stall_id = ? AND is_available = 1',
    ctx.id('stalls', 'stall_id', 'slug = ?', 'krua-sai-jai'));
  const { status } = await ctx.post('/api/orders', validOrder({ pickupSlotId: other }));
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
  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [200, 201]);
  assert.equal(first.body.order.orderNumber, second.body.order.orderNumber);
  assert.equal(ctx.orderCount(), 1);
  const dup = [first, second].find((r) => r.status === 200);
  assert.equal(dup.body.duplicate, true);
});

test('a closed stall cannot take orders', async () => {
  const stallId = ctx.id('stalls', 'stall_id', 'slug = ?', 'sky-lounge');
  const { status, body } = await ctx.post('/api/orders', validOrder({
    stallId,
    items: [{ menuItemId: ctx.id('menu_items', 'menu_item_id', 'stall_id = ? AND is_available = 1', stallId), quantity: 1 }],
    pickupSlotId: ctx.id('pickup_slots', 'pickup_slot_id', 'stall_id = ? AND is_available = 1', stallId),
  }));
  assert.equal(status, 409);
  assert.match(body.error, /closed/);
  assert.equal(ctx.orderCount(), 0);
});

test('a placed order can be looked up by its number', async () => {
  const { body } = await ctx.post('/api/orders', validOrder());
  const n = body.order.orderNumber;
  const found = await ctx.get(`/api/orders/${n}`);
  assert.equal(found.status, 200);
  assert.equal(found.body.order.stall.name, 'Siam Cafe');
  assert.equal(found.body.order.items.length, 2);
  assert.equal((await ctx.get('/api/orders/CF-NOPE00')).status, 404);
});
