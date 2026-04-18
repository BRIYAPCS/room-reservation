import { Router } from 'express'
import pool from '../config/db.js'
import { readEnv } from '../utils/envReader.js'

const router = Router()

// ── Table bootstrap ───────────────────────────────────────────
// visitor_sessions: one row per active browser session.
// last_seen is updated every 30 s by the client heartbeat.
// A session is "live" if last_seen > NOW() - 90 s (3× heartbeat interval).
const INIT_SQL = [
  `CREATE TABLE IF NOT EXISTS visitor_sessions (
     session_id  VARCHAR(64)  NOT NULL PRIMARY KEY,
     last_seen   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
       ON UPDATE CURRENT_TIMESTAMP
   )`,
]

let tableReady = false
async function ensureTable() {
  if (tableReady) return
  for (const stmt of INIT_SQL) await pool.query(stmt)
  tableReady = true
}

// How long (seconds) before a session is considered gone.
// Must be > heartbeat interval (30 s) with headroom for network lag.
const STALE_SECONDS = 90

async function countLive(conn) {
  const [[{ live }]] = await conn.query(
    `SELECT COUNT(*) AS live FROM visitor_sessions
     WHERE last_seen > DATE_SUB(NOW(), INTERVAL ? SECOND)`,
    [STALE_SECONDS]
  )
  return Number(live)
}

// GET /api/visitors  — return current live count (no side-effects, safe to call at any frequency)
router.get('/', async (_req, res) => {
  if (readEnv('VISITOR_COUNTER_ENABLED') !== 'true') {
    return res.status(404).json({ error: 'Visitor counter is disabled' })
  }
  try {
    await ensureTable()
    const live = await countLive(pool)
    res.setHeader('Cache-Control', 'no-store')
    res.json({ live })
  } catch (err) {
    console.error('[visitors] GET:', err.message)
    res.status(500).json({ error: 'Failed to read live count' })
  }
})

// POST /api/visitors/heartbeat  — upsert session, purge stale, return live count
// Body: { sessionId: string }   (UUID generated once per browser session)
router.post('/heartbeat', async (req, res) => {
  if (readEnv('VISITOR_COUNTER_ENABLED') !== 'true') {
    return res.status(404).json({ error: 'Visitor counter is disabled' })
  }

  const { sessionId } = req.body || {}
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 64) {
    return res.status(400).json({ error: 'Invalid sessionId' })
  }

  try {
    await ensureTable()

    // Upsert this session's last_seen timestamp
    await pool.query(
      `INSERT INTO visitor_sessions (session_id, last_seen)
       VALUES (?, NOW())
       ON DUPLICATE KEY UPDATE last_seen = NOW()`,
      [sessionId]
    )

    // Purge sessions that haven't been seen in a while (keeps the table small)
    await pool.query(
      `DELETE FROM visitor_sessions
       WHERE last_seen <= DATE_SUB(NOW(), INTERVAL ? SECOND)`,
      [STALE_SECONDS]
    )

    const live = await countLive(pool)
    res.setHeader('Cache-Control', 'no-store')
    res.json({ live })
  } catch (err) {
    console.error('[visitors] POST /heartbeat:', err.message)
    res.status(500).json({ error: 'Failed to update session' })
  }
})

export default router
