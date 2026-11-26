// Time rules (public/js/schedule.js), shared by the server and the browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../public/js/schedule');

const stall = { isOpenToday: true, prepMinutes: 10, hours: { 1: ['08:00', '16:00'], 6: ['09:00', '16:00'] } };
const clock = (weekday, hhmm, date = '2026-11-23') => ({ weekday, minutes: S.toMin(hhmm), date });

test('Bangkok clock is UTC+7', () => {
  const c = S.clockAt(Date.UTC(2026, 10, 24, 17, 30)); // 17:30 UTC = 00:30 next day in Bangkok
  assert.equal(c.date, '2026-11-25');
  assert.equal(c.hhmm, '00:30');
  assert.equal(c.weekday, 3);
});

test('hours text groups days with the same hours', () => {
  assert.equal(S.hoursText(stall.hours), 'Mon 08:00–16:00 · Sat 09:00–16:00');
  const weekdays = { 1: ['10:00', '15:00'], 2: ['10:00', '15:00'], 3: ['10:00', '15:00'], 4: ['10:00', '15:00'], 5: ['10:00', '15:00'] };
  assert.equal(S.hoursText(weekdays), 'Mon–Fri 10:00–15:00');
});

test('slot rules: past, too soon, paused, full, outside hours, available', () => {
  const at = clock(1, '11:00');
  const slot = (start, extra = {}) => ({ start, capacity: 3, isBlocked: false, ...extra });
  assert.equal(S.slotState(stall, slot('10:45'), at).reason, 'Past');
  assert.equal(S.slotState(stall, slot('11:00'), at).reason, 'Past');
  assert.equal(S.slotState(stall, slot('11:05'), at).reason, 'Too soon');
  assert.equal(S.slotState(stall, slot('11:30', { isBlocked: true }), at).reason, 'Paused');
  assert.equal(S.slotState(stall, slot('11:30'), at, 3).reason, 'Full');
  assert.equal(S.slotState(stall, slot('16:00'), at).reason, 'Closed');
  assert.deepEqual(S.slotState(stall, slot('11:30'), at, 2), { available: true, reason: null });
  // Saturday opens at 09:00, so an 08:30 window does not exist that day.
  assert.equal(S.slotState(stall, slot('08:30'), clock(6, '07:00')).reason, 'Closed');
});

test('order timer counts down and moves Received -> Preparing -> Ready', () => {
  const order = { date: '2026-11-23', placedMinutes: S.toMin('11:00'), prepMinutes: 10, pickupStart: '11:30', pickupEnd: '11:45' };
  const a = S.orderStatus(order, clock(1, '11:05'));
  assert.equal(a.status, 'RECEIVED');
  assert.equal(a.secondsToReady, 25 * 60);
  assert.equal(S.formatCountdown(a.secondsToReady), '25:00');
  assert.equal(S.orderStatus(order, clock(1, '11:20')).status, 'PREPARING');
  const ready = S.orderStatus(order, clock(1, '11:31'));
  assert.equal(ready.status, 'READY');
  assert.equal(ready.secondsToReady, 0);
  assert.equal(S.orderStatus(order, clock(2, '09:00', '2026-11-24')).expired, true);
});

test('demo clock offset lands on the chosen weekday and time', () => {
  const real = Date.UTC(2026, 10, 26, 15, 0); // Thursday 22:00 in Bangkok
  const c = S.clockAt(real + S.offsetFor(real, 2, '11:45'));
  assert.equal(c.label, 'Tue 11:45');
  assert.equal(S.safeOffset('nope'), 0);
});
