import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { getDeviceName } from '../context/AuthContext'
import './LoginModal.css'

// SVG icons
function LockIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="#1186c4" strokeWidth="2" fill="none" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="#1186c4" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16" r="1.5" fill="#1186c4" />
    </svg>
  )
}

function PersonIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="8" r="4" stroke="#1186c4" strokeWidth="2" fill="none" />
      <path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8" stroke="#1186c4" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export default function LoginModal({ onClose, onDismiss, required = false }) {
  const { auth, login, logout, validatePin } = useAuth()

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Determine initial step
  const getInitialStep = () => {
    if (auth.role !== 'none') return 'status'
    return 'pin'
  }

  const [step, setStep] = useState(getInitialStep)
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [pinTypeWarning, setPinTypeWarning] = useState('')
  const [pendingRole, setPendingRole] = useState(null) // 'admin' | 'standard'
  const [name, setName] = useState('')
  const [nameFromDevice, setNameFromDevice] = useState(false)
  const [pinError, setPinError] = useState('')
  const [nameError, setNameError] = useState('')
  const [pinLoading, setPinLoading] = useState(false)

  function handlePinChange(e) {
    const raw = e.target.value
    const digitsOnly = raw.replace(/\D/g, '')
    if (raw !== digitsOnly) {
      setPinTypeWarning('PIN must contain numbers only.')
    } else {
      setPinTypeWarning('')
    }
    setPin(digitsOnly)
    setPinError('')
  }

  async function handlePinSubmit(e) {
    e.preventDefault()
    setPinLoading(true)
    const role = await validatePin(pin)
    setPinLoading(false)
    if (!role) {
      setPinError('Incorrect PIN. Please try again.')
      return
    }
    // Both admin and standard go through the name step
    setPendingRole(role)
    const saved = getDeviceName(role)
    if (saved) {
      setName(saved)
      setNameFromDevice(true)
    } else {
      setName('')
      setNameFromDevice(false)
    }
    setStep('name')
  }

  async function handleNameSubmit(e) {
    e.preventDefault()
    if (!name.trim()) {
      setNameError('Name is required.')
      return
    }
    setPinLoading(true)
    await login(pin, name.trim())
    setPinLoading(false)
    onClose()
  }

  function handleSwitchAccount() {
    logout()
    setPin('')
    setPendingRole(null)
    setName('')
    setNameFromDevice(false)
    setPinError('')
    setNameError('')
    setStep('pin')
  }

  function handleSignOut() {
    logout()
    if (required) {
      setPin('')
      setName('')
      setPinError('')
      setNameError('')
      setStep('pin')
    } else {
      onDismiss()
    }
  }

  const overlayMouseTarget = useRef(null)
  const overlayRef = useRef(null)
  const pinInputRef = useRef(null)

  // Auto-focus PIN input on mobile to open keyboard immediately
  useEffect(() => {
    if (step === 'pin') {
      const t = setTimeout(() => pinInputRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
  }, [step])

  // Push modal above the virtual keyboard on mobile
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    function onViewportChange() {
      if (overlayRef.current) {
        const keyboardHeight = window.innerHeight - vv.height - vv.offsetTop
        overlayRef.current.style.paddingBottom = Math.max(0, keyboardHeight) + 'px'
      }
    }
    vv.addEventListener('resize', onViewportChange)
    vv.addEventListener('scroll', onViewportChange)
    return () => {
      vv.removeEventListener('resize', onViewportChange)
      vv.removeEventListener('scroll', onViewportChange)
    }
  }, [])

  return (
    <div
      ref={overlayRef}
      className="lm-overlay"
      onMouseDown={e => { overlayMouseTarget.current = e.target }}
      onMouseUp={e => {
        if (!required && overlayMouseTarget.current === e.currentTarget && e.target === e.currentTarget) onDismiss()
        overlayMouseTarget.current = null
      }}
    >
      <div className="lm-modal" onMouseDown={e => e.stopPropagation()} onMouseUp={e => e.stopPropagation()}>

        {/* Close button — only shown when login is not mandatory */}
        {!required && (
          <button className="lm-close-x" onClick={onDismiss} title="Close">✕</button>
        )}

        {/* ── Step: PIN ── */}
        {step === 'pin' && (
          <>
            <div className="lm-icon-wrap lm-icon-blue">
              <LockIcon />
            </div>
            <h2 className="lm-title">Sign In</h2>
            <p className="lm-subtitle">Enter your access PIN to continue</p>
            <form onSubmit={handlePinSubmit} className="lm-form">
              <div className="lm-pin-wrap">
                <input
                  ref={pinInputRef}
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  className="lm-input lm-pin-input"
                  placeholder="Enter PIN"
                  value={pin}
                  onChange={handlePinChange}
                />
                <button
                  type="button"
                  className="lm-eye-btn"
                  onClick={() => setShowPin(v => !v)}
                  tabIndex={-1}
                  title={showPin ? 'Hide PIN' : 'Show PIN'}
                >
                  {showPin ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
              {pinTypeWarning && <p className="lm-warn">{pinTypeWarning}</p>}
              {pinError && <p className="lm-error">{pinError}</p>}
              <button type="submit" className="lm-btn-gold lm-btn-full" disabled={pinLoading}>
                {pinLoading ? 'Checking…' : 'Continue →'}
              </button>
            </form>
          </>
        )}

        {/* ── Step: Name ── */}
        {step === 'name' && (
          <>
            <div className="lm-icon-wrap lm-icon-blue">
              <PersonIcon />
            </div>
            <h2 className="lm-title">{pendingRole === 'superadmin' ? 'Super Admin Name' : pendingRole === 'admin' ? 'Admin Name' : 'Your Name'}</h2>
            <p className="lm-subtitle">
              {nameFromDevice
                ? 'Remembered from this device — confirm or change'
                : (pendingRole === 'admin' || pendingRole === 'superadmin')
                  ? 'Enter your name — changes you make will be attributed to you'
                  : 'Enter your name to identify your bookings'}
            </p>
            <form onSubmit={handleNameSubmit} className="lm-form">
              <div className="lm-input-wrap">
                <input
                  type="text"
                  className={`lm-input${nameFromDevice ? ' lm-input--remembered' : ''}`}
                  placeholder="Full name"
                  value={name}
                  onChange={e => { setName(e.target.value); setNameError(''); setNameFromDevice(false) }}
                  autoFocus
                />
                {nameFromDevice && (
                  <span className="lm-device-badge" title="Saved on this device">📱</span>
                )}
              </div>
              {nameError && <p className="lm-error">{nameError}</p>}
              <div className="lm-btn-row">
                <button
                  type="button"
                  className="lm-btn-outlined lm-btn-half"
                  onClick={() => setStep('pin')}
                >
                  ← Back
                </button>
                <button type="submit" className="lm-btn-gold lm-btn-half" disabled={pinLoading}>
                  {pinLoading ? 'Signing in…' : 'Sign In →'}
                </button>
              </div>
            </form>
          </>
        )}

        {/* ── Step: Status ── */}
        {step === 'status' && (
          <>
            <div className="lm-icon-wrap lm-icon-gold">
              <PersonIcon />
            </div>
            <h2 className="lm-title">Account</h2>

            <div className="lm-status-body">
              {auth.role === 'superadmin' ? (
                <>
                  <span className="lm-badge lm-badge-superadmin">🛡️ Super Admin</span>
                  <p className="lm-user-name">{auth.name}</p>
                </>
              ) : auth.role === 'admin' ? (
                <>
                  <span className="lm-badge lm-badge-admin">⭐ Administrator</span>
                  <p className="lm-user-name">{auth.name}</p>
                </>
              ) : (
                <>
                  <span className="lm-badge lm-badge-standard">👤 Standard User</span>
                  <p className="lm-user-name">{auth.name}</p>
                </>
              )}
            </div>

            <div className="lm-btn-col">
              <button className="lm-btn-outlined lm-btn-full" onClick={handleSwitchAccount}>Switch Account</button>
              <button className="lm-btn-outlined-red lm-btn-full" onClick={handleSignOut}>Sign Out</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
