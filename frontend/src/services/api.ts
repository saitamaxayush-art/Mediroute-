/**
 * Service layer. Every function talks to the in-browser store today. Each change goes through
 * `commit`, which writes the audit log and syncs every open tab. A FastAPI backend replaces the
 * bodies later; the signatures stay the same.
 */
import { SIM } from '../config/simulation'
import { PRESETS } from '../data/places'
import { PRESET_ROUTES } from '../data/routes'
import { INJURY_RULES, INJURY_SHORT } from '../data/injuryRules'
import { demoCase } from '../data/scenario'
import { crossesGoldenHour, goldenRemaining, matchAmbulance, rank } from '../engine/engine'
import { haversine, makePolyline, project, slice } from '../engine/geo'
import { allocate, type McPatient, type McRow } from '../engine/massCasualty'
import { computeEta, toRouteData } from '../engine/route'
import { mins, mmss } from '../engine/text'
import { heldSeconds, isAhead, makeSignals, polylineOf, tripRemainingS } from '../sim/step'
import { commit, get, initialSynced, selCase, selTrip, setLocal, toast, tripSignals, type Op, type Settings, type SyncedState } from '../store/appStore'
import type { Actor, Case, CompletedTrip, Hospital, InjuryClass, LiveSignal, LngLat, Ranking, RouteData, SignalSource, Trip, Vitals, Weights } from '../types'
import { etaOf, joinPaths, liveRoutes, liveRoutesToAll, nearestPreset, presetRoutes } from './routing'

// ---------- Reads ----------

export async function getHospitals(): Promise<Hospital[]> {
  return get().hospitals
}

export async function getTrips(): Promise<CompletedTrip[]> {
  return get().completedTrips
}

type RankInputs = Pick<SyncedState, 'cases' | 'activeCaseId' | 'hospitals' | 'weights' | 'liveRoutes' | 'excluded'>

/** Routes for the active case to one hospital: [main, alternative]. */
export function caseRoutes(s: Pick<SyncedState, 'cases' | 'activeCaseId' | 'liveRoutes'>, hospitalId: string): RouteData[] {
  const k = s.activeCaseId ? s.cases[s.activeCaseId] : null
  if (!k) return []
  if (k.presetId) return presetRoutes(k.presetId, hospitalId)
  return s.liveRoutes[hospitalId] ?? []
}

let memo: { key: unknown[]; minute: number; value: Ranking | null } | null = null

/** Ranking for the active case, derived from the store. Recomputed when inputs change or each minute. */
export function computeRanking(s: RankInputs): Ranking | null {
  const k = s.activeCaseId ? s.cases[s.activeCaseId] ?? null : null
  // The case object changes every tick (its clock); rank only on the fields that matter.
  const caseKey = k ? `${k.id}|${k.injuryClass}|${k.gcs}|${k.presetId}` : null
  const key = [caseKey, s.hospitals, s.weights, s.liveRoutes, s.excluded]
  const minute = Math.floor(Date.now() / 60_000)
  if (memo && memo.minute === minute && memo.key.every((x, i) => x === key[i])) return memo.value
  let value: Ranking | null = null
  if (k) value = rank(k, s.hospitals, (h) => caseRoutes(s, h.id)[0] ?? null, (r) => etaOf(r), s.weights[k.injuryClass], Date.now(), s.excluded)
  memo = { key, minute, value }
  return value
}

export async function rankHospitals(): Promise<Ranking | null> {
  return computeRanking(get())
}

/** Golden-hour seconds left, from the case's shared simulated clock. Same value in every tab. */
export function goldenLeft(c: Case | null): number | null {
  return c ? Math.max(0, SIM.goldenHourS - c.simElapsedS) : null
}

/** Live ETA for the active trip: it stops counting down while the ambulance waits. */
export function liveEtaS(s: SyncedState): number | null {
  const t = selTrip(s)
  return t ? tripRemainingS(t, s.signals, s.settings) : null
}

// ---------- Cases ----------

export interface CaseInput {
  injuryClass: InjuryClass
  gcs: number
  vitals: Vitals
  conscious: boolean
  location: LngLat
  locationLabel?: string
  presetId?: string | null
  treatment?: string[]
  notes?: string
}

/** Ops that end the active trip and free its bed hold. */
function endTripOps(s: SyncedState): Op[] {
  const t = selTrip(s)
  const ops: Op[] = [{ op: 'set', key: 'activeTripId', value: null }]
  if (!t) return ops
  ops.push({ op: 'mergeItem', key: 'ambulances', id: t.ambulanceId, value: { status: 'available' } })
  const h = s.hospitals.find((x) => x.id === t.hospitalId)
  if (t.status === 'enroute' && h?.bedHold) ops.push({ op: 'mergeItem', key: 'hospitals', id: h.id, value: { bedHold: null, beds: { ...h.beds, icu: h.beds.icu + 1 } } })
  return ops
}

