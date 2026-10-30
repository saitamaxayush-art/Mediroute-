import { Download, RotateCcw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, InfoTip } from '../../components/ui'
import { ASSUMPTION_LINES } from '../../config/simulation'
import { INJURY_RULES } from '../../data/injuryRules'
import { clockSec, mmss } from '../../engine/text'
import { SignalIcon, type SignalView } from '../../map/markers'
import {
  approveRequest,
  clearNext,
  commandBlocked,
  commandSignal,
  dismissRequest,
  extendHold,
  releaseBehind,
  resetDemo,
  setAdvisory,
  setCorridorMode,
  setHoldCap,
  setWeights,
} from '../../services/api'
import { capOf, corridorLive, heldSeconds, isAhead, tripRemainingS } from '../../sim/step'
import { defaultWeights, get, selCase, setLocal, useAppStore, useSettings, useTrip, useTripSignals } from '../../store/appStore'
import type { LiveSignal, LogEntry, Trip, Weights } from '../../types'

export const STATE_LABEL: Record<SignalView, string> = {
  NORMAL: 'Normal',
  ARMED: 'Armed',
  GREEN_FOR_AMBULANCE: 'Green',
  RED_HOLD: 'Red hold',
  RELEASED: 'Released',
  ADVISED: 'Advised',
}

/** What a signal looks like right now, including advice in advisory mode. */
export const viewOf = (g: LiveSignal): SignalView => (g.advised && g.state !== 'RELEASED' ? 'ADVISED' : g.state)

const CHIP: Record<SignalView, string> = {
  NORMAL: 'border-line bg-white text-ink',
  ARMED: 'border-amber bg-[#F6EBD3] text-amber',
  GREEN_FOR_AMBULANCE: 'border-route bg-route text-white',
  RED_HOLD: 'border-signal bg-signal text-white',
  RELEASED: 'border-line bg-paper-2 text-ink-2',
  ADVISED: 'border-dashed border-ink-2 bg-white text-ink-2',
}

