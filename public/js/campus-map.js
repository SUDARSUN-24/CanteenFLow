// 3D campus map of Siam University, drawn from OpenStreetMap building
// outlines (public/data/campus-map.json). Buildings are extruded to their
// floor count, food places get live pins (open / pre-order / closed), and the
// map can be dragged, pinched, zoomed, rotated and switched to a flat 2D view.
//
//   CampusMap.mount(element, { highlight: 'stall-slug', compact: true })
(function () {
  const FLOOR_M = 3.6;
  const ELEV_3D = 36; // camera angle above the ground, degrees (90 = straight down)
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Where the food is. Building numbers and labels come from data/SOURCES.md.
  const SPOTS = [
    {
      key: 'b15', num: '15', title: 'Main Cafeteria', sub: 'Building 15 · 30th Anniversary Building', icon: '🍱',
      label: 'verified', note: 'Thai, Japanese and Korean food (official student-support page).',
      stalls: [['main-cafeteria-japanese'], ['main-cafeteria-korean']],
      extras: [['Café Amazon', 'unverified', 'Listed "next to the canteen". Not in this demo.']],
    },
    {
      key: 'b4', num: '4', title: 'Thai Pavilion canteen', sub: 'Building 4 · Thai Pavilion', icon: '🍜',
      label: 'verified', note: 'Official map: cafeteria and a convenience store.',
      stalls: [['thai-pavilion-noodles']],
      extras: [['KFC', 'verified', 'On the official student-support page. Not in this demo.'], ['Convenience store', 'unverified', 'Official pages disagree: 7-Eleven or Lawson.']],
    },
    {
      key: 'b19', num: '19', title: 'Golden Jubilee Building', sub: 'Building 19 · 19 floors', icon: '☕',
      label: 'verified', note: 'The tallest building on campus.',
      stalls: [['sky-lounge', '9th floor'], ['hello-tea-coffee', '8th floor']],
      extras: [],
    },
    {
      key: 'b12', num: '12', title: 'Library building cafeteria', sub: 'Building 12 · Royal Majesty Jubilee', icon: '🍽️',
      label: 'unverified', note: 'A cafeteria is on the older official map only. It may have closed.',
      stalls: [], extras: [['Cafeteria', 'unverified', 'Not in this demo.']],
    },
    {
      key: 'gate', at: [24, -352], title: 'Siam Cafe', sub: 'Near the main entrance (approximate spot)', icon: '🧋',
      label: 'unverified', note: 'Described as "inside the university, first turn on the right". The exact building is not known.',
      stalls: [['siam-cafe']], extras: [], approx: true,
    },
  ];
  const UNPLACED = [['krua-sai-jai', 'Krua Sai Jai Cafe', 'Listed at Siam University, but no building is given.']];

  let dataPromise = null;
  const loadData = () => (dataPromise = dataPromise || fetch('/data/campus-map.json').then((r) => {
    if (!r.ok) throw new Error('map data');
    return r.json();
  }));

  // ---------- geometry helpers ----------
  const area2 = (p) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0);
  const centroid = (p) => [p.reduce((s, a) => s + a[0], 0) / p.length, p.reduce((s, a) => s + a[1], 0) / p.length];
  /** Keep only the parts of a long line that come near the campus. */
  function clipLine(pts, R) {
    const runs = [];
    let run = [];
    const near = (p) => Math.abs(p[0]) < R && Math.abs(p[1] + 100) < R;
    for (let i = 0; i < pts.length; i++) {
      if (near(pts[i]) || (i > 0 && near(pts[i - 1])) || (i < pts.length - 1 && near(pts[i + 1]))) run.push(pts[i]);
      else if (run.length) { if (run.length > 1) runs.push(run); run = []; }
    }
    if (run.length > 1) runs.push(run);
    return runs;
  }
  function hsl(h, s, l) { return `hsl(${h} ${s}% ${Math.max(0, Math.min(100, l)).toFixed(1)}%)`; }
  const insidePoly = (p, poly) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };

  function mount(root, opts = {}) {
    const { el } = CF;
    const compact = Boolean(opts.compact);
    root.classList.add('campus-map');
    if (compact) root.classList.add('is-compact');

    const stage = el('div', { class: 'map-stage', role: 'application', 'aria-label': 'Interactive 3D map of Siam University. Drag to move, use the buttons to zoom and turn.' });
    const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgNode.setAttribute('class', 'map-svg');
    svgNode.setAttribute('aria-hidden', 'true');
    const pinLayer = el('div', { class: 'map-pins' });
    const loading = el('div', { class: 'map-loading' }, el('span', { class: 'spinner' }), 'Building the campus…');
    const btn = (label, text, onclick, extra = {}) => el('button', { class: 'map-btn', type: 'button', 'aria-label': label, title: label, onclick, ...extra }, text);
    const viewBtn = btn('Switch to flat 2D view', '2D', () => setView(target.elev > 60 ? '3d' : '2d'));
    const controls = el('div', { class: 'map-controls' },
      btn('Zoom in', '+', () => zoomBy(1.35)),
      btn('Zoom out', '−', () => zoomBy(1 / 1.35)),
      compact ? null : btn('Turn left', '⟲', () => turn(-45)),
      compact ? null : btn('Turn right', '⟳', () => turn(45)),
      viewBtn,
      btn('Reset view', '⌂', () => resetView()));
    const compass = el('div', { class: 'map-compass', 'aria-hidden': 'true' }, el('span', {}, 'N'));
    const touch = window.matchMedia('(pointer: coarse)').matches;
    const hint = el('div', { class: 'map-hint' }, compact ? 'Drag to look around · tap a pin'
      : touch ? 'Drag to move · pinch to zoom · tap a pin' : 'Drag to move · Ctrl + scroll to zoom · click a pin');
    stage.append(svgNode, pinLayer, controls, compass, hint, loading);

    const card = el('div', { class: 'map-card', 'aria-live': 'polite' });
    const credit = el('p', { class: 'map-credit' },
      'Map: ', el('a', { href: 'https://www.openstreetmap.org/way/177938414', target: '_blank', rel: 'noopener' }, '© OpenStreetMap contributors'),
      ' (ODbL). Building outlines are real; heights are estimates except Building 19 (19 floors).');
    root.replaceChildren(stage, card, credit);

    // ---------- state ----------
    let data = null;
    let buildings = [];
    let trees = []; // [x, y, radius, height] in metres
    let lines = [];
    let campus = [];
    let stalls = new Map(); // slug -> stall from /api/stalls
    let selected = opts.highlight ? SPOTS.find((s) => s.stalls.some(([slug]) => slug === opts.highlight)) || null : null;
    const DEFAULT = { angle: -28, elev: ELEV_3D, zoom: 1, fx: 5, fy: -105 };
    const cam = { ...DEFAULT, angle: DEFAULT.angle - 50, elev: 80, zoom: 0.92 };
    const target = { ...DEFAULT };
    let grow = reduceMotion() ? 1 : 0;
    let growStart = 0;
    let W = 0, H = 0;
    let raf = 0;
    let started = false;
    let showingBuilding = false;

    function spotPoint(s) {
      if (s.at) return { x: s.at[0], y: s.at[1], z: 4 };
      const b = buildings.find((x) => x.num === s.num);
      return b ? { x: b.c[0], y: b.c[1], z: b.h } : null;
    }

    // ---------- projection ----------
    function projector(c) {
      const a = (c.angle * Math.PI) / 180, e = (c.elev * Math.PI) / 180;
      const ca = Math.cos(a), sa = Math.sin(a), se = Math.sin(e), ce = Math.cos(e);
      const raw = (x, y, z) => {
        const rx = x * ca - y * sa, ry = x * sa + y * ca;
        return [rx, -ry * se - z * ce, ry];
      };
      // Fit the whole campus (with building tops) into the stage.
      const f = raw(DEFAULT.fx, DEFAULT.fy, 0);
      let mx = 1, my = 1;
      for (const p of campus) { const q = raw(p[0], p[1], 0); mx = Math.max(mx, Math.abs(q[0] - f[0])); my = Math.max(my, Math.abs(q[1] - f[1])); }
      for (const b of buildings) { const q = raw(b.c[0], b.c[1], b.h); my = Math.max(my, Math.abs(q[1] - f[1])); }
      const base = Math.min((W * 0.5 - 18) / mx, (H * 0.5 - 30) / my);
      const S = base * c.zoom;
      const fc = raw(c.fx, c.fy, 0);
      const proj = (x, y, z = 0) => {
        const q = raw(x, y, z);
        return [W / 2 + (q[0] - fc[0]) * S, H / 2 + (q[1] - fc[1]) * S, q[2]];
      };
      return { proj, S, ca, sa, se, ce };
    }

    // ---------- drawing ----------
    function draw() {
      if (!data || !W) return;
      const { proj, S, ca, sa } = projector(cam);
      const P = (p, z) => proj(p[0], p[1], z);
      const pts = (arr, z = 0) => arr.map((p) => { const q = P(p, z); return `${q[0].toFixed(1)},${q[1].toFixed(1)}`; }).join(' ');
      let out = '';

      // Ground
      out += `<rect x="0" y="0" width="${W}" height="${H}" class="m-ground"/>`;
      out += `<polygon points="${pts(campus)}" class="m-campus"/>`;
      for (const g of data.green) out += `<polygon points="${pts(g.pts)}" class="m-green"/>`;
      for (const l of lines) {
        const width = Math.max(l.kind === 'water' ? 1.5 : 0.6, l.w * S);
        out += `<polyline points="${pts(l.pts, l.z || 0)}" class="m-${l.cls}" stroke-width="${width.toFixed(1)}"/>`;
        if (l.cls === 'rail') out += `<polyline points="${pts(l.pts, l.z)}" class="m-rail-top" stroke-width="${Math.max(0.5, width * 0.25).toFixed(1)}"/>`;
      }
      // Entrance marker
      const gate = P([10, -392], 0);
      out += `<circle cx="${gate[0].toFixed(1)}" cy="${gate[1].toFixed(1)}" r="${Math.max(3, 5 * S).toFixed(1)}" class="m-gate"/>`;

      // Buildings and trees, far to near (painter's algorithm)
      const lightX = 0.55, lightY = -0.83;
      const selNum = selected && selected.num;
      const items = buildings.map((b) => ({ b, d: b.c[0] * sa + b.c[1] * ca }));
      if (S > 0.3) for (const t of trees) items.push({ t, d: t[0] * sa + t[1] * ca });
      items.sort((p, q) => q.d - p.d);
      const showWindows = S > 0.75;
      const f = (n) => n.toFixed(1);
      for (const it of items) {
        if (it.t) {
          const [tx, ty, r, th] = it.t;
          const k = Math.min(1, grow * 1.3);
          const base = P([tx, ty], 0), top = P([tx, ty], th * k);
          const rr = Math.max(1.4, r * S * (0.4 + 0.6 * k));
          out += `<ellipse cx="${f(base[0] + rr * 0.6)}" cy="${f(base[1])}" rx="${f(rr)}" ry="${f(rr * 0.45)}" class="m-tshadow"/>`;
          out += `<line x1="${f(base[0])}" y1="${f(base[1])}" x2="${f(top[0])}" y2="${f(top[1])}" class="m-trunk" stroke-width="${f(Math.max(0.8, 0.45 * S))}"/>`;
          out += `<circle cx="${f(top[0])}" cy="${f(top[1])}" r="${f(rr)}" class="m-tree"/>`;
          out += `<circle cx="${f(top[0] - rr * 0.3)}" cy="${f(top[1] - rr * 0.32)}" r="${f(rr * 0.5)}" class="m-tree-hi"/>`;
          continue;
        }
        const { b } = it;
        const k = Math.max(0, Math.min(1, (grow * 1.6) - b.delay));
        const eased = 1 - Math.pow(1 - k, 3);
        const h = Math.max(0.3, b.h * eased);
        const isSel = b.num && b.num === selNum;
        // Concrete walls; food buildings warm sand; the selected one jade.
        const hue = isSel ? 152 : b.food ? 34 : 40;
        const sat = isSel ? 55 : b.food ? 62 : 10;
        const lig = isSel ? 44 : b.food ? 72 : 88;
        // Shadow on the ground
        out += `<polygon points="${pts(b.pts.map((p) => [p[0] + h * 0.35, p[1] - h * 0.5]))}" class="m-shadow"/>`;
        const walls = [];
        const n = b.pts.length;
        for (let i = 0; i < n; i++) {
          const a = b.pts[i], c = b.pts[(i + 1) % n];
          const dx = c[0] - a[0], dy = c[1] - a[1];
          const len = Math.hypot(dx, dy) || 1;
          const nx = dy / len, ny = -dx / len; // outward normal (polygon is counter-clockwise)
          const facing = nx * sa + ny * ca; // < 0 means the wall faces the camera
          if (facing >= 0) continue;
          const light = 0.5 + 0.5 * Math.max(0, nx * lightX + ny * lightY);
          const mid = ((a[0] + c[0]) / 2) * sa + ((a[1] + c[1]) / 2) * ca;
          let win = '';
          // One row of windows per floor
          if (showWindows && eased > 0.9 && len > 5) {
            const a2 = [a[0] + dx * 0.07, a[1] + dy * 0.07], c2 = [a[0] + dx * 0.93, a[1] + dy * 0.93];
            const wl = isSel ? 30 : 30 + light * 22;
            for (let fl = 0; fl < b.floors; fl++) {
              const z0 = fl * FLOOR_M + 1.2, z1 = z0 + 1.5;
              if (z1 > h - 0.4) break;
              win += `<polygon points="${pts([a2, c2], z0)} ${pts([c2, a2], z1)}" fill="hsl(206 32% ${wl.toFixed(0)}%)" class="m-win"/>`;
            }
          }
          walls.push({ mid, d: `${pts([a, c], 0)} ${pts([c, a], h)}`, l: lig - 26 + light * 18, win });
        }
        walls.sort((p, q) => q.mid - p.mid);
        for (const w of walls) out += `<polygon points="${w.d}" fill="${hsl(hue, sat, w.l)}" class="m-wall"/>${w.win}`;
        const roofCls = `m-roof${isSel ? ' is-sel' : ''}${b.food ? ' is-food' : ''}`;
        if (b.thai && eased > 0.2) {
          // Thai-style pyramid roof in terracotta with gold edges (Building 4, Thai Pavilion)
          const apexH = h + 7 * eased;
          const faces = [];
          for (let i = 0; i < n; i++) {
            const a = b.pts[i], c = b.pts[(i + 1) % n];
            const dx = c[0] - a[0], dy = c[1] - a[1];
            const len = Math.hypot(dx, dy) || 1;
            const nx = dy / len, ny = -dx / len;
            const light = 0.5 + 0.5 * Math.max(0, nx * lightX + ny * lightY);
            const mid = ((a[0] + c[0] + b.c[0]) / 3) * sa + ((a[1] + c[1] + b.c[1]) / 3) * ca;
            const A = P(a, h), C = P(c, h), T = P(b.c, apexH);
            faces.push({ mid, d: `${f(A[0])},${f(A[1])} ${f(C[0])},${f(C[1])} ${f(T[0])},${f(T[1])}`, l: 36 + light * 16 });
          }
          faces.sort((p, q) => q.mid - p.mid);
          for (const fc of faces) out += `<polygon points="${fc.d}" fill="${isSel ? hsl(152, 50, fc.l) : hsl(12, 62, fc.l)}" class="${roofCls} m-thai" data-num="${b.num}"/>`;
          const T = P(b.c, apexH);
          out += `<path d="M${f(T[0])} ${f(T[1])} q1.5 -6 5 -7" class="m-chofa"/>`;
        } else {
          out += `<polygon points="${pts(b.pts, h)}" fill="${hsl(hue, Math.max(0, sat - 4), lig + 5)}" class="${roofCls}" data-num="${b.num || ''}"/>`;
          // Parapet: a slightly darker inset on the roof
          if (eased > 0.9 && S > 0.5) {
            const inset = b.pts.map((p) => [b.c[0] + (p[0] - b.c[0]) * 0.86, b.c[1] + (p[1] - b.c[1]) * 0.86]);
            out += `<polygon points="${pts(inset, h)}" fill="${hsl(hue, Math.max(0, sat - 6), lig - 2)}" class="m-parapet"/>`;
          }
        }
        if (b.num && S > 0.55 && eased > 0.95) {
          const q = P(b.c, b.thai ? h + 3 : h);
          out += `<text x="${f(q[0])}" y="${f(q[1] + 3.5)}" class="m-num${isSel ? ' is-sel' : ''}">${b.num}</text>`;
        }
      }
      svgNode.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svgNode.innerHTML = out;

      // Pins (HTML, so they are real buttons)
      for (const s of SPOTS) {
        const node = s.node;
        const p = spotPoint(s);
        if (!node || !p) continue;
        const b = s.num && buildings.find((x) => x.num === s.num);
        const k = b ? Math.max(0, Math.min(1, (grow * 1.6) - b.delay)) : grow;
        const q = proj(p.x, p.y, p.z * (1 - Math.pow(1 - k, 3)) + 2);
        node.style.transform = `translate(${q[0].toFixed(1)}px, ${q[1].toFixed(1)}px)`;
        node.style.zIndex = String(1000 + Math.round(q[1]));
        node.classList.toggle('is-sel', s === selected);
      }
      compass.style.transform = `rotate(${-cam.angle}deg)`;
    }

    // ---------- animation loop ----------
    function frame(t) {
      raf = 0;
      if (!started) { draw(); return; }
      let moving = false;
      if (grow < 1) {
        if (!growStart) growStart = t;
        grow = Math.min(1, (t - growStart) / 1500);
        moving = true;
      }
      for (const key of ['angle', 'elev', 'zoom', 'fx', 'fy']) {
        const diff = target[key] - cam[key];
        if (Math.abs(diff) > (key === 'zoom' ? 0.001 : 0.05)) { cam[key] += diff * 0.14; moving = true; } else cam[key] = target[key];
      }
      draw();
      if (moving) raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const jump = () => { Object.assign(cam, target); kick(); };

    function zoomBy(f) { target.zoom = Math.max(0.7, Math.min(5, target.zoom * f)); reduceMotion() ? jump() : kick(); }
    function turn(deg) { target.angle += deg; reduceMotion() ? jump() : kick(); }
    function setView(v) {
      target.elev = v === '2d' ? 89.9 : ELEV_3D;
      viewBtn.textContent = v === '2d' ? '3D' : '2D';
      viewBtn.setAttribute('aria-label', v === '2d' ? 'Switch to 3D view' : 'Switch to flat 2D view');
      viewBtn.title = viewBtn.getAttribute('aria-label');
      reduceMotion() ? jump() : kick();
    }
    function resetView() {
      Object.assign(target, { ...DEFAULT, angle: Math.round((target.angle - DEFAULT.angle) / 360) * 360 + DEFAULT.angle });
      setView('3d');
      select(null, false);
    }
    function focusOn(s) {
      const p = spotPoint(s);
      if (!p) return;
      target.fx = p.x; target.fy = p.y - 10;
      target.zoom = Math.max(target.zoom, compact ? 1.9 : 1.7);
      reduceMotion() ? jump() : kick();
    }

    // ---------- pins + info card ----------
    function spotState(s) {
      const list = s.stalls.map(([slug]) => stalls.get(slug)).filter(Boolean);
      if (!list.length) return 'info';
      if (list.some((x) => x.state === 'open' && x.acceptsOrders)) return 'open';
      if (list.some((x) => x.acceptsOrders)) return 'later';
      return 'closed';
    }
    const STATE_TEXT = { open: 'Open now', later: 'Pre-order', closed: 'Closed', info: 'Info only' };

    function buildPins() {
      pinLayer.replaceChildren();
      SPOTS.forEach((s, i) => {
        s.node = el('button', {
          class: `map-pin${s.approx ? ' is-approx' : ''}`, type: 'button', style: `--d:${300 + i * 120}ms`,
          onclick: () => select(s, true),
        }, el('span', { class: 'pin-head' }, el('span', { class: 'pin-icon', 'aria-hidden': 'true' }, s.icon)),
        el('span', { class: 'pin-label' }, s.title));
        pinLayer.append(s.node);
      });
      refreshPins();
    }
    function refreshPins() {
      for (const s of SPOTS) {
        if (!s.node) continue;
        const st = spotState(s);
        s.node.dataset.state = st;
        s.node.setAttribute('aria-label', `${s.title}, ${s.sub}. ${STATE_TEXT[st]}.`);
        s.node.setAttribute('aria-pressed', String(s === selected));
      }
    }

    function stallRow(slug, floor) {
      const s = stalls.get(slug);
      if (!s) return null;
      return el('li', { class: 'map-stall' },
        Kiosk.svg(s, { size: 58 }),
        el('div', { class: 'grow' },
          el('a', { href: `/stall?id=${s.id}`, class: 'name' }, s.name),
          el('div', { class: 'muted small' }, [s.cuisine, floor, s.stateText].filter(Boolean).join(' · '))),
        CF.stallBadge(s));
    }

    function renderCard() {
      showingBuilding = false;
      if (!selected) {
        const open = SPOTS.filter((s) => spotState(s) === 'open').length;
        card.replaceChildren(...[
          el('div', { class: 'map-card-head' },
            el('div', {}, el('h3', {}, 'Food on campus'),
              el('p', { class: 'muted small' }, open ? `${open} place${open === 1 ? '' : 's'} taking orders now. Tap a pin to see the stalls.` : 'Nothing is open for ordering right now. Tap a pin to see the stalls.'))),
          el('div', { class: 'map-spots' }, SPOTS.map((s) => el('button', {
            class: 'spot-chip', type: 'button', 'data-state': spotState(s), onclick: () => select(s, true),
          }, el('span', { 'aria-hidden': 'true' }, s.icon), el('span', {}, s.title), el('span', { class: 'dot' })))),
          compact ? null : el('p', { class: 'muted small' }, 'Not on the map: ', UNPLACED.map(([slug, name, why]) => {
            const st = stalls.get(slug);
            return el('span', {}, st ? el('a', { href: `/stall?id=${st.id}` }, name) : name, ` (${why})`);
          }))].filter(Boolean));
        return;
      }
      const s = selected;
      card.replaceChildren(...[
        el('div', { class: 'map-card-head' },
          el('span', { class: 'spot-icon', 'aria-hidden': 'true' }, s.icon),
          el('div', { class: 'grow' }, el('h3', {}, s.title), el('p', { class: 'muted small' }, s.sub, ' ', CF.labelChip(s.label))),
          el('button', { class: 'map-close', type: 'button', 'aria-label': 'Close', onclick: () => select(null, true) }, '×')),
        el('p', { class: 'small' }, s.note),
        s.stalls.length ? el('ul', { class: 'map-stalls' }, s.stalls.map(([slug, floor]) => stallRow(slug, floor))) : null,
        s.extras.length ? el('ul', { class: 'map-extras' }, s.extras.map(([name, label, note]) => el('li', {},
          el('strong', {}, name), ' ', el('span', { class: 'label-chip' }, 'info only'), ' ', CF.labelChip(label), note ? el('span', { class: 'muted small' }, ` ${note}`) : null))) : null,
        el('a', {
          class: 'small', target: '_blank', rel: 'noopener',
          href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.num ? `Siam University Building ${s.num}` : 'Siam University')}`,
        }, 'Open in Google Maps ↗')].filter(Boolean));
    }

    function select(s, move) {
      selected = s;
      refreshPins();
      renderCard();
      if (s && move) focusOn(s);
      if (!s && move) { Object.assign(target, { fx: DEFAULT.fx, fy: DEFAULT.fy, zoom: 1 }); kick(); }
      kick();
    }

    // ---------- input: drag, pinch, wheel, tap a building ----------
    const pointers = new Map();
    let pinchStart = null;
    let dragMoved = 0;
    stage.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      stage.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragMoved = 0;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: target.zoom };
      }
      stage.classList.add('is-dragging');
    });
    stage.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, cur);
      if (pointers.size === 2 && pinchStart) {
        const [a, b] = [...pointers.values()];
        target.zoom = cam.zoom = Math.max(0.7, Math.min(5, pinchStart.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinchStart.d)));
        kick();
        return;
      }
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      const { S, ca, sa, se } = projector(cam);
      const drx = dx / S, dry = -dy / (S * Math.max(0.3, se));
      const wx = drx * ca + dry * sa, wy = -drx * sa + dry * ca;
      target.fx = cam.fx = Math.max(-220, Math.min(230, cam.fx - wx));
      target.fy = cam.fy = Math.max(-420, Math.min(200, cam.fy - wy));
      kick();
    });
    const endPointer = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = null;
      if (!pointers.size) stage.classList.remove('is-dragging');
    };
    stage.addEventListener('pointerup', (e) => {
      // A tap (not a drag) on a building selects the food spot there, if any.
      if (dragMoved < 6 && pointers.size === 1) {
        const hit = document.elementFromPoint(e.clientX, e.clientY);
        const num = hit && hit.getAttribute && hit.getAttribute('data-num');
        const spot = num && SPOTS.find((s) => s.num === num);
        if (spot) select(spot, true);
        else if (num) showBuilding(num);
      }
      endPointer(e);
    });
    stage.addEventListener('pointercancel', endPointer);
    stage.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) return; // plain scrolling keeps scrolling the page
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });
    stage.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) zoomBy(1.6); });

    function showBuilding(num) {
      const b = buildings.find((x) => x.num === num);
      if (!b) return;
      selected = null;
      refreshPins();
      showingBuilding = true;
      card.replaceChildren(...[
        el('div', { class: 'map-card-head' },
          el('span', { class: 'spot-icon bldg', 'aria-hidden': 'true' }, num),
          el('div', { class: 'grow' }, el('h3', {}, b.name || `Building ${num}`), el('p', { class: 'muted small', lang: 'th' }, b.nameTh || '')),
          el('button', { class: 'map-close', type: 'button', 'aria-label': 'Close', onclick: () => select(null, true) }, '×')),
        el('p', { class: 'small muted' }, num === '16'
          ? 'OpenStreetMap names this building "โภชนาคาร" (dining hall). The official pages put the Main Cafeteria in Building 15, so this demo uses 15.'
          : 'No food stalls are listed in this building.')].filter(Boolean));
      target.fx = b.c[0]; target.fy = b.c[1];
      kick();
    }

    /**
     * Trees on open campus ground (decoration: positions are not from OSM).
     * A fixed pseudo-random pattern so they stay put between visits.
     */
    function plantTrees() {
      const out = [];
      const distSeg = (p, a, c) => {
        const dx = c[0] - a[0], dy = c[1] - a[1];
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
        return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
      };
      const nearLine = (p) => lines.some((l) => (l.cls === 'lane' || l.cls === 'road') && l.pts.some((q, i) => i > 0 && distSeg(p, l.pts[i - 1], q) < l.w / 2 + 3));
      const nearBuilding = (p) => buildings.some((b) => insidePoly(p, b.pts.map((q) => [b.c[0] + (q[0] - b.c[0]) * 1.35, b.c[1] + (q[1] - b.c[1]) * 1.35])) || Math.hypot(p[0] - b.c[0], p[1] - b.c[1]) < 9);
      let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let x = -150; x <= 165; x += 15) {
        for (let y = -385; y <= 178; y += 15) {
          const p = [x + (rnd() - 0.5) * 10, y + (rnd() - 0.5) * 10];
          if (!insidePoly(p, campus) || nearBuilding(p) || nearLine(p)) continue;
          out.push([p[0], p[1], 2.6 + rnd() * 1.8, 5 + rnd() * 3.5]);
        }
      }
      return out;
    }

    // ---------- size + data ----------
    const ro = new ResizeObserver(() => {
      const r = stage.getBoundingClientRect();
      W = Math.round(r.width); H = Math.round(r.height);
      kick();
    });
    ro.observe(stage);

    async function loadStalls() {
      const { ok, data: d } = await CF.api('/api/stalls');
      if (!ok) return;
      stalls = new Map(d.stalls.map((s) => [s.slug, s]));
      refreshPins();
      if (!showingBuilding) renderCard();
    }

    // Start the intro animation only when the map scrolls into view.
    const start = () => {
      if (started) return;
      started = true;
      growStart = 0;
      if (selected) { const p = spotPoint(selected); if (p) Object.assign(target, { fx: p.x, fy: p.y - 10, zoom: compact ? 1.9 : 1.7 }); }
      kick();
    };

    loadData().then((d) => {
      data = d;
      campus = d.campus;
      const foodNums = new Set(SPOTS.map((s) => s.num).filter(Boolean));
      buildings = d.buildings.map((b) => {
        const p = area2(b.pts) < 0 ? [...b.pts].reverse() : b.pts; // make counter-clockwise
        const c = centroid(p);
        return { ...b, pts: p, c, h: b.floors * FLOOR_M, food: foodNums.has(b.num), thai: b.num === '4', delay: Math.min(0.6, Math.hypot(c[0], c[1] + 100) / 600) };
      });
      const R = 520;
      lines = [];
      for (const r of d.roads) {
        const w = { primary: 16, residential: 6, service: 4, unclassified: 5, footway: 1.6, pedestrian: 3 }[r.kind] || 4;
        const campusRoad = r.pts.some((p) => insidePoly(p, campus));
        for (const run of clipLine(r.pts, R)) lines.push({ cls: r.kind === 'footway' ? 'path' : campusRoad ? 'lane' : 'road', w, pts: run });
      }
      for (const wv of d.water) for (const run of clipLine(wv.pts, R)) lines.push({ cls: 'water', kind: 'water', w: 9, pts: run });
      for (const rl of d.rail) for (const run of clipLine(rl.pts, R)) lines.push({ cls: 'rail', w: 9, z: 12, pts: run });
      trees = plantTrees();
      loading.remove();
      buildPins();
      renderCard();
      if ('IntersectionObserver' in window && !reduceMotion()) {
        const io = new IntersectionObserver((entries) => { if (entries.some((x) => x.isIntersecting)) { start(); io.disconnect(); } }, { threshold: 0.25 });
        io.observe(stage);
      } else { grow = 1; start(); }
      kick();
    }).catch(() => {
      loading.textContent = 'The campus map could not load. The list of places below still works.';
    });
    loadStalls();
    setInterval(loadStalls, 60000);
    renderCard();

    return { select: (slug) => select(SPOTS.find((s) => s.stalls.some(([x]) => x === slug)) || null, true) };
  }

  window.CampusMap = { mount, SPOTS };
})();