export async function createCase(input: CaseInput, actor: Actor = 'operator'): Promise<Case> {
  const s = get()
  let location = input.location
  let presetId = input.presetId ?? null
  let label = input.locationLabel ?? `${location[1].toFixed(4)} N, ${location[0].toFixed(4)} E`
  let live: Record<string, RouteData[]> = {}
  setLocal({ routingNote: null })
  if (!presetId) {
    setLocal({ routingBusy: true })
    try {
      live = await liveRoutesToAll(location, s.hospitals)
    } catch {
      const p = nearestPreset(location)
      location = p.loc
      presetId = p.id
      label = p.label
      live = {}
      setLocal({ routingNote: 'Live routing unavailable, showing the nearest preset location' })
      toast('warn', 'Live routing unavailable, showing the nearest preset location')
    } finally {
      setLocal({ routingBusy: false })
    }
  }
  const cur = get()
  const id = `CASE-${String(cur.caseSeq + 1).padStart(4, '0')}`
  const base = {
    id,
    injuryClass: input.injuryClass,
    gcs: input.gcs,
    vitals: input.vitals,
    conscious: input.conscious,
    location,
    locationLabel: label,
    presetId,
    callTime: Date.now(),
    treatment: input.treatment ?? [],
    notes: input.notes ?? '',
    simElapsedS: 0,
    frozen: false,
  }
  const kase: Case = { ...base, match: matchAmbulance(base, cur.ambulances) }
  commit({
    type: 'case/create',
    actor,
    ops: [
      ...endTripOps(cur),
      { op: 'put', key: 'cases', id, value: kase },
      { op: 'set', key: 'activeCaseId', value: id },
      { op: 'set', key: 'liveRoutes', value: live },
      { op: 'set', key: 'excluded', value: [] },
      { op: 'set', key: 'caseSeq', value: cur.caseSeq + 1 },
    ],
    log: { kind: 'case', text: `${id} created: ${INJURY_RULES[kase.injuryClass].label}, GCS ${kase.gcs}, ${label}` },
    notify: { roles: ['paramedic'], text: `New case assigned: ${INJURY_SHORT[kase.injuryClass].toLowerCase()}, GCS ${kase.gcs}` },
  })
  const r = computeRanking(get())
  commit({
    type: 'case/ranked',
    actor: 'system',
    logs: [
      ...(kase.match ? [{ kind: 'case' as const, text: `Unit matched: ${kase.match.reason}` }] : []),
      ...(r?.filtered ?? []).map((f) => ({ kind: 'filter' as const, text: `Filtered ${f.hospital.name}: ${f.reasons.join(', ')}` })),
      ...(r?.ranked[0] ? [{ kind: 'filter' as const, text: `Top match: ${r.ranked[0].hospital.name} (score ${r.ranked[0].total.toFixed(2)})` }] : []),
    ],
  })
  return kase
}

type CasePatch = Partial<Pick<Case, 'injuryClass' | 'gcs' | 'conscious' | 'vitals' | 'treatment' | 'notes'>>

function describePatch(p: CasePatch) {
  const parts: string[] = []
  if (p.injuryClass) parts.push(INJURY_SHORT[p.injuryClass].toLowerCase())
  if (p.gcs !== undefined) parts.push(`GCS ${p.gcs}`)
  if (p.conscious !== undefined) parts.push(p.conscious ? 'conscious' : 'unconscious')
  if (p.vitals) parts.push(`pulse ${p.vitals.pulse}, BP ${p.vitals.systolic}/${p.vitals.diastolic}, SpO2 ${p.vitals.spo2}`)
  return parts.join(', ')
}

/** Triage or vitals edits, from the operator form or the paramedic app. */
export function updateCase(patch: CasePatch, actor: Actor = 'operator') {
  const k = selCase(get())
  if (!k || !Object.keys(patch).length) return
  commit({
    type: 'case/update',
    actor,
    ops: [{ op: 'merge', key: 'cases', id: k.id, value: { ...patch, match: matchAmbulance({ ...k, ...patch }, get().ambulances) } }],
    log: { kind: 'case', text: `Triage updated by ${actor}: ${describePatch(patch)}` },
    notify: actor === 'paramedic' ? { roles: ['operator'], text: 'Triage updated by paramedic: ranking refreshed' } : { roles: ['paramedic'], text: `Operator updated the case: ${describePatch(patch)}` },
  })
}

export async function loadDemoCase(): Promise<Case> {
  resetDemo({ keepHistory: true, quiet: true })
  const d = demoCase(Date.now())
  return createCase({ ...d, locationLabel: d.locationLabel, presetId: d.presetId })
}

export function setWeights(cls: InjuryClass, w: Weights) {
  commit({ type: 'settings/weights', actor: 'operator', ops: [{ op: 'set', key: 'weights', value: { ...get().weights, [cls]: w } }] })
}

// ---------- Dispatch and corridor ----------

function holdOp(h: Hospital, c: Case, extraS = 0): Op {
  return { op: 'mergeItem', key: 'hospitals', id: h.id, value: { beds: { ...h.beds, icu: Math.max(0, h.beds.icu - 1) }, bedHold: { caseId: c.id, expiresAtSimS: c.simElapsedS + extraS + SIM.bedHoldS } } }
}

