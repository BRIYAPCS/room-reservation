import { useState } from 'react'
import './PINModal.css'

export default function PINModal({ correctPin, onVerified }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  function handleVerify() {
    if (pin === correctPin) {
      onVerified()
    } else {
      setError('Incorrect PIN. Please try again.')
      setPin('')
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleVerify()
  }

  return (
    <div className="pin-overlay">
      <div className="pin-modal">
        <h2>Enter Access PIN</h2>
        <input
          type="password"
          placeholder="Enter PIN"
          value={pin}
          onChange={e => { setPin(e.target.value); setError('') }}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        {error && <p className="pin-error">{error}</p>}
        <button className="pin-verify-btn" onClick={handleVerify}>Verify</button>
      </div>
    </div>
  )
}
