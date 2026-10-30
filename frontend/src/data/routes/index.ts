import type { RawRoute } from '../../engine/route'

interface RouteFile {
  from: string
  to: string
  routes: RawRoute[]
}

const files = import.meta.glob<RouteFile>('./*.json', { eager: true, import: 'default' })

/** Precomputed OSRM routes keyed by `${presetId}__${hospitalId}`. Index 0 is the main route, 1 the alternative. */
export const PRESET_ROUTES: Record<string, RawRoute[]> = Object.fromEntries(
  Object.values(files).map((f) => [`${f.from}__${f.to}`, f.routes]),
)
