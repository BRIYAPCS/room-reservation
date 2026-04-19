import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import BriyaFullLogo from '../components/BriyaFullLogo'
import UserAvatar from '../components/UserAvatar'
import LoginModal from '../components/LoginModal'

// Lazy-loaded: only downloaded after the page renders, not before.
// Both are conditionally shown (feature flags), so there's no visible
// delay — the widgets simply appear once their chunk arrives.
const WeatherWidget   = lazy(() => import('../components/WeatherWidget'))
const VisitorCounter  = lazy(() => import('../components/VisitorCounter'))
import SortModal from '../components/SortModal'
import AddSiteModal from '../components/AddSiteModal'
import EditCardModal from '../components/EditCardModal'
import ManageActionSheet from '../components/ManageActionSheet'
import { getSites, getHealth, getRooms, reorderSites, createSite, updateSite, deleteSite } from '../services/api'
import ContactITButton from '../components/ITSupportWidget'
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
  const [showLogin,    setShowLogin]    = useState(false)
  const [showSort,     setShowSort]     = useState(false)
  const [showAddSite,  setShowAddSite]  = useState(false)
  const [editingSite,  setEditingSite]  = useState(null)
  const [sheetSite,    setSheetSite]    = useState(null) // mobile action sheet
  const [manageMode,   setManageMode]   = useState(false)
  const [deletingId,   setDeletingId]   = useState(null)
  const [sites,        setSites]        = useState([])
  const [pageReady,    setPageReady]    = useState(false)
  const [apiError,     setApiError]     = useState(false)
  const [retrying,     setRetrying]     = useState(false)
  const { weatherEnabled, visitorCounterEnabled, siteManagementEnabled } = useConfig()

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

  async function handleRetry() {
    setRetrying(true)
    const start = Date.now()
    const minDisplay = 1400 // keep reconnecting screen visible long enough to be meaningful
    try {
      const data = await getSites()
      const wait = minDisplay - (Date.now() - start)
      if (wait > 0) await new Promise(r => setTimeout(r, wait))
      setApiError(false)
      setSites(data)
    } catch {
      const wait = minDisplay - (Date.now() - start)
      if (wait > 0) await new Promise(r => setTimeout(r, wait))
      setApiError(true)
    } finally {
      setRetrying(false)
    }
  }

  // Auto-recovery: silently poll every 15 s while the error screen is showing.
  // The page restores itself the moment the server comes back — no manual retry needed.
  useEffect(() => {
    if (!apiError) return
    const id = setInterval(async () => {
      try {
        const data = await getSites()
        setApiError(false)
        setSites(data)
      } catch { /* still down — keep polling */ }
    }, 15_000)
    return () => clearInterval(id)
  }, [apiError])

  useEffect(() => {
    getHealth().then(() => {}).catch(() => {})
    getSites()
      .then(data => { setApiError(false); setSites(data) })
      .catch(() => { setApiError(true); markReady() })
  }, [])

  useEffect(() => {
    if (!sites.length) return
    const withImages = sites.filter(s => s.image_url)
    if (!withImages.length) { markReady(); return }
    pendingRef.current = withImages.length
    const fallback = setTimeout(markReady, 6000)
    return () => clearTimeout(fallback)
  }, [sites])

  // ── Full-page retrying screen ────────────────────────────────
  if (retrying) {
    return (
      <div className="app-fullpage-state">
        <style>{SPINNER_STYLE}</style>
        <img
          src={`${import.meta.env.BASE_URL}briya_logo.png`}
          alt="Briya"
          className="app-fullpage-logo"
          style={{ animation: 'spin 1.2s linear infinite' }}
        />
        <p className="app-fullpage-heading">Reconnecting…</p>
        <p className="app-fullpage-sub">Please wait while we try to reach the server.</p>
      </div>
    )
  }

  // ── Full-page error screen ────────────────────────────────────
  if (apiError && pageReady) {
    return (
      <div className="app-fullpage-state">
        <img
          src={`${import.meta.env.BASE_URL}briya_logo.png`}
          alt="Briya"
          className="app-fullpage-logo app-fullpage-logo--still"
        />
        <h2 className="app-fullpage-heading">The app is currently unavailable</h2>
        <p className="app-fullpage-sub">We'll be right back. The page will restore itself automatically once the connection is re-established.</p>
        <div className="app-fullpage-actions">
          <button className="app-fullpage-btn-primary" onClick={handleRetry}>
            ↺ Retry
          </button>
          <ContactITButton variant="outline" />
        </div>
      </div>
    )
  }

  return (
    <div className={`home-page${pageReady ? ' hp-entered' : ''}`}>
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
          {weatherEnabled && <Suspense fallback={null}><WeatherWidget /></Suspense>}
        </div>
        <div className="header-logo">
          <BriyaFullLogo />
        </div>
        <div className="home-header-right">
          {auth.role === 'superadmin' && (
            <>
              <button className="sort-order-btn" onClick={() => navigate('/admin')} title="Admin Dashboard">
                ◈<span className="btn-label"> Dashboard</span>
              </button>
              {siteManagementEnabled && (
                <>
                  <button
                    className={`sort-order-btn${manageMode ? ' sort-order-btn--active' : ''}`}
                    onClick={() => setManageMode(m => !m)}
                    title={manageMode ? 'Exit manage mode' : 'Manage sites'}
                  >
                    {manageMode ? '✓' : '⚙'}<span className="btn-label">{manageMode ? ' Managing' : ' Manage'}</span>
                  </button>
                  {manageMode && (
                    <>
                      <button className="sort-order-btn" onClick={() => setShowAddSite(true)} title="Add site">
                        +<span className="btn-label"> Site</span>
                      </button>
                      {sites.length > 1 && (
                        <button className="sort-order-btn" onClick={() => setShowSort(true)} title="Reorder sites">
                          ⇅<span className="btn-label"> Sort</span>
                        </button>
                      )}
                    </>
                  )}
                </>
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
            <div
              key={site.id}
              className={`site-card-wrap${manageMode && siteManagementEnabled ? ' site-card-wrap--manage' : ''}`}
              style={{ '--card-i': index }}
            >
              <button
                className="site-card"
                onMouseEnter={e => {
                  if (manageMode) return
                  prefetchRooms(site.code)
                  const img = e.currentTarget.querySelector('img')
                  if (img && site.image_url && (!img.complete || img.naturalWidth === 0)) {
                    img.src = getImageUrl(site.image_url) + '?t=' + Date.now()
                  }
                }}
                onFocus={() => { if (!manageMode) prefetchRooms(site.code) }}
                onClick={() => {
                  if (manageMode) { setSheetSite(site); return }
                  navigate(`/rooms/${site.code}`)
                }}
              >
                <img
                  src={comingSoon}
                  alt={site.name}
                  className="site-card-img"
                  loading={index === 0 ? 'eager' : 'lazy'}
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

              {auth.role === 'superadmin' && siteManagementEnabled && (
                <button
                  className="site-edit-btn"
                  title={`Edit ${site.name}`}
                  onClick={e => { e.stopPropagation(); setEditingSite(site) }}
                >
                  ✎
                </button>
              )}

              {auth.role === 'superadmin' && siteManagementEnabled && (
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

      {visitorCounterEnabled && <Suspense fallback={null}><VisitorCounter /></Suspense>}

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

      {editingSite && (
        <EditCardModal
          mode="site"
          initialValues={{ name: editingSite.name, code: editingSite.code }}
          onSave={async data => {
            const result = await updateSite(editingSite.id, data)
            setSites(prev => prev.map(s =>
              s.id === editingSite.id ? { ...s, name: result.name, code: result.code } : s
            ))
          }}
          onClose={() => setEditingSite(null)}
        />
      )}

      {sheetSite && (
        <ManageActionSheet
          name={sheetSite.name}
          onEdit={() => setEditingSite(sheetSite)}
          onDelete={async () => {
            if (!window.confirm(`Remove "${sheetSite.name}"?\n\nThis hides the site and all its rooms. Existing bookings are preserved.`)) return
            setDeletingId(sheetSite.id)
            try {
              await deleteSite(sheetSite.id)
              setSites(prev => prev.filter(s => s.id !== sheetSite.id))
            } catch {
              alert('Failed to remove site. Please try again.')
            } finally {
              setDeletingId(null)
            }
          }}
          onClose={() => setSheetSite(null)}
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
