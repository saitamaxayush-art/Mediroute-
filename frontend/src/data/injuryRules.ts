import type { InjuryClass, InjuryRule } from '../types'

/** The triage table from the MediRoute deck. */
export const INJURY_RULES: Record<InjuryClass, InjuryRule> = {
  head_injury: {
    id: 'head_injury',
    label: 'Head injury (GCS 12 or below)',
    requires: [
      { kind: 'capability', key: 'ct', label: 'CT' },
      { kind: 'specialist', key: 'neurosurgeon', label: 'Neurosurgeon' },
      { kind: 'icuBed', label: 'ICU bed' },
    ],
    keySpecialist: 'neurosurgeon',
    weights: { eta: 0.5, capability: 0.25, beds: 0.15, erLoad: 0.1 },
    alsRequired: true,
  },
  major_bleeding: {
    id: 'major_bleeding',
    label: 'Major bleeding or chest trauma',
    requires: [
      { kind: 'capability', key: 'bloodBank', label: 'Blood bank' },
      { kind: 'specialist', key: 'traumaSurgeon', label: 'Trauma surgeon' },
      { kind: 'capability', key: 'ot', label: 'OT' },
    ],
    keySpecialist: 'traumaSurgeon',
    weights: { eta: 0.55, capability: 0.2, beds: 0.15, erLoad: 0.1 },
    alsRequired: true,
  },
  spinal_injury: {
    id: 'spinal_injury',
    label: 'Spinal injury',
    requires: [
      { kind: 'anyCapability', keys: ['ct', 'mri'], label: 'CT or MRI' },
      { kind: 'specialist', key: 'spineSurgeon', label: 'Spine surgeon' },
    ],
    keySpecialist: 'spineSurgeon',
    weights: { eta: 0.45, capability: 0.3, beds: 0.15, erLoad: 0.1 },
    alsRequired: false,
  },
  severe_burns: {
    id: 'severe_burns',
    label: 'Severe burns',
    requires: [{ kind: 'capability', key: 'burnsUnit', label: 'Burns unit' }],
    keySpecialist: null,
    weights: { eta: 0.4, capability: 0.35, beds: 0.15, erLoad: 0.1 },
    alsRequired: true,
  },
  stroke: {
    id: 'stroke',
    label: 'Stroke symptoms',
    requires: [
      { kind: 'capability', key: 'ct', label: 'CT' },
      { kind: 'strokeTeam', label: 'Stroke-ready team' },
    ],
    keySpecialist: 'neurosurgeon',
    weights: { eta: 0.55, capability: 0.25, beds: 0.1, erLoad: 0.1 },
    alsRequired: true,
  },
  heart_attack: {
    id: 'heart_attack',
    label: 'Heart attack',
    requires: [
      { kind: 'capability', key: 'cathLab', label: 'Cath lab' },
      { kind: 'specialist', key: 'cardiologist', label: 'Cardiologist' },
    ],
    keySpecialist: 'cardiologist',
    weights: { eta: 0.55, capability: 0.25, beds: 0.1, erLoad: 0.1 },
    alsRequired: true,
  },
  obstetric: {
    id: 'obstetric',
    label: 'Obstetric emergency',
    requires: [
      { kind: 'capability', key: 'obstetrics', label: 'Obstetrics' },
      { kind: 'capability', key: 'nicu', label: 'NICU' },
    ],
    keySpecialist: 'obstetrician',
    weights: { eta: 0.45, capability: 0.3, beds: 0.15, erLoad: 0.1 },
    alsRequired: false,
  },
}

export const INJURY_ORDER: InjuryClass[] = [
  'head_injury',
  'major_bleeding',
  'spinal_injury',
  'severe_burns',
  'stroke',
  'heart_attack',
  'obstetric',
]

export const INJURY_SHORT: Record<InjuryClass, string> = {
  head_injury: 'Head injury',
  major_bleeding: 'Major bleeding',
  spinal_injury: 'Spinal injury',
  severe_burns: 'Severe burns',
  stroke: 'Stroke',
  heart_attack: 'Heart attack',
  obstetric: 'Obstetric emergency',
}
