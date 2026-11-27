// Order page (US-04 check and correct, US-05 place for a pickup time).
(function () {
  const { api, el, store, toast, myOrders, rules } = CF;
  let studentIdDigits = null; // from /api/config (src/config.js)
  rules().then((r) => {
    if (!r) return;
    studentIdDigits = r.STUDENT_ID_DIGITS;
    const hint = document.getElementById('studentId-hint');
    if (hint) hint.textContent = `Demo: any ${r.STUDENT_ID_DIGITS} digits. Used to trace your order and apply the order limits.`;
  });
  const DETAILS_KEY = 'canteenflow:details';
  const TOKEN_KEY = 'canteenflow:submitToken';

  const linesBox = document.getElementById('lines');
  const totalEl = document.getElementById('total');
  const slotsBox = document.getElementById('slots');
  const placeBtn = document.getElementById('place');
  const why = document.getElementById('why');
  const alertBox = document.getElementById('alert');
  const form = document.getElementById('checkout');
  const fields = ['name', 'studentId', 'phone'];

  let stall = null;
  let menuById = new Map();
  let slots = [];
  let selectedSlot = null;
  let submitting = false;

  // ---------- remembered details (this device only) ----------
  try {
    const saved = JSON.parse(localStorage.getItem(DETAILS_KEY) || 'null');
    if (saved) for (const f of fields) if (saved[f]) document.getElementById(f).value = saved[f];
  } catch (e) { /* ignore */ }

  /** Problems that block ordering: item sold out or removed since it was added. */
  function problems(cart) {
    return cart.items.filter((i) => { const m = menuById.get(i.id); return !m || !m.isAvailable; });
  }

  // ---------- 1. order summary ----------
  function renderLines(flash = false) {
    const cart = store.load();
    document.getElementById('back').href = cart.stallId ? `/stall?id=${cart.stallId}` : '/';
    if (!cart.items.length) {
      document.getElementById('sum-stall').textContent = '';
      linesBox.replaceChildren(el('div', { class: 'empty-state' },
        el('div', { class: 'big', 'aria-hidden': 'true' }, '🍽️'),
        el('p', {}, el('strong', {}, 'Your order is empty.')),
        el('p', { class: 'muted' }, 'Add food from a stall before you can continue.'),
        el('a', { class: 'btn', href: '/' }, 'Browse stalls')));
      totalEl.textContent = Cart.baht(0);
      updatePlaceButton();
      return;
    }
    document.getElementById('sum-stall').replaceChildren('From ', el('strong', {}, cart.stallName), stall ? ` · ${stall.area}` : '');
    linesBox.replaceChildren(...cart.items.map((line) => {
      const m = menuById.get(line.id);
      const bad = stall && (!m || !m.isAvailable);
      const qtyInput = el('input', {
        type: 'number', min: 1, max: Cart.MAX_QTY, value: line.qty, inputmode: 'numeric', 'aria-label': `Quantity of ${line.name}`,
        onchange: (e) => setQty(line.id, e.target.value),
      });
      const row = el('div', { class: `line${bad ? ' problem' : ''}` },
        el('div', { class: 'line-img' }, el('img', { src: line.image || (m && m.image) || '/img/rice.svg', alt: '' })),
        el('div', {}, el('div', { class: 'line-name' }, line.name), el('div', { class: 'line-unit' }, `${Cart.baht(line.price)} each`)),
        el('div', { class: 'line-total' }, Cart.baht(Cart.lineTotal(line))),
        el('div', { class: 'line-controls' },
          el('div', { class: 'stepper' },
            el('button', { type: 'button', 'aria-label': `One less ${line.name}`, onclick: () => setQty(line.id, line.qty - 1) }, '−'),
            qtyInput,
            el('button', { type: 'button', 'aria-label': `One more ${line.name}`, disabled: line.qty >= Cart.MAX_QTY, onclick: () => setQty(line.id, line.qty + 1) }, '+')),
          el('button', { class: 'link-btn', type: 'button', onclick: (e) => remove(line.id, e.target.closest('.line')) }, 'Remove')),
        bad ? el('div', { class: 'problem-text' }, !m ? 'This item is no longer on the menu. Please remove it.' : 'Sold Out. Please remove it to continue.') : null);
      return row;
    }));
    totalEl.textContent = Cart.baht(Cart.total(cart));
    if (flash) {
      const row = document.getElementById('total-row');
      row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
    }
    updatePlaceButton();
  }

  function setQty(itemId, qty) {
    const before = store.load();
    const after = Cart.setQty(before, itemId, qty);
    store.save(after);
    if (after.items.length !== before.items.length) toast('Item removed');
    renderLines(true);
  }

  function remove(itemId, row) {
    const done = () => { store.save(Cart.removeItem(store.load(), itemId)); renderLines(true); toast('Item removed'); };
    if (row && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      row.classList.add('removing');
      setTimeout(done, 220);
    } else done();
  }

  // ---------- 2. pickup slots ----------
  function renderSlots() {
    slotsBox.querySelectorAll('.slot, .empty-slots').forEach((n) => n.remove());
    if (!stall) return;
    if (!slots.length) {
      slotsBox.append(el('p', { class: 'empty-slots muted' }, `No pickup times left today at ${stall.name}.`));
      return;
    }
    for (const s of slots) {
      const input = el('input', {
        type: 'radio', name: 'slot', value: s.id, disabled: !s.isAvailable, checked: s.id === selectedSlot,
        onchange: () => { selectedSlot = s.id; document.getElementById('slot-error').textContent = ''; markSteps(); updatePlaceButton(); },
      });
      const note = s.isAvailable ? (s.spotsLeft <= 2 ? `${s.spotsLeft} left` : 'Available') : s.reason;
      slotsBox.append(el('label', { class: 'slot' }, input,
        el('span', {}, el('span', { class: 't' }, s.start), el('small', {}, note))));
    }
  }

  async function loadStall() {
    const cart = store.load();
    if (!cart.stallId) { renderLines(); renderSlots(); return; }
    const { ok, data } = await api(`/api/stalls/${cart.stallId}`);
    if (!ok) { showAlert(data.error || 'Could not load the stall. Check your connection.'); return; }
    stall = data.stall;
    menuById = new Map(data.menu.map((m) => [m.id, m]));
    slots = data.slots;
    // The chosen slot may have become unavailable while the page was open.
    const chosen = slots.find((s) => s.id === selectedSlot);
    if (selectedSlot && (!chosen || !chosen.isAvailable)) {
      selectedSlot = null;
      toast('Your pickup time is no longer available. Please choose another.', 'error');
    }
    document.getElementById('time-sub').textContent = stall.acceptsOrders
      ? `Today at ${stall.name}. Ready in about ${stall.prepMinutes} min, so the earliest time depends on the clock.`
      : `${stall.name}: ${stall.stateText}. It is not taking orders right now.`;
    renderLines();
    renderSlots();
  }

  // ---------- 3. validation + place order ----------
  function validate() {
    const errs = {};
    const v = (f) => document.getElementById(f).value.trim();
    if (!v('name')) errs.name = 'Enter your name.';
    if (!v('studentId')) errs.studentId = 'Enter your student ID.';
    else if (studentIdDigits && !new RegExp(`^[0-9]{${studentIdDigits}}$`).test(v('studentId'))) errs.studentId = `Student ID must be exactly ${studentIdDigits} digits.`;
    if (!v('phone')) errs.phone = 'Enter your phone number.';
    else if (!/^[0-9+\-() ]{7,20}$/.test(v('phone')) || v('phone').replace(/\D/g, '').length < 7) errs.phone = 'Phone must have at least 7 digits.';
    if (!selectedSlot) errs.pickupSlotId = 'Choose a pickup time.';
    return errs;
  }

  function showFieldErrors(errs) {
    for (const f of fields) {
      document.getElementById(`${f}-error`).textContent = errs[f] || '';
      document.getElementById(`f-${f}`).classList.toggle('invalid', Boolean(errs[f]));
      document.getElementById(f).setAttribute('aria-invalid', String(Boolean(errs[f])));
    }
    document.getElementById('slot-error').textContent = errs.pickupSlotId || '';
  }

  function showAlert(message, list = []) {
    alertBox.replaceChildren(el('div', { class: 'alert alert-error', role: 'alert' }, message, list.length ? el('ul', {}, list.map((t) => el('li', {}, t))) : null));
    alertBox.focus();
  }

  function markSteps() {
    document.getElementById('step-time').className = selectedSlot ? 'done' : 'current';
    const filled = fields.every((f) => document.getElementById(f).value.trim());
    document.getElementById('step-details').className = filled ? 'done' : selectedSlot ? 'current' : '';
  }

  function updatePlaceButton() {
    const cart = store.load();
    let reason = '';
    if (!Cart.canCheckout(cart)) reason = 'Add at least one item to continue.';
    else if (stall && !stall.acceptsOrders) reason = `${stall.name} is not taking orders right now.`;
    else if (stall && problems(cart).length) reason = 'Remove the Sold Out item first.';
    placeBtn.disabled = Boolean(reason) || submitting;
    why.textContent = reason || (cart.items.length ? `Total ${Cart.baht(Cart.total(cart))} · pay at the stall` : '');
  }

  function token() {
    // One token per checkout: a second press (or a retry after a network error)
    // sends the same token, so the server never creates the order twice.
    let t = sessionStorage.getItem(TOKEN_KEY);
    if (!t) {
      t = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-cf`);
      try { sessionStorage.setItem(TOKEN_KEY, t); } catch (e) { /* ignore */ }
    }
    return t;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return; // duplicate-press guard (the server also checks the token)
    alertBox.replaceChildren();
    const cart = store.load();
    if (!Cart.canCheckout(cart)) { showAlert('Your order is empty.'); return; }
    const errs = validate();
    showFieldErrors(errs);
    if (Object.keys(errs).length) {
      showAlert('Please fix these before placing the order:', Object.values(errs));
      const first = fields.find((f) => errs[f]);
      if (first) document.getElementById(first).focus();
      return;
    }

    submitting = true;
    placeBtn.disabled = true;
    placeBtn.replaceChildren(el('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Placing order…');
    const details = Object.fromEntries(fields.map((f) => [f, document.getElementById(f).value.trim()]));
    const { ok, status, data } = await api('/api/orders', {
      method: 'POST',
      body: {
        submissionToken: token(),
        stallId: cart.stallId,
        items: cart.items.map((i) => ({ menuItemId: i.id, quantity: i.qty })),
        pickupSlotId: selectedSlot,
        customer: details,
        note: document.getElementById('note').value,
      },
    });
    submitting = false;
    placeBtn.textContent = 'Place order';

    if (ok) {
      try {
        if (document.getElementById('remember').checked) localStorage.setItem(DETAILS_KEY, JSON.stringify(details));
        else localStorage.removeItem(DETAILS_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
      } catch (err) { /* ignore */ }
      // The student ID stays with the order on this device only, to cancel it later.
      myOrders.add({ ...data.order, studentId: details.studentId });
      store.clear();
      location.href = `/confirm?n=${encodeURIComponent(data.order.orderNumber)}&new=1`;
      return;
    }
    // Nothing was created. Show what to fix and refresh live data.
    if (data.fields) showFieldErrors(data.fields);
    showAlert(data.error || `Your order was not placed (error ${status}).`, data.fields ? Object.values(data.fields) : []);
    await loadStall();
    updatePlaceButton();
  });

  for (const f of fields) {
    document.getElementById(f).addEventListener('input', () => {
      document.getElementById(`${f}-error`).textContent = '';
      document.getElementById(`f-${f}`).classList.remove('invalid');
      markSteps();
    });
  }

  window.addEventListener('storage', () => { renderLines(); CF.updateHeader(); });
  renderLines();
  loadStall().then(markSteps);
  setTimeout(() => linesBox.classList.add('no-anim'), 900);
  // Time passes: slots close as the clock moves, so refresh them every 30 seconds.
  setInterval(loadStall, 30000);
})();
