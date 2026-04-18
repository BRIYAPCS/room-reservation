import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { verifyPin as apiVerifyPin, logoutAllSessions } from '../services/api'
import ForcedLogoutBanner from '../components/ForcedLogoutBanner'

const AuthContext = createContext(null)

const SESSION_KEY = 'room_reservation_auth'
const DEVICE_SESSION_KEY = 'briya_device_session_id'

// Separate device-memory keys per role so admin and standard don't overwrite each other
const DEVICE_KEYS = {
  standard:   'briya_standard_name',
  admin:      'briya_admin_name',
  superadmin: 'briya_superadmin_name',
}
// Cookie names mirror the localStorage keys
const COOKIE_KEYS = {
  standard:   'briya_std_name',
  admin:      'briya_adm_name',
  superadmin: 'briya_sadm_name',
}
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60 // 1 year in seconds

// ── Cookie helpers ────────────────────────────────────────────
function setCookie(name, value) {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Strict`
  } catch (_) {}
}

function getCookie(name) {
  try {
    const match = document.cookie.split('; ').find(row => row.startsWith(name + '='))
    return match ? decodeURIComponent(match.split('=')[1]) : ''
  } catch (_) { return '' }
}

// ── Device session ID — persists in localStorage across tabs/sessions ────────
function getOrCreateDeviceSessionId() {
  try {
    const existing = localStorage.getItem(DEVICE_SESSION_KEY)
    if (existing) return existing
    const id = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(DEVICE_SESSION_KEY, id)
    return id
  } catch (_) {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

function loadFromSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        role:          parsed.role          || 'none',
        name:          parsed.name          || '',
        email:         parsed.email         || '',
        emailVerified: parsed.emailVerified ?? false,
        deviceSessionId: parsed.deviceSessionId || getOrCreateDeviceSessionId(),
      }
    }
  } catch (_) {}
  return {
    role: 'none',
    name: '',
    email: '',
    emailVerified: false,
    deviceSessionId: getOrCreateDeviceSessionId(),
  }
}

/**
 * Returns the name last used on this device for the given role.
 * Tries localStorage first, then falls back to a long-lived cookie.
 * Writing always updates both so they stay in sync.
 */
export function getDeviceName(role) {
  const lsKey = DEVICE_KEYS[role]
  const ckKey = COOKIE_KEYS[role]
  if (!lsKey) return ''
  try {
    const fromLS = localStorage.getItem(lsKey) || ''
    if (fromLS) return fromLS
  } catch (_) {}
  return getCookie(ckKey)
}

function saveDeviceName(role, name) {
  const lsKey = DEVICE_KEYS[role]
  const ckKey = COOKIE_KEYS[role]
  if (!lsKey || !name) return
  try { localStorage.setItem(lsKey, name) } catch (_) {}
  setCookie(ckKey, name)
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(loadFromSession)
  const [forcedLogoutName, setForcedLogoutName] = useState('')
  const forcedLogoutTimerRef = useRef(null)
  const authRef = useRef(auth)
  authRef.current = auth

  // PIN is verified server-side — never exposed in the frontend bundle
  async function validatePin(pin) {
    try {
      const { role } = await apiVerifyPin(pin)
      return role || null
    } catch {
      return null
    }
  }

  /**
   * @param {string} pin
   * @param {string} name
   * @param {{ email?: string, emailClaimToken?: string|null }} [opts]
   *
   * emailVerified is determined server-side by verifying emailClaimToken.
   * The frontend never self-asserts emailVerified = true.
   */
  async function login(pin, name, { email = '', emailClaimToken = null } = {}) {
    let role, token, serverEmailVerified, serverEmail
    try {
      const deviceSessionId = getOrCreateDeviceSessionId()
      const res = await apiVerifyPin(pin, name.trim(), {
        email:           email.trim().toLowerCase(),
        emailClaimToken,
        deviceSessionId,
      })
      role                = res.role          || null
      token               = res.token         || null
      serverEmailVerified = res.emailVerified  ?? false
      serverEmail         = res.email         || email.trim().toLowerCase()
    } catch {
      return false
    }
    if (!role) return false

    const newAuth = {
      role,
      name:            name.trim(),
      email:           serverEmail,
      emailVerified:   serverEmailVerified,
      deviceSessionId: getOrCreateDeviceSessionId(),
    }
    setAuth(newAuth)
    localStorage.setItem(SESSION_KEY, JSON.stringify(newAuth))
    if (token) localStorage.setItem('authToken', token)
    if (name.trim()) saveDeviceName(role, name.trim())
    return true
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem('authToken')
    setAuth({
      role: 'none',
      name: '',
      email: '',
      emailVerified: false,
      deviceSessionId: getOrCreateDeviceSessionId(),
    })
  }

  /**
   * Signs out of ALL devices simultaneously.
   * Calls /auth/logout-all to stamp last_logout_at and delete all trusted
   * devices on the server, then clears the local session.
   * Never throws — if the API call fails the local session is still cleared.
   */
  async function logoutAll() {
    try { await logoutAllSessions() } catch (_) {}
    logout()
  }

  // Use a ref so the event listener always calls the current logout without
  // needing to re-register on every render.
  const logoutRef = useRef(logout)
  logoutRef.current = logout

  // Listen for the custom event fired by api.js when a 401 is received.
  // This replaces the old window.location.href = '/' hard-redirect.
  useEffect(() => {
    function handleAuthExpired() { logoutRef.current() }
    window.addEventListener('briya:auth:expired', handleAuthExpired)
    return () => window.removeEventListener('briya:auth:expired', handleAuthExpired)
  }, [])

  // Session-revocation poll — only for email-verified sessions, which are the
  // only ones that can be invalidated by logout-all.  Polls GET /auth/session
  // every 30 s; a 401 means another device called logout-all, so we show the
  // ForcedLogoutBanner before clearing the session.
  const SESSION_POLL_MS = 30_000
  const BASE = import.meta.env.VITE_API_BASE || '/api'
  useEffect(() => {
    if (!auth.emailVerified || !auth.email) return
    const id = setInterval(async () => {
      try {
        const token = localStorage.getItem('authToken') || ''
        if (!token) return
        const res = await fetch(`${BASE}/auth/session`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })
        if (res.status === 401) {
          // Capture name before clearing state
          const nameBeforeLogout = authRef.current.name || ''
          localStorage.removeItem('authToken')
          localStorage.removeItem(SESSION_KEY)
          setAuth({
            role: 'none',
            name: '',
            email: '',
            emailVerified: false,
            deviceSessionId: getOrCreateDeviceSessionId(),
          })
          // Show the banner with a 6-second auto-dismiss
          setForcedLogoutName(nameBeforeLogout)
          if (forcedLogoutTimerRef.current) clearTimeout(forcedLogoutTimerRef.current)
          forcedLogoutTimerRef.current = setTimeout(() => setForcedLogoutName(''), 6000)
        }
      } catch (_) {}
    }, SESSION_POLL_MS)
    return () => clearInterval(id)
  }, [auth.emailVerified, auth.email])

  // ADMIN and SUPERADMIN can delete — STANDARD cannot, regardless of ownership
  function canDelete() {
    return auth.role === 'admin' || auth.role === 'superadmin'
  }

  return (
    <AuthContext.Provider value={{ auth, login, logout, logoutAll, validatePin, canDelete }}>
      {children}
      {forcedLogoutName !== '' && (
        <ForcedLogoutBanner
          name={forcedLogoutName}
          onDismiss={() => {
            if (forcedLogoutTimerRef.current) clearTimeout(forcedLogoutTimerRef.current)
            setForcedLogoutName('')
          }}
        />
      )}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
