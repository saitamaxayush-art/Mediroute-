/**
 * Runs the simulation for every page. Started once at the app root. Exactly one tab drives it:
 * the one holding the Web Lock. A hidden tab hands the lock on so a visible tab keeps the trip moving.
 * The leader broadcasts positions about 10 times a second; other tabs interpolate.
 */
import { along } from '../engine/geo'
import { mmss } from '../engine/text'
import { commit, get, holdRemainingS, selCase, selTrip, setLocal, useAppStore, type Op } from '../store/appStore'
import type { CompletedTrip, LiveSignal, Trip } from '../types'
import { polylineOf, stepTrip, type Work } from './step'

/** Ambulance position read by maps every frame. Exact in the leader tab, smoothed elsewhere. */
export const live = { routeKey: '', progressM: 0, exact: false, tripId: '' }

const LOCK = 'mediroute-sim-leader'
let started = false
let work: Work | null = null
const caseClock: Record<string, number> = {}

function becomeLeader() {
  work = null
  setLocal({ isLeader: true })
}

let releaseLock: (() => void) | null = null
let pending: AbortController | null = null

function requestLeadership() {
  if (releaseLock || pending) return
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!locks) {
    becomeLeader()
    return
  }
  pending = new AbortController()
  locks
    .request(LOCK, { signal: pending.signal }, () => {
      pending = null
      becomeLeader()
      return new Promise<void>((resolve) => {
        releaseLock = () => {
          releaseLock = null
          setLocal({ isLeader: false })
          resolve()
        }
      })
    })
    .catch(() => {
      // Aborted while queued because the tab was hidden.
      pending = null
    })
}

function onVisibility() {
  if (document.hidden) {
    pending?.abort()
    pending = null
    // Push the latest position before handing over, so the next leader starts where this one stopped.
    flushTick(true)
    releaseLock?.()
  } else requestLeadership()
}

let lastTick = 0
let pendingTrack: [number, number, number][] = []
let lastTrackT = -10

function flushTick(force = false) {
  const s = get()
  if (!s.isLeader) return
  const now = performance.now()
  if (!force && now - lastTick < 100) return
  lastTick = now
  const ops: Op[] = []
  const c = selCase(s)
  if (c && caseClock[c.id] !== undefined && Math.abs(caseClock[c.id] - c.simElapsedS) > 0.05) ops.push({ op: 'merge', key: 'cases', id: c.id, value: { simElapsedS: caseClock[c.id] } })
  const t = selTrip(s)
  if (t && work && work.tripId === t.id && t.status === 'enroute') {
    ops.push({
      op: 'merge',
      key: 'trips',
      id: t.id,
      ifRouteKey: work.routeKey,
      value: { progressM: work.progressM, simT: work.simT, waitedS: work.waitedS, waitUntil: work.waitUntil, waitingAt: work.waitingAt },
    })
    if (pendingTrack.length) {
      ops.push({ op: 'append', id: t.id, value: pendingTrack })
      pendingTrack = []
    }
  }
  if (ops.length) commit({ type: 'sim/tick', actor: 'system', ops })
}

function complete(t: Trip, w: Work) {
  const s = get()
  const h = s.hospitals.find((x) => x.id === t.hospitalId)
  const c = s.cases[t.caseId]
  const end = t.route.geometry[t.route.geometry.length - 1]
  const finalTrip: Trip = { ...t, progressM: w.progressM, simT: w.simT, waitedS: w.waitedS, status: 'arrived', arrivedSimT: w.simT, waitingAt: null, track: [...t.track, ...pendingTrack, [w.simT, end[0], end[1]]] }
  pendingTrack = []
  const signals: LiveSignal[] = [...t.pastSignalIds, ...t.signalIds].map((id) => s.signals[id]).filter(Boolean)
  const greens = signals.filter((x) => x.greenAt !== null).length
  const normalTotal = w.simT - w.waitedS + signals.length * 45
  const golden = c ? 3600 - (caseClock[c.id] ?? c.simElapsedS) : 0
  const done: CompletedTrip = {
    id: t.id,
    label: c ? `${c.id}, ${c.locationLabel}` : t.caseId,
    hospitalName: h?.name ?? t.hospitalId,
    injury: c ? `${c.injuryClass.replace('_', ' ')}, GCS ${c.gcs}` : '',
    route: t.route,
    eta: t.eta,
    signals,
    track: finalTrip.track,
    reroutes: t.reroutes,
    durationS: w.simT,
    maxHoldS: Math.max(0, ...signals.map((x) => x.crossTrafficHeldSeconds)),
    minutesSaved: Math.max(0, (normalTotal - w.simT) / 60),
    sample: false,
  }
  const ops: Op[] = [
    { op: 'put', key: 'trips', id: t.id, value: finalTrip },
    { op: 'mergeItem', key: 'hospitals', id: t.hospitalId, value: { bedHold: null } },
    { op: 'mergeItem', key: 'ambulances', id: t.ambulanceId, value: { status: 'available' } },
    { op: 'push', key: 'completedTrips', value: done, cap: 12 },
  ]
  if (c) ops.push({ op: 'merge', key: 'cases', id: c.id, value: { frozen: true, simElapsedS: caseClock[c.id] ?? c.simElapsedS } })
  commit({
    type: 'trip/arrive',
    actor: 'system',
    ops,
    log: { kind: 'arrival', text: `${t.ambulanceId} arrived at ${h?.name}. Held ICU bed now occupied. Golden hour left: ${mmss(golden)}. Signals cleared: ${greens}` },
    notify: { roles: ['operator', 'paramedic', 'hospital'], text: `Arrived at ${h?.name} with ${mmss(golden)} of the golden hour left`, tone: 'ok' },
  })
}

