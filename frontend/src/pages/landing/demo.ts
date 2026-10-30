import { AMBULANCES } from '../../data/ambulances'
import { makeHospitals } from '../../data/hospitals'
import { INJURY_RULES } from '../../data/injuryRules'
import { PRESET_ROUTES } from '../../data/routes'
import { demoCase } from '../../data/scenario'
import { matchAmbulance, rank } from '../../engine/engine'
import { makePolyline } from '../../engine/geo'
import { etaOf, presetRoutes } from '../../services/routing'
import type { LngLat } from '../../types'

/** Everything the landing page shows, computed by the real engine on the sample data. */
function build() {
  const now = Date.now()
  const hospitals = makeHospitals(now)
  const kase = demoCase(now)
  const ranking = rank(kase, hospitals, (h) => presetRoutes('p-university', h.id)[0] ?? null, (r) => etaOf(r), INJURY_RULES.head_injury.weights, now)
  const winner = ranking.ranked[0]
  const route = winner.route!
  const pl = makePolyline(route.geometry)
  const match = matchAmbulance(kase, AMBULANCES)!
  const sceneS = match.etaMin * 60 + 6 * 60
  const stale = ranking.ranked.find((r) => r.confidence === 'stale') ?? null
  const nearest = ranking.filtered[0]
  const nearestEta = etaOf(presetRoutes('p-university', nearest.hospital.id)[0] ?? null)
  return {
    hospitals,
    kase,
    ranking,
    winner,
    route,
    pl,
    match,
    sceneS,
    stale,
    nearest,
    extraMin: Math.round((winner.eta.corridorS - nearestEta.corridorS) / 60),
    savedMin: Math.round((winner.eta.normalS - winner.eta.corridorS) / 60),
    goldenAtArrivalS: 3600 - sceneS - winner.eta.corridorS,
  }
}

let cached: ReturnType<typeof build> | null = null
export function demo() {
  if (!cached) cached = build()
  return cached
}

/** Main route geometries of every preset pair, for the preloader drawing. */
export function networkPaths(): LngLat[][] {
  return Object.values(PRESET_ROUTES).map((r) => r[0].geometry)
}
