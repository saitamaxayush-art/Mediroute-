import { AlertTriangle, ClipboardList, Copy, Mic, MessageSquare, Radio, Send, WifiOff } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { GoldenClock } from '../components/GoldenClock'
import { VoiceTriage } from '../components/VoiceTriage'
import { Button, Chip } from '../components/ui'
import { INJURY_RULES } from '../data/injuryRules'
import { along } from '../engine/geo'
import { clock, handoverNote, mins, smsText } from '../engine/text'
import type { ParsedTriage } from '../engine/voice'
import { useMedia, useOnline, usePageMeta } from '../hooks/hooks'
import { BaseMap } from '../map/BaseMap'
import { TripLayers } from '../map/TripLayers'
import { approveCorridor, computeRanking, dispatch, loadDemoCase, reportBlockedRoad, requestGreen, sendHandoverNote, updateCase } from '../services/api'
import { isAhead, polylineOf, tripRemainingS } from '../sim/step'
import { get, selCase, toast, useAppStore, useCase, useRole, useSettings, useTrip, useTripSignals } from '../store/appStore'
import { STATE_LABEL, viewOf } from './console/ConsoleParts'
import { useGolden } from './console/Console'
import type { Vitals } from '../types'

type Queued = { kind: 'triage'; patch: Parameters<typeof updateCase>[0] } | { kind: 'blocked' } | { kind: 'handover'; text: string }
type Tab = 'triage' | 'handover' | 'status'
const SYNC_KEY = 'mediroute.hospitalsSyncedAt'

function readSynced(): number {
  try {
    return Number(localStorage.getItem(SYNC_KEY)) || Date.now()
  } catch {
    return Date.now()
  }
}

/** All paramedic state and actions, shared by the desktop and mobile layouts. */
function useParamedic() {
  const browserOnline = useOnline()
  const st = useSettings()
  const online = browserOnline && st.networkUp
  const trip = useTrip()
  const kase = useCase()
  const hospitals = useAppStore((s) => s.hospitals)
  const signals = useAppStore((s) => s.signals)
  const sigs = useTripSignals()
  const sentNote = useAppStore((s) => (kase ? s.handoverNotes[kase.id] ?? null : null))
  const pendingReq = useAppStore((s) => s.requests.some((r) => r.status === 'pending' && r.tripId === trip?.id))
  const [queue, setQueue] = useState<Queued[]>([])
  const [syncedAt, setSyncedAt] = useState(readSynced)
  const h = trip ? hospitals.find((x) => x.id === trip.hospitalId) : null

  // Remember when the hospital list was last fresh, for the offline banner.
  useEffect(() => {
    if (!online) return
    const t = Date.now()
    setSyncedAt(t)
    try {
      localStorage.setItem(SYNC_KEY, String(t))
    } catch {
      // Not critical.
    }
  }, [online, hospitals])

  // Flush queued actions when the network returns.
  useEffect(() => {
    if (!online || queue.length === 0) return
    for (const q of queue) {
      if (q.kind === 'triage') updateCase(q.patch, 'paramedic')
      if (q.kind === 'blocked') reportBlockedRoad('paramedic')
      if (q.kind === 'handover') sendHandoverNote(q.text)
    }
    toast('ok', `Back online. ${queue.length} queued action${queue.length > 1 ? 's' : ''} synced.`)
    setQueue([])
  }, [online, queue])

  const act = (q: Queued, run: () => void) => (online ? run() : setQueue((x) => [...x, q]))
  const etaLeft = trip ? tripRemainingS(trip, signals, st) : null
  const nextSig = trip && trip.status === 'enroute' ? sigs.find((g) => isAhead(g, trip)) ?? null : null
  const next = nextSig && trip ? { g: nextSig, dist: nextSig.distanceAlongRoute - trip.progressM, waiting: trip.waitingAt === nextSig.id, requested: pendingReq } : null
  const note = kase && h ? handoverNote(kase, h.name, etaLeft) : ''

  return {
    online,
    trip,
    kase,
    h,
    queue,
    syncedAt,
    sent: !!sentNote,
    sentAt: sentNote?.ts ?? null,
    next,
    etaLeft,
    note,
    sms: kase && h ? smsText(kase, h.name, etaLeft) : '',
    onParsed: (p: ParsedTriage) => {
      const patch: Parameters<typeof updateCase>[0] = {}
      if (p.injuryClass) patch.injuryClass = p.injuryClass
      if (p.gcs !== undefined) patch.gcs = p.gcs
      if (p.conscious !== undefined) patch.conscious = p.conscious
      if (kase) {
        const v: Partial<Vitals> = {}
        if (p.pulse) v.pulse = p.pulse
        if (p.spo2) v.spo2 = p.spo2
        if (p.systolic) v.systolic = p.systolic
        if (p.diastolic) v.diastolic = p.diastolic
        if (Object.keys(v).length) patch.vitals = { ...kase.vitals, ...v }
      }
      act({ kind: 'triage', patch }, () => updateCase(patch, 'paramedic'))
    },
    sendNote: () =>
      act({ kind: 'handover', text: note }, () => {
        sendHandoverNote(note)
        toast('ok', `Sent to ${h?.name}`)
      }),
    block: () => act({ kind: 'blocked' }, () => reportBlockedRoad('paramedic')),
  }
}
type P = ReturnType<typeof useParamedic>

