const BASE = import.meta.env.VITE_API_BASE || '/api'

const SESSION_KEY = 'room_reservation_auth'

function getStoredToken() {
  try { return localStorage.getItem('authToken') || '' } catch { return '' }
}

async function request(path, options = {}) {
  const token = getStoredToken()
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      // Legacy headers removed after JWT migration
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  if (res.status === 401 && token) {
    // Token was present but rejected (expired / invalid) — clear stored auth and
    // signal the React auth context to reset state without a hard page reload.
    localStorage.removeItem('authToken')
    localStorage.removeItem(SESSION_KEY)
    window.dispatchEvent(new CustomEvent('briya:auth:expired'))
    return
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `API error ${res.status}`)
  }
  return res.json()
}

export const getHealth  = ()           => request('/health')
export const getConfig    = ()     => request('/config')
export const updateConfig = (data) => request('/config', { method: 'PUT', body: JSON.stringify(data) })
export const getWeather = (lat, lon)   => request(lat && lon ? `/weather?lat=${lat}&lon=${lon}` : '/weather')
export const getVisitors       = ()           => request('/visitors')
export const heartbeatVisitor  = (sessionId)  => request('/visitors/heartbeat', {
  method: 'POST',
  body: JSON.stringify({ sessionId }),
})

// Sites
export const getSites = () =>
  request('/sites')

export const getSite = (siteId) =>
  request(`/sites/${siteId}`)

export const reorderSites = (items) =>
  request('/sites/reorder', { method: 'PUT', body: JSON.stringify(items) })

export const createSite = (data) =>
  request('/sites', { method: 'POST', body: JSON.stringify(data) })

export const updateSite = (siteId, data) =>
  request(`/sites/${siteId}`, { method: 'PUT', body: JSON.stringify(data) })

export const deleteSite = (siteId) =>
  request(`/sites/${siteId}`, { method: 'DELETE' })

export const reorderRooms = (siteCode, items) =>
  request(`/rooms/reorder/${siteCode}`, { method: 'PUT', body: JSON.stringify(items) })

export const createRoom = (siteCode, data) =>
  request(`/rooms/${siteCode}`, { method: 'POST', body: JSON.stringify(data) })

export const updateRoom = (siteCode, roomId, data) =>
  request(`/rooms/${siteCode}/${roomId}`, { method: 'PUT', body: JSON.stringify(data) })

export const deleteRoom = (siteCode, roomId) =>
  request(`/rooms/${siteCode}/${roomId}`, { method: 'DELETE' })

// Rooms
export const getRooms = async (siteSlug) => {
  try {
    return await request(`/rooms/${siteSlug}`)
  } catch (err) {
    console.error('[api] getRooms:', err.message)
    return []
  }
}

export const getRoom = (siteId, roomId) =>
  request(`/sites/${siteId}/rooms/${roomId}`)

// Events (internal key)
export const getEvents = (siteId, roomId) =>
  request(`/events/${siteId}/${roomId}`)

// Reservations (public-facing alias → /api/reservations/:siteSlug/:roomId)
export const getReservations = async (siteSlug, roomId) => {
  try {
    return await request(`/reservations/${siteSlug}/${roomId}`)
  } catch (err) {
    console.error('[api] getReservations:', err.message)
    return []
  }
}

export const addEvents = (siteId, roomId, events) =>
  request(`/events/${siteId}/${roomId}`, {
    method: 'POST',
    body: JSON.stringify(events),
  })

export const updateEvent = (siteId, roomId, event, editToken = null) =>
  request(`/events/${siteId}/${roomId}/${event.id}`, {
    method: 'PUT',
    body: JSON.stringify(event),
    headers: editToken ? { 'X-Edit-Token': editToken } : {},
  })

// Cross-device OTP — request a code sent to the booking's owner email
export const requestEditOtp = (siteId, roomId, eventId, email) =>
  request(`/events/${siteId}/${roomId}/${eventId}/request-otp`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  })

// Cross-device OTP — verify the code; returns { ok, editToken } on success
export const verifyEditOtp = (siteId, roomId, eventId, email, otp) =>
  request(`/events/${siteId}/${roomId}/${eventId}/verify-otp`, {
    method: 'POST',
    body: JSON.stringify({ email, otp }),
  })

