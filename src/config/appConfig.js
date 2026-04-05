// ╔══════════════════════════════════════════════════════════════╗
// ║          Briya Room Reservations — Default Config            ║
// ║                                                              ║
// ║  These are FALLBACK values used only while the app is        ║
// ║  fetching real settings from /api/config on startup.         ║
// ║  To change behavior, update the backend .env file.           ║
// ╚══════════════════════════════════════════════════════════════╝

const appConfig = {
  // ── Feature toggles ─────────────────────────────────────────
  weatherEnabled:          false,
  visitorCounterEnabled:   true,
  enableRecurringEvents:   true,
  requireLoginForCalendar: true,

  // ── Booking window ───────────────────────────────────────────
  bookingStartHour:        8,
  bookingEndHour:          21,
  slotDurationMinutes:     15,

  // ── Weekend settings ─────────────────────────────────────────
  allowWeekends:           true,
  allowWeekendBookings:    false,

  // ── Booking rules ────────────────────────────────────────────
  allowPastBookings:       false,
  allowDoubleBooking:      true,
  recurringMaxMonths:      12,

  // ── Business hours ────────────────────────────────────────────
  businessStart:           '08:00',
  businessEnd:             '17:00',
  businessDays:            [1, 2, 3, 4, 5],

  // ── Permissions ──────────────────────────────────────────────
  canCreateRoles:          ['superadmin', 'admin', 'standard'],
  editOthersRole:          'admin',
  deleteRole:              'admin',
}

export default appConfig
