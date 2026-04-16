import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { getDeviceName } from '../context/AuthContext'
import { checkTrustedDevice, requestLoginOtp, verifyLoginOtp, getTrustedDeviceCount, validateEmail } from '../services/api'
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
// Persists the last successfully used email local part across sessions so
// the field is pre-filled on next open, enabling trusted-device fast-login.
const LAST_EMAIL_KEY  = 'briya_last_login_email'

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

  // email stores only the local part (before @briya.org).
  // Pre-populated from the last successfully used email so trusted-device
  // users don't have to re-type it on every login.
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem(LAST_EMAIL_KEY) || '' } catch { return '' }
  })
  const [emailRequiredError, setEmailRequiredError] = useState('')  // admin/superadmin enforcement
  const [emailSendError, setEmailSendError]         = useState('')  // OTP send failure
  const [emailSendFailed, setEmailSendFailed]       = useState(false)
  const [emailNotInDomain, setEmailNotInDomain]     = useState(false) // PA returned: not in directory
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0)   // seconds until unblocked

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

  // ── Success / goodbye step ────────────────────────────────────
  // type: 'welcome_back' | 'verified' | 'goodbye'
  const [successContext, setSuccessContext] = useState({ name: '', type: 'welcome_back' })

  // ── Status step — trusted device count ───────────────────────
  // Fetched when the status step becomes active.  null = loading, 0+ = resolved.
  // "Sign out all devices" is only shown when count > 1 (other devices exist).
  const [trustedDeviceCount, setTrustedDeviceCount] = useState(null)

  const cooldownRef     = useRef(null)
  const countdownRef    = useRef(null)
  const successTimerRef = useRef(null)
  const rateLimitRef    = useRef(null)
  const pinInputRef     = useRef(null)
  const otpInputRef     = useRef(null)
  const emailInputRef   = useRef(null)

  // Clean up intervals / timers on unmount
  useEffect(() => () => {
    if (cooldownRef.current)     clearInterval(cooldownRef.current)
    if (countdownRef.current)    clearInterval(countdownRef.current)
    if (successTimerRef.current) clearTimeout(successTimerRef.current)
    if (rateLimitRef.current)    clearInterval(rateLimitRef.current)
  }, [])

  // Shows the brief success screen, then auto-closes the modal.
  // isReturn=true → "Welcome back" (1.8s), false → "Email verified" (2.4s)
  function completeLogin(displayName, isReturn) {
    const type = isReturn ? 'welcome_back' : 'verified'
    setSuccessContext({ name: displayName, type })
    setStep('success')
    const delay = isReturn ? 1800 : 2400
    if (successTimerRef.current) clearTimeout(successTimerRef.current)
    successTimerRef.current = setTimeout(() => onClose(), delay)
  }

  // Shows the goodbye screen, then executes the provided logout callback.
  // Must capture auth.name BEFORE calling logout (which clears auth state).
  function completeLogout(afterFn) {
    const savedName = auth.name || ''
    setSuccessContext({ name: savedName, type: 'goodbye' })
    setStep('success')
    if (successTimerRef.current) clearTimeout(successTimerRef.current)
    successTimerRef.current = setTimeout(afterFn, 1800)
  }

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

  // Fetch the number of active trusted devices when the status step is shown.
  // This determines whether "Sign out all devices" is relevant to display.
  useEffect(() => {
    if (step !== 'status' || !auth.emailVerified || !auth.email) return
    setTrustedDeviceCount(null)   // reset to loading state on each open
    getTrustedDeviceCount()
      .then(data => setTrustedDeviceCount(data?.count ?? 0))
      .catch(() => setTrustedDeviceCount(0))
  }, [step, auth.emailVerified, auth.email])

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

  function startRateLimitCountdown(seconds) {
    const secs = seconds > 0 ? seconds : 60
    setRateLimitCountdown(secs)
    if (rateLimitRef.current) clearInterval(rateLimitRef.current)
    rateLimitRef.current = setInterval(() => {
      setRateLimitCountdown(prev => {
        if (prev <= 1) {
          clearInterval(rateLimitRef.current)
          setEmailSendFailed(false)
          setEmailSendError('')
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  // Persists the local part of the email so the field is pre-filled next time.
  // Only called after a successful API action (OTP sent, trusted device recognised).
  function saveLastEmail(localPart) {
    try { if (localPart) localStorage.setItem(LAST_EMAIL_KEY, localPart) } catch {}
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
    // Strip any @ and everything after it — user only types the local part
    const val = e.target.value.replace(/@.*$/, '')
    setEmail(val)
    if (emailSendFailed)   { setEmailSendFailed(false); setEmailSendError(''); setRateLimitCountdown(0); if (rateLimitRef.current) clearInterval(rateLimitRef.current) }
    if (emailNotInDomain)  setEmailNotInDomain(false)
    if (emailRequiredError) setEmailRequiredError('')
  }

  async function handlePinSubmit(e) {
    e.preventDefault()
    setPinLoading(true)
    // Clear any stale failure state from a previous attempt so the banner
    // doesn't remain visible while the new request is in flight.
    setEmailSendError('')
    setEmailSendFailed(false)
    setEmailNotInDomain(false)

    const role = await validatePin(pin)
    if (!role) {
      setPinLoading(false)
      setPinError('Incorrect PIN. Please try again.')
      return
    }

    // email state holds only the local part; append domain to build full address
    const localPart    = email.trim().toLowerCase()
    const trimmedEmail = localPart ? localPart + BRIYA_DOMAIN : ''

    // Admin and superadmin must verify via @briya.org email — no bypass allowed
    const isPrivileged = role === 'admin' || role === 'superadmin'
    if (isPrivileged && !localPart) {
      setPinLoading(false)
      setEmailRequiredError(
        `${role === 'superadmin' ? 'Super Admin' : 'Admin'} access requires a verified ${BRIYA_DOMAIN} email.`
      )
      return
    }

    if (trimmedEmail) {
      // ── Power Automate domain validation ─────────────────────────
      // Verify the email exists in the Briya directory before doing anything else.
      // If PA is unreachable (fallback: true), allow the user through gracefully.
      // If PA says the account is not found, stop and ask the user to correct it.
      let paName = ''
      try {
        const paResult = await validateEmail(trimmedEmail).catch(() => ({ valid: false, fallback: true }))
        if (paResult?.valid === false && !paResult?.fallback) {
          // PA responded and explicitly said this account is not in the directory
          setEmailNotInDomain(true)
          setPendingRole(role)   // carry role so the banner knows admin vs standard
          setPinLoading(false)
          setTimeout(() => emailInputRef.current?.focus(), 60)
          return
        }
        // Capture name locally so trusted-device paths can use it without React
        // state timing issues — setPendingName updates async, paName is immediate
        if (paResult?.name) {
          paName = paResult.name
          setPendingName(paResult.name)
        }
        // valid === true OR fallback === true (PA unreachable) → proceed
      } catch { /* network error treated as fallback — allow through */ }

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
          // Email confirmed as owned by this device — persist local part for next open
          saveLastEmail(localPart)
          setPendingRole(role)
          setPendingEmail(trimmedEmail)
          const saved = getDeviceName(role)
          if (saved) {
            // Name already known from this device — skip the name step entirely
            await login(pin, saved, { email: trimmedEmail })
            setPinLoading(false)
            completeLogin(saved, true)   // "Welcome back, [name]"
            return
          }
          // Trusted device — use PA name if available to skip name step
          if (paName) {
            await login(pin, paName, { email: trimmedEmail })
            setPinLoading(false)
            completeLogin(paName, true)   // "Welcome back, [name from PA]"
            return
          }
          // No PA name — ask the user once
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
          // Server confirmed device is trusted (safety-net for silently-failed client check)
          saveLastEmail(localPart)
          setPendingRole(role)
          setPendingEmail(trimmedEmail)
          const saved = getDeviceName(role)
          if (saved) {
            await login(pin, saved, { email: trimmedEmail })
            setPinLoading(false)
            completeLogin(saved, true)   // "Welcome back, [name]" (safety-net trusted path)
            return
          }
          // Trusted device (safety-net path) — use PA name if available
          if (paName) {
            await login(pin, paName, { email: trimmedEmail })
            setPinLoading(false)
            completeLogin(paName, true)   // "Welcome back, [name from PA]"
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
        // OTP sent successfully — email is valid, save local part for next open
        saveLastEmail(localPart)
        setMaskedEmail(res.maskedEmail || trimmedEmail)
        // Only update if backend's PA call also returned a name — never overwrite
        // the name we already captured from validateEmail with an empty string
        if (res.name) setPendingName(res.name)
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
        const isRateLimit = raw === 'RATE_LIMIT_EXCEEDED'
        const msg = isRateLimit
          ? 'Too many OTP requests — please wait before trying again.'
          : raw || 'Failed to send verification code.'
        setEmailSendError(msg)
        setEmailSendFailed(true)
        if (isRateLimit && err.retryAfterSeconds) {
          startRateLimitCountdown(err.retryAfterSeconds)
        }
        setPendingRole(role)
        setPendingEmail(trimmedEmail)
        const saved = getDeviceName(role)
        setName(saved || '')
        setNameFromDevice(!!saved)
      }
      setPinLoading(false)
      return
    }

    // No email → name step, no email verification
    setPendingEmail(trimmedEmail)
    setPendingRole(role)
    const saved = getDeviceName(role)
    setName(saved || '')
    setNameFromDevice(!!saved)
    setPinLoading(false)
    setStep('name')
  }

  // Called when OTP send failed and user wants to continue without email.
  // Not available for admin/superadmin — they must fix their email.
  function handleContinueWithoutEmail() {
    if (pendingRole === 'admin' || pendingRole === 'superadmin') return
    setEmailSendFailed(false)
    setEmailSendError('')
    setEmailNotInDomain(false)
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
          completeLogin(pendingName, false)   // "Email verified · Welcome, [name]"
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

      // Safety guard: api.js returns undefined on a 401 (token revoked mid-session)
      if (!res) throw new Error('No response from server.')

      // The server performs its own trusted-device check in request-login-otp.
      // If it returns { trusted: true }, no email was sent — auto-login immediately
      // so the user is never left waiting for a code that will never arrive.
      if (res.trusted) {
        const saved = getDeviceName(pendingRole)
        if (saved) {
          await login(pin, saved, { email: pendingEmail })
          completeLogin(saved, true)   // "Welcome back, [name]"
        } else {
          // Device is trusted but name not yet stored on this device — ask once
          setName('')
          setNameFromDevice(false)
          setStep('name')
        }
        return
      }

      setMaskedEmail(res.maskedEmail || pendingEmail)
      if (res.name) setPendingName(res.name)
      startResendCooldown()
      startOtpCountdown()
    } catch (err) {
      const raw = err.message || ''
      const isRateLimit = raw === 'RATE_LIMIT_EXCEEDED'
      if (isRateLimit && err.retryAfterSeconds) {
        // Show both the resend cooldown UI and the exact server-reported wait time
        startResendCooldown()
        startRateLimitCountdown(err.retryAfterSeconds)
      }
      setOtpError(isRateLimit
        ? `Too many requests — try again in ${err.retryAfterSeconds ? fmtCountdown(err.retryAfterSeconds) : 'a few minutes'}.`
        : raw || 'Failed to resend code.')
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
    // nameFromDevice = name was pre-filled from this device → returning user
    // otherwise this is a fresh sign-in (OTP just done, or no email)
    completeLogin(name.trim(), nameFromDevice)
  }

  // ── Reset ─────────────────────────────────────────────────────
  function resetModalState() {
    setPin(''); setShowPin(false); setPinTypeWarning('')
    setPinError(''); setPinLoading(false)
    // Restore the persisted email so the field is still pre-filled after Switch Account.
    // localStorage only updates on successful login, so it always reflects the last
    // person who actually logged in on this device.
    try { setEmail(localStorage.getItem(LAST_EMAIL_KEY) || '') } catch { setEmail('') }
    setEmailRequiredError(''); setEmailSendError('')
    setEmailSendFailed(false); setEmailNotInDomain(false); setRateLimitCountdown(0)
    setOtpCode(''); setOtpError(''); setOtpLoading(false)
    setMaskedEmail(''); setResendCooldown(0); setOtpCountdown(0)
    if (cooldownRef.current)     clearInterval(cooldownRef.current)
    if (countdownRef.current)    clearInterval(countdownRef.current)
    if (rateLimitRef.current)    clearInterval(rateLimitRef.current)
    setPendingRole(null); setPendingEmail('')
    setPendingEmailClaimToken(null); setPendingName('')
    setName(''); setNameFromDevice(false); setNameError('')
  }

  function handleSwitchAccount() { logout(); resetModalState(); setStep('pin') }

  function handleSignOut() {
    completeLogout(() => {
      logout()
      if (required) { resetModalState(); setStep('pin') }
      else { onDismiss?.() }
    })
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

              {/* Email field — optional for standard, required for admin/superadmin */}
              <div className={[
                'lm-email-split',
                emailRequiredError ? 'lm-email-split--error' : '',
                emailSendFailed || emailNotInDomain ? 'lm-email-split--warn'  : '',
              ].filter(Boolean).join(' ')}>
                <input
                  ref={emailInputRef}
                  type="text"
                  name="email"
                  inputMode="email"
                  className="lm-email-local"
                  placeholder={emailNotInDomain ? 'Enter a valid email' : 'Email address'}
                  value={email}
                  onChange={handleEmailChange}
                  autoComplete="email"
                  spellCheck={false}
                  autoCapitalize="none"
                />
                <span className="lm-email-domain">@briya.org</span>
              </div>
              {emailRequiredError && <p className="lm-error lm-domain-error">{emailRequiredError}</p>}

              {/* PA: email not found in Briya directory */}
              {emailNotInDomain && (
                <div className="lm-verify-failed-banner">
                  <span className="lm-verify-failed-icon">⚠</span>
                  <div className="lm-verify-failed-text">
                    <strong>Email not found in the Briya directory</strong>
                    <span>
                      {pendingRole === 'admin' || pendingRole === 'superadmin'
                        ? 'Verification is required for this role. Please update your email and try again.'
                        : 'We couldn\'t find that account. Update your email and try again, or continue without verification.'}
                    </span>
                  </div>
                </div>
              )}

              {/* OTP send failure / rate-limit banner */}
              {emailSendFailed && emailSendError && (
                <div className="lm-verify-failed-banner">
                  <span className="lm-verify-failed-icon">⚠</span>
                  <div className="lm-verify-failed-text">
                    <strong>{emailSendError}</strong>
                    {rateLimitCountdown > 0 ? (
                      <span className="lm-rate-limit-countdown">
                        Try again in <strong>{fmtCountdown(rateLimitCountdown)}</strong>
                      </span>
                    ) : (
                      <span>
                        {pendingRole === 'admin' || pendingRole === 'superadmin'
                          ? 'Fix your email and try again — verification is required for this role.'
                          : 'Fix your email and try again, or continue without email verification.'}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Action buttons — order: not-found > send-failed > default */}
              {emailNotInDomain ? (
                <div className={pendingRole !== 'admin' && pendingRole !== 'superadmin' ? 'lm-btn-row' : ''}>
                  <button
                    type="submit"
                    className={pendingRole !== 'admin' && pendingRole !== 'superadmin' ? 'lm-btn-gold lm-btn-half' : 'lm-btn-gold lm-btn-full'}
                    disabled={pinLoading}
                  >
                    {pinLoading ? 'Checking…' : 'Try again →'}
                  </button>
                  {pendingRole !== 'admin' && pendingRole !== 'superadmin' && (
                    <button type="button" className="lm-btn-outlined lm-btn-half" onClick={handleContinueWithoutEmail}>
                      Skip →
                    </button>
                  )}
                </div>
              ) : emailSendFailed && pendingRole !== 'admin' && pendingRole !== 'superadmin' && rateLimitCountdown === 0 ? (
                <button type="button" className="lm-btn-gold lm-btn-full" onClick={handleContinueWithoutEmail}>
                  Continue without email →
                </button>
              ) : (
                <button type="submit" className="lm-btn-gold lm-btn-full" disabled={pinLoading || (!!emailSendFailed && rateLimitCountdown > 0)}>
                  {pinLoading ? 'Checking…' : 'Continue →'}
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

            {pendingRole !== 'admin' && pendingRole !== 'superadmin' && (
              <button type="button" className="lm-otp-skip-btn" onClick={handleSkipOtp}>
                Skip email verification
              </button>
            )}
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
              {/* "Sign out all devices" is only meaningful when other trusted devices
                   exist (count > 1).  Hidden while loading (null) to avoid flicker. */}
              {auth.emailVerified && auth.email && trustedDeviceCount > 1 && (
                <button
                  className="lm-btn-outlined-red lm-btn-full"
                  style={{ marginTop: 4, fontSize: '0.85rem' }}
                  onClick={() => completeLogout(() => { logoutAll(); onDismiss?.() })}
                >
                  Sign out all devices
                </button>
              )}
            </div>
          </>
        )}
        {/* ── Step: Success / Goodbye ── */}
        {step === 'success' && (
          <div className="lm-success">
            <div className={`lm-success-icon-wrap lm-success-icon-wrap--${successContext.type}`}>
              {successContext.type === 'verified'      ? '✅'
               : successContext.type === 'goodbye'    ? '👋'
               :                                        '👋'}
            </div>
            <p className="lm-success-greeting">
              {successContext.type === 'goodbye'      ? 'See you next time,'
               : successContext.type === 'welcome_back' ? 'Welcome back,'
               :                                          'Welcome,'}
            </p>
            <p className="lm-success-name">{successContext.name}</p>
            <p className="lm-success-sub">
              {successContext.type === 'goodbye'
                ? 'You have been signed out'
                : successContext.type === 'welcome_back'
                ? 'Trusted device — signed in automatically'
                : 'Email verified · This device is now trusted'}
            </p>
            <div className="lm-success-bar">
              <div
                className="lm-success-bar-fill"
                style={{ animationDuration: successContext.type === 'verified' ? '2.4s' : '1.8s' }}
              />
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
