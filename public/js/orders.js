// My orders: orders placed on this device, with the live status from the
// server (set by the stall's vendor), the reason when the stall rejected or
// cancelled an order, and a Cancel button while cancelling is still allowed.
(function () {
  const { api, el, myOrders, clock, toast, STATUS_TEXT } = CF;
  const list = document.getElementById('list');
  const BADGE = {
    RECEIVED: 'badge-open', PREPARING: 'badge-open', READY: 'badge-later',
    COLLECTED: 'badge-done', CANCELLED: 'badge-closed', NO_SHOW: 'badge-closed',
  };
  let busy = false; // a cancel request is on its way

  /** One line that explains the status in words. */
  function explain(o, st) {
    if (o.storedStatus === 'CANCELLED') {
      const when = o.statusChangedAt ? ` at ${o.statusChangedAt.slice(11)} on ${o.statusChangedAt.slice(0, 10)}` : '';
      return o.cancelledBy === 'vendor'
        ? el('p', { class: 'order-why vendor' }, el('strong', {}, `Cancelled by the stall${when}. `), `Reason: ${o.statusReason || 'not given'}`)
        : el('p', { class: 'order-why' }, `Cancelled by you${when}. Your pickup place was released.`);
    }
    if (o.storedStatus === 'NO_SHOW') return el('p', { class: 'order-why vendor' }, 'Marked as not collected (No-show) by the stall.');
    if (o.storedStatus === 'COLLECTED') return el('p', { class: 'order-why' }, 'Collected. Enjoy your meal!');
    if (st.expired) return el('p', { class: 'order-why' }, 'The pickup window has passed.');
    if (o.storedStatus === 'READY') return el('p', { class: 'order-why' }, `Ready! Collect it at ${o.stall.name}.`);
    if (o.storedStatus === 'PREPARING') return el('p', { class: 'order-why' }, `The stall is preparing it. Pickup ${o.pickupStart}–${o.pickupEnd}. It can no longer be cancelled here.`);
    return el('p', { class: 'order-why' }, `Waiting for the stall to accept · pickup ${o.pickupStart}–${o.pickupEnd} · in ${Schedule.formatCountdown(st.secondsToReady)}`);
  }

  function render() {
    if (busy) return;
    const orders = myOrders.all();
    if (!orders.length) {
      list.replaceChildren(el('div', { class: 'empty-state' }, el('p', {}, 'No orders on this device yet.'), el('a', { class: 'btn', href: '/' }, 'Browse stalls')));
      return;
    }
    const c = clock.read();
    list.replaceChildren(...orders.map((o, i) => {
      const st = Schedule.orderStatus(o, c);
      const canCancel = Boolean(o.canCancel) && !st.expired;
      return el('article', { class: `order-row order-card status-${o.storedStatus.toLowerCase()}`, style: `animation-delay:${i * 40}ms` },
        el('div', { class: 'order-main' },
          el('a', { class: 'order-num', href: `/confirm?n=${encodeURIComponent(o.orderNumber)}` }, o.orderNumber),
          el('div', { class: 'muted order-sub' }, `${o.stall.name} · ${o.date} · pickup ${o.pickupStart}`),
          explain(o, st)),
        el('div', { class: 'order-side' },
          el('span', { class: `badge ${BADGE[o.storedStatus] || 'badge-open'}` }, STATUS_TEXT[o.storedStatus] || o.storedStatus),
          el('div', { class: 'order-total' }, Cart.baht(o.total)),
          canCancel ? el('button', { class: 'btn btn-small btn-danger-ghost', type: 'button', onclick: () => askCancel(o) }, 'Cancel order') : null));
    }));
  }

  /** Confirmation dialog, then the cancel request. Errors (e.g. too late) are shown in the dialog. */
  function askCancel(o) {
    const intro = el('p', { class: 'muted' }, `${o.stall.name} · pickup ${o.pickupStart}. The stall has not started cooking yet, so you can still cancel. Your pickup place goes back to other students.`);
    const idInput = el('input', { id: 'cancel-sid', inputmode: 'numeric', autocomplete: 'off', maxlength: '20', value: o.studentId || '', required: true });
    const error = el('div', { class: 'error', id: 'cancel-error', role: 'alert' });
    const yes = el('button', { class: 'btn btn-danger btn-block', type: 'submit' }, 'Yes, cancel this order');
    const no = el('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => dlg.close() }, 'No, keep it');
    const form = el('form', { method: 'dialog', novalidate: true },
      el('h2', { id: 'cancel-title' }, `Cancel ${o.orderNumber}?`),
      intro,
      el('div', { class: 'field', hidden: Boolean(o.studentId) },
        el('label', { for: 'cancel-sid' }, 'Student ID used for this order'), idInput),
      error,
      el('div', { class: 'dialog-actions' }, yes, no));
    const dlg = el('dialog', { class: 'cancel-dialog', 'aria-labelledby': 'cancel-title' }, form);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return; // double click: one request only
      busy = true;
      yes.disabled = true;
      no.disabled = true;
      yes.replaceChildren(el('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Cancelling…');
      const { ok, data } = await api(`/api/orders/${encodeURIComponent(o.orderNumber)}/cancel`, { method: 'POST', body: { studentId: idInput.value.trim() } });
      busy = false;
      if (ok) {
        myOrders.update(data.order);
        dlg.close();
        toast(`Order ${o.orderNumber} cancelled`);
        render();
        return;
      }
      if (data.order) myOrders.update(data.order);
      error.textContent = data.error || 'Could not cancel. Please try again.';
      if (data.fields && data.fields.studentId) error.textContent += ` ${data.fields.studentId}`;
      if (data.code === 'TOO_LATE') {
        // The status moved on; show the new one and leave only "Close".
        await myOrders.refresh();
        intro.textContent = `${o.stall.name} · pickup ${o.pickupStart}.`;
        yes.remove();
        no.textContent = 'Close';
      } else {
        yes.disabled = false;
        yes.textContent = 'Yes, cancel this order';
      }
      if (data.fields && data.fields.studentId) form.querySelector('.field').hidden = false;
      no.disabled = false;
    });
    dlg.addEventListener('close', () => { dlg.remove(); render(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg && !busy) dlg.close(); });
    document.body.append(dlg);
    dlg.showModal();
  }

  document.getElementById('find').addEventListener('submit', (e) => {
    e.preventDefault();
    const n = document.getElementById('num').value.trim().toUpperCase();
    if (n) location.href = `/confirm?n=${encodeURIComponent(n)}`;
  });

  render();
  setInterval(render, 1000);
  // The vendor changes the status on the server, so check it now and every 10 seconds.
  const sync = async () => { await myOrders.refresh(); render(); };
  sync();
  setInterval(sync, 10000);
})();
