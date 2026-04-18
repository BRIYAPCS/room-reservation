import { verifyToken } from '../utils/jwt.js'
import pool from '../config/db.js'

/**
 * authMiddleware
 *
 * Reads the Authorization header and tries to verify a Bearer token.
 * On success, sets req.user = { role, name, email, emailVerified, deviceSessionId }.
 * If the header is missing or the token is invalid/revoked, sets req.user = null.
 *
 * Does NOT reject the request — routes that require auth must use requireAuth.
 *
 * Revocation check: when the token carries an email, the DB is queried to see
 * whether the token was issued before the user's last logout-all.  The check
 * fails open on DB error so a DB outage never blocks existing sessions.
 */
export async function authMiddleware(req, _res, next) {
  const authHeader = req.headers['authorization'] || ''

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    try {
      const payload = verifyToken(token)
      req.user = {
        role:            payload.role,
        name:            payload.name            || '',
        // Normalize on read — tokens issued before normalization may have mixed case
        email:           (payload.email || '').trim().toLowerCase(),
        emailVerified:   payload.emailVerified   === true,
        deviceSessionId: payload.deviceSessionId || '',
      }

      // Session revocation: reject tokens issued before the user's last logout-all.
      // payload.iat is Unix seconds (set automatically by jsonwebtoken).
      // Only applies when the token carries an email — PIN-only sessions cannot be
      // revoked this way and are intentionally excluded.
      if (req.user.email && payload.iat) {
        try {
          const [[revoked]] = await pool.query(
            `SELECT 1 FROM users
             WHERE email = ? AND last_logout_at > FROM_UNIXTIME(?)
             LIMIT 1`,
            [req.user.email, payload.iat]
          )
          if (revoked) {
            console.warn(`[auth] Token revoked — issued before last_logout_at for ${req.user.email}`)
            req.user = null
          }
        } catch {
          // DB failure: fail closed to prevent revoked tokens from succeeding during outages
          console.error(`[auth] DB failure during revocation check for ${req.user.email} — failing closed`)
          req.user = null
        }
      }
    } catch (err) {
      // Token present but expired or tampered — reject silently; requireAuth returns 401
      const reason = err?.name === 'TokenExpiredError' ? 'expired' : 'invalid'
      console.warn(`[auth] Session token ${reason} — clearing user`)
      req.user = null
    }
    return next()
  }

  req.user = null
  next()
}

/**
 * requireAuth
 *
 * Use after authMiddleware on any route that needs a logged-in user.
 * Returns 401 if req.user was not set.
 */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  next()
}
