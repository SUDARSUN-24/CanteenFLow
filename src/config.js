// Business rules for ordering, cancelling and vendor protection.
//
// !! PROPOSALS ONLY: every value below is to be confirmed with Study Lab
// !! (the customer). Change a number here and the whole app follows it:
// !! the server checks, the API (/api/config) and the pages all read from this file.
// Do not copy these numbers anywhere else.

module.exports = Object.freeze({
  // To be confirmed with Study Lab: orders one 15-minute pickup slot can take.
  // A slot is unavailable when it holds this many orders; a cancelled order frees its place.
  SLOT_CAPACITY: 5,

  // To be confirmed with Study Lab: active orders (Received, Preparing or Ready,
  // for today or later) one student may hold at the same time.
  MAX_ACTIVE_ORDERS_PER_STUDENT: 2,

  // To be confirmed with Study Lab: after this many No-show orders a student
  // cannot place new orders and is asked to contact the stall.
  NO_SHOW_LIMIT: 3,

  // To be confirmed with Study Lab: the cancel window. A student may cancel only
  // while the order has one of these statuses (i.e. before the stall starts preparing).
  CANCEL_WINDOW_STATUSES: Object.freeze(['RECEIVED']),

  // To be confirmed with Study Lab: demo student IDs are exactly this many digits.
  STUDENT_ID_DIGITS: 10,

  // To be confirmed with Study Lab: longest reason a vendor can give when rejecting or cancelling.
  REASON_MAX_CHARS: 200,

  // To be confirmed with Study Lab: how long a vendor's demo sign-in lasts.
  VENDOR_SESSION_HOURS: 12,
});
