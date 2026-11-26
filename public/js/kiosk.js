// 3D (isometric) models of each eating place, drawn as SVG with gradient
// lighting. Each place gets the kind of model that matches what it really is:
//   counter     – a food-court counter with steam trays under glass (cafeterias)
//   noodle      – a noodle cart with a big pot under a Thai-style roof (Thai Pavilion)
//   cafe        – a café bar with an espresso machine and cups (coffee / tea shops)
//   restaurant  – a glass-front dining room with tables (Sky Lounge)
// Open places have warm lights and steam; closed ones have the shutter down.
//   Kiosk.svg(stall, { size })  ->  <svg>
(function () {
  const NS = 'http://www.w3.org/2000/svg';

  // Colours are made up for this demo, chosen to tell the places apart.
  const THEMES = {
    'siam-cafe': { kind: 'cafe', main: '#8a5a3b', stripe: '#f3e3c7', sign: '#3b2416', food: '#c98b4a', short: 'Siam Cafe' },
    'krua-sai-jai': { kind: 'counter', main: '#2f8f5b', stripe: '#fdf6e3', sign: '#174d31', food: '#d9b25c', short: 'Krua Sai Jai' },
    'main-cafeteria-japanese': { kind: 'counter', main: '#c8372f', stripe: '#fff5ee', sign: '#7a1f1a', food: '#f0b848', short: 'Japanese' },
    'main-cafeteria-korean': { kind: 'counter', main: '#2f6fd6', stripe: '#f3f7ff', sign: '#17336b', food: '#e0573a', short: 'Korean' },
    'thai-pavilion-noodles': { kind: 'noodle', main: '#b8452a', stripe: '#fff4dc', sign: '#5a1d0e', food: '#f2c46b', short: 'Noodles' },
    'sky-lounge': { kind: 'restaurant', main: '#5b47b8', stripe: '#f4f0ff', sign: '#2a1d63', food: '#c9824a', short: 'Sky Lounge 9F' },
    'hello-tea-coffee': { kind: 'cafe', main: '#d9488f', stripe: '#fff0f7', sign: '#6e1846', food: '#c8915e', short: 'Hello Tea', tea: true },
  };
  const FALLBACK = { kind: 'counter', main: '#0e7a57', stripe: '#f2fbf6', sign: '#0a4d3a', food: '#e9b04f', short: 'Stall' };
  const theme = (slug) => THEMES[slug] || FALLBACK;

  /** Lighten (amt > 0) or darken (amt < 0) a hex colour. */
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const mix = (c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
    const r = mix(n >> 16), g = mix((n >> 8) & 255), b = mix(n & 255);
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Isometric point: u runs right-down, v runs left-down, h is height.
  const CX = 112, CY = 122;
  const P = (u, v, h) => [CX + (u - v) * 0.866, CY + (u + v) * 0.5 - h];
  const pt = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  const f1 = (n) => n.toFixed(1);

  let uid = 0;

  /** Builds one model. Gradients get ids unique to this SVG. */
  function builder() {
    const id = `k${++uid}`;
    const defs = [];
    let body = '';
    const grads = new Map();
    /** Vertical gradient (top light, bottom dark) for a colour. */
    function grad(color, top = 0.18, bottom = -0.18) {
      const key = `${color}|${top}|${bottom}`;
      if (!grads.has(key)) {
        const gid = `${id}g${grads.size}`;
        grads.set(key, gid);
        defs.push(`<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(color, top)}"/><stop offset="1" stop-color="${shade(color, bottom)}"/></linearGradient>`);
      }
      return `url(#${grads.get(key)})`;
    }
    const poly = (pts, fill, extra = '') => { body += `<polygon points="${pts.map(pt).join(' ')}" fill="${fill}" ${extra}/>`; };
    const raw = (s) => { body += s; };
    const face = (kind, u0, u1, v0, v1, h0, h1) => {
      if (kind === 'top') return [P(u0, v0, h1), P(u1, v0, h1), P(u1, v1, h1), P(u0, v1, h1)];
      if (kind === 'front') return [P(u0, v1, h0), P(u1, v1, h0), P(u1, v1, h1), P(u0, v1, h1)];
      return [P(u1, v0, h0), P(u1, v1, h0), P(u1, v1, h1), P(u1, v0, h1)];
    };
    /** A lit box: top lightest, front mid, side darkest. Colours must be #hex. */
    const box = (u0, u1, v0, v1, h0, h1, color) => {
      poly(face('side', u0, u1, v0, v1, h0, h1), grad(shade(color, -0.3), 0.05, -0.2));
      poly(face('front', u0, u1, v0, v1, h0, h1), grad(color, 0.12, -0.16));
      poly(face('top', u0, u1, v0, v1, h0, h1), shade(color, 0.25));
    };
    /** Vertical cylinder (pots, cups) centred at (u,v). Returns the top centre. */
    const cylinder = (u, v, h0, h1, r, color, opt = {}) => {
      const [x0, y0] = P(u, v, h0), [, y1] = P(u, v, h1);
      const ry = r * 0.5;
      const gid = `${id}c${defs.length}`;
      defs.push(`<linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shade(color, -0.25)}"/><stop offset=".35" stop-color="${shade(color, 0.35)}"/><stop offset=".6" stop-color="${color}"/><stop offset="1" stop-color="${shade(color, -0.35)}"/></linearGradient>`);
      const op = opt.opacity ? `opacity="${opt.opacity}"` : '';
      raw(`<path d="M${f1(x0 - r)} ${f1(y1)} L${f1(x0 - r)} ${f1(y0)} A${r} ${ry} 0 0 0 ${f1(x0 + r)} ${f1(y0)} L${f1(x0 + r)} ${f1(y1)} Z" fill="url(#${gid})" ${op}/>`);
      raw(`<ellipse cx="${f1(x0)}" cy="${f1(y1)}" rx="${r}" ry="${ry}" fill="${opt.top || shade(color, 0.3)}" ${op}/>`);
      return [x0, y1];
    };
    /** Text on a face that runs along u (v = const), skewed to sit on it. */
    const signText = (u, v, h, text, size, color = '#fff', weight = 700) => {
      const [x, y] = P(u, v, h);
      raw(`<text transform="translate(${f1(x)} ${f1(y)}) skewY(30)" text-anchor="middle" font-size="${size}" font-weight="${weight}" fill="${color}" font-family="IBM Plex Sans Thai, system-ui, sans-serif" dominant-baseline="middle">${esc(text)}</text>`);
    };
    const steam = (x, y) => raw(`<g class="k-steam" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".85"><path d="M${f1(x - 5)} ${f1(y)} q-5 -8 0 -15 q5 -7 0 -14"/><path d="M${f1(x + 6)} ${f1(y - 2)} q-5 -8 0 -15 q5 -7 0 -14"/></g>`);
    const finish = () => ({ defs: `<defs>${defs.join('')}<radialGradient id="${id}sh"><stop offset="0" stop-color="#1c1a16" stop-opacity=".28"/><stop offset="1" stop-color="#1c1a16" stop-opacity="0"/></radialGradient></defs>`, body });
    return { poly, raw, box, face, grad, cylinder, signText, steam, finish, id };
  }

  // ---------- shared parts ----------
  const W = 100, D = 46;

  /** Tiled floor platform the model stands on. */
  function platform(b) {
    b.box(-10, W + 10, -10, D + 20, -5, 0, '#d9d2c4');
    for (let u = 8; u < W + 10; u += 18) b.raw(`<polyline points="${pt(P(u, -10, 0))} ${pt(P(u, D + 20, 0))}" stroke="#c7bfaf" stroke-width=".6" fill="none"/>`);
    for (let v = 8; v < D + 20; v += 18) b.raw(`<polyline points="${pt(P(-10, v, 0))} ${pt(P(W + 10, v, 0))}" stroke="#c7bfaf" stroke-width=".6" fill="none"/>`);
  }

  /** Back wall, optionally tiled, seen through the opening. */
  function backWall(b, color, top = 92, tiles = false) {
    b.poly([P(-2, -2, 0), P(W + 2, -2, 0), P(W + 2, -2, top), P(-2, -2, top)], b.grad(color, 0.08, -0.08));
    b.poly([P(W + 2, -2, 0), P(W + 2, 6, 0), P(W + 2, 6, top), P(W + 2, -2, top)], shade(color, -0.22));
    if (tiles) {
      for (let h = 40; h < 70; h += 7) b.raw(`<polyline points="${pt(P(2, -2, h))} ${pt(P(W - 2, -2, h))}" stroke="${shade(color, -0.12)}" stroke-width=".7" fill="none"/>`);
      for (let u = 6; u < W; u += 9) b.raw(`<polyline points="${pt(P(u, -2, 36))} ${pt(P(u, -2, 70))}" stroke="${shade(color, -0.1)}" stroke-width=".5" fill="none"/>`);
    }
  }

  /** Dark menu board with price lines and little dish swatches. */
  function menuBoard(b, t, u0, u1, h0, h1) {
    b.poly([P(u0, -1, h0), P(u1, -1, h0), P(u1, -1, h1), P(u0, -1, h1)], '#26231f', `stroke="${shade(t.main, -0.2)}" stroke-width="1.4"`);
    const rows = 3;
    for (let i = 0; i < rows; i++) {
      const h = h1 - 4 - i * ((h1 - h0 - 6) / rows);
      b.poly([P(u0 + 4, -1, h), P(u0 + 10, -1, h), P(u0 + 10, -1, h - 4), P(u0 + 4, -1, h - 4)], [t.food, shade(t.food, -0.25), '#7fb85a'][i % 3]);
      b.raw(`<polyline points="${pt(P(u0 + 13, -1, h - 2))} ${pt(P(u1 - 14, -1, h - 2))}" stroke="#e9e2d2" stroke-width="1.2" opacity=".75" fill="none"/>`);
      b.raw(`<polyline points="${pt(P(u1 - 10, -1, h - 2))} ${pt(P(u1 - 4, -1, h - 2))}" stroke="#ffd27a" stroke-width="1.4" fill="none"/>`);
    }
  }

  function shutter(b, top) {
    b.poly([P(2, D, 36), P(W - 2, D, 36), P(W - 2, D, top), P(2, D, top)], b.grad('#c2bdb2', 0.1, -0.12));
    for (let h = 40; h < top; h += 5) b.raw(`<polyline points="${pt(P(2, D, h))} ${pt(P(W - 2, D, h))}" stroke="#8f897d" stroke-width="1.1" fill="none"/>`);
  }

  function closedTag(b, h = 58) {
    const [x, y] = P(W / 2, D + 1, h);
    b.raw(`<g transform="translate(${f1(x)} ${f1(y)}) skewY(30)"><rect x="-23" y="-9" width="46" height="18" rx="3" fill="#a8231a" stroke="#fff" stroke-width="1.2"/><text y="1" text-anchor="middle" dominant-baseline="middle" font-size="9.5" font-weight="800" fill="#fff" font-family="system-ui, sans-serif" letter-spacing=".5">CLOSED</text></g>`);
  }

  /** Warm light spill on the floor in front of an open place. */
  function lightSpill(b, lit) {
    if (!lit) return;
    const [x, y] = P(W / 2, D + 14, 0);
    b.raw(`<ellipse class="k-glow" cx="${f1(x)}" cy="${f1(y)}" rx="58" ry="20" fill="#ffd98a" opacity=".38"/>`);
  }

  function pendant(b, u, v, h, lit) {
    const [x, y] = P(u, v, h);
    b.raw(`<line x1="${f1(x)}" y1="${f1(y - 14)}" x2="${f1(x)}" y2="${f1(y)}" stroke="#3a332a" stroke-width="1"/>`);
    b.raw(`<path d="M${f1(x - 6)} ${f1(y + 5)} Q${f1(x)} ${f1(y - 4)} ${f1(x + 6)} ${f1(y + 5)} Z" fill="#2e2a24"/>`);
    b.raw(`<ellipse class="${lit ? 'k-lamp' : ''}" cx="${f1(x)}" cy="${f1(y + 5.5)}" rx="4" ry="2" fill="${lit ? '#ffe7a6' : '#9c958a'}"/>`);
    if (lit) b.raw(`<path d="M${f1(x - 6)} ${f1(y + 6)} L${f1(x - 16)} ${f1(y + 30)} L${f1(x + 16)} ${f1(y + 30)} L${f1(x + 6)} ${f1(y + 6)} Z" fill="#fff2c4" opacity=".22"/>`);
  }

  // ---------- models ----------

  /** Food-court counter: steel top, steam trays under a glass sneeze guard, light-box sign. */
  function counterModel(b, t, open, lit) {
    platform(b);
    lightSpill(b, lit);
    backWall(b, '#eee8dc', 96, true);
    menuBoard(b, t, 14, W - 14, 74, 92);
    if (!open) shutter(b, 92);
    // Counter body with brand panel and kick plate
    b.box(0, W, 4, D, 0, 34, t.main);
    b.poly(b.face('front', 0, W, 4, D, 0, 5), '#3b3832');
    b.poly(b.face('front', 6, W - 6, 4, D, 12, 26), b.grad(t.stripe, 0.05, -0.12));
    b.signText(W / 2, D, 19, t.short.toUpperCase(), 8, shade(t.main, -0.35), 800);
    // Stainless steel top
    b.box(-2, W + 2, 2, D + 3, 34, 37, '#b9bec4');
    // Steam trays (bain-marie) with food
    const foods = [t.food, shade(t.food, -0.3), '#6fae54', shade(t.main, 0.25)];
    for (let i = 0; i < 4; i++) {
      const u0 = 6 + i * 23, u1 = u0 + 19;
      b.poly([P(u0, 12, 37.2), P(u1, 12, 37.2), P(u1, 34, 37.2), P(u0, 34, 37.2)], '#8d949b');
      b.poly([P(u0 + 1.5, 13.5, 37.6), P(u1 - 1.5, 13.5, 37.6), P(u1 - 1.5, 32.5, 37.6), P(u0 + 1.5, 32.5, 37.6)], b.grad(foods[i], 0.2, -0.1));
      for (let k = 0; k < 3; k++) {
        const [x, y] = P(u0 + 5 + k * 5, 18 + (k % 2) * 8, 38);
        b.raw(`<circle cx="${f1(x)}" cy="${f1(y)}" r="1.6" fill="${shade(foods[i], -0.35)}" opacity=".7"/>`);
      }
      if (lit && (i === 0 || i === 2)) { const [x, y] = P(u0 + 9, 22, 40); b.steam(x, y - 2); }
    }
    // Glass sneeze guard
    b.poly([P(-1, 36, 38), P(W + 1, 36, 38), P(W + 1, 24, 62), P(-1, 24, 62)], 'rgba(220,240,255,.28)', 'stroke="rgba(255,255,255,.8)" stroke-width="1"');
    b.raw(`<polyline points="${pt(P(8, 33, 44))} ${pt(P(30, 28, 56))}" stroke="#fff" stroke-width="2" opacity=".55" fill="none" stroke-linecap="round"/>`);
    // Posts and light-box sign
    for (const u of [0, W - 3]) b.box(u, u + 3, D - 3, D, 37, 98, '#6b6f75');
    b.box(-4, W + 4, 30, D + 2, 98, 116, t.sign);
    b.poly(b.face('front', -4, W + 4, 30, D + 2, 100, 114), b.grad(t.main, 0.2, -0.1));
    b.signText(W / 2, D + 2, 107, t.short, t.short.length > 10 ? 9 : 11);
    pendant(b, 26, 22, 92, lit);
    pendant(b, 74, 22, 92, lit);
    if (!open) closedTag(b, 64);
  }

  /** Noodle cart with a big soup pot, glass noodle cabinet and a Thai-style roof. */
  function noodleModel(b, t, open, lit) {
    platform(b);
    lightSpill(b, lit);
    backWall(b, '#f1e6d2', 80);
    if (!open) shutter(b, 82);
    // Wooden cart body
    b.box(0, W, 4, D, 0, 34, '#9a5b2e');
    for (let h = 6; h < 34; h += 7) b.raw(`<polyline points="${pt(P(0, D, h))} ${pt(P(W, D, h))}" stroke="#7a4420" stroke-width=".8" opacity=".7" fill="none"/>`);
    b.poly(b.face('front', 30, W - 30, 4, D, 10, 26), '#fff4dc', 'stroke="#d4a23a" stroke-width="1.2"');
    b.signText(W / 2, D, 18, 'ก๋วยเตี๋ยว', 9, '#8a2b12', 800);
    b.box(-2, W + 2, 2, D + 3, 34, 37, '#c9c2b4');
    // Glass cabinet with noodles, fish balls and greens
    for (let i = 0; i < 3; i++) {
      const [x, y] = P(62 + i * 11, 24, 40);
      b.raw(`<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="5" ry="3" fill="${['#f2d38a', '#f4efe2', '#6fae54'][i]}"/>`);
    }
    b.poly(b.face('side', 56, W - 4, 10, 36, 37, 58), 'rgba(200,225,245,.35)', 'stroke="rgba(255,255,255,.85)" stroke-width="1"');
    b.poly(b.face('top', 56, W - 4, 10, 36, 37, 58), 'rgba(225,240,250,.45)', 'stroke="rgba(255,255,255,.85)" stroke-width="1"');
    b.poly(b.face('front', 56, W - 4, 10, 36, 37, 58), 'rgba(220,240,255,.3)', 'stroke="rgba(255,255,255,.9)" stroke-width="1"');
    // Big steel soup pot with ladle
    const [px, py] = b.cylinder(24, 24, 37, 62, 15, '#b7bcc2', { top: '#e7c98a' });
    b.raw(`<ellipse cx="${f1(px)}" cy="${f1(py)}" rx="12" ry="5" fill="#c98e3d" opacity=".85"/>`);
    b.raw(`<path d="M${f1(px + 4)} ${f1(py - 1)} l10 -22" stroke="#5d5d5d" stroke-width="2" stroke-linecap="round"/>`);
    if (lit) b.steam(px, py - 6);
    // Roof posts
    for (const u of [0, W - 3]) b.box(u, u + 3, D - 3, D, 37, 86, '#7a3d1c');
    // Thai-style gable roof: two slopes in terracotta with gold trim and curled tips
    const ridge = 112, eave = 84;
    b.poly([P(-8, -6, eave), P(W + 8, -6, eave), P(W + 8, 20, ridge), P(-8, 20, ridge)], b.grad('#c0482c', 0.15, -0.15));
    b.poly([P(-8, 20, ridge), P(W + 8, 20, ridge), P(W + 8, D + 12, eave), P(-8, D + 12, eave)], b.grad('#d4583a', 0.2, -0.05));
    for (let i = 1; i < 6; i++) { const u = -8 + ((W + 16) * i) / 6; b.raw(`<polyline points="${pt(P(u, 20, ridge))} ${pt(P(u, D + 12, eave))}" stroke="#9c3220" stroke-width=".8" fill="none"/>`); }
    // Gable end (triangle) facing right, with gold border
    b.poly([P(W + 8, -6, eave), P(W + 8, D + 12, eave), P(W + 8, 20, ridge)], '#7d2414', 'stroke="#e2b23c" stroke-width="2.2" stroke-linejoin="round"');
    b.raw(`<polyline points="${pt(P(-8, D + 12, eave))} ${pt(P(W + 8, D + 12, eave))}" stroke="#e2b23c" stroke-width="2.4" fill="none"/>`);
    // Chofa (curled finial) at the roof peak, and small tips at the eaves
    const [cx, cy] = P(W + 8, 20, ridge);
    b.raw(`<path d="M${f1(cx)} ${f1(cy)} q2 -10 8 -12 q-3 4 -1 7" fill="none" stroke="#e2b23c" stroke-width="2.4" stroke-linecap="round"/>`);
    for (const v of [-6, D + 12]) { const [ex, ey] = P(W + 8, v, eave); b.raw(`<path d="M${f1(ex)} ${f1(ey)} q4 -3 5 -8" fill="none" stroke="#e2b23c" stroke-width="2" stroke-linecap="round"/>`); }
    // Hanging sign
    b.box(26, W - 26, D + 8, D + 10, 70, 82, t.sign);
    b.signText(W / 2, D + 10, 76, t.short, 8.5);
    if (!open) closedTag(b, 58);
  }

  /** Café bar: wood-panel counter, espresso machine, cups and a striped awning. */
  function cafeModel(b, t, open, lit) {
    platform(b);
    lightSpill(b, lit);
    backWall(b, shade(t.stripe, -0.04), 90);
    // Shelf with jars / tea tins
    b.box(8, W - 8, -2, 6, 58, 60, '#8a6a48');
    for (let i = 0; i < 6; i++) {
      const [x, y] = P(14 + i * 13, 2, 60);
      b.raw(`<rect x="${f1(x - 4)}" y="${f1(y - 11)}" width="8" height="11" rx="2" fill="${i % 2 ? t.main : shade(t.main, 0.45)}"/>`);
    }
    menuBoard(b, t, 18, W - 18, 66, 86);
    if (!open) shutter(b, 84);
    // Counter with vertical wood planks
    b.box(0, W, 4, D, 0, 34, '#a8774c');
    for (let u = 6; u < W; u += 8) b.raw(`<polyline points="${pt(P(u, D, 1))} ${pt(P(u, D, 33))}" stroke="#865a34" stroke-width=".8" opacity=".8" fill="none"/>`);
    b.poly(b.face('front', 24, W - 24, 4, D, 14, 26), t.main, 'stroke="#fff" stroke-width="1"');
    b.signText(W / 2, D, 20, t.short, 7.5);
    b.box(-2, W + 2, 2, D + 3, 34, 37, '#3c3631');
    // Espresso machine
    b.box(8, 34, 10, 26, 37, 54, '#c4c9ce');
    b.poly(b.face('front', 10, 32, 10, 26, 40, 52), b.grad('#2f2c29', 0.15, -0.1));
    for (const u of [16, 26]) { const [x, y] = P(u, 27, 46); b.raw(`<rect x="${f1(x - 1.5)}" y="${f1(y)}" width="3" height="5" fill="#77797c"/>`); }
    if (lit) { const [x, y] = P(21, 26, 56); b.steam(x, y - 2); }
    // Cups: bubble tea cups (clear with pearls) or coffee cups
    for (let i = 0; i < 4; i++) {
      const u = 48 + i * 12, v = 22 + (i % 2) * 6;
      if (t.tea) {
        const [x, y] = b.cylinder(u, v, 37, 53, 4.5, i % 2 ? '#e9c9a6' : '#cfa77e', { top: '#f7efe4', opacity: '.95' });
        const [, yb] = P(u, v, 38);
        for (let k = 0; k < 4; k++) b.raw(`<circle cx="${f1(x - 3 + k * 2)}" cy="${f1(yb - 2 - (k % 2) * 2)}" r="1.3" fill="#3b2416"/>`);
        b.raw(`<line x1="${f1(x + 1)}" y1="${f1(y)}" x2="${f1(x + 3)}" y2="${f1(y - 9)}" stroke="${t.main}" stroke-width="1.6" stroke-linecap="round"/>`);
      } else {
        b.cylinder(u, v, 37, 45, 4, '#f4f1ea', { top: '#6b4226' });
      }
    }
    // Posts and striped awning with scalloped edge
    for (const u of [2, W - 4]) b.box(u, u + 3, D - 4, D - 1, 37, 88, shade(t.main, -0.25));
    const N = 8, A0 = -6, A1 = W + 6;
    for (let i = 0; i < N; i++) {
      const u0 = A0 + ((A1 - A0) * i) / N, u1 = A0 + ((A1 - A0) * (i + 1)) / N;
      const col = i % 2 ? t.stripe : t.main;
      b.poly([P(u0, -2, 104), P(u1, -2, 104), P(u1, D + 14, 86), P(u0, D + 14, 86)], b.grad(col, 0.1, -0.08));
      const a = P(u0, D + 14, 86), c = P(u1, D + 14, 86);
      b.raw(`<path d="M${pt(a)} Q${f1((a[0] + c[0]) / 2)},${f1((a[1] + c[1]) / 2 + 9)} ${pt(c)} Z" fill="${shade(col, -0.12)}"/>`);
    }
    b.poly([P(A1, -2, 104), P(A1, D + 14, 86), P(A1, D + 14, 82), P(A1, -2, 100)], shade(t.main, -0.35));
    // Sign board above the awning
    b.box(16, W - 16, -6, -2, 104, 124, t.sign);
    b.signText(W / 2, -2, 114, t.short, t.short.length > 10 ? 9 : 11);
    pendant(b, W - 16, D + 6, 80, lit);
    if (!open) closedTag(b, 60);
  }

  /** Glass-front restaurant room with tables, chairs and a city view. */
  function restaurantModel(b, t, open, lit) {
    platform(b);
    lightSpill(b, lit);
    b.poly(b.face('top', 0, W, 0, D + 8, 0, 0.5), '#b88a5e');
    // Back wall with a big window showing sky and city
    b.poly([P(0, 0, 0), P(W, 0, 0), P(W, 0, 84), P(0, 0, 84)], b.grad('#ece6f6', 0.05, -0.05));
    b.poly([P(8, 0, 34), P(W - 8, 0, 34), P(W - 8, 0, 76), P(8, 0, 76)], b.grad(lit ? '#8fc2ef' : '#53637d', 0.25, -0.05));
    for (let i = 0; i < 6; i++) {
      const u = 12 + i * 14, h = 40 + ((i * 7) % 18);
      b.poly([P(u, 0, 34), P(u + 9, 0, 34), P(u + 9, 0, h), P(u, 0, h)], lit ? '#6f8fb3' : '#3d4a61');
    }
    // Tables with chairs
    for (const [u, v] of [[24, 22], [62, 30]]) {
      b.cylinder(u + 4, v + 4, 0.5, 17, 1.4, '#5a3d2a');
      b.box(u - 5, u + 13, v - 5, v + 13, 17, 19, '#f7f3ea');
      b.cylinder(u + 4, v + 4, 19, 24, 2.4, '#ffffff', { top: lit ? '#ffcf5a' : '#cfc7b8' });
      b.box(u + 15, u + 21, v, v + 7, 0.5, 11, t.main);
      b.box(u + 19, u + 21, v, v + 7, 11, 24, shade(t.main, -0.1));
    }
    // Right wall + glass front with mullions and reflections
    b.poly([P(W, 0, 0), P(W, D + 8, 0), P(W, D + 8, 84), P(W, 0, 84)], 'rgba(205,225,245,.35)', 'stroke="#6d6a7a" stroke-width="1.2"');
    b.poly([P(0, D + 8, 0), P(W, D + 8, 0), P(W, D + 8, 84), P(0, D + 8, 84)], 'rgba(215,235,255,.22)', 'stroke="#6d6a7a" stroke-width="1.6"');
    for (let u = 25; u < W; u += 25) b.raw(`<polyline points="${pt(P(u, D + 8, 0))} ${pt(P(u, D + 8, 84))}" stroke="#6d6a7a" stroke-width="1.6" fill="none"/>`);
    b.raw(`<polyline points="${pt(P(6, D + 8, 20))} ${pt(P(20, D + 8, 64))}" stroke="#fff" stroke-width="2.5" opacity=".5" fill="none" stroke-linecap="round"/>`);
    b.raw(`<polyline points="${pt(P(56, D + 8, 14))} ${pt(P(68, D + 8, 44))}" stroke="#fff" stroke-width="1.6" opacity=".45" fill="none" stroke-linecap="round"/>`);
    // Roof slab and sign
    b.box(-4, W + 4, -4, D + 12, 84, 92, '#e8e4ee');
    b.box(14, W - 14, D + 10, D + 13, 92, 110, t.sign);
    b.signText(W / 2, D + 13, 101, t.short, 8.5);
    if (!open) closedTag(b, 46);
  }

  const MODELS = { counter: counterModel, noodle: noodleModel, cafe: cafeModel, restaurant: restaurantModel };

  /**
   * @param stall  { slug, state } from the API
   * @param opts.size  pixel width (height follows)
   */
  function svg(stall, opts = {}) {
    const t = theme(stall.slug);
    const open = stall.state === 'open' || stall.state === 'opens_later';
    const lit = stall.state === 'open';
    const b = builder();
    const [sx, sy] = P(W / 2, D / 2 + 6, 0);
    b.raw(`<ellipse cx="${f1(sx)}" cy="${f1(sy + 6)}" rx="104" ry="44" fill="url(#${b.id}sh)"/>`);
    (MODELS[t.kind] || counterModel)(b, t, open, lit);
    const out = b.finish();

    const node = document.createElementNS(NS, 'svg');
    node.setAttribute('viewBox', '0 0 224 236');
    node.setAttribute('class', `kiosk kind-${t.kind} ${lit ? 'is-lit' : ''} ${open ? '' : 'is-shut'}`);
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute('focusable', 'false');
    if (opts.size) { node.setAttribute('width', opts.size); node.setAttribute('height', Math.round(opts.size * 236 / 224)); }
    node.innerHTML = out.defs + out.body;
    return node;
  }

  /** Gentle 3D tilt that follows the pointer (mouse and pen only). */
  function tilt(node, max = 9) {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return node;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return node;
    node.classList.add('tilt');
    node.addEventListener('pointermove', (e) => {
      const r = node.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      node.style.setProperty('--ry', `${(x * max * 2).toFixed(2)}deg`);
      node.style.setProperty('--rx', `${(-y * max * 2).toFixed(2)}deg`);
      node.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(0)}%`);
      node.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(0)}%`);
    });
    node.addEventListener('pointerleave', () => {
      node.style.setProperty('--rx', '0deg');
      node.style.setProperty('--ry', '0deg');
    });
    return node;
  }

  window.Kiosk = { svg, tilt, theme, shade, THEMES };
})();
