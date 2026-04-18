import crypto from 'crypto'
import { Router } from 'express'
import pool from '../config/db.js'
import { signToken, signTokenWith, verifyToken } from '../utils/jwt.js'
import { pinLimiter, otpRequestLimiter, otpRequestEmailLimiter, otpVerifyLimiter, requireBriyaEmail } from '../middleware/rateLimiter.js'
import { authMiddleware, requireAuth } from '../middleware/authMiddleware.js'
import { sendLoginOtpEmail } from '../services/emailService.js'
import { writeAuditLog, ACTION_TYPES } from '../services/auditLog.js'

const router = Router()

// ── Ensure tables exist ───────────────────────────────────────
;(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trusted_devices (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        email             VARCHAR(254)  NOT NULL,
        device_session_id VARCHAR(128)  NOT NULL,
        expires_at        DATETIME      NOT NULL,
        created_at        DATETIME      DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_trusted_device (email, device_session_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
  } catch (err) {
    console.error('[auth] Failed to ensure trusted_devices table:', err.message)
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS login_otps (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        email               VARCHAR(254) NOT NULL,
        otp_hash            VARCHAR(64)  NOT NULL,
        device_session_id   VARCHAR(128) NULL,
        expires_at          DATETIME     NOT NULL,
        attempts            INT          NOT NULL DEFAULT 0,
        used                TINYINT      NOT NULL DEFAULT 0,
        claim_jti           VARCHAR(64)  NULL,
        claim_token_used    TINYINT      NOT NULL DEFAULT 0,
        created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_login_otps_email     (email),
        INDEX idx_login_otps_claim_jti (claim_jti)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    // Add columns to existing tables — catch ER_DUP_FIELDNAME (1060) so this is
    // idempotent on MySQL 5.x which does not support ADD COLUMN IF NOT EXISTS.
    const ignoreDupCol = err => { if (err.code !== 'ER_DUP_FIELDNAME') throw err }
    await pool.query(`ALTER TABLE login_otps ADD COLUMN claim_jti        VARCHAR(64) NULL`).catch(ignoreDupCol)
    await pool.query(`ALTER TABLE login_otps ADD COLUMN claim_token_used TINYINT NOT NULL DEFAULT 0`).catch(ignoreDupCol)
    // Ignore duplicate-key name error for index (ER_DUP_KEYNAME)
    await pool.query(`ALTER TABLE login_otps ADD INDEX idx_login_otps_claim_jti (claim_jti)`).catch(() => {})
  } catch (err) {
    console.error('[auth] Failed to ensure login_otps table:', err.message)
  }

  // Migrate trusted_devices — add user_agent / ip_hash if not present.
  // Catch ER_DUP_FIELDNAME so this is idempotent on MySQL 5.x.
  try {
    const ignoreDupCol = err => { if (err.code !== 'ER_DUP_FIELDNAME') throw err }
    await pool.query(`ALTER TABLE trusted_devices ADD COLUMN user_agent VARCHAR(255) NULL`).catch(ignoreDupCol)
    await pool.query(`ALTER TABLE trusted_devices ADD COLUMN ip_hash    VARCHAR(64)  NULL`).catch(ignoreDupCol)
  } catch (err) {
    console.error('[auth] Failed to migrate trusted_devices columns:', err.message)
  }

  // users table — minimal: keyed by email, holds last_logout_at for session revocation.
  // Rows only exist for users who have called /auth/logout-all at least once.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        email          VARCHAR(254) NOT NULL,
        last_logout_at DATETIME     NULL,
        PRIMARY KEY (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
  } catch (err) {
    console.error('[auth] Failed to ensure users table:', err.message)
  }
})()

// ── Trusted device helpers ────────────────────────────────────
// Expiry window is configurable via env; defaults to 90 days.
const TRUSTED_DEVICE_DAYS = parseInt(process.env.TRUSTED_DEVICE_DAYS || '90', 10)

/** One-way hash of an IP address — stored in trusted_devices for soft IP matching. */
function hashIp(ip) {
  return crypto.createHash('sha256').update(String(ip || '')).digest('hex')
}

/**
 * Checks whether email + deviceSessionId appear in trusted_devices with a non-expired row.
 *
 * Hard check  — user-agent must match the stored value (skipped when stored UA is NULL,
 *               which happens for rows created before this migration).
 * Soft check  — IP mismatch is not a rejection; it sets ipWarning: true in the return value
 *               so callers can log it without blocking the login.
 *
 * Returns { trusted: boolean, reason?: string, ipWarning?: boolean }.
 * Fails CLOSED — any DB error returns { trusted: false, reason: 'DB_ERROR' }.
 */
async function isTrustedDevice(email, deviceSessionId, req) {
  if (!email || !deviceSessionId || !/^[A-Za-z0-9-]{16,128}$/.test(deviceSessionId)) {
    return { trusted: false, reason: 'INVALID_FIELDS' }
  }
  try {
    const [[row]] = await pool.query(
      `SELECT id, user_agent, ip_hash FROM trusted_devices
       WHERE email = ? AND device_session_id = ? AND expires_at > NOW()
       LIMIT 1`,
      [email, deviceSessionId]
    )
    if (!row) return { trusted: false, reason: 'NOT_FOUND' }

    // Hard check: user-agent must match.
    // Skip when row.user_agent is NULL — row pre-dates this migration.
    if (row.user_agent !== null) {
      const currentUa = req?.headers?.['user-agent'] || ''
      if (currentUa !== row.user_agent) {
        return { trusted: false, reason: 'UA_MISMATCH' }
      }
    }

    // Soft check: flag an IP change but do not reject (prevents breaking UX for mobile/roaming users).
    let ipWarning = false
    if (row.ip_hash !== null) {
      if (hashIp(req?.ip) !== row.ip_hash) {
        ipWarning = true
      }
    }

    return { trusted: true, ipWarning }
  } catch {
    return { trusted: false, reason: 'DB_ERROR' }
  }
}

/**
 * Registers (or refreshes) a trusted device for TRUSTED_DEVICE_DAYS.
 * Stores the current user-agent and IP hash so future validations can
 * detect UA changes (hard) or IP changes (soft).
 * Uses UPSERT so repeat calls simply extend the expiry window and
 * update the stored UA / IP hash.
 * Never throws — DB failure must not break the calling login flow.
 */
async function upsertTrustedDevice(email, deviceSessionId, req) {
  if (!email || !deviceSessionId || !/^[A-Za-z0-9-]{16,128}$/.test(deviceSessionId)) return
  try {
    const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 19).replace('T', ' ')
    const userAgent = req?.headers?.['user-agent'] || null
    const ipHash    = req?.ip ? hashIp(req.ip) : null
    await pool.query(
      `INSERT INTO trusted_devices (email, device_session_id, expires_at, user_agent, ip_hash)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         expires_at = VALUES(expires_at),
         user_agent = VALUES(user_agent),
         ip_hash    = VALUES(ip_hash)`,
      [email, deviceSessionId, expiresAt, userAgent, ipHash]
    )
  } catch (err) {
    console.error('[auth] Failed to upsert trusted device:', err.message)
  }
}

