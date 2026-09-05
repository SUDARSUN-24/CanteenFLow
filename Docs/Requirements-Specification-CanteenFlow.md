# CanteenFlow Software Requirements Specification

## Document Information

| Field | Details |
|---|---|
| Application | CanteenFlow |
| Student | Sudasun (6605142003) |
| Project owner | Sudasun (sole project owner) |
| Work type | Individual assignment |
| Last updated | 5 September 2026 |

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification (SRS) defines the testable requirements for the CanteenFlow minimum viable product (MVP). It provides a shared baseline for design, future implementation, and acceptance testing.

### 1.2 Product Overview

CanteenFlow is a responsive campus food pre-order and pickup website. Students browse participating stalls, choose available food and a pickup time, submit an order, receive an order number, and follow its progress. Vendors manage item availability and process orders in pickup-time order. Students collect and pay for food at the stall.

### 1.3 Product Scope

The system covers menu browsing, item selection, pickup-slot selection, order creation, order confirmation, order-status viewing, vendor order management, and menu availability management. The MVP has no online payment, delivery, ratings, loyalty program, calorie filtering, AI recommendation, or multi-campus management.

### 1.4 Requirement Language

The word **shall** indicates a mandatory, testable MVP requirement. Requirement identifiers remain stable so that design and acceptance evidence can refer to them.

## 2. User Roles

### 2.1 Student User

A student user wants to select food before a break and collect it at a predictable time. The student can browse stalls and menus, build one order for one stall, select a pickup slot, provide identifying details, submit the order, and view its status using the resulting order information.

### 2.2 Vendor User

A vendor user is authorized to manage one or more participating stall records. The vendor can view incoming orders for an authorized stall, sort them by pickup time, update menu-item availability, change order status, and confirm collection.

## 3. Assumptions and Dependencies

- Users have a network connection and a supported browser.
- Stall, menu, price, and pickup-slot information has been entered before students order.
- A menu item belongs to exactly one stall; an order contains items from exactly one stall.
- Vendor authentication and authorization are available before vendor functions are exposed.
- Server time is the authoritative time for slot and order validation.
- Vendors manually keep item availability and order status current.
- Payment occurs outside the website at the stall during collection.
- PostgreSQL is the proposed relational database.

## 4. Functional Requirements

### 4.1 Student-Side Browsing and Selection

| ID | Requirement |
|---|---|
| FR-01 | The system shall display every active participating stall with its name and a control that opens that stall's menu. |
| FR-02 | When a student opens a stall, the system shall display only active menu items assigned to that stall. |
| FR-03 | For each displayed menu item, the system shall show its name, current price, image, and whether it is available. |
| FR-04 | The system shall allow a student to add an available menu item to the current order with an initial quantity of 1. |
| FR-05 | The system shall allow a student to change an item's quantity to a whole number from 1 to 20, or remove the item from the order. |
| FR-06 | The system shall disable selection of a menu item marked unavailable and shall reject any attempt to order it through direct or altered requests. |
| FR-07 | The system shall limit one order to menu items from one stall and shall require confirmation before clearing an existing basket to shop at another stall. |

### 4.2 Menu and Availability

| ID | Requirement |
|---|---|
| FR-08 | The system shall use the latest stored item name, price, and availability when validating an order at submission time. |
| FR-09 | The system shall allow an authorized vendor to set each menu item for the vendor's stall to available or unavailable. |
| FR-10 | After an availability update succeeds, subsequent menu requests shall show the new state; existing unsubmitted baskets shall be revalidated at submission. |

### 4.3 Ordering and Customer Information

| ID | Requirement |
|---|---|
| FR-11 | Before order submission, the system shall require the student's name, student ID, and a contact phone number. |
| FR-12 | The system shall accept a student name of 1-100 characters, a student ID of 1-20 letters or digits, and a contact phone number of 7-20 characters containing only digits, spaces, `+`, or `-`. |
| FR-13 | The system shall show an order summary containing the stall, selected items, quantities, unit prices, line totals, pickup time, and total amount before submission. |
| FR-14 | The system shall calculate each line total as submitted quantity multiplied by the current unit price, and the order total as the sum of all line totals. |
| FR-15 | The system shall accept an order only when it has at least one valid available item, valid customer information, and an available pickup slot belonging to the selected stall. |
| FR-16 | The system shall create the order and all order items in one database transaction so that either the complete order is stored or no part is stored. |
| FR-17 | The system shall preserve the unit price used at submission in each order item so later menu-price changes do not alter the accepted order total. |

