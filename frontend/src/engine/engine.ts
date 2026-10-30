import { SIM } from '../config/simulation'
import { ALL_CAPS, ALL_SPECS, CAPABILITY_LABEL, SPECIALIST_LABEL } from '../data/hospitals'
import { INJURY_RULES } from '../data/injuryRules'
import type {
  Ambulance,
  AmbulanceMatch,
  Case,
  Confidence,
  Eta,
  FilteredHospital,
  Hospital,
  InjuryClass,
  RankedHospital,
  Ranking,
  Requirement,
  RouteData,
  SpecialistKind,
  Weights,
} from '../types'
import { haversine } from './geo'

/** 1. The must-have list for an injury class. A head injury with GCS above 12 only needs CT. */
export function requiredResources(injuryClass: InjuryClass, gcs: number): Requirement[] {
  const rule = INJURY_RULES[injuryClass]
  if (injuryClass === 'head_injury' && gcs > 12) return [{ kind: 'capability', key: 'ct', label: 'CT' }]
  return rule.requires
}

function failReason(h: Hospital, r: Requirement, holdCaseId?: string): string | null {
  switch (r.kind) {
    case 'capability':
      return h.capabilities[r.key] ? null : `No ${CAPABILITY_LABEL[r.key]}`
    case 'anyCapability':
      return r.keys.some((k) => h.capabilities[k]) ? null : `No ${r.keys.map((k) => CAPABILITY_LABEL[k]).join(' or ')}`
    case 'specialist': {
      const s = h.specialists[r.key]
      return s.presence === 'unavailable' ? `No ${SPECIALIST_LABEL[r.key].toLowerCase()} in the building` : null
    }
    case 'icuBed': {
      // A bed held for this very case still counts as free for it.
      const held = h.bedHold && h.bedHold.caseId === holdCaseId ? 1 : 0
      return h.beds.icu + held > 0 ? null : '0 ICU beds free'
    }
    case 'strokeTeam':
      return h.strokeTeam ? null : 'No stroke-ready team on shift'
  }
}

/** 2. Removes hospitals that cannot treat this patient, with plain-language reasons. */
export function hardFilter(hospitals: Hospital[], required: Requirement[], caseId?: string) {
  const passed: Hospital[] = []
  const filtered: FilteredHospital[] = []
  for (const h of hospitals) {
    const reasons = required.map((r) => failReason(h, r, caseId)).filter((x): x is string => !!x)
    if (reasons.length) filtered.push({ hospital: h, reasons })
    else passed.push(h)
  }
  return { passed, filtered }
}

/** 4. Data confidence from the age of the last update. */
export function confidenceOf(lastUpdated: number, now: number): { level: Confidence; factor: number; ageMin: number } {
  const ageMin = Math.max(0, Math.floor((now - lastUpdated) / 60_000))
  if (ageMin < 10) return { level: 'fresh', factor: 1, ageMin }
  if (ageMin <= 30) return { level: 'ageing', factor: 0.9, ageMin }
  return { level: 'stale', factor: 0.75, ageMin }
}

/** 5. On-call specialists cost 0.05 per 10 minutes away, capped at 0.15. */
export function specialistPenalty(h: Hospital, key: SpecialistKind | null): number {
  if (!key) return 0
  const s = h.specialists[key]
  if (s.presence !== 'on_call') return 0
  return Math.min(0.15, Math.ceil(s.onCallMinutes / 10) * 0.05)
}

/** 6. Minus 0.03 for each refusal in the last 24 hours, capped at 0.12. */
export function refusalPenalty(h: Hospital, now: number): number {
  const n = h.refusals.filter((r) => now - r.time < 24 * 3_600_000).length
  return Math.min(0.12, n * 0.03)
}

export function capabilityDepth(h: Hospital): number {
  const caps = ALL_CAPS.filter((c) => h.capabilities[c]).length / ALL_CAPS.length
  const specs = ALL_SPECS.filter((s) => h.specialists[s].presence === 'in_building').length / ALL_SPECS.length
  return caps * 0.6 + specs * 0.4
}

export function bedValue(h: Hospital): number {
  return h.beds.icu + h.beds.general / 10
}

const norm = (v: number, min: number, max: number) => (max - min < 1e-9 ? 1 : (v - min) / (max - min))

export function normaliseWeights(w: Weights): Weights {
  const sum = w.eta + w.capability + w.beds + w.erLoad || 1
  return { eta: w.eta / sum, capability: w.capability / sum, beds: w.beds / sum, erLoad: w.erLoad / sum }
}

export interface Candidate {
  hospital: Hospital
  eta: Eta
  route: RouteData | null
}