export const deleteEvent = (siteId, roomId, eventId, editToken = null) =>
  request(`/events/${siteId}/${roomId}/${eventId}`, {
    method: 'DELETE',
    headers: editToken ? { 'X-Edit-Token': editToken } : {},
  })

// Attachments
export const getAttachments = (reservationId) =>
  request(`/attachments/${reservationId}`)

export async function uploadAttachment(reservationId, file) {
  const formData = new FormData()
  formData.append('file', file)
  const token = getStoredToken()
  const res = await fetch(`${BASE}/attachments/${reservationId}`, {
    method: 'POST',
    headers: {
      // Legacy headers removed after JWT migration
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Upload error ${res.status}`)
  }
  return res.json()
}

// Recurrence group operations
export const deleteRecurrenceGroup = (siteId, roomId, groupId, scope, fromIndex) => {
  const params = new URLSearchParams({ scope })
  if (fromIndex != null) params.set('fromIndex', fromIndex)
  return request(`/events/${siteId}/${roomId}/group/${groupId}?${params}`, { method: 'DELETE' })
}

export const updateRecurrenceGroup = (siteId, roomId, groupId, scope, fromIndex, event) => {
  const params = new URLSearchParams({ scope })
  if (fromIndex != null) params.set('fromIndex', fromIndex)
  return request(`/events/${siteId}/${roomId}/group/${groupId}?${params}`, {
    method: 'PUT',
    body: JSON.stringify(event),
  })
}

export const deleteAttachment = (id) =>
  request(`/attachments/${id}`, { method: 'DELETE' })

export const getAttachmentUrl = (id) => `${BASE}/attachments/file/${id}`

// Revokes all sessions for the authenticated user (sets last_logout_at,
// deletes all trusted devices). Requires a valid Bearer token.
export const logoutAllSessions = () =>
  request('/auth/logout-all', { method: 'POST' })

// Lightweight session-validity probe — returns 200 { ok: true } when the
// token is still valid, 401 when it has been revoked (e.g. after logout-all).
// Used by AuthContext to detect cross-device sign-outs within ~30 s.
export const checkSession = () =>
  request('/auth/session')

// Used by AuthContext (returns lowercase role)
// opts: { email?, emailVerified?, deviceSessionId? } — included in JWT payload by server
export const verifyPin = (pin, name = '', opts = {}) =>
  request('/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ pin, name, ...opts }),
  })

// Public-facing: returns { success, role: "ADMIN"|"STANDARD" }
export const verifyPinPublic = (pin) =>
  request('/pin/pin-verify', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  })

// Validate a @briya.org email via Power Automate webhook (server-side call)
// Returns { valid: boolean, name: string } — never throws
export const validateEmail = (email) =>
  request('/auth/validate-email', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })

// Trusted device probe — not rate-limited, returns { trusted: boolean }
// Call this before requestLoginOtp so trusted devices never hit the OTP rate limit.
export const checkTrustedDevice = (email, deviceSessionId) =>
  request('/auth/check-trusted', {
    method: 'POST',
    body: JSON.stringify({ email, deviceSessionId }),
  })

// Login OTP — step 1: send 6-digit code to the given @briya.org email
// Returns { ok, maskedEmail, name }
export const requestLoginOtp = (email, deviceSessionId) =>
  request('/auth/request-login-otp', {
    method: 'POST',
    body: JSON.stringify({ email, deviceSessionId }),
  })

// Login OTP — step 2: verify the code; returns { ok, emailClaimToken } on success
export const verifyLoginOtp = (email, otp, deviceSessionId) =>
  request('/auth/verify-login-otp', {
    method: 'POST',
    body: JSON.stringify({ email, otp, deviceSessionId }),
  })

// Legacy booking claim — sends OTP to the provided email (booking must be unclaimed)
export const claimRequestOtp = (siteId, roomId, eventId, email) =>
  request(`/events/${siteId}/${roomId}/${eventId}/claim-request-otp`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  })

// Legacy booking claim — verifies OTP and assigns ownership_type='email' to the booking
export const claimVerifyOtp = (siteId, roomId, eventId, email, otp) =>
  request(`/events/${siteId}/${roomId}/${eventId}/claim-verify-otp`, {
    method: 'POST',
    body: JSON.stringify({ email, otp }),
  })
