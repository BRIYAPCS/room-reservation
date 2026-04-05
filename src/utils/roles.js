/**
 * Returns true for any role with admin-level calendar privileges.
 * Both 'admin' and 'superadmin' can create, edit, and delete bookings.
 * Only 'superadmin' can reorder sites/rooms (checked separately).
 */
export const isAdmin      = role => role === 'admin' || role === 'superadmin'
export const isSuperAdmin = role => role === 'superadmin'
