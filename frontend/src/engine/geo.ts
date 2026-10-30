import type { LngLat } from '../types'

const R = 6371008.8
const rad = (d: number) => (d * Math.PI) / 180

export function haversine(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1])
  const dLng = rad(b[0] - a[0])
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function bearing(a: LngLat, b: LngLat): number {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]))
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/** Precomputed polyline for fast distance lookups every frame. */
export interface Polyline {
  coords: LngLat[]
  cum: number[]
  length: number
  /** Distances along the line where it turns more than 35 degrees. */
  turns: number[]
}

export function makePolyline(coords: LngLat[]): Polyline {
  const cum = [0]
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]))
  const turns: number[] = []
  for (let i = 1; i < coords.length - 1; i++) {
    if (cum[i + 1] - cum[i] < 3 || cum[i] - cum[i - 1] < 3) continue
    const d = Math.abs(((bearing(coords[i], coords[i + 1]) - bearing(coords[i - 1], coords[i]) + 540) % 360) - 180)
    if (d > 35) turns.push(cum[i])
  }
  return { coords, cum, length: cum[cum.length - 1], turns }
}

/** Point and heading at a distance along the line. Binary search, no allocation beyond the result. */
export function along(pl: Polyline, d: number): { p: LngLat; heading: number } {
  const { coords, cum } = pl
  if (d <= 0) return { p: coords[0], heading: bearing(coords[0], coords[1] ?? coords[0]) }
  if (d >= pl.length) {
    const n = coords.length
    return { p: coords[n - 1], heading: bearing(coords[n - 2] ?? coords[0], coords[n - 1]) }
  }
  let lo = 0
  let hi = cum.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (cum[mid] <= d) lo = mid
    else hi = mid
  }
  const seg = cum[hi] - cum[lo] || 1
  const t = (d - cum[lo]) / seg
  const a = coords[lo]
  const b = coords[hi]
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], heading: bearing(a, b) }
}

/** Distance along the line of the vertex nearest to a point. */
export function project(pl: Polyline, p: LngLat): number {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < pl.coords.length; i++) {
    const d = haversine(pl.coords[i], p)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return pl.cum[best]
}

/** Sub-line between two distances, for drawing travelled and blocked segments. */
export function slice(pl: Polyline, from: number, to: number): LngLat[] {
  const out: LngLat[] = [along(pl, from).p]
  for (let i = 0; i < pl.coords.length; i++) if (pl.cum[i] > from && pl.cum[i] < to) out.push(pl.coords[i])
  out.push(along(pl, to).p)
  return out
}
