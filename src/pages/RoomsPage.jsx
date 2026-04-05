import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BriyaFullLogo from '../components/BriyaFullLogo'
import Breadcrumb from '../components/Breadcrumb'
import UserAvatar from '../components/UserAvatar'
import LoginModal from '../components/LoginModal'
import WeatherWidget from '../components/WeatherWidget'
import VisitorCounter from '../components/VisitorCounter'
import SortModal from '../components/SortModal'
import { getSite, getRooms, getReservations, reorderRooms } from '../services/api'
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
  const [showLogin, setShowLogin] = useState(false)
  const [showSort,  setShowSort]  = useState(false)
  const [pageReady, setPageReady] = useState(false)
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
          {auth.role === 'admin' && rooms.length > 0 && (
            <button className="sort-order-btn" onClick={() => setShowSort(true)} title="Reorder rooms">
              ⇅ Sort
            </button>
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
            <button
              key={room.id}
              className={`room-card rp-anim rp-anim-card${pageReady ? ' rp-entered' : ''}`}
              style={pageReady ? { animationDelay: `${0.28 + index * 0.06}s` } : undefined}
              onMouseEnter={() => prefetchReservations(siteId, room.id)}
              onFocus={() => prefetchReservations(siteId, room.id)}
              onClick={() => navigate(`/calendar/${siteId}/${room.id}`)}
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