/** Small control panel for one junction. Used from the map and from the trip bar. */
export function SignalPanel({ g, onClose }: { g: LiveSignal; onClose?: () => void }) {
  const trip = useTrip()
  const st = useSettings()
  if (!trip) return null
  const why = commandBlocked(g, trip, st)
  const ahead = g.distanceAlongRoute - trip.progressM
  const view = viewOf(g)
  const held = heldSeconds(g, trip)
  const cap = capOf(g, st.holdCap)
  return (
    <div className="w-[280px] space-y-3 text-left font-sans">
      <div className="flex items-start gap-3">
        <SignalIcon state={view} heading={0} size={48} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold leading-tight">
            {g.code} {g.name}
          </p>
          <p className="mt-0.5 text-[12px] text-ink-2">
            {isAhead(g, trip) ? (ahead > 1 ? `${Math.round(ahead)} m ahead` : 'Ambulance at the stop line') : 'Passed'}, approach {g.ambulanceApproach}
          </p>
          <p className="mt-1 text-[13px] font-medium">
            {STATE_LABEL[view]}
            {g.advised ? ` (${g.advised.toLowerCase()} advised)` : ''}
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close signal controls" className="grid h-8 w-8 shrink-0 place-items-center rounded-[4px] hover:bg-paper-2">
            <X size={15} aria-hidden />
          </button>
        )}
      </div>
      {g.state === 'GREEN_FOR_AMBULANCE' && (
        <div className="flex items-center justify-between gap-2 rounded-[4px] border border-line bg-paper px-3 py-2">
          <span className={`font-mono text-[12px] tnum ${held > cap * 0.75 ? 'text-signal' : ''}`}>
            HOLD {Math.round(held)}s of {cap}s
          </span>
          <button type="button" disabled={g.extended} onClick={() => extendHold(g.id)} className="text-[13px] text-route underline-offset-4 hover:underline disabled:text-ink-2 disabled:no-underline">
            {g.extended ? 'Extended' : 'Extend 20s'}
          </button>
        </div>
      )}
      {ahead > 2000 && <p className="text-[12px] text-ink-2">Far ahead: a command now pre-sets this junction.</p>}
      {st.advisory && !st.signalLinkLost && <p className="text-[12px] text-amber">Advisory mode: commands are sent to traffic police as advice.</p>}
      {why ? (
        <p className="text-[13px] text-ink-2">{why}.</p>
      ) : (
        <div className="grid gap-2">
          <Button onClick={() => commandSignal(g.id, 'green')}>Green for ambulance</Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="danger" onClick={() => commandSignal(g.id, 'red')}>
              Hold (red)
            </Button>
            <Button variant="secondary" onClick={() => commandSignal(g.id, 'normal')}>
              Return to normal
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function RequestChips() {
  const trip = useTrip()
  const requests = useAppStore((s) => s.requests)
  const signals = useAppStore((s) => s.signals)
  const pending = requests.filter((r) => r.status === 'pending' && r.tripId === trip?.id)
  if (!pending.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {pending.map((r) => {
        const g = signals[r.signalId]
        return (
          <div key={r.id} className="flex items-center gap-3 rounded-[4px] border border-amber bg-[#F6EBD3] px-3 py-1.5 text-[13px]" role="status">
            <span>
              Ambulance requests green at <strong>{g ? `${g.code} ${g.name}` : 'next junction'}</strong>
            </span>
            <button type="button" onClick={() => approveRequest(r.id)} className="min-h-8 rounded-[4px] bg-route px-3 text-[13px] font-medium text-white">
              Approve
            </button>
            <button type="button" onClick={() => dismissRequest(r.id)} className="text-[13px] underline-offset-4 hover:underline">
              Dismiss
            </button>
          </div>
        )
      })}
    </div>
  )
}

function EtaReadout({ trip }: { trip: Trip }) {
  const signals = useAppStore((s) => s.signals)
  const st = useSettings()
  const left = tripRemainingS(trip, signals, st)
  const live = corridorLive(trip, st)
  const saved = live ? Math.max(0, (trip.eta.normalS - trip.eta.corridorS - trip.waitedS) / 60) : 0
  return (
    <div className="shrink-0 text-right font-mono text-[12px] leading-tight tnum">
      <p>
        ETA {mmss(left)}
        {trip.waitedS > 1 && <span className="text-signal"> (+{mmss(trip.waitedS)} waiting)</span>}
      </p>
      <p className="text-route">{saved.toFixed(1)} min saved, simulated</p>
    </div>
  )
}

/** Trip bar under the map: junction chips, bulk commands, corridor mode, requests and the waiting banner. */
export function TripBar() {
  const trip = useTrip()
  const sigs = useTripSignals()
  const st = useSettings()
  const selected = useAppStore((s) => s.selectedSignalId)
  if (!trip || trip.status !== 'enroute') return null
  const L = trip.route.distance || 1
  const pct = Math.min(100, (trip.progressM / L) * 100)
  const waiting = trip.waitingAt ? sigs.find((g) => g.id === trip.waitingAt) : null
  const nextUp = sigs.find((g) => isAhead(g, trip))
  const manual = st.corridorMode === 'manual'
  const disabled = st.signalLinkLost
  return (
    <div className="shrink-0 space-y-3 border-t border-line bg-paper px-5 py-3" aria-label="Trip and signal control">
      {waiting && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] bg-signal px-3 py-2 text-[14px] text-white" role="alert">
          <span>
            Ambulance waiting at {waiting.code} {waiting.name}. Clear signal.
          </span>
          {!disabled && (
            <button type="button" onClick={() => commandSignal(waiting.id, 'green')} className="min-h-8 rounded-[4px] bg-white px-3 text-[13px] font-medium text-signal">
              Clear signal
            </button>
          )}
        </div>
      )}
      <RequestChips />
      <div className="relative h-1.5 rounded-[2px] bg-paper-2">
        <div className="absolute inset-y-0 left-0 rounded-[2px] bg-route" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Signals on the route">
        {sigs.map((g) => {
          const passed = !isAhead(g, trip)
          const view = viewOf(g)
          const isNext = g.id === nextUp?.id
          return (
            <button
              key={g.id}
              type="button"
              disabled={passed}
              aria-pressed={selected === g.id}
              title={`${g.code} ${g.name}: ${STATE_LABEL[view]}${passed ? ', passed' : `, ${Math.round(g.distanceAlongRoute - trip.progressM)} m ahead`}`}
              onClick={() => setLocal({ selectedSignalId: selected === g.id ? null : g.id })}
              className={`flex min-h-8 items-center gap-1.5 rounded-[4px] border px-2 font-mono text-[12px] ${CHIP[view]} ${passed ? 'opacity-50' : ''} ${selected === g.id ? 'outline outline-2 outline-offset-1 outline-ink' : ''} ${isNext && manual ? 'ring-2 ring-route/40' : ''}`}
            >
              {g.code}
              <span className="hidden sm:inline">{passed ? 'passed' : STATE_LABEL[view].toLowerCase()}</span>
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex gap-1 rounded-[4px] border border-line bg-white p-1" role="radiogroup" aria-label="Corridor control">
          {(['auto', 'manual'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={st.corridorMode === m} onClick={() => st.corridorMode !== m && setCorridorMode(m)} className={`h-8 rounded-[3px] px-3 text-[13px] font-medium capitalize ${st.corridorMode === m ? 'bg-route-soft text-route' : 'hover:text-route'}`}>
              {m}
            </button>
          ))}
        </div>
        <Button variant={manual ? 'primary' : 'secondary'} disabled={disabled || !nextUp} onClick={() => clearNext(1)}>
          Clear next junction
        </Button>
        <button type="button" disabled={disabled} onClick={() => clearNext(2)} className="text-[14px] text-route underline-offset-4 hover:underline disabled:opacity-40">
          Clear next 2
        </button>
        <button type="button" disabled={disabled} onClick={() => releaseBehind()} className="text-[14px] text-route underline-offset-4 hover:underline disabled:opacity-40">
          Release all behind
        </button>
        <div className="ml-auto">
          <EtaReadout trip={trip} />
        </div>
      </div>
      {manual && nextUp && !disabled && <p className="text-[12px] text-ink-2">Manual control: suggested target is {nextUp.code} {nextUp.name}.</p>}
    </div>
  )
}

const KINDS: (LogEntry['kind'] | 'all')[] = ['all', 'case', 'filter', 'confirm', 'bed', 'corridor', 'signal', 'reroute', 'arrival', 'hospital', 'system']

export function AuditLog() {
  const log = useAppStore((s) => s.auditLog)
  const [kind, setKind] = useState<(typeof KINDS)[number]>('all')
  const list = kind === 'all' ? log : log.filter((l) => l.kind === kind)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight })
  }, [list.length])
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mediroute-audit-${Date.now()}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center gap-3">
        <label className="sr-only" htmlFor="logf">
          Filter log
        </label>
        <select id="logf" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="h-10 flex-1 rounded-[4px] border border-line bg-white px-3 text-[14px] capitalize">
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k === 'all' ? 'All events' : k}
            </option>
          ))}
        </select>
        <Button variant="secondary" onClick={exportJson}>
          <Download size={15} aria-hidden /> Download JSON
        </Button>
      </div>
      <div ref={box} className="min-h-0 flex-1 overflow-y-auto rounded-[4px] border border-line bg-white p-3" role="log" aria-live="polite">
        {list.length === 0 && <p className="text-[14px] text-ink-2">Nothing logged yet.</p>}
        {list.map((l) => (
          <p key={l.id} className="font-mono text-[12px] leading-[1.6] tnum">
            <span className="text-ink-2">{clockSec(l.t)}</span> <span className={l.kind === 'reroute' || l.kind === 'hospital' ? 'text-amber' : l.kind === 'arrival' || l.kind === 'corridor' ? 'text-route' : 'text-ink-2'}>[{l.actor.toUpperCase()}]</span> {l.text}
          </p>
        ))}
      </div>
    </div>
  )
}

