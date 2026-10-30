/**
 * The single source of truth for every page. All writes go through `commit`, which turns a change
 * into an event, applies it here, writes the audit log, broadcasts it to other tabs and persists it.
 */
import { useEffect } from 'react'
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { SIM } from '../config/simulation'
import { AMBULANCES } from '../data/ambulances'
import { makeHospitals } from '../data/hospitals'
import { INJURY_ORDER, INJURY_RULES } from '../data/injuryRules'
import type { McRow } from '../engine/massCasualty'
import type {
  Actor,
  Ambulance,
  BlockedRoad,
  Case,
  CompletedTrip,
  HandoverNote,
  Hospital,
  InjuryClass,
  LiveSignal,
  LngLat,
  LogEntry,
  RouteData,
  SignalRequest,
  Toast,
  Trip,
  Weights,
} from '../types'

export type Role = 'operator' | 'paramedic' | 'hospital'

export interface Settings {
  advisory: boolean
  holdCap: number
  corridorMode: 'auto' | 'manual'
  speed: number
  playing: boolean
  signalLinkLost: boolean
  networkUp: boolean
}

export interface SyncedState {
  hospitals: Hospital[]
  ambulances: Ambulance[]
  cases: Record<string, Case>
  activeCaseId: string | null
  trips: Record<string, Trip>
  activeTripId: string | null
  signals: Record<string, LiveSignal>
  blockedRoads: BlockedRoad[]
  requests: SignalRequest[]
  handoverNotes: Record<string, HandoverNote>
  auditLog: LogEntry[]
  settings: Settings
  weights: Record<InjuryClass, Weights>
  /** Live OSRM routes for a clicked crash point, by hospital id. Empty for preset locations. */
  liveRoutes: Record<string, RouteData[]>
  /** Hospitals that diverted the active case. */
  excluded: string[]
  completedTrips: CompletedTrip[]
  caseSeq: number
}

export interface Draft {
  injuryClass: InjuryClass
  gcs: number
  conscious: boolean
  vitals: { pulse: number; systolic: number; diastolic: number; spo2: number }
  loc: LngLat | null
  label: string | null
  presetId: string | null
}

export interface LocalState {
  toasts: Toast[]
  selectedHospitalId: string | null
  selectedSignalId: string | null
  follow: boolean
  routingNote: string | null
  routingBusy: boolean
  mci: { rows: McRow[]; at: LngLat } | null
  draft: Draft
  presence: Record<Role, number>
  isLeader: boolean
}

export type AppState = SyncedState & LocalState

export const emptyDraft = (): Draft => ({
  injuryClass: 'head_injury',
  gcs: 12,
  conscious: true,
  vitals: { pulse: 96, systolic: 118, diastolic: 76, spo2: 97 },
  loc: null,
  label: null,
  presetId: null,
})

export const defaultWeights = (): Record<InjuryClass, Weights> =>
  Object.fromEntries(INJURY_ORDER.map((k) => [k, { ...INJURY_RULES[k].weights }])) as Record<InjuryClass, Weights>

export const defaultSettings = (): Settings => ({
  advisory: false,
  holdCap: SIM.holdCapS,
  corridorMode: 'auto',
  speed: 4,
  playing: true,
  signalLinkLost: false,
  networkUp: true,
})

export function initialSynced(now = Date.now()): SyncedState {
  return {
    hospitals: makeHospitals(now),
    ambulances: AMBULANCES.map((a) => ({ ...a })),
    cases: {},
    activeCaseId: null,
    trips: {},
    activeTripId: null,
    signals: {},
    blockedRoads: [],
    requests: [],
    handoverNotes: {},
    auditLog: [],
    settings: defaultSettings(),
    weights: defaultWeights(),
    liveRoutes: {},
    excluded: [],
    completedTrips: [],
    caseSeq: 142,
  }
}

const SYNC_KEYS = Object.keys(initialSynced()) as (keyof SyncedState)[]
export const pickSynced = (s: AppState): SyncedState => Object.fromEntries(SYNC_KEYS.map((k) => [k, s[k]])) as unknown as SyncedState

// ---------- Operations ----------

type ArrayKey = 'hospitals' | 'ambulances' | 'requests' | 'blockedRoads'
type RecordKey = 'cases' | 'trips' | 'signals' | 'handoverNotes'

export type Op =
  | { op: 'set'; key: keyof SyncedState; value: unknown }
  | { op: 'put'; key: RecordKey; id: string; value: unknown }
  | { op: 'merge'; key: RecordKey; id: string; value: Record<string, unknown>; ifRouteKey?: string }
  | { op: 'mergeItem'; key: ArrayKey; id: string; value: Record<string, unknown> }
  | { op: 'push'; key: ArrayKey | 'auditLog' | 'completedTrips'; value: unknown; cap?: number }
  | { op: 'append'; id: string; value: [number, number, number][] }
  | { op: 'settings'; value: Partial<Settings> }

