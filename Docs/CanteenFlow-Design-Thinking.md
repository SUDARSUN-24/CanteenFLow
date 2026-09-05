# CanteenFlow Design Thinking Record

## Document Information

| Field | Details |
|---|---|
| Application | CanteenFlow |
| Student | Sudasun (6605142003) |
| Project owner | Sudasun (sole project owner) |
| Work type | Individual assignment |
| Last updated | 5 September 2026 |

This document records the reasoning used to define the CanteenFlow MVP. It describes expected user needs and design decisions; it does not claim that interviews, surveys, or usability tests have already been completed.

## Empathize

### Primary User: University Students

The primary user is a university student with a short break between classes. The student needs to find suitable food, understand whether it is available, and collect it without spending most of the break in an ordering queue.

### Secondary User: Campus Food Vendors

The secondary user is a vendor operating a participating campus food stall. The vendor needs to see demand early enough to prepare orders, arrange work by pickup time, and communicate progress with minimal extra effort.

### Student Pain Points

- Long queues reduce the time available to eat or return to class.
- A student may reach the counter before learning that an item is sold out.
- Queue length does not provide a reliable indication of collection time.
- Ordering and waiting in a crowded area can be inconvenient during busy periods.
- A student may have difficulty deciding quickly when menu details are not visible in advance.

### Vendor Pain Points

- Many verbal orders can arrive within a short peak period.
- It can be difficult to prioritize orders with different expected pickup times.
- Repeated questions about availability and readiness interrupt preparation.
- A complex new process could create more work instead of reducing it.
- If availability is not easy to update, vendors may receive orders they cannot fulfil.

### User Needs

Students need clear stall and menu information, current availability, simple quantity controls, a valid pickup choice, confirmation, and an understandable order status. Vendors need a focused incoming-order list, pickup-time sorting, quick availability controls, and a small set of status actions.

### Empathy-Map Summary

| Perspective | Student | Vendor |
|---|---|---|
| Thinks and feels | Wants enough time to eat and confidence that food will be available | Wants to serve the busy period accurately without a difficult tool |
| Sees | Crowded stalls, limited break time, changing availability | Several orders arriving close together and students asking for updates |
| Says and does | Chooses food quickly, checks time, and waits near the stall | Confirms orders, prepares food, and calls or hands over ready orders |
| Pains | Uncertain waiting, sold-out choices, and risk of being late | Order confusion, interruptions, and uneven workload |
| Gains | A clear pickup plan and less ordering-queue time | Earlier order visibility and a queue arranged by pickup time |

## Define

### Problem Statement

> “Busy university students need a faster and more predictable way to buy meals during short breaks because canteen queues waste time and sometimes prevent them from eating before class.”

### How Might We

> “How might we help students collect food quickly while helping vendors manage busy periods without adding a difficult process?”

The solution should therefore improve predictability for students while keeping the vendor workflow small enough to use during a rush.

## Ideate

### Alternatives Considered

| Alternative | Possible value | Reason not selected as the MVP |
|---|---|---|
| Campus food delivery | Could remove the need to visit a stall | Requires delivery staff, location handling, handoff coordination, and a much larger operating model |
| Queue-display website | Could show whether a stall is busy | Does not reserve a pickup time, communicate item availability, or give vendors confirmed orders in advance |
| Student recipe-sharing website | Could help students discover meal ideas | Does not address campus ordering queues or vendor order management |
| CanteenFlow pre-order and pickup website | Connects advance selection, pickup scheduling, and vendor status updates | Selected because it directly addresses the defined problem with a manageable individual-project scope |

### Why CanteenFlow Was Selected

CanteenFlow addresses both sides of the problem with one connected flow. Students can decide and order before joining the collection area, while vendors receive structured orders that can be sorted by pickup time. In-person payment avoids payment-integration complexity, and the limited status workflow is understandable for both users. This makes the concept more suitable for a one-student MVP than delivery or a wider platform.

## Selected MVP

The final MVP contains only these features:

- Browse participating campus food stalls.
- Open a stall menu and view item names, prices, images, and availability.
- Select available items and change quantities.
- Choose an available pickup time.
- Enter required customer information and submit an order.
- Generate and display a unique order number and confirmation.
- Let a student view whether an order is `RECEIVED`, `PREPARING`, `READY`, `COLLECTED`, or `CANCELLED`.
- Let a vendor view incoming orders and sort them by pickup time.
- Let a vendor update menu-item availability.
- Let a vendor move an order from `RECEIVED` to `PREPARING`, then `READY`, and confirm `COLLECTED`; allow cancellation before collection when necessary.
- Let the student collect and pay for the order at the selected stall.

Online payment, delivery, ratings, loyalty programs, calorie filtering, AI recommendations, and multi-campus management are outside this MVP.

### Build-Measure-Learn Approach

**Build:** Create the smallest usable student ordering flow and vendor queue described above. Use the documented validation, database constraints, and accessible responsive layouts rather than adding optional services.

**Measure:** Check the system against the acceptance criteria. Observe task completion and record factual issues such as failed submissions, invalid slot handling, duplicate orders, vendor status errors, and points where a user cannot understand the next action. No results are claimed before this testing occurs.

**Learn:** Use the verified findings to correct the core workflow first. Consider an excluded or convenience feature only after the MVP works reliably and evidence shows that the feature addresses a real user problem without making the vendor process difficult.
