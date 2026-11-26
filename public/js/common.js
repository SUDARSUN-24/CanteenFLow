// Shared by every page: header, clock (live or demo), saved order, my orders,
// API calls and small DOM helpers. Needs cart.js and schedule.js first.
(function () {
  const ORDER_KEY = 'canteenflow:order';
  const MY_ORDERS_KEY = 'canteenflow:myOrders';
  const OFFSET_KEY = 'canteenflow:clockOffset';

  // ---------- storage (can be blocked in private mode, so always wrapped) ----------
  const read = (key, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch (e) { return fallback; }
  };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ } };

  // ---------- clock ----------
  // now = device time + skew (learned from the server) + demo offset (chosen by the student).
  let skewMs = 0;
  const clock = {
    offset: () => Schedule.safeOffset(read(OFFSET_KEY, 0)),
    isDemo: () => clock.offset() !== 0,
    setOffset(ms) { write(OFFSET_KEY, Schedule.safeOffset(ms)); },
    nowMs: () => Date.now() + skewMs + clock.offset(),
    realMs: () => Date.now() + skewMs,
    read: () => Schedule.clockAt(clock.nowMs()),
  };

  // ---------- current order (cart) ----------
  const store = {
    load() {
      const c = read(ORDER_KEY, null);
      return c && Array.isArray(c.items) ? c : Cart.empty();
    },
    save(cart) { write(ORDER_KEY, cart); updateHeader(); },
    clear() { this.save(Cart.empty()); },
  };

  // ---------- orders this browser has placed ----------
  const myOrders = {
    all: () => read(MY_ORDERS_KEY, []),
    add(order) {
      const list = myOrders.all().filter((o) => o.orderNumber !== order.orderNumber);
      list.unshift(order);
      write(MY_ORDERS_KEY, list.slice(0, 10));
    },
    find: (n) => myOrders.all().find((o) => o.orderNumber === n) || null,
    /** The newest order that is still waiting for pickup. */
    active() {
      const c = clock.read();
      return myOrders.all().find((o) => {
        const st = Schedule.orderStatus(o, c);
        return !st.expired && st.status !== 'COLLECTED' && st.status !== 'CANCELLED';
      }) || null;
    },
  };

  async function api(path, options = {}) {
    let res;
    try {
      res = await fetch(path, {
        ...options,
        headers: { 'Content-Type': 'application/json', 'X-Clock-Offset': String(clock.offset()) },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (e) {
      return { ok: false, status: 0, data: { error: 'No connection. Check your internet and try again.' } };
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* non-JSON error */ }
    // Learn the server's real time so countdowns stay correct even if this device's clock is off.
    if (data && data.clock && typeof data.clock.ms === 'number') {
      skewMs = data.clock.ms - clock.offset() - Date.now();
    }
    return { ok: res.ok, status: res.status, data };
  }

  // ---------- DOM helpers ----------
  /** el('p', { class: 'x' }, 'text', childNode). Text is never parsed as HTML. */
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  let toastTimer;
  function toast(message, kind = '') {
    let t = document.querySelector('.toast');
    if (!t) {
      t = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
      document.body.append(t);
    }
    t.className = `toast ${kind}`;
    t.textContent = message;
    t.hidden = false;
    t.classList.remove('show');
    void t.offsetWidth; // restart the animation
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  function labelChip(label) {
    const cls = label === 'verified' ? 'verified' : label === 'demo data' ? 'demo' : 'unverified';
    return el('span', { class: `label-chip ${cls}`, title: 'How sure we are of this fact. See Data sources.' }, label);
  }

  /** Status pill for a stall state from the API. */
  function stallBadge(s) {
    if (s.state === 'open') return el('span', { class: 'badge badge-open' }, el('span', { class: 'dot' }), 'Open now');
    if (s.state === 'opens_later') return el('span', { class: 'badge badge-later' }, 'Pre-order');
    return el('span', { class: 'badge badge-closed' }, 'Closed');
  }

  const STATUS_TEXT = { RECEIVED: 'Received', PREPARING: 'Preparing', READY: 'Ready for pickup', COLLECTED: 'Collected', CANCELLED: 'Cancelled' };

  // ---------- header, demo bar, footer ----------
  const ICON_CLOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const ICON_BAG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

  function renderChrome() {
    const header = el('header', { class: 'site-header' },
      el('div', { class: 'wrap header-row' },
        el('a', { class: 'logo', href: '/' },
          el('img', { class: 'logo-mark', src: '/img/favicon.svg', alt: '', width: 34, height: 34 }),
          el('span', {}, 'CanteenFlow', el('small', {}, 'Siam University'))),
        el('div', { class: 'header-actions' },
          el('button', { class: 'clock-chip', type: 'button', id: 'clock-chip', 'aria-haspopup': 'dialog' }),
          el('a', { class: 'header-order', href: '/order', 'data-order-link': '' },
            el('span', { class: 'icon' }), el('span', { class: 'label' }, 'Order'), el('span', { class: 'count', 'data-order-count': '' }, '0')))),
      el('div', { class: 'wrap' }, el('a', { class: 'active-order', id: 'active-order', href: '#', hidden: true })));
    header.querySelector('.icon').innerHTML = ICON_BAG;

    const demoBar = el('div', { class: 'demo-bar' },
      el('span', {}, 'Student course project demo · team Dagabaaz Re · no order is sent to a real shop'));

    document.body.prepend(demoBar, header);

    const footer = el('footer', {},
      el('div', { class: 'wrap' },
        el('p', {}, el('strong', {}, 'CanteenFlow'), ' · Sprint 1 demo for the Agile course · team Dagabaaz Re.'),
        el('p', {}, 'Stall names and buildings come from public sources. Prices, prep times, pickup slots and Sold Out states are demo data. ',
          el('a', { href: 'https://github.com/SUDARSUN-24/CanteenFLow/blob/main/data/SOURCES.md', target: '_blank', rel: 'noopener' }, 'Data sources'),
          ' · ', el('a', { href: '/orders' }, 'My orders'))));
    document.body.append(footer);

    document.getElementById('clock-chip').addEventListener('click', openClockDialog);
    updateHeader();
    tickHeader();
    setInterval(tickHeader, 1000);
  }

  function updateHeader() {
    const n = Cart.count(store.load());
    document.querySelectorAll('[data-order-count]').forEach((node) => {
      if (node.textContent !== String(n)) {
        node.textContent = n;
        node.classList.remove('bump');
        void node.offsetWidth;
        node.classList.add('bump');
      }
    });
    document.querySelectorAll('[data-order-link]').forEach((node) => {
      node.setAttribute('aria-label', `Your order: ${n} item${n === 1 ? '' : 's'}`);
      node.classList.toggle('has-items', n > 0);
    });
  }

  /** Every second: clock chip text and the active-order tracker. */
  function tickHeader() {
    const c = clock.read();
    const chip = document.getElementById('clock-chip');
    if (chip) {
      chip.innerHTML = ICON_CLOCK;
      chip.append(el('span', {}, c.label), el('span', { class: `mode ${clock.isDemo() ? 'demo' : ''}` }, clock.isDemo() ? 'Demo' : 'Live'));
      chip.classList.toggle('is-demo', clock.isDemo());
      chip.setAttribute('aria-label', `Bangkok time ${c.label}, ${clock.isDemo() ? 'demo clock' : 'live'}. Change clock`);
    }
    const box = document.getElementById('active-order');
    if (!box) return;
    const o = myOrders.active();
    const onThatPage = new URLSearchParams(location.search).get('n') === (o && o.orderNumber);
    if (!o || onThatPage) { box.hidden = true; return; }
    const st = Schedule.orderStatus(o, c);
    box.hidden = false;
    box.href = `/confirm?n=${encodeURIComponent(o.orderNumber)}`;
    box.className = `active-order status-${st.status.toLowerCase()}`;
    box.replaceChildren(
      el('span', { class: 'pulse' }),
      el('strong', {}, o.orderNumber),
      el('span', {}, st.status === 'READY' ? ` · Ready! Collect at ${o.stall.name}` : ` · ${STATUS_TEXT[st.status]} · ready in ${Schedule.formatCountdown(st.secondsToReady)}`));
  }

  // ---------- demo clock dialog ----------
  function openClockDialog() {
    const c = clock.read();
    const presets = [
      ['Mon', 1, '07:45', 'Before opening: pre-order'],
      ['Tue', 2, '11:30', 'Lunch rush'],
      ['Wed', 3, '14:40', 'Closing soon'],
      ['Sun', 0, '12:00', 'Weekend: closed'],
    ];
    const daySel = el('select', { id: 'demo-day' }, Schedule.DAY_NAMES.map((d, i) => el('option', { value: i, selected: i === c.weekday }, d)));
    const timeIn = el('input', { id: 'demo-time', type: 'time', value: c.hhmm, step: 60 });
    const apply = (offset) => { clock.setOffset(offset); location.reload(); };

    const dlg = el('dialog', { class: 'clock-dialog', 'aria-labelledby': 'clock-title' },
      el('h2', { id: 'clock-title' }, 'Clock'),
      el('p', { class: 'muted' }, 'Stalls open, close and fill up by Bangkok time. To try the demo at night or on a weekend, set a demo clock. It keeps running from the time you pick.'),
      el('button', { class: `btn btn-block ${clock.isDemo() ? 'btn-ghost' : ''}`, type: 'button', onclick: () => apply(0) },
        clock.isDemo() ? 'Use live Bangkok time' : '✓ Using live Bangkok time'),
      el('h3', {}, 'Quick demo times'),
      el('div', { class: 'preset-grid' }, presets.map(([d, w, t, text]) => el('button', {
        class: 'preset', type: 'button', onclick: () => apply(Schedule.offsetFor(clock.realMs(), w, t)),
      }, el('strong', {}, `${d} ${t}`), el('span', {}, text)))),
      el('h3', {}, 'Or pick a day and time'),
      el('div', { class: 'demo-pick' },
        el('label', { for: 'demo-day' }, 'Day', daySel),
        el('label', { for: 'demo-time' }, 'Time', timeIn),
        el('button', { class: 'btn', type: 'button', onclick: () => timeIn.value && apply(Schedule.offsetFor(clock.realMs(), daySel.value, timeIn.value)) }, 'Set')),
      el('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => dlg.close() }, 'Close'));
    dlg.addEventListener('close', () => dlg.remove());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    document.body.append(dlg);
    dlg.showModal();
  }

  /** Small two-tone beep + vibration, used when an order becomes ready. */
  function chime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [660, 880].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
        g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.18 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.3);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + i * 0.18);
        o.stop(ctx.currentTime + i * 0.18 + 0.32);
      });
    } catch (e) { /* audio blocked */ }
    if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
  }

  window.CF = { store, myOrders, clock, api, el, toast, labelChip, stallBadge, STATUS_TEXT, updateHeader, openClockDialog, chime };
  renderChrome();
})();
