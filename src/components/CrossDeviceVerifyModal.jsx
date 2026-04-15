import { useState, useEffect, useRef } from 'react'
import { requestEditOtp, verifyEditOtp } from '../services/api'
import './CrossDeviceVerifyModal.css'

const BRIYA_DOMAIN    = '@briya.org'
const RESEND_COOLDOWN = 300  // 5 minutes — matches OTP_RESEND_COOLDOWN_SECONDS in .env
const OTP_TTL_SECS    = 600  // 10 minutes — matches OTP_EXPIRATION_MINUTES in .env

export default function CrossDeviceVerifyModal({
  siteId,
  roomId,
  event,
  onSuccess,  // (editToken) => void — called after OTP verified
  onCancel,
}) {
  const reservationId = event?.id
  const ownerEmail    = event?.extendedProps?.ownerEmail || null
  const ownershipType = event?.extendedProps?.ownershipType || 'device'

  // ── Step machine: 'confirm' | 'email' | 'otp' | 'success'
  const [step, setStep] = useState('confirm')

  // Email step
  const [email, setEmail]             = useState('')
  const [emailError, setEmailError]   = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [maskedEmail, setMaskedEmail] = useState('')

  // OTP step
  const [otp, setOtp]                       = useState('')
  const [otpError, setOtpError]             = useState('')
  const [otpLoading, setOtpLoading]         = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  // Counts down from OTP_TTL_SECS → 0 while the code is valid
  const [otpCountdown, setOtpCountdown]     = useState(0)

  const cooldownRef  = useRef(null)
  const countdownRef = useRef(null)
  const emailInputRef = useRef(null)
  const otpInputRef   = useRef(null)

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
      if (cooldownRef.current)  clearInterval(cooldownRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  // Auto-focus inputs when step changes
  useEffect(() => {
    if (step === 'email') setTimeout(() => emailInputRef.current?.focus(), 80)
    if (step === 'otp')   setTimeout(() => otpInputRef.current?.focus(), 80)
  }, [step])

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

  // Formats seconds → "m:ss"
  function fmtCountdown(secs) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  async function handleSendCode(emailOverride) {
    const target = (emailOverride || email).trim().toLowerCase()
    setEmailError('')

    if (!target) { setEmailError('Email is required.'); return }
    if (!target.endsWith(BRIYA_DOMAIN)) {
      setEmailError(`Only ${BRIYA_DOMAIN} emails are allowed.`)
      return
    }

    setEmailLoading(true)
    try {
      const res = await requestEditOtp(siteId, roomId, reservationId, target)
      setMaskedEmail(res.maskedEmail || target)
      setOtp('')
      setOtpError('')
      setStep('otp')
      startResendCooldown()
      startOtpCountdown()
    } catch (err) {
      const msg = err.message || 'Failed to send code.'
      if (msg.toLowerCase().includes('does not match') || msg.toLowerCase().includes('mismatch')) {
        setEmailError('That email does not match this booking.')
      } else if (msg.toLowerCase().includes('no email')) {
        setEmailError('No email address is on record for this booking.')
      } else {
        setEmailError(msg)
      }
    } finally {
      setEmailLoading(false)
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault()
    const trimmedOtp = otp.replace(/\D/g, '').slice(0, 6)
    if (trimmedOtp.length < 6) { setOtpError('Enter the full 6-digit code.'); return }

    setOtpLoading(true)
    setOtpError('')
    // TEMP DEBUG — remove before next release
    console.debug(`[OTP-DEBUG-FE] edit verify | email=${email.trim().toLowerCase()} | reservationId=${reservationId} | otp=${trimmedOtp} | otp_len=${trimmedOtp.length} | endpoint=/events/${siteId}/${roomId}/${reservationId}/verify-otp`)
    try {
      const res = await verifyEditOtp(siteId, roomId, reservationId, email.trim().toLowerCase(), trimmedOtp)
      if (res.ok && res.editToken) {
        // editToken is kept in memory only — never persisted to storage
        setStep('success')
        setTimeout(() => onSuccess(res.editToken), 1400)
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

  async function handleResend() {
    if (resendCooldown > 0) return
    setOtpError('')
    await handleSendCode(email)
  }

  function handleOtpChange(e) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
    setOtp(digits)
    setOtpError('')
  }

  return (
    <div className="cdv-overlay">
      <div className="cdv-modal">

        {/* ── Confirm step ── */}
        {step === 'confirm' && (
          <>
            <div className="cdv-icon-wrap">🔐</div>
            <h2 className="cdv-title">Verify Ownership</h2>
            <p className="cdv-body cdv-body--warning">
              This reservation was not created by you.
            </p>
            <p className="cdv-body">
              {ownershipType === 'email'
                ? 'This booking is linked to a different email address.'
                : 'This booking was created on another device.'}
              {' '}To edit it, verify ownership using the email address that was used when booking.
            </p>
            <div className="cdv-btn-col">
              <button className="cdv-btn-primary" onClick={() => setStep('email')}>
                Verify Ownership →
              </button>
              <button className="cdv-btn-ghost" onClick={onCancel}>Cancel</button>
            </div>
          </>
        )}

        {/* ── Email step ── */}
        {step === 'email' && (
          <>
            <div className="cdv-icon-wrap">✉️</div>
            <h2 className="cdv-title">Enter Booking Email</h2>
            <p className="cdv-body">
              Enter the {BRIYA_DOMAIN} email address you used when creating this booking.
              We&apos;ll send a verification code to it.
            </p>
            <form
              className="cdv-form"
              onSubmit={e => { e.preventDefault(); handleSendCode() }}
            >
              <input
                ref={emailInputRef}
                type="email"
                className={`cdv-input${emailError ? ' cdv-input--error' : ''}`}
                placeholder={`your.name${BRIYA_DOMAIN}`}
                value={email}
                onChange={e => { setEmail(e.target.value); setEmailError('') }}
                autoComplete="email"
              />
              {emailError && <p className="cdv-error">{emailError}</p>}
              <div className="cdv-btn-row">
                <button type="button" className="cdv-btn-ghost" onClick={() => setStep('confirm')}>
                  ← Back
                </button>
                <button type="submit" className="cdv-btn-primary" disabled={emailLoading}>
                  {emailLoading ? 'Sending…' : 'Send Code →'}
                </button>
              </div>
            </form>
          </>
        )}

        {/* ── OTP step ── */}
        {step === 'otp' && (
          <>
            <div className="cdv-icon-wrap">🔑</div>
            <h2 className="cdv-title">Enter Verification Code</h2>
            <p className="cdv-body">
              A 6-digit code was sent to <strong>{maskedEmail}</strong>.
            </p>
            {/* Live expiry countdown */}
            <div className={`cdv-countdown${otpCountdown <= 60 && otpCountdown > 0 ? ' cdv-countdown--urgent' : ''}${otpCountdown === 0 ? ' cdv-countdown--expired' : ''}`}>
              {otpCountdown > 0
                ? <>Code expires in <strong>{fmtCountdown(otpCountdown)}</strong></>
                : <>Code has expired — request a new one below</>}
            </div>
            <form className="cdv-form" onSubmit={handleVerifyOtp}>
              <input
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                className={`cdv-input cdv-otp-input${otpError ? ' cdv-input--error' : ''}`}
                placeholder="______"
                value={otp}
                onChange={handleOtpChange}
                autoComplete="one-time-code"
              />
              {otpError && <p className="cdv-error">{otpError}</p>}
              <div className="cdv-btn-row">
                <button
                  type="button"
                  className="cdv-btn-ghost"
                  onClick={() => { setStep('email'); setOtp(''); setOtpError('') }}
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  className="cdv-btn-primary"
                  disabled={otpLoading || otp.replace(/\D/g, '').length < 6}
                >
                  {otpLoading ? 'Verifying…' : 'Verify →'}
                </button>
              </div>
            </form>
            <button
              type="button"
              className="cdv-resend-btn"
              disabled={resendCooldown > 0}
              onClick={handleResend}
            >
              {resendCooldown > 0
                ? `Resend code in ${fmtCountdown(resendCooldown)}`
                : 'Resend code'}
            </button>
          </>
        )}

        {/* ── Success step ── */}
        {step === 'success' && (
          <>
            <div className="cdv-icon-wrap cdv-icon-success">✓</div>
            <h2 className="cdv-title">Verified!</h2>
            <p className="cdv-body cdv-body--center">Opening editor…</p>
          </>
        )}
      </div>
    </div>
  )
}