async function startDemo() {
  await loadDemoCase()
  const top = computeRanking(get())?.ranked[0]
  if (top) {
    await dispatch(top.hospital.id)
    await approveCorridor()
  }
}

const TripMap = memo(function TripMap() {
  const tripId = useAppStore((s) => s.activeTripId)
  const kaseId = useAppStore((s) => s.activeCaseId)
  // The case location keeps its reference across clock ticks, so this only reruns on a new case.
  const caseLoc = useAppStore((s) => selCase(s)?.location ?? null)
  const start = useMemo(() => {
    const t = tripId ? get().trips[tripId] : null
    return t ? along(polylineOf(t.route), t.progressM).p : caseLoc ?? ([73.8296, 18.5293] as [number, number])
  }, [tripId, caseLoc])
  return (
    <BaseMap key={tripId ?? kaseId ?? 'none'} center={start} zoom={15} label="Paramedic navigation map">
      <TripLayers id="para" follow />
    </BaseMap>
  )
})

function Destination({ p }: { p: P }) {
  const golden = useGolden()
  if (p.kase && !p.trip)
    return (
      <div>
        <p className="text-[13px] text-ink-2">Case assigned, {p.kase.id}</p>
        <p className="text-[20px] font-bold leading-tight">{INJURY_RULES[p.kase.injuryClass].label.split(' (')[0]}, GCS {p.kase.gcs}</p>
        <p className="mt-1 text-[14px] text-ink-2">{p.kase.locationLabel}. Waiting for the operator to dispatch.</p>
      </div>
    )
  if (!p.trip || !p.h)
    return (
      <div className="space-y-4">
        <p className="text-[15px] text-ink-2">No active trip. Start one from the operator console, or run the demo trip here.</p>
        <Button className="w-full" size="lg" onClick={startDemo} arrow>
          Run the demo trip
        </Button>
      </div>
    )
  return (
    <div>
      <p className="text-[13px] text-ink-2">{p.trip.status === 'arrived' ? 'Arrived at' : 'Destination'}</p>
      <p className="text-[20px] font-bold leading-tight">{p.h.name}</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <p className="font-mono text-[15px] tnum">
          <span className="text-[22px] font-medium text-route">{p.trip.status === 'arrived' ? 'Arrived' : `${mins(p.etaLeft ?? 0).toLowerCase()} left`}</span> <span className="text-ink-2">({mins(p.trip.eta.corridorS).toLowerCase()} corridor, {mins(p.trip.eta.normalS).toLowerCase()} normal)</span>
        </p>
        <GoldenClock remainingS={golden.remaining} frozen={golden.frozen} compact />
      </div>
    </div>
  )
}

function NextSignal({ p }: { p: P }) {
  if (!p.next || !p.trip) return null
  const { g, dist, waiting, requested } = p.next
  const view = viewOf(g)
  const green = view === 'GREEN_FOR_AMBULANCE'
  const red = view === 'RED_HOLD' || waiting
  const word = green ? 'GREEN' : view === 'RED_HOLD' ? 'RED, operator notified' : waiting ? 'RED, operator notified' : view === 'ARMED' ? 'Turning green' : view === 'ADVISED' ? 'Advised to police' : 'Normal cycle'
  return (
    <div className={`rounded-[4px] border p-4 ${green ? 'border-route bg-route text-white' : red ? 'border-signal bg-white' : 'border-line bg-white'}`} aria-live="polite">
      <p className={`text-[13px] ${green ? 'text-white' : 'text-ink-2'}`}>
        Next signal, {g.code} {g.name}
      </p>
      <p className={`mt-1 text-[26px] font-bold uppercase leading-tight tnum ${red && !green ? 'text-signal' : ''}`}>
        {word}
        {!waiting && ` in ${Math.max(0, Math.round(dist / 10) * 10)} m`}
      </p>
      {!green && (
        <button
          type="button"
          onClick={requestGreen}
          disabled={requested || p.trip.status !== 'enroute'}
          className="mt-3 flex min-h-12 w-full items-center justify-center rounded-[4px] border border-route bg-white text-[15px] font-medium text-route disabled:opacity-60"
        >
          {requested ? 'Green requested, waiting for operator' : 'Request green'}
        </button>
      )}
      <span className="sr-only">{STATE_LABEL[view]}</span>
    </div>
  )
}

