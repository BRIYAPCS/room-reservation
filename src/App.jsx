import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ConfigProvider } from './context/ConfigContext'
import PageTransition from './components/PageTransition'

// Lazy-load all pages — nothing is bundled into the initial JS chunk except
// the router shell. Each page downloads only when the user navigates to it.
const HomePage     = lazy(() => import('./pages/HomePage'))
const RoomsPage    = lazy(() => import('./pages/RoomsPage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <PageTransition key={location.pathname}>
      <Suspense fallback={
        <div style={{
          minHeight: '100vh',
          background: '#1186c4',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <img
            src={`${import.meta.env.BASE_URL}briya_logo.png`}
            alt="Loading…"
            style={{ width: 64, height: 64, opacity: 0.9, animation: 'spin 1.2s linear infinite' }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      }>
        <Routes location={location}>
          <Route path="/" element={<HomePage />} />
          <Route path="/rooms/:siteId" element={<RoomsPage />} />
          <Route path="/calendar/:siteId/:roomId" element={<CalendarPage />} />
        </Routes>
      </Suspense>
    </PageTransition>
  )
}

// Matches VITE_BASE_PATH in .env.production (e.g. /room-reservation/)
// Falls back to '/' in dev so the proxy works normally
const basename = import.meta.env.BASE_URL || '/'

export default function App() {
  return (
    <ConfigProvider>
      <AuthProvider>
        <BrowserRouter basename={basename}>
          <AnimatedRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ConfigProvider>
  )
}
