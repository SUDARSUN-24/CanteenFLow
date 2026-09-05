# CanteenFlow Acceptance Criteria

## Document Information

| Field | Details |
|---|---|
| Application | CanteenFlow |
| Student | Sudasun (6605142003) |
| Project owner | Sudasun (sole project owner) |
| Work type | Individual assignment |
| Last updated | 5 September 2026 |

These criteria define observable acceptance conditions for the CanteenFlow MVP. Unless a scenario states otherwise, the relevant data already exists and the user has access to a supported browser.

## Student Experience

### AC-01 — Viewing Participating Stalls

- **Feature:** Stall browsing
- **Scenario:** A student visits the stall list
- **Given:** At least one stall is active and participating
- **When:** The student opens the CanteenFlow home or stalls page
- **Then:** Every active participating stall is listed by name with a control for opening its menu, and inactive stalls are not listed

### AC-02 — Opening a Stall Menu

- **Feature:** Stall menu
- **Scenario:** A student chooses a participating stall
- **Given:** The selected stall is active
- **When:** The student activates the stall's menu control
- **Then:** The system opens the selected stall's menu and does not show items belonging to another stall

### AC-03 — Viewing Item Details

- **Feature:** Menu-item information
- **Scenario:** A menu contains active items
- **Given:** The student has opened a stall menu
- **When:** The menu finishes loading
- **Then:** Each item shows its name, current price, image, and an available or unavailable state

### AC-04 — Selecting an Available Item

- **Feature:** Item selection
- **Scenario:** A student adds food to an order
- **Given:** A menu item is marked available
- **When:** The student selects the item
- **Then:** The item is added to the current order with quantity 1 and its line total is shown

### AC-05 — Changing Item Quantity

- **Feature:** Item quantity
- **Scenario:** A student changes an item quantity
- **Given:** An available item is already in the order
- **When:** The student changes its quantity to a whole number from 1 to 20
- **Then:** The order shows the new quantity and recalculates the line total and order total using the current displayed price

### AC-06 — Preventing Selection of Sold-Out Items

- **Feature:** Availability enforcement
- **Scenario:** A student attempts to select a sold-out item
- **Given:** A menu item is marked unavailable
- **When:** The student tries to add it through the interface or an altered request
- **Then:** The item is not added or accepted, and the system explains that it is unavailable

### AC-07 — Selecting a Valid Pickup Time

- **Feature:** Pickup-time selection
- **Scenario:** A student chooses an open pickup slot
- **Given:** The slot belongs to the selected stall, is enabled, is in the future, and has remaining capacity
- **When:** The student selects the slot
- **Then:** The slot is attached to the order and its date and time appear in the order summary

### AC-08 — Rejecting an Unavailable Pickup Time

- **Feature:** Pickup-time validation
- **Scenario:** A selected slot is no longer usable
- **Given:** The slot is disabled, in the past, full, or belongs to another stall at submission time
- **When:** The student attempts to submit the order
- **Then:** The order is not created, the basket is retained, and the student is told to choose another available pickup time

### AC-09 — Entering Required Customer Information

- **Feature:** Customer details
- **Scenario:** A student completes valid identifying information
- **Given:** The checkout form is open
- **When:** The student enters a name of 1-100 characters, a student ID of 1-20 letters or digits, and a phone number of 7-20 permitted characters
- **Then:** The values pass validation and the student can proceed to submission when the rest of the order is valid

### AC-10 — Submitting a Valid Order

- **Feature:** Order submission
- **Scenario:** A complete order is submitted
- **Given:** The order has valid customer details, at least one available item, and an available pickup slot for the same stall
- **When:** The student submits the order once
- **Then:** One order and its complete set of order items are stored, slot capacity is allocated, and a confirmation is returned

### AC-11 — Preventing Incomplete Orders

- **Feature:** Required order data
- **Scenario:** A student submits an incomplete order
- **Given:** The order has no items, no valid pickup slot, or one or more missing required customer fields
- **When:** The student selects Submit
- **Then:** No order is created, the entered valid data is retained where safe, and each missing or invalid part is identified

### AC-12 — Generating a Unique Order Number

- **Feature:** Order identification
- **Scenario:** Two valid orders are accepted
- **Given:** Each submission is a distinct valid order
- **When:** The system creates both orders
- **Then:** Each order receives a non-empty order number and the two order numbers are different

### AC-13 — Displaying Order Confirmation

- **Feature:** Order confirmation
- **Scenario:** A valid order has been accepted
- **Given:** The order transaction has committed successfully
- **When:** The confirmation page is displayed
- **Then:** It shows the order number, stall name, pickup date and time, item summary, total amount, `RECEIVED` status, and instruction to pay at collection

### AC-14 — Viewing Order Status

