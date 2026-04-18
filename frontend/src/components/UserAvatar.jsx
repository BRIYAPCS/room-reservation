import { useAuth } from '../context/AuthContext'
import './UserAvatar.css'

// ── Guest: dashed ring + faded person + lock badge ────────────
function GuestIcon({ color }) {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="19" cy="19" r="17.5" stroke={color} strokeWidth="1.8" fill="none" strokeOpacity="0.45" strokeDasharray="4 2.5" />
      <circle cx="19" cy="15" r="5" fill={color} fillOpacity="0.45" />
      <path d="M8 31c0-6.075 4.925-11 11-11s11 4.925 11 11" stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeOpacity="0.45" />
      {/* Lock badge — bottom right */}
      <circle cx="29" cy="29" r="6.5" fill="#1186c4" />
      <rect x="26.3" y="29.2" width="5.4" height="3.8" rx="0.9" fill="white" />
      <path d="M27.1 29.2v-1.5a1.9 1.9 0 0 1 3.8 0v1.5" stroke="white" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <circle cx="29" cy="31" r="0.7" fill="#1186c4" />
    </svg>
  )
}

// ── Standard: sky-blue circle + person + green pulse dot ──────
function StandardIcon({ color }) {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="19" cy="19" r="18" fill="#0ea5e9" fillOpacity="0.18" />
      <circle cx="19" cy="19" r="18" stroke="#0ea5e9" strokeWidth="2" />
      {/* Person */}
      <circle cx="19" cy="14.5" r="5.5" fill="#0ea5e9" />
      <path d="M7.5 32c0-6.351 5.149-11.5 11.5-11.5S30.5 25.649 30.5 32" stroke="#0ea5e9" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      {/* Green online dot */}
      <circle cx="30" cy="10" r="5" fill="#22c55e" />
      <circle cx="30" cy="10" r="3" fill="#16a34a" />
    </svg>
  )
}

// ── Admin: gold ring + person + crown ─────────────────────────
function AdminIcon({ color }) {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="19" cy="19" r="18" fill="#f59e0b" fillOpacity="0.2" />
      <circle cx="19" cy="19" r="18" stroke="#f59e0b" strokeWidth="2.2" />
      {/* Person */}
      <circle cx="19" cy="17" r="5" fill={color} />
      <path d="M8 32c0-6.075 4.925-11 11-11s11 4.925 11 11" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Crown — above head */}
      <path d="M12.5 13 L15 8.5 L19 12 L23 8.5 L25.5 13 L24.5 14.5 L13.5 14.5 Z" fill="#f59e0b" stroke="#d97706" strokeWidth="0.5" strokeLinejoin="round" />
      <rect x="13.5" y="13.8" width="11" height="1.8" rx="0.6" fill="#f59e0b" />
      {/* Gold star badge */}
      <circle cx="30" cy="10" r="5.5" fill="#f59e0b" />
      <text x="30" y="13.5" textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">★</text>
    </svg>
  )
}

// ── Super Admin: indigo ring + person + shield badge ──────────
function SuperAdminIcon({ color }) {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Double ring — outer glow */}
      <circle cx="19" cy="19" r="18" fill="#7c3aed" fillOpacity="0.22" />
      <circle cx="19" cy="19" r="18" stroke="#7c3aed" strokeWidth="2.5" />
      <circle cx="19" cy="19" r="14.5" stroke="#a78bfa" strokeWidth="1" strokeOpacity="0.5" strokeDasharray="3 2" />
      {/* Person */}
      <circle cx="19" cy="16.5" r="5" fill={color} />
      <path d="M8 32c0-6.075 4.925-11 11-11s11 4.925 11 11" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Crown */}
      <path d="M12.5 12.5 L15 8 L19 11.5 L23 8 L25.5 12.5 L24.5 14 L13.5 14 Z" fill="#a78bfa" stroke="#7c3aed" strokeWidth="0.5" strokeLinejoin="round" />
      <rect x="13.5" y="13.2" width="11" height="1.8" rx="0.6" fill="#a78bfa" />
      {/* Shield badge — bottom right */}
      <circle cx="29.5" cy="29.5" r="6.5" fill="#7c3aed" />
      <path d="M29.5 23.5 C27 24.5 25.5 26 25.5 28 C25.5 30.5 27.2 32.5 29.5 33.5 C31.8 32.5 33.5 30.5 33.5 28 C33.5 26 32 24.5 29.5 23.5Z" fill="white" fillOpacity="0.9" />
      <path d="M28 28.2 L29.2 29.4 L31.5 27" stroke="#7c3aed" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

export default function UserAvatar({ onLoginClick, theme = 'dark' }) {
  const { auth } = useAuth()

  const color = theme === 'light' ? '#1a2f4a' : 'white'

  let icon
  let label
  let wrapClass = `avatar-wrap avatar-wrap--${theme}`

  if (auth.role === 'superadmin') {
    icon = <SuperAdminIcon color={color} />
    label = auth.name || 'Super Admin'
    wrapClass += ' avatar-wrap--superadmin'
  } else if (auth.role === 'admin') {
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

  const labelClass = [
    'avatar-label',
    `avatar-label--${theme}`,
    auth.role === 'admin'      ? 'avatar-label--admin'      : '',
    auth.role === 'superadmin' ? 'avatar-label--superadmin' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={wrapClass}
      onClick={onLoginClick}
      title={auth.role !== 'none' ? `Signed in as ${auth.name} (${auth.role})` : 'Sign in'}
    >
      {icon}
      <span className={labelClass}>{label}</span>
    </div>
  )
}
