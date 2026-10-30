import { AnimatePresence, motion } from 'framer-motion'
import { BedDouble, Ban, FlaskConical, Pause, Play, RadioTower, RotateCcw, Users, WifiOff, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { INJURY_ORDER, INJURY_SHORT } from '../../data/injuryRules'
import type { McPatient, Severity } from '../../engine/massCasualty'
import { mins } from '../../engine/text'
import { massCasualty, reportBlockedRoad, resetDemo, restoreSignalLink, setNetwork, setPlaying, setSpeed, signalLinkFail, triggerIcuFull } from '../../services/api'
import { PRESETS } from '../../data/places'
import { setLocal, toast, useAppStore, useCase, useSettings } from '../../store/appStore'
import { Button, Chip } from '../../components/ui'

const SPEEDS = [1, 4, 10]

/** One "Demo" button in the top bar with a plain list of simulation controls. Closes after each action. */
export function DemoMenu({ initialOpen = false }: { initialOpen?: boolean }) {
  const st = useSettings()
  const sim = { playing: st.playing, speed: st.speed }
  const networkUp = st.networkUp
  const linkLost = st.signalLinkLost
  const [open, setOpen] = useState(initialOpen)
  const [mci, setMci] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  const run = (fn: () => void, note?: string) => {
    setOpen(false)
    fn()
    if (note) toast('info', note, 2600)
  }
  const item = 'flex min-h-10 w-full items-center gap-3 rounded-[4px] px-3 text-left text-[14px] hover:bg-paper'
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className="flex h-10 items-center gap-2 rounded-[4px] border border-line px-3 text-[14px] font-medium hover:border-route hover:text-route">
        <FlaskConical size={15} aria-hidden /> <span className="hidden sm:inline">Demo</span>
      </button>
      {open && (
        <div className="float absolute right-0 top-12 z-50 w-[280px] rounded-[4px] border border-line bg-white p-2" role="menu" aria-label="Demo controls">
          <div className="flex items-center gap-2 px-1 pb-2">
            <button
              type="button"
              role="menuitem"
              aria-label={sim.playing ? 'Pause simulation' : 'Play simulation'}
              onClick={() => run(() => setPlaying(!sim.playing), sim.playing ? 'Simulation paused' : 'Simulation playing')}
              className="grid h-10 w-10 place-items-center rounded-[4px] border border-line hover:border-route hover:text-route"
            >
              {sim.playing ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}
            </button>
            <div className="flex flex-1 gap-1" role="group" aria-label="Simulation speed">
              {SPEEDS.map((sp) => (
                <button
                  key={sp}
                  type="button"
                  role="menuitemradio"
                  aria-checked={sim.speed === sp}
                  onClick={() => run(() => setSpeed(sp), `Speed ${sp}x`)}
                  className={`h-10 flex-1 rounded-[4px] font-mono text-[13px] ${sim.speed === sp ? 'bg-route-soft text-route' : 'hover:bg-paper'}`}
                >
                  {sp}x
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-line pt-2">
            <button type="button" role="menuitem" className={item} onClick={() => run(() => triggerIcuFull())}>
              <BedDouble size={15} className="text-signal" aria-hidden /> Hospital ICU fills up
            </button>
            <button type="button" role="menuitem" className={item} onClick={() => run(() => reportBlockedRoad())}>
              <Ban size={15} className="text-signal" aria-hidden /> Report blocked road
            </button>
            <button type="button" role="menuitem" className={item} onClick={() => run(() => (linkLost ? restoreSignalLink() : signalLinkFail()), linkLost ? 'Signal link restored' : undefined)}>
              <RadioTower size={15} className={linkLost ? 'text-route' : 'text-signal'} aria-hidden /> {linkLost ? 'Restore signal link' : 'Signal link fails'}
            </button>
            <button type="button" role="menuitem" className={item} onClick={() => run(() => setNetwork(!networkUp), networkUp ? 'Network dropped. Paramedic app on SMS fallback.' : 'Network back')}>
              <WifiOff size={15} className={networkUp ? 'text-signal' : 'text-route'} aria-hidden /> {networkUp ? 'Network drop' : 'Network back'}
            </button>
            <button type="button" role="menuitem" className={item} onClick={() => run(() => setMci(true))}>
              <Users size={15} aria-hidden /> Mass-casualty preview
            </button>
            <button type="button" role="menuitem" className={`${item} text-ink-2`} onClick={() => run(() => resetDemo())}>
              <RotateCcw size={15} aria-hidden /> Reset demo
            </button>
          </div>
        </div>
      )}
      <AnimatePresence>{mci && <MciModal onClose={() => setMci(false)} />}</AnimatePresence>
    </div>
  )
}

const SEV: Severity[] = ['critical', 'serious', 'stable']

function MciModal({ onClose }: { onClose: () => void }) {
  const kase = useCase()
  const result = useAppStore((s) => s.mci)
  const [at, setAt] = useState(kase?.presetId ?? PRESETS[0].id)
  const [patients, setPatients] = useState<McPatient[]>(() =>
    [
      ['critical', 'head_injury'],
      ['critical', 'major_bleeding'],
      ['serious', 'spinal_injury'],
      ['serious', 'major_bleeding'],
      ['stable', 'severe_burns'],
    ].map(([s, i], n) => ({ id: `P${n + 1}`, severity: s as Severity, injuryClass: i as McPatient['injuryClass'] })),
  )
  const run = () => {
    const loc = PRESETS.find((p) => p.id === at)!.loc
    setLocal({ mci: { rows: massCasualty(patients, loc), at: loc } })
  }
  const sel = 'h-10 rounded-[4px] border border-line bg-white px-2 text-[14px]'
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] grid place-items-center bg-ink/30 p-4" role="dialog" aria-modal="true" aria-label="Mass-casualty mode">
      <motion.div initial={{ y: 16 }} animate={{ y: 0 }} exit={{ y: 16 }} transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.4 }} className="float max-h-[90vh] w-full max-w-[720px] overflow-y-auto border border-line bg-paper">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-[17px] font-bold uppercase">Mass-casualty mode</h2>
            <Chip tone="amber">Roadmap preview</Chip>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center hover:bg-paper-2">
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-[14px] text-ink-2">Most severe first. Each patient uses up a bed, so two patients never get the same last bed. Load is spread across hospitals.</p>
          <label className="flex items-center gap-2 text-[13px]">
            Incident at
            <select value={at} onChange={(e) => setAt(e.target.value)} className={sel}>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <ul className="space-y-1.5">
            {patients.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className="w-8 font-mono text-[12px]">{p.id}</span>
                <select aria-label={`${p.id} severity`} className={sel} value={p.severity} onChange={(e) => setPatients((ps) => ps.map((x, j) => (j === i ? { ...x, severity: e.target.value as Severity } : x)))}>
                  {SEV.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select aria-label={`${p.id} injury`} className={`${sel} flex-1`} value={p.injuryClass} onChange={(e) => setPatients((ps) => ps.map((x, j) => (j === i ? { ...x, injuryClass: e.target.value as McPatient['injuryClass'] } : x)))}>
                  {INJURY_ORDER.map((k) => (
                    <option key={k} value={k}>
                      {INJURY_SHORT[k]}
                    </option>
                  ))}
                </select>
                <button type="button" aria-label={`Remove ${p.id}`} disabled={patients.length <= 3} onClick={() => setPatients((ps) => ps.filter((_, j) => j !== i))} className="grid h-8 w-8 place-items-center border border-line disabled:opacity-30">
                  <X size={13} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={patients.length >= 10} onClick={() => setPatients((ps) => [...ps, { id: `P${ps.length + 1}`, severity: 'serious', injuryClass: 'major_bleeding' }])}>
              Add patient
            </Button>
            <Button size="sm" onClick={run} arrow>
              Allocate
            </Button>
            {result && (
              <Button size="sm" variant="ghost" onClick={() => setLocal({ mci: null })}>
                Clear from map
              </Button>
            )}
          </div>
          {result && (
            <div className="overflow-x-auto">
              <table className="w-full border border-line bg-white text-left text-[13px]">
                <thead className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-2">
                  <tr className="border-b border-line">
                    <th className="p-2">Patient</th>
                    <th className="p-2">Severity</th>
                    <th className="p-2">Hospital</th>
                    <th className="p-2">Bed</th>
                    <th className="p-2">ETA</th>
                    <th className="p-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.patient.id} className="border-b border-line last:border-b-0">
                      <td className="p-2 font-mono">{r.patient.id}</td>
                      <td className="p-2">
                        <Chip tone={r.patient.severity === 'critical' ? 'red' : r.patient.severity === 'serious' ? 'amber' : 'ink'}>{r.patient.severity}</Chip>
                      </td>
                      <td className="p-2">{r.hospital?.name ?? 'None'}</td>
                      <td className="p-2">{r.bed ?? ''}</td>
                      <td className="p-2 font-mono tnum">{r.etaS ? mins(r.etaS) : ''}</td>
                      <td className="p-2 text-ink-2">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-2">Sample data. Lines are drawn on the map in severity colours.</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
