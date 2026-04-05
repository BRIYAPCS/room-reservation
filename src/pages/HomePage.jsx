import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import BriyaFullLogo from '../components/BriyaFullLogo'
import UserAvatar from '../components/UserAvatar'
import LoginModal from '../components/LoginModal'
import WeatherWidget from '../components/WeatherWidget'
import VisitorCounter from '../components/VisitorCounter'
import { getSites, getHealth, getRooms } from '../services/api'
import { useConfig } from '../context/ConfigContext'
import comingSoon from '../ComingSoon.jpg'
import { getImageUrl } from '../utils/image'
import './HomePage.css'

// Simple in-memory prefetch cache — rooms are small, safe to keep for the session
const prefetchCache = new Set()

function prefetchRooms(siteCode) {
  if (!siteCode || prefetchCache.has(siteCode)) return
  prefetchCache.add(siteCode)
  getRooms(siteCode).catch(() => {}) // fire-and-forget, warms the browser cache
}

export default function HomePage() {
  const navigate = useNavigate()
  const [showLogin, setShowLogin] = useState(false)
  const [sites,     setSites]     = useState([])
  const { weatherEnabled, visitorCounterEnabled } = useConfig()

  useEffect(() => {
    getHealth()
      .then(data => console.log('[API] health:', data))
      .catch(err => console.error('[API] health check failed:', err.message))
    getSites().then(setSites).catch(() => {})
  }, [])

  return (
    <div className="home-page">
      <header className="home-header">
        <div className="home-header-left">
          {weatherEnabled && <WeatherWidget />}
        </div>
        <div className="header-logo">
          <BriyaFullLogo />
        </div>
        <div className="home-header-right">
          <UserAvatar theme="dark" onLoginClick={() => setShowLogin(true)} />
        </div>
      </header>

      <main className="home-main">
        <h1 className="home-title">Briya Room Reservations</h1>
        <div className="home-subtitle-box">Choose a Site</div>

        <div className="site-grid">
          {sites.map(site => (
            <button
              key={site.id}
              className="site-card"
              onMouseEnter={() => prefetchRooms(site.code)}
              onFocus={() => prefetchRooms(site.code)}
              onClick={() => { navigate(`/rooms/${site.code}`) }}
            >
              <img src={site.image_url ? getImageUrl(site.image_url) : comingSoon} alt={site.name} className="site-card-img" loading="eager" decoding="async" onError={e => { e.target.onerror = null; e.target.src = comingSoon }} />
              <div className="site-card-label">{site.name}</div>
            </button>
          ))}
        </div>
      </main>

      <footer className="home-footer">
        © 2025 | Designed &amp; Engineered by the Briya IT Team | All Rights Reserved.
      </footer>

      {visitorCounterEnabled && <VisitorCounter />}

      {showLogin && (
        <LoginModal
          required={false}
          onClose={() => setShowLogin(false)}
          onDismiss={() => setShowLogin(false)}
        />
      )}
    </div>
  )
}
