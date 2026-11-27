// Vendor page: demo sign-in per stall, incoming orders with Accept / Reject,
// Ready / Collected / No-show / Cancel, and the Sold Out switch.
// The server checks every action; this page only shows what is allowed.
(function () {
  const { api, el, toast, STATUS_TEXT, rules } = CF;
  const TOKEN_KEY = 'canteenflow:vendorToken';
  const $ = (id) => document.getElementById(id);
  let token = null;
  try { token = sessionStorage.getItem(TOKEN_KEY); } catch (e) { /* storage blocked */ }
  let reasonMax = 200;
  rules().then((r) => { if (r) reasonMax = r.REASON_MAX_CHARS; });
  const pending = new Set(); // order numbers with a request on its way (no double actions)

  /** API call with the vendor token; signs out when the token is refused. */
  async function vapi(path, options = {}) {
    const res = await fetch(path, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Clock-Offset': String(CF.clock.offset()) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    }).catch(() => null);
    if (!res) return { ok: false, status: 0, data: { error: 'No connection. Check your internet and try again.' } };
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { signOut('Your sign-in has expired. Please sign in again.'); }
    return { ok: res.ok, status: res.status, data };
  }

  // ---------- sign in / out ----------
  async function showLogin(message = '') {
    $('desk').hidden = true;
    $('login').hidden = false;
    $('login-error').textContent = message;
    const { ok, data } = await api('/api/vendor/stalls');
    if (ok) $('v-stall').replaceChildren(...data.stalls.map((s) => el('option', { value: s.id }, s.name)));
  }

  function signOut(message) {
    token = null;
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
    showLogin(message);
  }

  $('login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('login-btn');
    btn.disabled = true;
    const { ok, data } = await api('/api/vendor/login', { method: 'POST', body: { stallId: Number($('v-stall').value), pin: $('v-pin').value } });
    btn.disabled = false;
    if (!ok) { $('login-error').textContent = data.error || 'Could not sign in.'; return; }
    token = data.token;
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch (err) { /* ignore */ }
    $('v-pin').value = '';
    openDesk();
  });
  $('logout').addEventListener('click', () => signOut(''));

  // ---------- orders ----------
  const GROUPS = [
    ['RECEIVED', 'New orders', 'Accept to start preparing, or reject with a reason.'],
    ['PREPARING', 'Preparing', 'Mark Ready when the food is done.'],
    ['READY', 'Ready for pickup', 'Mark Collected when the student picks it up, or No-show after the pickup window.'],
    ['DONE', 'Finished today', ''],
  ];
  const ACTION_UI = {
    accept: ['Accept', 'btn'],
    reject: ['Reject…', 'btn btn-danger-ghost'],
    ready: ['Mark Ready', 'btn btn-accent'],
    collected: ['Collected', 'btn'],
    no_show: ['No-show', 'btn btn-ghost'],
    cancel: ['Cancel…', 'btn btn-danger-ghost'],
  };

  function orderCard(o) {
    const final = ['COLLECTED', 'CANCELLED', 'NO_SHOW'].includes(o.storedStatus);
    return el('article', { class: `v-order status-${o.storedStatus.toLowerCase()}`, 'data-order': o.orderNumber },
      el('div', { class: 'v-order-top' },
        el('div', {}, el('strong', { class: 'v-num' }, o.orderNumber), el('div', { class: 'muted' }, `Pickup ${o.pickupStart}–${o.pickupEnd}${o.date !== CF.clock.read().date ? ` · ${o.date}` : ''}`)),
        el('span', { class: `badge ${final ? 'badge-done' : 'badge-open'}` }, STATUS_TEXT[o.storedStatus])),
      el('div', { class: 'v-who' }, `${o.customerName} · ID ${o.studentIdMasked} · ${o.phone}`),
      el('ul', { class: 'v-items' }, o.items.map((i) => el('li', {}, `${i.quantity} × ${i.name}`))),
      o.note ? el('p', { class: 'v-note' }, `Note: ${o.note}`) : null,
      o.storedStatus === 'CANCELLED'
        ? el('p', { class: 'v-note' }, o.cancelledBy === 'student' ? 'Cancelled by the student.' : `Cancelled by you: ${o.statusReason}`) : null,
      el('div', { class: 'v-foot' },
        el('strong', {}, Cart.baht(o.total)),
        el('div', { class: 'v-actions' }, (o.actions || []).map((a) => el('button', {
          class: `${ACTION_UI[a][1]} btn-small`, type: 'button', disabled: pending.has(o.orderNumber),
          onclick: () => (a === 'reject' || a === 'cancel' ? askReason(o, a) : act(o, a)),
        }, ACTION_UI[a][0])))));
  }

  async function loadOrders() {
    const { ok, data } = await vapi('/api/vendor/orders');
    if (!ok) { if (token) $('v-alert').replaceChildren(el('div', { class: 'alert alert-error' }, data.error || 'Could not load orders.')); return; }
    $('v-alert').replaceChildren();
    $('v-name').textContent = data.stall.name;
    const groups = new Map(GROUPS.map(([k]) => [k, []]));
    for (const o of data.orders) groups.get(['RECEIVED', 'PREPARING', 'READY'].includes(o.storedStatus) ? o.storedStatus : 'DONE').push(o);
    $('v-orders').replaceChildren(...GROUPS.map(([k, title, help]) => {
      const list = groups.get(k);
      return el('section', { class: `v-group v-${k.toLowerCase()}` },
        el('h2', {}, title, el('span', { class: 'v-count' }, String(list.length))),
        help ? el('p', { class: 'muted v-help' }, help) : null,
        list.length ? el('div', { class: 'v-list' }, list.map(orderCard)) : el('p', { class: 'muted v-empty' }, 'None right now.'));
    }));
  }

  async function act(o, action, reason) {
    if (pending.has(o.orderNumber)) return; // double click: one request only
    pending.add(o.orderNumber);
    document.querySelectorAll(`[data-order="${o.orderNumber}"] .v-actions button`).forEach((b) => { b.disabled = true; });
    const { ok, data } = await vapi(`/api/vendor/orders/${encodeURIComponent(o.orderNumber)}/${action}`, { method: 'POST', body: reason === undefined ? {} : { reason } });
    pending.delete(o.orderNumber);
    if (ok) toast(`${o.orderNumber}: ${STATUS_TEXT[data.order.storedStatus]}`);
    else toast(data.error || 'That did not work. Please try again.', 'error');
    await loadOrders();
    return { ok, data };
  }
  const loadOrdersQuietly = () => loadOrders().catch(() => {});

  /** Reject or cancel: a reason is required and is shown to the student. */
  function askReason(o, action) {
    const box = el('textarea', { id: 'v-reason', maxlength: String(reasonMax), required: true, placeholder: 'e.g. Sold out of pork today' });
    const error = el('div', { class: 'error', role: 'alert' });
    const go = el('button', { class: 'btn btn-danger btn-block', type: 'submit' }, action === 'reject' ? 'Reject order' : 'Cancel order');
    const form = el('form', { method: 'dialog', novalidate: true },
      el('h2', { id: 'v-reason-title' }, `${action === 'reject' ? 'Reject' : 'Cancel'} ${o.orderNumber}?`),
      el('p', { class: 'muted' }, 'The student sees this reason on their order. Its pickup place is released.'),
      el('div', { class: 'field' }, el('label', { for: 'v-reason' }, 'Reason (required)'), box),
      error,
      el('div', { class: 'dialog-actions' }, go, el('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => dlg.close() }, 'Back')));
    const dlg = el('dialog', { class: 'cancel-dialog', 'aria-labelledby': 'v-reason-title' }, form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!box.value.trim()) { error.textContent = 'Please give a reason.'; box.focus(); return; }
      go.disabled = true;
      const r = await act(o, action, box.value.trim());
      if (r && r.ok) dlg.close();
      else { go.disabled = false; error.textContent = (r && r.data.error) || 'That did not work.'; }
    });
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
    box.focus();
  }

  // ---------- menu: Sold Out switch ----------
  async function loadMenu() {
    const { ok, data } = await vapi('/api/vendor/menu');
    if (!ok) return;
    $('v-menu').replaceChildren(el('p', { class: 'muted' }, 'Switch an item to Sold Out and students can no longer order it. Switch it back when it is available again.'),
      el('div', { class: 'v-menu-list' }, data.menu.map((m) => {
        const input = el('input', { type: 'checkbox', role: 'switch', checked: m.isAvailable, 'aria-label': `${m.name} available` });
        const state = el('span', { class: `v-state ${m.isAvailable ? 'on' : 'off'}` }, m.isAvailable ? 'Available' : 'SOLD OUT');
        input.addEventListener('change', async () => {
          input.disabled = true;
          const { ok: done, data: res } = await vapi(`/api/vendor/menu/${m.id}/availability`, { method: 'POST', body: { available: input.checked } });
          input.disabled = false;
          if (!done) { input.checked = !input.checked; toast(res.error || 'Could not change it.', 'error'); return; }
          state.textContent = res.item.isAvailable ? 'Available' : 'SOLD OUT';
          state.className = `v-state ${res.item.isAvailable ? 'on' : 'off'}`;
          toast(`${m.name}: ${res.item.isAvailable ? 'available' : 'Sold Out'}`);
        });
        return el('label', { class: 'v-menu-item' },
          el('span', {}, el('strong', {}, m.name), el('span', { class: 'muted' }, ` · ${Cart.baht(m.price)}`)), state, el('span', { class: 'switch' }, input, el('i', {})));
      })));
  }

  function showTab(which) {
    $('tab-orders').setAttribute('aria-pressed', String(which === 'orders'));
    $('tab-menu').setAttribute('aria-pressed', String(which === 'menu'));
    $('v-orders').hidden = which !== 'orders';
    $('v-menu').hidden = which !== 'menu';
    if (which === 'menu') loadMenu();
  }
  $('tab-orders').addEventListener('click', () => showTab('orders'));
  $('tab-menu').addEventListener('click', () => showTab('menu'));

  let timer = null;
  function openDesk() {
    $('login').hidden = true;
    $('desk').hidden = false;
    $('vendor-lead').textContent = 'New orders appear here automatically. Every change is shown to the student straight away.';
    showTab('orders');
    loadOrders();
    clearInterval(timer);
    timer = setInterval(() => { if (token && !pending.size) loadOrdersQuietly(); }, 10000);
  }

  if (token) openDesk(); else showLogin();
})();
