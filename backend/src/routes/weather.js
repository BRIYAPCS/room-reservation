import { Router } from 'express'
import { readEnv } from '../utils/envReader.js'

const router = Router()

// ── Server-side weather cache (10 min) ────────────────────────
// Prevents every user's 10-min poll from hitting Open-Meteo separately.
// Cache is keyed by "lat,lon" so different locations stay separate.
const weatherCache = new Map() // key → { data, expiresAt }
const CACHE_TTL_MS = 10 * 60 * 1000

// Reverse-geocode lat/lon → city name via OpenStreetMap Nominatim (free, no key)
async function reverseGeocode(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`
    const res  = await fetch(url, { headers: { 'User-Agent': 'BriyaRoomReservations/1.0' } })
    if (!res.ok) return null
    const data = await res.json()
    const a    = data.address || {}
    return a.city || a.town || a.village || a.county || a.state || null
  } catch {
    return null
  }
}

// WMO weather code → human-readable description + emoji
const WMO_CODES = {
  0:  { label: 'Clear Sky',         icon: '☀️' },
  1:  { label: 'Mainly Clear',      icon: '🌤️' },
  2:  { label: 'Partly Cloudy',     icon: '⛅' },
  3:  { label: 'Overcast',          icon: '☁️' },
  45: { label: 'Foggy',             icon: '🌫️' },
  48: { label: 'Icy Fog',           icon: '🌫️' },
  51: { label: 'Light Drizzle',     icon: '🌦️' },
  53: { label: 'Drizzle',           icon: '🌦️' },
  55: { label: 'Heavy Drizzle',     icon: '🌧️' },
  61: { label: 'Light Rain',        icon: '🌧️' },
  63: { label: 'Rain',              icon: '🌧️' },
  65: { label: 'Heavy Rain',        icon: '🌧️' },
  71: { label: 'Light Snow',        icon: '🌨️' },
  73: { label: 'Snow',              icon: '❄️' },
  75: { label: 'Heavy Snow',        icon: '❄️' },
  80: { label: 'Rain Showers',      icon: '🌦️' },
  81: { label: 'Rain Showers',      icon: '🌧️' },
  82: { label: 'Heavy Showers',     icon: '🌧️' },
  95: { label: 'Thunderstorm',      icon: '⛈️' },
  96: { label: 'Thunderstorm',      icon: '⛈️' },
  99: { label: 'Thunderstorm',      icon: '⛈️' },
}

// GET /api/weather?lat=<lat>&lon=<lon>
// Public — returns current weather.
// lat/lon query params = browser geolocation (preferred).
// Falls back to WEATHER_LAT/WEATHER_LON from .env if not provided.
// Reads WEATHER_ENABLED fresh from .env on every request — no restart needed.
router.get('/', async (req, res) => {
  if (readEnv('WEATHER_ENABLED') !== 'true') {
    return res.status(404).json({ error: 'Weather widget is disabled' })
  }

  // Prefer browser-supplied coords, fall back to .env
  const lat = req.query.lat || readEnv('WEATHER_LAT')
  const lon = req.query.lon || readEnv('WEATHER_LON')

  if (!lat || !lon) {
    return res.status(500).json({ error: 'Weather location not configured' })
  }

  // DEV ONLY: test overrides bypass the cache so you can switch animations instantly
  const testKey = readEnv('WEATHER_TEST_CONDITION').trim().toLowerCase()
  const TEST_MAP = {
    rain:    { label: 'Rain',         icon: '🌧️' },
    drizzle: { label: 'Light Drizzle',icon: '🌦️' },
    storm:   { label: 'Thunderstorm', icon: '⛈️' },
    snow:    { label: 'Snow',         icon: '❄️' },
    sunny:   { label: 'Clear Sky',    icon: '☀️' },
    cloudy:  { label: 'Overcast',     icon: '☁️' },
    fog:     { label: 'Foggy',        icon: '🌫️' },
  }

  const cacheKey = `${lat},${lon}`
  const cached   = weatherCache.get(cacheKey)
  if (!testKey && cached && Date.now() < cached.expiresAt) {
    return res.json(cached.data)
  }

  try {
    // Fetch weather and reverse-geocode city name in parallel
    const [upstream, cityName] = await Promise.all([
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m` +
        `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`
      ),
      req.query.lat ? reverseGeocode(lat, lon) : Promise.resolve(readEnv('WEATHER_CITY') || null),
    ])

    if (!upstream.ok) throw new Error(`Open-Meteo error ${upstream.status}`)

    const data = await upstream.json()
    const c    = data.current
    const code = c.weather_code ?? 0
    const real = WMO_CODES[code] || { label: 'Unknown', icon: '🌡️' }

    const { label, icon } = (testKey && TEST_MAP[testKey]) ? TEST_MAP[testKey] : real

    const payload = {
      city:      cityName || 'Your Location',
      temp:      Math.round(c.temperature_2m),
      feelsLike: Math.round(c.apparent_temperature),
      humidity:  c.relative_humidity_2m,
      windSpeed: Math.round(c.wind_speed_10m),
      condition: label,
      icon,
    }

    // Store in cache (skip when test override is active)
    if (!testKey) weatherCache.set(cacheKey, { data: payload, expiresAt: Date.now() + CACHE_TTL_MS })

    res.json(payload)
  } catch (err) {
    console.error('[weather] GET /:', err.message)
    // Return stale cache rather than an error if we have it
    if (cached) return res.json(cached.data)
    res.status(500).json({ error: 'Failed to fetch weather' })
  }
})

export default router
