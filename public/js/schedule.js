// Time rules shared by the server and the browser: Bangkok clock, opening
// hours, pickup-slot availability and the order countdown.
// Bangkok is UTC+7 all year (no daylight saving), so no time-zone library is needed.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Schedule = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
  const MAX_CLOCK_SHIFT_MS = 8 * 24 * 60 * 60 * 1000; // demo clock may move at most 8 days
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const SLOT_MINUTES = 15;
  const READY_HOLD_MINUTES = 60; // after the pickup window, an uncollected order stays "Ready" this long

  /** 'HH:MM' -> minutes after midnight. */
  const toMin = (hhmm) => {
    const [h, m] = String(hhmm).split(':').map(Number);
    return h * 60 + m;
  };
  /** minutes after midnight -> 'HH:MM'. */
  const toHHMM = (min) => {
    const m = Math.floor(min);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };

  /** Bangkok clock reading for a UTC millisecond time. */
  function clockAt(ms) {
    const d = new Date(ms + BKK_OFFSET_MS);
    const minutes = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
    return {
      ms,
      date: d.toISOString().slice(0, 10), // Bangkok calendar date
      weekday: d.getUTCDay(), // 0 = Sunday
      minutes, // fractional minutes after midnight
      hhmm: toHHMM(minutes),
      label: `${DAY_NAMES[d.getUTCDay()]} ${toHHMM(minutes)}`,
    };
  }

  /** Keep a demo-clock shift within limits; anything invalid means "live time". */
  function safeOffset(offsetMs) {
    const n = Number(offsetMs);
    if (!Number.isFinite(n)) return 0;
    return Math.max(-MAX_CLOCK_SHIFT_MS, Math.min(MAX_CLOCK_SHIFT_MS, Math.round(n)));
  }

  /** Offset that moves the clock from `realMs` to the next `weekday` at `hhmm` (today counts). */
  function offsetFor(realMs, weekday, hhmm) {
    const now = clockAt(realMs);
    const days = (Number(weekday) - now.weekday + 7) % 7;
    return Math.round((days * 1440 + toMin(hhmm) - now.minutes) * 60000);
  }

  /** Opening hours for one weekday: { open, close } in minutes, or null if closed that day. */
  function hoursFor(stall, weekday) {
    const h = stall.hours && stall.hours[String(weekday)];
    return h ? { open: toMin(h[0]), close: toMin(h[1]) } : null;
  }

  /** Human text such as "Mon–Fri 08:00–16:00 · Sat 09:00–16:00". */
  function hoursText(hours) {
    const groups = [];
    for (const d of [1, 2, 3, 4, 5, 6, 0]) {
      const h = hours[String(d)];
      if (!h) continue;
      const key = h.join('–');
      const last = groups[groups.length - 1];
      if (last && last.key === key && last.days[last.days.length - 1] === (d + 6) % 7) last.days.push(d);
      else groups.push({ key, days: [d] });
    }
    return groups.map((g) => {
      const first = DAY_NAMES[g.days[0]];
      const end = DAY_NAMES[g.days[g.days.length - 1]];
      return `${g.days.length > 1 ? `${first}–${end}` : first} ${g.key}`;
    }).join(' · ');
  }

  /**
   * Where a stall stands right now.
   * state: 'open' | 'opens_later' (pre-order) | 'closed_now' (after hours) | 'closed_day' | 'closed_today' (vendor)
   */
  function stallState(stall, clock) {
    const h = hoursFor(stall, clock.weekday);
    if (!stall.isOpenToday) return { state: 'closed_today', isOpenNow: false, text: stall.closedNote || 'Closed today' };
    if (!h) return { state: 'closed_day', isOpenNow: false, text: `Closed on ${FULL_DAY_NAMES[clock.weekday]}s` };
    if (clock.minutes < h.open) return { state: 'opens_later', isOpenNow: false, text: `Opens at ${toHHMM(h.open)} · pre-order now` };
    if (clock.minutes >= h.close) return { state: 'closed_now', isOpenNow: false, text: `Closed for today (closed at ${toHHMM(h.close)})` };
    return { state: 'open', isOpenNow: true, text: `Open now · closes ${toHHMM(h.close)}` };
  }

  /**
   * Is one pickup slot available right now?
   * Unavailable when the stall is closed today, the slot is outside today's hours,
   * it has started already, there is not enough time to cook, the vendor paused it,
   * or it is full. Returns { available, reason }.
   */
  function slotState(stall, slot, clock, ordersInSlot = 0) {
    const h = hoursFor(stall, clock.weekday);
    const start = toMin(slot.start);
    if (!stall.isOpenToday || !h) return { available: false, reason: 'Closed' };
    if (start < h.open || start + SLOT_MINUTES > h.close) return { available: false, reason: 'Closed' };
    if (start <= clock.minutes) return { available: false, reason: 'Past' };
    if (start < clock.minutes + stall.prepMinutes) return { available: false, reason: 'Too soon' };
    if (slot.isBlocked) return { available: false, reason: 'Paused' };
    if (ordersInSlot >= slot.capacity) return { available: false, reason: 'Full' };
    return { available: true, reason: null };
  }

  /** Statuses after which nothing more happens to an order. */
  const FINAL_STATUSES = ['COLLECTED', 'CANCELLED', 'NO_SHOW'];

  /**
   * Live view of an order. The STATUS is the one saved on the server, set by
   * the vendor (Received -> Preparing -> Ready -> Collected, or Cancelled /
   * No-show). The clock only drives the countdown to the pickup time and the
   * progress ring, so the page can tick every second without asking the server.
   */
  function orderStatus(order, clock) {
    const status = order.storedStatus || order.status || 'RECEIVED';
    if (FINAL_STATUSES.includes(status)) return { status, secondsToReady: 0, progress: 1, final: true, expired: false };
    const ready = toMin(order.pickupStart);
    const placed = order.placedMinutes;
    // Minutes since the order day began (handles the demo clock moving to another day).
    const dayShift = order.date === clock.date ? 0 : (order.date < clock.date ? 1e6 : -1e6);
    const now = clock.minutes + dayShift;
    const span = Math.max(1, ready - placed);
    const isReady = status === 'READY';
    const secondsToReady = isReady ? 0 : Math.max(0, Math.round((ready - now) * 60));
    const progress = isReady ? 1 : Math.min(1, Math.max(0, (now - placed) / span));
    const expired = now >= toMin(order.pickupEnd) + READY_HOLD_MINUTES;
    return { status, secondsToReady, progress, prepStart: toHHMM(ready - order.prepMinutes), expired, final: false };
  }

  /** 754 -> "12:34" (mm:ss), or "1 h 05 min" for long waits. */
  function formatCountdown(seconds) {
    const s = Math.max(0, Math.round(seconds));
    if (s >= 3600) return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} min`;
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    SLOT_MINUTES, DAY_NAMES, toMin, toHHMM, clockAt, safeOffset, offsetFor,
    hoursFor, hoursText, stallState, slotState, orderStatus, formatCountdown, FINAL_STATUSES,
  };
});
