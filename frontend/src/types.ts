export type LngLat = [number, number]

export type Capability = 'ct' | 'mri' | 'cathLab' | 'burnsUnit' | 'bloodBank' | 'ot' | 'nicu' | 'obstetrics'
export type SpecialistKind = 'neurosurgeon' | 'traumaSurgeon' | 'cardiologist' | 'spineSurgeon' | 'obstetrician'
export type Presence = 'in_building' | 'on_call' | 'unavailable'

export interface SpecialistStatus {
  presence: Presence
  /** Minutes away when on call. */
  onCallMinutes: number
}

export interface Refusal {
  time: number
  reason: string
}

export interface BedHold {
  caseId: string
  /** Case sim-clock second when the hold lapses. */
  expiresAtSimS: number
}

export interface Hospital {
  id: string
  name: string
  area: string
  lat: number
  lng: number
  /** True when the service exists and is working right now. */
  capabilities: Record<Capability, boolean>
  specialists: Record<SpecialistKind, SpecialistStatus>
  /** Whether a stroke-ready team is on shift. */
  strokeTeam: boolean
  beds: { general: number; icu: number }
  erLoad: number
  lastUpdated: number
  cashlessScheme: boolean
  refusals: Refusal[]
  bedHold: BedHold | null
}

export type InjuryClass =
  | 'head_injury'
  | 'major_bleeding'
  | 'spinal_injury'
  | 'severe_burns'
  | 'stroke'
  | 'heart_attack'
  | 'obstetric'

export type Requirement =
  | { kind: 'capability'; key: Capability; label: string }
  | { kind: 'anyCapability'; keys: Capability[]; label: string }
  | { kind: 'specialist'; key: SpecialistKind; label: string }
  | { kind: 'icuBed'; label: string }
  | { kind: 'strokeTeam'; label: string }

export interface Weights {
  eta: number
  capability: number
  beds: number
  erLoad: number
}

export interface InjuryRule {
  id: InjuryClass
  label: string
  requires: Requirement[]
  /** Which specialist the capability depth and on-call penalty focus on. */
  keySpecialist: SpecialistKind | null
  weights: Weights
  alsRequired: boolean
}

export type AmbulanceType = 'BLS' | 'ALS'
export interface Ambulance {
  id: string
  type: AmbulanceType
  lat: number
  lng: number
  status: 'available' | 'busy'
  base: string
}

export interface Vitals {
  pulse: number
  systolic: number
  diastolic: number
  spo2: number
}

export interface Case {
  id: string
  injuryClass: InjuryClass
  gcs: number
  vitals: Vitals
  conscious: boolean
  location: LngLat
  locationLabel: string
  presetId: string | null
  /** Epoch ms of the 112 call. Golden hour counts from here. */
  callTime: number
  treatment: string[]
  notes: string
  /** Simulated seconds since the 112 call. Advanced by the simulation tab; the golden hour reads it. */
  simElapsedS: number
  /** Golden-hour clock stops at arrival. */
  frozen: boolean
  match: AmbulanceMatch | null
}

export interface Signal {
  id: string
  name: string
  loc: LngLat
  /** Metres from the start of the route. */
  at: number
  /** Direction of travel of the ambulance through the junction, degrees. */
  heading: number
}

export interface RouteData {
  geometry: LngLat[]
  /** Metres. */
  distance: number
  /** Raw OSRM free-flow seconds. */
  osrmDuration: number
  signals: Signal[]
  source: 'preset' | 'live'
}

export interface Eta {
  normalS: number
  corridorS: number
  signals: number
}

export type Confidence = 'fresh' | 'ageing' | 'stale'

export interface ScoreBreakdown {
  eta: number
  capability: number
  beds: number
  erLoad: number
}

export interface RankedHospital {
  hospital: Hospital
  eta: Eta
  route: RouteData | null
  /** Weighted terms, each already multiplied by its weight. */
  breakdown: ScoreBreakdown
  raw: number
  confidence: Confidence
  confidenceFactor: number
  specialistPenalty: number
  refusalPenalty: number
  total: number
  cashlessTieBreak: boolean
  ageMin: number
}