// ── Helpers ───────────────────────────────────────────────────

function generateOtp() {
  // crypto.randomInt uses the OS CSPRNG — Math.random() is not suitable for OTPs
  return String(crypto.randomInt(100000, 1000000))
}

/** HMAC-SHA256 of "otp:login:email" so login OTP hashes are namespaced separately */
function hashLoginOtp(otp, email) {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not set — cannot hash OTP')
  return crypto.createHmac('sha256', secret).update(`${otp}:login:${email}`).digest('hex')
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return '***@***'
  const [local, domain] = email.split('@')
  return `${local[0]}***@${domain}`
}

// ── POST /api/auth/validate-email ─────────────────────────────
// Calls Power Automate to retrieve the display name for a @briya.org email.
// Returns { valid, name } for UX purposes ONLY — does NOT grant emailVerified.
router.post('/validate-email', async (req, res) => {
  const { email } = req.body
  const webhookUrl = process.env.POWER_AUTOMATE_WEBHOOK_URL

  if (!email || typeof email !== 'string') {
    return res.json({ valid: false, name: '' })
  }
  if (!webhookUrl) {
    console.warn('[auth] PowerAutomate unavailable: POWER_AUTOMATE_WEBHOOK_URL not configured')
    return res.json({ valid: false, name: '', fallback: true })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const r = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    const data = await r.json().catch(() => ({}))
    return res.json({ valid: !!data.valid, name: data.name || '' })
  } catch (err) {
    clearTimeout(timer)
    const reason = controller.signal.aborted ? 'timeout (>5s)' : err.message
    console.warn(`[auth] PowerAutomate unavailable: ${reason}`)
    return res.json({ valid: false, name: '', fallback: true })
  }
})

