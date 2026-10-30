import { Pause, Play } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'
import { AppShell } from '../components/AppShell'
import { Chip } from '../components/ui'
import { SIM } from '../config/simulation'
import { along, haversine } from '../engine/geo'
import { computeEta } from '../engine/route'
import { mins, mmss } from '../engine/text'
import { usePageMeta } from '../hooks/hooks'
import { BaseMap } from '../map/BaseMap'
import { BlockedRoad, SignalMarker } from '../map/markers'
import { RouteRunner } from '../map/RouteRunner'
import { presetRoutes } from '../services/routing'
import { makeSignals, polylineOf, stepTrip, type Work } from '../sim/step'
import { defaultSettings, useAppStore } from '../store/appStore'
import type { CompletedTrip, LiveSignal, LngLat, RouteData, SignalState, Trip } from '../types'

/** Runs the real simulation offline to make sample trips for the replay list. */
function simulateSample(id: string, label: string, presetId: string, hospitalId: string, hospitalName: string, injury: string): CompletedTrip | null {
  const route = presetRoutes(presetId, hospitalId)[0]
  if (!route) return null
  const sigs = makeSignals(id, id, route)
  const map: Record<string, LiveSignal> = Object.fromEntries(sigs.map((g) => [g.id, g]))
  const t: Trip = {
    id,
    caseId: id,
    hospitalId,
    ambulanceId: 'ALS-02',
    route,
    altRoute: null,
    eta: computeEta(route),
    simT: 0,
    progressM: 0,
    status: 'enroute',
    corridor: 'active',
    signalIds: sigs.map((g) => g.id),
    pastSignalIds: [],
    reroutes: 0,
    arrivedSimT: null,
    track: [[0, route.geometry[0][0], route.geometry[0][1]]],
    waitedS: 0,
    waitUntil: 0,
    waitingAt: null,
    routeKey: id,
  }
  const w: Work = { tripId: id, routeKey: id, progressM: 0, simT: 0, waitedS: 0, waitUntil: 0, waitingAt: null }
  const settings = defaultSettings()
  const pl = polylineOf(route)
  let last = 0
  for (let i = 0; i < 20000; i++) {
    const out = stepTrip(w, t, map, settings, 0.5)
    for (const [sid, p] of Object.entries(out.patches)) map[sid] = { ...map[sid], ...p }
    t.simT = w.simT
    t.progressM = w.progressM
    if (w.simT - last >= 2) {
      last = w.simT
      const p = alongFast(pl, w.progressM)
      t.track.push([w.simT, p[0], p[1]])
    }
    if (out.arrived) break
  }
  const end = route.geometry[route.geometry.length - 1]
  t.track.push([w.simT, end[0], end[1]])
  const signals = sigs.map((g) => map[g.id])
  return {
    id,
    label,
    hospitalName,
    injury,
    route,
    eta: t.eta,
    signals,
    track: t.track,
    reroutes: 0,
    durationS: w.simT,
    maxHoldS: Math.max(0, ...signals.map((g) => g.crossTrafficHeldSeconds)),
    minutesSaved: (t.eta.normalS - w.simT) / 60,
    sample: true,
  }
}

const alongFast = (pl: ReturnType<typeof polylineOf>, d: number) => along(pl, d).p

let samples: CompletedTrip[] | null = null
function sampleTrips() {
  if (!samples)
    samples = [
      simulateSample('SAMPLE-A', 'Yerawada, Airport Road', 'p-yerawada', 'h-vimannagar', 'Eastside Heart and Neuro Institute', 'heart attack'),
      simulateSample('SAMPLE-B', 'Nal Stop, Karve Road', 'p-nalstop', 'h-swargate', 'Southgate Civic Hospital', 'major bleeding'),
    ].filter((x): x is CompletedTrip => !!x)
  return samples
}

/** Builds a drawable path and a time-to-distance lookup from the recorded track. */
function trackPath(trip: CompletedTrip) {
  const coords: LngLat[] = []
  const times: number[] = []
  const dist: number[] = []
  let d = 0
  for (const [t, x, y] of trip.track) {
    const p: LngLat = [x, y]
    if (coords.length) {
      const step = haversine(coords[coords.length - 1], p)
      if (step < 0.5 && t - times[times.length - 1] < 1) continue
      d += step
    }
    coords.push(p)
    times.push(t)
    dist.push(d)
  }
  const route: RouteData = { geometry: coords.length > 1 ? coords : [...coords, ...coords], distance: d, osrmDuration: trip.durationS, signals: [], source: 'preset' }
  const distAt = (t: number) => {
    if (t <= times[0]) return 0
    for (let i = 1; i < times.length; i++) {
      if (times[i] >= t) {
        const f = (t - times[i - 1]) / (times[i] - times[i - 1] || 1)
        return dist[i - 1] + (dist[i] - dist[i - 1]) * f
      }
    }
    return d
  }
  return { route, distAt }
}