const SEG: { k: keyof Weights; label: string }[] = [
  { k: 'eta', label: 'ETA' },
  { k: 'capability', label: 'Capability' },
  { k: 'beds', label: 'Beds' },
  { k: 'erLoad', label: 'ER load' },
]

function WeightsEditor() {
  const injury = useAppStore((s) => selCase(s)?.injuryClass ?? s.draft.injuryClass)
  const weights = useAppStore((s) => s.weights)
  const w = weights[injury]
  const change = (k: keyof Weights, val: number) => {
    // Keep the sum at 1: the other three share what is left, in their current proportions.
    const rest = SEG.map((x) => x.k).filter((x) => x !== k)
    const restSum = rest.reduce((a, x) => a + w[x], 0)
    const next = { ...w, [k]: val } as Weights
    for (const x of rest) next[x] = restSum > 0 ? (w[x] / restSum) * (1 - val) : (1 - val) / 3
    setWeights(injury, next)
  }
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-ink-2">For {INJURY_RULES[injury].label.split(' (')[0].toLowerCase()}. The four weights always add up to 1; the ranking re-sorts live.</p>
      {SEG.map((s) => (
        <div key={s.k} className="grid grid-cols-[96px_1fr_44px] items-center gap-3">
          <label htmlFor={`w-${s.k}`} className="text-[14px]">
            {s.label}
          </label>
          <input id={`w-${s.k}`} type="range" min={0} max={0.9} step={0.01} value={w[s.k]} onChange={(e) => change(s.k, Number(e.target.value))} />
          <span className="text-right font-mono text-[13px] tnum">{w[s.k].toFixed(2)}</span>
        </div>
      ))}
      <button type="button" onClick={() => setWeights(injury, defaultWeights()[injury])} className="inline-flex items-center gap-1.5 text-[14px] text-route underline-offset-4 hover:underline">
        <RotateCcw size={13} aria-hidden /> Reset to default
      </button>
    </div>
  )
}