// ── POST /api/auth/check-trusted ─────────────────────────────
// Lightweight trusted-device probe — no rate limit.
// Returns { trusted: boolean } only; never reveals the reason when false.
// Called by the frontend before requestLoginOtp so trusted users never
// hit the OTP rate limiter.
router.post('/check-trusted', async (req, res) => {
  const { email, deviceSessionId } = req.body
  if (!email || !deviceSessionId) {
    console.debug(`[auth] check-trusted MISSING_FIELDS | email=${!!email} | dsid=${!!deviceSessionId}`)
    return res.json({ trusted: false })
  }
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail.endsWith('@briya.org')) {
    console.debug(`[auth] check-trusted INVALID_DOMAIN | email=${normalizedEmail}`)
    return res.json({ trusted: false })
  }
  const { trusted, reason } = await isTrustedDevice(normalizedEmail, deviceSessionId, req)
  console.debug(`[auth] check-trusted | email=${normalizedEmail} | dsid_len=${String(deviceSessionId).length} | trusted=${trusted} | reason=${reason || 'none'} | ua=${req.headers['user-agent']?.slice(0, 60)}`)
  return res.json({ trusted })
})

// ── POST /api/auth/request-login-otp ─────────────────────────
// Sends a 6-digit OTP to the given @briya.org email for login verification.
// Also calls Power Automate for the display name (UX only — non-blocking).
// Rate limited: 3 requests per 10 min per IP.
router.post('/request-login-otp', otpRequestLimiter, otpRequestEmailLimiter, requireBriyaEmail, async (req, res) => {
  const { email, deviceSessionId } = req.body

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required.' })
  }
  const normalizedEmail    = email.trim().toLowerCase()
  const normalizedDeviceId = typeof deviceSessionId === 'string' ? deviceSessionId.trim() : ''

  try {
    // ── Trusted device: skip OTP entirely ────────────────────────
    // Verified server-side — never trusts a client flag.
    if (normalizedDeviceId) {
      const { trusted, reason, ipWarning } = await isTrustedDevice(normalizedEmail, normalizedDeviceId, req)
      if (trusted) {
        if (ipWarning) {
          console.warn(`[auth] Trusted device IP mismatch (soft) for ${normalizedEmail} — continuing`)
        }
        console.log(`[auth] Trusted device login — skipping OTP for ${normalizedEmail}`)
        return res.json({ ok: true, trusted: true, maskedEmail: maskEmail(normalizedEmail) })
      } else if (reason === 'UA_MISMATCH') {
        // Hard check failed — log and fall through to OTP
        writeAuditLog({
          action:          ACTION_TYPES.TRUSTED_DEVICE_REJECTED,
          email:           normalizedEmail,
          deviceSessionId: normalizedDeviceId,
          metadata:        { reason, ip: req.ip },
        })
      }
    }

    // Invalidate any previous unused OTPs for this email
    await pool.query(
      'UPDATE login_otps SET used = 1 WHERE email = ? AND used = 0',
      [normalizedEmail]
    )

    const otp       = generateOtp()
    const otpHash   = hashLoginOtp(otp, normalizedEmail)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
      .toISOString().slice(0, 19).replace('T', ' ')

    await pool.query(
      `INSERT INTO login_otps (email, otp_hash, device_session_id, expires_at)
       VALUES (?, ?, ?, ?)`,
      [normalizedEmail, otpHash, deviceSessionId || null, expiresAt]
    )

    // TEMP DEBUG — remove before next release
    console.debug(`[OTP-DEBUG] request-login-otp | namespace="login:${normalizedEmail}" | email=${normalizedEmail} | hash_len=${otpHash.length}`)

    // Send OTP email — never throws
    await sendLoginOtpEmail(normalizedEmail, otp)

    // Try PA for display name (UX only) — fire-and-forget, never blocks response
    let name = ''
    const webhookUrl = process.env.POWER_AUTOMATE_WEBHOOK_URL
    if (webhookUrl) {
      try {
        const ctrl = new AbortController()
        const t    = setTimeout(() => ctrl.abort(), 4000)
        const r    = await fetch(webhookUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email: normalizedEmail }),
          signal:  ctrl.signal,
        })
        clearTimeout(t)
        const data = await r.json().catch(() => ({}))
        name = data.name || ''
      } catch { /* PA failure is non-fatal */ }
    }

    writeAuditLog({
      action:          ACTION_TYPES.LOGIN_OTP_REQUESTED,
      email:           normalizedEmail,
      deviceSessionId: deviceSessionId || null,
      metadata:        { ip: req.ip },
    })

    return res.json({ ok: true, maskedEmail: maskEmail(normalizedEmail), name })
  } catch (err) {
    console.error('[auth] POST request-login-otp:', err.message)
    return res.status(500).json({ error: 'Failed to send verification code. Try again.' })
  }
})