export async function dispatch(hospitalId: string): Promise<Trip | null> {
  const s = get()
  const k = selCase(s)
  if (!k) return null
  const h = s.hospitals.find((x) => x.id === hospitalId)
  const routes = caseRoutes(s, hospitalId)
  if (!h || !routes[0]) {
    toast('danger', 'No road route to this hospital')
    return null
  }
  const route = routes[0]
  const eta = computeEta(route)
  const sceneS = (k.match?.etaMin ?? 5) * 60 + 6 * 60
  const id = `TRIP-${Date.now().toString(36).toUpperCase()}`
  const routeKey = `${id}:0`
  const signals = makeSignals(id, routeKey, route)
  const trip: Trip = {
    id,
    caseId: k.id,
    hospitalId,
    ambulanceId: k.match?.ambulance.id ?? 'ALS-03',
    route,
    altRoute: routes[1] ?? null,
    eta,
    simT: 0,
    progressM: 0,
    status: 'enroute',
    corridor: 'pending',
    signalIds: signals.map((x) => x.id),
    pastSignalIds: [],
    reroutes: 0,
    arrivedSimT: null,
    track: [[0, route.geometry[0][0], route.geometry[0][1]]],
    waitedS: 0,
    waitUntil: 0,
    waitingAt: null,
    routeKey,
  }
  commit({
    type: 'trip/dispatch',
    actor: 'operator',
    ops: [
      { op: 'put', key: 'trips', id, value: trip },
      ...signals.map((g) => ({ op: 'put', key: 'signals', id: g.id, value: g }) as Op),
      { op: 'set', key: 'activeTripId', value: id },
      holdOp(h, k, sceneS),
      { op: 'mergeItem', key: 'ambulances', id: trip.ambulanceId, value: { status: 'busy' } },
      // The unit drives to the scene and treats on scene before transport starts.
      { op: 'merge', key: 'cases', id: k.id, value: { simElapsedS: k.simElapsedS + sceneS } },
    ],
    log: { kind: 'confirm', text: `Operator confirmed ${h.name}. ${trip.ambulanceId} dispatched. ICU bed held for ${mmss(SIM.bedHoldS)}. Unit on scene after ${Math.round(sceneS / 60)} min` },
    notify: { roles: ['hospital', 'paramedic'], hospitalId, text: `New incoming: ${INJURY_SHORT[k.injuryClass].toLowerCase()}, ETA ${mins(eta.corridorS).toLowerCase()}. Destination ${h.name}`, tone: 'ok' },
  })
  if (crossesGoldenHour(Date.now() - (k.simElapsedS + sceneS) * 1000, Date.now(), eta.corridorS)) toast('danger', 'Warning: even with a corridor this trip ends after the golden hour')
  return trip
}

export async function approveCorridor(actor: Actor = 'operator'): Promise<Trip | null> {
  const s = get()
  const t = selTrip(s)
  if (!t) return null
  const advisory = s.settings.advisory || s.settings.signalLinkLost
  commit({
    type: 'corridor/approve',
    actor,
    ops: [{ op: 'merge', key: 'trips', id: t.id, value: { corridor: advisory ? 'advisory' : 'active' } }],
    log: { kind: 'corridor', text: advisory ? 'Corridor advised to traffic police (advisory mode, signals unchanged)' : `Corridor approved, ${s.settings.corridorMode} control` },
    notify: { roles: ['paramedic', 'hospital'], text: advisory ? 'Corridor advised to traffic police' : 'Green corridor approved' },
  })
  return selTrip(get())
}

/** Signals back to their normal cycle: holds end, armed junctions disarm. */
function neutralOps(s: SyncedState, t: Trip): Op[] {
  return tripSignals(s, t)
    .filter((g) => g.state === 'GREEN_FOR_AMBULANCE' || g.state === 'ARMED' || g.state === 'RED_HOLD' || g.advised)
    .map(
      (g) =>
        ({
          op: 'merge',
          key: 'signals',
          id: g.id,
          value: {
            state: g.state === 'GREEN_FOR_AMBULANCE' ? 'RELEASED' : 'NORMAL',
            advised: null,
            holdStartedAt: null,
            crossTrafficHeldSeconds: heldSeconds(g, t),
            releasedAt: g.state === 'GREEN_FOR_AMBULANCE' ? t.simT : g.releasedAt,
          },
        }) as Op,
    )
}

export function stopCorridor() {
  const s = get()
  const t = selTrip(s)
  if (!t) return
  commit({
    type: 'corridor/stop',
    actor: 'operator',
    ops: [{ op: 'merge', key: 'trips', id: t.id, value: { corridor: 'pending' } }, ...neutralOps(s, t)],
    log: { kind: 'corridor', text: 'Corridor stopped by operator. Normal cycle restored' },
    notify: { roles: ['paramedic'], text: 'Corridor stopped. Signals on normal cycle' },
  })
}

function settingsCommit(type: string, value: Partial<Settings>, text: string, extra: Op[] = [], notifyText?: string) {
  commit({
    type,
    actor: 'operator',
    ops: [{ op: 'settings', value }, ...extra],
    log: { kind: 'system', text },
    notify: notifyText ? { roles: ['paramedic', 'hospital'], text: notifyText } : undefined,
  })
}

export function setAdvisory(on: boolean) {
  const s = get()
  const t = selTrip(s)
  const extra: Op[] = []
  if (t && t.status === 'enroute') {
    if (on && t.corridor === 'active') extra.push({ op: 'merge', key: 'trips', id: t.id, value: { corridor: 'advisory' } }, ...neutralOps(s, t))
    if (!on && t.corridor === 'advisory' && !s.settings.signalLinkLost) extra.push({ op: 'merge', key: 'trips', id: t.id, value: { corridor: 'active' } })
  }
  settingsCommit('settings/advisory', { advisory: on }, on ? 'Advisory mode on: signal commands become advice to traffic police' : 'Advisory mode off', extra, on ? 'Advisory mode on: signals will not change' : 'Advisory mode off')
}

