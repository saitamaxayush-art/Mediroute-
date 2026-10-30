import type { Hospital, InjuryClass, RankedHospital, Ranking } from '../types'

export type Severity = 'critical' | 'serious' | 'stable'
export interface McPatient {
  id: string
  severity: Severity
  injuryClass: InjuryClass
}
export interface McRow {
  patient: McPatient
  hospital: Hospital | null
  bed: 'ICU' | 'General' | null
  etaS: number | null
  note: string
}

const ORDER: Record<Severity, number> = { critical: 0, serious: 1, stable: 2 }

/**
 * Spreads patients across hospitals, most severe first. Each assignment uses up
 * a bed, so two patients never get the same last bed.
 */
export function allocate(patients: McPatient[], rankFor: (p: McPatient) => Ranking, hospitals: Hospital[]): McRow[] {
  const left = new Map(hospitals.map((h) => [h.id, { icu: h.beds.icu, general: h.beds.general }]))
  const sorted = [...patients].sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
  return sorted.map((p) => {
    const r = rankFor(p)
    const needIcu = p.severity === 'critical'
    const fits = (x: RankedHospital) => {
      const cap = left.get(x.hospital.id)!
      return needIcu ? cap.icu > 0 : cap.general > 0
    }
    // Spread load: penalise hospitals that already took patients in this incident.
    const taken = (x: RankedHospital) => {
      const cap = left.get(x.hospital.id)!
      const orig = x.hospital.beds
      return (orig.icu - cap.icu + orig.general - cap.general) * 0.06
    }
    const best = r.ranked.filter(fits).sort((a, b) => b.total - taken(b) - (a.total - taken(a)))[0]
    if (!best) return { patient: p, hospital: null, bed: null, etaS: null, note: 'No matching bed free, escalate' }
    const cap = left.get(best.hospital.id)!
    if (needIcu) cap.icu--
    else cap.general--
    return {
      patient: p,
      hospital: best.hospital,
      bed: needIcu ? 'ICU' : 'General',
      etaS: best.eta.corridorS,
      note: needIcu ? `${cap.icu} ICU left after this` : `${cap.general} general left after this`,
    }
  })
}