// ── POST /api/auth/verify-login-otp ──────────────────────────
// Verifies the 6-digit login OTP. On success returns a short-lived
// emailClaimToken JWT that the frontend passes to /auth/verify.
// Rate limited: 10 attempts per 10 min per IP (DB also caps at 5 per code).
router.post('/verify-login-otp', otpVerifyLimiter, requireBriyaEmail, async (req, res) => {
  const { email, otp, deviceSessionId } = req.body
  // || 5 catches parseInt returning 0 or NaN (e.g. OTP_MAX_ATTEMPTS=0 in .env)
  const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10) || 5
  // TEMP DEBUG — remove before next release
  console.debug(`[OTP-DEBUG] verify-login-otp OTP_MAX_ATTEMPTS=${OTP_MAX_ATTEMPTS} (env="${process.env.OTP_MAX_ATTEMPTS}")`)

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and code are required.' })
  }
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedOtp   = String(otp).replace(/\D/g, '').slice(0, 6)

  // TEMP DEBUG — remove before next release
  console.debug(`[OTP-DEBUG] verify-login-otp START | namespace="login:${normalizedEmail}" | email=${normalizedEmail} | otp_raw_len=${String(otp).length} | otp_norm_len=${normalizedOtp.length}`)

  try {
    // Expiry is checked in SQL via UTC_TIMESTAMP() so the comparison is always in UTC
    // regardless of the Node.js process timezone or how mysql2 reconstructs DATETIME values.
    const [[row]] = await pool.query(
      `SELECT id, otp_hash, expires_at, attempts
       FROM login_otps
       WHERE email = ? AND used = 0
         AND expires_at > UTC_TIMESTAMP()
       ORDER BY id DESC LIMIT 1`,
      [normalizedEmail]
    )

    // TEMP DEBUG — remove before next release
    if (row) {
      console.debug(`[OTP-DEBUG] verify-login-otp ROW_FOUND | id=${row.id} | expires_at=${row.expires_at} | attempts=${row.attempts} | stored_hash_len=${row.otp_hash?.length}`)
    } else {
      console.debug(`[OTP-DEBUG] verify-login-otp NO_ROW | email=${normalizedEmail}`)
    }

    if (!row) {
      writeAuditLog({ action: ACTION_TYPES.LOGIN_OTP_FAILED, email: normalizedEmail,
        deviceSessionId: deviceSessionId || null, metadata: { reason: 'NO_ACTIVE_OTP_OR_EXPIRED' } })
      return res.status(400).json({ error: 'No active code found. It may have expired — request a new one.' })
    }

    // Max attempts check + atomic increment
    const [updateResult] = await pool.query(
      'UPDATE login_otps SET attempts = attempts + 1 WHERE id = ? AND attempts < ?',
      [row.id, OTP_MAX_ATTEMPTS]
    )
    if (updateResult.affectedRows === 0) {
      console.debug(`[OTP-DEBUG] verify-login-otp ATTEMPTS_EXCEEDED | email=${normalizedEmail}`)
      writeAuditLog({ action: ACTION_TYPES.LOGIN_OTP_FAILED, email: normalizedEmail,
        deviceSessionId: deviceSessionId || null, metadata: { reason: 'ATTEMPTS_EXCEEDED' } })
      return res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' })
    }

    // Hash check — timing-safe to prevent side-channel enumeration
    const expectedHash = hashLoginOtp(normalizedOtp, normalizedEmail)
    // TEMP DEBUG — remove before next release
    console.debug(`[OTP-DEBUG] verify-login-otp HASH_CHECK | namespace="login:${normalizedEmail}" | expected_len=${expectedHash.length} | stored_len=${row.otp_hash?.length} | lengths_match=${expectedHash.length === row.otp_hash?.length}`)

    // Pre-check buffer lengths — timingSafeEqual throws if lengths differ (e.g., malformed stored hash)
    if (expectedHash.length !== row.otp_hash?.length) {
      console.debug(`[OTP-DEBUG] verify-login-otp NAMESPACE_MISMATCH | id=${row.id} | expected_len=${expectedHash.length} | stored_len=${row.otp_hash?.length}`)
      writeAuditLog({ action: ACTION_TYPES.LOGIN_OTP_FAILED, email: normalizedEmail,
        deviceSessionId: deviceSessionId || null, metadata: { reason: 'NAMESPACE_MISMATCH' } })
      return res.status(400).json({ error: 'Verification failed. Try again.', code: 'NAMESPACE_MISMATCH' })
    }

    const hashMatch = crypto.timingSafeEqual(
      Buffer.from(expectedHash,  'hex'),
      Buffer.from(row.otp_hash,  'hex')
    )
    if (!hashMatch) {
      console.debug(`[OTP-DEBUG] verify-login-otp HASH_MISMATCH | id=${row.id} | email=${normalizedEmail}`)
      writeAuditLog({ action: ACTION_TYPES.LOGIN_OTP_FAILED, email: normalizedEmail,
        deviceSessionId: deviceSessionId || null, metadata: { reason: 'HASH_MISMATCH' } })
      return res.status(400).json({ error: 'Incorrect code.' })
    }

    // Atomically consume the OTP and stamp the JTI in one query.
    // Combining these prevents a window where used=1 is set but the JTI write
    // fails, which would burn the code without ever issuing a token.
    const claimJti = crypto.randomBytes(16).toString('hex')
    const [finalConsume] = await pool.query(
      'UPDATE login_otps SET used = 1, claim_jti = ? WHERE id = ? AND used = 0',
      [claimJti, row.id]
    )
    if (finalConsume.affectedRows === 0) {
      console.debug(`[OTP-DEBUG] verify-login-otp USED | id=${row.id} | email=${normalizedEmail}`)
      return res.status(400).json({ error: 'Code has already been used.' })
    }

    // emailClaimToken: signed JWT, 5-min TTL, single-use via claim_jti
    const emailClaimToken = signTokenWith(
      { purpose: 'email-claim', email: normalizedEmail, jti: claimJti },
      '5m'
    )

    console.debug(`[OTP-DEBUG] verify-login-otp SUCCESS | id=${row.id} | email=${normalizedEmail}`)
    writeAuditLog({
      action:          ACTION_TYPES.LOGIN_OTP_VERIFIED,
      email:           normalizedEmail,
      deviceSessionId: deviceSessionId || null,
      metadata:        { ip: req.ip },
    })

    return res.json({ ok: true, emailClaimToken })
  } catch (err) {
    console.error('[auth] POST verify-login-otp:', err.message)
    return res.status(500).json({ error: 'Verification failed. Try again.' })
  }
})

