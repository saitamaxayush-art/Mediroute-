import type { Case } from '../types'
import { PRESETS } from './places'

/** The demo case that the landing story and "Load demo case" both use. */
export function demoCase(now: number): Omit<Case, 'simElapsedS' | 'frozen' | 'match'> {
  const p = PRESETS[0]
  return {
    id: 'CASE-0142',
    injuryClass: 'head_injury',
    gcs: 9,
    vitals: { pulse: 112, systolic: 100, diastolic: 64, spo2: 93 },
    conscious: false,
    location: p.loc,
    locationLabel: p.label,
    presetId: p.id,
    callTime: now,
    treatment: ['Cervical collar', 'Oxygen 10 L/min', 'Airway positioned'],
    notes: 'Two-wheeler crash. Rider unconscious at scene, helmet cracked.',
  }
}

/** Clock time printed in the story, matching the deck. */
export const DEMO_CALL_CLOCK = '08:42'
