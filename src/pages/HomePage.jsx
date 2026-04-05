import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import BriyaFullLogo from '../components/BriyaFullLogo'
import UserAvatar from '../components/UserAvatar'
import LoginModal from '../components/LoginModal'
import WeatherWidget from '../components/WeatherWidget'
import VisitorCounter from '../components/VisitorCounter'
import SortModal from '../components/SortModal'
import AddSiteModal from '../components/AddSiteModal'
import { getSites, getHealth, getRooms, reorderSites, createSite, deleteSite } from '../services/api'
import { useConfig } from '../context/ConfigContext'
import { useAuth } from '../context/AuthContext'
import comingSoon from '../ComingSoon.jpg'
import { getImageUrl } from '../utils/image'
import './HomePage.css'

const prefetchCache = new Set()

function prefetchRooms(siteCode) {
  if (!siteCode || prefetchCache.has(siteCode)) return
  prefetchCache.add(siteCode)
  getRooms(siteCode).catch(() => {})
}

const SPINNER_STYLE = `@keyframes spin { to { transform: rotate(360deg) } }`

export default function HomePage() {
  const navigate = useNavigate()
  const { auth } = useAuth()
  const [showLogin,   setShowLogin]   = useState(false)
  const [showSort,    setShowSort]    = useState(false)
  const [showAddSite, setShowAddSite] = useState(false)
  const [deletingId,  setDeletingId]  = useState(null)
  const [sites,       setSites]       = useState([])
  const [pageReady,   setPageReady]   = useState(false)
  const { weatherEnabled, visitorCounterEnabled } = useConfig()

  const pendingRef = useRef(0)
  const readyRef   = useRef(false)

  function markReady() {
    if (readyRef.current) return
    readyRef.current = true
    setPageReady(true)
  }

  function onImageSettled() {
    pendingRef.current -= 1
    if (pendingRef.current <= 0) markReady()
  }

  useEffect(() => {
    getHealth()
      .then(data => console.log('[API] health:', data))
      .catch(err => console.error('[API] health check failed:', err.message))
    getSites().then(setSites).catch(() => { markReady() })
  }, [])

  useEffect(() => {
    if (!sites.length) return
    const withImages = sites.filter(s => s.image_url)
    if (!withImages.length) { markReady(); return }
    pendingRef.current = withImages.length
    const fallback = setTimeout(markReady, 6000)
    return () => clearTimeout(fallback)
  }, [sites])

  return (
    <div className="home-page">
      {/* Full-page loading overlay — hides until data + images are ready */}
      {!pageReady && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: '#1186c4',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <style>{SPINNER_STYLE}</style>
          <img
            src={`${import.meta.env.BASE_URL}briya_logo.png`}
            alt="Loading…"
            style={{ width: 72, height: 72, filter: 'brightness(0) invert(1)', animation: 'spin 1.2s linear infinite' }}
          />
        </div>
      )}

      <header className="home-header">
        <div className="home-header-left">
          {weatherEnabled && <WeatherWidget />}
        </div>
        <div className="header-logo">
          <BriyaFullLogo />
        </div>
        <div className="home-header-right">
          {auth.role === 'superadmin' && (
            <>
              <button className="sort-order-btn" onClick={() => setShowAddSite(true)} title="Add site">
                + Site
              </button>
              {sites.length > 1 && (
                <button className="sort-order-btn" onClick={() => setShowSort(true)} title="Reorder sites">
                  ⇅ Sort
                </button>
              )}
            </>
          )}
          <UserAvatar theme="dark" onLoginClick={() => setShowLogin(true)} />
        </div>
      </header>

      <main className="home-main">
        <h1 className="home-title">Briya Room Reservations</h1>
        <div className="home-subtitle-box">Choose a Site</div>

        <div className="site-grid">
          {sites.map((site, index) => (
            <div key={site.id} className="site-card-wrap">
              <button
                className="site-card"
                onMouseEnter={e => {
                  prefetchRooms(site.code)
                  const img = e.currentTarget.querySelector('img')
                  if (img && site.image_url && (!img.complete || img.naturalWidth === 0)) {
                    img.src = getImageUrl(site.image_url) + '?t=' + Date.now()
                  }
                }}
                onFocus={() => prefetchRooms(site.code)}
                onClick={() => { navigate(`/rooms/${site.code}`) }}
              >
                <img
                  src={comingSoon}
                  alt={site.name}
                  className="site-card-img"
                  loading="eager"
                  decoding="async"
                  onLoad={e => {
                    clearTimeout(e.target._loadTimer)
                    if (!e.target._settled && e.target._realSrcSet) {
                      e.target._settled = true
                      onImageSettled()
                    }
                  }}
                  onError={e => {
                    clearTimeout(e.target._loadTimer)
                    if (!e.target._settled) { e.target._settled = true; onImageSettled() }
                    if (!site.image_url) return
                    const retries = (e.target._retries || 0) + 1
                    e.target._retries = retries
                    if (retries <= 6) {
                      const delay = retries === 1 ? 0 : 2000 * (retries - 1)
                      setTimeout(() => {
                        e.target.src = getImageUrl(site.image_url) + '?t=' + Date.now()
                      }, delay)
                    } else {
                      e.target.onerror = null
                      e.target.src = comingSoon
                    }
                  }}
                  ref={el => {
                    if (!el || !site.image_url || el._timerSet) return
                    el._timerSet = true
                    setTimeout(() => {
                      el._realSrcSet = true
                      el.src = getImageUrl(site.image_url)
                      el._loadTimer = setTimeout(() => {
                        if (!el.complete || el.naturalWidth === 0) {
                          el.src = getImageUrl(site.image_url) + '?t=' + Date.now()
                        }
                      }, 8000)
                    }, index * 300)
                  }}
                />
                <div className="site-card-label">{site.name}</div>
              </button>

              {auth.role === 'superadmin' && (
                <button
                  className="site-delete-btn"
                  disabled={deletingId === site.id}
                  title={`Remove ${site.name}`}
                  onClick={async e => {
                    e.stopPropagation()
                    if (!window.confirm(`Remove "${site.name}"?\n\nThis hides the site and all its rooms. Existing bookings are preserved.`)) return
                    setDeletingId(site.id)
                    try {
                      await deleteSite(site.id)
                      setSites(prev => prev.filter(s => s.id !== site.id))
                    } catch {
                      alert('Failed to remove site. Please try again.')
                    } finally {
                      setDeletingId(null)
                    }
                  }}
                >
                  {deletingId === site.id ? '…' : '✕'}
                </button>
              )}
            </div>
          ))}
        </div>
      </main>

      <footer className="home-footer">
        © 2025 | Designed &amp; Engineered by the Briya IT Team | All Rights Reserved.
      </footer>

      {visitorCounterEnabled && <VisitorCounter />}

      {showSort && (
        <SortModal
          title="Sort Sites"
          items={sites.map(s => ({ id: s.id, name: s.name }))}
          onSave={async ordered => {
            await reorderSites(ordered)
            const updated = await getSites().catch(() => sites)
            setSites(updated)
          }}
          onClose={() => setShowSort(false)}
        />
      )}

      {showAddSite && (
        <AddSiteModal
          onSave={async data => {
            const newSite = await createSite(data)
            setSites(prev => [...prev, newSite])
          }}
          onClose={() => setShowAddSite(false)}
        />
      )}

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