function TabBody({ p, tab }: { p: P; tab: Tab }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(p.note)
      toast('ok', 'Handover note copied')
    } catch {
      toast('warn', 'Copy not allowed in this browser')
    }
  }
  if (tab === 'triage')
    return p.kase ? (
      <div className="space-y-4">
        <VoiceTriage onParsed={p.onParsed} big primary />
        <dl className="card grid grid-cols-2 divide-x divide-line">
          <div className="p-3">
            <dt className="text-[12px] text-ink-2">Injury</dt>
            <dd className="text-[15px] font-medium">{INJURY_RULES[p.kase.injuryClass].label.split(' (')[0]}</dd>
          </div>
          <div className="p-3">
            <dt className="text-[12px] text-ink-2">GCS</dt>
            <dd className="text-[15px] font-medium">
              {p.kase.gcs}, {p.kase.conscious ? 'conscious' : 'unconscious'}
            </dd>
          </div>
        </dl>
      </div>
    ) : (
      <p className="text-[15px] text-ink-2">Triage opens once a case is active.</p>
    )
  if (tab === 'handover')
    return p.note ? (
      <div className="space-y-4">
        <pre className="card whitespace-pre-wrap p-4 font-mono text-[12px] leading-[1.6]">{p.note}</pre>
        <div className="grid grid-cols-2 gap-3">
          <Button size="lg" onClick={p.sendNote}>
            <Send size={16} aria-hidden /> {p.sent ? 'Sent, send again' : 'Send to ER'}
          </Button>
          <Button size="lg" variant="secondary" onClick={copy}>
            <Copy size={16} aria-hidden /> Copy
          </Button>
        </div>
        <p className="text-[13px] text-ink-2">No patient name is collected.</p>
      </div>
    ) : (
      <p className="text-[15px] text-ink-2">The handover note writes itself once the trip starts.</p>
    )
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Chip tone={p.online ? 'green' : 'red'}>{p.online ? 'Online' : 'Offline'}</Chip>
        <span className="text-[14px] text-ink-2">
          {p.queue.length} queued action{p.queue.length === 1 ? '' : 's'}
        </span>
      </div>
      {!p.online && (
        <p className="flex gap-2 rounded-[4px] border border-line bg-white p-3 text-[14px]">
          <WifiOff size={16} className="mt-0.5 shrink-0" aria-hidden /> Offline. Using hospital list from {clock(p.syncedAt)}. Will sync when back online.
        </p>
      )}
      {p.sms ? (
        <div className={`rounded-[4px] border p-3 ${p.online ? 'border-line bg-white' : 'border-amber bg-[#F6EBD3]'}`}>
          <p className="flex items-center gap-2 text-[13px] font-medium text-amber">
            <MessageSquare size={14} aria-hidden /> SMS fallback {p.online ? 'preview' : 'active'}, to {p.h?.name}
          </p>
          <p className="mt-2 break-words font-mono text-[13px]">{p.sms}</p>
          <p className="mt-1 font-mono text-[11px] text-ink-2">{p.sms.length} characters</p>
        </div>
      ) : (
        <p className="text-[14px] text-ink-2">The SMS preview appears once the trip starts.</p>
      )}
      <p className="flex gap-5 text-[14px]">
        <Link to="/privacy" className="underline-offset-4 hover:underline">
          Privacy Policy
        </Link>
        <Link to="/terms" className="underline-offset-4 hover:underline">
          Terms
        </Link>
      </p>
    </div>
  )
}

function BlockButton({ p }: { p: P }) {
  const [confirm, setConfirm] = useState(false)
  if (p.trip?.status !== 'enroute') return null
  return confirm ? (
    <div className="rounded-[4px] border border-signal bg-white p-4">
      <p className="text-[15px]">Report the road ahead as blocked? The trip switches to another route.</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Button
          size="lg"
          variant="danger"
          onClick={() => {
            setConfirm(false)
            p.block()
          }}
        >
          Yes, blocked
        </Button>
        <Button size="lg" variant="secondary" onClick={() => setConfirm(false)}>
          Cancel
        </Button>
      </div>
    </div>
  ) : (
    <button type="button" onClick={() => setConfirm(true)} className="flex h-14 w-full items-center justify-center gap-2 rounded-[4px] border-2 border-signal bg-white text-[16px] font-bold text-signal hover:bg-[#F6DCD8]">
      <AlertTriangle size={20} aria-hidden /> Report road blocked
    </button>
  )
}

