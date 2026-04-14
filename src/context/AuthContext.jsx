import { createContext, useContext, useState } from 'react'
import { verifyPin as apiVerifyPin } from '../services/api'

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
    const raw = sessionStorage.getItem(SESSION_KEY)
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
   * @param {{ email?: string, emailVerified?: boolean }} [opts]
   */
  async function login(pin, name, { email = '', emailVerified = false } = {}) {
    let role, token
    try {
      const res = await apiVerifyPin(pin, name.trim())
      role  = res.role  || null
      token = res.token || null
    } catch {
      return false
    }
    if (!role) return false

    const newAuth = {
      role,
      name:          name.trim(),
      email:         email.trim(),
      emailVerified,
      deviceSessionId: getOrCreateDeviceSessionId(),
    }
    setAuth(newAuth)
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(newAuth))
    if (token) sessionStorage.setItem('authToken', token)
    if (name.trim()) saveDeviceName(role, name.trim())
    return true
  }

  function logout() {
    sessionStorage.clear()
    window.location.reload()
  }

  // ADMIN and SUPERADMIN can delete — STANDARD cannot, regardless of ownership
  function canDelete() {
    return auth.role === 'admin' || auth.role === 'superadmin'
  }

  return (
    <AuthContext.Provider value={{ auth, login, logout, validatePin, canDelete }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
