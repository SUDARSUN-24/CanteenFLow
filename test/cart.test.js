// Browser cart rules (public/js/cart.js). Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const Cart = require('../public/js/cart');

const stallA = { id: 1, name: 'Siam Cafe', isOpen: true };
const stallB = { id: 2, name: 'Krua Sai Jai Cafe', isOpen: true };
const closed = { id: 6, name: 'Sky Lounge', isOpen: false };
const rice = { id: 10, name: 'Basil pork rice', price: 50, isAvailable: true };
const tea = { id: 11, name: 'Thai iced tea', price: 30, isAvailable: true };
const soldOut = { id: 12, name: 'Omelette rice', price: 35, isAvailable: false };
const otherStallDish = { id: 20, name: 'Shrimp fried rice', price: 110, isAvailable: true };

test('adding an available item puts quantity 1 in the order', () => {
  const { ok, cart } = Cart.addItem(Cart.empty(), stallA, rice);
  assert.equal(ok, true);
  assert.deepEqual(cart.items, [{ id: 10, name: 'Basil pork rice', price: 50, qty: 1 }]);
  assert.equal(cart.stallId, 1);
  assert.equal(Cart.total(cart), 50);
});

test('a Sold Out item cannot be added', () => {
  const before = Cart.empty();
  const r = Cart.addItem(before, stallA, soldOut);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'sold_out');
  assert.equal(r.cart.items.length, 0);
});

test('food from a closed stall cannot be added', () => {
  const r = Cart.addItem(Cart.empty(), closed, { ...rice, id: 60 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'closed');
});

test('adding from a second stall warns and leaves the order unchanged', () => {
  const { cart } = Cart.addItem(Cart.empty(), stallA, rice);
  const r = Cart.addItem(cart, stallB, otherStallDish);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'other_stall');
  assert.equal(r.cart, cart); // same order, nothing added
  assert.equal(Cart.count(r.cart), 1);
});

test('starting a new order replaces the old stall', () => {
  const r = Cart.startNewWith(stallB, otherStallDish);
  assert.equal(r.ok, true);
  assert.equal(r.cart.stallId, 2);
  assert.deepEqual(r.cart.items.map((i) => i.id), [20]);
});

test('changing a quantity updates the line total and order total', () => {
  let { cart } = Cart.addItem(Cart.empty(), stallA, rice);
  cart = Cart.addItem(cart, stallA, tea).cart;
  assert.equal(Cart.total(cart), 80);
  cart = Cart.setQty(cart, 10, 3);
  assert.equal(Cart.lineTotal(cart.items[0]), 150);
  assert.equal(Cart.total(cart), 180); // 3 x 50 + 1 x 30
  assert.equal(Cart.count(cart), 4);
});

test('removing items updates the total, and removing the last one empties the order', () => {
  let { cart } = Cart.addItem(Cart.empty(), stallA, rice);
  cart = Cart.addItem(cart, stallA, tea).cart;
  cart = Cart.removeItem(cart, 10);
  assert.equal(Cart.total(cart), 30);
  cart = Cart.setQty(cart, 11, 0); // quantity 0 also removes
  assert.deepEqual(cart, Cart.empty());
});

test('an empty order cannot continue to checkout', () => {
  assert.equal(Cart.canCheckout(Cart.empty()), false);
  assert.equal(Cart.canCheckout(Cart.addItem(Cart.empty(), stallA, rice).cart), true);
});

test('quantity is capped at 20 per item', () => {
  let { cart } = Cart.addItem(Cart.empty(), stallA, rice);
  cart = Cart.setQty(cart, 10, 99);
  assert.equal(cart.items[0].qty, 20);
  assert.equal(Cart.addItem(cart, stallA, rice).reason, 'max_qty');
});

test('prices are shown in Thai baht', () => {
  assert.equal(Cart.baht(50), '฿50');
  assert.equal(Cart.baht(1250), '฿1,250');
});
