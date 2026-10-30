import { INJURY_RULES, INJURY_SHORT } from '../data/injuryRules'
import type { Case, InjuryClass } from '../types'

export const mmss = (s: number) => {
  const v = Math.max(0, Math.round(s))
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
}

export const mins = (s: number) => `${Math.max(1, Math.round(s / 60))} MIN`

export const clock = (t: number) =>
  new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

export const clockSec = (t: number) =>
  new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

export function ago(t: number, now: number): string {
  const m = Math.floor((now - t) / 60_000)
  if (m < 1) return 'Updated just now'
  if (m < 60) return `Updated ${m} min ago`
  return `Updated ${Math.floor(m / 60)} h ${m % 60} min ago`
}

export function injuryLabel(c: InjuryClass) {
  return INJURY_SHORT[c]
}

/** Auto handover note. No patient name field exists anywhere. */
export function handoverNote(c: Case, hospitalName: string, etaS: number | null): string {
  const v = c.vitals
  return [
    `MEDIROUTE HANDOVER  ${c.id}`,
    `To: ${hospitalName}`,
    `Injury: ${INJURY_RULES[c.injuryClass].label}`,
    `GCS: ${c.gcs}/15, ${c.conscious ? 'conscious' : 'unconscious'}`,
    `Vitals: pulse ${v.pulse}, BP ${v.systolic}/${v.diastolic}, SpO2 ${v.spo2}%`,
    `Crash time: ${clock(c.callTime)} at ${c.locationLabel}`,
    `Treatment given: ${c.treatment.length ? c.treatment.join(', ') : 'None recorded'}`,
    etaS !== null ? `ETA: ${mins(etaS).toLowerCase()}` : '',
    c.notes ? `Notes: ${c.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** The exact SMS sent when data drops. Kept under 160 characters where possible. */
export function smsText(c: Case, hospitalName: string, etaS: number | null): string {
  const v = c.vitals
  const eta = etaS !== null ? ` ETA ${Math.round(etaS / 60)}m` : ''
  return `MR ${c.id} ${INJURY_SHORT[c.injuryClass].toUpperCase()} GCS${c.gcs} P${v.pulse} BP${v.systolic}/${v.diastolic} SPO2 ${v.spo2} TO ${hospitalName.toUpperCase()}${eta}`
}
