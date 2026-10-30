import { SIM } from '../config/simulation'
import type { Eta, LngLat, RouteData, Signal } from '../types'
import { makePolyline, project } from './geo'

export interface RawJunction {
  loc: LngLat
  name: string
  bearings: number[]
  in: number
}
export interface RawRoute {
  geometry: LngLat[]
  distance: number
  duration: number
  junctions: RawJunction[]
}

/**
 * Picks up to SIM.maxSignals real junctions, spread evenly along the route and at
 * least SIM.minSignalGapM apart, so every signal sits on a real OSRM intersection.
 */
export function pickSignals(raw: RawRoute): Signal[] {
  const pl = makePolyline(raw.geometry)
  const L = pl.length
  const cands = raw.junctions
    .map((j) => ({ j, at: project(pl, j.loc) }))
    .filter((c) => c.at > 150 && c.at < L - 150)
    .sort((a, b) => a.at - b.at)
  const n = Math.min(SIM.maxSignals, Math.floor(L / SIM.minSignalGapM) - 1)
  const out: { j: RawJunction; at: number }[] = []
  for (let k = 1; k <= n; k++) {
    const target = (L * k) / (n + 1)
    let best: (typeof cands)[number] | null = null
    for (const c of cands) {
      if (out.some((o) => Math.abs(o.at - c.at) < SIM.minSignalGapM)) continue
      if (!best || Math.abs(c.at - target) < Math.abs(best.at - target)) best = c
    }
    if (best) out.push(best)
  }
  out.sort((a, b) => a.at - b.at)
  return out.map(({ j, at }, i) => ({
    id: `J${i + 1}`,
    // OSM names can contain long dashes ("Pune\u2013Solapur Road"); show a plain hyphen instead.
    name: j.name ? j.name.replace(/[\u2013\u2014]/g, '-') : `Junction ${i + 1}`,
    loc: j.loc,
    at,
    heading: ((j.bearings[j.in] ?? 0) + 180) % 360,
  }))
}

export function toRouteData(raw: RawRoute, source: RouteData['source']): RouteData {
  return {
    geometry: raw.geometry,
    distance: raw.distance,
    osrmDuration: raw.duration,
    signals: pickSignals(raw),
    source,
  }
}

export function computeEta(route: Pick<RouteData, 'osrmDuration' | 'signals'>): Eta {
  const base = route.osrmDuration * SIM.peakTrafficFactor
  return {
    normalS: Math.round(base + route.signals.length * SIM.signalWaitS),
    corridorS: Math.round(base),
    signals: route.signals.length,
  }
}
