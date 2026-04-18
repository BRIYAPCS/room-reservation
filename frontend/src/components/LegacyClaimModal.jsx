import { useState } from 'react'
import * as api from '../services/api'
import './EventDetailsModal.css'

/**
 * LegacyClaimModal
 *
 * Two-step OTP flow for claiming a legacy booking (ownership_type = null).
 * Reuses EventDetailsModal CSS so it matches the rest of the modal system.
 *
 * Steps: 'email' → 'otp' → calls onSuccess()
 */
export default function LegacyClaimModal({ siteId, roomId, event, onSuccess, onCancel }) {
  const [step,        setStep]        = useState('email')
  const [email,       setEmail]       = useState('')
  const [otp,         setOtp]         = useState('')
  const [maskedEmail, setMaskedEmail] = useState('')
  const [error,       setError]       = useState('')
  const [loading,     setLoading]     = useState(false)

  const eventId = event?.id

  async function handleRequestOtp(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const normalizedEmail = email.trim().toLowerCase()
    try {
      const result = await api.claimRequestOtp(siteId, roomId, eventId, normalizedEmail)
      setMaskedEmail(result.maskedEmail || email)
      setStep('otp')
    } catch (err) {
      setError(err?.message || 'Failed to send code. Try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const normalizedEmail = email.trim().toLowerCase()
    try {
      await api.claimVerifyOtp(siteId, roomId, eventId, normalizedEmail, otp)
      onSuccess()
    } catch (err) {
      setError(err?.message || 'Verification failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="edm-overlay">
      <div className="edm-modal">
        <h2 className="edm-header">Claim This Booking</h2>
        <div className="edm-divider" />

        {step === 'email' ? (
          <form onSubmit={handleRequestOtp}>
            <div className="edm-body">
              <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#555' }}>
                This booking has no recorded owner. Enter your @briya.org email
                to verify your identity and claim it.
              </p>
              <input
                type="email"
                placeholder="your@briya.org"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
              />
              {error && (
                <p style={{ color: '#c0392b', fontSize: '0.85rem', margin: '8px 0 0' }}>{error}</p>
              )}
            </div>
            <div className="edm-divider" />
            <div className="edm-actions">
              <button type="submit" className="edm-btn-edit" disabled={loading}>
                {loading ? 'Sending…' : 'Send Code'}
              </button>
              <button type="button" className="edm-btn-close" onClick={onCancel}>Cancel</button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <div className="edm-body">
              <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#555' }}>
                Enter the 6-digit code sent to {maskedEmail}.
              </p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="6-digit code"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                autoFocus
                style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
              />
              {error && (
                <p style={{ color: '#c0392b', fontSize: '0.85rem', margin: '8px 0 0' }}>{error}</p>
              )}
            </div>
            <div className="edm-divider" />
            <div className="edm-actions">
              <button type="submit" className="edm-btn-edit" disabled={loading}>
                {loading ? 'Verifying…' : 'Verify & Claim'}
              </button>
              <button type="button" className="edm-btn-close" onClick={() => { setStep('email'); setOtp(''); setError('') }}>
                Back
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
