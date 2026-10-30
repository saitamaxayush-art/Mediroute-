import { SIM } from '../config/simulation'
import { makePolyline, type Polyline } from '../engine/geo'
import type { Approach, LiveSignal, RouteData, Trip } from '../types'
import type { Settings } from '../store/appStore'

const cache = new WeakMap<RouteData, Polyline>()
export function polylineOf(r: RouteData): Polyline {
  let pl = cache.get(r)
  if (!pl) {
    pl = makePolyline(r.geometry)
    cache.set(r, pl)
  }
  return pl
}

const DIRS: Approach[] = ['N', 'E', 'S', 'W']
/** The approach the ambulance enters from is opposite its direction of travel. */
export const approachOf = (heading: number): Approach => DIRS[Math.round(((heading + 180) % 360) / 90) % 4]

export function makeSignals(tripId: string, routeKey: string, r: RouteData): LiveSignal[] {
  return r.signals.map((s) => ({
    id: `${routeKey}|${s.id}`,
    code: s.id,
    tripId,
    routeKey,
    name: s.name,
    lat: s.loc[1],
    lng: s.loc[0],
    distanceAlongRoute: s.at,
    heading: s.heading,
    ambulanceApproach: approachOf(s.heading),
    state: 'NORMAL',
    source: 'auto',
    advised: null,
    holdStartedAt: null,
    crossTrafficHeldSeconds: 0,
    capHit: false,
    extended: false,
    waited: false,
    armedAt: null,
    greenAt: null,
    releasedAt: null,
    releasedFlashUntil: null,
    lastCommandBy: null,
    lastCommandAt: null,
    history: [],
  }))
}

/**
 * Still in front of the ambulance. A signal it is stopped at sits exactly at its position,
 * so a small tolerance keeps that signal "next" rather than "passed".
 */
export const isAhead = (g: Pick<LiveSignal, 'distanceAlongRoute' | 'state'>, t: Pick<Trip, 'progressM'>) => g.state !== 'RELEASED' && g.distanceAlongRoute >= t.progressM - 0.5

/** Seconds the three other approaches have been held red. */
export const heldSeconds = (s: LiveSignal, t: Pick<Trip, 'simT'>) =>
  s.state === 'GREEN_FOR_AMBULANCE' && s.holdStartedAt !== null ? Math.max(0, t.simT - s.holdStartedAt) : s.crossTrafficHeldSeconds

export const capOf = (s: LiveSignal, holdCap: number) => holdCap + (s.extended ? 20 : 0)

/** Deterministic normal-cycle red wait per junction, averaging SIM.signalWaitS. */
/** Wait-until value for a held red: survives JSON, unlike Infinity. */
export const HELD = 1e12

const redWait = (i: number) => SIM.signalWaitS + ((i * 37) % 31) - 15

/** Cruise speed so a clean corridor run matches the corridor ETA. */
export const cruiseSpeed = (r: RouteData) => r.distance / Math.max(1, r.osrmDuration * SIM.peakTrafficFactor)

export const corridorLive = (t: Trip, st: Settings) => t.corridor === 'active' && !st.advisory && !st.signalLinkLost

/** Kinematic state the simulation tab advances every frame and broadcasts at 10 Hz. */
export interface Work {
  tripId: string
  routeKey: string
  progressM: number
  simT: number
  waitedS: number
  waitUntil: number
  waitingAt: string | null
}

export interface StepOut {
  patches: Record<string, Partial<LiveSignal>>
  logs: string[]
  capReleased: string[]
  waitingStarted: string | null
  arrived: boolean
}

/**
 * Advances a trip by dt simulated seconds. Mutates `w`; returns signal changes to commit.
 * Signals are read fresh from the store each frame, so operator commands apply at once.
 */
