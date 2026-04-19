import { Router } from 'express'
import crypto from 'crypto'
import pool from '../config/db.js'
import { authMiddleware, requireAuth } from '../middleware/authMiddleware.js'
import { eventWriteLimiter, otpRequestLimiter, otpRequestEmailLimiter, otpVerifyLimiter } from '../middleware/rateLimiter.js'
import { verifyToken, signTokenWith } from '../utils/jwt.js'
import { sendOtpEmail } from '../services/emailService.js'
import { writeAuditLog, ACTION_TYPES } from '../services/auditLog.js'

const router = Router()

// ── Ensure reservation_otps has single-use editToken columns ──
;(async () => {
  // Catch ER_DUP_FIELDNAME (1060) so this is idempotent on MySQL 5.x,
  // which does not support ADD COLUMN IF NOT EXISTS.
  const ignoreDupCol = err => { if (err.code !== 'ER_DUP_FIELDNAME') throw err }
  await pool.query(`ALTER TABLE reservation_otps ADD COLUMN edit_jti      VARCHAR(64) NULL`).catch(ignoreDupCol)
  await pool.query(`ALTER TABLE reservation_otps ADD COLUMN edit_jti_used TINYINT NOT NULL DEFAULT 0`).catch(ignoreDupCol)
  await pool.query(`ALTER TABLE reservation_otps ADD INDEX idx_res_otps_edit_jti (edit_jti)`).catch(() => {})
})()

// ── OTP helpers ───────────────────────────────────────────────

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000))
}

function hashOtp(otp, reservationId) {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not set — cannot hash OTP')
  return crypto.createHmac('sha256', secret).update(`${otp}:${reservationId}`).digest('hex')
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return '***@***'
  const [local, domain] = email.split('@')
  return `${local[0]}***@${domain}`
}

// OTP console audit (supplementary to the audit_logs DB write)
function logOtpAttempt(action, reservationId, email, ip, result) {
  console.log(`[OTP-AUDIT] ${new Date().toISOString()} | ${action} | res=${reservationId} | email=${email} | ip=${ip} | result=${result}`)
}

async function resolveSiteId(siteCode) {
  const [[site]] = await pool.query('SELECT id FROM sites WHERE code = ?', [siteCode])
  return site ? site.id : null
}

// GET /api/events/:siteCode/:roomId
router.get('/:siteCode/:roomId', async (req, res) => {
  try {
    const { siteCode, roomId } = req.params
    const [rows] = await pool.query(
      `SELECT
         res.id,
         res.title,
         res.description,
         res.start_time,
         res.end_time,
         res.created_by_name,
         res.recurrence_group_id,
         res.recurrence_index,
         res.all_day
       FROM reservations res
       JOIN sites s ON res.site_id = s.id
       WHERE s.code = ? AND res.room_id = ?
       ORDER BY res.start_time`,
      [siteCode, roomId]
    )
    const events = rows.map(r => ({
      id: r.id, title: r.title,
      start: r.start_time.replace(' ', 'T'),
      end:   r.end_time.replace(' ', 'T'),
      backgroundColor: '#4abfce',
      borderColor:     '#3aaebe',
      extendedProps: {
        bookedBy:          r.created_by_name,
        description:       r.description || '',
        recurrenceGroupId: r.recurrence_group_id || null,
        recurrenceIndex:   r.recurrence_index    ?? null,
        allDay:            !!r.all_day,
      },
    }))
    res.json(events)
  } catch (err) {
    console.error('[events] GET:', err.message)
    res.status(500).json({ error: 'Failed to fetch events' })
  }
})

