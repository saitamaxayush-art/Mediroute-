import { describe, expect, it } from 'vitest'
import { makeHospitals } from '../data/hospitals'
import { AMBULANCES } from '../data/ambulances'
import { demoCase } from '../data/scenario'
import { INJURY_RULES } from '../data/injuryRules'
import { presetRoutes, etaOf } from '../services/routing'
import { matchAmbulance, rank, requiredResources, specialistPenalty, refusalPenalty, confidenceOf } from './engine'
import { parseTriage } from './voice'

const now = Date.now()
const hospitals = makeHospitals(now)
const c = demoCase(now)
const routeFor = (h: { id: string }) => presetRoutes('p-university', h.id)[0] ?? null
const ranking = rank(c, hospitals, routeFor, (r) => etaOf(r), INJURY_RULES.head_injury.weights, now)

describe('demo scenario', () => {
  it('needs CT, neurosurgeon and ICU bed', () => {
    expect(requiredResources('head_injury', 9).map((r) => r.label)).toEqual(['CT', 'Neurosurgeon', 'ICU bed'])
  })
  it('filters the nearest for no neurosurgeon, then the next for 0 ICU beds', () => {
    expect(ranking.filtered[0].hospital.id).toBe('h-shivajinagar')
    expect(ranking.filtered[0].reasons).toContain('No neurosurgeon in the building')
    expect(ranking.filtered[1].hospital.id).toBe('h-kothrud')
    expect(ranking.filtered[1].reasons).toContain('0 ICU beds free')
  })
  it('down-ranks the stale hospital and picks Riverside about 5 minutes further', () => {
    const top = ranking.ranked[0]
    const stale = ranking.ranked.find((r) => r.hospital.id === 'h-aundh')!
    expect(top.hospital.name).toBe('Riverside Trauma Centre')
    expect(stale.confidence).toBe('stale')
    expect(stale.raw).toBeGreaterThan(top.raw)
    const nearest = etaOf(routeFor({ id: 'h-shivajinagar' }))
    const diffMin = (top.eta.corridorS - nearest.corridorS) / 60
    expect(diffMin).toBeGreaterThan(4)
    expect(diffMin).toBeLessThan(6.5)
    console.log(ranking.ranked.map((r) => `${r.hospital.name} raw=${r.raw.toFixed(3)} total=${r.total.toFixed(3)} n=${Math.round(r.eta.normalS / 60)} c=${Math.round(r.eta.corridorS / 60)} sig=${r.eta.signals}`).join('\n'))
  })
  it('picks ALS over a nearer BLS for head injury', () => {
    const m = matchAmbulance(c, AMBULANCES)!
    expect(m.ambulance.type).toBe('ALS')
    expect(m.skipped?.ambulance.id).toBe('BLS-01')
  })
})

describe('penalties', () => {
  it('caps on-call and refusal penalties', () => {
    const h = hospitals.find((x) => x.id === 'h-swargate')!
    expect(specialistPenalty(h, 'neurosurgeon')).toBeCloseTo(0.15)
    expect(refusalPenalty(h, now)).toBeCloseTo(0.06)
    expect(confidenceOf(now - 41 * 60_000, now).level).toBe('stale')
  })
})

describe('voice parser', () => {
  it('reads English and Hindi phrases', () => {
    const e = parseTriage('Head injury, unconscious, GCS 9, pulse 112')
    expect(e.injuryClass).toBe('head_injury')
    expect(e.gcs).toBe(9)
    expect(e.pulse).toBe(112)
    expect(parseTriage('मरीज़ बेहोश है, सिर में चोट').injuryClass).toBe('head_injury')
    expect(parseTriage('छातीत दुखत आहे').injuryClass).toBe('heart_attack')
  })
})
