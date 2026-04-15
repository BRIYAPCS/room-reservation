import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { getDeviceName } from '../context/AuthContext'
import { checkTrustedDevice, requestLoginOtp, verifyLoginOtp } from '../services/api'
import ClearableInput from './ClearableInput'
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

const BRIYA_DOMAIN    = '@briya.org'
const RESEND_COOLDOWN = 300   // 5 minutes — matches OTP_RESEND_COOLDOWN_SECONDS
const OTP_TTL_SECS    = 600   // 10 minutes — matches OTP_EXPIRATION_MINUTES

export default function LoginModal({ onClose, onDismiss, required = false, onBack }) {
  const { auth, login, logout, logoutAll, validatePin } = useAuth()

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

  // Steps: 'pin' | 'otp' | 'name' | 'status'
  const [step, setStep] = useState(getInitialStep)

  // ── PIN step ──────────────────────────────────────────────────
  const [pin, setPin]                     = useState('')
  const [showPin, setShowPin]             = useState(false)
  const [pinTypeWarning, setPinTypeWarning] = useState('')
  const [pinError, setPinError]           = useState('')
  const [pinLoading, setPinLoading]       = useState(false)

  const [email, setEmail]                         = useState('')
  const [emailDomainError, setEmailDomainError]   = useState('')
  const [emailSendError, setEmailSendError]       = useState('')   // OTP send failure
  const [emailSendFailed, setEmailSendFailed]     = useState(false)

  // ── OTP step ──────────────────────────────────────────────────
  const [otpCode, setOtpCode]               = useState('')
  const [otpError, setOtpError]             = useState('')
  const [otpLoading, setOtpLoading]         = useState(false)
  const [maskedEmail, setMaskedEmail]       = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const [otpCountdown, setOtpCountdown]     = useState(0)

  // ── Carried into downstream steps ────────────────────────────
  const [pendingRole, setPendingRole]                   = useState(null)
  const [pendingEmail, setPendingEmail]                 = useState('')
  const [pendingEmailClaimToken, setPendingEmailClaimToken] = useState(null)
  const [pendingName, setPendingName]                   = useState('')  // name from PA

  // ── Name step ─────────────────────────────────────────────────
  const [name, setName]               = useState('')
  const [nameFromDevice, setNameFromDevice] = useState(false)
  const [nameError, setNameError]     = useState('')

  const cooldownRef   = useRef(null)
  const countdownRef  = useRef(null)
  const pinInputRef   = useRef(null)
  const otpInputRef   = useRef(null)

  // Clean up intervals on unmount
  useEffect(() => () => {
    if (cooldownRef.current)  clearInterval(cooldownRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
  }, [])

  // Auto-focus inputs when step changes
  useEffect(() => {
    if (step === 'pin') {
      const t = setTimeout(() => pinInputRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
    if (step === 'otp') {
      const t = setTimeout(() => otpInputRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
  }, [step])

  // Push modal above the virtual keyboard on mobile
  const overlayRef = useRef(null)
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

  // ── Countdown helpers ─────────────────────────────────────────
  function startResendCooldown() {
    setResendCooldown(RESEND_COOLDOWN)
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  function startOtpCountdown() {
    setOtpCountdown(OTP_TTL_SECS)
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = setInterval(() => {
      setOtpCountdown(prev => {
        if (prev <= 1) { clearInterval(countdownRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  function fmtCountdown(secs) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  // ── PIN step handlers ─────────────────────────────────────────
  function handlePinChange(e) {
    const raw = e.target.value
    const digitsOnly = raw.replace(/\D/g, '')
    setPinTypeWarning(raw !== digitsOnly ? 'PIN must contain numbers only.' : '')
    setPin(digitsOnly)
    setPinError('')
  }

  function handleEmailChange(e) {
    const val = e.target.value
    setEmail(val)
    if (emailSendFailed) { setEmailSendFailed(false); setEmailSendError('') }
    if (val && val.trim() && !val.trim().toLowerCase().endsWith(BRIYA_DOMAIN)) {
      setEmailDomainError(`Only ${BRIYA_DOMAIN} emails are allowed`)
    } else {
      setEmailDomainError('')
    }
  }

  async function handlePinSubmit(e) {
    e.preventDefault()
    setPinLoading(true)
    setEmailSendError('')

    const role = await validatePin(pin)
    if (!role) {
      setPinLoading(false)
      setPinError('Incorrect PIN. Please try again.')
      return
    }

    const trimmedEmail = email.trim().toLowerCase()
    const isBriyaEmail = trimmedEmail.endsWith(BRIYA_DOMAIN)

    if (trimmedEmail && isBriyaEmail) {
      // ── Trusted device: probe first, before hitting the rate-limited OTP endpoint ──
      // checkTrustedDevice is not rate-limited so trusted users are never blocked
      // by the OTP request limiter.
      if (auth.deviceSessionId) {
        const checkResult = await checkTrustedDevice(trimmedEmail, auth.deviceSessionId).catch(err => {
          console.debug(`[TRUSTED-DEBUG] checkTrustedDevice THREW | err=${err?.message}`)
          return { trusted: false }
        })
        console.debug(`[TRUSTED-DEBUG] checkTrustedDevice | email=${trimmedEmail} | dsid=${auth.deviceSessionId?.slice(0,8)}… | trusted=${checkResult?.trusted}`)
        const { trusted } = checkResult
        if (trusted) {
          setPendingRole(role)
          setPendingEmail(trimmedEmail)
          const saved = getDeviceName(role)
          if (saved) {
            // Name already known from this device — skip the name step entirely
            await login(pin, saved, { email: trimmedEmail })
            setPinLoading(false)
            onClose()
            return
          }
          // Trusted device but no stored name (first time naming) — ask once
          setName('')
          setNameFromDevice(false)
          setPinLoading(false)
          setStep('name')
          return
        }
      }

      // If the same email already has an active OTP (resend cooldown still running —
      // meaning we sent a code within the last 5 min), skip the API call and just
      // return the user to the OTP step rather than spamming a new code.
      if (resendCooldown > 0 && pendingEmail === trimmedEmail) {
        setPendingRole(role)
        setPinLoading(false)
        setStep('otp')
        return
      }

      // Not trusted — send OTP to prove ownership of this email
      try {
        const res = await requestLoginOtp(trimmedEmail, auth.deviceSessionId)

        // Safety net: requestLoginOtp also does a server-side trusted check and can
        // return { trusted: true } without sending an email (e.g. if checkTrustedDevice
        // failed silently above). Handle it here so the user is never left waiting for
        // a code that was never sent.
        console.debug(`[TRUSTED-DEBUG] requestLoginOtp | email=${trimmedEmail} | res.trusted=${res?.trusted} | res.ok=${res?.ok}`)
        if (res?.trusted) {
          setPendingRole(role)
          setPendingEmail(trimmedEmail)
          const saved = getDeviceName(role)
          if (saved) {
            await login(pin, saved, { email: trimmedEmail })
            setPinLoading(false)
            onClose()
            return
          }
          setName('')
          setNameFromDevice(false)
          setPinLoading(false)
          setStep('name')
          return
        }

        // res could be undefined if the auth token was rejected (401 path in request())
        if (!res) throw new Error('No response from server.')
        setMaskedEmail(res.maskedEmail || trimmedEmail)
        setPendingName(res.name || '')
        setPendingRole(role)
        setPendingEmail(trimmedEmail)
        setOtpCode('')
        setOtpError('')
        startResendCooldown()
        startOtpCountdown()
        setStep('otp')
      } catch (err) {
        // OTP send failed — stay on PIN step, let user proceed without email
        const raw = err.message || ''
        const msg = raw === 'RATE_LIMIT_EXCEEDED'
          ? 'Too many attempts. Please wait a few minutes before trying again.'
          : raw || 'Failed to send verification code.'
        setEmailSendError(msg)
        setEmailSendFailed(true)
        setPendingRole(role)
        setPendingEmail(trimmedEmail)
        const saved = getDeviceName(role)
        setName(saved || '')
        setNameFromDevice(!!saved)
      }
      setPinLoading(false)
      return
    }

    // No email or non-briya email → name step, no email verification
    setPendingEmail(trimmedEmail)
    setPendingRole(role)
    const saved = getDeviceName(role)
    setName(saved || '')
    setNameFromDevice(!!saved)
    setPinLoading(false)
    setStep('name')
  }

  // Called when OTP send failed and user wants to continue without email
  function handleContinueWithoutEmail() {
    setEmailSendFailed(false)
    setEmailSendError('')
    setStep('name')
  }

  // ── OTP step handlers ─────────────────────────────────────────
  async function handleOtpVerify(e) {
    e.preventDefault()
    const trimmed = otpCode.replace(/\D/g, '').slice(0, 6)
    if (trimmed.length < 6) { setOtpError('Enter the full 6-digit code.'); return }

    setOtpLoading(true)
    setOtpError('')
    // TEMP DEBUG — remove before next release
    console.debug(`[OTP-DEBUG-FE] login verify | email=${pendingEmail} | otp=${trimmed} | otp_len=${trimmed.length} | endpoint=/auth/verify-login-otp`)
    try {
      const res = await verifyLoginOtp(pendingEmail, trimmed, auth.deviceSessionId)
      if (res.ok && res.emailClaimToken) {
        // If PA returned a display name, auto-login and skip the name step
        if (pendingName) {
          await login(pin, pendingName, { email: pendingEmail, emailClaimToken: res.emailClaimToken })
          onClose()
          return
        }
        // No name from PA — go to name step carrying the claim token
        setPendingEmailClaimToken(res.emailClaimToken)
        const saved = getDeviceName(pendingRole)
        setName(saved || '')
        setNameFromDevice(!!saved)
        setStep('name')
      }
    } catch (err) {
      const msg = err.message || 'Incorrect code.'
      if (msg.toLowerCase().includes('expired')) {
        setOtpError('Code has expired. Use the link below to request a new one.')
      } else if (msg.toLowerCase().includes('too many') || msg.toLowerCase().includes('max attempt')) {
        setOtpError('Too many incorrect attempts. Request a new code.')
      } else {
        setOtpError(msg)
      }
    } finally {
      setOtpLoading(false)
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0) return
    setOtpError('')
    setOtpCode('')
    try {
      const res = await requestLoginOtp(pendingEmail, auth.deviceSessionId)
      setMaskedEmail(res.maskedEmail || pendingEmail)
      if (res.name) setPendingName(res.name)
      startResendCooldown()
      startOtpCountdown()
    } catch (err) {
      setOtpError(err.message || 'Failed to resend code.')
    }
  }

  // Skip email verification — go to name step without emailClaimToken
  function handleSkipOtp() {
    setPendingEmailClaimToken(null)
    const saved = getDeviceName(pendingRole)
    setName(saved || '')
    setNameFromDevice(!!saved)
    setStep('name')
  }

  function handleOtpChange(e) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
    setOtpCode(digits)
    setOtpError('')
  }

  // ── Name step handler ─────────────────────────────────────────
  async function handleNameSubmit(e) {
    e.preventDefault()
    if (!name.trim()) { setNameError('Name is required.'); return }
    setPinLoading(true)
    await login(pin, name.trim(), { email: pendingEmail, emailClaimToken: pendingEmailClaimToken })
    setPinLoading(false)
    onClose()
  }

  // ── Reset ─────────────────────────────────────────────────────
  function resetModalState() {
    setPin(''); setShowPin(false); setPinTypeWarning('')
    setPinError(''); setPinLoading(false)
    setEmail(''); setEmailDomainError(''); setEmailSendError('')
    setEmailSendFailed(false)
    setOtpCode(''); setOtpError(''); setOtpLoading(false)
    setMaskedEmail(''); setResendCooldown(0); setOtpCountdown(0)
    if (cooldownRef.current)  clearInterval(cooldownRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
    setPendingRole(null); setPendingEmail('')
    setPendingEmailClaimToken(null); setPendingName('')
    setName(''); setNameFromDevice(false); setNameError('')
  }

  function handleSwitchAccount() { logout(); resetModalState(); setStep('pin') }

  function handleSignOut() {
    logout()
    if (required) { resetModalState(); setStep('pin') }
    else { onDismiss?.() }
  }

  const overlayMouseTarget = useRef(null)

  return (
    <div
      ref={overlayRef}
      className="lm-overlay"
      onMouseDown={e => { overlayMouseTarget.current = e.target }}
      onMouseUp={() => { overlayMouseTarget.current = null }}
    >
      <div className="lm-modal" onMouseDown={e => e.stopPropagation()} onMouseUp={e => e.stopPropagation()}>

        {/* Close button — only shown when login is not mandatory */}
        {!required && (
          <button className="lm-close-x" onClick={onDismiss} title="Close">✕</button>
        )}

        {/* ── Step: PIN ── */}
        {step === 'pin' && (
          <>
            <div className="lm-icon-wrap lm-icon-blue"><LockIcon /></div>
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

              {/* Optional email field */}
              <div className="lm-email-wrap">
                <ClearableInput
                  type="email"
                  name="email"
                  className={[
                    'lm-input lm-email-input',
                    emailDomainError  ? 'lm-input--error' : '',
                    emailSendFailed   ? 'lm-input--warn'  : '',
                  ].filter(Boolean).join(' ')}
                  placeholder={`Optional — enter your ${BRIYA_DOMAIN} email`}
                  value={email}
                  onChange={handleEmailChange}
                  autoComplete="email"
                />
              </div>
              {emailDomainError && <p className="lm-error lm-domain-error">{emailDomainError}</p>}

              {/* OTP send failure banner */}
              {emailSendFailed && emailSendError && (
                <div className="lm-verify-failed-banner">
                  <span className="lm-verify-failed-icon">⚠</span>
                  <div className="lm-verify-failed-text">
                    <strong>{emailSendError}</strong>
                    <span>Fix your email and try again, or continue without email verification.</span>
                  </div>
                </div>
              )}

              {emailSendFailed ? (
                <button type="button" className="lm-btn-gold lm-btn-full" onClick={handleContinueWithoutEmail}>
                  Continue without email →
                </button>
              ) : (
                <button type="submit" className="lm-btn-gold lm-btn-full" disabled={pinLoading}>
                  {pinLoading ? 'Sending code…' : 'Continue →'}
                </button>
              )}
            </form>
            {onBack && (
              <button type="button" className="lm-back-btn" onClick={onBack}>← Go Back</button>
            )}
          </>
        )}

        {/* ── Step: OTP ── */}
        {step === 'otp' && (
          <>
            <div className="lm-icon-wrap lm-icon-blue">🔑</div>
            <h2 className="lm-title">Verify Your Email</h2>
            <p className="lm-subtitle">
              A 6-digit code was sent to <strong>{maskedEmail}</strong>
            </p>

            {/* Live expiry countdown */}
            <div className={[
              'lm-otp-countdown',
              otpCountdown <= 60 && otpCountdown > 0 ? 'lm-otp-countdown--urgent'  : '',
              otpCountdown === 0                     ? 'lm-otp-countdown--expired' : '',
            ].filter(Boolean).join(' ')}>
              {otpCountdown > 0
                ? <>Code expires in <strong>{fmtCountdown(otpCountdown)}</strong></>
                : <>Code has expired — request a new one below</>}
            </div>

            <form className="lm-form" onSubmit={handleOtpVerify} style={{ marginTop: 12 }}>
              <input
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                className={`lm-input lm-otp-input${otpError ? ' lm-input--error' : ''}`}
                placeholder="______"
                value={otpCode}
                onChange={handleOtpChange}
                autoComplete="one-time-code"
              />
              {otpError && <p className="lm-error">{otpError}</p>}
              <div className="lm-btn-row">
                <button
                  type="button"
                  className="lm-btn-outlined lm-btn-half"
                  onClick={() => { setStep('pin'); setOtpCode(''); setOtpError('') }}
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  className="lm-btn-gold lm-btn-half"
                  disabled={otpLoading || otpCode.replace(/\D/g, '').length < 6}
                >
                  {otpLoading ? 'Verifying…' : 'Verify →'}
                </button>
              </div>
            </form>

            <button
              type="button"
              className="lm-otp-resend-btn"
              disabled={resendCooldown > 0}
              onClick={handleResendOtp}
            >
              {resendCooldown > 0
                ? `Resend code in ${fmtCountdown(resendCooldown)}`
                : 'Resend code'}
            </button>

            <button type="button" className="lm-otp-skip-btn" onClick={handleSkipOtp}>
              Skip email verification
            </button>
          </>
        )}

        {/* ── Step: Name ── */}
        {step === 'name' && (
          <>
            <div className="lm-icon-wrap lm-icon-blue"><PersonIcon /></div>
            <h2 className="lm-title">
              {pendingRole === 'superadmin' ? 'Super Admin Name' : pendingRole === 'admin' ? 'Admin Name' : 'Your Name'}
            </h2>
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
                  onClick={() => setStep(pendingEmailClaimToken ? 'otp' : 'pin')}
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
            <div className="lm-icon-wrap lm-icon-gold"><PersonIcon /></div>
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

              {/* Show verified email identity */}
              {auth.emailVerified && auth.email && (
                <div className="lm-identity-locked">
                  <span className="lm-identity-lock-icon">🔒</span>
                  <span className="lm-identity-email">{auth.email}</span>
                  <span className="lm-identity-verified-badge">Verified</span>
                </div>
              )}

              {/* Show unverified email if present */}
              {!auth.emailVerified && auth.email && (
                <p className="lm-identity-email-unverified">{auth.email}</p>
              )}
            </div>

            <div className="lm-btn-col">
              {/* Switch Account hidden when identity is locked via verified email */}
              {!auth.emailVerified && (
                <button className="lm-btn-outlined lm-btn-full" onClick={handleSwitchAccount}>Switch Account</button>
              )}
              <button className="lm-btn-outlined-red lm-btn-full" onClick={handleSignOut}>Sign Out</button>
              {/* Only show if email-verified — logout-all requires an email session to revoke */}
              {auth.emailVerified && auth.email && (
                <button
                  className="lm-btn-outlined-red lm-btn-full"
                  style={{ marginTop: 4, fontSize: '0.85rem' }}
                  onClick={() => { logoutAll(); onDismiss?.() }}
                >
                  Sign out all devices
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