// ── POST /api/auth/verify  (internal — lowercase roles) ───────
// Body: { pin, name?, email?, emailClaimToken?, deviceSessionId? }
//
// emailVerified is ONLY set to true when a valid, unexpired, single-use
// emailClaimToken is provided.  The frontend can never self-assert it.
router.post('/verify', pinLimiter, requireBriyaEmail, async (req, res) => {
  const {
    pin,
    name            = '',
    email           = '',
    emailClaimToken = null,
    deviceSessionId = '',
  } = req.body

  // Cap lengths before storing in JWT / DB — columns are VARCHAR(128)
  const normalizedDeviceId = typeof deviceSessionId === 'string' ? deviceSessionId.trim().slice(0, 128) : ''

  if (!pin) return res.status(400).json({ role: null })

  let role = null
  if (pin === process.env.PIN_SUPER_ADMIN) role = 'superadmin'
  if (pin === process.env.PIN_ADMIN)       role = 'admin'
  if (pin === process.env.PIN_STANDARD)    role = 'standard'

  if (!role) {
    writeAuditLog({
      action:          ACTION_TYPES.LOGIN_FAILED,
      email:           typeof email === 'string' ? email.trim().toLowerCase() : null,
      deviceSessionId: normalizedDeviceId || null,
      metadata:        { reason: 'INVALID_PIN', ip: req.ip },
    })
    return res.json({ success: false, error: 'Invalid PIN', role: null })
  }

  // Resolve email — normalize regardless of source
  let resolvedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''

  // ── emailClaimToken: single-use enforcement ───────────────────
  // Token must be: valid JWT signed by us + purpose='email-claim' + jti present
  // + jti not yet consumed in login_otps.  All conditions must hold.
  let emailVerified       = false
  let claimTokenFailed    = false   // true when a token was presented but rejected

  if (emailClaimToken) {
    try {
      const claim = verifyToken(emailClaimToken)
      if (claim.purpose === 'email-claim' && claim.email && claim.jti) {
        // Single-use check: atomically consume the token to prevent race conditions
        const [updateRes] = await pool.query(
          'UPDATE login_otps SET claim_token_used = 1 WHERE claim_jti = ? AND claim_token_used = 0',
          [claim.jti]
        )
        if (updateRes.affectedRows > 0) {
          emailVerified = true
          resolvedEmail = claim.email.trim().toLowerCase()

          // Register this device as trusted for TRUSTED_DEVICE_DAYS.
          // Uses UPSERT — repeat OTP logins extend the window automatically.
          upsertTrustedDevice(resolvedEmail, normalizedDeviceId, req)
        } else {
          // Token already used or JTI not found (replay attack)
          claimTokenFailed = true
          console.warn(`[auth] emailClaimToken replay rejected — jti=${claim.jti}`)
        }
      }
    } catch (err) {
      // Token expired or tampered
      claimTokenFailed = true
      const reason = err?.name === 'TokenExpiredError' ? 'EXPIRED' : 'INVALID'
      console.warn(`[auth] emailClaimToken rejected: ${reason}`)
    }

    if (claimTokenFailed) {
      writeAuditLog({
        action:          ACTION_TYPES.LOGIN_FAILED,
        email:           resolvedEmail || null,
        deviceSessionId: normalizedDeviceId || null,
        metadata:        { reason: 'CLAIM_TOKEN_REJECTED', ip: req.ip },
      })
      // emailVerified stays false — login still succeeds but without verified email
    }
  }

  // ── Trusted device fallback ───────────────────────────────────
  // When no emailClaimToken was provided (trusted device skipped OTP),
  // verify server-side that this device is still trusted.
  // The client cannot forge this — it requires email + deviceSessionId to
  // match a DB row that was written by a previous OTP-verified login.
  if (!emailVerified && !emailClaimToken && resolvedEmail && normalizedDeviceId) {
    const { trusted, reason, ipWarning } = await isTrustedDevice(resolvedEmail, normalizedDeviceId, req)
    if (trusted) {
      emailVerified = true
      if (ipWarning) {
        console.warn(`[auth] Trusted device IP mismatch (soft) for ${resolvedEmail} — logging anomaly`)
        // Log stolen session reuse anomalies distinctly
        writeAuditLog({
          action:          'TRUSTED_DEVICE_ANOMALY',
          email:           resolvedEmail,
          deviceSessionId: normalizedDeviceId,
          metadata:        { ip: req.ip, reason: 'IP_MISMATCH', warning: 'Potential session theft via IP change' },
        })
      }
      // Refresh the 90-day window on every trusted login; update stored UA + IP
      upsertTrustedDevice(resolvedEmail, normalizedDeviceId, req)
      writeAuditLog({
        action:          ACTION_TYPES.TRUSTED_DEVICE_USED,
        email:           resolvedEmail,
        deviceSessionId: normalizedDeviceId,
        metadata:        { ip: req.ip, ipWarning: ipWarning || false },
      })
    } else {
      writeAuditLog({
        action:          ACTION_TYPES.TRUSTED_DEVICE_REJECTED,
        email:           resolvedEmail,
        deviceSessionId: normalizedDeviceId,
        metadata:        { reason, ip: req.ip },
      })
    }
  }

  const payload = {
    role,
    name:            String(name).trim().slice(0, 100),
    email:           resolvedEmail,
    emailVerified,
    deviceSessionId: normalizedDeviceId,
  }
  const token = signToken(payload)

  writeAuditLog({
    action:          ACTION_TYPES.LOGIN,
    email:           resolvedEmail || null,
    deviceSessionId: normalizedDeviceId || null,
    metadata: {
      email:           resolvedEmail || null,
      emailVerified,
      deviceSessionId: normalizedDeviceId || null,
      ip:              req.ip,
      success:         true,
      role,
    },
  })

  return res.json({
    success:       true,
    role,
    name:          payload.name,
    email:         payload.email,
    emailVerified: payload.emailVerified,
    token,
  })
})