function stateAt(s: LiveSignal, t: number): SignalState {
  if (s.releasedAt !== null && t >= s.releasedAt) return 'RELEASED'
  if (s.greenAt !== null && t >= s.greenAt) return 'GREEN_FOR_AMBULANCE'
  if (s.armedAt !== null && t >= s.armedAt) return 'ARMED'
  return 'NORMAL'
}

const SOURCE: Record<LiveSignal['source'], string> = { auto: 'Auto', operator: 'Operator', request: 'Paramedic request' }

export default function Replay() {
  usePageMeta('Corridor replay | MediRoute', 'Replay completed ambulance trips junction by junction: holds, re-routes and simulated time saved.')
  const completed = useAppStore((s) => s.completedTrips)
  const blockedAll = useAppStore((s) => s.blockedRoads)
  const trips = useMemo(() => [...completed, ...sampleTrips()], [completed])
  const [sel, setSel] = useState(trips[0]?.id)
  const trip = trips.find((t) => t.id === sel) ?? trips[0]
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(10)
  const tRef = useRef(0)
  const mapRef = useRef<MapRef>(null)
  const path = useMemo(() => (trip ? trackPath(trip) : null), [trip])

  useEffect(() => {
    tRef.current = 0
    setT(0)
    setPlaying(true)
    const g = trip?.route.geometry
    if (g && mapRef.current) {
      const lngs = g.map((p) => p[0])
      const lats = g.map((p) => p[1])
      mapRef.current.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 50, duration: 800 })
    }
  }, [trip])

  useEffect(() => {
    if (!playing || !trip) return
    let raf = 0
    let prev = performance.now()
    let lastSet = 0
    const f = (ts: number) => {
      raf = requestAnimationFrame(f)
      tRef.current = Math.min(trip.durationS, tRef.current + ((ts - prev) / 1000) * speed)
      prev = ts
      if (ts - lastSet > 100) {
        lastSet = ts
        setT(tRef.current)
      }
      if (tRef.current >= trip.durationS) {
        setT(trip.durationS)
        setPlaying(false)
      }
    }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, trip])

  if (!trip || !path) return null
  const greens = trip.signals.filter((s) => s.greenAt !== null).length
  const blocked = blockedAll.filter((b) => b.tripId === trip.id)
  const g = trip.route.geometry

  return (
    <AppShell>
      <div className="grid lg:grid-cols-[300px_1fr]">
        <aside className="border-b border-line lg:border-b-0 lg:border-r" aria-label="Completed trips">
          <p className="border-b border-line px-4 py-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">Completed trips ({trips.length})</p>
          <ul>
            {trips.map((x) => (
              <li key={x.id}>
                <button type="button" onClick={() => setSel(x.id)} aria-pressed={x.id === trip.id} className={`block w-full border-b border-line px-4 py-3 text-left ${x.id === trip.id ? 'bg-white' : 'hover:bg-paper-2'}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-[0.06em]">{x.id}</span>
                    <Chip tone={x.sample ? 'muted' : 'green'}>{x.sample ? 'Sample' : 'This session'}</Chip>
                  </span>
                  <span className="mt-1 block text-[14px] font-medium">{x.hospitalName}</span>
                  <span className="block text-[12px] text-ink-2">
                    {x.label}, {x.injury}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <main className="min-w-0">
          <div className="grid grid-cols-2 gap-4 p-4 md:grid-cols-4 md:p-6">
            {[
              ['Signals cleared', `${greens} / ${trip.signals.length}`],
              ['Minutes saved vs normal', trip.minutesSaved.toFixed(1)],
              ['Max cross-traffic hold', `${Math.round(trip.maxHoldS)}s, cap ${SIM.holdCapS}s`],
              ['Re-routes, blocked roads', `${trip.reroutes}, ${blocked.length}`],
            ].map(([k, v]) => (
              <div key={k} className="card p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-2">{k}</p>
                <p className="mt-1 font-mono text-[22px] font-medium text-route tnum">{v}</p>
                <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-ink-2">Simulated</p>
              </div>
            ))}
          </div>
          <div className="relative mx-4 h-[52vh] min-h-[360px] overflow-hidden rounded-[4px] border border-line md:mx-6">
            <BaseMap mapRef={mapRef} center={g[Math.floor(g.length / 2)]} zoom={13} label="Replay map">
              <RouteRunner key={trip.id} id="replay" route={path.route} routeKey={trip.id} progress={() => path.distAt(tRef.current)} lights={() => tRef.current < trip.durationS} />
              {blocked.map((b) => (
                <BlockedRoad key={b.id} id={`rp-${b.id}`} coords={b.coords} />
              ))}
              {trip.signals.map((s) => (
                <SignalMarker key={`${trip.id}-${s.id}`} lngLat={[s.lng, s.lat]} heading={s.heading} name={s.name} code={s.code} state={stateAt(s, t)} timer={stateAt(s, t) === 'GREEN_FOR_AMBULANCE' && s.greenAt !== null ? `HOLD ${Math.round(Math.min(s.crossTrafficHeldSeconds, t - s.greenAt))}s` : null} />
              ))}
            </BaseMap>
          </div>
          <div className="flex flex-wrap items-center gap-3 px-4 py-4 md:px-6">
            <button
              type="button"
              onClick={() => {
                if (tRef.current >= trip.durationS) tRef.current = 0
                setPlaying((p) => !p)
              }}
              aria-label={playing ? 'Pause' : 'Play'}
              className="grid h-10 w-10 place-items-center rounded-[4px] bg-route text-white"
            >
              {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
            </button>
            <label className="flex min-w-[200px] flex-1 items-center gap-3">
              <span className="sr-only">Scrub replay</span>
              <input
                type="range"
                min={0}
                max={trip.durationS}
                step={0.5}
                value={t}
                onChange={(e) => {
                  tRef.current = Number(e.target.value)
                  setT(tRef.current)
                }}
                className="w-full"
              />
            </label>
            <span className="font-mono text-[13px] tnum">
              {mmss(t)} / {mmss(trip.durationS)}
            </span>
            <div className="flex gap-1 rounded-[4px] border border-line bg-white p-1" role="radiogroup" aria-label="Replay speed">
              {[1, 4, 10].map((s) => (
                <button key={s} type="button" role="radio" aria-checked={speed === s} onClick={() => setSpeed(s)} className={`h-9 w-12 rounded-[3px] font-mono text-[13px] ${speed === s ? 'bg-route-soft text-route' : 'hover:text-route'}`}>
                  {s}x
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto px-4 pb-6 md:px-6">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
              Junctions. Corridor ETA {mins(trip.eta.corridorS)}, normal {mins(trip.eta.normalS)} (simulated)
            </p>
            <table className="w-full min-w-[860px] border border-line bg-white text-left text-[14px]">
              <thead className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-2">
                <tr className="border-b border-line">
                  <th className="p-2.5">Junction</th>
                  <th className="p-2.5">Source</th>
                  <th className="p-2.5">Commands</th>
                  <th className="p-2.5">Armed</th>
                  <th className="p-2.5">Green</th>
                  <th className="p-2.5">Released</th>
                  <th className="p-2.5">Cross-traffic hold</th>
                  <th className="p-2.5">Now</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[12px] tnum">
                {trip.signals.map((s, i) => (
                  <tr key={`${s.id}-${i}`} className="border-b border-line last:border-b-0">
                    <td className="p-2.5 font-sans text-[14px]">
                      {s.code} {s.name}
                    </td>
                    <td className="p-2.5 font-sans text-[13px]">{SOURCE[s.source]}</td>
                    <td className="p-2.5 font-sans text-[12px] leading-snug">
                      {s.history.length ? s.history.map((h, k) => <span key={k} className="block">{mmss(h.simT)} {h.advised ? 'advised: ' : ''}{h.cmd.toLowerCase()} ({h.by})</span>) : 'none'}
                    </td>
                    <td className="p-2.5">{s.armedAt !== null ? mmss(s.armedAt) : 'n/a'}</td>
                    <td className="p-2.5">{s.greenAt !== null ? mmss(s.greenAt) : 'n/a'}</td>
                    <td className="p-2.5">{s.releasedAt !== null ? mmss(s.releasedAt) : 'n/a'}</td>
                    <td className={`p-2.5 ${s.capHit ? 'text-signal' : ''}`}>
                      {Math.round(s.crossTrafficHeldSeconds)}s{s.capHit ? ', cap forced release' : ''}
                    </td>
                    <td className="p-2.5">
                      <Chip tone={stateAt(s, t) === 'GREEN_FOR_AMBULANCE' ? 'green' : stateAt(s, t) === 'ARMED' ? 'amber' : 'muted'}>{stateAt(s, t).replace(/_/g, ' ')}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </AppShell>
  )
}
