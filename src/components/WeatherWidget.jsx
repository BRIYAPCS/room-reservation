import { useState, useEffect } from 'react'
import { getWeather } from '../services/api'
import './WeatherWidget.css'

// "Washington, DC" → "DC"  |  "Silver Spring" → "SS"  |  "Chicago" → "Chic"
function abbreviateCity(city) {
  if (!city) return '?'
  const afterComma = city.split(',')[1]?.trim()
  if (afterComma) return afterComma
  const words = city.trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 4)
  return words.map(w => w[0].toUpperCase()).join('')
}

// Map condition label → animation type
function getAnimType(condition) {
  const c = (condition || '').toLowerCase()
  if (c.includes('thunder') || c.includes('storm')) return 'storm'
  if (c.includes('snow') || c.includes('icy'))      return 'snow'
  if (c.includes('drizzle'))                        return 'drizzle'
  if (c.includes('rain') || c.includes('shower'))   return 'rain'
  if (c.includes('fog'))                            return 'fog'
  if (c.includes('clear') || c.includes('sunny'))   return 'sunny'
  return 'cloudy'
}

// Pre-computed particle data — stable arrays, no randomness on re-render
const RAIN_DROPS = Array.from({ length: 14 }, (_, i) => ({
  left:  `${(i * 7 + 3) % 94}%`,
  delay: `${((i * 0.17) % 1.4).toFixed(2)}s`,
  dur:   `${(0.55 + (i * 0.06) % 0.35).toFixed(2)}s`,
  h:     `${13 + (i * 4) % 11}px`,
}))

const SNOW_FLAKES = Array.from({ length: 12 }, (_, i) => ({
  left:  `${(i * 8 + 2) % 92}%`,
  delay: `${((i * 0.22) % 2).toFixed(2)}s`,
  dur:   `${(1.8 + (i * 0.15) % 1).toFixed(2)}s`,
  size:  `${6 + (i * 2) % 6}px`,
}))

const FOG_BANDS = [
  { top: '20%', delay: '0s',    dur: '2.8s' },
  { top: '42%', delay: '0.6s',  dur: '3.4s' },
  { top: '62%', delay: '1.1s',  dur: '2.5s' },
  { top: '80%', delay: '0.3s',  dur: '3.1s' },
]

const CLOUD_SHAPES = [
  { w: '58%', top: '10%', left: '-8%',  delay: '0s',   dur: '3.8s' },
  { w: '44%', top: '45%', left: '55%',  delay: '1.2s', dur: '4.5s' },
  { w: '36%', top: '70%', left: '18%',  delay: '0.5s', dur: '3.2s' },
]

function AnimOverlay({ type }) {
  const isRain    = type === 'rain' || type === 'drizzle' || type === 'storm'
  const dropCount = type === 'drizzle' ? 7 : 14

  return (
    <div className={`wx-anim-overlay wx-anim--${type}`}>

      {/* Rain / Drizzle / Storm drops */}
      {isRain && RAIN_DROPS.slice(0, dropCount).map((d, i) => (
        <span key={i} className="wx-drop"
          style={{ left: d.left, animationDelay: d.delay, animationDuration: d.dur, height: d.h }}
        />
      ))}

      {/* Storm lightning */}
      {type === 'storm' && <div className="wx-lightning" />}

      {/* Snow flakes */}
      {type === 'snow' && SNOW_FLAKES.map((f, i) => (
        <span key={i} className="wx-flake"
          style={{ left: f.left, animationDelay: f.delay, animationDuration: f.dur, width: f.size, height: f.size }}
        />
      ))}

      {/* Sunny — central glow + rotating rays */}
      {type === 'sunny' && (
        <div className="wx-sun">
          <div className="wx-sun-core" />
          <div className="wx-sun-rays" />
        </div>
      )}

      {/* Cloudy — drifting blobs */}
      {type === 'cloudy' && CLOUD_SHAPES.map((c, i) => (
        <div key={i} className="wx-cloud"
          style={{ width: c.w, top: c.top, left: c.left, animationDelay: c.delay, animationDuration: c.dur }}
        />
      ))}

      {/* Fog — horizontal drifting bands */}
      {type === 'fog' && FOG_BANDS.map((b, i) => (
        <div key={i} className="wx-fog-band"
          style={{ top: b.top, animationDelay: b.delay, animationDuration: b.dur }}
        />
      ))}

    </div>
  )
}

export default function WeatherWidget() {
  const [weather, setWeather] = useState(null)
  const [error,   setError]   = useState(false)
  const [phase,   setPhase]   = useState('idle') // 'idle' | 'anim' | 'data'

  useEffect(() => {
    // Fetch immediately on mount (covers page reload)
    getWeather().then(setWeather).catch(() => setError(true))

    // Refresh every 10 minutes — re-triggers animation on new data
    const interval = setInterval(() => {
      getWeather().then(setWeather).catch(() => {})
    }, 10 * 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  // Each time weather data arrives, play animation then show data
  useEffect(() => {
    if (!weather) return
    setPhase('anim')
    const t = setTimeout(() => setPhase('data'), 2600)
    return () => clearTimeout(t)
  }, [weather])

  if (error || !weather) return null

  const animType = getAnimType(weather.condition)

  return (
    <div className={`weather-widget weather-widget--${animType}`}>

      {/* ── Animation scene — plays for 2.6s on load and each refresh ── */}
      <div className={`wx-scene ${phase === 'anim' ? 'wx-scene--visible' : ''}`}>
        <AnimOverlay type={animType} />
        <div className="wx-scene-label">
          <span className="wx-scene-icon">{weather.icon}</span>
          <span className="wx-scene-temp">{weather.temp}°F</span>
        </div>
      </div>

      {/* ── Data display — fades in after animation ── */}
      <div className={`wx-data ${phase === 'data' ? 'wx-data--visible' : ''}`}>

        {/* Compact pill (mobile) */}
        <div className="weather-compact">
          <span className="weather-icon">{weather.icon}</span>
          <span className="weather-compact-city">{abbreviateCity(weather.city)}</span>
          <span className="weather-compact-temp">{weather.temp}°F</span>
        </div>

        {/* Full card (desktop) */}
        <div className="weather-full">
          <span className="weather-icon">{weather.icon}</span>
          <div className="weather-info">
            <span className="weather-city">{weather.city}</span>
            <span className="weather-temp">{weather.temp}°F</span>
            <span className="weather-condition">{weather.condition}</span>
          </div>
          <div className="weather-details">
            <span>Feels {weather.feelsLike}°F</span>
            <span>💧 {weather.humidity}%</span>
            <span>💨 {weather.windSpeed} mph</span>
          </div>
        </div>

      </div>
    </div>
  )
}
