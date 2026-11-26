// Stall menu page (US-02): menu, Sold Out items, category filter,
// one-stall-per-order warning and the floating order bar.
(function () {
  const { api, el, store, toast, labelChip, stallBadge } = CF;
  const id = new URLSearchParams(location.search).get('id');
  const head = document.getElementById('stall-head');
  const menuBox = document.getElementById('menu');
  const catBox = document.getElementById('categories');
  const bar = document.getElementById('order-bar');
  const dialog = document.getElementById('other-stall');

  let stall = null;
  let menu = [];
  let category = 'All';
  let pendingItem = null; // item waiting for the "start new order?" answer

  function renderHead() {
    document.title = `${stall.name} · CanteenFlow`;
    const facts = [
      el('span', { class: 'fact' }, `⏱ Ready in ~${stall.prepMinutes} min`),
      el('span', { class: 'fact' }, `🕘 ${stall.hours} `, labelChip(stall.hoursLabel)),
      el('span', { class: 'fact' }, `📍 ${stall.area}`),
    ];
    head.replaceChildren(...[
      el('section', { class: 'stall-hero', style: `--k:${Kiosk.theme(stall.slug).main}` },
        Kiosk.tilt(el('div', { class: 'stall-thumb kiosk-hero' }, Kiosk.svg(stall))),
        el('div', {},
          el('div', { class: 'stall-top' }, el('h1', {}, stall.name), stallBadge(stall)),
          el('div', { class: 'th', lang: 'th' }, stall.nameTh),
          el('div', { class: 'meta' }, el('b', {}, stall.cuisine), el('span', {}, stall.stateText)),
          el('div', { class: 'stall-facts' }, facts)),
        el('p', { class: 'data-note' }, 'ℹ ', stall.dataLabel)),
      !stall.acceptsOrders
        ? el('div', { class: 'closed-banner', role: 'status' }, '⛔',
          el('span', {}, `${stall.stateText}. You can look at the menu, but this stall is not taking orders right now.`))
        : stall.state === 'opens_later'
          ? el('div', { class: 'later-banner' }, `Not open yet: ${stall.stateText}. Pre-order now and pick up from ${stall.nextSlot}.`)
          : null,
      otherOrderNote()].filter(Boolean)); // replaceChildren would print "null"
  }

  /** Small note when the saved order belongs to another stall. */
  function otherOrderNote() {
    const cart = store.load();
    if (!cart.items.length || cart.stallId === stall.id) return null;
    return el('div', { class: 'other-order' },
      `You have an order at ${cart.stallName} (${Cart.count(cart)} item${Cart.count(cart) === 1 ? '' : 's'}). One order can only be for one stall. `,
      el('a', { href: '/order' }, 'View that order'));
  }

  function renderCategories() {
    const cats = ['All', ...new Set(menu.map((m) => m.category))];
    catBox.replaceChildren(...cats.map((c) => el('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(c === category),
      onclick: () => { category = c; menuBox.classList.remove('no-anim'); renderCategories(); renderMenu(); setTimeout(() => menuBox.classList.add('no-anim'), 700); },
    }, c, el('span', { class: 'n' }, c === 'All' ? menu.length : menu.filter((m) => m.category === c).length))));
  }

  const dishNodes = new Map(); // itemId -> { article, tag }

  /** Build the menu cards (only when the menu or category changes). */
  function renderMenu() {
    const items = menu.filter((m) => category === 'All' || m.category === category);
    dishNodes.clear();
    menuBox.replaceChildren(...items.map((m, i) => {
      let action;
      if (!m.isAvailable) {
        action = el('button', { class: 'btn soldout-btn', type: 'button', disabled: true, 'aria-label': `${m.name} is sold out` }, 'SOLD OUT');
      } else if (!stall.acceptsOrders) {
        action = el('button', { class: 'btn', type: 'button', disabled: true }, 'Not taking orders');
      } else {
        action = el('button', { class: 'btn', type: 'button', onclick: () => add(m), 'aria-label': `Add ${m.name} to order` }, '+ Add');
      }
      const tag = el('span', { class: 'in-order-tag', 'aria-live': 'polite' });
      const article = el('article', { class: `dish${m.isAvailable ? '' : ' sold-out'}`, style: `animation-delay:${i * 35}ms` },
        el('div', { class: 'dish-img' },
          el('img', { src: m.image, alt: `Illustration: ${m.name}`, width: 160, height: 120, loading: 'lazy' }),
          m.isAvailable ? null : el('div', { class: 'soldout-tag', 'aria-hidden': 'true' }, 'SOLD OUT')),
        el('div', {},
          el('div', { class: 'dish-name' }, m.name),
          el('div', { class: 'th', lang: 'th' }, m.nameTh),
          el('div', { class: 'dish-price' }, Cart.baht(m.price)),
          el('div', { class: 'dish-actions' }, action, tag)));
      dishNodes.set(m.id, { article, tag });
      return article;
    }));
    refreshDishes();
  }

  /** Update the "✓ 2 in order" marks without rebuilding the cards. */
  function refreshDishes() {
    const cart = store.load();
    for (const [itemId, { article, tag }] of dishNodes) {
      const line = cart.stallId === stall.id ? cart.items.find((i) => i.id === itemId) : null;
      article.classList.toggle('in-order', Boolean(line));
      tag.textContent = line ? `✓ ${line.qty} in order` : '';
    }
  }

  function renderBar(bump = false) {
    const cart = store.load();
    const mine = cart.stallId === stall.id && cart.items.length > 0;
    bar.hidden = !mine;
    if (!mine) return;
    const n = Cart.count(cart);
    document.getElementById('bar-count').textContent = n;
    document.getElementById('bar-total').textContent = Cart.baht(Cart.total(cart));
    document.getElementById('bar-stall').textContent = `${n} item${n === 1 ? '' : 's'} · ${stall.name}`;
    if (bump) {
      bar.classList.remove('bump');
      void bar.offsetWidth;
      bar.classList.add('bump');
    }
  }

  function add(item) {
    const result = Cart.addItem(store.load(), stall, item);
    if (result.ok) return commit(result.cart, `Added ${item.name}`);
    if (result.reason === 'other_stall') {
      pendingItem = item;
      const cart = store.load();
      document.getElementById('other-text').textContent =
        `Your order has ${Cart.count(cart)} item${Cart.count(cart) === 1 ? '' : 's'} from ${cart.stallName}. One order can only be for one stall. ` +
        `Start a new order at ${stall.name}? Your current order will be removed.`;
      dialog.showModal();
      return;
    }
    const why = { sold_out: `${item.name} is Sold Out.`, closed: `${stall.name} is not taking orders right now.`, max_qty: `You can order up to ${Cart.MAX_QTY} of one item.` };
    toast(why[result.reason] || 'Could not add this item.', 'error');
  }

  function commit(cart, message) {
    store.save(cart);
    refreshDishes();
    renderBar(true);
    toast(message);
  }

  document.getElementById('other-new').addEventListener('click', () => {
    dialog.close();
    const result = Cart.startNewWith(stall, pendingItem);
    if (result.ok) {
      commit(result.cart, `New order started at ${stall.name}`);
      renderHead();
    }
    pendingItem = null;
  });
  document.getElementById('other-keep').addEventListener('click', () => { dialog.close(); pendingItem = null; });

  async function load() {
    if (!id) { location.href = '/'; return; }
    const { ok, data } = await api(`/api/stalls/${encodeURIComponent(id)}`);
    if (!ok) {
      head.replaceChildren(el('div', { class: 'empty-state' }, el('p', {}, data.error || 'Could not load this stall.'), el('a', { class: 'btn', href: '/' }, 'Back to all stalls')));
      return;
    }
    // Rebuild the cards only if something a student can see has changed
    // (Sold Out, prices, or whether the stall takes orders); otherwise just the header.
    const key = JSON.stringify([data.menu, data.stall.acceptsOrders]);
    const firstLoad = !stall;
    stall = data.stall;
    menu = data.menu;
    renderHead();
    if (key !== lastKey) {
      lastKey = key;
      renderCategories();
      renderMenu();
    }
    renderBar();
    // After the first paint, stop the entrance animation from replaying on every change.
    if (firstLoad) {
      setTimeout(() => menuBox.classList.add('no-anim'), 900);
      const mapBox = document.getElementById('campus-map');
      const known = CampusMap.SPOTS.some((sp) => sp.stalls.some(([slug]) => slug === stall.slug));
      document.getElementById('find-it').hidden = false;
      if (known) CampusMap.mount(mapBox, { highlight: stall.slug, compact: true });
      else mapBox.replaceChildren(el('p', { class: 'muted' }, 'The building for this stall is not listed in any source we found, so it is not on the map. ', el('a', { href: '/map' }, 'See the campus map')));
    }
  }
  let lastKey = '';

  // Keep in step with other tabs (e.g. order changed on the order page).
  window.addEventListener('storage', () => { if (stall) { refreshDishes(); renderBar(); CF.updateHeader(); } });
  // Opening hours move with the clock: refresh every minute.
  setInterval(load, 60000);
  load();
})();
