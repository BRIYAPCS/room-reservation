import 'dotenv/config'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import cors from 'cors'
import compression from 'compression'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import pool from './config/db.js'
import authRoutes from './routes/auth.js'
import sitesRoutes from './routes/sites.js'
import roomsRoutes from './routes/rooms.js'
import eventsRoutes from './routes/events.js'
import reservationsRoutes from './routes/reservations.js'
import configRoutes from './routes/config.js'
import weatherRoutes from './routes/weather.js'
import visitorsRoutes from './routes/visitors.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 4000

// ── LAN IP helper ─────────────────────────────────────────────
function getLanIP() {
  const ifaces = os.networkInterfaces()
  for (const list of Object.values(ifaces)) {
    for (const iface of list) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return 'unknown'
}

// ─────────────────────────────────────────────────────────────
// 🔥 CORS CONFIG (FIXED + SAFE)
// ─────────────────────────────────────────────────────────────

const isProd = process.env.NODE_ENV === 'production'

// 👉 Default fallback (VERY IMPORTANT)
// Prevents empty CORS config from breaking production
const defaultFrontend = 'https://briyapcs.github.io'

// 👉 Read from .env OR fallback
const allowedOrigins = (process.env.FRONTEND_URL || defaultFrontend)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

// 👉 Dev convenience
if (!isProd) {
  allowedOrigins.push('http://localhost:5173', 'http://localhost:4173')
}

// 👉 CORS options
const corsOptions = {
  origin: (origin, cb) => {
    // Allow server-to-server / curl / health checks
    if (!origin) return cb(null, true)

    // Exact match
    if (allowedOrigins.includes(origin)) return cb(null, true)

    // Dev fallback (LAN + localhost)
    if (!isProd) {
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) return cb(null, true)

      const lan = /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/
      if (lan.test(origin)) return cb(null, true)
    }

    console.warn(`❌ Blocked by CORS: ${origin}`)
    cb(new Error(`CORS: origin not allowed — ${origin}`))
  },

  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}

// ── Trust nginx reverse proxy ────────────────────────────────
app.set('trust proxy', 1)

// ── Rate limiter ─────────────────────────────────────────────
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => req.path === '/api/health',
  message: { error: 'Too many requests, please slow down' },
}))

// ── Security + compression ───────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}))

app.use(compression())

// 🔥 APPLY CORS (IMPORTANT ORDER)
app.options('*', cors(corsOptions))
app.use(cors(corsOptions))

app.use(express.json())

// ── Static image assets ───────────────────────────────────────
app.use('/images', express.static(
  path.join(__dirname, '../uploads/images'),
  {
    maxAge: '7d',
    immutable: false,
  }
))

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth',         authRoutes)
app.use('/api/pin',          authRoutes)
app.use('/api/sites',        sitesRoutes)
app.use('/api/rooms',        roomsRoutes)
app.use('/api/events',       eventsRoutes)
app.use('/api/reservations', reservationsRoutes)
app.use('/api/config',       configRoutes)
app.use('/api/weather',      weatherRoutes)
app.use('/api/visitors',     visitorsRoutes)

app.get('/api/health', (_req, res) => res.json({ status: 'OK' }))

// ── Startup ───────────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', async () => {
  const lan = getLanIP()
  const line = '─'.repeat(52)

  console.log(`\n╔${line}╗`)
  console.log(`║          Briya Room Reservations — API             ║`)
  console.log(`╠${line}╣`)
  console.log(`║  Local    → http://localhost:${PORT}                  ║`)
  console.log(`║  Network  → http://${lan}:${PORT}              ║`)
  console.log(`╠${line}╣`)

  try {
    const [[{ now }]] = await pool.query('SELECT NOW() AS now')
    console.log(`║  Database → ✔ Connected  (${String(now).slice(0, 19)}) ║`)
  } catch (err) {
    console.log(`║  Database → ✘ FAILED: ${err.message.slice(0, 28)} ║`)
  }

  console.log(`╚${line}╝\n`)
})

// ── Keep-alive tuning ─────────────────────────────────────────
server.keepAliveTimeout = 90_000
server.headersTimeout   = 95_000