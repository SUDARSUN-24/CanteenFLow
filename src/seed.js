// Seed data for the demo. See data/SOURCES.md for where each fact came from.
// Labels: "verified" (official Siam University page), "unverified" (third-party
// listing, may be out of date), "demo data" (invented for the demo).
// ALL prices, prep times, slot capacities, paused slots and Sold Out states are demo data.
// Pickup slots are 15-minute windows inside each stall's opening hours.

const { toMin, toHHMM, SLOT_MINUTES } = require('../public/js/schedule');

const STALLS = [
  {
    slug: 'siam-cafe',
    name: 'Siam Cafe',
    name_th: 'สยามคาเฟ่',
    area: 'Inside the university, first turn on the right',
    cuisine: 'Thai made-to-order',
    hours: { 1: ['08:00', '16:00'], 2: ['08:00', '16:00'], 3: ['08:00', '16:00'], 4: ['08:00', '16:00'], 5: ['08:00', '16:00'], 6: ['09:00', '16:00'] },
    hours_label: 'unverified',
    prep_minutes: 10,
    description: 'Made-to-order Thai rice and noodle dishes (อาหารตามสั่ง).',
    data_label: 'Real place (unverified listing). Menu prices are demo data.',
    slots: { capacity: 4, blocked: ['12:00', '12:15'] },
    menu: [
      ['Stir-fried basil pork on rice', 'ข้าวกะเพราหมู', 'Rice dishes', 50, 'rice', 1],
      ['Pork fried rice', 'ข้าวผัดหมู', 'Rice dishes', 50, 'rice', 1],
      ['Garlic pork on rice', 'ข้าวหมูกระเทียม', 'Rice dishes', 50, 'rice', 1],
      ['Thai omelette on rice', 'ข้าวไข่เจียว', 'Rice dishes', 35, 'rice', 0], // Sold Out
      ['Stir-fried wide noodles with soy sauce', 'ผัดซีอิ๊ว', 'Noodles', 50, 'noodles', 1],
      ['Fried egg (add-on)', 'ไข่ดาว', 'Extras', 10, 'snack', 1],
      ['Thai iced tea', 'ชาไทยเย็น', 'Drinks', 30, 'drink', 1],
    ],
  },
  {
    slug: 'krua-sai-jai',
    name: 'Krua Sai Jai Cafe (branch 4)',
    name_th: 'ครัวใส่ใจคาเฟ่ สาขา 4',
    area: 'Siam University campus (building not listed)',
    cuisine: 'Thai one-plate meals',
    hours: { 1: ['10:00', '15:00'], 2: ['10:00', '15:00'], 3: ['10:00', '15:00'], 4: ['10:00', '15:00'], 5: ['10:00', '15:00'] },
    hours_label: 'demo data',
    prep_minutes: 15,
    description: 'One-plate meals (อาหารจานเดียว).',
    data_label: 'Real place (unverified listing). Hours and prices are demo data.',
    slots: { capacity: 4, blocked: [] },
    menu: [
      ['Stir-fried noodles with water mimosa and shrimp', 'หมี่ผัดกระเฉดกุ้ง', 'Noodles', 120, 'noodles', 1],
      ['Gravy noodles with pork', 'ราดหน้าหมู', 'Noodles', 90, 'noodles', 1],
      ['Shrimp fried rice', 'ข้าวผัดกุ้ง', 'Rice dishes', 110, 'rice', 1],
      ['Crispy pork with basil on rice', 'ข้าวกะเพราหมูกรอบ', 'Rice dishes', 100, 'rice', 1],
      ['Green curry chicken on rice', 'ข้าวแกงเขียวหวานไก่', 'Rice dishes', 90, 'bowl', 1],
      ['Lime soda', 'โซดามะนาว', 'Drinks', 45, 'drink', 1],
    ],
  },
  {
    slug: 'main-cafeteria-japanese',
    name: 'Main Cafeteria – Japanese counter',
    name_th: 'โรงอาหารหลัก – อาหารญี่ปุ่น',
    area: 'Main Cafeteria, Building 15',
    cuisine: 'Japanese',
    hours: { 1: ['10:00', '15:00'], 2: ['10:00', '15:00'], 3: ['10:00', '15:00'], 4: ['10:00', '15:00'], 5: ['10:00', '15:00'] },
    hours_label: 'demo data',
    prep_minutes: 12,
    description: 'Rice bowls and sides.',
    data_label: 'The Main Cafeteria serves Japanese food (verified). This counter, its hours and prices are demo data.',
    slots: { capacity: 3, blocked: ['12:00'] },
    menu: [
      ['Chicken teriyaki rice bowl', 'ข้าวหน้าไก่เทอริยากิ', 'Rice bowls', 65, 'bento', 1],
      ['Pork katsu curry rice', 'ข้าวแกงกะหรี่หมูทอด', 'Rice bowls', 75, 'bowl', 0], // Sold Out
      ['Salmon rice bowl', 'ข้าวหน้าแซลมอน', 'Rice bowls', 99, 'bento', 1],
      ['Pan-fried gyoza (5 pieces)', 'เกี๊ยวซ่า 5 ชิ้น', 'Sides', 45, 'snack', 1],
      ['Miso soup', 'ซุปมิโซะ', 'Sides', 25, 'bowl', 1],
      ['Iced green tea', 'ชาเขียวเย็น', 'Drinks', 20, 'drink', 1],
    ],
  },
  {
    slug: 'main-cafeteria-korean',
    name: 'Main Cafeteria – Korean counter',
    name_th: 'โรงอาหารหลัก – อาหารเกาหลี',
    area: 'Main Cafeteria, Building 15',
    cuisine: 'Korean',
    hours: { 1: ['10:00', '15:00'], 2: ['10:00', '15:00'], 3: ['10:00', '15:00'], 4: ['10:00', '15:00'], 5: ['10:00', '15:00'] },
    hours_label: 'demo data',
    prep_minutes: 12,
    description: 'Bibimbap, kimbap and street snacks.',
    data_label: 'The Main Cafeteria serves Korean food (verified). This counter, its hours and prices are demo data.',
    slots: { capacity: 3, blocked: ['12:30'] },
    menu: [
      ['Bibimbap', 'บิบิมบับ', 'Rice dishes', 70, 'bowl', 1],
      ['Kimchi fried rice', 'ข้าวผัดกิมจิ', 'Rice dishes', 60, 'rice', 1],
      ['Tteokbokki', 'ต็อกบกกี', 'Snacks', 55, 'snack', 1],
      ['Korean fried chicken (6 pieces)', 'ไก่ทอดเกาหลี 6 ชิ้น', 'Snacks', 79, 'chicken', 1],
      ['Kimbap roll', 'คิมบับ', 'Snacks', 45, 'bento', 1],
      ['Iced barley tea', 'ชาข้าวบาร์เลย์เย็น', 'Drinks', 20, 'drink', 1],
    ],
  },
  {
    slug: 'thai-pavilion-noodles',
    name: 'Thai Pavilion – Noodle counter',
    name_th: 'ศาลาไทย – ร้านก๋วยเตี๋ยว',
    area: 'Thai Pavilion, Building 4',
    cuisine: 'Thai noodles',
    hours: { 1: ['09:00', '15:00'], 2: ['09:00', '15:00'], 3: ['09:00', '15:00'], 4: ['09:00', '15:00'], 5: ['09:00', '15:00'], 6: ['09:00', '15:00'] },
    hours_label: 'demo data',
    prep_minutes: 6,
    description: 'Quick noodle soups and snacks.',
    data_label: 'The Thai Pavilion has a cafeteria (verified). This counter, its hours and prices are demo data.',
    slots: { capacity: 4, blocked: [] },
    menu: [
      ['Boat noodles', 'ก๋วยเตี๋ยวเรือ', 'Noodle soups', 45, 'noodles', 1],
      ['Tom yum noodles', 'ก๋วยเตี๋ยวต้มยำ', 'Noodle soups', 50, 'noodles', 1],
      ['Egg noodles with BBQ pork', 'บะหมี่หมูแดง', 'Noodle soups', 50, 'noodles', 1],
      ['Fish ball noodle soup', 'ก๋วยเตี๋ยวลูกชิ้นปลา', 'Noodle soups', 45, 'noodles', 0], // Sold Out
      ['Fried wontons', 'เกี๊ยวทอด', 'Snacks', 30, 'snack', 1],
      ['Chrysanthemum tea', 'น้ำเก๊กฮวย', 'Drinks', 20, 'drink', 1],
    ],
  },
  {
    slug: 'sky-lounge',
    name: 'Sky Lounge Restaurant',
    name_th: 'สกายเลานจ์',
    area: 'Building 19 (Golden Jubilee), 9th floor',
    cuisine: 'Thai and international set lunches',
    hours: { 1: ['11:00', '15:00'], 2: ['11:00', '15:00'], 3: ['11:00', '15:00'], 4: ['11:00', '15:00'], 5: ['11:00', '15:00'] },
    hours_label: 'unverified',
    prep_minutes: 20,
    is_open_today: 0, // the demo's closed stall (vendor switched it off)
    closed_note: 'Closed today (demo data).',
    description: 'Set lunches with a view from the 9th floor.',
    data_label: 'Location verified. Hours unverified. Menu, prices and "closed today" are demo data.',
    slots: { capacity: 4, blocked: [] },
    menu: [
      ['Chicken massaman curry with rice', 'ข้าวแกงมัสมั่นไก่', 'Set lunch', 120, 'bowl', 1],
      ['Spaghetti carbonara', 'สปาเกตตีคาโบนารา', 'Set lunch', 130, 'noodles', 1],
      ['Caesar salad', 'ซีซาร์สลัด', 'Set lunch', 110, 'salad', 1],
      ['Panna cotta', 'พานาคอตต้า', 'Desserts', 70, 'dessert', 1],
      ['Iced latte', 'ลาเต้เย็น', 'Drinks', 60, 'coffee', 1],
    ],
  },
  {
    slug: 'hello-tea-coffee',
    name: 'Hello Tea & Coffee',
    name_th: 'ฮัลโหล ที แอนด์ คอฟฟี่',
    area: 'Building 19 (Golden Jubilee), 8th floor',
    cuisine: 'Bubble tea and coffee',
    hours: { 1: ['08:00', '17:00'], 2: ['08:00', '17:00'], 3: ['08:00', '17:00'], 4: ['08:00', '17:00'], 5: ['08:00', '17:00'] },
    hours_label: 'demo data',
    prep_minutes: 5,
    description: 'Bubble tea, coffee and soda.',
    data_label: 'Real place (unverified, 2018 listing). Hours and prices are demo data.',
    slots: { capacity: 6, blocked: ['12:00'] },
    menu: [
      ['Bubble milk tea', 'ชานมไข่มุก', 'Tea', 45, 'bubbletea', 1],
      ['Thai tea with pearls', 'ชาไทยไข่มุก', 'Tea', 45, 'bubbletea', 1],
      ['Matcha latte', 'มัทฉะลาเต้', 'Tea', 55, 'bubbletea', 1],
      ['Iced latte', 'ลาเต้เย็น', 'Coffee', 55, 'coffee', 1],
      ['Iced Americano', 'อเมริกาโน่เย็น', 'Coffee', 45, 'coffee', 1],
      ['Honey lemon soda', 'น้ำผึ้งมะนาวโซดา', 'Soda', 40, 'drink', 1],
    ],
  },
];

