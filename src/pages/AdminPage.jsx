import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import BriyaFullLogo from '../components/BriyaFullLogo'
import { useAuth } from '../context/AuthContext'
import { useConfig } from '../context/ConfigContext'
import { updateConfig as updateConfigApi } from '../services/api'
import './AdminPage.css'

const SECTIONS = [
  {
    id: 'management',
    title: 'Management Controls',
    desc: 'Control which superadmin tools are visible across the app',
    items: [
      {
        key: 'siteManagementEnabled',
        label: 'Site Management',
        desc: 'Show add, edit, delete, and reorder controls for sites on the home page',
      },
      {
        key: 'roomManagementEnabled',
        label: 'Room Management',
        desc: 'Show add, edit, delete, and reorder controls for rooms on each site page',
      },
    ],
  },
  {
    id: 'features',
    title: 'App Features',
    desc: 'Toggle features visible to all users',
    items: [
      {
        key: 'weatherEnabled',
        label: 'Weather Widget',
        desc: 'Show live weather conditions in the page header',
      },
      {
        key: 'visitorCounterEnabled',
        label: 'Visitor Counter',
        desc: 'Show the live active-visitor count badge in the corner',
      },
      {
        key: 'requireLoginForCalendar',
        label: 'Require Login to Book',
        desc: 'Users must sign in before they can make or view reservations',
      },
      {
        key: 'enableRecurringEvents',
        label: 'Recurring Reservations',
        desc: 'Allow bookings to repeat daily, weekly, or monthly',
      },
    ],
  },
  {
    id: 'booking',
    title: 'Booking Rules',
    desc: 'Set what types of bookings are permitted',
    items: [
      {
        key: 'allowPastBookings',
        label: 'Allow Past Bookings',
        desc: 'Users can create reservations with a start date in the past',
      },
      {
        key: 'allowDoubleBooking',
        label: 'Allow Double Booking',
        desc: 'Multiple reservations can overlap the same time slot in a room',
      },
      {
        key: 'allowWeekendBookings',
        label: 'Allow Weekend Bookings',
        desc: 'Reservations can be made on Saturdays and Sundays',
      },
    ],
  },
]

export default function AdminPage() {
  const navigate = useNavigate()
  const { auth, logout } = useAuth()
  const config = useConfig()
  const [saving, setSaving] = useState(null) // key currently being saved
  const [error,  setError]  = useState(null)

  // Guard — non-superadmins are immediately bounced to home
  useEffect(() => {
    if (auth.role !== 'superadmin') navigate('/', { replace: true })
  }, [auth, navigate])

  if (auth.role !== 'superadmin') return null

  async function handleToggle(key, value) {
    setSaving(key)
    setError(null)
    try {
      await updateConfigApi({ [key]: value })
      config.updateConfig(key, value)
    } catch {
      setError('Failed to save setting — please try again.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header-left">
          <button className="back-btn" onClick={() => navigate('/')}>← Home</button>
        </div>
        <div className="header-logo">
          <BriyaFullLogo />
        </div>
        <div className="admin-header-right">
          <button className="back-btn" onClick={() => { logout(); navigate('/') }}>
            Sign out
          </button>
        </div>
      </header>

      <main className="admin-main">
        <div className="admin-hero">
          <h1 className="admin-title">Admin Dashboard</h1>
          <p className="admin-subtitle">
            Signed in as <strong>{auth.name || 'Super Admin'}</strong> &mdash; changes apply instantly for all users.
          </p>
        </div>

        {error && <div className="admin-error">{error}</div>}

        {SECTIONS.map(section => (
          <section key={section.id} className="admin-section">
            <div className="admin-section-header">
              <h2 className="admin-section-title">{section.title}</h2>
              <p className="admin-section-desc">{section.desc}</p>
            </div>
            <div className="admin-section-body">
              {section.items.map(item => (
                <div key={item.key} className="admin-toggle-row">
                  <div className="admin-toggle-info">
                    <div className="admin-toggle-label">{item.label}</div>
                    <div className="admin-toggle-desc">{item.desc}</div>
                  </div>
                  <label
                    className={`toggle-switch${saving === item.key ? ' toggle-switch--saving' : ''}`}
                    title={config[item.key] ? 'Click to disable' : 'Click to enable'}
                  >
                    <input
                      type="checkbox"
                      checked={!!config[item.key]}
                      disabled={saving === item.key}
                      onChange={e => handleToggle(item.key, e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>

      <footer className="admin-footer">
        © 2025 | Designed &amp; Engineered by the Briya IT Team | All Rights Reserved.
      </footer>
    </div>
  )
}