- **Feature:** Student order tracking
- **Scenario:** A student checks an existing order
- **Given:** The student has a valid order number and the matching student ID
- **When:** The student submits both values on the order-status page
- **Then:** The system displays the current status, stall, and pickup details for that order without exposing another student's order

## Vendor Experience

### AC-15 — Vendor Viewing Incoming Orders

- **Feature:** Vendor order queue
- **Scenario:** An authorized vendor opens incoming orders
- **Given:** The vendor is authenticated and has uncollected orders for an authorized stall
- **When:** The vendor opens the order queue
- **Then:** Each relevant order shows its number, student name, items and quantities, pickup time, submission time, total, and current status; orders from unauthorized stalls are absent

### AC-16 — Vendor Sorting Orders by Pickup Time

- **Feature:** Order sorting
- **Scenario:** A vendor changes pickup-time sort direction
- **Given:** The vendor queue contains orders with different pickup times
- **When:** The vendor selects ascending or descending pickup-time order
- **Then:** All displayed orders are reordered by pickup time in the selected direction, with ascending used by default

### AC-17 — Vendor Updating Menu Availability

- **Feature:** Menu availability management
- **Scenario:** A vendor marks an item unavailable
- **Given:** The vendor is authenticated and authorized for the item's stall
- **When:** The vendor changes the item from available to unavailable
- **Then:** The update is saved, success is shown, subsequent menu requests show the item as unavailable, and it is rejected in new submissions

### AC-18 — Vendor Changing an Order to Received

- **Feature:** Initial order status
- **Scenario:** A new order enters the vendor queue
- **Given:** A valid student order has just been accepted
- **When:** The order is created and appears in the authorized vendor's queue
- **Then:** Its status is `RECEIVED` and the creation time is stored

### AC-19 — Vendor Changing an Order to Preparing

- **Feature:** Preparation status
- **Scenario:** A vendor begins preparing an order
- **Given:** The authorized order currently has status `RECEIVED`
- **When:** The vendor selects the Preparing action
- **Then:** The status changes to `PREPARING`, the update time is stored, and the student status view shows `PREPARING`

### AC-20 — Vendor Changing an Order to Ready

- **Feature:** Ready status
- **Scenario:** A vendor finishes preparing an order
- **Given:** The authorized order currently has status `PREPARING`
- **When:** The vendor selects the Ready action
- **Then:** The status changes to `READY`, the update time is stored, and the student status view shows `READY`

### AC-21 — Vendor Confirming Collection

- **Feature:** Collection confirmation
- **Scenario:** A student collects a ready order and pays at the stall
- **Given:** The authorized order currently has status `READY`
- **When:** The vendor selects Confirm collection
- **Then:** The status changes to `COLLECTED`, the collection time is stored, and the order is removed from the default incoming-order queue

## Validation and Recovery

### AC-22 — Handling Invalid Input

- **Feature:** Server-side validation
- **Scenario:** A user submits a value outside the defined format or range
- **Given:** The request contains an invalid name, student ID, phone number, quantity, price, slot, availability value, or status transition
- **When:** The server processes the request
- **Then:** The operation is rejected without a partial database change, valid entered values are retained where safe, and the affected field or action is identified

### AC-23 — Handling Duplicate Order Submission

- **Feature:** Idempotent order submission
- **Scenario:** A student repeats the same checkout submission
- **Given:** A valid order with the same client submission token has already been accepted
- **When:** The request is repeated because of a double-click, refresh, or retry
- **Then:** The original order and order number are returned, no second order is created, and pickup capacity is counted once

### AC-24 — Displaying Understandable Error Messages

- **Feature:** Error communication
- **Scenario:** An operation cannot be completed
- **Given:** A validation, availability, authorization, or temporary server error occurs
- **When:** The system responds to the user
- **Then:** It states what could not be completed and gives a safe next step in plain language without showing database errors, stack traces, credentials, or internal identifiers

## Definition of Done

The CanteenFlow MVP is done when all of the following conditions are met:

- Every functional and non-functional requirement approved for the MVP is implemented or verified by documented evidence.
- AC-01 through AC-24 pass in the supported desktop and mobile browsers.
- Student and vendor workflows use the same five status values and valid transition rules.
- The PostgreSQL schema, migrations, constraints, foreign keys, indexes, and transaction behavior match the database design.
- Automated tests cover calculations, item and slot revalidation, duplicate submissions, authorization, and status transitions.
- Server-side validation and user-facing error handling have been tested for valid, invalid, and concurrent requests.
- Keyboard operation, focus visibility, labels, alternative text, zoom, contrast, and responsive layouts meet the stated accessibility requirements.
- No online payment, delivery, rating, loyalty, calorie, AI recommendation, or multi-campus feature is required by the delivered MVP.
- Documentation is consistent with the implemented behavior and contains no placeholders.
- Sudasun, as the sole project owner, has reviewed the acceptance evidence and approved the MVP submission.
