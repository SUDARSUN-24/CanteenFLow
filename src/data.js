// Read helpers that turn database rows into the shapes the rules and API use.
// Each function makes as few queries as possible, because on the live site
// every query is a network trip to Turso.
const Schedule = require('../public/js/schedule');
const config = require('./config');

/** Database row -> stall object used by the schedule rules. */
function toStall(row) {
  const hours = JSON.parse(row.hours_json);
  return {
    id: Number(row.stall_id),
    slug: row.slug,
    name: row.name,
    nameTh: row.name_th,
    area: row.area,
    cuisine: row.cuisine,
    hours,
    hoursText: Schedule.hoursText(hours),
    hoursLabel: row.hours_label,
    prepMinutes: Number(row.prep_minutes),
    isOpenToday: Boolean(row.is_open_today),
    closedNote: row.closed_note,
    description: row.description,
    dataLabel: row.data_label,
  };
}

async function getStall(db, idOrSlug) {
  const row = await db.get('SELECT * FROM stalls WHERE stall_id = ? OR slug = ?', [Number(idOrSlug) || -1, String(idOrSlug)]);
  return row ? toStall(row) : null;
}

async function allStalls(db) {
  return (await db.all('SELECT * FROM stalls ORDER BY stall_id')).map(toStall);
}

/** Orders holding a place in each pickup window on one day (cancelled orders free theirs): Map(slotId -> count). */
async function slotUsage(db, date, stallId = null) {
  const rows = await db.all(`SELECT o.pickup_slot_id AS id, COUNT(*) AS n FROM orders o
    WHERE o.order_date = ? AND o.status != 'CANCELLED' ${stallId ? 'AND o.stall_id = ?' : ''}
    GROUP BY o.pickup_slot_id`, stallId ? [date, stallId] : [date]);
  return new Map(rows.map((r) => [Number(r.id), Number(r.n)]));
}

/** Raw pickup-slot rows, grouped by stall: Map(stallId -> rows[]). */
async function slotRows(db, stallId = null) {
  const rows = await db.all(`SELECT * FROM pickup_slots ${stallId ? 'WHERE stall_id = ?' : ''} ORDER BY stall_id, start_time`,
    stallId ? [stallId] : []);
  const byStall = new Map();
  for (const r of rows) {
    const id = Number(r.stall_id);
    if (!byStall.has(id)) byStall.set(id, []);
    byStall.get(id).push(r);
  }
  return byStall;
}

/** Live availability of a stall's pickup windows for `clock` (no queries). */
function slotStates(stall, rows, clock, usage) {
  return (rows || []).map((r) => {
    const slot = {
      id: Number(r.pickup_slot_id), start: r.start_time, end: r.end_time,
      // A slot without its own capacity uses SLOT_CAPACITY from src/config.js.
      capacity: r.capacity == null ? config.SLOT_CAPACITY : Number(r.capacity), isBlocked: Boolean(r.is_blocked),
    };
    const booked = usage.get(slot.id) || 0;
    const { available, reason } = Schedule.slotState(stall, slot, clock, booked);
    return { id: slot.id, start: slot.start, end: slot.end, isAvailable: available, reason, spotsLeft: Math.max(0, slot.capacity - booked) };
  });
}

/** Everything the stall list needs, in three queries. */
async function loadAll(db, clock) {
  const [stalls, slots, usage] = await Promise.all([allStalls(db), slotRows(db), slotUsage(db, clock.date)]);
  return stalls.map((stall) => ({ stall, slots: slotStates(stall, slots.get(stall.id), clock, usage) }));
}

/** One stall's live pickup windows. */
async function slotsFor(db, stall, clock) {
  const [slots, usage] = await Promise.all([slotRows(db, stall.id), slotUsage(db, clock.date, stall.id)]);
  return slotStates(stall, slots.get(stall.id), clock, usage);
}

module.exports = { toStall, getStall, allStalls, slotUsage, slotsFor, slotStates, loadAll };
