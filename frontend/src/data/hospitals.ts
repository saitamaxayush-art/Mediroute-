import type { Capability, Hospital, Presence, SpecialistKind } from '../types'
import { SNAPPED } from './places'

/**
 * Sample data. Hospital names are fictional and are not real hospital brands.
 * Locations are real Pune areas, snapped to the nearest road by scripts/fetch-routes.mjs.
 * Times are minutes before page load so the demo never shows old dates.
 */
type Seed = {
  id: string
  name: string
  area: string
  caps: Capability[]
  spec: Partial<Record<SpecialistKind, [Presence, number?]>>
  strokeTeam: boolean
  beds: [general: number, icu: number]
  erLoad: number
  updatedMinAgo: number
  cashless: boolean
  refusals: [hoursAgo: number, reason: string][]
}

const SEEDS: Seed[] = [
  {
    id: 'h-shivajinagar',
    name: 'Northgate General Hospital',
    area: 'Shivajinagar',
    caps: ['ct', 'bloodBank', 'ot', 'obstetrics'],
    spec: { neurosurgeon: ['unavailable'], traumaSurgeon: ['in_building'], cardiologist: ['on_call', 25], obstetrician: ['in_building'] },
    strokeTeam: false,
    beds: [11, 3],
    erLoad: 0.55,
    updatedMinAgo: 3,
    cashless: true,
    refusals: [],
  },
  {
    id: 'h-kothrud',
    name: 'Westend Care Hospital',
    area: 'Kothrud',
    caps: ['ct', 'mri', 'bloodBank', 'ot'],
    spec: { neurosurgeon: ['in_building'], traumaSurgeon: ['in_building'], spineSurgeon: ['on_call', 20] },
    strokeTeam: true,
    beds: [9, 0],
    erLoad: 0.7,
    updatedMinAgo: 6,
    cashless: false,
    refusals: [[9, 'No ICU bed']],
  },
  {
    id: 'h-aundh',
    name: 'Mula Road Medical Centre',
    area: 'Aundh',
    caps: ['ct', 'mri', 'bloodBank', 'ot'],
    spec: { neurosurgeon: ['in_building'], traumaSurgeon: ['in_building'], spineSurgeon: ['in_building'], cardiologist: ['on_call', 30] },
    strokeTeam: true,
    beds: [14, 5],
    erLoad: 0.35,
    updatedMinAgo: 41,
    cashless: true,
    refusals: [],
  },
  {
    id: 'h-baner',
    name: 'Riverside Trauma Centre',
    area: 'Baner',
    caps: ['ct', 'mri', 'bloodBank', 'ot', 'burnsUnit'],
    spec: { neurosurgeon: ['in_building'], traumaSurgeon: ['in_building'], spineSurgeon: ['in_building'], cardiologist: ['on_call', 20] },
    strokeTeam: true,
    beds: [12, 4],
    erLoad: 0.45,
    updatedMinAgo: 4,
    cashless: true,
    refusals: [],
  },
  {
    id: 'h-swargate',
    name: 'Southgate Civic Hospital',
    area: 'Swargate',
    caps: ['ct', 'bloodBank', 'ot', 'obstetrics'],
    spec: { neurosurgeon: ['on_call', 30], traumaSurgeon: ['in_building'], obstetrician: ['in_building'], cardiologist: ['on_call', 40] },
    strokeTeam: false,
    beds: [8, 2],
    erLoad: 0.85,
    updatedMinAgo: 12,
    cashless: true,
    refusals: [
      [5, 'ER over capacity'],
      [14, 'CT down for maintenance'],
    ],
  },
  {
    id: 'h-vimannagar',
    name: 'Eastside Heart and Neuro Institute',
    area: 'Viman Nagar',
    caps: ['ct', 'mri', 'cathLab', 'bloodBank', 'ot'],
    spec: { neurosurgeon: ['in_building'], cardiologist: ['in_building'], spineSurgeon: ['in_building'], traumaSurgeon: ['in_building'] },
    strokeTeam: true,
    beds: [10, 6],
    erLoad: 0.5,
    updatedMinAgo: 2,
    cashless: false,
    refusals: [],
  },
  {
    id: 'h-hadapsar',
    name: "Ridgeline Children's and Women's Hospital",
    area: 'Hadapsar',
    caps: ['nicu', 'obstetrics', 'bloodBank', 'ot'],
    spec: { obstetrician: ['in_building'], neurosurgeon: ['unavailable'] },
    strokeTeam: false,
    beds: [16, 3],
    erLoad: 0.4,
    updatedMinAgo: 7,
    cashless: true,
    refusals: [],
  },
  {
    id: 'h-katraj',
    name: 'Hillview Multispeciality',
    area: 'Katraj',
    caps: ['ct', 'bloodBank', 'ot', 'burnsUnit'],
    spec: { neurosurgeon: ['on_call', 20], traumaSurgeon: ['in_building'], cardiologist: ['on_call', 15] },
    strokeTeam: false,
    beds: [6, 2],
    erLoad: 0.6,
    updatedMinAgo: 8,
    cashless: false,
    refusals: [[3, 'Specialist unavailable']],
  },
]

const ALL_CAPS: Capability[] = ['ct', 'mri', 'cathLab', 'burnsUnit', 'bloodBank', 'ot', 'nicu', 'obstetrics']
const ALL_SPECS: SpecialistKind[] = ['neurosurgeon', 'traumaSurgeon', 'cardiologist', 'spineSurgeon', 'obstetrician']

export function makeHospitals(now: number): Hospital[] {
  return SEEDS.map((s) => {
    const p = SNAPPED[s.id]
    return {
      id: s.id,
      name: s.name,
      area: s.area,
      lat: p.lat,
      lng: p.lng,
      capabilities: Object.fromEntries(ALL_CAPS.map((c) => [c, s.caps.includes(c)])) as Hospital['capabilities'],
      specialists: Object.fromEntries(
        ALL_SPECS.map((k) => {
          const v = s.spec[k]
          return [k, { presence: v?.[0] ?? 'unavailable', onCallMinutes: v?.[1] ?? 0 }]
        }),
      ) as Hospital['specialists'],
      strokeTeam: s.strokeTeam,
      beds: { general: s.beds[0], icu: s.beds[1] },
      erLoad: s.erLoad,
      lastUpdated: now - s.updatedMinAgo * 60_000,
      cashlessScheme: s.cashless,
      refusals: s.refusals.map(([h, reason]) => ({ time: now - h * 3_600_000, reason })),
      bedHold: null,
    }
  })
}

export const CAPABILITY_LABEL: Record<Capability, string> = {
  ct: 'CT',
  mri: 'MRI',
  cathLab: 'Cath lab',
  burnsUnit: 'Burns unit',
  bloodBank: 'Blood bank',
  ot: 'OT',
  nicu: 'NICU',
  obstetrics: 'Obstetrics',
}

export const SPECIALIST_LABEL: Record<SpecialistKind, string> = {
  neurosurgeon: 'Neurosurgeon',
  traumaSurgeon: 'Trauma surgeon',
  cardiologist: 'Cardiologist',
  spineSurgeon: 'Spine surgeon',
  obstetrician: 'Obstetrician',
}

export { ALL_CAPS, ALL_SPECS }