export function setHoldCap(cap: number) {
  settingsCommit('settings/holdCap', { holdCap: cap }, `Cross-traffic cap set to ${cap}s`, [], `Cross-traffic cap now ${cap}s`)
}

export function setCorridorMode(mode: Settings['corridorMode']) {
  settingsCommit('settings/corridorMode', { corridorMode: mode }, `Corridor control set to ${mode}`)
}

export function setPlaying(playing: boolean) {
  settingsCommit('settings/playing', { playing }, playing ? 'Simulation playing' : 'Simulation paused')
}

export function setSpeed(speed: number) {
  settingsCommit('settings/speed', { speed }, `Simulation speed ${speed}x`)
}

// ---------- Signal commands ----------

export type SignalCommand = 'green' | 'red' | 'normal'
export const CMD_LABEL: Record<SignalCommand, string> = { green: 'Green for ambulance', red: 'Hold ambulance (red)', normal: 'Return to normal' }

/** Why a signal cannot be commanded right now, or null when it can. */
export function commandBlocked(g: LiveSignal, t: Trip | null, st: Settings): string | null {
  if (!t || t.status !== 'enroute') return 'No trip in progress'
  if (st.signalLinkLost) return 'Signal link lost. Commands are disabled'
  if (!isAhead(g, t)) return 'The ambulance has passed this junction'
  return null
}

/**
 * Command on one junction, from the operator or an approved paramedic request. In advisory mode
 * it becomes advice and the signal does not change. Logged with the previous state; undoable.
 */
export function commandSignal(signalId: string, cmd: SignalCommand, opts: { actor?: Actor; source?: SignalSource; quiet?: boolean } = {}) {
  const { actor = 'operator', source = 'operator', quiet = false } = opts
  const s = get()
  const t = selTrip(s)
  const g = s.signals[signalId]
  if (!g) return false
  const why = commandBlocked(g, t, s.settings)
  if (why) {
    if (!quiet) toast('danger', why)
    return false
  }
  // Never two conflicting greens at one junction: another trip's green from a different approach blocks this one.
  if (cmd === 'green') {
    const clash = Object.values(s.signals).find(
      (o) => o.tripId !== g.tripId && o.state === 'GREEN_FOR_AMBULANCE' && o.ambulanceApproach !== g.ambulanceApproach && haversine([o.lng, o.lat], [g.lng, g.lat]) < 15,
    )
    if (clash) {
      toast('danger', `Conflict: ${g.name} is already green for another approach`)
      return false
    }
  }
  const trip = t!
  const advisory = s.settings.advisory
  const prev: Partial<LiveSignal> = { state: g.state, advised: g.advised, holdStartedAt: g.holdStartedAt, greenAt: g.greenAt, crossTrafficHeldSeconds: g.crossTrafficHeldSeconds, source: g.source }
  const rec = { simT: trip.simT, by: actor, source, cmd: CMD_LABEL[cmd], from: g.state, advised: advisory }
  let value: Partial<LiveSignal>
  if (advisory) value = { advised: cmd === 'green' ? 'GREEN' : cmd === 'red' ? 'RED' : null }
  else if (cmd === 'green') value = { state: 'GREEN_FOR_AMBULANCE', holdStartedAt: g.state === 'GREEN_FOR_AMBULANCE' ? g.holdStartedAt : trip.simT, greenAt: g.greenAt ?? trip.simT, source, advised: null }
  else if (cmd === 'red') value = { state: 'RED_HOLD', holdStartedAt: null, crossTrafficHeldSeconds: heldSeconds(g, trip), source, advised: null }
  else value = { state: 'NORMAL', holdStartedAt: null, crossTrafficHeldSeconds: heldSeconds(g, trip), source, advised: null }
  const ops: Op[] = [{ op: 'merge', key: 'signals', id: g.id, value: { ...value, lastCommandBy: actor, lastCommandAt: Date.now(), history: [...g.history, rec] } }]
  // A green command from the operator is an approval of the corridor.
  if (!advisory && trip.corridor === 'pending' && cmd === 'green') ops.push({ op: 'merge', key: 'trips', id: trip.id, value: { corridor: 'active' } })
  const next = tripSignals(s, trip).find((x) => isAhead(x, trip))
  const word = cmd === 'green' ? 'GREEN' : cmd === 'red' ? 'held RED' : 'on normal cycle'
  commit({
    type: advisory ? 'signal/advice' : 'signal/command',
    actor,
    ops,
    log: { kind: 'signal', text: advisory ? `Advice sent to traffic police: ${CMD_LABEL[cmd].toLowerCase()} at ${g.code} ${g.name}` : `${CMD_LABEL[cmd]}: ${g.code} ${g.name}, was ${g.state}${source === 'request' ? ', on paramedic request' : ''}` },
    notify: next?.id === g.id ? { roles: ['paramedic'], text: advisory ? `Next signal: ${cmd} advised to traffic police` : `Next signal ${g.code} is now ${word}` } : undefined,
  })
  if (!quiet)
    toast('info', `${advisory ? 'Advised' : CMD_LABEL[cmd]}: ${g.code}`, 5000, {
      label: 'Undo',
      run: () =>
        commit({
          type: 'signal/undo',
          actor,
          ops: [{ op: 'merge', key: 'signals', id: g.id, value: { ...prev, history: [...(get().signals[g.id]?.history ?? []), { ...rec, cmd: `Undo ${CMD_LABEL[cmd]}` }] } }],
          log: { kind: 'signal', text: `Undo: ${g.code} ${g.name} back to ${prev.state}` },
        }),
    })
  return true
}

