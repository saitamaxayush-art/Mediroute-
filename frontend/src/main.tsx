import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Development only: lets the cross-tab acceptance test read state and the live position.
if (import.meta.env.DEV) {
  Promise.all([import('./store/appStore'), import('./sim/simulationService')]).then(([store, sim]) => {
    ;(window as unknown as { __mr: unknown }).__mr = { get: store.get, live: sim.live }
  })
}
