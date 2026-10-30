import { PRESET_ROUTES } from '../data/routes'
import { PRESETS } from '../data/places'
import { haversine } from '../engine/geo'
import { computeEta, toRouteData, type RawJunction, type RawRoute } from '../engine/route'
import type { Eta, Hospital, LngLat, RouteData } from '../types'

const OSRM = 'https://router.project-osrm.org'
const parsed = new Map<string, RouteData[]>()

export function presetRoutes(presetId: string, hospitalId: string): RouteData[] {
  const key = `${presetId}__${hospitalId}`
  let r = parsed.get(key)
  if (!r) {
    r = (PRESET_ROUTES[key] ?? []).map((x) => toRouteData(x, 'preset'))
    parsed.set(key, r)
  }
  return r
}

export function nearestPreset(p: LngLat) {
  return [...PRESETS].sort((a, b) => haversine(a.loc, p) - haversine(b.loc, p))[0]
}

interface OsrmIntersection {
  location: LngLat
  bearings?: number[]
  in?: number
}
interface OsrmRoute {
  geometry: { coordinates: LngLat[] }
  distance: number
  duration: number
  legs: { steps: { name: string; intersections?: OsrmIntersection[] }[] }[]
}

const r5 = (n: number) => Math.round(n * 1e5) / 1e5

function trim(route: OsrmRoute): RawRoute {
  const junctions: RawJunction[] = []
  for (const leg of route.legs)
    for (const step of leg.steps)
      for (const ix of step.intersections ?? []) {
        if ((ix.bearings?.length ?? 0) < 3 || ix.in === undefined) continue
        junctions.push({ loc: [r5(ix.location[0]), r5(ix.location[1])], name: step.name || '', bearings: ix.bearings!, in: ix.in })
      }
  return {
    geometry: route.geometry.coordinates.map(([x, y]) => [r5(x), r5(y)] as LngLat),
    distance: Math.round(route.distance),
    duration: Math.round(route.duration),
    junctions,
  }
}

/** Live OSRM routing. Throws on any failure so callers can fall back. Never returns a straight line. */
export async function liveRoutes(points: LngLat[], alternatives = true, timeoutMs = 7000): Promise<RouteData[]> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const pts = points.map((p) => `${p[0]},${p[1]}`).join(';')
    const url = `${OSRM}/route/v1/driving/${pts}?overview=full&geometries=geojson&steps=true${alternatives ? '&alternatives=true' : ''}`
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`)
    const data = (await res.json()) as { code: string; routes: OsrmRoute[] }
    if (data.code !== 'Ok' || !data.routes.length) throw new Error(`OSRM ${data.code}`)
    return data.routes.slice(0, 2).map((r) => toRouteData(trim(r), 'live'))
  } finally {
    clearTimeout(timer)
  }
}

/** Routes from a clicked point to every hospital, three requests at a time. */
export async function liveRoutesToAll(from: LngLat, hospitals: Hospital[]): Promise<Record<string, RouteData[]>> {
  const out: Record<string, RouteData[]> = {}
  const queue = [...hospitals]
  const worker = async () => {
    while (queue.length) {
      const h = queue.shift()!
      out[h.id] = await liveRoutes([from, [h.lng, h.lat]])
    }
  }
  await Promise.all([worker(), worker(), worker()])
  return out
}

export const etaOf = (r: RouteData | null): Eta =>
  r ? computeEta(r) : { normalS: Number.POSITIVE_INFINITY, corridorS: Number.POSITIVE_INFINITY, signals: 0 }

/** Joins two road paths that meet at a shared point, dropping the duplicate vertex. */
export function joinPaths(a: LngLat[], b: LngLat[]): LngLat[] {
  if (!a.length) return b
  const last = a[a.length - 1]
  const first = b[0]
  return haversine(last, first) < 1 ? [...a, ...b.slice(1)] : [...a, ...b]
}
