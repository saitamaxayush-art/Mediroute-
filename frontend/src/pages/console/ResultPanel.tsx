import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Chip } from '../../components/ui'
import { INJURY_RULES } from '../../data/injuryRules'
import { SPECIALIST_LABEL } from '../../data/hospitals'
import { ago, mins, mmss } from '../../engine/text'
import { useNow } from '../../hooks/hooks'
import { approveCorridor, clearCase, computeRanking, dispatch, stopCorridor } from '../../services/api'
import { capOf, heldSeconds, isAhead } from '../../sim/step'
import { get, holdRemainingS, selCase, setLocal, useAppStore, useCase, useSettings, useTrip, useTripSignals } from '../../store/appStore'
import { useShallow } from 'zustand/react/shallow'
import { goldenLeft } from '../../services/api'
import { STATE_LABEL, viewOf } from './ConsoleParts'
import type { Confidence, RankedHospital } from '../../types'
import { useConsoleState } from './state'

const DOT: Record<Confidence, string> = { fresh: 'bg-route', ageing: 'bg-amber', stale: 'bg-signal' }
const link = 'text-[14px] text-route underline-offset-4 hover:underline'

const SEG = [
  { k: 'eta', label: 'ETA', cls: 'bg-route' },
  { k: 'capability', label: 'Capability', cls: 'bg-ink' },
  { k: 'beds', label: 'Beds', cls: 'bg-ink-2' },
  { k: 'erLoad', label: 'ER load', cls: 'bg-[#B9B09D]' },
] as const