### 4.4 Pickup-Time Requirements

| ID | Requirement |
|---|---|
| FR-18 | The system shall display only enabled future pickup slots for the selected stall whose accepted-order count is below the slot capacity. |
| FR-19 | The system shall reject a pickup slot that is disabled, in the past, assigned to another stall, or full at the moment of submission. |
| FR-20 | When a pickup slot becomes invalid, the system shall keep the basket contents, explain the reason, and require the student to choose another available slot. |

### 4.5 Confirmation and Order Number

| ID | Requirement |
|---|---|
| FR-21 | For every accepted order, the system shall generate a non-empty order number that is unique across all orders. |
| FR-22 | After successful submission, the system shall display a confirmation containing the order number, stall name, pickup date and time, item summary, total amount, current status, and instruction to pay at collection. |
| FR-23 | The system shall handle repeated submission of the same client submission token idempotently by returning the original accepted order instead of creating another order. |

### 4.6 Order Status Requirements

| ID | Requirement |
|---|---|
| FR-24 | The system shall allow a student to retrieve an order using its order number together with the matching student ID. |
| FR-25 | The student order view shall show the current status as `RECEIVED`, `PREPARING`, `READY`, `COLLECTED`, or `CANCELLED`, plus the stall and pickup details. |
| FR-26 | A newly accepted order shall have the status `RECEIVED`. |

### 4.7 Vendor-Side Requirements

| ID | Requirement |
|---|---|
| FR-27 | The system shall allow an authenticated vendor to view non-collected incoming orders only for stalls the vendor is authorized to manage. |
| FR-28 | Each vendor order entry shall show the order number, student name, items and quantities, pickup time, submission time, total, and current status. |
| FR-29 | The system shall allow the vendor to sort displayed orders by pickup time in ascending or descending order; ascending shall be the default. |
| FR-30 | The system shall allow an authorized vendor to change an order from `RECEIVED` to `PREPARING` and from `PREPARING` to `READY`. |
| FR-31 | The system shall allow an authorized vendor to confirm collection by changing a `READY` order to `COLLECTED`. |
| FR-32 | The system shall reject invalid status transitions, including moving a `COLLECTED` or `CANCELLED` order back to an active status. |
| FR-33 | The system shall allow an authorized vendor to cancel an uncollected order by setting it to `CANCELLED` and shall store the update time. |

### 4.8 Validation and Error Handling

| ID | Requirement |
|---|---|
| FR-34 | The system shall validate all order, menu-availability, and status-change input on the server even if it was previously validated in the browser. |
| FR-35 | For invalid input, the system shall reject the operation, preserve valid user-entered values where safe, and display a message identifying the field or action and how to correct it. |
| FR-36 | The system shall not expose database errors, stack traces, credentials, or internal identifiers in messages shown to users. |
| FR-37 | If an order operation fails before its transaction is committed, the system shall not display a successful confirmation or consume pickup capacity. |

## 5. Non-Functional Requirements

### 5.1 Usability

| ID | Requirement |
|---|---|
| NFR-01 | A first-time student shall be able to proceed from the stall list to a confirmed valid order using no more than five main screens: stalls, menu, basket, checkout, and confirmation. |
| NFR-02 | Student and vendor pages shall use consistent labels for pickup time and the five order statuses throughout the system. |
| NFR-03 | Any successful vendor availability or status update shall display visible confirmation, and any rejected update shall explain the reason. |

### 5.2 Responsiveness

| ID | Requirement |
|---|---|
| NFR-04 | All student and vendor workflows shall remain usable without horizontal page scrolling at viewport widths from 320 to 1920 CSS pixels, except for data tables that provide their own accessible scroll region. |
| NFR-05 | Interactive controls shall remain visible and operable in both portrait mobile and desktop layouts at 200% browser zoom. |

### 5.3 Accessibility

| ID | Requirement |
|---|---|
| NFR-06 | All functional controls shall be operable using a keyboard alone with a visible focus indicator and a logical focus order. |
| NFR-07 | Informative menu images shall have alternative text; decorative images shall use empty alternative text. |
| NFR-08 | Form fields shall have programmatically associated labels, and validation errors shall be linked to the affected fields and announced to assistive technology. |
| NFR-09 | Text and interactive components shall meet WCAG 2.1 Level AA contrast ratios: at least 4.5:1 for normal text and 3:1 for large text and graphical controls. |

### 5.4 Performance