let lastHoldCheck = 0
function checkHolds() {
  const s = get()
  for (const h of s.hospitals) {
    const left = holdRemainingS(s, h)
    if (left !== null && left <= 0) {
      commit({
        type: 'bed/expire',
        actor: 'system',
        ops: [{ op: 'mergeItem', key: 'hospitals', id: h.id, value: { bedHold: null, beds: { ...h.beds, icu: h.beds.icu + 1 } } }],
        log: { kind: 'bed', text: `Bed hold at ${h.name} expired and was released` },
        notify: { roles: ['operator', 'hospital'], text: `Bed hold at ${h.name} expired`, tone: 'warn', hospitalId: undefined },
      })
    }
  }
}

function frame(dtReal: number) {
  const s = get()
  if (!s.isLeader) return
  const now = performance.now()
  if (now - lastHoldCheck > 1000) {
    lastHoldCheck = now
    checkHolds()
  }
  if (!s.settings.playing) return
  const dt = dtReal * s.settings.speed
  const c = selCase(s)
  if (c && !c.frozen) caseClock[c.id] = Math.max(caseClock[c.id] ?? 0, c.simElapsedS) + dt
  const t = selTrip(s)
  if (t && t.status === 'enroute') {
    // Adopt the store's state when the trip or its route changed (dispatch, re-route, takeover).
    if (!work || work.tripId !== t.id || work.routeKey !== t.routeKey) {
      work = { tripId: t.id, routeKey: t.routeKey, progressM: t.progressM, simT: t.simT, waitedS: t.waitedS, waitUntil: t.waitUntil, waitingAt: t.waitingAt }
      pendingTrack = []
    }
    const out = stepTrip(work, t, s.signals, s.settings, dt)
    live.tripId = t.id
    live.routeKey = t.routeKey
    live.progressM = work.progressM
    live.exact = true
    const ops: Op[] = Object.entries(out.patches).map(([id, value]) => ({ op: 'merge', key: 'signals', id, value }) as Op)
    if (ops.length || out.logs.length) {
      const cap = out.capReleased.map((id) => get().signals[id]?.code).filter(Boolean)
      commit({
        type: 'signal/auto',
        actor: 'system',
        ops,
        logs: out.logs.map((text) => ({ kind: 'signal' as const, text })),
        notify: cap.length ? { roles: ['operator'], text: `${cap.join(', ')} released: cross-traffic cap reached`, tone: 'warn' } : undefined,
      })
    }
    if (out.waitingStarted) flushTick(true)
    if (work.simT - lastTrackT >= 2) {
      lastTrackT = work.simT
      const p = along(polylineOf(t.route), work.progressM).p
      pendingTrack.push([Math.round(work.simT * 10) / 10, p[0], p[1]])
    }
    if (out.arrived) {
      complete(t, work)
      work = null
      return
    }
  } else if (t && work?.tripId === t.id) {
    work = null
  }
  flushTick()
}

/** Followers keep the shared position current from store updates. */
function follow() {
  const s = get()
  const t = selTrip(s)
  if (!t || s.isLeader) return
  live.tripId = t.id
  live.routeKey = t.routeKey
  live.progressM = t.progressM
  live.exact = false
}

export function startSimulation() {
  if (started || typeof window === 'undefined') return
  started = true
  useAppStore.subscribe(follow)
  follow()
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', () => flushTick(true))
  if (!document.hidden) requestLeadership()
  let prev = performance.now()
  const loop = (ts: number) => {
    requestAnimationFrame(loop)
    const dt = Math.min(0.1, Math.max(0, (ts - prev) / 1000))
    prev = ts
    frame(dt)
  }
  requestAnimationFrame(loop)
}
