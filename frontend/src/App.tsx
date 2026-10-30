import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Toasts } from './components/Toasts'
import { startSimulation } from './sim/simulationService'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import NotFound from './pages/NotFound'

const Landing = lazy(() => import('./pages/landing/Landing'))
const Console = lazy(() => import('./pages/console/Console'))
const Paramedic = lazy(() => import('./pages/Paramedic'))
const HospitalPage = lazy(() => import('./pages/Hospital'))
const Replay = lazy(() => import('./pages/Replay'))

function ScrollReset() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

function Fallback() {
  return <div className="grid min-h-screen place-items-center bg-paper font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">Loading</div>
}

// One simulation for the whole app: page navigation never pauses or restarts a trip.
startSimulation()

export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ScrollReset />
      <Suspense fallback={<Fallback />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/console" element={<Console />} />
          <Route path="/paramedic" element={<Paramedic />} />
          <Route path="/hospital" element={<HospitalPage />} />
          <Route path="/replay" element={<Replay />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <Toasts />
    </BrowserRouter>
  )
}