export function extendHold(signalId: string) {
  const g = get().signals[signalId]
  if (!g || g.extended || g.state !== 'GREEN_FOR_AMBULANCE') return
  commit({ type: 'signal/extend', actor: 'operator', ops: [{ op: 'merge', key: 'signals', id: g.id, value: { extended: true } }], log: { kind: 'signal', text: `${g.code} ${g.name}: cross-traffic hold extended by 20s` } })
}

/** Signals still ahead of the ambulance, nearest first. */
export function upcomingSignals(s: SyncedState): LiveSignal[] {
  const t = selTrip(s)
  if (!t) return []
  return tripSignals(s, t).filter((g) => isAhead(g, t))
}

export function clearNext(n: number) {
  const s = get()
  const next = upcomingSignals(s).slice(0, n)
  if (!next.length) {
    toast('info', 'No junctions left ahead')
    return
  }
  let ok = 0
  for (const g of next) if (g.state !== 'GREEN_FOR_AMBULANCE' && commandSignal(g.id, 'green', { quiet: true })) ok++
  toast('info', ok ? `${s.settings.advisory ? 'Advised' : 'Cleared'}: ${next.map((g) => g.code).join(', ')}` : 'Already clear', 3000)
}

export function releaseBehind() {
  const s = get()
  const t = selTrip(s)
  if (!t) return
  const behind = tripSignals(s, t).filter((g) => g.state !== 'RELEASED' && !isAhead(g, t))
  if (!behind.length) {
    toast('info', 'Nothing behind the ambulance to release')
    return
  }
  commit({
    type: 'signal/releaseBehind',
    actor: 'operator',
    ops: behind.map((g) => ({ op: 'merge', key: 'signals', id: g.id, value: { state: 'RELEASED', releasedAt: t.simT, releasedFlashUntil: Date.now() + 3000, holdStartedAt: null, crossTrafficHeldSeconds: heldSeconds(g, t) } }) as Op),
    log: { kind: 'signal', text: `Released all behind: ${behind.map((g) => g.code).join(', ')}` },
  })
}

// ---------- Paramedic requests and handover ----------

export function requestGreen() {
  const s = get()
  const t = selTrip(s)
  const next = upcomingSignals(s)[0]
  if (!t || !next) {
    toast('info', 'No signal ahead')
    return
  }
  if (s.requests.some((r) => r.signalId === next.id && r.status === 'pending')) {
    toast('info', 'Request already sent')
    return
  }
  commit({
    type: 'request/create',
    actor: 'paramedic',
    ops: [{ op: 'push', key: 'requests', value: { id: `REQ-${Date.now().toString(36)}`, tripId: t.id, signalId: next.id, ts: Date.now(), status: 'pending' } }],
    log: { kind: 'signal', text: `Paramedic requested green at ${next.code} ${next.name}` },
    notify: { roles: ['operator'], text: `Ambulance requests green at ${next.code} ${next.name}`, tone: 'warn' },
  })
  toast('ok', 'Request sent to the operator')
}

export function approveRequest(id: string) {
  const r = get().requests.find((x) => x.id === id)
  if (!r) return
  const ok = commandSignal(r.signalId, 'green', { source: 'request' })
  commit({
    type: ok ? 'request/approve' : 'request/expire',
    actor: 'operator',
    ops: [{ op: 'mergeItem', key: 'requests', id, value: { status: ok ? 'approved' : 'dismissed' } }],
    notify: { roles: ['paramedic'], text: ok ? 'Operator approved your green request' : 'Your green request could not be applied', tone: ok ? 'ok' : 'warn' },
  })
}

export function dismissRequest(id: string) {
  commit({
    type: 'request/dismiss',
    actor: 'operator',
    ops: [{ op: 'mergeItem', key: 'requests', id, value: { status: 'dismissed' } }],
    log: { kind: 'signal', text: 'Operator dismissed a green request' },
    notify: { roles: ['paramedic'], text: 'Operator dismissed your green request' },
  })
}

export function sendHandoverNote(text: string) {
  const s = get()
  const t = selTrip(s)
  const k = selCase(s)
  if (!t || !k) return
  const h = s.hospitals.find((x) => x.id === t.hospitalId)
  commit({
    type: 'handover/send',
    actor: 'paramedic',
    ops: [{ op: 'put', key: 'handoverNotes', id: k.id, value: { caseId: k.id, hospitalId: t.hospitalId, text, ts: Date.now(), by: 'paramedic' } }],
    log: { kind: 'hospital', text: `Handover note sent to ${h?.name}` },
    notify: { roles: ['hospital'], text: `Handover note received for ${k.id}`, hospitalId: t.hospitalId, tone: 'ok' },
  })
}

// ---------- Hospital updates ----------

