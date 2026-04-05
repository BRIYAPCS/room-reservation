import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ConfigProvider } from './context/ConfigContext'
import HomePage from './pages/HomePage'
import PageTransition from './components/PageTransition'

// Lazy-load heavy pages — FullCalendar (~500 KB) only downloads when CalendarPage is visited
const RoomsPage    = lazy(() => import('./pages/RoomsPage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <PageTransition key={location.pathname}>
      {/* Fallback is an unstyled blank div — PageTransition CSS handles the visual fade */}
      <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
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
