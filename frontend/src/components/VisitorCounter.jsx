import { useState, useEffect, useRef } from 'react'
import { getVisitors, heartbeatVisitor } from '../services/api'
import './VisitorCounter.css'

const HEARTBEAT_MS = 30_000 // 30 s — must stay below STALE_SECONDS (90 s) on backend

function getSessionId() {
  let id = sessionStorage.getItem('vc_session_id')
  if (!id) {
    id = crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36)
    sessionStorage.setItem('vc_session_id', id)
  }
  return id
}

export default function VisitorCounter() {
  const [live,    setLive]    = useState(null)   // null = loading
  const [visible, setVisible] = useState(false)  // entry fade-in
  const [bump,    setBump]    = useState(false)  // flash animation on count increase
  const prevLive  = useRef(null)
  const intervalRef = useRef(null)
  const sessionId   = useRef(getSessionId())

  function handleNewCount(newLive) {
    // Trigger bump animation whenever a new visitor joins (count goes up)
    if (prevLive.current !== null && newLive > prevLive.current) {
      setBump(true)
      setTimeout(() => setBump(false), 700)
    }
    prevLive.current = newLive
    setLive(newLive)
  }

  function sendHeartbeat() {
    heartbeatVisitor(sessionId.current)
      .then(d => handleNewCount(d.live))
      .catch(() => {
        getVisitors().then(d => handleNewCount(d.live)).catch(() => {})
      })
  }

  useEffect(() => {
    // First heartbeat — registers session and gets initial count
    heartbeatVisitor(sessionId.current)
      .then(d => {
        handleNewCount(d.live)
        // Small delay before showing so the entry animation is visible
        requestAnimationFrame(() => setVisible(true))
      })
      .catch(() => {})

    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_MS)

    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        clearInterval(intervalRef.current)
      } else {
        sendHeartbeat()
        intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_MS)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (live === null) return null

  return (
    <div
      className={[
        'visitor-counter',
        visible ? 'visitor-counter--in'   : '',
        bump    ? 'visitor-counter--bump' : '',
      ].filter(Boolean).join(' ')}
      aria-label={`${live} visitor${live === 1 ? '' : 's'} online now`}
    >
      {/* Ripple rings play on bump */}
      <span className="vc-rings" aria-hidden="true">
        <span className="vc-ring vc-ring--1" />
        <span className="vc-ring vc-ring--2" />
        <span className="vc-dot" />
      </span>
      <span className="vc-label">Live</span>
      <span className="vc-total">{live}</span>
    </div>
  )
}
