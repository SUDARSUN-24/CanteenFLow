# CanteenFlow

CanteenFlow is a campus food pre-order and pickup website for **Siam University, Bangkok**.
Students find a stall, choose available food, check their order and place it for a pickup
time, so they can collect their food without waiting in a long queue. They pay at the stall.

> **Student course project demo** (Agile course, team **Dagabaaz Re**). It is not a real
> business and no order is sent to any shop.

**Live demo:** https://canteenflow-three.vercel.app

## Student Information

| Field | Details |
|---|---|
| Student name | Sudasun |
| Student ID | 6605142003 |
| Team | Dagabaaz Re |
| Course | Agile (Sprint 1 demo) |
| Last updated | 26 November 2026 |

## Run it

You need **Node.js 22.13 or newer** (it uses Node's built-in SQLite, so there is nothing to compile).

```bash
npm install && npm start
```

Then open **http://localhost:3000**. The SQLite database is created and seeded the first time
(`data/canteenflow.db`). To start again with fresh data: `npm run reset-db`.

Run the automated tests (38 tests, about 1 second):

```bash
npm test
```

### Trying it at any time of day: the demo clock

Stalls open, close and fill up by **Bangkok time**. At night or on a weekend every stall is
closed, just like the real campus. To demo the app then, tap the **clock** in the top bar (or
**Try it at Tue 11:30** on the home page) and pick a demo time. The demo clock keeps running
from the time you pick. Choose **Use live Bangkok time** to go back.

## Sprint 1 user stories

| Story | What works |
|---|---|
| **US-01 Find a suitable campus stall** | Stall list with cuisine, live open/closed status, prep time and next pickup time. Search by stall or dish name (English or Thai). Filter by pickup time. A no-results message with a "Clear search" button. A campus area list built from the official building list, with a label on each place saying how sure we are of it. |
| **US-02 Choose available food** | Menu with image, price in Thai baht and availability. **Sold Out** items are greyed out, carry a black-and-yellow "SOLD OUT" band and a disabled button, and cannot be added. Category filter chips. |
| **US-04 Check and correct my order** | Order summary with the stall, items, quantities, line totals and total. Changing a quantity (− / + or typing) updates the totals at once. Remove items. An empty order cannot continue. **One order is for one stall**: adding food from a second stall opens a warning that offers to keep the current order or start a new one. Pay-at-stall notice. |
| **US-05 Place an order for a pickup time** | Pick a 15-minute pickup window. Each window is only *available* or *unavailable* (unavailable means it has passed, there is too little time to cook, it is full, or the vendor paused it). Name, student ID and phone are required and validated. A missing field or an unavailable slot creates **no** order. A placed order gets a unique number (e.g. `CF-7K3QXM`) and status **Received**. Pressing Place Order twice creates only **one** order. |
| Extra | A floating order bar on the menu (item count + total). A live order tracker: a countdown to pickup and Received → Preparing → Ready, with a chime when the order is ready. "My orders" and an active-order bar in the header. |

### Rules the app enforces

The server re-checks every rule when an order is placed. Hand-made requests cannot get around them.

| Rule | How |
|---|---|
| Open / closed | Weekly opening hours per stall in Bangkok time, plus a vendor "closed today" switch. Before opening, students can **pre-order**. |
| Pickup slot available | The slot is inside today's hours, starts after now plus the stall's prep time, is not paused, and has fewer orders than its capacity. |
| Sold Out | A Sold Out item cannot be added in the browser and is rejected by the server. |
| One stall per order | Checked in the browser (warning dialog) and on the server. |
| Total | Always calculated on the server from database prices. A price sent by the browser is ignored. |
| Duplicate order | Each checkout sends a submission token. The same token returns the existing order instead of creating a new one. The button is also locked while the order is being sent. |
| Order status | Received → **Preparing** one prep time before pickup → **Ready** at the pickup time. Sprint 1 has no vendor screen, so these steps follow a timer. |

## Tech

- **Server:** Node.js + Express. Data is SQLite, accessed through the libSQL client (`@libsql/client`): a local file by default, or a hosted [Turso](https://turso.tech) database when `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set.
- **Frontend:** plain HTML, CSS and JavaScript. Mobile first, and it also works on desktop. There is no build step.
- **Shared rules:** `public/js/cart.js` (order rules) and `public/js/schedule.js` (clock, hours, slots, status timer) run both in the browser and on the server. The tests check them once and both sides use them.
- **No payments:** students pay at the stall.
- **3D campus map:** `public/js/campus-map.js` draws the real Siam University campus from OpenStreetMap building outlines (`public/data/campus-map.json`). Buildings are extruded to their floor count, with windows, a Thai-style roof on Building 4 and live pins for each food place. It can be dragged, pinched, zoomed, turned and switched between 3D and 2D.
- **3D stall models:** `public/js/kiosk.js` draws an isometric model of each eating place that matches its kind: a food-court counter with steam trays (cafeterias), a noodle cart under a Thai roof (Thai Pavilion), a café bar (coffee and tea shops) and a glass-front dining room (Sky Lounge). Open places are lit and steaming; closed ones have the shutter down.

```text
server.js              local server (npm start)
api/index.js           Vercel serverless entry
src/app.js             API routes
src/orders.js          order validation and placing
src/data.js            database row helpers, live slot availability
src/db.js              libSQL connection (local file or Turso), schema, seed
src/seed.js            researched stalls, menus, hours, slots
public/                pages, styles, images and browser scripts
public/js/campus-map.js  3D campus map
public/js/kiosk.js     3D stall models
public/data/           campus map data from OpenStreetMap
test/                  39 automated tests (node:test)
data/SOURCES.md        research: verified / unverified / demo data
Docs/                  Lab 2-3 planning documents
```

## What is real and what is demo data

All research is in [data/SOURCES.md](data/SOURCES.md). In short:

- **Verified** (official Siam University pages): the campus address. The **Main Cafeteria** (Thai, Japanese and Korean food; Building 15 on the student-support page). The **Thai Pavilion cafeteria** (Building 4). **Sky Lounge Restaurant** (Building 19, 9th floor).
- **Unverified** (Wongnai, Facebook and older pages, which may be out of date): **Siam Cafe** and its hours. **Krua Sai Jai Cafe (branch 4)**. **Hello Tea & Coffee** (Building 19, 8th floor). The Sky Lounge hours. The Building 12 cafeteria.
- **Demo data:** all menu prices, prep times, slot capacities, paused slots, Sold Out states, and the "closed today" status of Sky Lounge. Also the counter names inside the cafeterias, and the hours of stalls with no published hours. Food pictures are drawn illustrations, not photos. The 3D stall models are illustrations of the *kind* of place (counter, noodle cart, café, restaurant), not pictures of the real stalls.
- Chain outlets (KFC, Café Amazon, True Coffee) appear only on the map as "info only". The demo never invents their menus.
- **Map:** building outlines, numbers and names, roads, the canal and the MRT line are real (© OpenStreetMap contributors, ODbL). Building heights are estimates, except Building 19 (19 floors, as its name says). Trees are decoration. Siam Cafe's pin is an approximate spot near the main entrance, because the exact building is not published. Krua Sai Jai has no known building, so it is not on the map.

## Deployment (Vercel)

The live site is deployed with `vercel deploy --prod` from this folder (`vercel.json`). Static
pages come from `public/`, and the API runs as one serverless function (`api/index.js`).

**Database on the live site.** The code is ready for [Turso](https://turso.tech) (hosted SQLite,
free Starter plan). When the Vercel project has `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`
(Vercel → Storage → Turso), orders are saved in Turso, persist, and are shared by every server
copy. Placing an order runs in one write transaction (duplicate check, Sold Out check, slot
capacity check and insert together), so two copies can never overbook a slot. A test fires six
orders at once at a slot that holds three, and exactly three succeed.

Without those variables the function falls back to a temporary SQLite file in `/tmp`, which is
re-seeded when Vercel starts a new copy. Orders are then temporary on the live site, but the
browser keeps its own copy, so the order tracker on that device always works.
`GET /api/health` says which database is in use (`turso` or `local-file`).

## Differences from the Lab 2-3 documents

- **SQLite** instead of PostgreSQL. The team asked for a simple one-command stack. The tables follow the [database design](Docs/Database-Design-CanteenFlow.md).
- Pickup slots are only available or unavailable. Capacity and "too soon" make a slot unavailable.
- The vendor flow (sign in, change status, mark Sold Out) is **not** in Sprint 1. Status changes follow a timer, and Sold Out is set in the seed data.

## Next sprint ideas

A vendor screen (order queue, status buttons, Sold Out switch), and real menus and prices collected from the stalls with their permission.

## License

This repository is an academic project by Sudasun. It is provided for educational review. No
permission for commercial use, redistribution, or reuse is granted unless the project owner gives
written permission.