// Campus area list (the "map"). Built from the official building list.
// Places with a stall slug can be ordered from; the rest are listed for info only.
const PLACES = [
  ['Main Cafeteria', 'Building 15', 'Main Cafeteria – Japanese counter', 'main-cafeteria-japanese', 'Official map: Thai, Japanese and Korean food.', 'verified'],
  ['Main Cafeteria', 'Building 15', 'Main Cafeteria – Korean counter', 'main-cafeteria-korean', null, 'verified'],
  ['Main Cafeteria', 'Building 15', 'Café Amazon', null, 'Listed "next to the canteen". Not in this demo.', 'unverified'],
  ['Thai Pavilion', 'Building 4', 'Thai Pavilion – Noodle counter', 'thai-pavilion-noodles', 'Official map: cafeteria.', 'verified'],
  ['Thai Pavilion', 'Building 4', 'KFC', null, 'On the official student-support page. Not in this demo.', 'verified'],
  ['Thai Pavilion', 'Building 4', 'Convenience store', null, 'Official pages disagree: 7-Eleven or Lawson.', 'unverified'],
  ['Golden Jubilee Building', 'Building 19', 'Sky Lounge Restaurant (9th floor)', 'sky-lounge', null, 'verified'],
  ['Golden Jubilee Building', 'Building 19', 'Hello Tea & Coffee (8th floor)', 'hello-tea-coffee', null, 'unverified'],
  ['Near the main gate', null, 'Siam Cafe', 'siam-cafe', 'Inside the university, first turn on the right.', 'unverified'],
  ['Royal Majesty Jubilee Building', 'Building 12', 'Cafeteria', null, 'On the older official map only. May have closed.', 'unverified'],
  ['Building not listed', null, 'Krua Sai Jai Cafe (branch 4)', 'krua-sai-jai', null, 'unverified'],
  ['Building not listed', null, 'True Coffee', null, 'Listed at Siam University. Not in this demo.', 'unverified'],
];

