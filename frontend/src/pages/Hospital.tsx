import { Check, Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { Button, Chip, ConfidenceChip } from '../components/ui'
import { ALL_SPECS, SPECIALIST_LABEL } from '../data/hospitals'
import { INJURY_RULES } from '../data/injuryRules'
import { confidenceOf } from '../engine/engine'
import { ago, clock, handoverNote, mmss } from '../engine/text'
import { useNow, usePageMeta } from '../hooks/hooks'
import { acceptIncoming, confirmStatusUnchanged, divert, updateHospitalStatus } from '../services/api'
import { tripRemainingS } from '../sim/step'
import { holdRemainingS, setViewHospital, useAppStore, useCase, useRole, useSettings, useTrip } from '../store/appStore'
import { BaseMap } from '../map/BaseMap'
import { TripLayers } from '../map/TripLayers'
import { memo, useEffect } from 'react'
import type { Capability, Hospital, Presence, SpecialistKind } from '../types'

const DIVERT_REASONS = ['No ICU bed', 'Specialist unavailable', 'CT down', 'Other']

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="card p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">{label}</p>
      <div className="mt-2 flex items-center justify-between">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(0, value - 1))} className="grid h-12 w-12 place-items-center rounded-[4px] border border-line hover:border-route hover:text-route">
          <Minus size={18} aria-hidden />
        </button>
        <span className={`font-mono text-[40px] font-medium leading-none tnum ${value === 0 ? 'text-signal' : ''}`} aria-live="polite">
          {value}
        </span>
        <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(value + 1)} className="grid h-12 w-12 place-items-center rounded-[4px] border border-line hover:border-route hover:text-route">
          <Plus size={18} aria-hidden />
        </button>
      </div>
    </div>
  )
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={`flex h-12 items-center justify-between rounded-[4px] border px-3 text-[15px] ${on ? 'border-route bg-route-soft text-route' : 'border-signal bg-white text-signal'}`}>
      {label}
      <span className="font-mono text-[11px] uppercase tracking-[0.06em]">{on ? 'Working' : 'Not working'}</span>
    </button>
  )
}

const PRESENCE: { id: Presence; label: string }[] = [
  { id: 'in_building', label: 'In building' },
  { id: 'on_call', label: 'On call' },
  { id: 'unavailable', label: 'Unavailable' },
]

function SpecialistRow({ h, k }: { h: Hospital; k: SpecialistKind }) {
  const s = h.specialists[k]
  const set = (presence: Presence, onCallMinutes = s.onCallMinutes || 20) =>
    updateHospitalStatus(h.id, { specialists: { ...h.specialists, [k]: { presence, onCallMinutes } } }, `${SPECIALIST_LABEL[k]} ${presence.replace('_', ' ')}`)
  return (
    <div className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-center">
      <span className="w-40 text-[15px]">{SPECIALIST_LABEL[k]}</span>
      <div className="flex flex-1 border border-line" role="radiogroup" aria-label={`${SPECIALIST_LABEL[k]} presence`}>
        {PRESENCE.map((p) => {
          const on = s.presence === p.id
          const tone = p.id === 'in_building' ? 'bg-route' : p.id === 'on_call' ? 'bg-amber' : 'bg-signal'
          return (
            <button key={p.id} type="button" role="radio" aria-checked={on} onClick={() => set(p.id)} className={`h-11 flex-1 border-l border-line text-[13px] first:border-l-0 ${on ? `${tone} text-white` : 'bg-white hover:bg-paper-2'}`}>
              {p.label}
            </button>
          )
        })}
      </div>
      {s.presence === 'on_call' && (
        <label className="flex items-center gap-1.5 text-[13px] text-ink-2">
          <input type="number" min={5} max={120} value={s.onCallMinutes} onChange={(e) => set('on_call', Math.max(5, Number(e.target.value) || 5))} className="h-11 w-16 rounded-[2px] border border-line bg-white px-2 font-mono tnum" aria-label={`${SPECIALIST_LABEL[k]} minutes away`} />
          min away
        </label>
      )}
    </div>
  )
}

/** Live map of the incoming ambulance. Memoised so ETA ticks do not re-render it. */
const ErMap = memo(function ErMap({ tripId }: { tripId: string }) {
  const route = useAppStore((s) => s.trips[tripId]?.route)
  if (!route) return null
  return (
    <div className="relative mt-4 h-[200px] overflow-hidden rounded-[4px] border border-line">
      <BaseMap center={route.geometry[Math.floor(route.geometry.length / 2)]} zoom={12.6} label="Live position of the incoming ambulance">
        <TripLayers id="er" />
      </BaseMap>
    </div>
  )
})