function applyOps(s: SyncedState, ops: Op[]): Partial<SyncedState> {
  const out: Partial<SyncedState> = {}
  const cur = <K extends keyof SyncedState>(k: K): SyncedState[K] => (k in out ? out[k] : s[k]) as SyncedState[K]
  for (const o of ops) {
    switch (o.op) {
      case 'set':
        ;(out as Record<string, unknown>)[o.key] = o.value
        break
      case 'put':
        ;(out as Record<string, unknown>)[o.key] = { ...(cur(o.key) as object), [o.id]: o.value }
        break
      case 'merge': {
        const rec = cur(o.key) as unknown as Record<string, Record<string, unknown>>
        const prev = rec[o.id]
        if (!prev) break
        // Position ticks carry the route they were computed on; a re-route wins over a late tick.
        if (o.ifRouteKey !== undefined && prev.routeKey !== o.ifRouteKey) break
        ;(out as Record<string, unknown>)[o.key] = { ...rec, [o.id]: { ...prev, ...o.value } }
        break
      }
      case 'mergeItem': {
        const arr = cur(o.key) as { id: string }[]
        ;(out as Record<string, unknown>)[o.key] = arr.map((x) => (x.id === o.id ? { ...x, ...o.value } : x))
        break
      }
      case 'push': {
        const arr = cur(o.key) as unknown[]
        const next = [...arr, o.value]
        ;(out as Record<string, unknown>)[o.key] = o.cap ? next.slice(-o.cap) : next
        break
      }
      case 'append': {
        const trips = cur('trips')
        const t = trips[o.id]
        if (t) out.trips = { ...trips, [o.id]: { ...t, track: [...t.track, ...o.value] } }
        break
      }
      case 'settings':
        out.settings = { ...cur('settings'), ...o.value }
        break
    }
  }
  return out
}

// ---------- Store ----------

const STORAGE_KEY = 'mediroute.state.v2'
const FRESH_START_AFTER_MS = 30 * 60_000

function loadPersisted(): SyncedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as { at: number; state: SyncedState }
    const active = v.state.activeTripId ? v.state.trips[v.state.activeTripId] : null
    // Resume a running trip; otherwise start clean once sample data has aged past the demo story.
    if (!active || active.status !== 'enroute') {
      if (Date.now() - v.at > FRESH_START_AFTER_MS) return null
    }
    return { ...initialSynced(), ...v.state, settings: { ...defaultSettings(), ...v.state.settings } }
  } catch {
    return null
  }
}

const isBrowser = typeof window !== 'undefined'
const restored = isBrowser ? loadPersisted() : null

export const useAppStore = create<AppState>()(() => ({
  ...initialSynced(),
  ...(restored ?? {}),
  toasts: [],
  selectedHospitalId: null,
  selectedSignalId: null,
  follow: false,
  routingNote: null,
  routingBusy: false,
  mci: null,
  draft: emptyDraft(),
  presence: { operator: 0, paramedic: 0, hospital: 0 },
  isLeader: false,
}))

export const get = useAppStore.getState
/** Local-only state (toasts, selections, drafts). Synced state changes go through `commit`. */
export const setLocal = (p: Partial<LocalState> | ((s: AppState) => Partial<LocalState>)) => useAppStore.setState(p as Partial<AppState>)

// ---------- Events and sync ----------

export const TAB_ID = Math.random().toString(36).slice(2, 10)
let seq = 0
const uid = (p: string) => `${p}-${TAB_ID}-${(seq++).toString(36)}`

export interface Notify {
  roles: Role[]
  text: string
  tone?: Toast['tone']
  /** Only for tabs looking at this hospital. */
  hospitalId?: string
}

export interface AppEvent {
  id: string
  ts: number
  actor: Actor
  type: string
  payload: { ops: Op[]; notify?: Notify }
}

type Msg =
  | { kind: 'event'; event: AppEvent }
  | { kind: 'hello'; from: string }
  | { kind: 'snapshot'; to: string; state: SyncedState }
  | { kind: 'presence'; from: string; role: Role | null; ts: number }

const seen = new Set<string>()
const seenOrder: string[] = []
function markSeen(id: string) {
  seen.add(id)
  seenOrder.push(id)
  if (seenOrder.length > 4000) seen.delete(seenOrder.shift()!)
}

let channel: BroadcastChannel | null = null
try {
  channel = isBrowser ? new BroadcastChannel('mediroute.v2') : null
} catch {
  channel = null
}
const post = (m: Msg) => {
  try {
    channel?.postMessage(m)
  } catch {
    // A closed channel only means no other tab is listening.
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null
function schedulePersist() {
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), state: pickSynced(get()) }))
    } catch {
      // Storage can be blocked or full. The demo still works within this tab.
    }
  }, 500)
}

