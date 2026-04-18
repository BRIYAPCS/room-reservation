import { Router } from 'express'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { readEnv } from '../utils/envReader.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.js'

const router = Router()

// Config overrides written by the admin dashboard live next to .env
const OVERRIDES_PATH = resolve(process.cwd(), 'config_overrides.json')

// Only these boolean keys can be set via the dashboard (never DB/JWT/PIN values)
const ALLOWED_KEYS = new Set([
  'weatherEnabled', 'visitorCounterEnabled', 'enableRecurringEvents',
  'requireLoginForCalendar', 'allowPastBookings', 'allowDoubleBooking',
  'allowWeekendBookings', 'siteManagementEnabled', 'roomManagementEnabled',
])

function readOverrides() {
  try {
    if (existsSync(OVERRIDES_PATH)) return JSON.parse(readFileSync(OVERRIDES_PATH, 'utf8'))
  } catch {}
  return {}
}

const bool = key        => readEnv(key) === 'true'
const int  = (key, def) => { const v = parseInt(readEnv(key), 10); return Number.isFinite(v) ? v : def }
const str  = (key, def) => readEnv(key) || def
const arr  = (key, def) => {
  const v = readEnv(key)
  if (!v) return def
  return v.split(',').map(s => s.trim()).filter(Boolean)
}

// GET /api/config
// Public — exposes all feature flags and booking rules.
// .env values are the base; config_overrides.json (written by admin dashboard) wins.
router.get('/', (_req, res) => {
  const overrides = readOverrides()
  res.setHeader('Cache-Control', 'public, max-age=30')
  res.json({
    // ── Feature toggles ───────────────────────────────────────
    weatherEnabled:          bool('WEATHER_ENABLED'),
    visitorCounterEnabled:   bool('VISITOR_COUNTER_ENABLED'),
    enableRecurringEvents:   bool('ENABLE_RECURRING_EVENTS'),
    requireLoginForCalendar: bool('REQUIRE_LOGIN_FOR_CALENDAR'),

    // ── Booking window ────────────────────────────────────────
    bookingStartHour:        int('BOOKING_START_HOUR', 8),
    bookingEndHour:          int('BOOKING_END_HOUR',   21),
    slotDurationMinutes:     int('SLOT_DURATION_MINUTES', 15),

    // ── Weekend settings ──────────────────────────────────────
    allowWeekends:           bool('ALLOW_WEEKENDS'),
    allowWeekendBookings:    bool('ALLOW_WEEKEND_BOOKINGS'),

    // ── Booking rules ─────────────────────────────────────────
    allowPastBookings:       bool('ALLOW_PAST_BOOKINGS'),
    allowDoubleBooking:      bool('ALLOW_DOUBLE_BOOKING'),
    recurringMaxMonths:      int('RECURRING_MAX_MONTHS', 12),

    // ── Business hours ────────────────────────────────────────
    businessStart:           str('BUSINESS_START', '08:00'),
    businessEnd:             str('BUSINESS_END',   '17:00'),
    businessDays:            arr('BUSINESS_DAYS',  [1,2,3,4,5]).map(Number),

    // ── Permissions ───────────────────────────────────────────
    canCreateRoles:          arr('CAN_CREATE_ROLES', ['superadmin', 'admin', 'standard']),
    editOthersRole:          str('EDIT_OTHERS_ROLE', 'admin'),
    deleteRole:              str('DELETE_ROLE',      'admin'),

    // ── Admin dashboard toggles (default on; overridden via dashboard) ──
    siteManagementEnabled:   true,
    roomManagementEnabled:   true,

    // Dashboard overrides win over all .env defaults above
    ...overrides,
  })
})

// PUT /api/config  (superadmin only)
// Body: { key: boolean, ... }  — only ALLOWED_KEYS accepted
router.put('/', authMiddleware, requireSuperAdmin, (req, res) => {
  const updates = req.body || {}
  const sanitized = {}
  for (const [key, val] of Object.entries(updates)) {
    if (ALLOWED_KEYS.has(key) && typeof val === 'boolean') sanitized[key] = val
  }
  const merged = { ...readOverrides(), ...sanitized }
  try {
    writeFileSync(OVERRIDES_PATH, JSON.stringify(merged, null, 2), 'utf8')
    res.json({ ok: true, overrides: merged })
  } catch (err) {
    res.status(500).json({ error: 'Failed to save config: ' + err.message })
  }
})

export default router
