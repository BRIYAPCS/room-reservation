import { useAuth } from '../context/AuthContext'
import './UserAvatar.css'

// ── Guest: person silhouette + small lock badge ───────────────
function GuestIcon({ color }) {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer ring */}
      <circle cx="19" cy="19" r="17.5" stroke={color} strokeWidth="1.8" fill="none" strokeOpacity="0.5" strokeDasharray="4 2" />
      {/* Person head */}
      <circle cx="19" cy="15" r="5" fill={color} fillOpacity="0.55" />
      {/* Person body */}
      <path d="M8 31c0-6.075 4.925-11 11-11s11 4.925 11 11" stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeOpacity="0.55" />
      {/* Lock icon bottom-right */}
      <circle cx="29" cy="29" r="6" fill="#1186c4" />
      <rect x="26.5" y="29" width="5" height="3.5" rx="0.8" fill="white" />
      <path d="M27.2 29v-1.3a1.8 1.8 0 0 1 3.6 0V29" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <circle cx="29" cy="30.6" r="0.6" fill="#1186c4" />
    </svg>
  )
}

// ── Standard: solid person in a filled circle ─────────────────
function StandardIcon({ color }) {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Filled background circle */}
      <circle cx="19" cy="19" r="18" fill={color} fillOpacity="0.15" />
      <circle cx="19" cy="19" r="18" stroke={color} strokeWidth="1.8" />
      {/* Person head */}
      <circle cx="19" cy="15" r="5.5" fill={color} />
      {/* Person body */}
      <path d="M7.5 32c0-6.351 5.149-11.5 11.5-11.5S30.5 25.649 30.5 32" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Green online dot */}
      <circle cx="29.5" cy="10.5" r="4.5" fill="#22c55e" />
      <circle cx="29.5" cy="10.5" r="3" fill="#16a34a" />
    </svg>
  )
}

// ── Admin: person with gold crown ─────────────────────────────
function AdminIcon({ color }) {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Filled background circle */}
      <circle cx="19" cy="19" r="18" fill="#f0c000" fillOpacity="0.18" />
      <circle cx="19" cy="19" r="18" stroke="#f0c000" strokeWidth="2" />
      {/* Person head */}
      <circle cx="19" cy="16.5" r="5" fill={color} />
      {/* Person body */}
      <path d="M8 32c0-6.075 4.925-11 11-11s11 4.925 11 11" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Crown at top */}
      <path d="M12 12.5 L14.5 8 L19 11.5 L23.5 8 L26 12.5 L25 14 L13 14 Z" fill="#f0c000" stroke="#d4a500" strokeWidth="0.6" strokeLinejoin="round" />
      <rect x="13" y="13.5" width="12" height="1.5" rx="0.5" fill="#f0c000" />
    </svg>
  )
}

export default function UserAvatar({ onLoginClick, theme = 'dark' }) {
  const { auth } = useAuth()

  const color = theme === 'light' ? '#1186c4' : 'white'

  let icon
  let label
  let wrapClass = `avatar-wrap avatar-wrap--${theme}`

  if (auth.role === 'admin') {
    icon = <AdminIcon color={color} />
    label = auth.name || 'Admin'
    wrapClass += ' avatar-wrap--admin'
  } else if (auth.role === 'standard') {
    icon = <StandardIcon color={color} />
    label = auth.name || 'User'
    wrapClass += ' avatar-wrap--standard'
  } else {
    icon = <GuestIcon color={color} />
    label = 'Sign in'
    wrapClass += ' avatar-wrap--guest'
  }

  return (
    <div
      className={wrapClass}
      onClick={onLoginClick}
      title={auth.role !== 'none' ? `Signed in as ${auth.name}` : 'Sign in'}
    >
      {icon}
      <span className={`avatar-label avatar-label--${theme}${auth.role === 'admin' ? ' avatar-label--admin' : ''}`}>
        {label}
      </span>
    </div>
  )
}
