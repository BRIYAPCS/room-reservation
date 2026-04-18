/**
 * requireAdmin
 *
 * Allows request only if the JWT-verified req.user has role ADMIN.
 * Must be used AFTER authMiddleware so req.user is populated from the token.
 * Never trusts client-sent headers for authorization — roles come from the JWT payload.
 */
export function requireAdmin(req, res, next) {
  const role = (req.user?.role || '').toUpperCase()
  if (role !== 'ADMIN' && role !== 'SUPERADMIN') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}