// POST /api/events/:siteCode/:roomId  — accepts array of event objects (auth required)
router.post('/:siteCode/:roomId', eventWriteLimiter, authMiddleware, requireAuth, async (req, res) => {
  try {
    const { siteCode, roomId } = req.params
    const siteId = await resolveSiteId(siteCode)
    if (!siteId) return res.status(400).json({ error: `Site not found: ${siteCode}` })

    const incoming = Array.isArray(req.body) ? req.body : [req.body]

    // Identity comes from the signed JWT — never from extendedProps (untrusted body)
    const ownerEmail    = req.user.email           || null
    const ownershipType = req.user.emailVerified   ? 'email' : 'device'
    const deviceSession = req.user.deviceSessionId || null

    const insertedIds = []
    for (const ev of incoming) {
      const ep = ev.extendedProps || {}
      const [result] = await pool.query(
        `INSERT INTO reservations
           (site_id, room_id, title, description, start_time, end_time,
            created_by_name, created_tz, recurrence_group_id, recurrence_index, all_day,
            owner_email, ownership_type, created_device_session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          siteId, roomId, ev.title,
          ep.description || null,
          ev.start, ev.end,
          ep.bookedBy || null,
          'America/New_York',
          ep.recurrenceGroupId || null,
          ep.recurrenceIndex   ?? 0,
          ev.allDay ? 1 : 0,
          ownerEmail,
          ownershipType,
          deviceSession,
        ]
      )
      insertedIds.push(result.insertId)
      writeAuditLog({
        action:          ACTION_TYPES.RESERVATION_CREATED,
        reservationId:   result.insertId,
        email:           ownerEmail,
        deviceSessionId: deviceSession,
        metadata:        { role: req.user.role, ownershipType, ip: req.ip },
      })
    }
    res.status(201).json({ ok: true, ids: insertedIds })
  } catch (err) {
    console.error('[events] POST:', err.message)
    res.status(500).json({ error: 'Failed to create event' })
  }
})

// ── Recurrence group endpoints ────────────────────────────────

// DELETE /api/events/:siteCode/:roomId/group/:groupId
//   scope = 'this' | 'following' | 'all'   (query param)
//   fromIndex — required when scope='following'
router.delete('/:siteCode/:roomId/group/:groupId', authMiddleware, requireAuth, async (req, res) => {
  try {
    const { siteCode, roomId, groupId } = req.params
    const { scope, fromIndex } = req.query
    const siteId = await resolveSiteId(siteCode)
    if (!siteId) return res.status(400).json({ error: `Site not found: ${siteCode}` })

    // Verify short-lived OTP edit token
    let otpVerified = false
    let otpEmail    = null
    const editTokenHeader = req.headers['x-edit-token']
    if (editTokenHeader) {
      try {
        const payload = verifyToken(editTokenHeader)
        if (payload.purpose === 'edit') {
          if (payload.jti) {
            const [updateRes] = await pool.query(
              'UPDATE reservation_otps SET edit_jti_used = 1 WHERE edit_jti = ? AND edit_jti_used = 0',
              [payload.jti]
            )
            if (updateRes.affectedRows > 0) {
              otpVerified = true
              otpEmail    = payload.email || null
            } else {
              console.warn(`[events] DELETE group — editToken JTI replay rejected jti=${payload.jti}`)
            }
          } else {
            otpVerified = true
            otpEmail    = payload.email || null
          }
        }
      } catch (_) {}
    }

    // STANDARD users must own the group — fetch one event as a representative sample
    if (req.user.role.toUpperCase() === 'STANDARD') {
      const [[sample]] = await pool.query(
        `SELECT ownership_type, owner_email, created_device_session_id
         FROM reservations
         WHERE recurrence_group_id = ? AND site_id = ? AND room_id = ? LIMIT 1`,
        [groupId, siteId, roomId]
      )
      if (!sample) return res.status(404).json({ error: 'Group not found' })
      const result = enforceOwnership(sample, req, { otpVerified, otpEmail })
      if (!result.allowed) {
        return res.status(403).json({
          error: 'You can only delete your own bookings',
          code:  result.code || result.reason,
        })
      }
    }

    if (scope === 'all') {
      await pool.query(
        `DELETE FROM reservations
         WHERE recurrence_group_id = ? AND site_id = ? AND room_id = ?`,
        [groupId, siteId, roomId]
      )
    } else if (scope === 'following') {
      const idx = parseInt(fromIndex, 10)
      await pool.query(
        `DELETE FROM reservations
         WHERE recurrence_group_id = ? AND site_id = ? AND room_id = ?
           AND recurrence_index >= ?`,
        [groupId, siteId, roomId, idx]
      )
    }
    // 'this' is handled by the single-event DELETE endpoint
    res.json({ ok: true })
  } catch (err) {
    console.error('[events] DELETE group:', err.message)
    res.status(500).json({ error: 'Failed to delete recurrence group' })
  }
})

// PUT /api/events/:siteCode/:roomId/group/:groupId
//   scope = 'following' | 'all'
//   fromIndex — required when scope='following'
//   Body: same event shape (title, start time/end time offsets applied per-occurrence)
router.put('/:siteCode/:roomId/group/:groupId', authMiddleware, requireAuth, async (req, res) => {
  try {
    const { siteCode, roomId, groupId } = req.params
    const { scope, fromIndex } = req.query
    const siteId = await resolveSiteId(siteCode)
    if (!siteId) return res.status(400).json({ error: `Site not found: ${siteCode}` })

    // Verify short-lived OTP edit token
    let otpVerified = false
    let otpEmail    = null
    const editTokenHeader = req.headers['x-edit-token']
    if (editTokenHeader) {
      try {
        const payload = verifyToken(editTokenHeader)
        if (payload.purpose === 'edit') {
          if (payload.jti) {
            const [updateRes] = await pool.query(
              'UPDATE reservation_otps SET edit_jti_used = 1 WHERE edit_jti = ? AND edit_jti_used = 0',
              [payload.jti]
            )
            if (updateRes.affectedRows > 0) {
              otpVerified = true
              otpEmail    = payload.email || null
            } else {
              console.warn(`[events] PUT group — editToken JTI replay rejected jti=${payload.jti}`)
            }
          } else {
            otpVerified = true
            otpEmail    = payload.email || null
          }
        }
      } catch (_) {}
    }

    if (req.user.role.toUpperCase() === 'STANDARD') {
      const [[sample]] = await pool.query(
        `SELECT ownership_type, owner_email, created_device_session_id
         FROM reservations
         WHERE recurrence_group_id = ? AND site_id = ? AND room_id = ? LIMIT 1`,
        [groupId, siteId, roomId]
      )
      if (!sample) return res.status(404).json({ error: 'Group not found' })
      const result = enforceOwnership(sample, req, { otpVerified, otpEmail })
      if (!result.allowed) {
        return res.status(403).json({
          error: 'You can only edit your own bookings',
          code:  result.code || result.reason,
        })
      }
    }

    const ev = req.body
    const ep = ev.extendedProps || {}

    // For group updates we only patch title and description.
    // Time changes are relative (duration shift) — handled client-side per occurrence.
    let sql, params
    if (scope === 'all') {
      sql = `UPDATE reservations SET
               title       = COALESCE(?, title),
               description = ?
             WHERE recurrence_group_id = ? AND site_id = ? AND room_id = ?`
      params = [ev.title || null, ep.description ?? null, groupId, siteId, roomId]
    } else if (scope === 'following') {
      const idx = parseInt(fromIndex, 10)
      sql = `UPDATE reservations SET
               title       = COALESCE(?, title),
               description = ?
             WHERE recurrence_group_id = ? AND site_id = ? AND room_id = ?
               AND recurrence_index >= ?`
      params = [ev.title || null, ep.description ?? null, groupId, siteId, roomId, idx]
    } else {
      return res.status(400).json({ error: 'Invalid scope' })
    }
    await pool.query(sql, params)
    res.json({ ok: true })
  } catch (err) {
    console.error('[events] PUT group:', err.message)
    res.status(500).json({ error: 'Failed to update recurrence group' })
  }
})

// ── Cross-device ownership verification (OTP) ────────────────

// POST /api/events/:siteCode/:roomId/:eventId/request-otp
// Generates a 6-digit OTP for the reservation's owner email.
// Rate limited: 3 requests per 10 min per IP, 5 requests per hour per email.
router.post('/:siteCode/:roomId/:eventId/request-otp', otpRequestLimiter, otpRequestEmailLimiter, authMiddleware, requireAuth, async (req, res) => {
  const { siteCode, roomId, eventId } = req.params
  const { email } = req.body
  const clientIp = req.ip

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required.' })
  }
  const normalizedEmail = email.trim().toLowerCase()

  try {
    const siteId = await resolveSiteId(siteCode)
    if (!siteId) return res.status(400).json({ error: `Site not found: ${siteCode}` })

    // Fetch the reservation and its stored owner_email
    const [[row]] = await pool.query(
      `SELECT id, owner_email, ownership_type
       FROM reservations WHERE id = ? AND site_id = ? AND room_id = ?`,
      [eventId, siteId, roomId]
    )
    if (!row) {
      logOtpAttempt('request', eventId, normalizedEmail, clientIp, 'NOT_FOUND')
      return res.status(404).json({ error: 'Booking not found.' })
    }
    if (!row.owner_email) {
      logOtpAttempt('request', eventId, normalizedEmail, clientIp, 'NO_EMAIL_ON_RECORD')
      return res.status(400).json({ error: 'No email address is on record for this booking.' })
    }
    if (normalizedEmail !== row.owner_email.toLowerCase()) {
      logOtpAttempt('request', eventId, normalizedEmail, clientIp, 'EMAIL_MISMATCH')
      return res.status(403).json({ error: 'That email does not match this booking.' })
    }

    // Invalidate any previous unused OTPs for this reservation
    await pool.query(
      `UPDATE reservation_otps SET used = 1
       WHERE reservation_id = ? AND used = 0`,
      [eventId]
    )

    const otp             = generateOtp()
    const otpHash         = hashOtp(otp, eventId)
    const expiresAt       = new Date(Date.now() + 10 * 60 * 1000)
      .toISOString().slice(0, 19).replace('T', ' ')
    const deviceSessionId = req.user?.deviceSessionId || null

    await pool.query(
      `INSERT INTO reservation_otps
         (reservation_id, email, device_session_id, otp_hash, expires_at, attempts, used)
       VALUES (?, ?, ?, ?, ?, 0, 0)`,
      [eventId, normalizedEmail, deviceSessionId, otpHash, expiresAt]
    )


    // Send email (Resend API if configured, console.log fallback otherwise)
    await sendOtpEmail(normalizedEmail, otp, eventId)
    logOtpAttempt('request', eventId, normalizedEmail, clientIp, 'SENT')

    // Audit log
    writeAuditLog({
      action:          ACTION_TYPES.OTP_REQUESTED,
      reservationId:   eventId,
      email:           normalizedEmail,
      deviceSessionId,
      metadata:        { ip: clientIp },
    })

    return res.json({ ok: true, maskedEmail: maskEmail(row.owner_email) })
  } catch (err) {
    console.error('[events] POST request-otp:', err.message)
    return res.status(500).json({ error: 'Failed to generate code. Try again.' })
  }
})

// POST /api/events/:siteCode/:roomId/:eventId/verify-otp
// Verifies the OTP. On success returns a short-lived editToken JWT.
// Rate limited: 10 attempts per 10 min per IP (DB also caps at 5 per code).
router.post('/:siteCode/:roomId/:eventId/verify-otp', otpVerifyLimiter, authMiddleware, requireAuth, async (req, res) => {
  const { siteCode, roomId, eventId } = req.params
  const { email, otp } = req.body
  const clientIp = req.ip

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and code are required.' })
  }
  const normalizedEmail = email.trim().toLowerCase()
  // Strip every non-digit character before hashing — matches the generation output and
  // handles mobile email clients that render codes with spaces or NBSP separators.
  // login OTP verify already uses this pattern; reservation verify must be consistent.
  const normalizedOtp   = String(otp).replace(/\D/g, '').slice(0, 6)


  try {
    const siteId = await resolveSiteId(siteCode)
    if (!siteId) return res.status(400).json({ error: `Site not found: ${siteCode}` })

    // Verify the reservation exists and belongs to this site/room
    const [[reservation]] = await pool.query(
      'SELECT id FROM reservations WHERE id = ? AND site_id = ? AND room_id = ?',
      [eventId, siteId, roomId]
    )
    if (!reservation) return res.status(404).json({ error: 'Booking not found.' })

    // Expiry is checked in SQL via UTC_TIMESTAMP() so the comparison is always in UTC
    // regardless of the Node.js process timezone or how mysql2 reconstructs DATETIME values.
    const [[otpRow]] = await pool.query(
      `SELECT id, otp_hash, expires_at, attempts, used
       FROM reservation_otps
       WHERE reservation_id = ? AND email = ? AND used = 0
         AND expires_at > UTC_TIMESTAMP()
       ORDER BY id DESC LIMIT 1`,
      [eventId, normalizedEmail]
    )

    if (otpRow) {
    } else {
    }

    if (!otpRow) {
      logOtpAttempt('verify', eventId, normalizedEmail, clientIp, 'NO_ROW')
      writeAuditLog({ action: ACTION_TYPES.OTP_FAILED, reservationId: eventId, email: normalizedEmail, metadata: { ip: clientIp, reason: 'NO_ROW' } })
      return res.status(400).json({ error: 'No active code found. It may have expired — request a new one.' })
    }
    // Increment attempt count atomically BEFORE checking, and enforce max
    const [updateResult] = await pool.query(
      'UPDATE reservation_otps SET attempts = attempts + 1 WHERE id = ? AND attempts < 5',
      [otpRow.id]
    )
    if (updateResult.affectedRows === 0) {
      logOtpAttempt('verify', eventId, normalizedEmail, clientIp, 'ATTEMPTS_EXCEEDED')
      writeAuditLog({ action: ACTION_TYPES.OTP_FAILED, reservationId: eventId, email: normalizedEmail, metadata: { ip: clientIp, reason: 'ATTEMPTS_EXCEEDED' } })
      return res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.', code: 'MAX_ATTEMPTS' })
    }

    const expectedHash = hashOtp(normalizedOtp, eventId)

    // Pre-check buffer lengths — timingSafeEqual throws if lengths differ (e.g., malformed stored hash)
    if (expectedHash.length !== otpRow.otp_hash?.length) {
      logOtpAttempt('verify', eventId, normalizedEmail, clientIp, 'NAMESPACE_MISMATCH')
      writeAuditLog({ action: ACTION_TYPES.OTP_FAILED, reservationId: eventId, email: normalizedEmail, metadata: { ip: clientIp, reason: 'NAMESPACE_MISMATCH' } })
      return res.status(400).json({ error: 'Verification failed. Try again.', code: 'NAMESPACE_MISMATCH' })
    }

    const hashMatch = crypto.timingSafeEqual(
      Buffer.from(expectedHash,    'hex'),
      Buffer.from(otpRow.otp_hash, 'hex')
    )
    if (!hashMatch) {
      const remaining = 4 - otpRow.attempts // after increment, attempts = otpRow.attempts + 1
      logOtpAttempt('verify', eventId, normalizedEmail, clientIp, `HASH_MISMATCH (${remaining} left)`)
      writeAuditLog({
        action:        ACTION_TYPES.OTP_FAILED,
        reservationId: eventId,
        email:         normalizedEmail,
        metadata:      { ip: clientIp, reason: 'HASH_MISMATCH', attemptsRemaining: Math.max(0, remaining) },
      })
      return res.status(400).json({
        error: remaining > 0
          ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Incorrect code. No attempts remaining — request a new one.',
        code: remaining > 0 ? 'WRONG_CODE' : 'MAX_ATTEMPTS',
        attemptsRemaining: Math.max(0, remaining),
      })
    }

    // Atomically consume the OTP and stamp the JTI in one query.
    // Combining these prevents a window where used=1 is set but the JTI write
    // fails, which would burn the code without ever issuing a token.
    const editJti = crypto.randomBytes(16).toString('hex')
    const [finalConsume] = await pool.query(
      'UPDATE reservation_otps SET used = 1, edit_jti = ? WHERE id = ? AND used = 0',
      [editJti, otpRow.id]
    )
    if (finalConsume.affectedRows === 0) {
      logOtpAttempt('verify', eventId, normalizedEmail, clientIp, 'USED')
      return res.status(400).json({ error: 'Code has already been used.' })
    }

    // Issue a short-lived edit token — single-use via edit_jti stored in DB
    const editToken = signTokenWith(
      { purpose: 'edit', reservationId: String(eventId), email: normalizedEmail, jti: editJti },
      '15m'
    )

    logOtpAttempt('verify', eventId, normalizedEmail, clientIp, 'SUCCESS')
    writeAuditLog({
      action:        ACTION_TYPES.OTP_VERIFIED,
      reservationId: eventId,
      email:         normalizedEmail,
      metadata:      { ip: clientIp },
    })
    return res.json({ ok: true, editToken })
  } catch (err) {
    console.error('[events] POST verify-otp:', err.message)
    return res.status(500).json({ error: 'Verification failed. Try again.' })
  }
})

// ── Legacy booking claim (ownership_type = NULL) ─────────────

// POST /api/events/:siteCode/:roomId/:eventId/claim-request-otp
// Sends a 6-digit OTP to any @briya.org email for a booking that has no owner.
// Booking must have ownership_type IS NULL — if already claimed, returns 403.
// Rate limited: 3 requests per 10 min per IP, 5 per hour per email.
router.post('/:siteCode/:roomId/:eventId/claim-request-otp', otpRequestLimiter, otpRequestEmailLimiter, authMiddleware, requireAuth, async (req, res) => {
  const { siteCode, roomId, eventId } = req.params
  const { email } = req.body

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required.' })
  }
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail.endsWith('@briya.org')) {
    return res.status(400).json({ error: 'INVALID_EMAIL_DOMAIN' })
  }

  try {
    const siteId = await resolveSiteId(siteCode)
    if (!siteId) return res.status(400).json({ error: `Site not found: ${siteCode}` })

    const [[row]] = await pool.query(
      'SELECT id, ownership_type FROM reservations WHERE id = ? AND site_id = ? AND room_id = ?',
      [eventId, siteId, roomId]
    )
    if (!row) return res.status(404).json({ error: 'Booking not found.' })
    if (row.ownership_type !== null) {
      return res.status(403).json({ error: 'This booking has already been claimed.', code: 'ALREADY_OWNED' })
    }

    // Invalidate any previous unused OTPs for this reservation + email
    await pool.query(
      'UPDATE reservation_otps SET used = 1 WHERE reservation_id = ? AND email = ? AND used = 0',
      [eventId, normalizedEmail]
    )

    const otp             = generateOtp()
    const otpHash         = hashOtp(otp, eventId)
    const expiresAt       = new Date(Date.now() + 10 * 60 * 1000)
      .toISOString().slice(0, 19).replace('T', ' ')
    const deviceSessionId = req.user?.deviceSessionId || null

    await pool.query(
      `INSERT INTO reservation_otps
         (reservation_id, email, device_session_id, otp_hash, expires_at, attempts, used)
       VALUES (?, ?, ?, ?, ?, 0, 0)`,
      [eventId, normalizedEmail, deviceSessionId, otpHash, expiresAt]
    )


    await sendOtpEmail(normalizedEmail, otp, eventId)

    writeAuditLog({
      action:          ACTION_TYPES.OTP_REQUESTED,
      reservationId:   eventId,
      email:           normalizedEmail,
      deviceSessionId,
      metadata:        { ip: req.ip, flow: 'legacy-claim' },
    })

    return res.json({ ok: true, maskedEmail: maskEmail(normalizedEmail) })
  } catch (err) {
    console.error('[events] POST claim-request-otp:', err.message)
    return res.status(500).json({ error: 'Failed to generate code. Try again.' })
  }
})

// POST /api/events/:siteCode/:roomId/:eventId/claim-verify-otp
// Verifies the OTP and atomically claims the legacy booking.
// WHERE ownership_type IS NULL in the UPDATE guards against a TOCTOU race:
// if another session claimed first, affectedRows = 0 and the request gets 409.
// Rate limited: 10 attempts per 10 min per IP.
router.post('/:siteCode/:roomId/:eventId/claim-verify-otp', otpVerifyLimiter, authMiddleware, requireAuth, async (req, res) => {
  const { siteCode, roomId, eventId } = req.params
  const { email, otp } = req.body

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and code are required.' })
  }
  const normalizedEmail = email.trim().toLowerCase()
  // Strip every non-digit character before hashing — matches the generation output and
  // handles mobile email clients that render codes with spaces or NBSP separators.
  const normalizedOtp   = String(otp).replace(/\D/g, '').slice(0, 6)


  try {
    const siteId = await resolveSiteId(siteCode)
    if (!siteId) return res.status(400).json({ error: `Site not found: ${siteCode}` })

    // Re-verify booking is still unclaimed — prevents accepting an OTP after a race
    const [[row]] = await pool.query(
      'SELECT id, ownership_type FROM reservations WHERE id = ? AND site_id = ? AND room_id = ?',
      [eventId, siteId, roomId]
    )
    if (!row) return res.status(404).json({ error: 'Booking not found.' })
    if (row.ownership_type !== null) {
      return res.status(403).json({ error: 'This booking has already been claimed.', code: 'ALREADY_OWNED' })
    }

    // Expiry is checked in SQL via UTC_TIMESTAMP() so the comparison is always in UTC
    // regardless of the Node.js process timezone or how mysql2 reconstructs DATETIME values.
    const [[otpRow]] = await pool.query(
      `SELECT id, otp_hash, expires_at, attempts FROM reservation_otps
       WHERE reservation_id = ? AND email = ? AND used = 0
         AND expires_at > UTC_TIMESTAMP()
       ORDER BY id DESC LIMIT 1`,
      [eventId, normalizedEmail]
    )

    if (otpRow) {
    } else {
    }

    if (!otpRow) {
      logOtpAttempt('claim-verify', eventId, normalizedEmail, req.ip, 'NO_ROW')
      writeAuditLog({ action: ACTION_TYPES.OTP_FAILED, reservationId: eventId, email: normalizedEmail, metadata: { ip: req.ip, reason: 'NO_ROW', flow: 'legacy-claim' } })
      return res.status(400).json({ error: 'No active code found. It may have expired — request a new one.' })
    }
    // Increment attempt atomically BEFORE hash check, enforcing max limit
    const [updateResult] = await pool.query(
      'UPDATE reservation_otps SET attempts = attempts + 1 WHERE id = ? AND attempts < 5',
      [otpRow.id]
    )
    if (updateResult.affectedRows === 0) {
      logOtpAttempt('claim-verify', eventId, normalizedEmail, req.ip, 'ATTEMPTS_EXCEEDED')
      writeAuditLog({ action: ACTION_TYPES.OTP_FAILED, reservationId: eventId, email: normalizedEmail, metadata: { ip: req.ip, reason: 'ATTEMPTS_EXCEEDED', flow: 'legacy-claim' } })
      return res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.', code: 'MAX_ATTEMPTS' })
    }

    const expectedHash = hashOtp(normalizedOtp, eventId)

    // Pre-check buffer lengths — timingSafeEqual throws if lengths differ (e.g., malformed stored hash)
    if (expectedHash.length !== otpRow.otp_hash?.length) {
      logOtpAttempt('claim-verify', eventId, normalizedEmail, req.ip, 'NAMESPACE_MISMATCH')
      writeAuditLog({ action: ACTION_TYPES.OTP_FAILED, reservationId: eventId, email: normalizedEmail, metadata: { ip: req.ip, reason: 'NAMESPACE_MISMATCH', flow: 'legacy-claim' } })
      return res.status(400).json({ error: 'Verification failed. Try again.', code: 'NAMESPACE_MISMATCH' })
    }

    const hashMatch = crypto.timingSafeEqual(
      Buffer.from(expectedHash,    'hex'),
      Buffer.from(otpRow.otp_hash, 'hex')
    )
    if (!hashMatch) {
      const remaining = 4 - otpRow.attempts
      logOtpAttempt('claim-verify', eventId, normalizedEmail, req.ip, `HASH_MISMATCH (${remaining} left)`)
      writeAuditLog({
        action:        ACTION_TYPES.OTP_FAILED,
        reservationId: eventId,
        email:         normalizedEmail,
        metadata:      { ip: req.ip, reason: 'HASH_MISMATCH', flow: 'legacy-claim' },
      })
      return res.status(400).json({
        error: remaining > 0
          ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Incorrect code. No attempts remaining — request a new one.',
        code:              remaining > 0 ? 'WRONG_CODE' : 'MAX_ATTEMPTS',
        attemptsRemaining: Math.max(0, remaining),
      })
    }

    // Atomically mark OTP used — AND used = 0 prevents a second concurrent winner
    const [otpConsume] = await pool.query('UPDATE reservation_otps SET used = 1 WHERE id = ? AND used = 0', [otpRow.id])
    if (otpConsume.affectedRows === 0) {
      logOtpAttempt('claim-verify', eventId, normalizedEmail, req.ip, 'USED')
      return res.status(400).json({ error: 'Code has already been used.' })
    }

    // Atomically claim — WHERE ownership_type IS NULL prevents TOCTOU
    const [claimUpdate] = await pool.query(
      `UPDATE reservations
       SET ownership_type = 'email', owner_email = ?
       WHERE id = ? AND site_id = ? AND room_id = ? AND ownership_type IS NULL`,
      [normalizedEmail, eventId, siteId, roomId]
    )

    if (claimUpdate.affectedRows === 0) {
      // Another session claimed it between our SELECT and UPDATE
      return res.status(409).json({ error: 'This booking was just claimed by someone else.', code: 'ALREADY_OWNED' })
    }

    logOtpAttempt('claim-verify', eventId, normalizedEmail, req.ip, 'SUCCESS')
    writeAuditLog({
      action:          ACTION_TYPES.LEGACY_CLAIMED,
      reservationId:   eventId,
      email:           normalizedEmail,
      deviceSessionId: req.user?.deviceSessionId || null,
      metadata:        { ip: req.ip },
    })

    return res.json({ ok: true })
  } catch (err) {
    console.error('[events] POST claim-verify-otp:', err.message)
    return res.status(500).json({ error: 'Verification failed. Try again.' })
  }
})

// ── Ownership enforcement ─────────────────────────────────────
// Single source of truth for edit/delete authorization.
// Returns { allowed, decision, reason, code? }
//   decision : 'allowed' | 'blocked'
//   reason   : 'EMAIL_MATCH' | 'DEVICE_MATCH' | 'LEGACY_BLOCK' | 'MISMATCH' | 'OTP_REQUIRED'
function enforceOwnership(row, req, { otpVerified = false, otpEmail = null } = {}) {
  const ownershipType = row.ownership_type   // null = legacy row

  // ── Legacy: no ownership data was recorded ──────────────────
  if (!ownershipType) {
    return { allowed: false, decision: 'blocked', reason: 'LEGACY_BLOCK' }
  }

  // ── Email ownership ──────────────────────────────────────────
  if (ownershipType === 'email') {
    // Primary path: user proved inbox access at login (emailVerified is set server-side
    // via the JWT — never trusted from the request body).  Once verified, the user can
    // edit their own bookings from any device without a second OTP.
    const emailMatch =
      req.user.emailVerified === true &&
      !!req.user.email &&
      req.user.email.toLowerCase() === (row.owner_email || '').toLowerCase()

    if (emailMatch) {
      return { allowed: true, decision: 'allowed', reason: 'EMAIL_MATCH' }
    }

    // Fallback path: user presented a short-lived editToken issued after a
    // per-booking OTP verification (cross-device flow for unverified sessions).
    const otpEmailMatch =
      otpVerified &&
      !!otpEmail &&
      otpEmail.toLowerCase() === (row.owner_email || '').toLowerCase()

    if (otpEmailMatch) {
      return { allowed: true, decision: 'allowed', reason: 'EMAIL_MATCH' }
    }

    return { allowed: false, decision: 'blocked', reason: 'MISMATCH' }
  }

  // ── Device ownership ─────────────────────────────────────────
  if (ownershipType === 'device') {
    const sameDevice =
      !!req.user.deviceSessionId &&
      req.user.deviceSessionId === row.created_device_session_id

    const otpEmailMatch =
      otpVerified &&
      !!otpEmail &&
      otpEmail.toLowerCase() === (row.owner_email || '').toLowerCase()

    if (sameDevice || otpEmailMatch) {
      return { allowed: true, decision: 'allowed', reason: 'DEVICE_MATCH' }
    }
    return { allowed: false, decision: 'blocked', reason: 'OTP_REQUIRED', code: 'OTP_REQUIRED' }
  }

  // Unknown ownership type — treat as legacy
  return { allowed: false, decision: 'blocked', reason: 'LEGACY_BLOCK' }
}

// PUT /api/events/:siteCode/:roomId/:eventId  — merge-update
router.put('/:siteCode/:roomId/:eventId', authMiddleware, requireAuth, async (req, res) => {
  try {
    const role = req.user.role.toUpperCase()

    const { siteCode, roomId, eventId } = req.params
    const siteId = await resolveSiteId(siteCode)
    if (!siteId) return res.status(400).json({ error: `Site not found: ${siteCode}` })

    // Verify short-lived OTP edit token (cross-device flow) — server-signed, never trusted from body
    let otpVerified = false
    let otpEmail    = null
    const editTokenHeader = req.headers['x-edit-token']
    if (editTokenHeader) {
      try {
        const payload = verifyToken(editTokenHeader)
        if (payload.purpose === 'edit' && String(payload.reservationId) === String(eventId)) {
          if (payload.jti) {
            // Single-use: atomically consume the JTI to prevent concurrent replay
            const [updateRes] = await pool.query(
              'UPDATE reservation_otps SET edit_jti_used = 1 WHERE edit_jti = ? AND edit_jti_used = 0',
              [payload.jti]
            )
            if (updateRes.affectedRows > 0) {
              otpVerified = true
              otpEmail    = payload.email || null
            } else {
              console.warn(`[events] PUT — editToken JTI replay rejected jti=${payload.jti}`)
            }
          } else {
            // Token predates JTI (issued before this deploy) — accepted during 15-min rollout window
            otpVerified = true
            otpEmail    = payload.email || null
          }
        }
      } catch (_) {
        // Expired or tampered token — fall through to normal ownership check
      }
    }

    // ── Ownership gate (STANDARD) ─────────────────────────────
    // Admins and superadmins bypass per-booking ownership checks.
    // Row must be fetched here so audit metadata is available for all roles.
    let row = null
    let ownershipResult = null

    if (role === 'STANDARD') {
      const [[fetched]] = await pool.query(
        `SELECT ownership_type, owner_email, created_device_session_id
         FROM reservations WHERE id = ? AND site_id = ? AND room_id = ?`,
        [eventId, siteId, roomId]
      )
      if (!fetched) return res.status(404).json({ error: 'Booking not found' })
      row = fetched

      ownershipResult = enforceOwnership(row, req, { otpVerified, otpEmail })
      console.log(
        `[events] PUT ${eventId} — ownershipType=${row.ownership_type} ` +
        `decision=${ownershipResult.decision} reason=${ownershipResult.reason}`
      )
      if (!ownershipResult.allowed) {
        return res.status(403).json({
          error: ownershipResult.code === 'OTP_REQUIRED'
            ? 'Cross-device edit requires OTP verification'
            : 'You can only edit your own bookings',
          code: ownershipResult.code || ownershipResult.reason,
        })
      }
    }

    const ev = req.body
    const ep = ev.extendedProps || {}

    await pool.query(
      `UPDATE reservations SET
         title            = COALESCE(?, title),
         description      = ?,
         start_time       = COALESCE(?, start_time),
         end_time         = COALESCE(?, end_time),
         created_by_name  = COALESCE(?, created_by_name)
       WHERE id = ? AND site_id = ? AND room_id = ?`,
      [
        ev.title          || null,
        ep.description    ?? null,
        ev.start          || null,
        ev.end            || null,
        ep.bookedBy       || null,
        eventId, siteId, roomId,
      ]
    )

    // Stamp OTP-verified edits for the audit trail
    if (otpVerified && otpEmail) {
      await pool.query(
        `UPDATE reservations
         SET last_verified_edit_at = NOW(), last_verified_edit_email = ?
         WHERE id = ?`,
        [otpEmail, eventId]
      )
    }

    writeAuditLog({
      action:          ACTION_TYPES.RESERVATION_EDITED,
      reservationId:   eventId,
      email:           req.user?.email || otpEmail || null,
      deviceSessionId: req.user?.deviceSessionId || null,
      metadata: {
        role,
        ownershipType: row?.ownership_type ?? null,
        decision:      ownershipResult?.decision ?? 'allowed',
        reason:        ownershipResult?.reason   ?? 'ADMIN',
        otpVerified,
        ip: req.ip,
      },
    })

    res.json({ ok: true })
  } catch (err) {
    console.error('[events] PUT:', err.message)
    res.status(500).json({ error: 'Failed to update event' })
  }
})

// DELETE /api/events/:siteCode/:roomId/:eventId  — admin or own booking
router.delete('/:siteCode/:roomId/:eventId', authMiddleware, requireAuth, async (req, res) => {
  try {
    const role = req.user.role.toUpperCase()

    const { siteCode, roomId, eventId } = req.params
    const siteId = await resolveSiteId(siteCode)
    if (!siteId) return res.status(400).json({ error: `Site not found: ${siteCode}` })

    // Verify short-lived OTP edit token — same mechanism as PUT
    let otpVerified = false
    let otpEmail    = null
    const editTokenHeader = req.headers['x-edit-token']
    if (editTokenHeader) {
      try {
        const payload = verifyToken(editTokenHeader)
        if (payload.purpose === 'edit' && String(payload.reservationId) === String(eventId)) {
          if (payload.jti) {
            // Single-use: atomically consume the JTI to prevent concurrent replay
            const [updateRes] = await pool.query(
              'UPDATE reservation_otps SET edit_jti_used = 1 WHERE edit_jti = ? AND edit_jti_used = 0',
              [payload.jti]
            )
            if (updateRes.affectedRows > 0) {
              otpVerified = true
              otpEmail    = payload.email || null
            } else {
              console.warn(`[events] DELETE — editToken JTI replay rejected jti=${payload.jti}`)
            }
          } else {
            otpVerified = true
            otpEmail    = payload.email || null
          }
        }
      } catch (_) {
        // Expired or tampered token — fall through to normal ownership check
      }
    }

    // ── Ownership gate (STANDARD) ─────────────────────────────
    let row = null
    let ownershipResult = null

    if (role === 'STANDARD') {
      const [[fetched]] = await pool.query(
        `SELECT ownership_type, owner_email, created_device_session_id
         FROM reservations WHERE id = ? AND site_id = ? AND room_id = ?`,
        [eventId, siteId, roomId]
      )
      if (!fetched) return res.status(404).json({ error: 'Booking not found' })
      row = fetched

      ownershipResult = enforceOwnership(row, req, { otpVerified, otpEmail })
      console.log(
        `[events] DELETE ${eventId} — ownershipType=${row.ownership_type} ` +
        `decision=${ownershipResult.decision} reason=${ownershipResult.reason}`
      )
      if (!ownershipResult.allowed) {
        return res.status(403).json({
          error: ownershipResult.code === 'OTP_REQUIRED'
            ? 'Cross-device delete requires OTP verification'
            : 'You can only delete your own bookings',
          code: ownershipResult.code || ownershipResult.reason,
        })
      }
    }

    await pool.query(
      'DELETE FROM reservations WHERE id = ? AND site_id = ? AND room_id = ?',
      [eventId, siteId, roomId]
    )

    writeAuditLog({
      action:          ACTION_TYPES.RESERVATION_DELETED,
      reservationId:   eventId,
      email:           req.user?.email || otpEmail || null,
      deviceSessionId: req.user?.deviceSessionId || null,
      metadata: {
        role,
        ownershipType: row?.ownership_type ?? null,
        decision:      ownershipResult?.decision ?? 'allowed',
        reason:        ownershipResult?.reason   ?? 'ADMIN',
        otpVerified,
        ip: req.ip,
      },
    })

    res.json({ ok: true })
  } catch (err) {
    console.error('[events] DELETE:', err.message)
    res.status(500).json({ error: 'Failed to delete event' })
  }
})

export default router