/** Every 15-minute pickup window between a stall's earliest opening and latest closing. */
function slotTimes(hours) {
  const ranges = Object.values(hours);
  const first = Math.min(...ranges.map((r) => toMin(r[0])));
  const last = Math.max(...ranges.map((r) => toMin(r[1])));
  const times = [];
  for (let t = first; t + SLOT_MINUTES <= last; t += SLOT_MINUTES) times.push(toHHMM(t));
  return times;
}

function seed(db) {
  const insStall = db.prepare(`INSERT INTO stalls
    (slug, name, name_th, area, cuisine, hours_json, hours_label, prep_minutes, is_open_today, closed_note, description, data_label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insItem = db.prepare(`INSERT INTO menu_items
    (stall_id, name, name_th, category, price, image, is_available) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insSlot = db.prepare(`INSERT INTO pickup_slots
    (stall_id, start_time, end_time, capacity, is_blocked) VALUES (?, ?, ?, ?, ?)`);
  const insPlace = db.prepare(`INSERT INTO campus_places
    (area, building, name, stall_id, note, label) VALUES (?, ?, ?, ?, ?, ?)`);

  db.exec('BEGIN');
  const idBySlug = {};
  for (const s of STALLS) {
    const { lastInsertRowid } = insStall.run(
      s.slug, s.name, s.name_th, s.area, s.cuisine, JSON.stringify(s.hours), s.hours_label,
      s.prep_minutes, s.is_open_today ?? 1, s.closed_note ?? null, s.description, s.data_label);
    const id = Number(lastInsertRowid);
    idBySlug[s.slug] = id;
    for (const [name, th, cat, price, img, avail] of s.menu) {
      insItem.run(id, name, th, cat, price, `/img/${img}.svg`, avail);
    }
    for (const t of slotTimes(s.hours)) {
      insSlot.run(id, t, toHHMM(toMin(t) + SLOT_MINUTES), s.slots.capacity, s.slots.blocked.includes(t) ? 1 : 0);
    }
  }
  for (const [area, building, name, slug, note, label] of PLACES) {
    insPlace.run(area, building, name, slug ? idBySlug[slug] : null, note, label);
  }
  db.exec('COMMIT');
}

module.exports = { seed, STALLS };