// ── GET /api/auth/session ─────────────────────────────────────
// Lightweight session-validity probe used by other devices to detect
// logout-all revocations.  authMiddleware already queries last_logout_at;
// if the token is revoked it sets req.user = null and requireAuth returns 401.
// The frontend polls this every 30 s for email-verified sessions so that
// "Sign out all devices" is reflected within one polling cycle.
router.get('/session', authMiddleware, requireAuth, (_req, res) => {
  res.json({ ok: true })
})

// ── GET /api/auth/trusted-devices/count ──────────────────────
// Returns { count: number } — the number of active (non-expired) trusted
// devices registered to the authenticated user's email.
// The frontend uses this to decide whether "Sign out all devices" is
// meaningful: count > 1 means other trusted devices exist besides this one.
// Falls back to { count: 0 } on any DB error so the button is safely hidden
// rather than shown by mistake.
router.get('/trusted-devices/count', authMiddleware, requireAuth, async (req, res) => {
  const email = req.user?.email
  if (!email) return res.json({ count: 0 })
  try {
    const [[{ count }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM trusted_devices WHERE email = ? AND expires_at > NOW()',
      [email]
    )
    return res.json({ count: Number(count) })
  } catch (err) {
    console.error('[auth] GET trusted-devices/count:', err.message)
    return res.json({ count: 0 })
  }
})

// ── POST /api/auth/logout-all ─────────────────────────────────
// Stamps last_logout_at = NOW() for the authenticated user's email.
// Any token issued before this moment will be rejected by authMiddleware.
// Requires an email-verified session — PIN-only sessions carry no email and
// cannot be revoked this way.
router.post('/logout-all', authMiddleware, requireAuth, async (req, res) => {
  const email = req.user?.email
  if (!email) {
    return res.status(400).json({ error: 'Session revocation requires an email-verified login.' })
  }
  try {
    await pool.query(
      `INSERT INTO users (email, last_logout_at) VALUES (?, NOW())
       ON DUPLICATE KEY UPDATE last_logout_at = NOW()`,
      [email]
    )
    
    // Protection against stolen session reuse: explicitly clear trusted devices on global logout
    await pool.query('DELETE FROM trusted_devices WHERE email = ?', [email])

    writeAuditLog({
      action:          ACTION_TYPES.LOGOUT_ALL,
      email,
      deviceSessionId: req.user.deviceSessionId || null,
      metadata:        { ip: req.ip },
    })
    return res.json({ ok: true })
  } catch (err) {
    console.error('[auth] POST logout-all:', err.message)
    return res.status(500).json({ error: 'Failed to revoke sessions. Try again.' })
  }
})

// ── POST /api/pin/pin-verify  (public-facing — uppercase roles) ──
// Body: { pin: string }
// Returns: { success: true, role: "ADMIN" | "STANDARD" } | { success: false }
router.post('/pin-verify', pinLimiter, (req, res) => {
  const { pin } = req.body
  if (!pin) return res.status(400).json({ success: false })

  if (pin === process.env.PIN_SUPER_ADMIN) return res.json({ success: true, role: 'SUPERADMIN' })
  if (pin === process.env.PIN_ADMIN)       return res.json({ success: true, role: 'ADMIN' })
  if (pin === process.env.PIN_STANDARD)    return res.json({ success: true, role: 'STANDARD' })

  return res.json({ success: false })
})

export default router