function ScoreBars({ r }: { r: RankedHospital }) {
  const total = r.breakdown.eta + r.breakdown.capability + r.breakdown.beds + r.breakdown.erLoad || 1
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-[2px] bg-paper-2" role="img" aria-label={`Score ${r.total.toFixed(2)}`}>
        {SEG.map((s) => (
          <motion.span key={s.k} className={`${s.cls} h-full`} initial={false} animate={{ width: `${(r.breakdown[s.k] / total) * r.total * 100}%` }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {SEG.map((s) => (
          <div key={s.k} className="flex items-center justify-between gap-2 text-[13px]">
            <dt className="flex items-center gap-2">
              <span className={`h-2 w-2 ${s.cls}`} aria-hidden />
              {s.label}
            </dt>
            <dd className="font-mono tnum">{r.breakdown[s.k].toFixed(2)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function statusLine(r: RankedHospital, now: number) {
  const kase = selCase(get())
  const key = kase ? INJURY_RULES[kase.injuryClass].keySpecialist : null
  const parts: string[] = []
  if (key) {
    const sp = r.hospital.specialists[key]
    const name = SPECIALIST_LABEL[key]
    parts.push(sp.presence === 'in_building' ? `${name} in building` : sp.presence === 'on_call' ? `${name} on call, ${sp.onCallMinutes} min` : `No ${name.toLowerCase()}`)
  }
  parts.push(`${r.hospital.beds.icu} ICU bed${r.hospital.beds.icu === 1 ? '' : 's'}`)
  parts.push(ago(r.hospital.lastUpdated, now))
  return parts.join('. ')
}

function HospitalCard({ r, i, open, onToggle }: { r: RankedHospital; i: number; open: boolean; onToggle: () => void }) {
  const now = useNow(5000)
  const match = useCase()?.match ?? null
  const recent = r.hospital.refusals.filter((x) => now - x.time < 24 * 3_600_000)
  return (
    <motion.li layout transition={{ layout: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } }} className="list-none">
      <div className={`rounded-[4px] border bg-white transition-colors duration-200 ${open ? 'border-route' : 'border-line hover:border-ink'}`}>
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-left">
          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-[3px] font-mono text-[12px] ${i === 0 ? 'bg-route text-white' : 'bg-paper-2 text-ink'}`}>{i + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-[15px] font-medium leading-snug">{r.hospital.name}</span>
              <span className="shrink-0 font-mono text-[13px] tnum">
                <span className="font-medium text-route">{mins(r.eta.corridorS).toLowerCase()}</span> <span className="text-ink-2 line-through">{mins(r.eta.normalS).toLowerCase()}</span>
              </span>
            </span>
            <span className="mt-1.5 flex items-start gap-2 text-[13px] leading-snug text-ink-2">
              <span className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${DOT[r.confidence]}`} aria-label={`Data ${r.confidence}`} />
              {statusLine(r, now)}
            </span>
          </span>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
              <div className="space-y-4 border-t border-line px-4 pb-4 pt-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] text-ink-2">Score</span>
                  <span className="font-mono text-[15px] font-medium tnum">{r.total.toFixed(2)}</span>
                </div>
                <ScoreBars r={r} />
                {(r.confidenceFactor < 1 || r.specialistPenalty > 0 || r.refusalPenalty > 0) && (
                  <p className="text-[13px] text-ink-2">
                    Raw {r.raw.toFixed(2)}
                    {r.confidenceFactor < 1 && `, x${r.confidenceFactor} for data age`}
                    {r.specialistPenalty > 0 && `, -${r.specialistPenalty.toFixed(2)} specialist on call`}
                    {r.refusalPenalty > 0 && `, -${r.refusalPenalty.toFixed(2)} refusals`}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {r.hospital.cashlessScheme && <Chip tone="ink">Cashless{r.cashlessTieBreak ? ', tie-break' : ''}</Chip>}
                  <Chip tone={recent.length ? 'amber' : 'muted'}>
                    {recent.length} refusal{recent.length === 1 ? '' : 's'} in 24 h
                  </Chip>
                </div>
                {recent.length > 0 && <p className="text-[13px] text-ink-2">Refusals: {recent.map((x) => x.reason).join(', ')}.</p>}
                {match && <p className="text-[13px] text-ink-2">Ambulance: {match.reason}.</p>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  )
}

function Removed() {
  const s = useAppStore(useShallow((x) => ({ cases: x.cases, activeCaseId: x.activeCaseId, hospitals: x.hospitals, weights: x.weights, liveRoutes: x.liveRoutes, excluded: x.excluded })))
  const ranking = computeRanking(s)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  if (!ranking) return null
  const n = ranking.filtered.length
  return (
    <div ref={ref} className="relative">
      <button type="button" className={link} onClick={() => setOpen((x) => !x)} aria-expanded={open}>
        {n} hospital{n === 1 ? '' : 's'} removed
      </button>
      {open && (
        <div className="float absolute left-0 top-8 z-20 w-[320px] rounded-[4px] border border-line bg-white p-4" role="dialog" aria-label="Removed hospitals">
          <ul className="space-y-3">
            {ranking.filtered.map((f) => (
              <li key={f.hospital.id}>
                <p className="text-[14px] font-medium">{f.hospital.name}</p>
                <p className="text-[13px] text-signal">{f.reasons.join(', ')}</p>
              </li>
            ))}
          </ul>
          {ranking.ranked.length > 3 && <p className="mt-3 text-[13px] text-ink-2">{ranking.ranked.length - 3} more can treat but rank lower.</p>}
        </div>
      )}
    </div>
  )
}

function Ranked({ onWeights }: { onWeights: () => void }) {
  const s = useAppStore(useShallow((x) => ({ cases: x.cases, activeCaseId: x.activeCaseId, hospitals: x.hospitals, weights: x.weights, liveRoutes: x.liveRoutes, excluded: x.excluded })))
  useNow(30_000)
  const ranking = computeRanking(s)
  const [open, setOpen] = useState<string | null>(null)
  if (!ranking) return null
  const top = ranking.ranked.slice(0, 3)
  const target = (open && top.find((r) => r.hospital.id === open)) || top[0]
  const select = (id: string) => {
    setOpen((o) => (o === id ? null : id))
    setLocal({ selectedHospitalId: id })
  }
  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <p className="text-[13px] text-ink-2">Needs {ranking.required.map((r) => r.label).join(', ')}</p>
        {top.length === 0 && <p className="rounded-[4px] border border-signal bg-white p-4 text-[14px] text-signal">No hospital can treat this patient right now. Escalate to the control room.</p>}
        <ol className="space-y-3">
          {top.map((r, i) => (
            <HospitalCard key={r.hospital.id} r={r} i={i} open={open === r.hospital.id} onToggle={() => select(r.hospital.id)} />
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Removed />
          <button type="button" className={link} onClick={onWeights}>
            Ranking weights
          </button>
        </div>
      </div>
      {target && (
        <div className="border-t border-line p-5">
          <Button className="w-full" size="lg" arrow onClick={() => dispatch(target.hospital.id)}>
            Confirm and dispatch
          </Button>
          <p className="mt-2 truncate text-center text-[13px] text-ink-2">To {target.hospital.name}</p>
        </div>
      )}
    </>
  )
}

function Dispatched() {
  const trip = useTrip()!
  const h = useAppStore((s) => s.hospitals.find((x) => x.id === trip.hospitalId))
  const advisory = useAppStore((s) => s.settings.advisory || s.settings.signalLinkLost)
  const holdLeft = useAppStore((s) => (h ? holdRemainingS(s, h) : null))
  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div className="card p-4">
          <p className="text-[12px] text-ink-2">Dispatched to</p>
          <p className="mt-0.5 text-[17px] font-bold leading-tight">{h?.name}</p>
          <p className="mt-2 font-mono text-[14px] tnum">
            <span className="font-medium text-route">{mins(trip.eta.corridorS).toLowerCase()}</span> <span className="text-ink-2 line-through">{mins(trip.eta.normalS).toLowerCase()}</span>
          </p>
          {h?.bedHold && (
            <div className="mt-3">
              <Chip tone="green">ICU bed held {mmss(holdLeft ?? 0)}</Chip>
            </div>
          )}
        </div>
        <p className="text-[14px] text-ink-2">
          {advisory
            ? 'Advisory mode is on. Approving sends the corridor to traffic police as advice; signals do not change.'
            : 'Signals are on their normal cycle. Approve the corridor, or clear junctions one by one from the trip bar or the map.'}
        </p>
      </div>
      <div className="border-t border-line p-5">
        <Button className="w-full" size="lg" onClick={() => approveCorridor()}>
          Approve corridor
        </Button>
      </div>
    </>
  )
}

function Corridor() {
  const trip = useTrip()!
  const h = useAppStore((s) => s.hospitals.find((x) => x.id === trip.hospitalId))
  const st = useSettings()
  const sigs = useTripSignals()
  const next = sigs.find((g) => isAhead(g, trip))
  const green = sigs.find((g) => g.state === 'GREEN_FOR_AMBULANCE')
  const active = trip.corridor === 'active'
  const saved = Math.max(0, (trip.eta.normalS - trip.eta.corridorS - trip.waitedS) / 60)
  const view = next ? viewOf(next) : null
  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <p className="text-[14px]">
          To <strong>{h?.name}</strong>, {st.corridorMode} control
        </p>
        {!active && <Chip tone={trip.corridor === 'failed' ? 'red' : 'amber'}>{trip.corridor === 'failed' ? 'Signal link lost, normal cycle' : 'Advised to traffic police'}</Chip>}
        <button type="button" disabled={!next} onClick={() => next && setLocal({ selectedSignalId: next.id })} className="card block w-full p-4 text-left hover:border-ink disabled:hover:border-line">
          <p className="text-[12px] text-ink-2">Next signal{next ? `, ${next.code} ${next.name}` : ''}</p>
          <p className={`mt-1 text-[24px] font-bold uppercase leading-tight ${view === 'GREEN_FOR_AMBULANCE' ? 'text-route' : view === 'RED_HOLD' ? 'text-signal' : view === 'ARMED' ? 'text-amber' : 'text-ink'}`}>
            {view ? STATE_LABEL[view] : 'No more signals'}
          </p>
          {next && <p className="mt-1 font-mono text-[13px] tnum text-ink-2">in {Math.max(0, Math.round((next.distanceAlongRoute - trip.progressM) / 10) * 10)} m</p>}
        </button>
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-4">
            <p className="text-[12px] text-ink-2">Time saved</p>
            <p className="mt-1 font-mono text-[20px] font-medium text-route tnum">{active ? `${saved.toFixed(1)} min` : '0 min'}</p>
            <p className="text-[11px] text-ink-2">Simulated</p>
          </div>
          <div className="card p-4">
            <p className="text-[12px] text-ink-2">Cross-traffic hold</p>
            <p className="mt-1 font-mono text-[20px] font-medium tnum">{green ? `${Math.round(heldSeconds(green, trip))}s` : '0s'}</p>
            <p className="text-[11px] text-ink-2">Cap {green ? capOf(green, st.holdCap) : st.holdCap}s</p>
          </div>
        </div>
      </div>
      {active && (
        <div className="border-t border-line p-5">
          <Button className="w-full" variant="secondary" onClick={() => stopCorridor()}>
            Stop corridor
          </Button>
        </div>
      )}
    </>
  )
}

function Arrived() {
  const trip = useTrip()!
  const h = useAppStore((s) => s.hospitals.find((x) => x.id === trip.hospitalId))
  const done = useAppStore((s) => s.completedTrips.find((c) => c.id === trip.id))
  const kase = useCase()
  const greens = done ? done.signals.filter((x) => x.greenAt !== null).length : 0
  const rows: [string, string][] = [
    ['Golden hour left', mmss(goldenLeft(kase) ?? 0)],
    ['Signals cleared', String(greens)],
    ['Minutes saved', `${(done?.minutesSaved ?? 0).toFixed(1)} (simulated)`],
    ['Re-routes', String(trip.reroutes)],
  ]
  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div>
          <p className="text-[12px] text-ink-2">Arrived at</p>
          <p className="mt-0.5 text-[17px] font-bold leading-tight">{h?.name}</p>
        </div>
        <dl className="card divide-y divide-line">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 px-4 py-3">
              <dt className="text-[13px] text-ink-2">{k}</dt>
              <dd className="font-mono text-[14px] tnum">{v}</dd>
            </div>
          ))}
        </dl>
        <Link to="/replay" className={link}>
          View replay
        </Link>
      </div>
      <div className="border-t border-line p-5">
        <Button className="w-full" size="lg" onClick={() => clearCase()}>
          Start new case
        </Button>
      </div>
    </>
  )
}

export function ResultPanel({ onWeights }: { onWeights: () => void }) {
  const state = useConsoleState()
  const titles = { idle: 'Result', ranked: 'Best matches', dispatched: 'Dispatched', corridor: 'Corridor', arrived: 'Arrived' }
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center border-b border-line px-5">
        <h2 className="text-[16px] font-bold">{titles[state]}</h2>
      </div>
      {state === 'idle' && <p className="p-5 text-[14px] text-ink-2">Results appear here.</p>}
      {state === 'ranked' && <Ranked onWeights={onWeights} />}
      {state === 'dispatched' && <Dispatched />}
      {state === 'corridor' && <Corridor />}
      {state === 'arrived' && <Arrived />}
    </div>
  )
}
