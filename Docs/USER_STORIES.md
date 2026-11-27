# CanteenFlow: Sprint 2 User Stories (cancellation and vendor protection)

Story numbers match the team's Trello board (US-16 to US-20).

These stories add order cancellation and protect stall vendors from orders that
are never collected. They build on the Sprint 1 stories (US-01, US-02, US-04, US-05)
and on the vendor acceptance criteria AC-15 to AC-21 in
[Acceptance-Criteria-CanteenFlow.md](Acceptance-Criteria-CanteenFlow.md).

> **Every number below is a proposal, to be confirmed with Study Lab.** The values live in
> one file, [`src/config.js`](../src/config.js). The examples use today's defaults:
> slot capacity **5**, at most **2** active orders per student, No-show limit **3**,
> and cancelling allowed only while the order is **Received**.

Order statuses: **Received → Preparing → Ready → Collected**, plus **Cancelled** and **No-show**.
The vendor moves an order forward. The server checks every rule, whatever the browser sends.

| ID | Story | Automated tests |
|---|---|---|
| US-16 | Cancel my order | `test/rules.test.js` (5 tests) |
| US-17 | Vendor accepts or rejects an order | `test/rules.test.js` (7 tests, including Sold Out) |
| US-18 | Vendor marks a no-show | `test/rules.test.js` (2 tests) |
| US-19 | Limit orders per student | `test/rules.test.js` (4 tests) |
| US-20 | Slot capacity | `test/rules.test.js` (3 tests), `test/api.test.js` (2 tests) |

One more test checks that the rule numbers come from `src/config.js`.

---

## US-16 Cancel my order

**As a** student, **I want to** cancel an order I no longer need before the stall starts
cooking it, **so that** no food is wasted and my pickup place goes to someone else.

### Acceptance criteria

1. **My orders** shows each order placed on this device with its order number and its current
   status from the stall.
2. A **Cancel order** button appears only while cancelling is allowed (status Received). It
   is not shown for Preparing, Ready, Collected, Cancelled or No-show orders.
3. Pressing **Cancel order** first asks for confirmation. Nothing is cancelled until the student
   confirms.
4. If the stall started preparing in the meantime, the server refuses the cancel and the student
   sees a clear message: *"Too late to cancel: the stall has already started preparing this order."*
   The order is not changed.
5. A cancelled order shows **Cancelled**, who cancelled it (the student or the stall) and when.
6. Cancelling releases the order's place in its pickup slot.
7. Only the student ID that placed the order can cancel it. Pressing Cancel twice, or on two
   devices at once, cancels the order once and causes no error.

### Examples

**Cancel while Received**
- **Given** Somchai placed order CF-7K3QXM for 11:30 and it is still *Received*
- **When** he opens My orders, presses **Cancel order** and confirms
- **Then** the order shows *Cancelled by you at 10:05*, and the 11:30 slot has one more free place

**Too late**
- **Given** order CF-7K3QXM is *Preparing* because the stall accepted it
- **When** Somchai tries to cancel it
- **Then** he sees *"Too late to cancel…"*, and the order stays *Preparing*

**Double press**
- **Given** an order that is *Received*
- **When** the student presses **Yes, cancel this order** twice quickly
- **Then** one cancel is recorded, and the page shows *Cancelled* without an error

---

## US-17 Vendor accepts or rejects an order

**As a** stall vendor, **I want to** accept or reject each new order and move it through the
kitchen steps, **so that** I only cook what I can make and students know where their food is.

### Acceptance criteria

1. The vendor signs in on the **Vendor page** with their stall and its PIN. (This is a demo
   sign-in. It separates the stalls but is not real security.)
2. The vendor sees **only their own stall's** orders: today's orders and older ones that are not
   finished. Another stall's orders are never listed, and acting on one returns *"Order not
   found"*.
3. A new (*Received*) order can be **accepted**, which moves it to *Preparing*, or **rejected**.
4. **Reject requires a reason.** An empty reason is refused. The student sees the reason on My
   orders and on the order tracker.
5. The vendor can mark a *Preparing* order **Ready**, and a *Ready* order **Collected**. Steps
   cannot be skipped (for example, Received cannot go straight to Ready). The vendor can also
   cancel a Preparing or Ready order, which also requires a reason.
6. The vendor can switch a menu item to **Sold Out** and back. While it is Sold Out, new orders
   with that item are refused by the server.