/** 3. Scores a set of candidates. Each term is normalised 0 to 1 against the set. */
export function score(cands: Candidate[], weights: Weights, keySpecialist: SpecialistKind | null, now: number): RankedHospital[] {
  const w = normaliseWeights(weights)
  const etas = cands.map((c) => c.eta.normalS)
  const caps = cands.map((c) => capabilityDepth(c.hospital))
  const beds = cands.map((c) => bedValue(c.hospital))
  const free = cands.map((c) => 1 - c.hospital.erLoad)
  const rng = (a: number[]) => [Math.min(...a), Math.max(...a)] as const
  const [eMin, eMax] = rng(etas)
  const [cMin, cMax] = rng(caps)
  const [bMin, bMax] = rng(beds)
  const [fMin, fMax] = rng(free)

  const ranked = cands.map((c, i): RankedHospital => {
    const breakdown = {
      eta: w.eta * (1 - norm(etas[i], eMin, eMax)),
      capability: w.capability * norm(caps[i], cMin, cMax),
      beds: w.beds * norm(beds[i], bMin, bMax),
      erLoad: w.erLoad * norm(free[i], fMin, fMax),
    }
    const raw = breakdown.eta + breakdown.capability + breakdown.beds + breakdown.erLoad
    const conf = confidenceOf(c.hospital.lastUpdated, now)
    const sp = specialistPenalty(c.hospital, keySpecialist)
    const rp = refusalPenalty(c.hospital, now)
    const total = Math.max(0, raw * conf.factor - sp - rp)
    return {
      hospital: c.hospital,
      eta: c.eta,
      route: c.route,
      breakdown,
      raw,
      confidence: conf.level,
      confidenceFactor: conf.factor,
      specialistPenalty: sp,
      refusalPenalty: rp,
      total,
      cashlessTieBreak: false,
      ageMin: conf.ageMin,
    }
  })
  return sortRanked(ranked)
}

/** 7. Cashless scheme only breaks ties within 0.02. */
export function sortRanked(list: RankedHospital[]): RankedHospital[] {
  const out = [...list].sort((a, b) => b.total - a.total)
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i]
    const b = out[i + 1]
    if (a.total - b.total < 0.02 && !a.hospital.cashlessScheme && b.hospital.cashlessScheme) {
      out[i] = { ...b, cashlessTieBreak: true }
      out[i + 1] = a
    }
  }
  return out
}

export function rank(
  c: Pick<Case, 'injuryClass' | 'gcs' | 'id'>,
  hospitals: Hospital[],
  routeFor: (h: Hospital) => RouteData | null,
  etaFor: (r: RouteData | null, h: Hospital) => Eta,
  weights: Weights,
  now: number,
  exclude: string[] = [],
): Ranking {
  const required = requiredResources(c.injuryClass, c.gcs)
  const pool = hospitals.filter((h) => !exclude.includes(h.id))
  const { passed, filtered } = hardFilter(pool, required, c.id)
  const excluded = hospitals
    .filter((h) => exclude.includes(h.id))
    .map((h) => ({ hospital: h, reasons: ['Diverted this case'] }))
  const cands = passed.map((h) => {
    const route = routeFor(h)
    return { hospital: h, route, eta: etaFor(route, h) }
  })
  const ranked = cands.length ? score(cands, weights, INJURY_RULES[c.injuryClass].keySpecialist, now) : []
  // Nearest first in the filtered list, so the story reads in order.
  const byEta = (h: Hospital) => etaFor(routeFor(h), h).corridorS
  filtered.sort((a, b) => byEta(a.hospital) - byEta(b.hospital))
  return { required, ranked, filtered: [...filtered, ...excluded] }
}

/** 8. Nearest unit of the right type. Says when it skipped a nearer unit and why. */
export function matchAmbulance(c: Pick<Case, 'injuryClass' | 'location'>, fleet: Ambulance[]): AmbulanceMatch | null {
  const rule = INJURY_RULES[c.injuryClass]
  const avail = fleet
    .filter((a) => a.status === 'available')
    .map((a) => ({ a, d: (haversine([a.lng, a.lat], c.location) / 1000) * SIM.roadFactor }))
    .sort((x, y) => x.d - y.d)
  if (!avail.length) return null
  const ok = avail.filter((x) => !rule.alsRequired || x.a.type === 'ALS')
  const pick = ok[0] ?? avail[0]
  const nearest = avail[0]
  const etaMin = Math.max(1, Math.round((pick.d / SIM.unitSpeedKmh) * 60))
  const injury = rule.label.split(' (')[0].toLowerCase()
  const skipped =
    nearest.a.id !== pick.a.id
      ? { ambulance: nearest.a, distanceKm: nearest.d, reason: `${injury} needs advanced life support` }
      : null
  const reason = skipped
    ? `${pick.a.id} chosen over nearer ${nearest.a.id}: ${injury} needs advanced life support`
    : `${pick.a.id} is the nearest ${rule.alsRequired ? 'ALS' : 'available'} unit`
  return { ambulance: pick.a, distanceKm: pick.d, etaMin, skipped, reason }
}

/** 10. Golden hour remaining, seconds. */
export function goldenRemaining(callTime: number, now: number): number {
  return Math.max(0, SIM.goldenHourS - (now - callTime) / 1000)
}

export function goldenTone(remainingS: number): 'ok' | 'warn' | 'danger' {
  if (remainingS < 15 * 60) return 'danger'
  if (remainingS < 30 * 60) return 'warn'
  return 'ok'
}

/** True when the corridor ETA would still land after the golden hour ends. */
export function crossesGoldenHour(callTime: number, now: number, corridorS: number): boolean {
  return corridorS > goldenRemaining(callTime, now)
}
