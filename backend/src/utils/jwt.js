import jwt from 'jsonwebtoken'

// Session tokens live for 24 h.  Short-lived tokens (OTP edit, email claim)
// use signTokenWith() with their own expiry.
const SESSION_EXPIRY    = '24h'
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000

function getSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not set in environment variables')
  return secret
}

/**
 * Signs a session JWT.
 * Adds explicit issuedAt / expiresAt ISO strings alongside the standard
 * iat / exp numeric claims so consumers can read them without decoding.
 */
export function signToken(payload) {
  const now       = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_EXPIRY_MS)
  return jwt.sign(
    { ...payload, issuedAt: now.toISOString(), expiresAt: expiresAt.toISOString() },
    getSecret(),
    { expiresIn: SESSION_EXPIRY }
  )
}

/** Signs a token with a custom expiry — used for short-lived OTP / claim tokens. */
export function signTokenWith(payload, expiresIn) {
  return jwt.sign(payload, getSecret(), { expiresIn })
}

export function verifyToken(token) {
  return jwt.verify(token, getSecret())
}
