import { useEffect, useMemo, useRef, useState } from 'react'
import type { LngLat } from '../../types'
import { demo, networkPaths } from './demo'

const KEY = 'mediroute.preloaded'
const DURATION = 1900

export function shouldPreload(reduced: boolean) {
  if (reduced) return false
  try {
    return sessionStorage.getItem(KEY) !== '1'
  } catch {
    return true
  }
}

function toPath(coords: LngLat[], b: { x0: number; y0: number; sx: number; sy: number }) {
  return coords.map((c, i) => `${i ? 'L' : 'M'}${((c[0] - b.x0) * b.sx).toFixed(1)} ${((b.y0 - c[1]) * b.sy).toFixed(1)}`).join('')
}

/** The real Pune road network, from the committed OSRM routes, drawing itself. */
export function Preloader({ onDone }: { onDone: () => void }) {
  const [pct, setPct] = useState(0)
  const [phase, setPhase] = useState<'draw' | 'lit' | 'out'>('draw')
  const done = useRef(false)
  const cb = useRef(onDone)
  cb.current = onDone

  const { paths, corridor, w, h } = useMemo(() => {
    const all = networkPaths()
    const pts = all.flat()
    const lngs = pts.map((p) => p[0])
    const lats = pts.map((p) => p[1])
    const x0 = Math.min(...lngs)
    const x1 = Math.max(...lngs)
    const y0 = Math.max(...lats)
    const y1 = Math.min(...lats)
    const W = 1000
    const k = Math.cos((18.52 * Math.PI) / 180)
    const sx = W / (x1 - x0)
    const sy = sx / k
    const b = { x0, y0, sx, sy }
    return { paths: all.map((c) => toPath(c, b)), corridor: toPath(demo().route.geometry, b), w: W, h: (y0 - y1) * sy }
  }, [])

  const finish = () => {
    if (done.current) return
    done.current = true
    try {
      sessionStorage.setItem(KEY, '1')
    } catch {
      // Private mode: the preloader may show again next time. That is fine.
    }
    setPhase('out')
    setTimeout(() => cb.current(), 600)
  }

  useEffect(() => {
    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / DURATION)
      setPct(Math.round(p * 100))
      if (p < 1) raf = requestAnimationFrame(tick)
      else {
        setPhase('lit')
        setTimeout(finish, 350)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div
      className={`fixed inset-0 z-[200] cursor-pointer bg-paper transition-opacity duration-500 ease-out ${phase === 'out' ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      onClick={finish}
      role="progressbar"
      aria-label="Loading MediRoute"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg viewBox={`-20 -20 ${w + 40} ${h + 40}`} className="absolute inset-0 m-auto h-[70vh] w-[90vw]" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            pathLength={1}
            fill="none"
            stroke="#171717"
            strokeOpacity={0.55}
            strokeWidth={1}
            style={{ strokeDasharray: 1, strokeDashoffset: 1 - Math.min(1, Math.max(0, pct / 100 - (i % 8) * 0.04) * 1.35) }}
          />
        ))}
        <path
          d={corridor}
          pathLength={1}
          fill="none"
          stroke="#0B6B3A"
          strokeWidth={4}
          strokeLinecap="round"
          style={{ strokeDasharray: 1, strokeDashoffset: phase === 'draw' ? 1 : 0, transition: 'stroke-dashoffset 350ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-[18vh] px-4 md:px-6">
        <div className="flex items-end justify-between font-mono text-[12px] uppercase tracking-[0.06em]">
          <span className="text-[44px] leading-none tnum md:text-[64px]">{String(pct).padStart(2, '0')}%</span>
          <span className="text-ink-2">Pune road network, real routes</span>
        </div>
        <div className="mt-3 h-px w-full bg-line">
          <div className="h-px origin-left bg-ink" style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-2">Click to skip</p>
      </div>
    </div>
  )
}
