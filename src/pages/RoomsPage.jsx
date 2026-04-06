import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BriyaFullLogo from '../components/BriyaFullLogo'
import Breadcrumb from '../components/Breadcrumb'
import UserAvatar from '../components/UserAvatar'
import LoginModal from '../components/LoginModal'
import WeatherWidget from '../components/WeatherWidget'
import VisitorCounter from '../components/VisitorCounter'
import SortModal from '../components/SortModal'
import AddRoomModal from '../components/AddRoomModal'
import EditCardModal from '../components/EditCardModal'
import ManageActionSheet from '../components/ManageActionSheet'
import { getSite, getRooms, getReservations, reorderRooms, createRoom, updateRoom, deleteRoom } from '../services/api'
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

  useEffect(() => {
    async function load() {
      try {
        const [siteData, roomsData] = await Promise.all([
          getSite(siteId),
          getRooms(siteId),
        ])
        setSite(siteData)
        setRooms(roomsData)
      } catch {
        setSite(undefined)
        markReady()
      }
    }
    load()
  }, [siteId])

  useEffect(() => {
    if (!rooms.length) return
    const withImages = rooms.filter(r => r.image_url)
    if (!withImages.length) { markReady(); return }
    pendingRef.current = withImages.length
    const fallback = setTimeout(markReady, 6000)
    return () => clearTimeout(fallback)
  }, [rooms])

  if (site === null) return <div className="rooms-page" />
  if (!site) {
    return (
      <div className="rooms-page">
        <p style={{ color: '#fff', padding: 40 }}>Site not found.</p>
      </div>
    )
  }

  return (
    <div className="rooms-page">
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
          {weatherEnabled && <WeatherWidget />}
        </div>
        <div className={`header-logo rp-anim rp-anim-logo${pageReady ? ' rp-entered' : ''}`}>
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
                  {!manageMode && (
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
        <h1 className={`rooms-title rp-anim rp-anim-title${pageReady ? ' rp-entered' : ''}`}>Briya Room Reservations</h1>
        <div className={`rooms-subtitle-box rp-anim rp-anim-subtitle${pageReady ? ' rp-entered' : ''}`}>{site.name} — Choose a Room to Book</div>

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
              className={`room-card-wrap rp-anim rp-anim-card${pageReady ? ' rp-entered' : ''}${manageMode && roomManagementEnabled ? ' room-card-wrap--manage' : ''}`}
              style={pageReady ? { animationDelay: `${0.28 + index * 0.06}s` } : undefined}
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
                  loading="eager"
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

      <footer className={`rooms-footer rp-anim rp-anim-footer${pageReady ? ' rp-entered' : ''}`}>
        © 2025 | Designed &amp; Engineered by the Briya IT Team | All Rights Reserved.
      </footer>

      {visitorCounterEnabled && <VisitorCounter />}

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
