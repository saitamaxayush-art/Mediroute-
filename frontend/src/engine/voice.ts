import type { InjuryClass } from '../types'

export interface ParsedTriage {
  injuryClass?: InjuryClass
  gcs?: number
  conscious?: boolean
  pulse?: number
  spo2?: number
  systolic?: number
  diastolic?: number
  matched: string[]
}

/** Keyword table: English, Hindi (Devanagari and romanised) and Marathi. */
const INJURY_WORDS: [InjuryClass, RegExp][] = [
  ['head_injury', /head injury|head trauma|सिर (में|पर)? ?चोट|sir (me|par)? ?chot|डोक्याला (मार|इजा)|doka|डोके/i],
  ['major_bleeding', /bleeding|haemorrhage|hemorrhage|chest (trauma|injury)|खून|khoon|रक्तस्त्राव|रक्त/i],
  ['spinal_injury', /spin(e|al)|back injury|neck injury|रीढ़|पाठीचा कणा|मणका/i],
  ['severe_burns', /burns?|जल(ा|ने)|jala|भाजल/i],
  ['stroke', /stroke|face droop|slurred|लकवा|लकवा|पक्षाघात/i],
  ['heart_attack', /chest pain|heart attack|cardiac|दिल का दौरा|सीने में दर्द|seene me dard|हृदयविकार|छातीत दुख/i],
  ['obstetric', /pregnan|labou?r|delivery|गर्भवती|प्रसूती|डिलीवरी/i],
]

const DEVANAGARI_DIGITS = '०१२३४५६७८९'
function normaliseDigits(s: string) {
  return s.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)))
}

export function parseTriage(input: string): ParsedTriage {
  const s = normaliseDigits(input.toLowerCase())
  const out: ParsedTriage = { matched: [] }
  for (const [cls, re] of INJURY_WORDS) {
    const m = s.match(re)
    if (m) {
      out.injuryClass = cls
      out.matched.push(m[0])
      break
    }
  }
  const gcs = s.match(/(?:gcs|g c s|जीसीएस)\s*(?:is|of|=|:)?\s*(\d{1,2})/i)
  if (gcs) {
    const n = Number(gcs[1])
    if (n >= 3 && n <= 15) {
      out.gcs = n
      out.matched.push(gcs[0])
    }
  }
  if (/unconscious|not responding|unresponsive|बेहोश|behosh|बेशुद्ध/.test(s)) {
    out.conscious = false
    out.matched.push('unconscious')
    if (out.gcs === undefined) out.gcs = 8
  } else if (/\bconscious\b|alert|होश में|शुद्धीवर/.test(s)) {
    out.conscious = true
    out.matched.push('conscious')
  }
  const pulse = s.match(/(?:pulse|heart rate|नाड़ी|नाडी)\s*(?:is|of|=|:)?\s*(\d{2,3})/)
  if (pulse) {
    out.pulse = Number(pulse[1])
    out.matched.push(pulse[0])
  }
  const spo2 = s.match(/(?:spo2|sp o2|saturation|oxygen)\s*(?:is|of|=|:)?\s*(\d{2,3})/)
  if (spo2) {
    out.spo2 = Math.min(100, Number(spo2[1]))
    out.matched.push(spo2[0])
  }
  const bp = s.match(/(?:bp|blood pressure)\s*(?:is|of|=|:)?\s*(\d{2,3})\s*(?:\/|over|by)\s*(\d{2,3})/)
  if (bp) {
    out.systolic = Number(bp[1])
    out.diastolic = Number(bp[2])
    out.matched.push(bp[0])
  }
  return out
}

export type VoiceLang = 'en-IN' | 'hi-IN' | 'mr-IN'
export const VOICE_LANGS: { id: VoiceLang; label: string }[] = [
  { id: 'en-IN', label: 'English' },
  { id: 'hi-IN', label: 'Hindi' },
  { id: 'mr-IN', label: 'Marathi' },
]
