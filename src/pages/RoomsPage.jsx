import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BriyaFullLogo from '../components/BriyaFullLogo'
import Breadcrumb from '../components/Breadcrumb'
import UserAvatar from '../components/UserAvatar'
import LoginModal from '../components/LoginModal'
import WeatherWidget from '../components/WeatherWidget'
import VisitorCounter from '../components/VisitorCounter'
import { getSite, getRooms, getReservations } from '../services/api'
import { useConfig } from '../context/ConfigContext'
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
  const [site,      setSite]      = useState(null)
  const [rooms,     setRooms]     = useState([])
  const [showLogin, setShowLogin] = useState(false)
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
        <div className="header-logo">
          <BriyaFullLogo />
        </div>
        <div className="rooms-header-right">
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
          {rooms.map(room => (
            <button
              key={room.id}
              className="room-card"
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

      <footer className="rooms-footer">
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
