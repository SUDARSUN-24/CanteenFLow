// Cart rules shared by the browser and the Node tests (US-02, US-04).
// Pure functions: each returns a NEW cart and never touches storage or the DOM.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Cart = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX_QTY = 20;

  /** An empty order. `token` is created when the order is first placed. */
  function empty() {
    return { stallId: null, stallName: null, items: [] };
  }

  /**
   * Add one of `item` from `stall`.
   * Returns { ok: true, cart } or { ok: false, reason, cart } where reason is
   * 'sold_out' | 'closed' | 'other_stall' | 'max_qty'. On 'other_stall' the caller
   * should warn the student and only call startNewWith() if they agree.
   */
  function addItem(cart, stall, item) {
    if (!item.isAvailable) return { ok: false, reason: 'sold_out', cart };
    if (!stall.acceptsOrders) return { ok: false, reason: 'closed', cart };
    if (cart.stallId !== null && cart.stallId !== stall.id && cart.items.length > 0) {
      return { ok: false, reason: 'other_stall', cart };
    }
    const existing = cart.items.find((i) => i.id === item.id);
    if (existing && existing.qty >= MAX_QTY) return { ok: false, reason: 'max_qty', cart };
    const items = existing
      ? cart.items.map((i) => (i.id === item.id ? { ...i, qty: i.qty + 1 } : i))
      : [...cart.items, { id: item.id, name: item.name, price: item.price, qty: 1 }];
    return { ok: true, cart: { stallId: stall.id, stallName: stall.name, items } };
  }

  /** Throw away the current order and start a new one at `stall` with `item`. */
  function startNewWith(stall, item) {
    return addItem(empty(), stall, item);
  }

  /** Set a quantity (1-20). 0 or less removes the item. */
  function setQty(cart, itemId, qty) {
    const n = Math.floor(Number(qty));
    if (!Number.isFinite(n)) return cart;
    if (n <= 0) return removeItem(cart, itemId);
    const clamped = Math.min(n, MAX_QTY);
    return { ...cart, items: cart.items.map((i) => (i.id === itemId ? { ...i, qty: clamped } : i)) };
  }

  function removeItem(cart, itemId) {
    const items = cart.items.filter((i) => i.id !== itemId);
    return items.length ? { ...cart, items } : empty();
  }

  const count = (cart) => cart.items.reduce((n, i) => n + i.qty, 0);
  const total = (cart) => cart.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const lineTotal = (line) => line.price * line.qty;

  /** An empty order cannot continue to checkout. */
  const canCheckout = (cart) => cart.items.length > 0 && cart.items.every((i) => i.qty >= 1);

  /** Format whole baht, e.g. 1250 -> "฿1,250". */
  const baht = (n) => '฿' + Number(n).toLocaleString('en-US');

  return { MAX_QTY, empty, addItem, startNewWith, setQty, removeItem, count, total, lineTotal, canCheckout, baht };
});
