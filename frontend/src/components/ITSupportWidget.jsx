import { useState, useRef, useEffect } from 'react'
import './ITSupportWidget.css'

const FORM_URL =
  'https://forms.office.com/pages/responsepage.aspx?id=hZ48poBPUkS3lYRVetMMFQenKwKFY7hDrfr5AlG3wFFUREo4MkVRM1I3NVo3MTdKRjQxSzhKRzRIUS4u&route=shorturl'

function ITSupportModal({ onClose }) {
  const [submitted, setSubmitted] = useState(false)
  const loadCount   = useRef(0)
  const closeTimer  = useRef(null)

  // Detect submission: iframe fires `load` once on initial load, then again
  // when it navigates to the "Thank you" confirmation page after submit.
  function handleIframeLoad() {
    loadCount.current += 1
    if (loadCount.current >= 2) triggerSuccess()
  }

  // Belt-and-suspenders: also catch any postMessage from Microsoft Forms
  useEffect(() => {
    function onMessage(e) {
      if (!e.origin.includes('forms.office.com') && !e.origin.includes('forms.microsoft.com')) return
      const payload = typeof e.data === 'string' ? e.data : JSON.stringify(e.data ?? '')
      if (/submit|thank|complet/i.test(payload)) triggerSuccess()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  function triggerSuccess() {
    if (submitted) return
    setSubmitted(true)
    closeTimer.current = setTimeout(onClose, 4500)
  }

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])

  return (
    <div
      className="its-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="IT Support Request"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="its-modal">
        <div className="its-modal-header">
          <span className="its-modal-title">🛠 IT Support Request</span>
          <button className="its-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {submitted ? (
          <div className="its-success">
            <div className="its-success-icon">✓</div>
            <h3 className="its-success-heading">Request received!</h3>
            <p className="its-success-body">
              IT has received your request and will contact you soon.
            </p>
            <p className="its-success-closing">Closing automatically…</p>
          </div>
        ) : (
          <>
            <iframe
              src={FORM_URL}
              className="its-iframe"
              title="IT Support Form"
              onLoad={handleIframeLoad}
            />
            <div className="its-modal-footer">
              <span className="its-footer-hint">
                Once you submit the form this window will close automatically.
              </span>
              <button className="its-done-btn" onClick={triggerSuccess}>
                ✓ I've Submitted
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function ITSupportWidget() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        className="its-fab"
        onClick={() => setOpen(true)}
        aria-label="Open IT Support form"
        title="IT Support"
      >
        <span className="its-fab-icon">?</span>
        <span className="its-fab-label">IT Support</span>
      </button>
      {open && <ITSupportModal onClose={() => setOpen(false)} />}
    </>
  )
}
