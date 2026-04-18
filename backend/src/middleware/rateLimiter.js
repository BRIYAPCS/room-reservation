import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { writeAuditLog, ACTION_TYPES } from '../services/auditLog.js'

// PIN login — strict: 5 attempts per minute
export const pinLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, try again later' },
})

// Event creation — prevents booking spam: 60 requests per minute per IP
export const eventWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down' },
})

/**
 * Shared handler for OTP rate limit hits.
 * @param {string} limitLabel  - e.g. 'OTP_REQUEST_IP', 'OTP_REQUEST_EMAIL', 'OTP_VERIFY_IP'
 */
function makeOtpRateLimitHandler(limitLabel) {
  return (req, res) => {
    const email         = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : null
    const deviceSession = typeof req.body?.deviceSessionId === 'string' ? req.body.deviceSessionId : null
    writeAuditLog({
      action:          ACTION_TYPES.OTP_RATE_LIMIT_HIT,
      email,
      deviceSessionId: deviceSession,
      metadata:        { limit: limitLabel, ip: req.ip },
    })
    // req.rateLimit.resetTime is a Date provided by express-rate-limit when standardHeaders is true
    const resetTime = req.rateLimit?.resetTime
    const retryAfterSeconds = resetTime instanceof Date
      ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
      : null
    res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED', retryAfterSeconds })
  }
}

// OTP request — 3 failed/unanswered sends per 10 minutes per IP
// skipSuccessfulRequests: true — successful email sends (2xx) don't count against the limit,
// so only bounced, invalid, or rejected requests consume a slot.
export const otpRequestLimiter = rateLimit({
  windowMs:               10 * 60 * 1000,
  max:                    3,
  standardHeaders:        true,
  legacyHeaders:          false,
  skipSuccessfulRequests: true,
  handler:                makeOtpRateLimitHandler('OTP_REQUEST_IP'),
})

// OTP request — 5 failed/unanswered sends per hour per email address
// Falls back to IP when email is absent to prevent bypass by omitting the field.
// skipSuccessfulRequests: true — successful sends don't penalise the user.
export const otpRequestEmailLimiter = rateLimit({
  windowMs:               60 * 60 * 1000,
  max:                    5,
  standardHeaders:        true,
  legacyHeaders:          false,
  skipSuccessfulRequests: true,
  keyGenerator:           (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
    return email || ipKeyGenerator(req)
  },
  handler:                makeOtpRateLimitHandler('OTP_REQUEST_EMAIL'),
})

/**
 * requireBriyaEmail
 *
 * Validates that req.body.email, when present, is a normalised @briya.org address.
 * Passes through silently when email is absent or blank (routes handle missing-field
 * errors themselves).  Always normalises before checking — never trusts raw input.
 *
 * Rejects with 400 { error: 'INVALID_EMAIL_DOMAIN' } and writes an audit event on
 * any non-empty email that fails the domain test.
 */
export function requireBriyaEmail(req, res, next) {
  const raw = req.body?.email
  if (!raw || typeof raw !== 'string' || !raw.trim()) return next()
  const normalized = raw.trim().toLowerCase()
  if (!normalized.endsWith('@briya.org')) {
    writeAuditLog({
      action:   ACTION_TYPES.INVALID_EMAIL_ATTEMPT,
      email:    normalized,
      metadata: { ip: req.ip },
    })
    return res.status(400).json({ error: 'INVALID_EMAIL_DOMAIN' })
  }
  next()
}

// OTP verification — 10 failed attempts per 10 minutes per IP
// skipSuccessfulRequests: true — correct codes (2xx) don't consume a slot, so only
// wrong guesses count toward the brute-force limit.
// DB-level attempt counting (max 5 per code) provides the per-code guard.
export const otpVerifyLimiter = rateLimit({
  windowMs:               10 * 60 * 1000,
  max:                    10,
  standardHeaders:        true,
  legacyHeaders:          false,
  skipSuccessfulRequests: true,
  handler:                makeOtpRateLimitHandler('OTP_VERIFY_IP'),
})
