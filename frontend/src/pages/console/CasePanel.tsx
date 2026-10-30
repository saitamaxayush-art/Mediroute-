import { ChevronDown, Loader2, Mic, X } from 'lucide-react'
import { useState } from 'react'
import { VoiceTriage } from '../../components/VoiceTriage'
import { Button, SampleData } from '../../components/ui'
import { INJURY_ORDER, INJURY_RULES } from '../../data/injuryRules'
import { fmtCoord, PRESETS } from '../../data/places'
import type { ParsedTriage } from '../../engine/voice'
import { clearCase, createCase, loadDemoCase, updateCase } from '../../services/api'
import { setLocal, useAppStore, useCase, type Draft } from '../../store/appStore'
import type { InjuryClass, Vitals } from '../../types'
import { useConsoleState } from './state'

const label = 'mb-2 block text-[13px] font-medium text-ink'
const input = 'h-10 w-full rounded-[4px] border border-line bg-white px-3 text-[14px] tnum focus:border-ink focus:outline-none'
const link = 'text-[14px] text-route underline-offset-4 hover:underline disabled:opacity-40'

type Fields = Pick<Draft, 'injuryClass' | 'gcs' | 'conscious' | 'vitals'>

/** Injury, GCS, voice and optional vitals. Edits the draft, or the open case when `live`. */
function CaseFields({ v, patch }: { v: Fields; patch: (p: Partial<Fields>) => void }) {
  const [voice, setVoice] = useState(false)
  const [vitalsOpen, setVitalsOpen] = useState(false)
  const patchVitals = (p: Partial<Vitals>) => patch({ vitals: { ...v.vitals, ...p } })
  const onParsed = (p: ParsedTriage) => {
    const out: Partial<Fields> = {}
    if (p.injuryClass) out.injuryClass = p.injuryClass
    if (p.gcs !== undefined) out.gcs = p.gcs
    if (p.conscious !== undefined) out.conscious = p.conscious
    const vit: Partial<Vitals> = {}
    if (p.pulse) vit.pulse = p.pulse
    if (p.spo2) vit.spo2 = p.spo2
    if (p.systolic) vit.systolic = p.systolic
    if (p.diastolic) vit.diastolic = p.diastolic
    if (Object.keys(vit).length) out.vitals = { ...v.vitals, ...vit }
    patch(out)
  }
  return (
    <div className="space-y-4">
      <div>
        <label className={label} htmlFor="injury">
          Injury
        </label>
        <div className="relative">
          <select id="injury" className={`${input} appearance-none pr-20`} value={v.injuryClass} onChange={(e) => patch({ injuryClass: e.target.value as InjuryClass })}>
            {INJURY_ORDER.map((k) => (
              <option key={k} value={k}>
                {INJURY_RULES[k].label}
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-11 top-1/2 -translate-y-1/2 text-ink-2" aria-hidden />
          <button
            type="button"
            onClick={() => setVoice((x) => !x)}
            aria-pressed={voice}
            aria-label={voice ? 'Close voice triage' : 'Voice triage'}
            title="Voice triage"
            className={`absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-[3px] ${voice ? 'bg-route-soft text-route' : 'text-ink hover:text-route'}`}
          >
            {voice ? <X size={16} aria-hidden /> : <Mic size={16} aria-hidden />}
          </button>
        </div>
      </div>
      {voice && (
        <div className="rounded-[4px] border border-line bg-white p-3">
          <VoiceTriage onParsed={onParsed} autoStart />
        </div>
      )}
      {v.injuryClass === 'head_injury' && (
        <div>
          <div className="flex items-baseline justify-between">
            <label className={label} htmlFor="gcs">
              GCS
            </label>
            <span className="font-mono text-[13px] tnum">{v.gcs} / 15</span>
          </div>
          <input id="gcs" type="range" min={3} max={15} value={v.gcs} onChange={(e) => patch({ gcs: Number(e.target.value) })} className="w-full" />
        </div>
      )}
      <div>
        <button type="button" onClick={() => setVitalsOpen((x) => !x)} aria-expanded={vitalsOpen} className="flex h-10 w-full items-center justify-between text-[14px] text-ink hover:text-route">
          Add vitals (optional)
          <ChevronDown size={16} className={`transition-transform duration-300 ${vitalsOpen ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {vitalsOpen && (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <label className="col-span-2 flex items-center gap-2 text-[14px]">
              <input type="checkbox" checked={!v.conscious} onChange={(e) => patch({ conscious: !e.target.checked })} className="h-4 w-4 accent-[#0B6B3A]" />
              Unconscious
            </label>
            <div>
              <label className={label} htmlFor="pulse">
                Pulse
              </label>
              <input id="pulse" type="number" className={input} value={v.vitals.pulse} onChange={(e) => patchVitals({ pulse: Number(e.target.value) })} />
            </div>
            <div>
              <label className={label} htmlFor="spo2">
                SpO2 %
              </label>
              <input id="spo2" type="number" className={input} value={v.vitals.spo2} onChange={(e) => patchVitals({ spo2: Number(e.target.value) })} />
            </div>
            <div className="col-span-2">
              <span className={label}>Blood pressure</span>
              <div className="flex items-center gap-2">
                <input aria-label="Systolic" type="number" className={input} value={v.vitals.systolic} onChange={(e) => patchVitals({ systolic: Number(e.target.value) })} />
                <span className="text-ink-2">/</span>
                <input aria-label="Diastolic" type="number" className={input} value={v.vitals.diastolic} onChange={(e) => patchVitals({ diastolic: Number(e.target.value) })} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function NewCase() {
  const draft = useAppStore((s) => s.draft)
  const busy = useAppStore((s) => s.routingBusy)
  const patch = (p: Partial<Draft>) => setLocal((s) => ({ draft: { ...s.draft, ...p } }))
  const demo = PRESETS[0]
  const find = () => {
    if (!draft.loc) return
    createCase({ ...draft, location: draft.loc, locationLabel: draft.label ?? undefined, presetId: draft.presetId })
  }
  return (
    <>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
        <section aria-labelledby="s1">
          <p id="s1" className="mb-3 font-mono text-[12px] uppercase tracking-[0.06em] text-ink-2">
            1. Injury
          </p>
          <CaseFields v={draft} patch={patch} />
        </section>
        <section aria-labelledby="s2">
          <p id="s2" className="mb-3 font-mono text-[12px] uppercase tracking-[0.06em] text-ink-2">
            2. Location
          </p>
          {draft.loc ? (
            <p className="text-[14px]">
              {draft.label ?? 'Dropped pin'} <span className="block font-mono text-[12px] text-ink-2">{fmtCoord(draft.loc)}</span>
            </p>
          ) : (
            <p className="text-[14px]">Click the map to place the crash.</p>
          )}
          <button type="button" className={`${link} mt-2`} onClick={() => patch({ loc: demo.loc, label: demo.label, presetId: demo.id })}>
            Use demo location
          </button>
        </section>
      </div>
      <div className="border-t border-line p-5">
        <p className="mb-3 font-mono text-[12px] uppercase tracking-[0.06em] text-ink-2">3. Find hospital</p>
        <Button className="w-full" size="lg" disabled={!draft.loc || busy} onClick={find}>
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden /> Fetching road routes
            </>
          ) : (
            'Find hospital'
          )}
        </Button>
        {!draft.loc && <p className="mt-2 text-[13px] text-ink-2">Place the crash on the map first.</p>}
      </div>
    </>
  )
}

function Summary() {
  const kase = useCase()!
  const match = kase.match
  const note = useAppStore((s) => s.routingNote)
  const state = useConsoleState()
  const [edit, setEdit] = useState(false)
  const v = kase.vitals
  const rows: [string, string][] = [
    ['Injury', INJURY_RULES[kase.injuryClass].label],
    ['GCS', `${kase.gcs} / 15, ${kase.conscious ? 'conscious' : 'unconscious'}`],
    ['Vitals', `Pulse ${v.pulse}, BP ${v.systolic}/${v.diastolic}, SpO2 ${v.spo2}%`],
    ['Location', kase.locationLabel],
  ]
  if (match) rows.push(['Ambulance', `${match.ambulance.id} (${match.ambulance.type}), ${match.etaMin} min away`])
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[13px] uppercase tracking-[0.06em]">{kase.id}</h2>
        {state === 'ranked' && (
          <button type="button" className={link} onClick={() => setEdit((x) => !x)} aria-expanded={edit}>
            {edit ? 'Done' : 'Edit case'}
          </button>
        )}
      </div>
      {note && <p className="rounded-[4px] border border-amber/50 bg-white px-3 py-2 text-[13px] text-amber">{note}</p>}
      {edit && state === 'ranked' ? (
        <CaseFields v={kase} patch={(p) => updateCase(p)} />
      ) : (
        <dl className="card divide-y divide-line">
          {rows.map(([k, val]) => (
            <div key={k} className="px-4 py-3">
              <dt className="text-[12px] text-ink-2">{k}</dt>
              <dd className="mt-0.5 text-[14px]">{val}</dd>
            </div>
          ))}
        </dl>
      )}
      {match?.skipped && <p className="text-[13px] text-ink-2">{match.reason}.</p>}
      <button type="button" className={link} onClick={() => clearCase()}>
        Start over
      </button>
    </div>
  )
}

export function CasePanel() {
  const kase = useCase()
  const busy = useAppStore((s) => s.routingBusy)
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-5">
        <h2 className="text-[16px] font-bold">{kase ? 'Case' : 'New case'}</h2>
        {!kase ? (
          <button type="button" className={link} onClick={() => loadDemoCase()} disabled={busy}>
            Load demo case
          </button>
        ) : (
          <SampleData className="lg:hidden" />
        )}
      </div>
      {kase ? <Summary /> : <NewCase />}
    </div>
  )
}
