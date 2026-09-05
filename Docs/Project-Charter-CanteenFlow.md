# CanteenFlow Project Charter

## Document Information

| Field | Details |
|---|---|
| Project title | CanteenFlow |
| Document type | Project charter |
| Student name | Sudasun |
| Student ID | 6605142003 |
| Project owner | Sudasun (sole project owner) |
| Work type | Individual assignment |
| Last updated | 5 September 2026 |
| Project status | Documentation and planning |

## Project Background

Campus canteens become crowded during short class breaks. Students may spend much of their break waiting to order and can be uncertain about item availability or preparation time. Vendors must also receive, prioritize, and prepare many orders within a limited period. CanteenFlow is proposed as a focused website that allows students to pre-order from participating campus food stalls and collect and pay for meals at a chosen time.

## Problem Statement

Busy university students need a faster and more predictable way to buy meals during short breaks because canteen queues waste time and sometimes prevent them from eating before class. At the same time, vendors need a simple way to organize incoming orders and communicate when food is ready.

## Project Purpose

The purpose of CanteenFlow is to reduce uncertainty and time spent in ordering queues by supporting advance food selection, scheduled pickup, and visible order progress. The MVP will test whether a simple pre-order workflow can serve students and vendors without introducing delivery or online payment complexity.

## Measurable Objectives

1. Provide a student ordering flow that can be completed from stall selection to order confirmation without online payment.
2. Display the name, price, image, and availability of every menu item shown to a student.
3. Prevent submission unless the order contains at least one available item, a valid pickup slot, and all required customer details.
4. Generate a unique order number for every accepted order.
5. Allow a vendor to view and sort incoming orders and move each order through the defined status sequence.
6. Keep the MVP limited to the seven core database entities and the features that one student can design, implement, and verify.

## Target Users

- **Primary users:** university students who want to pre-order food before a short break.
- **Secondary users:** vendors operating participating campus food stalls.

## MVP Scope

The MVP covers the process from browsing a participating stall to collection at that same stall. A student selects available menu items and quantities, chooses an available pickup time, supplies required details, submits the order, receives an order number, and follows its status. A vendor manages item availability and the order queue. Payment takes place in person at collection.

### Features Included in the MVP

- Browse participating food stalls.
- Open a stall and view its menu.
- View item name, price, image, and availability.
- Add available items and change quantities.
- Choose an available pickup slot.
- Enter required student/customer information.
- Submit an order and receive a unique order number.
- View order confirmation and the latest order status.
- Allow vendors to view incoming orders and sort them by pickup time.
- Allow vendors to update menu-item availability.
- Allow vendors to set orders to `RECEIVED`, `PREPARING`, `READY`, and `COLLECTED`.
- Support `CANCELLED` as a stored terminal status for an order that cannot be fulfilled.
- Collect payment in person at the selected stall.

### Features Excluded from the MVP

- Online payments.
- Food delivery.
- Ratings and reviews.
- Loyalty programs or points.
- Calorie filtering or nutrition tracking.
- AI recommendations.
- Multi-campus management.

## Main Deliverables

- Project charter.
- Software requirements specification.
- Acceptance criteria and Definition of Done.
- PostgreSQL-compatible database design and ER diagram.
- Design Thinking record.
- Documentation index and repository overview.
- A future MVP implementation, if required in a later project stage.

## Stakeholders

| Stakeholder | Interest or responsibility |
|---|---|
| Sudasun | Sole owner; plans, documents, develops, and verifies the project |
| Student users | Browse food, place orders, and collect meals |
| Vendor users | Maintain availability and process orders |
| Academic assessor | Reviews the individual assignment against its requirements |

## Assumptions

- Students have access to a modern web browser and an internet connection.
- Each menu item belongs to one stall.
- Each vendor account is associated with the stall records it is authorized to manage.
- Vendors keep menu availability and order status reasonably current.
- Pickup capacity can be represented by time slots with a maximum number of orders.
- Students pay directly at the selected stall when collecting food.
- The MVP serves one campus context and does not model multiple campuses.

## Constraints

- The project is owned and completed by one student.
- Development time and testing resources are limited to an academic assignment.
- The MVP must remain small enough for one person to design and implement.
- The system depends on vendors updating availability and status manually.
- No online payment or delivery integration is available.
- Personal information must be limited to what the pickup workflow requires.

## Risks and Mitigation Strategies

| Risk | Possible impact | Mitigation |
|---|---|---|
| Menu availability becomes outdated | Students order unavailable food | Give vendors a quick availability control and revalidate items during submission |
| Too many orders use one pickup time | Delays and crowding | Store slot capacity and reject a slot when capacity is reached |
| Duplicate form submission | Duplicate meals and confusion | Use a submission token or equivalent idempotency check and return the first result |
| Vendor status is not updated | Students see misleading progress | Use a clear vendor queue ordered by pickup time and simple status actions |
| Invalid or incomplete student input | Orders cannot be identified or collected | Validate required fields on both client and server and show field-specific messages |
| Unauthorized vendor access | Menu or order data is changed incorrectly | Require authenticated vendor access and restrict records by stall ownership |
| Scope becomes too large | Individual project cannot be completed reliably | Keep excluded features out of the MVP and review new ideas against this charter |
| Loss or inconsistency of order data | Orders cannot be prepared correctly | Use database transactions, foreign keys, constraints, and regular backups |

## Milestones

| Milestone | Completion evidence |
|---|---|
| 1. Design Thinking definition | User needs, problem statement, alternatives, and selected MVP documented |
| 2. Project planning | Charter, boundaries, risks, and success criteria approved for the assignment |
| 3. Requirements baseline | Testable functional and non-functional requirements completed |
| 4. Data design | ER diagram, data dictionary, constraints, and PostgreSQL DDL completed |
| 5. Acceptance baseline | Acceptance criteria trace every MVP feature and include a Definition of Done |
| 6. Future implementation | Student and vendor workflows implemented and tested, if required by a later stage |

## Success Criteria

The project will be considered successful at the documentation stage when all required documents are complete, consistent, linked, and free of placeholders. A future MVP will be successful when:

- All acceptance criteria pass in supported browsers.
- A valid student order produces one unique order number and a clear confirmation.
- Invalid, incomplete, sold-out, full-slot, and duplicate submissions are handled safely.
- A vendor can sort orders by pickup time and manage availability and order status.
- Order data follows the documented database constraints and status values.
- No excluded feature is required to complete the core pickup workflow.

## Project Approval Statement

This charter defines the agreed scope and direction of CanteenFlow for Sudasun's individual Lab 2-3 project-documentation assignment. Sudasun is the sole project owner and is responsible for approving scope decisions and completing the work. Approval of this charter establishes the MVP baseline; material additions should be deferred to future development unless the charter is formally revised.