export async function updateHospitalStatus(id: string, patch: Partial<Pick<Hospital, 'beds' | 'capabilities' | 'specialists' | 'strokeTeam' | 'erLoad'>>, note: string): Promise<Hospital> {
  const h = get().hospitals.find((x) => x.id === id)!
  commit({
    type: 'hospital/update',
    actor: 'hospital',
    ops: [{ op: 'mergeItem', key: 'hospitals', id, value: { ...patch, lastUpdated: Date.now() } }],
    log: { kind: 'hospital', text: `${h.name}: ${note}` },
    notify: { roles: ['operator'], text: `${h.name} updated ${note.split(':')[0].toLowerCase()}: ranking refreshed` },
  })
  await rerouteIfNeeded()
  return get().hospitals.find((x) => x.id === id)!
}

export async function confirmStatusUnchanged(id: string) {
  const h = get().hospitals.find((x) => x.id === id)
  commit({
    type: 'hospital/confirm',
    actor: 'hospital',
    ops: [{ op: 'mergeItem', key: 'hospitals', id, value: { lastUpdated: Date.now() } }],
    log: { kind: 'hospital', text: `${h?.name}: status confirmed unchanged` },
    notify: { roles: ['operator'], text: `${h?.name} confirmed its status` },
  })
}

export async function divert(hospitalId: string, reason: string) {
  const s = get()
  const h = s.hospitals.find((x) => x.id === hospitalId)!
  commit({
    type: 'hospital/divert',
    actor: 'hospital',
    ops: [
      { op: 'mergeItem', key: 'hospitals', id: hospitalId, value: { refusals: [...h.refusals, { time: Date.now(), reason }] } },
      { op: 'set', key: 'excluded', value: s.excluded.includes(hospitalId) ? s.excluded : [...s.excluded, hospitalId] },
    ],
    log: { kind: 'hospital', text: `${h.name} diverted ${selCase(s)?.id ?? 'case'}: ${reason}` },
    notify: { roles: ['operator', 'paramedic'], text: `${h.name} diverted: ${reason}. Re-routing`, tone: 'warn' },
  })
  await rerouteIfNeeded()
}

export async function acceptIncoming(hospitalId: string) {
  const h = get().hospitals.find((x) => x.id === hospitalId)
  commit({
    type: 'hospital/accept',
    actor: 'hospital',
    log: { kind: 'hospital', text: `${h?.name} accepted ${selCase(get())?.id ?? 'case'}. Trauma bay ready` },
    notify: { roles: ['operator', 'paramedic'], text: `${h?.name} accepted the patient`, tone: 'ok' },
  })
}

// ---------- Re-routing ----------

function ambulancePos(t: Trip): LngLat {
  const pl = polylineOf(t.route)
  const p = Math.min(t.progressM, pl.length)
  return slice(pl, Math.max(0, p - 0.1), p).at(-1)!
}

/** Route from the ambulance's position. Live OSRM first, otherwise back along the travelled road then a preset route. */
async function routeFrom(t: Trip, hospitalId: string): Promise<{ main: RouteData; alt: RouteData | null; note: string | null }> {
  const s = get()
  const pos = ambulancePos(t)
  const h = s.hospitals.find((x) => x.id === hospitalId)!
  if (s.settings.networkUp) {
    try {
      const r = await liveRoutes([pos, [h.lng, h.lat]], true, 5000)
      return { main: r[0], alt: r[1] ?? null, note: null }
    } catch {
      // Fall through to the offline path.
    }
  }
  const k = s.cases[t.caseId]
  const presetId = k.presetId ?? nearestPreset(k.location).id
  const raw = PRESET_ROUTES[`${presetId}__${hospitalId}`]?.[0]
  if (!raw) throw new Error('No route')
  const pl = polylineOf(t.route)
  const back = slice(pl, 0, t.progressM).reverse()
  const geometry = joinPaths(back, raw.geometry)
  const backS = t.progressM / (t.route.distance / t.route.osrmDuration)
  const main = toRouteData({ geometry, distance: Math.round(makePolyline(geometry).length), duration: raw.duration + backS, junctions: raw.junctions }, 'preset')
  return { main, alt: null, note: 'Live routing unavailable: turning back along the travelled road' }
}

/** Ops that put a trip on a new route, keeping old signals for Replay. */
function swapRouteOps(t: Trip, main: RouteData, alt: RouteData | null, progressM: number, extra: Partial<Trip> = {}): Op[] {
  const reroutes = t.reroutes + 1
  const routeKey = `${t.id}:${reroutes}`
  const signals = makeSignals(t.id, routeKey, main).map((g) => (g.distanceAlongRoute < progressM ? { ...g, state: 'RELEASED' as const } : g))
  return [
    ...signals.map((g) => ({ op: 'put', key: 'signals', id: g.id, value: g }) as Op),
    {
      op: 'merge',
      key: 'trips',
      id: t.id,
      value: {
        ...extra,
        route: main,
        altRoute: alt,
        eta: computeEta(main),
        progressM,
        waitUntil: t.simT,
        waitingAt: null,
        signalIds: signals.map((g) => g.id),
        pastSignalIds: [...t.pastSignalIds, ...t.signalIds],
        reroutes,
        routeKey,
      },
    },
  ]
}

/**
 * Re-checks the active trip. When its hospital can no longer take the patient, picks the
 * next best hospital, releases the old hold, places a new one and swaps the route.
 */