export function stepTrip(w: Work, t: Trip, signals: Record<string, LiveSignal>, st: Settings, dt: number): StepOut {
  const out: StepOut = { patches: {}, logs: [], capReleased: [], waitingStarted: null, arrived: false }
  const pl = polylineOf(t.route)
  const sigs = t.signalIds.map((id) => ({ ...signals[id], ...out.patches[id] })).filter((s) => s.id)
  const patch = (s: LiveSignal, p: Partial<LiveSignal>) => {
    out.patches[s.id] = { ...out.patches[s.id], ...p }
    Object.assign(s, p)
  }
  w.simT += dt
  const p = w.progressM
  const live = corridorLive(t, st)

  // Auto corridor: arm the next junctions and turn the approach green within range.
  if (live && st.corridorMode === 'auto') {
    let n = 0
    for (const s of sigs) {
      if (s.distanceAlongRoute < p - 1 || s.state === 'RELEASED') continue
      if (n++ >= SIM.armAhead) break
      if (s.state === 'NORMAL') {
        patch(s, { state: 'ARMED', armedAt: w.simT, source: 'auto' })
        out.logs.push(`${s.code} ${s.name}: ARMED`)
      }
      if (s.state === 'ARMED' && s.distanceAlongRoute - p <= SIM.greenAtM) {
        patch(s, { state: 'GREEN_FOR_AMBULANCE', greenAt: w.simT, holdStartedAt: w.simT, source: 'auto' })
        out.logs.push(`${s.code} ${s.name}: GREEN for the ambulance approach (${s.ambulanceApproach}), cross traffic red`)
      }
    }
  }

  // Cross-traffic cap.
  for (const s of sigs) {
    if (s.state !== 'GREEN_FOR_AMBULANCE' || s.holdStartedAt === null) continue
    const held = w.simT - s.holdStartedAt
    if (held >= capOf(s, st.holdCap)) {
      patch(s, { state: 'RELEASED', capHit: true, releasedAt: w.simT, crossTrafficHeldSeconds: capOf(s, st.holdCap), releasedFlashUntil: Date.now() + 3000, holdStartedAt: null })
      out.logs.push(`${s.code} ${s.name}: cross-traffic cap of ${capOf(s, st.holdCap)}s reached, released`)
      out.capReleased.push(s.id)
    }
  }

  // Stopped at a light.
  if (w.waitingAt) {
    const s = sigs.find((x) => x.id === w.waitingAt)
    if (!s) w.waitingAt = null
    else if (s.state === 'GREEN_FOR_AMBULANCE') w.waitingAt = null
    else if (s.state !== 'RED_HOLD' && w.simT >= w.waitUntil) {
      patch(s, { waited: true })
      w.waitingAt = null
    } else {
      w.waitedS += dt
      return out
    }
  }

  const v0 = cruiseSpeed(t.route)
  let factor = 1
  for (const tp of pl.turns) {
    if (tp > p && tp - p < SIM.slowZoneM) {
      factor = SIM.slowFactor
      break
    }
  }
  for (const s of sigs) {
    const d = s.distanceAlongRoute - p
    if (d > 0 && d < SIM.slowZoneM && s.state !== 'GREEN_FOR_AMBULANCE' && !s.waited) factor = 0.2
  }

  let next = p + v0 * factor * dt
  for (let i = 0; i < sigs.length; i++) {
    const s = sigs[i]
    if (s.distanceAlongRoute <= p || s.distanceAlongRoute > next) continue
    if (s.state === 'GREEN_FOR_AMBULANCE' || s.waited) continue
    next = s.distanceAlongRoute
    w.waitingAt = s.id
    w.waitUntil = s.state === 'RED_HOLD' ? HELD : w.simT + redWait(i)
    out.waitingStarted = s.id
    out.logs.push(`${s.code} ${s.name}: ambulance waiting at ${s.state === 'RED_HOLD' ? 'a held red' : 'a red light'}`)
    break
  }

  // Release 30 m after the ambulance passes.
  for (const s of sigs) {
    if (s.state === 'RELEASED' || s.distanceAlongRoute + 30 > next) continue
    const wasGreen = s.state === 'GREEN_FOR_AMBULANCE'
    patch(s, {
      state: 'RELEASED',
      releasedAt: w.simT,
      releasedFlashUntil: Date.now() + 3000,
      crossTrafficHeldSeconds: wasGreen && s.holdStartedAt !== null ? w.simT - s.holdStartedAt : s.crossTrafficHeldSeconds,
      holdStartedAt: null,
    })
    if (wasGreen) out.logs.push(`${s.code}: ambulance passed, RELEASED after ${Math.round(s.crossTrafficHeldSeconds)}s hold`)
  }

  w.progressM = Math.min(pl.length, next)
  if (w.progressM >= pl.length - 0.5) out.arrived = true
  return out
}

/**
 * Live seconds to arrival. It stops counting down while the ambulance waits, so a late
 * signal command shows up as a slipping ETA.
 */
export function tripRemainingS(t: Trip, signals: Record<string, LiveSignal>, st: Settings): number {
  const v = cruiseSpeed(t.route)
  let s = Math.max(0, t.route.distance - t.progressM) / v
  const auto = corridorLive(t, st) && st.corridorMode === 'auto'
  for (const id of t.signalIds) {
    const g = signals[id]
    if (!g || !isAhead(g, t) || g.waited) continue
    if (g.state === 'GREEN_FOR_AMBULANCE' || auto) continue
    s += SIM.signalWaitS
  }
  if (t.waitingAt && t.waitUntil < HELD) s += Math.max(0, t.waitUntil - t.simT)
  return s
}