export function SettingsContent({ focusWeights }: { focusWeights?: boolean }) {
  const st = useSettings()
  const ref = useRef<HTMLElement>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  useEffect(() => {
    if (focusWeights) ref.current?.scrollIntoView({ block: 'start' })
  }, [focusWeights])
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="text-[15px] font-bold">Advisory mode</h3>
        <button type="button" role="switch" aria-checked={st.advisory} onClick={() => setAdvisory(!st.advisory)} className="flex min-h-10 items-center gap-3 text-left text-[14px]">
          <span className={`relative h-5 w-9 shrink-0 rounded-[3px] border transition-colors ${st.advisory ? 'border-amber bg-amber' : 'border-ink-2 bg-white'}`}>
            <span className={`absolute top-[2px] h-3.5 w-3.5 rounded-[2px] transition-transform duration-200 ${st.advisory ? 'translate-x-[18px] bg-white' : 'translate-x-[2px] bg-ink-2'}`} />
          </span>
          {st.advisory ? 'On: signal commands go to traffic police as advice' : 'Off: commands change signals'}
        </button>
      </section>
      <section className="space-y-3">
        <h3 className="text-[15px] font-bold">Corridor control</h3>
        <div className="flex gap-1 rounded-[4px] border border-line bg-white p-1" role="radiogroup" aria-label="Corridor control mode">
          {(['auto', 'manual'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={st.corridorMode === m} onClick={() => st.corridorMode !== m && setCorridorMode(m)} className={`h-9 flex-1 rounded-[3px] text-[14px] font-medium capitalize ${st.corridorMode === m ? 'bg-route-soft text-route' : 'hover:text-route'}`}>
              {m}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-ink-2">{st.corridorMode === 'auto' ? 'The system arms and clears 1 to 2 junctions ahead. You can override any signal.' : 'Nothing changes by itself. You clear each junction.'}</p>
      </section>
      <section className="space-y-3">
        <h3 className="text-[15px] font-bold">Cross-traffic cap</h3>
        <label className="flex items-center gap-3 text-[14px]">
          <input type="number" min={15} max={90} defaultValue={st.holdCap} key={st.holdCap} onBlur={(e) => setHoldCap(Math.max(15, Math.min(90, Number(e.target.value) || 40)))} className="h-10 w-20 rounded-[4px] border border-line bg-white px-3 font-mono tnum" />
          seconds, the longest any junction holds cross traffic
        </label>
      </section>
      <section ref={ref} className="scroll-mt-4 space-y-3">
        <h3 className="text-[15px] font-bold">Ranking weights</h3>
        <WeightsEditor />
      </section>
      <section className="space-y-3">
        <h3 className="text-[15px] font-bold">Reset demo</h3>
        <p className="text-[13px] text-ink-2">Returns every open tab to the starting state.</p>
        {confirmReset ? (
          <div className="flex gap-3">
            <Button
              variant="danger"
              onClick={() => {
                setConfirmReset(false)
                resetDemo()
              }}
            >
              Yes, reset everything
            </Button>
            <Button variant="secondary" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={14} aria-hidden /> Reset demo
          </Button>
        )}
      </section>
      <section className="space-y-2 text-[14px]">
        <InfoTip title="Simulation assumptions" lines={ASSUMPTION_LINES} />
        <p className="flex gap-5">
          <Link to="/privacy" className="underline-offset-4 hover:underline">
            Privacy Policy
          </Link>
          <Link to="/terms" className="underline-offset-4 hover:underline">
            Terms
          </Link>
        </p>
      </section>
    </div>
  )
}

/** For components that need the signal currently selected for control. */
export function useSelectedSignal(): LiveSignal | null {
  return useAppStore((s) => (s.selectedSignalId ? s.signals[s.selectedSignalId] ?? null : null))
}

export { get }
