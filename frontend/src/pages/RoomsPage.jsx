import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BriyaFullLogo from '../components/BriyaFullLogo'
import Breadcrumb from '../components/Breadcrumb'
import UserAvatar from '../components/UserAvatar'
import LoginModal from '../components/LoginModal'

const WeatherWidget  = lazy(() => import('../components/WeatherWidget'))
const VisitorCounter = lazy(() => import('../components/VisitorCounter'))
import SortModal from '../components/SortModal'
import AddRoomModal from '../components/AddRoomModal'
import EditCardModal from '../components/EditCardModal'
import ManageActionSheet from '../components/ManageActionSheet'
import { getSite, getRooms, getReservations, reorderRooms, createRoom, updateRoom, deleteRoom } from '../services/api'
import ContactITButton from '../components/ITSupportWidget'
import { useConfig } from '../context/ConfigContext'
import { useAuth } from '../context/AuthContext'
import comingSoon from '../ComingSoon.jpg'
import { getImageUrl } from '../utils/image'
import './RoomsPage.css'

const prefetchCache = new Set()

function prefetchReservations(siteCode, roomId) {
  const key = `${siteCode}:${roomId}`
  if (!siteCode || !roomId || prefetchCache.has(key)) return
  prefetchCache.add(key)
  getReservations(siteCode, roomId).catch(() => {})
}

const SPINNER_STYLE = `@keyframes spin { to { transform: rotate(360deg) } }`

