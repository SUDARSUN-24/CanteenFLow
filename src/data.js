// Read helpers that turn database rows into the shapes the rules and API use.
const Schedule = require('../public/js/schedule');

/** Database row -> stall object used by the schedule rules. */
function toStall(row) {
  const hours = JSON.parse(row.hours_json);
  return {
    id: row.stall_id,
    slug: row.slug,
    name: row.name,
    nameTh: row.name_th,
    area: row.area,
    cuisine: row.cuisine,
    hours,
    hoursText: Schedule.hoursText(hours),
    hoursLabel: row.hours_label,
    prepMinutes: row.prep_minutes,
    isOpenToday: Boolean(row.is_open_today),
    closedNote: row.closed_note,
    description: row.description,
    dataLabel: row.data_label,
  };
}

function getStall(db, idOrSlug) {
  const row = db.prepare('SELECT * FROM stalls WHERE stall_id = ? OR slug = ?').get(Number(idOrSlug) || -1, String(idOrSlug));
  return row ? toStall(row) : null;
}

function allStalls(db) {
  return db.prepare('SELECT * FROM stalls ORDER BY stall_id').all().map(toStall);
}

/** Orders already booked per pickup window on one day: Map(slotId -> count). */
function slotUsage(db, date) {
  const rows = db.prepare(`SELECT pickup_slot_id AS id, COUNT(*) AS n FROM orders
    WHERE order_date = ? AND status != 'CANCELLED' GROUP BY pickup_slot_id`).all(date);
  return new Map(rows.map((r) => [r.id, r.n]));
}

/** Every pickup window of a stall with its live availability for `clock`. */
function slotsFor(db, stall, clock, usage = slotUsage(db, clock.date)) {
  const rows = db.prepare('SELECT * FROM pickup_slots WHERE stall_id = ? ORDER BY start_time').all(stall.id);
  return rows.map((r) => {
    const slot = { id: r.pickup_slot_id, start: r.start_time, end: r.end_time, capacity: r.capacity, isBlocked: Boolean(r.is_blocked) };
    const booked = usage.get(slot.id) || 0;
    const { available, reason } = Schedule.slotState(stall, slot, clock, booked);
    return { id: slot.id, start: slot.start, end: slot.end, isAvailable: available, reason, spotsLeft: Math.max(0, slot.capacity - booked) };
  });
}

module.exports = { toStall, getStall, allStalls, slotUsage, slotsFor };