export async function rerouteIfNeeded(): Promise<boolean> {
  const s = get()
  const t = selTrip(s)
  const k = selCase(s)
  if (!t || t.status !== 'enroute' || !k) return false
  const r = computeRanking(s)
  if (!r || r.ranked.some((x) => x.hospital.id === t.hospitalId)) return false
  const why = r.filtered.find((f) => f.hospital.id === t.hospitalId)?.reasons.join(', ') ?? 'no longer suitable'
  const next = r.ranked[0]
  if (!next) {
    commit({ type: 'trip/noHospital', actor: 'system', log: { kind: 'reroute', text: `Re-route needed (${why}) but no hospital passes the filter` }, notify: { roles: ['operator'], text: 'No hospital can take this patient. Escalate.', tone: 'danger' } })
    return false
  }
  let routed
  try {
    routed = await routeFrom(t, next.hospital.id)
  } catch {
    toast('danger', 'Could not find a road route to the next hospital')
    return false
  }
  const cur = get()
  const t2 = selTrip(cur)
  if (!t2 || t2.status !== 'enroute') return false
  const old = cur.hospitals.find((h) => h.id === t2.hospitalId)!
  const nh = cur.hospitals.find((h) => h.id === next.hospital.id)!
  const ops: Op[] = []
  // When the ICU filled up the hold is already gone; otherwise the held bed goes back to the pool.
  if (old.bedHold) ops.push({ op: 'mergeItem', key: 'hospitals', id: old.id, value: { bedHold: null, beds: { ...old.beds, icu: old.beds.icu + 1 } } })
  ops.push(holdOp(nh, cur.cases[t2.caseId]))
  ops.push(...swapRouteOps(t2, routed.main, routed.alt, 0, { hospitalId: nh.id }))
  commit({
    type: 'trip/reroute',
    actor: 'system',
    ops,
    log: { kind: 'reroute', text: `Re-routed from ${old.name} (${why}) to ${nh.name}. Old bed hold released, new hold placed${routed.note ? `. ${routed.note}` : ''}` },
    notify: { roles: ['operator', 'paramedic', 'hospital'], text: `${old.name}: ${why}. New destination ${nh.name}`, tone: 'warn' },
  })
  return true
}

// ---------- Demo controls ----------

export async function triggerIcuFull() {
  const s = get()
  const t = selTrip(s)
  const id = t?.hospitalId ?? computeRanking(s)?.ranked[0]?.hospital.id
  if (!id) {
    toast('info', 'Create a case first')
    return
  }
  const h = s.hospitals.find((x) => x.id === id)!
  commit({
    type: 'demo/icuFull',
    actor: 'system',
    ops: [{ op: 'mergeItem', key: 'hospitals', id, value: { beds: { ...h.beds, icu: 0 }, bedHold: null, lastUpdated: Date.now() } }],
    log: { kind: 'hospital', text: `${h.name}: ICU full. Held bed lost to an incoming critical patient` },
    notify: { roles: ['operator', 'hospital'], text: `${h.name} ICU is full`, tone: 'warn' },
  })
  await rerouteIfNeeded()
}

/** Distance along `main` where `alt` leaves it. */
function divergence(main: RouteData, alt: RouteData) {
  const mpl = polylineOf(main)
  const apl = polylineOf(alt)
  for (let i = 0; i < alt.geometry.length; i++) {
    if (!main.geometry.some((m) => haversine(m, alt.geometry[i]) < 25)) {
      const prev = alt.geometry[Math.max(0, i - 1)]
      return { onMain: project(mpl, prev), onAlt: apl.cum[Math.max(0, i - 1)] }
    }
  }
  return null
}

export async function reportBlockedRoad(actor: Actor = 'operator'): Promise<Trip | null> {
  const s = get()
  const t = selTrip(s)
  if (!t || t.status !== 'enroute') {
    toast('info', 'Dispatch a trip first, then report a blocked road on its route')
    return null
  }
  const mpl = polylineOf(t.route)
  const alt = t.altRoute
  const div = alt ? divergence(t.route, alt) : null
  const at = Math.max(t.progressM + 120, (div?.onMain ?? 0) + 40)
  if (at > mpl.length - 120) {
    toast('info', 'Too close to the hospital to re-route')
    return null
  }
  const coords = slice(mpl, at, Math.min(mpl.length - 60, at + 220))
  const blocked = { id: `BLK-${Date.now().toString(36)}`, tripId: t.id, coords, at, by: actor, ts: Date.now() }

  let main: RouteData | null = null
  let progressM = 0
  let note = ''
  if (alt && div && t.progressM <= div.onMain) {
    // Still on the shared stretch: continue on the OSRM alternative from the same spot.
    main = alt
    progressM = project(polylineOf(alt), ambulancePos(t))
    note = 'Switched to the OSRM alternative route'
  } else {
    try {
      const h = s.hospitals.find((x) => x.id === t.hospitalId)!
      const mid = coords[Math.floor(coords.length / 2)]
      const live = await liveRoutes([ambulancePos(t), [h.lng, h.lat]], true, 5000)
      main = live.find((r) => !r.geometry.some((p) => haversine(p, mid) < 30)) ?? null
      note = 'Live alternative route from the current position'
    } catch {
      main = null
    }
    if (!main && alt && div) {
      const back = slice(mpl, div.onMain, t.progressM).reverse()
      const ahead = slice(polylineOf(alt), div.onAlt, polylineOf(alt).length)
      const geometry = joinPaths(back, ahead)
      const pl = makePolyline(geometry)
      main = {
        geometry,
        distance: Math.round(pl.length),
        osrmDuration: (pl.length / alt.distance) * alt.osrmDuration,
        signals: alt.signals.filter((g) => g.at > div.onAlt).map((g) => ({ ...g, at: g.at - div.onAlt + (t.progressM - div.onMain) })),
        source: 'preset',
      }
      progressM = 0
      note = 'Turning back to join the OSRM alternative route'
    }
  }
  const t2 = selTrip(get())!
  commit({
    type: 'road/blocked',
    actor,
    ops: [{ op: 'push', key: 'blockedRoads', value: blocked }, ...(main ? swapRouteOps(t2, main, null, progressM) : [])],
    log: { kind: 'reroute', text: `Road blocked ${Math.round(at - t.progressM)} m ahead, reported by ${actor}. ${main ? note : 'No alternative found'}` },
    notify: { roles: ['operator', 'paramedic', 'hospital'], text: `Road blocked, reported by ${actor}. ${main ? note : 'Contact traffic police'}`, tone: 'warn' },
  })
  return main ? selTrip(get()) : null
}