| ID | Requirement |
|---|---|
| NFR-10 | Under a test load of 50 concurrent users and with up to 10,000 stored orders, 95% of stall, menu, order-status, and vendor-queue requests shall complete within 2 seconds, excluding user network latency. |
| NFR-11 | Under the same test conditions, 95% of valid order submissions shall return a confirmation within 3 seconds. |

### 5.5 Security and Privacy

| ID | Requirement |
|---|---|
| NFR-12 | Vendor functions shall require authentication, and every vendor read or update shall verify authorization for the affected stall on the server. |
| NFR-13 | Vendor passwords shall be stored only as salted, adaptive password hashes and shall never be logged or returned by the application. |
| NFR-14 | All production browser-to-server communication shall use HTTPS, and database credentials shall be supplied through protected configuration rather than source code. |
| NFR-15 | The system shall use parameterized queries or an equivalent safe data-access mechanism for every database operation. |
| NFR-16 | Student contact information shall be displayed only where required to process or retrieve the related order and shall not be included in public stall or menu responses. |

### 5.6 Reliability

| ID | Requirement |
|---|---|
| NFR-17 | Order creation and pickup-capacity allocation shall be transactional and safe under concurrent submissions, preventing accepted orders from exceeding slot capacity. |
| NFR-18 | A daily database backup shall be produced in a restorable format, with restoration verified at least once before an assessed deployment. |
| NFR-19 | The application shall record server-side failures and vendor data changes with timestamps while excluding passwords and unnecessary personal information. |

### 5.7 Maintainability

| ID | Requirement |
|---|---|
| NFR-20 | Source code shall separate user-interface, application, and data-access responsibilities and shall keep status values in one shared definition. |
| NFR-21 | Automated tests shall cover the order-total calculation, item and slot revalidation, duplicate-submission handling, authorization, and every permitted or rejected status transition. |
| NFR-22 | Database schema changes shall be recorded as repeatable, version-controlled migrations. |

### 5.8 Browser Compatibility

| ID | Requirement |
|---|---|
| NFR-23 | At release, the MVP shall complete all acceptance criteria on the latest and previous major versions of Chrome, Edge, and Firefox. |
| NFR-24 | The student ordering and status workflows shall also complete all acceptance criteria on the latest major mobile versions of Chrome for Android and Safari for iOS. |

## 6. MVP Limitations

- Students cannot pay online; payment occurs at collection.
- Orders cannot be delivered.
- The system does not provide ratings, loyalty points, calorie filtering, or AI recommendations.
- The data model covers one campus context and has no campus-management feature.
- The MVP does not promise exact preparation completion times; status depends on vendor updates.
- The MVP does not provide a student account history; an order is retrieved using its order number and matching student ID.

## 7. Requirements Traceability

| Area or feature | Functional requirements | Non-functional requirements | Acceptance criteria |
|---|---|---|---|
| Participating stalls and menus | FR-01-FR-03 | NFR-01, NFR-04-NFR-09, NFR-23-NFR-24 | AC-01-AC-03 |
| Item selection and quantity | FR-04-FR-08 | NFR-01, NFR-06 | AC-04-AC-06 |
| Pickup slots | FR-18-FR-20 | NFR-17 | AC-07-AC-08 |
| Customer information | FR-11-FR-12 | NFR-08, NFR-16 | AC-09, AC-22 |
| Order summary and submission | FR-13-FR-17, FR-34-FR-37 | NFR-10-NFR-11, NFR-15, NFR-17 | AC-10-AC-11, AC-22, AC-24 |
| Order number and confirmation | FR-21-FR-23 | NFR-10-NFR-11 | AC-12-AC-13, AC-23 |
| Student order status | FR-24-FR-26 | NFR-02, NFR-10, NFR-16 | AC-14 |
| Vendor incoming orders and sorting | FR-27-FR-29 | NFR-03-NFR-06, NFR-12, NFR-23 | AC-15-AC-16 |
| Menu availability management | FR-09-FR-10, FR-34-FR-36 | NFR-03, NFR-12, NFR-19 | AC-17 |
| Vendor status and collection | FR-30-FR-33 | NFR-02-NFR-03, NFR-12, NFR-19-NFR-21 | AC-18-AC-21 |
| Error and duplicate handling | FR-23, FR-34-FR-37 | NFR-03, NFR-17, NFR-19 | AC-22-AC-24 |
| Data and implementation quality | FR-16-FR-17 | NFR-13-NFR-22 | Verified by technical and automated tests |