export interface FilteredHospital {
  hospital: Hospital
  reasons: string[]
}

export interface Ranking {
  required: Requirement[]
  ranked: RankedHospital[]
  filtered: FilteredHospital[]
}

export interface AmbulanceMatch {
  ambulance: Ambulance
  distanceKm: number
  etaMin: number
  skipped: { ambulance: Ambulance; distanceKm: number; reason: string } | null
  reason: string
}

export type Actor = 'operator' | 'paramedic' | 'hospital' | 'system'

export type SignalState = 'NORMAL' | 'ARMED' | 'GREEN_FOR_AMBULANCE' | 'RED_HOLD' | 'RELEASED'
export type Approach = 'N' | 'E' | 'S' | 'W'
export type SignalSource = 'auto' | 'operator' | 'request'

export interface SignalCommandRecord {
  /** Trip sim second of the command. */
  simT: number
  by: Actor
  source: SignalSource
  cmd: string
  from: SignalState
  advised: boolean
}

/** A junction on a trip's current route, with its live corridor state. */
export interface LiveSignal {
  /** Unique across re-routes: `${routeKey}|${code}`. */
  id: string
  code: string
  tripId: string
  routeKey: string
  name: string
  lat: number
  lng: number
  distanceAlongRoute: number
  heading: number
  ambulanceApproach: Approach
  state: SignalState
  source: SignalSource
  /** Advisory mode: the command sent to traffic police; the signal itself does not change. */
  advised: 'GREEN' | 'RED' | null
  holdStartedAt: number | null
  crossTrafficHeldSeconds: number
  capHit: boolean
  extended: boolean
  /** The ambulance already sat through a normal red here. */
  waited: boolean
  armedAt: number | null
  greenAt: number | null
  releasedAt: number | null
  /** Epoch ms until which the released tick shows. */
  releasedFlashUntil: number | null
  lastCommandBy: Actor | null
  lastCommandAt: number | null
  history: SignalCommandRecord[]
}

export type CorridorMode = 'pending' | 'active' | 'advisory' | 'failed'

export interface Trip {
  id: string
  caseId: string
  hospitalId: string
  ambulanceId: string
  route: RouteData
  altRoute: RouteData | null
  eta: Eta
  /** Sim seconds since dispatch. */
  simT: number
  progressM: number
  status: 'enroute' | 'arrived'
  corridor: CorridorMode
  /** Signals on the current route, in order. */
  signalIds: string[]
  /** Signals on routes left behind by a re-route. */
  pastSignalIds: string[]
  reroutes: number
  /** Sim seconds at arrival. */
  arrivedSimT: number | null
  /** Sampled path for replay: [simT, lng, lat]. */
  track: [number, number, number][]
  /** Seconds spent stopped at red. */
  waitedS: number
  /** Normal-cycle red: sim second the light turns. */
  waitUntil: number
  /** Signal the ambulance is stopped at, if any. */
  waitingAt: string | null
  routeKey: string
}

export interface BlockedRoad {
  id: string
  tripId: string
  coords: LngLat[]
  at: number
  by: Actor
  ts: number
}

export interface SignalRequest {
  id: string
  tripId: string
  signalId: string
  ts: number
  status: 'pending' | 'approved' | 'dismissed'
}

export interface HandoverNote {
  caseId: string
  hospitalId: string
  text: string
  ts: number
  by: Actor
}

export interface LogEntry {
  id: string
  t: number
  actor: Actor
  kind: 'case' | 'filter' | 'confirm' | 'bed' | 'corridor' | 'signal' | 'reroute' | 'arrival' | 'hospital' | 'system'
  text: string
}

export interface Toast {
  id: string
  tone: 'info' | 'warn' | 'danger' | 'ok'
  text: string
  action?: { label: string; run: () => void }
}

export interface CompletedTrip {
  id: string
  label: string
  hospitalName: string
  injury: string
  route: RouteData
  eta: Eta
  signals: LiveSignal[]
  track: [number, number, number][]
  reroutes: number
  maxHoldS: number
  minutesSaved: number
  durationS: number
  sample: boolean
}
