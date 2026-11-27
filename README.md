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
| Course | Agile (Sprint 1 and 2 demo) |
| Last updated | 27 November 2026 |

## Run it

You need **Node.js 22.13 or newer** (it uses Node's built-in SQLite, so there is nothing to compile).

```bash
npm install && npm start
```

Then open **http://localhost:3000**. The SQLite database is created and seeded the first time
(`data/canteenflow.db`). To start again with fresh data: `npm run reset-db`.

Run the automated tests (61 tests, a few seconds):

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
| Order status | Set by the stall on the vendor page: Received → Preparing → Ready → Collected, or Cancelled / No-show. (In Sprint 1 these steps followed a timer.) |

## Sprint 2: cancellation and vendor protection

User stories with acceptance criteria and Given / When / Then examples:
[Docs/USER_STORIES.md](Docs/USER_STORIES.md).

| Story | What works |
|---|---|
| **US-16 Cancel my order** | **My orders** shows each order's number and its status from the stall. A **Cancel order** button appears only while the order is *Received*. A confirmation comes first. A clear message appears if it is too late. A cancelled order shows who cancelled it and when, and its pickup place is released. |
| **US-17 Vendor accepts or rejects an order** | **Vendor page** (`/vendor`): demo sign-in per stall. The vendor sees only their stall's orders and can **Accept** (→ Preparing) or **Reject** with a required reason, then mark **Ready** and **Collected**, or **Cancel** with a reason. The student sees the reason. There is also a **Sold Out** switch for each menu item. |
| **US-18 Vendor marks a no-show** | **No-show** on a *Ready* order once its pickup window has ended. After the No-show limit, a student's new orders are refused with a polite message to contact the stall. |
| **US-19 Limit orders per student** | Ordering needs a demo student ID (any 10 digits). A student can hold only a limited number of active orders at a time. |
| **US-20 Slot capacity** | Every pickup slot takes a set number of orders. A full slot is unavailable, and a cancelled or rejected order frees its place. |

### Business rules (proposals: to be confirmed with Study Lab)

Every number is in **one file, [`src/config.js`](src/config.js)**. Change it there and the
server, the API (`GET /api/config`) and the pages follow. The server checks every rule inside
the same database transaction as the change itself, so the browser cannot get around them.

| Rule | Config value | Default | What happens |
|---|---|---|---|
| Slot capacity | `SLOT_CAPACITY` | **5** orders per 15-minute slot | A full slot is unavailable. A cancelled or rejected order frees its place. |
| Active orders per student | `MAX_ACTIVE_ORDERS_PER_STUDENT` | **2** | Received, Preparing and Ready orders for today or later count. More are refused. |
| No-show limit | `NO_SHOW_LIMIT` | **3** | At this many No-shows, new orders from that student ID are refused politely. |
| Cancel window | `CANCEL_WINDOW_STATUSES` | **Received** only | Once the stall accepts (Preparing), a student can no longer cancel. |
| Student ID | `STUDENT_ID_DIGITS` | **10** digits | Demo only: any 10 digits. No password and no real check. |
| Vendor reason | `REASON_MAX_CHARS` | **200** characters | Required to reject or cancel. Shown to the student. |
| Vendor sign-in | `VENDOR_SESSION_HOURS` | **12** hours | After this the vendor signs in again. |

Order statuses and who can change them:

| From | To | Who | Condition |
|---|---|---|---|
| Received | Cancelled | Student | Only their own order (same student ID). Repeat presses are harmless. |
| Received | Preparing | Vendor (Accept) | |
| Received | Cancelled | Vendor (Reject) | Reason required |
| Preparing | Ready | Vendor | |
| Preparing or Ready | Cancelled | Vendor (Cancel) | Reason required |
| Ready | Collected | Vendor | |
| Ready | No-show | Vendor | Only after the pickup window has ended |

Other protections:

- The vendor's sign-in names one stall, so the vendor never sees another stall's orders. An
  order or menu item from another stall is answered with "not found".
- The vendor sees the student's name, phone and only the last 4 digits of the student ID.
- Duplicate orders are still blocked by the US-05 submission token, even when a student is at
  their limit.
- Every status change is a conditional update ("only if the status is still X"). If a student
  cancels while the vendor accepts at the same moment, exactly one of them wins.

### Using the vendor page (demo)

Open **/vendor** (there is also a link in the footer), choose the stall and type its demo PIN.
The PINs are public on purpose. This is a course demo, not real security.

| Stall | Demo PIN |
|---|---|
| Siam Cafe | 1001 |
| Krua Sai Jai Cafe (branch 4) | 1002 |
| Main Cafeteria – Japanese counter | 1003 |
| Main Cafeteria – Korean counter | 1004 |
| Thai Pavilion – Noodle counter | 1005 |
| Sky Lounge Restaurant | 1006 |
| Hello Tea & Coffee | 1007 |

To try the whole flow: place an order as a student, then open `/vendor` in another browser (or a
private window) and accept, reject or complete it. The student's My orders page and tracker
update within about 10 seconds.

### Rules that still need a decision from Study Lab

1. **Numbers.** Are 5 orders per slot, 2 active orders and 3 No-shows right? Should the slot
   capacity differ per stall or per time of day? (The database already allows a per-slot
   capacity; it is not used yet.)
2. **Cancel window.** Is "only while Received" enough? Should there also be a time limit (for
   example, no cancelling within 10 minutes of pickup) even if the stall has not accepted yet?
   And what happens if a stall never accepts an order?
3. **No-shows.** Do they count forever, or reset after some time (a week, a term)? Who can lift
   a block, and how? There is no unblock screen yet. A block covers every stall: should it?
   Should there be a grace period after the pickup window before a No-show can be marked?
4. **Active orders.** Should orders for future days (pre-orders) count toward the limit? Should
   an order still Ready from an earlier day count? Today it does not.
5. **Vendor cancellations.** May a vendor cancel after the food is ready? Should the student be
   told in another way (for example, a message) and not only on the website?
6. **Identity.** Will real students sign in with the university account instead of typing a
   student ID? Until then, anyone who knows an order number and the student ID can cancel it.
7. **Personal data.** How long should names, phone numbers and student IDs be kept, and who may
   see them? The vendor sees the name, phone and the last 4 digits of the ID.
8. **Vendor accounts.** Real vendor accounts and passwords will replace the demo PINs.

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
src/config.js          business rule numbers (to be confirmed with Study Lab)
src/app.js             API routes
src/orders.js          order validation, placing, cancelling and vendor actions
src/vendor.js          demo vendor sign-in (signed token per stall)
src/data.js            database row helpers, live slot availability
src/db.js              libSQL connection (local file or Turso), schema, seed
src/seed.js            researched stalls, menus, hours, slots
public/                pages, styles, images and browser scripts
public/js/campus-map.js  3D campus map
public/js/kiosk.js     3D stall models
public/data/           campus map data from OpenStreetMap
test/                  61 automated tests (node:test): api, rules, cart, schedule
data/SOURCES.md        research: verified / unverified / demo data
Docs/                  Lab 2-3 planning documents and USER_STORIES.md (Sprint 2)
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

**Database on the live site.** The live site stores orders in [Turso](https://turso.tech)
(hosted SQLite, free Starter plan, Tokyo region), connected through Vercel → Storage, which sets
`TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. Orders persist and are shared by every server
copy. Placing an order runs in one write transaction (duplicate check, Sold Out check, slot
capacity check and insert together), so two copies can never overbook a slot. A test fires eight
orders at once at a slot that holds five, and exactly five succeed.

Without those variables (for example in a fork) the function falls back to a temporary SQLite file in `/tmp`, which is
re-seeded when Vercel starts a new copy. Orders are then temporary on the live site, but the
browser keeps its own copy, so the order tracker on that device always works.
`GET /api/health` says which database is in use (`turso` or `local-file`).

## Differences from the Lab 2-3 documents

- **SQLite** instead of PostgreSQL. The team asked for a simple one-command stack. The tables follow the [database design](Docs/Database-Design-CanteenFlow.md).
- Pickup slots are only available or unavailable. Capacity and "too soon" make a slot unavailable.
- The vendor flow (sign in, change status, mark Sold Out) arrived in Sprint 2. Vendor sign-in is a demo PIN per stall, not real accounts.

## Next sprint ideas

Real student and vendor sign-in, notifications when an order is ready or cancelled, a way for stalls to lift a No-show block, and real menus and prices collected from the stalls with their permission.

## License

This repository is an academic project by Sudasun. It is provided for educational review. No
permission for commercial use, redistribution, or reuse is granted unless the project owner gives
written permission.