export function signalLinkFail() {
  const s = get()
  const t = selTrip(s)
  const extra: Op[] = t ? [{ op: 'merge', key: 'trips', id: t.id, value: { corridor: t.corridor === 'pending' ? 'pending' : 'failed' } }, ...neutralOps(s, t)] : []
  commit({
    type: 'demo/signalLinkLost',
    actor: 'system',
    ops: [{ op: 'settings', value: { signalLinkLost: true, advisory: true } }, ...extra],
    log: { kind: 'signal', text: 'Signal link lost. Every junction back on its normal cycle. Advisory mode on' },
    notify: { roles: ['operator', 'paramedic', 'hospital'], text: 'Signal link lost. Normal cycle restored. Advisory mode on', tone: 'danger' },
  })
}

export function restoreSignalLink() {
  commit({
    type: 'demo/signalLinkRestored',
    actor: 'system',
    ops: [{ op: 'settings', value: { signalLinkLost: false } }],
    log: { kind: 'signal', text: 'Signal link restored. Advisory mode stays on until the operator turns it off' },
    notify: { roles: ['operator', 'paramedic'], text: 'Signal link restored' },
  })
}

export function setNetwork(up: boolean) {
  commit({
    type: 'demo/network',
    actor: 'system',
    ops: [{ op: 'settings', value: { networkUp: up } }],
    log: { kind: 'system', text: up ? 'Network back. Queued paramedic actions synced' : 'Network drop: paramedic app switched to SMS fallback' },
    notify: { roles: ['paramedic', 'operator'], text: up ? 'Network back' : 'Network dropped: SMS fallback active', tone: up ? 'ok' : 'warn' },
  })
}

/** Clears the active case and trip, back to an empty console. */
export function clearCase() {
  const s = get()
  commit({
    type: 'case/clear',
    actor: 'operator',
    ops: [...endTripOps(s), { op: 'set', key: 'activeCaseId', value: null }, { op: 'set', key: 'liveRoutes', value: {} }, { op: 'set', key: 'excluded', value: [] }],
    log: { kind: 'case', text: 'Console cleared for a new case' },
  })
  setLocal({ routingNote: null, selectedHospitalId: null, selectedSignalId: null, mci: null })
}

/** Resets every open tab to the starting state. `keepHistory` keeps Replay and the log for "Load demo case". */
export function resetDemo({ keepHistory = false, quiet = false } = {}) {
  const s = get()
  const fresh = initialSynced()
  const keep: Partial<SyncedState> = keepHistory ? { completedTrips: s.completedTrips, auditLog: s.auditLog, caseSeq: s.caseSeq, settings: { ...s.settings, signalLinkLost: false, networkUp: true } } : {}
  const next: SyncedState = { ...fresh, ...keep }
  commit({
    type: 'demo/reset',
    actor: 'operator',
    ops: (Object.keys(next) as (keyof SyncedState)[]).map((key) => ({ op: 'set', key, value: next[key] }) as Op),
    log: { kind: 'system', text: keepHistory ? 'Demo data reloaded' : 'Demo reset in every tab' },
    notify: quiet ? undefined : { roles: ['operator', 'paramedic', 'hospital'], text: 'Demo reset' },
  })
  if (!quiet) toast('info', 'Demo reset')
}

// ---------- Mass casualty (roadmap preview) ----------

export function massCasualty(patients: McPatient[], at: LngLat): McRow[] {
  const s = get()
  const preset = nearestPreset(at)
  const fake = (p: McPatient) =>
    rank(
      { id: p.id, injuryClass: p.injuryClass, gcs: p.injuryClass === 'head_injury' ? (p.severity === 'critical' ? 8 : 12) : 14 },
      s.hospitals,
      (h) => presetRoutes(preset.id, h.id)[0] ?? null,
      (r) => etaOf(r),
      s.weights[p.injuryClass],
      Date.now(),
    )
  return allocate(patients, fake, s.hospitals)
}

export { PRESETS, goldenRemaining }
