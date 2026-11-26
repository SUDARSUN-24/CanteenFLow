// Confirmation + live order tracker (US-05): order number, status "Received",
// countdown to pickup, and Received -> Preparing -> Ready steps.
(function () {
  const { api, el, myOrders, clock, toast, chime, STATUS_TEXT } = CF;
  const params = new URLSearchParams(location.search);
  const number = String(params.get('n') || '').toUpperCase();
  const isNew = params.get('new') === '1';
  const root = document.getElementById('confirm');
  const RING = 2 * Math.PI * 82;
  const STEPS = ['RECEIVED', 'PREPARING', 'READY'];

  let order = null;
  let lastStatus = null;
  const ui = {};

  function notFound(message) {
    root.replaceChildren(el('div', { class: 'empty-state', style: 'margin-top:16px' },
      el('div', { class: 'big', 'aria-hidden': 'true' }, '🔎'),
      el('p', {}, el('strong', {}, message)),
      el('p', { class: 'muted' }, 'Order numbers look like CF-7K3QXM.'),
      el('a', { class: 'btn', href: '/orders' }, 'My orders'), ' ', el('a', { class: 'btn btn-ghost', href: '/' }, 'Browse stalls')));
  }

  function confetti(box) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#0b6e4f', '#f4a62a', '#e2574c', '#5ba03c', '#ffd34d'];
    const layer = el('div', { class: 'confetti', 'aria-hidden': 'true' });
    for (let i = 0; i < 36; i++) {
      layer.append(el('i', { style: `left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${Math.random() * 0.5}s;animation-duration:${1.2 + Math.random()}s` }));
    }
    box.append(layer);
    setTimeout(() => layer.remove(), 2600);
  }

  function render() {
    // SVG needs the SVG namespace, so build the ring with innerHTML.
    const timer = el('div', { class: 'timer', role: 'img' });
    timer.innerHTML = `<svg viewBox="0 0 190 190" aria-hidden="true"><circle class="track" cx="95" cy="95" r="82" fill="none" stroke-width="12"/><circle class="bar" cx="95" cy="95" r="82" fill="none" stroke-width="12" stroke-dasharray="${RING}" stroke-dashoffset="${RING}"/></svg>`;
    ui.timer = timer;
    ui.bar = timer.querySelector('.bar');
    ui.big = el('div', { class: 'big' }, '--:--');
    ui.small = el('div', { class: 'small' }, 'until ready');
    timer.append(el('div', { class: 'timer-text', 'aria-live': 'off' }, ui.big, ui.small));

    ui.pill = el('span', { class: 'status-pill' }, STATUS_TEXT[order.status] || order.status);
    ui.steps = el('ol', { class: 'track-steps', 'aria-label': 'Order progress' },
      ['Received', 'Preparing', 'Ready', 'Collect & pay'].map((t) => el('li', {}, t)));
    ui.headline = el('p', { style: 'margin:8px 0 0;font-weight:600', 'aria-live': 'polite' });

    const check = el('div', {});
    check.innerHTML = '<svg class="check" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28" fill="none" stroke-width="4"/><path d="M20 33l8 8 16-17" fill="none" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    ui.hero = el('section', { class: 'confirm-hero' },
      isNew ? check : null,
      el('p', { class: 'muted', style: 'margin:0' }, isNew ? 'Order placed! Show this number at the stall' : 'Your order number'),
      el('div', { class: 'order-number' }, order.orderNumber),
      el('button', {
        class: 'btn btn-ghost btn-small copy-btn', type: 'button',
        onclick: async () => {
          try { await navigator.clipboard.writeText(order.orderNumber); toast('Order number copied'); } catch (e) { toast('Copy failed: write it down', 'error'); }
        },
      }, 'Copy number'),
      el('div', { style: 'margin-top:12px' }, ui.pill),
      timer,
      ui.headline,
      ui.steps);

    const items = el('div', {}, order.items.map((i) => el('div', { class: 'line', style: 'grid-template-columns:1fr auto' },
      el('div', {}, el('div', { class: 'line-name' }, `${i.quantity} × ${i.name}`), el('div', { class: 'line-unit' }, `${Cart.baht(i.unitPrice)} each`)),
      el('div', { class: 'line-total' }, Cart.baht(i.lineTotal)))));

    const details = el('section', { class: 'panel' },
      el('h2', {}, 'Pickup details'),
      el('dl', { class: 'kv' },
        el('dt', {}, 'Stall'), el('dd', {}, order.stall.name),
        el('dt', {}, 'Where'), el('dd', {}, order.stall.area),
        el('dt', {}, 'Pickup'), el('dd', {}, `Today ${order.pickupStart}–${order.pickupEnd}`),
        el('dt', {}, 'Name'), el('dd', {}, order.customerName),
        el('dt', {}, 'Placed'), el('dd', {}, `${order.date} at ${order.placedAt}`),
        order.note ? el('dt', {}, 'Note') : null, order.note ? el('dd', {}, order.note) : null),
      el('h3', {}, 'Items'), items,
      el('div', { class: 'total-row' }, el('span', {}, 'Total'), el('span', {}, Cart.baht(order.total))),
      el('p', { class: 'pay-note' }, el('span', { 'aria-hidden': 'true' }, '💵'), el('span', {}, `Pay ${Cart.baht(order.total)} at the stall when you collect.`)),
      el('p', { class: 'sim-note' }, 'Sprint 1 demo: there is no vendor screen yet, so the kitchen steps follow a timer. Preparing starts one prep time before your pickup; Ready at the start of your pickup window.'));

    root.replaceChildren(
      el('a', { class: 'back', href: '/' }, '← Order something else'),
      el('div', { class: 'confirm-layout' }, ui.hero, el('div', {}, details,
        el('a', { class: 'btn btn-ghost btn-block', href: '/orders' }, 'My orders'))));
    if (isNew) { confetti(ui.hero); toast('Order placed · status Received'); }
  }

  /** Runs every second: countdown, ring, steps. */
  function tick() {
    if (!order) return;
    const st = Schedule.orderStatus(order, clock.read());
    const idx = STEPS.indexOf(st.status);
    ui.steps.querySelectorAll('li').forEach((li, i) => {
      li.className = i < idx ? 'done' : i === idx ? 'done current' : '';
    });
    ui.pill.textContent = STATUS_TEXT[st.status] || st.status;
    ui.pill.classList.toggle('ready', st.status === 'READY');
    ui.hero.classList.toggle('ready', st.status === 'READY');
    ui.timer.classList.toggle('ready', st.status === 'READY');
    ui.bar.setAttribute('stroke-dashoffset', String(RING * (1 - st.progress)));

    if (st.status === 'READY') {
      ui.big.textContent = 'Ready!';
      ui.small.textContent = `Collect at ${order.stall.name}`;
      ui.headline.textContent = st.expired
        ? 'Your pickup window has passed. Please go to the stall as soon as you can.'
        : `Your food is ready. Go to ${order.stall.area} and show ${order.orderNumber}.`;
      ui.timer.setAttribute('aria-label', 'Your order is ready');
      document.title = `✅ Ready · ${order.orderNumber}`;
    } else {
      const left = Schedule.formatCountdown(st.secondsToReady);
      ui.big.textContent = left;
      ui.small.textContent = 'until ready';
      ui.headline.textContent = st.status === 'RECEIVED'
        ? `The stall has your order. Cooking starts at ${st.prepStart}.`
        : `The stall is preparing your food now. Pickup from ${order.pickupStart}.`;
      ui.timer.setAttribute('aria-label', `Ready in ${left}`);
      document.title = `${left} · ${order.orderNumber}`;
    }
    if (lastStatus && lastStatus !== st.status) {
      toast(`Status: ${STATUS_TEXT[st.status]}`);
      if (st.status === 'READY') { chime(); confetti(ui.hero); }
    }
    lastStatus = st.status;
  }

  /** Refresh from the server (the source of truth when it still has the order). */
  async function sync() {
    const { ok, data } = await api(`/api/orders/${encodeURIComponent(number)}`);
    if (ok && data.order) {
      order = data.order;
      myOrders.add(order);
    }
    return ok;
  }

  async function start() {
    if (!/^CF-[A-Z0-9]{6}$/.test(number)) return notFound('That is not a valid order number.');
    order = myOrders.find(number);
    if (!order) {
      await sync();
      if (!order) return notFound(`Order ${number} was not found.`);
    } else {
      sync(); // update quietly in the background
    }
    render();
    tick();
    setInterval(tick, 1000);
    setInterval(sync, 20000);
  }
  start();
})();