const TABS: { id: Tab; label: string; icon: typeof Mic }[] = [
  { id: 'triage', label: 'Triage', icon: Mic },
  { id: 'handover', label: 'Handover', icon: ClipboardList },
  { id: 'status', label: 'Status', icon: Radio },
]

function Desktop({ p }: { p: P }) {
  const [tab, setTab] = useState<Tab>('triage')
  return (
    <div className="flex h-full">
      <div className="relative min-w-0 flex-1">
        <TripMap />
      </div>
      <aside className="flex w-[400px] shrink-0 flex-col border-l border-line bg-paper" aria-label="Trip">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <Destination p={p} />
          <NextSignal p={p} />
          <div className="flex gap-1 rounded-[4px] border border-line bg-white p-1" role="tablist" aria-label="Paramedic tools">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`h-10 flex-1 rounded-[3px] text-[14px] font-medium ${tab === t.id ? 'bg-route-soft text-route' : 'text-ink hover:text-route'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel">
            <TabBody p={p} tab={tab} />
          </div>
        </div>
        {p.trip?.status === 'enroute' && (
          <div className="border-t border-line p-5">
            <BlockButton p={p} />
          </div>
        )}
      </aside>
    </div>
  )
}

const COLLAPSED = 176
function Mobile({ p }: { p: P }) {
  const [tab, setTab] = useState<Tab>('triage')
  const tall = () => Math.round(window.innerHeight * 0.72)
  const [h, setH] = useState(COLLAPSED)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ y: number; h: number } | null>(null)
  const expanded = h > COLLAPSED + 40

  const onDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, h }
    setDragging(true)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    setH(Math.max(COLLAPSED, Math.min(tall(), drag.current.h + drag.current.y - e.clientY)))
  }
  const onUp = () => {
    if (!drag.current) return
    const mid = (COLLAPSED + tall()) / 2
    setH(h > mid ? tall() : COLLAPSED)
    drag.current = null
    setDragging(false)
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="relative min-h-0 flex-1">
        <TripMap />
        <section
          className={`absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-[8px] border-t border-line bg-paper shadow-[0_-8px_24px_rgba(0,0,0,0.08)] ${dragging ? '' : 'transition-[height] duration-300 ease-out'}`}
          style={{ height: h }}
          aria-label="Trip details"
        >
          <button
            type="button"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onClick={() => !dragging && setH(expanded ? COLLAPSED : tall())}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse trip details' : 'Expand trip details'}
            className="flex h-8 w-full shrink-0 touch-none items-center justify-center"
          >
            <span className="h-1 w-10 rounded-[2px] bg-ink-2" aria-hidden />
          </button>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
            <Destination p={p} />
            <NextSignal p={p} />
            {expanded && (
              <>
                <TabBody p={p} tab={tab} />
                <BlockButton p={p} />
              </>
            )}
          </div>
        </section>
      </div>
      <nav className="grid h-16 shrink-0 grid-cols-3 border-t border-line bg-paper" role="tablist" aria-label="Paramedic tools">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id)
              setH(tall())
            }}
            className={`flex min-h-12 flex-col items-center justify-center gap-1 text-[12px] font-medium ${tab === t.id ? 'text-route' : 'text-ink'}`}
          >
            <t.icon size={18} aria-hidden />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

export default function Paramedic() {
  usePageMeta('Paramedic app | MediRoute', 'Voice triage, destination, next signal and an automatic handover note. Works offline. Sample data.')
  useRole('paramedic')
  const p = useParamedic()
  const wide = useMedia('(min-width: 768px)')
  return (
    <AppShell fill actions={<Chip tone={p.online ? 'green' : 'red'}>{p.online ? 'Online' : 'Offline'}</Chip>}>
      <div className="flex h-full flex-col">
        {!p.online && (
          <p className="flex shrink-0 items-center gap-2 bg-ink px-4 py-2 text-[14px] text-white" role="status">
            <WifiOff size={15} aria-hidden /> Offline. SMS fallback active. {p.queue.length > 0 && `${p.queue.length} action(s) queued.`}
          </p>
        )}
        <div className="min-h-0 flex-1">{wide ? <Desktop p={p} /> : <Mobile p={p} />}</div>
      </div>
    </AppShell>
  )
}