export default function RoomsPage() {
  const { siteId } = useParams()
  const navigate = useNavigate()
  const { auth } = useAuth()
  const [site,      setSite]      = useState(null)
  const [rooms,     setRooms]     = useState([])
  const [showLogin,   setShowLogin]   = useState(false)
  const [showSort,    setShowSort]    = useState(false)
  const [showAddRoom, setShowAddRoom] = useState(false)
  const [editingRoom, setEditingRoom] = useState(null)
  const [sheetRoom,   setSheetRoom]   = useState(null) // mobile action sheet
  const [manageMode,  setManageMode]  = useState(false)
  const [deletingId,  setDeletingId]  = useState(null)
  const [pageReady,   setPageReady]   = useState(false)
  const { weatherEnabled, visitorCounterEnabled, roomManagementEnabled } = useConfig()

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

  const [loadError,  setLoadError]  = useState(null)  // 'notfound' | 'network'
  const [retrying,   setRetrying]   = useState(false)

  async function loadData() {
    try {
      const [siteData, roomsData] = await Promise.all([getSite(siteId), getRooms(siteId)])
      setLoadError(null)
      setSite(siteData)
      setRooms(roomsData)
    } catch (err) {
      const isNotFound = err?.message?.includes('404') || err?.message?.includes('not found')
      setLoadError(isNotFound ? 'notfound' : 'network')
      setSite(undefined)
      markReady()
    }
  }

  // Initial load
  useEffect(() => { loadData() }, [siteId])

  // Auto-recovery: silently retry every 15 s while a network error is showing
  useEffect(() => {
    if (loadError !== 'network') return
    const id = setInterval(async () => {
      try {
        const [siteData, roomsData] = await Promise.all([getSite(siteId), getRooms(siteId)])
        setLoadError(null)
        setSite(siteData)
        setRooms(roomsData)
      } catch { /* still down */ }
    }, 15_000)
    return () => clearInterval(id)
  }, [loadError, siteId])

  async function handleRetry() {
    setRetrying(true)
    const start = Date.now()
    const minDisplay = 1400
    try {
      const [siteData, roomsData] = await Promise.all([getSite(siteId), getRooms(siteId)])
      const wait = minDisplay - (Date.now() - start)
      if (wait > 0) await new Promise(r => setTimeout(r, wait))
      setLoadError(null)
      setSite(siteData)
      setRooms(roomsData)
    } catch (err) {
      const wait = minDisplay - (Date.now() - start)
      if (wait > 0) await new Promise(r => setTimeout(r, wait))
      const isNotFound = err?.message?.includes('404') || err?.message?.includes('not found')
      setLoadError(isNotFound ? 'notfound' : 'network')
      setSite(undefined)
    } finally {
      setRetrying(false)
    }
  }

  useEffect(() => {
    if (!rooms.length) return
    const withImages = rooms.filter(r => r.image_url)
    if (!withImages.length) { markReady(); return }
    pendingRef.current = withImages.length
    const fallback = setTimeout(markReady, 6000)
    return () => clearTimeout(fallback)
  }, [rooms])

  // ── Reconnecting screen (shown while retry is in flight) ─────
  if (retrying) {
    return (
      <div className="app-fullpage-state">
        <style>{SPINNER_STYLE}</style>
        <img src={`${import.meta.env.BASE_URL}briya_logo.png`} alt="Briya" className="app-fullpage-logo" style={{ animation: 'spin 1.2s linear infinite' }} />
        <p className="app-fullpage-heading">Reconnecting…</p>
        <p className="app-fullpage-sub">Please wait while we try to reach the server.</p>
      </div>
    )
  }

  // ── Full-page error screen ────────────────────────────────────
  if (site === null && !loadError) return <div className="rooms-page" />
  if (!site) {
    return (
      <div className="app-fullpage-state">
        <img src={`${import.meta.env.BASE_URL}briya_logo.png`} alt="Briya" className="app-fullpage-logo app-fullpage-logo--still" />
        {loadError === 'notfound' ? (
          <>
            <h2 className="app-fullpage-heading">Site not found</h2>
            <p className="app-fullpage-sub">This site doesn't exist or may have been removed.</p>
            <div className="app-fullpage-actions">
              <button className="app-fullpage-btn-primary" onClick={() => navigate('/')}>← Back to Home</button>
            </div>
          </>
        ) : (
          <>
            <h2 className="app-fullpage-heading">The app is currently unavailable</h2>
            <p className="app-fullpage-sub">We'll be right back. The page will restore itself automatically once the connection is re-established.</p>
            <div className="app-fullpage-actions">
              <button className="app-fullpage-btn-primary" onClick={handleRetry}>↺ Retry</button>
              <ContactITButton variant="outline" />
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className={`rooms-page${pageReady ? ' rp-entered' : ''}`}>
      {/* Full-page loading overlay */}
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

      <header className="rooms-header">
        <div className="rooms-header-left">
          <button className="back-btn" onClick={() => navigate('/')}>← Sites</button>
          {weatherEnabled && <Suspense fallback={null}><WeatherWidget /></Suspense>}
        </div>
        <div className="header-logo">
          <BriyaFullLogo />
        </div>
        <div className="rooms-header-right">
          {auth.role === 'superadmin' && (
            <>
              <button className="sort-order-btn" onClick={() => navigate('/admin')} title="Admin Dashboard">
                ◈<span className="btn-label"> Dashboard</span>
              </button>
              {roomManagementEnabled && (
                <>
                  <button
                    className={`sort-order-btn${manageMode ? ' sort-order-btn--active' : ''}`}
                    onClick={() => setManageMode(m => !m)}
                    title={manageMode ? 'Exit manage mode' : 'Manage rooms'}
                  >
                    {manageMode ? '✓' : '⚙'}<span className="btn-label">{manageMode ? ' Managing' : ' Manage'}</span>
                  </button>
                  {manageMode && (
                    <>
                      <button className="sort-order-btn" onClick={() => setShowAddRoom(true)} title="Add room">
                        +<span className="btn-label"> Room</span>
                      </button>
                      {rooms.length > 1 && (
                        <button className="sort-order-btn" onClick={() => setShowSort(true)} title="Reorder rooms">
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

      <main className="rooms-main">
        <h1 className="rooms-title">Briya Room Reservations</h1>
        <div className="rooms-subtitle-box">{site.name} — Choose a Room to Book</div>

        <Breadcrumb
          variant="on-blue"
          items={[
            { label: 'Home', path: '/' },
            { label: site.name },
          ]}
        />

        <div className="rooms-grid">
          {rooms.map((room, index) => (
            <div
              key={room.id}
              className={`room-card-wrap${manageMode && roomManagementEnabled ? ' room-card-wrap--manage' : ''}`}
              style={{ '--card-i': index }}
            >
              <button
                className="room-card"
                onMouseEnter={() => { if (!manageMode) prefetchReservations(siteId, room.id) }}
                onFocus={() => { if (!manageMode) prefetchReservations(siteId, room.id) }}
                onClick={() => {
                  if (manageMode) { setSheetRoom(room); return }
                  navigate(`/calendar/${siteId}/${room.id}`)
                }}
              >
                <img
                  src={room.image_url ? getImageUrl(room.image_url) : comingSoon}
                  alt={room.name}
                  className="room-card-img"
                  loading={index === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  onLoad={onImageSettled}
                  onError={e => {
                    onImageSettled()
                    e.target.onerror = null
                    e.target.src = comingSoon
                  }}
                />
                <div className="room-card-label">
                  <span>{room.name}</span>
                  {room.capacity > 0 && (
                    <span className="room-card-capacity">🪑 {room.capacity}</span>
                  )}
                </div>
              </button>

              {auth.role === 'superadmin' && roomManagementEnabled && (
                <button
                  className="room-edit-btn"
                  title={`Edit ${room.name}`}
                  onClick={e => { e.stopPropagation(); setEditingRoom(room) }}
                >
                  ✎
                </button>
              )}

              {auth.role === 'superadmin' && roomManagementEnabled && (
                <button
                  className="room-delete-btn"
                  disabled={deletingId === room.id}
                  title={`Remove ${room.name}`}
                  onClick={async e => {
                    e.stopPropagation()
                    if (!window.confirm(`Remove "${room.name}" from ${site.name}?\n\nThis hides the room — existing bookings are preserved.`)) return
                    setDeletingId(room.id)
                    try {
                      await deleteRoom(siteId, room.id)
                      setRooms(prev => prev.filter(r => r.id !== room.id))
                    } catch {
                      alert('Failed to remove room. Please try again.')
                    } finally {
                      setDeletingId(null)
                    }
                  }}
                >
                  {deletingId === room.id ? '…' : '✕'}
                </button>
              )}
            </div>
          ))}
        </div>
      </main>

      <footer className="rooms-footer">
        © 2025 | Designed &amp; Engineered by the Briya IT Team | All Rights Reserved.
      </footer>

      {visitorCounterEnabled && <Suspense fallback={null}><VisitorCounter /></Suspense>}

      {showSort && (
        <SortModal
          title={`Sort Rooms — ${site?.name}`}
          items={rooms.map(r => ({ id: r.id, name: r.name }))}
          onSave={async ordered => {
            await reorderRooms(siteId, ordered)
            const updated = await getRooms(siteId).catch(() => rooms)
            setRooms(updated)
          }}
          onClose={() => setShowSort(false)}
        />
      )}

      {showAddRoom && (
        <AddRoomModal
          siteName={site?.name}
          onSave={async data => {
            const newRoom = await createRoom(siteId, data)
            setRooms(prev => [...prev, newRoom])
          }}
          onClose={() => setShowAddRoom(false)}
        />
      )}

      {editingRoom && (
        <EditCardModal
          mode="room"
          initialValues={{ name: editingRoom.name, capacity: editingRoom.capacity ?? '' }}
          onSave={async data => {
            const result = await updateRoom(siteId, editingRoom.id, data)
            setRooms(prev => prev.map(r =>
              r.id === editingRoom.id ? { ...r, name: result.name, capacity: result.capacity } : r
            ))
          }}
          onClose={() => setEditingRoom(null)}
        />
      )}

      {sheetRoom && (
        <ManageActionSheet
          name={sheetRoom.name}
          onEdit={() => setEditingRoom(sheetRoom)}
          onDelete={async () => {
            if (!window.confirm(`Remove "${sheetRoom.name}" from ${site.name}?\n\nThis hides the room — existing bookings are preserved.`)) return
            setDeletingId(sheetRoom.id)
            try {
              await deleteRoom(siteId, sheetRoom.id)
              setRooms(prev => prev.filter(r => r.id !== sheetRoom.id))
            } catch {
              alert('Failed to remove room. Please try again.')
            } finally {
              setDeletingId(null)
            }
          }}
          onClose={() => setSheetRoom(null)}
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
