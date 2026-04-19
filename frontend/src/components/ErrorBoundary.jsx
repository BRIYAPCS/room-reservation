import { Component } from 'react'
import ContactITButton from './ITSupportWidget'

/**
 * Catches any unhandled React render/lifecycle error and shows a
 * full-page recovery screen instead of a blank white page.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, showDetails: false }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Unhandled error:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const { error, showDetails } = this.state

    return (
      <div style={{
        minHeight: '100vh',
        background: '#1186c4',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'system-ui, sans-serif',
        textAlign: 'center',
      }}>
        {/* Logo */}
        <img
          src={`${import.meta.env.BASE_URL}briya_logo.png`}
          alt="Briya"
          style={{ width: 64, height: 64, filter: 'brightness(0) invert(1)', marginBottom: 24, opacity: 0.9 }}
        />

        {/* Heading */}
        <h1 style={{ color: '#fff', fontSize: 'clamp(1.3rem,3vw,1.8rem)', margin: '0 0 12px', fontWeight: 700 }}>
          Something went wrong
        </h1>

        {/* Message */}
        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 'clamp(0.9rem,2vw,1.05rem)', maxWidth: 440, margin: '0 0 28px', lineHeight: 1.6 }}>
          An unexpected error occurred. Try reloading the page.
          If the problem keeps happening, please contact the{' '}
          <strong style={{ color: '#fff' }}>Briya IT Team</strong>.
        </p>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 24 }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#fff',
              color: '#1186c4',
              border: 'none',
              borderRadius: 8,
              padding: '12px 28px',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ↺ Reload Page
          </button>
          <button
            onClick={() => { window.location.href = import.meta.env.BASE_URL || '/' }}
            style={{
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              border: '1.5px solid rgba(255,255,255,0.5)',
              borderRadius: 8,
              padding: '12px 28px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ⌂ Go to Home
          </button>
          <ContactITButton variant="outline" />
        </div>

        {/* Collapsible technical details (for IT) */}
        <button
          onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.55)',
            fontSize: '0.8rem',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          {showDetails ? 'Hide' : 'Show'} technical details
        </button>

        {showDetails && error && (
          <pre style={{
            marginTop: 12,
            background: 'rgba(0,0,0,0.25)',
            color: 'rgba(255,255,255,0.8)',
            borderRadius: 8,
            padding: '14px 18px',
            fontSize: '0.78rem',
            maxWidth: 600,
            width: '100%',
            textAlign: 'left',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {error.toString()}
            {error.stack ? '\n\n' + error.stack : ''}
          </pre>
        )}
      </div>
    )
  }
}
