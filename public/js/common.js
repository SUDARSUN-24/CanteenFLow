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
        return !st.expired && !st.final;
      }) || null;
    },
    /** Replace the saved copy with the server's latest (status set by the vendor). Keeps the device-only student ID. */
    update(order) {
      const list = myOrders.all();
      const i = list.findIndex((o) => o.orderNumber === order.orderNumber);
      if (i < 0) return;
      list[i] = { ...order, studentId: list[i].studentId };
      write(MY_ORDERS_KEY, list);
      tickHeader(); // the active-order bar shows the new status at once
    },
    /** Fetch the latest status of every saved order that is not finished yet. */
    async refresh() {
      const c = clock.read();
      const open = myOrders.all().filter((o) => !Schedule.orderStatus(o, c).final);
      await Promise.all(open.map(async (o) => {
        const { ok, data } = await api(`/api/orders/${encodeURIComponent(o.orderNumber)}`);
        if (ok && data.order) myOrders.update(data.order);
      }));
    },
  };

  // ---------- business rules (from src/config.js on the server) ----------
  let rulesPromise = null;
  /** The rule numbers in force. Pages only use them to explain; the server enforces them. */
  const rules = () => (rulesPromise ||= api('/api/config').then((r) => (r.ok ? r.data.rules : null)));

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

  const STATUS_TEXT = { RECEIVED: 'Received', PREPARING: 'Preparing', READY: 'Ready for pickup', COLLECTED: 'Collected', CANCELLED: 'Cancelled', NO_SHOW: 'No-show' };

  // ---------- header, demo bar, footer ----------
  const ICON_CLOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const ICON_BAG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

  const ICON_MAP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 4v13.5M15 6.5V20" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

  /** Fade sections in as they scroll into view (skipped for reduced motion). */
  function reveal() {
    const nodes = document.querySelectorAll('.reveal:not(.is-in)');
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach((n) => n.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    nodes.forEach((n) => io.observe(n));
  }

  // ---------- living background + scroll effects ----------
  const DOODLES = {
    chili: '<svg viewBox="0 0 32 32"><path d="M9 10c-3 6-1 15 6 18 6 2 12-2 10-4-6 1-11-5-11-12" fill="#ef5b3a"/><path d="M12 9c0-3 2-5 5-5" stroke="#0e7a57" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>',
    leaf: '<svg viewBox="0 0 32 32"><path d="M6 26C6 12 14 5 27 5c0 13-7 21-21 21z" fill="#2fb47e"/><path d="M6 26 20 12" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/></svg>',
    bowl: '<svg viewBox="0 0 32 32"><path d="M4 15h24c0 7-5.4 12-12 12S4 22 4 15z" fill="#0e7a57"/><rect x="3" y="13" width="26" height="3.4" rx="1.7" fill="#ffb224"/><path d="M11 10c0-2 2-2 2-4M17 10c0-2 2-2 2-4" stroke="#0e7a57" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
    bean: '<svg viewBox="0 0 32 32"><ellipse cx="16" cy="16" rx="8" ry="11" transform="rotate(30 16 16)" fill="#8a5a2b"/><path d="M12 8c6 4 2 12 8 16" stroke="#f3d1a1" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
    star: '<svg viewBox="0 0 32 32"><path d="M16 3l3.2 9.2L29 13l-7.6 6 2.6 9.5L16 23l-8 5.5 2.6-9.5L3 13l9.8-.8z" fill="#ffb224"/></svg>',
    cup: '<svg viewBox="0 0 32 32"><path d="M8 10h16l-2 17H10z" fill="#c98b4a"/><rect x="7" y="7" width="18" height="4" rx="2" fill="#5b3a1c"/><circle cx="12" cy="23" r="1.6" fill="#3a2414"/><circle cx="17" cy="24" r="1.6" fill="#3a2414"/><circle cx="20" cy="21.5" r="1.6" fill="#3a2414"/><path d="M18 7l3-5" stroke="#ef5b3a" stroke-width="2" stroke-linecap="round"/></svg>',
    noodle: '<svg viewBox="0 0 32 32"><path d="M5 9c4 0 4 4 8 4s4-4 8-4 4 4 6 4M5 16c4 0 4 4 8 4s4-4 8-4 4 4 6 4" stroke="#e8a317" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>',
  };
  // [kind, left %, top (vh), scroll depth, rotation]
  const DOODLE_SPOTS = [
    ['chili', 6, 14, .25, -20], ['leaf', 88, 22, .4, 30], ['bowl', 14, 48, .15, 0], ['star', 80, 58, .3, 10],
    ['bean', 92, 84, .2, -10], ['noodle', 4, 78, .35, 0], ['cup', 70, 8, .12, 8], ['leaf', 30, 92, .28, -40],
    ['chili', 60, 96, .45, 25], ['star', 46, 34, .5, -5], ['bean', 24, 4, .18, 40], ['bowl', 94, 42, .32, 0],
    ['noodle', 52, 70, .22, 12], ['cup', 10, 108, .4, -12], ['star', 84, 120, .26, 20], ['leaf', 40, 130, .36, 60],
  ];
  const SPARK = '<svg viewBox="0 0 20 20"><path d="M10 0c.6 5.4 4 8.8 10 10-6 1.2-9.4 4.6-10 10-.6-5.4-4-8.8-10-10 6-1.2 9.4-4.6 10-10z" fill="currentColor"/></svg>';
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function renderBackground() {
    const scene = el('div', { class: 'bg-scene', 'aria-hidden': 'true' });
    for (let i = 1; i <= 5; i++) scene.append(el('span', { class: `orb o${i}` }));
    DOODLE_SPOTS.forEach(([kind, x, y, d, r], i) => {
      const node = el('span', { class: 'doodle', style: `left:${x}%;top:${y}vh;--d:${d};--r:${r}deg;--t:${8 + (i % 5) * 1.7}s;--w:${-i * 1.3}s` });
      node.innerHTML = DOODLES[kind];
      scene.append(node);
    });
    document.body.prepend(scene);
    // Sparkles in the home hero
    const hero = document.querySelector('.hero');
    if (hero) for (let i = 1; i <= 4; i++) { const s = el('span', { class: `spark k${i}`, 'aria-hidden': 'true' }); s.innerHTML = SPARK; hero.append(s); }
  }

  /** Feeds the scroll position to CSS (--sy, --p) for parallax and the progress line. */
  function trackScroll(header) {
    const root = document.documentElement;
    const bar = el('span', { class: 'scroll-progress', 'aria-hidden': 'true' });
    header.append(bar);
    const setSbw = () => root.style.setProperty('--sbw', `${Math.max(0, innerWidth - root.clientWidth)}px`);
    setSbw();
    addEventListener('resize', setSbw);
    let queued = false;
    const update = () => {
      queued = false;
      const y = scrollY;
      const max = Math.max(1, root.scrollHeight - innerHeight);
      if (!reducedMotion()) root.style.setProperty('--sy', y.toFixed(0));
      bar.style.setProperty('--p', Math.min(1, y / max).toFixed(4));
      header.classList.toggle('is-scrolled', y > 8);
    };
    addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  /** Gives static blocks a scroll-in style before reveal() watches them. */
  function tagReveals() {
    document.querySelectorAll('main .section-head:not(.reveal)').forEach((n) => { if (!n.closest('.reveal')) n.classList.add('reveal', 'from-left'); });
    document.querySelectorAll('main .panel:not(.reveal)').forEach((n, i) => n.classList.add('reveal', i % 2 ? 'from-right' : 'zoom'));
    document.querySelectorAll('footer .wrap:not(.reveal)').forEach((n) => n.classList.add('reveal'));
  }

  function renderChrome() {
    const header = el('header', { class: 'site-header' },
      el('div', { class: 'wrap header-row' },
        el('a', { class: 'logo', href: '/' },
          el('img', { class: 'logo-mark', src: '/img/favicon.svg', alt: '', width: 38, height: 38 }),
          el('span', { class: 'wordmark' }, 'Canteen', el('span', { class: 'flow' }, 'Flow'), el('small', {}, 'Siam University · pre-order'))),
        el('div', { class: 'header-actions' },
          el('a', { class: `header-map${location.pathname.startsWith('/map') ? ' is-here' : ''}`, href: '/map', 'aria-label': 'Campus map' },
            el('span', { class: 'icon map-icon' }), el('span', { class: 'label' }, 'Map')),
          el('button', { class: 'clock-chip', type: 'button', id: 'clock-chip', 'aria-haspopup': 'dialog' }),
          el('a', { class: 'header-order', href: '/order', 'data-order-link': '' },
            el('span', { class: 'icon' }), el('span', { class: 'label' }, 'Order'), el('span', { class: 'count', 'data-order-count': '' }, '0')))),
      el('div', { class: 'wrap' }, el('a', { class: 'active-order', id: 'active-order', href: '#', hidden: true })));
    header.querySelector('.header-order .icon').innerHTML = ICON_BAG;
    header.querySelector('.map-icon').innerHTML = ICON_MAP;

    const demoBar = el('div', { class: 'demo-bar' },
      el('span', {}, 'Student course project demo · team Dagabaaz Re · no order is sent to a real shop'));

    document.body.prepend(demoBar, header);

    const footer = el('footer', {},
      el('div', { class: 'wrap' },
        el('p', {}, el('strong', {}, 'CanteenFlow'), ' · Sprint 1 demo for the Agile course · team Dagabaaz Re.'),
        el('p', {}, 'Stall names and buildings come from public sources. Prices, prep times, pickup slots and Sold Out states are demo data. ',
          el('a', { href: 'https://github.com/SUDARSUN-24/CanteenFLow/blob/main/data/SOURCES.md', target: '_blank', rel: 'noopener' }, 'Data sources'),
          ' · ', el('a', { href: '/map' }, 'Campus map'),
          ' · ', el('a', { href: '/orders' }, 'My orders'),
          ' · ', el('a', { href: '/vendor' }, 'Vendor page')),
        el('p', { class: 'small' }, 'Map data © ', el('a', { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener' }, 'OpenStreetMap contributors'), '.')));
    document.body.append(footer);

    document.getElementById('clock-chip').addEventListener('click', openClockDialog);
    updateHeader();
    tickHeader();
    setInterval(tickHeader, 1000);
    // The header's active-order bar follows the status the vendor sets.
    const syncActive = () => { if (myOrders.active()) myOrders.refresh(); };
    syncActive();
    setInterval(syncActive, 30000);
    renderBackground();
    trackScroll(header);
    tagReveals();
    reveal();
    // Sections added later (e.g. after loading) are picked up too.
    let pending = 0;
    new MutationObserver(() => { if (!pending) pending = setTimeout(() => { pending = 0; tagReveals(); reveal(); }, 250); })
      .observe(document.querySelector('main') || document.body, { childList: true });
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

  window.CF = { store, myOrders, clock, api, el, toast, labelChip, stallBadge, STATUS_TEXT, updateHeader, openClockDialog, chime, rules };
  renderChrome();
})();