export default function HospitalPage() {
  usePageMeta('Hospital ER dashboard | MediRoute', 'Incoming ambulances, one-tap status updates and data freshness for each ER. Sample data.')
  const now = useNow(1000)
  useRole('hospital')
  const hospitals = useAppStore((s) => s.hospitals)
  const trip = useTrip()
  const kase = useCase()
  const signals = useAppStore((s) => s.signals)
  const st = useSettings()
  const [id, setId] = useState<string>(() => {
    const s = useAppStore.getState()
    return (s.activeTripId && s.trips[s.activeTripId]?.hospitalId) || 'h-baner'
  })
  useEffect(() => {
    setViewHospital(id)
    return () => setViewHospital(null)
  }, [id])
  const holdLeft = useAppStore((s) => {
    const hh = s.hospitals.find((x) => x.id === id)
    return hh ? holdRemainingS(s, hh) : null
  })
  const note = useAppStore((s) => (kase ? s.handoverNotes[kase.id] ?? null : null))
  const [diverting, setDiverting] = useState(false)
  const [accepted, setAccepted] = useState<string | null>(null)
  const h = hospitals.find((x) => x.id === id) ?? hospitals[0]
  const conf = confidenceOf(h.lastUpdated, now)
  const incoming = trip && kase && trip.hospitalId === h.id ? trip : null
  const etaLeft = incoming ? tripRemainingS(incoming, signals, st) : null

  const cap = (c: Capability, v: boolean, label: string) => updateHospitalStatus(h.id, { capabilities: { ...h.capabilities, [c]: v } }, `${label} ${v ? 'working' : 'down'}`)

  return (
    <AppShell>
      <div className="flex flex-col gap-3 px-4 pt-6 sm:flex-row sm:items-center md:px-6">
        <label className="text-[14px] font-medium" htmlFor="hsw">
          Hospital
        </label>
        <select id="hsw" value={h.id} onChange={(e) => setId(e.target.value)} className="h-10 w-full max-w-[420px] rounded-[4px] border border-line bg-white px-3 text-[14px]">
          {hospitals.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}, {x.area}
            </option>
          ))}
        </select>
        <ConfidenceChip level={conf.level} text={ago(h.lastUpdated, now)} />
      </div>

      {conf.level !== 'fresh' && (
        <div className={`flex flex-col gap-3 px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between md:px-6 ${conf.level === 'stale' ? 'bg-signal' : 'bg-amber'}`} role="alert">
          <p className="font-mono text-[12px] uppercase tracking-[0.06em]">{conf.level === 'stale' ? `Your data is now marked stale. Last update ${conf.ageMin} min ago.` : `Please confirm your status. Last update ${conf.ageMin} min ago.`}</p>
        </div>
      )}

      <main className="grid gap-8 px-4 py-6 md:px-6 lg:grid-cols-2">
        <section aria-labelledby="inc-h" className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 id="inc-h" className="text-[22px] font-bold uppercase tracking-[-0.01em]">
              Incoming ambulances
            </h1>
          </div>
          {incoming && kase ? (
            <div className="card float p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
                    {incoming.ambulanceId}, {kase.id}
                  </p>
                  <p className="mt-1 text-[20px] font-bold">{INJURY_RULES[kase.injuryClass].label}</p>
                  <p className="text-[15px] text-ink-2">
                    GCS {kase.gcs}, {kase.conscious ? 'conscious' : 'unconscious'}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`font-mono text-[34px] font-medium leading-none tnum ${incoming.status === 'arrived' ? 'text-route' : ''}`}>{incoming.status === 'arrived' ? 'Arrived' : mmss(etaLeft ?? 0)}</p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-2">{incoming.status === 'arrived' ? 'Held ICU bed now occupied' : incoming.waitingAt ? 'ETA, slipping: ambulance waiting at a signal' : 'ETA, simulated'}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {h.bedHold && <Chip tone="green">ICU bed held {mmss(holdLeft ?? 0)}</Chip>}
                {incoming.corridor === 'active' && <Chip tone="green">Green corridor active</Chip>}
                {incoming.corridor === 'advisory' && <Chip tone="amber">Corridor advised to police</Chip>}
                {accepted === incoming.id && <Chip tone="ink">Accepted, trauma bay ready</Chip>}
              </div>
              <ErMap tripId={incoming.id} />
              {note ? (
                <div className="mt-4">
                  <p className="text-[12px] text-route">Handover note from the paramedic, received {clock(note.ts)}</p>
                  <pre className="mt-1 whitespace-pre-wrap font-mono text-[12px] leading-[1.6]">{note.text}</pre>
                </div>
              ) : (
                <pre className="mt-4 whitespace-pre-wrap font-mono text-[12px] leading-[1.6] text-ink-2">{handoverNote(kase, h.name, etaLeft)}</pre>
              )}
              {incoming.status === 'enroute' && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="lg"
                    onClick={() => {
                      setAccepted(incoming.id)
                      acceptIncoming(h.id)
                    }}
                    disabled={accepted === incoming.id}
                  >
                    <Check size={17} aria-hidden /> Accept
                  </Button>
                  <Button size="lg" variant="danger" onClick={() => setDiverting((x) => !x)} aria-expanded={diverting}>
                    Divert
                  </Button>
                </div>
              )}
              {diverting && incoming.status === 'enroute' && (
                <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Divert reason">
                  {DIVERT_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setDiverting(false)
                        divert(h.id, r)
                      }}
                      className="h-12 rounded-[4px] border border-signal/50 bg-white text-[14px] text-signal hover:bg-signal hover:text-white"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="card p-6 text-[15px] text-ink-2">
              No ambulance is heading here. In another tab, open the{' '}
              <Link to="/console" target="_blank" className="text-route underline underline-offset-4">
                operator console
              </Link>
              , load the demo case and confirm. The case appears here within a second.
            </div>
          )}

          <div>
            <h2 className="mb-2 text-[17px] font-bold uppercase">Refusal log</h2>
            <div className="overflow-x-auto">
              <table className="w-full border border-line bg-white text-left text-[14px]">
                <thead className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-2">
                  <tr className="border-b border-line">
                    <th className="p-2.5">Time</th>
                    <th className="p-2.5">Reason</th>
                    <th className="p-2.5">Age</th>
                  </tr>
                </thead>
                <tbody>
                  {h.refusals.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-2.5 text-ink-2">
                        No refusals logged.
                      </td>
                    </tr>
                  )}
                  {[...h.refusals].reverse().map((r) => (
                    <tr key={r.time} className="border-b border-line last:border-b-0">
                      <td className="p-2.5 font-mono tnum">{clock(r.time)}</td>
                      <td className="p-2.5">{r.reason}</td>
                      <td className="p-2.5 font-mono text-[12px] text-ink-2 tnum">{Math.round((now - r.time) / 3_600_000)} h ago</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section aria-labelledby="st-h" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="st-h" className="text-[22px] font-bold uppercase tracking-[-0.01em]">
              Status
            </h2>
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">{ago(h.lastUpdated, now)}</span>
          </div>
          <Button size="lg" variant={conf.level === 'fresh' ? 'secondary' : 'primary'} className="w-full" onClick={() => confirmStatusUnchanged(h.id)}>
            <Check size={17} aria-hidden /> Confirm status unchanged
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Stepper label={h.bedHold ? 'ICU beds free (1 more held)' : 'ICU beds free'} value={h.beds.icu} onChange={(v) => updateHospitalStatus(h.id, { beds: { ...h.beds, icu: v } }, `ICU beds free: ${v}`)} />
            <Stepper label="General beds free" value={h.beds.general} onChange={(v) => updateHospitalStatus(h.id, { beds: { ...h.beds, general: v } }, `General beds free: ${v}`)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Toggle label="CT" on={h.capabilities.ct} onChange={(v) => cap('ct', v, 'CT')} />
            <Toggle label="MRI" on={h.capabilities.mri} onChange={(v) => cap('mri', v, 'MRI')} />
            <Toggle label="Cath lab" on={h.capabilities.cathLab} onChange={(v) => cap('cathLab', v, 'Cath lab')} />
          </div>
          <div className="card px-4 py-1">
            {ALL_SPECS.map((k) => (
              <SpecialistRow key={k} h={h} k={k} />
            ))}
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-2">Sample data. Every change syncs to the operator console in other tabs.</p>
        </section>
      </main>
    </AppShell>
  )
}
