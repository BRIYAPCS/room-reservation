/**
 * requireSuperAdmin
 *
 * Allows request only if the JWT-verified req.user has role SUPERADMIN.
 * Must be used AFTER authMiddleware so req.user is populated from the token.
 */
export function requireSuperAdmin(req, res, next) {
  const role = (req.user?.role || '').toUpperCase()
  if (role !== 'SUPERADMIN') {
    return res.status(403).json({ error: 'Super-admin access required' })
  }
  next()
}
