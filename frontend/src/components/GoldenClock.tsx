import { goldenTone } from '../engine/engine'
import { mmss } from '../engine/text'

const TONE = { ok: 'text-ink', warn: 'text-amber', danger: 'text-signal' }

export function GoldenClock({ remainingS, frozen, compact }: { remainingS: number | null; frozen?: boolean; compact?: boolean }) {
  const tone = remainingS === null ? 'ok' : goldenTone(remainingS)
  const color = frozen ? 'text-route' : TONE[tone]
  return (
    <span className={`inline-flex items-baseline gap-2 font-mono uppercase tracking-[0.06em] tnum ${color}`} role="timer" aria-label="Golden hour remaining">
      <span className={compact ? 'hidden text-[10px] sm:inline' : 'text-[11px]'}>Golden hour</span>
      <span className={compact ? 'text-[14px]' : 'text-[17px] font-medium'}>{remainingS === null ? '60:00' : mmss(remainingS)}</span>
    </span>
  )
}
