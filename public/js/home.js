// Home page (US-01): stall list, search, pickup-time filter, 3D campus map.
(function () {
  const { api, el, stallBadge, clock } = CF;
  const q = document.getElementById('q');
  const pickup = document.getElementById('pickup');
  const list = document.getElementById('stall-list');
  const count = document.getElementById('result-count');
  const notice = document.getElementById('closed-notice');

  // Keep the search in the URL so a filtered list can be shared or reloaded.
  const params = new URLSearchParams(location.search);
  q.value = params.get('q') || '';

  function stallCard(s, i) {
    const stateClass = s.state === 'open' ? 'open' : s.state === 'opens_later' ? 'later' : 'closed';
    let when = s.stateText;
    if (s.acceptsOrders && s.nextSlot) when += ` · next pickup ${s.nextSlot}`;
    else if (s.state === 'open' || s.state === 'opens_later') when += ' · no pickup slots left today';
    return Kiosk.tilt(el('a', { class: `stall-card${s.acceptsOrders ? '' : ' is-closed'}`, href: `/stall?id=${s.id}`, style: `animation-delay:${i * 45}ms` },
      el('div', { class: 'stall-thumb kiosk-thumb', style: `--k:${Kiosk.theme(s.slug).main}` }, Kiosk.svg(s)),
      el('div', { class: 'stall-body' },
        el('div', { class: 'stall-top' },
          el('div', {}, el('div', { class: 'stall-name' }, s.name), el('div', { class: 'th', lang: 'th' }, s.nameTh)),
          stallBadge(s)),
        el('div', { class: 'meta' }, el('b', {}, s.cuisine), el('span', {}, `⏱ ~${s.prepMinutes} min`)),
        el('div', { class: 'meta' }, el('span', {}, `📍 ${s.area}`)),
        el('div', { class: `state-line ${stateClass}` }, when),
        s.matchedDishes && s.matchedDishes.length ? el('div', { class: 'matches' }, 'Has: ' + s.matchedDishes.join(', ')) : null)), 5);
  }

  /** Hero: a little street of 3D shops, lit when open. */
  const street = document.getElementById('hero-street');
  function renderStreet(stalls) {
    if (!street || q.value || pickup.value) return;
    const pick = ['main-cafeteria-japanese', 'thai-pavilion-noodles', 'hello-tea-coffee']
      .map((slug) => stalls.find((s) => s.slug === slug)).filter(Boolean);
    const key = pick.map((s) => s.slug + s.state).join('|');
    if (street.dataset.key === key) return;
    street.dataset.key = key;
    street.replaceChildren(...pick.map((s, i) => el('div', { class: `street-shop s${i}` }, Kiosk.svg(s))));
  }

  /** When nothing can be ordered right now (night, weekend), offer the demo clock. */
  function showClosedNotice(stalls) {
    notice.replaceChildren();
    if (q.value || pickup.value) return;
    if (stalls.some((s) => s.acceptsOrders)) return;
    const c = clock.read();
    notice.append(el('div', { class: 'notice' },
      el('span', { class: 'emoji', 'aria-hidden': 'true' }, '🌙'),
      el('div', {},
        el('p', {}, el('strong', {}, `It's ${c.label} in Bangkok, and every stall is closed for ordering.`),
          ' Stalls open on weekdays. To try the demo now, switch to a lunchtime demo clock.'),
        el('button', {
          class: 'btn btn-accent btn-small', type: 'button',
          onclick: () => { clock.setOffset(Schedule.offsetFor(clock.realMs(), 2, '11:30')); location.reload(); },
        }, 'Try it at Tue 11:30'),
        ' ',
        el('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: CF.openClockDialog }, 'Other times'))));
  }

  let seq = 0;
  async function load() {
    const my = ++seq; // ignore slow, out-of-date responses
    const query = new URLSearchParams();
    if (q.value.trim()) query.set('q', q.value.trim());
    if (pickup.value) query.set('pickup', pickup.value);
    history.replaceState(null, '', query.toString() ? `?${query}` : location.pathname);

    const { ok, data } = await api(`/api/stalls?${query}`);
    if (my !== seq) return;
    list.setAttribute('aria-busy', 'false');
    list.replaceChildren();
    if (!ok) {
      count.textContent = '';
      list.append(el('div', { class: 'empty-state' }, el('p', {}, data.error || 'Could not load stalls. Please try again.'),
        el('button', { class: 'btn', type: 'button', onclick: load }, 'Try again')));
      return;
    }
    const stalls = data.stalls;
    showClosedNotice(stalls);
    renderStreet(stalls);
    if (stalls.length === 0) {
      // No-results message (US-01)
      const what = [q.value.trim() && `“${q.value.trim()}”`, pickup.value && `pickup at ${pickup.value}`].filter(Boolean).join(' with ');
      count.textContent = 'No stalls found';
      list.append(el('div', { class: 'empty-state' },
        el('div', { class: 'big', 'aria-hidden': 'true' }, '🍜'),
        el('p', {}, el('strong', {}, `No stalls match ${what}.`)),
        el('p', { class: 'muted' }, 'Check the spelling, try another dish, or choose a different pickup time.'),
        el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { q.value = ''; pickup.value = ''; load(); q.focus(); } }, 'Clear search')));
      return;
    }
    const orderable = stalls.filter((s) => s.acceptsOrders).length;
    count.textContent = `${stalls.length} stall${stalls.length === 1 ? '' : 's'} · ${orderable} taking orders now`;
    list.append(...stalls.map(stallCard));
  }

  async function loadTimes() {
    const keep = pickup.value || params.get('pickup') || '';
    const { ok, data } = await api('/api/pickup-times');
    if (!ok) return;
    pickup.replaceChildren(el('option', { value: '' }, data.times.length ? 'Any time' : 'No pickup times left today'));
    for (const t of data.times) pickup.append(el('option', { value: t }, t));
    pickup.value = data.times.includes(keep) ? keep : '';
  }

  let timer;
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 200); });
  pickup.addEventListener('change', load);

  loadTimes().then(load);
  CampusMap.mount(document.getElementById('campus-map'));
  // Time moves on: refresh open/closed and slots every minute.
  setInterval(() => { loadTimes().then(load); }, 60000);
})();
