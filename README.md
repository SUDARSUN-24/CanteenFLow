# CanteenFlow

CanteenFlow is a proposed campus food pre-order and pickup website that helps university students avoid long canteen ordering queues.

## Student Information

| Field | Details |
|---|---|
| Student name | Sudasun |
| Student ID | 6605142003 |
| Project owner | Sudasun (sole project owner) |
| Work type | Individual assignment |
| Last updated | 5 September 2026 |

## Project Status

The Lab 2-3 planning and project-documentation set is complete. This repository does not currently contain working application code, so CanteenFlow should be treated as a documented MVP proposal rather than an implemented system.

## Problem Being Solved

University students may have only a short break in which to buy and eat a meal. Ordering queues, uncertain availability, and unclear preparation progress can consume that time. Vendors also need a simple way to see incoming demand and prepare orders by expected pickup time.

## MVP Features

- Browse participating campus food stalls.
- View menu-item names, prices, images, and availability.
- Select available food and change quantities.
- Choose an available pickup time.
- Submit a validated order and receive a unique order number.
- View an order as `RECEIVED`, `PREPARING`, `READY`, `COLLECTED`, or `CANCELLED`.
- Allow vendors to view orders and sort them by pickup time.
- Allow vendors to update item availability and order status.
- Confirm collection, with payment made at the stall.

## Student User Flow

1. Browse participating stalls and open one menu.
2. Review item details and availability.
3. Add available items and choose quantities.
4. Select an available pickup slot.
5. Enter required customer details and review the order.
6. Submit the order and keep the unique order number.
7. Check the order status and collect and pay when the food is ready.

## Vendor User Flow

1. Sign in and open an authorized stall's order queue.
2. Review incoming orders sorted by pickup time.
3. Update menu-item availability when stock changes.
4. Move an accepted order from `RECEIVED` to `PREPARING` and then `READY`.
5. Confirm `COLLECTED` after the student receives and pays for the food, or cancel an uncollected order when it cannot be fulfilled.

## Proposed Technology

The implementation stack has not been selected. The documentation proposes a responsive browser-based client, a server application with authenticated vendor functions and server-side validation, and PostgreSQL for relational storage. Specific languages, frameworks, hosting, and deployment services should be chosen during a later implementation stage.

## Repository Structure

```text
CanteenFlow/
├── Docs/
│   ├── Acceptance-Criteria-CanteenFlow.md
│   ├── CanteenFlow-Design-Thinking.md
│   ├── Database-Design-CanteenFlow.md
│   ├── Project-Charter-CanteenFlow.md
│   ├── README.md
│   └── Requirements-Specification-CanteenFlow.md
└── README.md
```

See the [CanteenFlow documentation index](Docs/README.md) for the full submission.

## Current Limitations

- No working application has been implemented in this repository.
- Payment is in person; there is no online payment feature.
- The MVP does not provide delivery.
- Ratings, loyalty programs, calorie filtering, and AI recommendations are excluded.
- The design covers one campus context and does not manage multiple campuses.
- Status accuracy depends on vendors updating orders during preparation.

## Future Development Ideas

After implementing and validating the MVP, later work could consider optional notifications, student account history, improved vendor reporting, or other changes supported by user testing. Online payment, delivery, ratings, loyalty features, nutrition tools, AI recommendations, and multi-campus support remain outside the current scope and would require separate evaluation.

## License

This repository is an academic project by Sudasun. It is provided for educational review. No permission for commercial use, redistribution, or reuse is granted unless the project owner gives written permission.
