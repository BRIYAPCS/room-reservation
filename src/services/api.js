const BASE = import.meta.env.VITE_API_BASE || '/api'

function getStoredToken() {
  try { return sessionStorage.getItem('authToken') || '' } catch { return '' }
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
    // Token was present but rejected (expired / invalid) — clear session and go home
    sessionStorage.clear()
    window.location.href = '/'
    return
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `API error ${res.status}`)
  }
  return res.json()
}

export const getHealth  = ()           => request('/health')
export const getConfig  = ()           => request('/config')
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

export const updateEvent = (siteId, roomId, event) =>
  request(`/events/${siteId}/${roomId}/${event.id}`, {
    method: 'PUT',
    body: JSON.stringify(event),
  })

export const deleteEvent = (siteId, roomId, eventId) =>
  request(`/events/${siteId}/${roomId}/${eventId}`, {
    method: 'DELETE',
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

// Used by AuthContext (returns lowercase role)
export const verifyPin = (pin, name = '') =>
  request('/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ pin, name }),
  })

// Public-facing: returns { success, role: "ADMIN"|"STANDARD" }
export const verifyPinPublic = (pin) =>
  request('/pin/pin-verify', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  })