7. Rejecting or cancelling an order releases its pickup slot place.

### Examples

**Accept**
- **Given** the Siam Cafe vendor is signed in and order CF-5BGE4Q is *Received*
- **When** they press **Accept**
- **Then** the order moves to *Preparing*, and the student's My orders shows *Preparing* with no
  Cancel button

**Reject needs a reason**
- **Given** a *Received* order
- **When** the vendor presses **Reject** and submits an empty reason
- **Then** they see *"Please give a reason"*, and the order stays *Received*

**Reject with a reason**
- **Given** a *Received* order
- **When** the vendor rejects it with "Out of ice today, sorry"
- **Then** the student sees *"Cancelled by the stall. Reason: Out of ice today, sorry"*

**Another stall's order**
- **Given** the Siam Cafe vendor is signed in
- **When** they try to accept an order placed at the Korean counter
- **Then** the server answers *"Order not found"*, and the order is unchanged

---

## US-18 Vendor marks a no-show

**As a** stall vendor, **I want to** record when a student never collects a ready order,
**so that** students who repeatedly waste food can be stopped from ordering.

### Acceptance criteria

1. **No-show** can be marked only on an order that is *Ready*.
2. No-show can be marked only **after the pickup window has ended**. Earlier, the vendor sees
   *"A No-show can be marked only after the pickup window ends (11:45)."*
3. A No-show order is final. It no longer counts as an active order.
4. When a student reaches the **No-show limit** (3), the server refuses their new orders with a
   polite message asking them to contact the stall. No order is created.
5. Students below the limit, and all other students, can still order normally.

### Examples

**Too early**
- **Given** order CF-89RDJ9 is *Ready* for 11:30–11:45 and it is 11:40
- **When** the vendor presses **No-show**
- **Then** it is refused, because the window has not ended

**Third no-show blocks ordering**
- **Given** student 6600000123 already has 2 No-show orders and a third is marked after its window
- **When** that student tries to place a new order
- **Then** they see *"Sorry, we can't take new orders from this student ID because 3 earlier
  orders were not collected (No-show). Please contact the stall to sort it out."*, and no order
  is created

---

## US-19 Limit orders per student

**As a** stall vendor, **I want** each student to hold only a few active orders at a time,
**so that** one person cannot reserve many pickup places and leave them uncollected.

### Acceptance criteria

1. Ordering needs a student ID (demo: exactly 10 digits). It is stored with the order so the
   order can be traced and the limits applied. No password and no other sensitive data is asked
   for.
2. An order is **active** while it is Received, Preparing or Ready, for today or a later day.
3. A student can hold at most **2** active orders. A third is refused with *"You already have 2
   active orders… Collect or cancel one first."*, and nothing is saved.
4. Cancelled, Collected and No-show orders do not count. Cancelling or collecting one lets the
   student order again.
5. The duplicate-order protection from US-05 still applies: resending the same Place Order
   returns the existing order and is never counted as a new one.

### Examples

**Third order refused**
- **Given** a student has two *Received* orders
- **When** they place a third
- **Then** it is refused with the limit message, and only two orders exist

**Cancelling frees a place**
- **Given** a student at the limit
- **When** they cancel one order and order again
- **Then** the new order is accepted

---

## US-20 Slot capacity

**As a** stall vendor, **I want** each 15-minute pickup slot to take only as many orders as I can
prepare, **so that** I am never overbooked at rush hour.

### Acceptance criteria

1. Each slot takes at most **5** orders (SLOT_CAPACITY in `src/config.js`).
2. When a slot holds 5 orders, it shows as **unavailable (Full)** on the order page, and the
   server refuses new orders for it.
3. A cancelled or rejected order frees its place, and the slot becomes available again.
4. Orders arriving at the same moment never overbook a slot, because the capacity check and the
   insert run in one database transaction.

### Examples

**Full slot**
- **Given** the 11:00 Japanese-counter slot holds 5 orders
- **When** a sixth student tries to choose 11:00
- **Then** the slot is shown as unavailable, and an order sent anyway is refused with *"…
  unavailable (full)"*

**Cancelling reopens it**
- **Given** the full 11:00 slot
- **When** one of its students cancels
- **Then** the slot shows 1 place left, and the next order for 11:00 is accepted

**Rush**
- **Given** an empty slot
- **When** 8 orders arrive at the same moment
- **Then** exactly 5 are created and 3 are refused
