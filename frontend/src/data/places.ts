import snapped from './snapped.json'
import type { LngLat } from '../types'

export interface Preset {
  id: string
  label: string
  loc: LngLat
}

/** Preset crash locations. Routes to every hospital are precomputed in src/data/routes. */
export const PRESETS: Preset[] = [
  { id: 'p-university', label: 'University Chowk, Ganeshkhind', loc: [73.8296, 18.5293] },
  { id: 'p-yerawada', label: 'Yerawada, Airport Road', loc: [73.884, 18.553] },
  { id: 'p-nalstop', label: 'Nal Stop, Karve Road', loc: [73.8328, 18.5082] },
  { id: 'p-kharadi', label: 'Kharadi Bypass', loc: [73.937, 18.548] },
]

export const SNAPPED = snapped as Record<string, { lat: number; lng: number; road: string }>

export const PUNE_CENTER: LngLat = [73.8567, 18.5204]
export const INDIA_CENTER: LngLat = [79.5, 22.5]
export const INDIA_BOUNDS: [LngLat, LngLat] = [
  [68.0, 6.5],
  [97.5, 37.5],
]

export const fmtCoord = ([lng, lat]: LngLat) => `${lat.toFixed(4)} N, ${lng.toFixed(4)} E`