/** The role of the page open in this tab, for presence and for which toasts to show. */
let currentRole: Role | null = null
let viewHospitalId: string | null = null
export function setRole(role: Role | null) {
  currentRole = role
  heartbeat()
}
/** Pages declare their role for presence dots and for which cross-role toasts to show. */
export function useRole(role: Role) {
  useEffect(() => {
    setRole(role)
    return () => setRole(null)
  }, [role])
}

export function setViewHospital(id: string | null) {
  viewHospitalId = id
}

function applyEvent(e: AppEvent, remote: boolean) {
  if (seen.has(e.id)) return
  markSeen(e.id)
  const patch = applyOps(pickSynced(get()), e.payload.ops)
  useAppStore.setState(patch as Partial<AppState>)
  if (e.type === 'demo/reset') setLocal({ draft: emptyDraft(), selectedHospitalId: null, selectedSignalId: null, mci: null, routingNote: null })
  const n = e.payload.notify
  // Tell other roles what changed. System events also notify the tab they happen in.
  if ((remote || e.actor === 'system') && n && currentRole && n.roles.includes(currentRole) && (currentRole !== 'hospital' || !n.hospitalId || n.hospitalId === viewHospitalId)) toast(n.tone ?? 'info', n.text)
  schedulePersist()
}

export interface CommitInput {
  type: string
  actor: Actor
  ops?: Op[]
  log?: { kind: LogEntry['kind']; text: string }
  /** Several log lines in one event, for the simulation. */
  logs?: { kind: LogEntry['kind']; text: string }[]
  notify?: Notify
}

/** The one way to change shared state. Writes the audit log entry when `log` is given. */
export function commit({ type, actor, ops = [], log, logs = [], notify }: CommitInput): AppEvent {
  const all = [...ops]
  for (const l of log ? [log, ...logs] : logs) all.push({ op: 'push', key: 'auditLog', value: { id: uid('l'), t: Date.now(), actor, kind: l.kind, text: l.text } satisfies LogEntry, cap: 600 })
  const event: AppEvent = { id: uid('e'), ts: Date.now(), actor, type, payload: { ops: all, notify } }
  applyEvent(event, false)
  post({ kind: 'event', event })
  return event
}

/** Re-sends the whole state, used by the simulation tab to answer a new tab. */
function onMessage(ev: MessageEvent<Msg>) {
  const m = ev.data
  if (!m) return
  if (m.kind === 'event') applyEvent(m.event, true)
  else if (m.kind === 'hello' && get().isLeader) post({ kind: 'snapshot', to: m.from, state: pickSynced(get()) })
  else if (m.kind === 'snapshot' && m.to === TAB_ID) useAppStore.setState(m.state as Partial<AppState>)
  else if (m.kind === 'presence' && m.role) setLocal((s) => ({ presence: { ...s.presence, [m.role!]: m.ts } }))
}

function heartbeat() {
  const ts = Date.now()
  if (currentRole) setLocal((s) => ({ presence: { ...s.presence, [currentRole!]: ts } }))
  post({ kind: 'presence', from: TAB_ID, role: currentRole, ts })
}

if (isBrowser && channel) {
  channel.addEventListener('message', onMessage)
  post({ kind: 'hello', from: TAB_ID })
  setInterval(heartbeat, 2000)
}

// ---------- Selectors ----------

export const selCase = (s: SyncedState): Case | null => (s.activeCaseId ? s.cases[s.activeCaseId] ?? null : null)
export const selTrip = (s: SyncedState): Trip | null => (s.activeTripId ? s.trips[s.activeTripId] ?? null : null)
export const tripSignals = (s: Pick<SyncedState, 'signals'>, t: Trip | null): LiveSignal[] => (t ? t.signalIds.map((id) => s.signals[id]).filter(Boolean) : [])
export const useCase = () => useAppStore(selCase)
export const useTrip = () => useAppStore(selTrip)
export const useTripSignals = () => useAppStore(useShallow((s) => tripSignals(s, selTrip(s))))
export const useSettings = () => useAppStore((s) => s.settings)

/** Seconds left on a bed hold, on the held case's simulated clock. */
export function holdRemainingS(s: Pick<SyncedState, 'cases'>, h: Hospital): number | null {
  if (!h.bedHold) return null
  const c = s.cases[h.bedHold.caseId]
  return c ? Math.max(0, h.bedHold.expiresAtSimS - c.simElapsedS) : null
}

// ---------- Toasts ----------

export function toast(tone: Toast['tone'], text: string, ms = 4000, action?: Toast['action']) {
  const id = uid('t')
  setLocal((s) => ({ toasts: [...s.toasts, { id, tone, text, action }].slice(-3) }))
  setTimeout(() => setLocal((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms)
}

export function dismissToast(id: string) {
  setLocal((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}
