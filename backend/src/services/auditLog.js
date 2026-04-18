/**
 * auditLog.js — writes structured events to the audit_logs table.
 *
 * Table schema (already exists in DB):
 *   id               INT AUTO_INCREMENT PK
 *   action_type      VARCHAR — see ACTION_TYPES below
 *   reservation_id   INT NULL
 *   user_email       VARCHAR(254) NULL
 *   device_session_id VARCHAR(128) NULL
 *   metadata         JSON NULL      — arbitrary extra context
 *   created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
 *
 * All writes are fire-and-forget — a DB failure here must never
 * break the request that triggered the audit event.
 */

import pool from '../config/db.js'

export const ACTION_TYPES = {
  // Auth
  LOGIN:               'LOGIN',
  LOGIN_FAILED:        'LOGIN_FAILED',
  LOGOUT_ALL:          'LOGOUT_ALL',
  // Login email OTP
  LOGIN_OTP_REQUESTED: 'LOGIN_OTP_REQUESTED',
  LOGIN_OTP_VERIFIED:  'LOGIN_OTP_VERIFIED',
  LOGIN_OTP_FAILED:    'LOGIN_OTP_FAILED',
  // Cross-device reservation OTP
  OTP_REQUESTED:     'OTP_REQUESTED',
  OTP_VERIFIED:      'OTP_VERIFIED',
  OTP_FAILED:        'OTP_FAILED',
  TRUSTED_DEVICE_USED:     'TRUSTED_DEVICE_USED',
  TRUSTED_DEVICE_REJECTED: 'TRUSTED_DEVICE_REJECTED',
  // Input validation
  INVALID_EMAIL_ATTEMPT: 'INVALID_EMAIL_ATTEMPT',
  // Rate limiting
  OTP_RATE_LIMIT_HIT:    'OTP_RATE_LIMIT_HIT',
  // Reservations
  RESERVATION_CREATED: 'RESERVATION_CREATED',
  RESERVATION_EDITED:  'RESERVATION_EDITED',
  RESERVATION_DELETED: 'RESERVATION_DELETED',
  LEGACY_CLAIMED:      'LEGACY_CLAIMED',
}

/**
 * @param {object} opts
 * @param {string}  opts.action          - one of ACTION_TYPES
 * @param {number|string|null} [opts.reservationId]
 * @param {string|null} [opts.email]
 * @param {string|null} [opts.deviceSessionId]
 * @param {object|null} [opts.metadata]  - extra JSON context (ip, reason, etc.)
 */
export async function writeAuditLog({ action, reservationId = null, email = null, deviceSessionId = null, metadata = null }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs
         (action_type, reservation_id, user_email, device_session_id, metadata)
       VALUES (?, ?, ?, ?, ?)`,
      [
        action,
        reservationId  || null,
        email          || null,
        deviceSessionId || null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    )
  } catch (err) {
    // Never throw — audit failures must not break the main flow
    console.error('[audit] Failed to write log:', err.message)
  }
}
