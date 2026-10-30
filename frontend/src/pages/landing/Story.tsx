import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { Map as MLMap } from 'maplibre-gl'
import { Chip, ConfidenceChip, SampleData, SectionLabel } from '../../components/ui'
import { GoldenClock } from '../../components/GoldenClock'
import { SIM } from '../../config/simulation'
import { DEMO_CALL_CLOCK } from '../../data/scenario'
import { INJURY_RULES } from '../../data/injuryRules'
import { mins, mmss } from '../../engine/text'
import { BaseMap } from '../../map/BaseMap'
import { CrashPin, HospitalMarker, SignalMarker, type HospitalMarkState } from '../../map/markers'
import { RouteRunner } from '../../map/RouteRunner'
import type { LngLat, RankedHospital } from '../../types'
import { demo } from './demo'
import { signalStatesAt } from './Hero'
import { useInView } from './bits'

gsap.registerPlugin(ScrollTrigger)

const CH = [
  { id: 'CALL', caption: 'A two-wheeler crash is reported on 112. The clock starts.' },
  { id: 'TRIAGE', caption: 'The paramedic speaks. The form fills itself.' },
  { id: 'FILTER', caption: 'Hospitals that cannot treat this patient are removed.' },
  { id: 'TRUST', caption: 'Old data counts for less. Every number shows its age.' },
  { id: 'MATCH', caption: 'The operator confirms. One ICU bed is held.' },
  { id: 'CLEAR ROAD', caption: "Only the ambulance's approach turns green, one or two junctions ahead." },
  { id: 'HAND OVER', caption: 'The ER knows who is coming before the doors open.' },
  { id: 'ARRIVE', caption: 'Right hospital. One trip. Time left on the clock.' },
]
const N = CH.length
const DRIVE_START = 5 / N + 0.2 / N
const DRIVE_END = 7 / N + 0.9 / N

type Cam = { p: number; c: LngLat; z: number }
const CAMS: Cam[] = [
  { p: 0, c: [73.85, 18.53], z: 11.2 },
  { p: 0.1, c: [73.8296, 18.5293], z: 14.4 },
  { p: 0.24, c: [73.8296, 18.5293], z: 14.4 },
  { p: 0.3, c: [73.852, 18.52], z: 11.45 },
  { p: 0.47, c: [73.835, 18.528], z: 12.1 },
  { p: 0.6, c: [73.808, 18.545], z: 13.05 },
  { p: 0.86, c: [73.808, 18.545], z: 13.05 },
  { p: 0.97, c: [73.788, 18.558], z: 14.2 },
  { p: 1, c: [73.788, 18.558], z: 14.2 },
]

const smooth = (t: number) => t * t * (3 - 2 * t)
function camAt(p: number, dz: number) {
  let i = 0
  while (i < CAMS.length - 2 && CAMS[i + 1].p < p) i++
  const a = CAMS[i]
  const b = CAMS[i + 1]
  const t = smooth(Math.min(1, Math.max(0, (p - a.p) / (b.p - a.p || 1))))
  return { center: [a.c[0] + (b.c[0] - a.c[0]) * t, a.c[1] + (b.c[1] - a.c[1]) * t] as LngLat, zoom: a.z + (b.z - a.z) * t + dz }
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** Everything the scene shows at progress p. Quantised so React re-renders only on visible changes. */
function viewAt(p: number) {
  const d = demo()
  const ch = Math.min(N - 1, Math.floor(p * N))
  const lp = Math.round((p * N - ch) * 40) / 40
  const drive = clamp01((p - DRIVE_START) / (DRIVE_END - DRIVE_START))
  const prog = drive * d.pl.length
  const sceneFrac = clamp01(p / (5 / N))
  const elapsed = d.sceneS * sceneFrac + d.winner.eta.corridorS * drive
  return { ch, lp, drive: Math.round(drive * 200) / 200, prog, golden: 3600 - elapsed }
}
type View = ReturnType<typeof viewAt>
const viewKey = (v: View) => `${v.ch}|${v.lp}|${v.drive}|${Math.round(v.golden / 5)}`

function Card({ show, children, className = '' }: { show: boolean; children: ReactNode; className?: string }) {
  return (
    <div
      className={`float border border-line bg-white transition-[opacity,transform] duration-500 ease-out ${show ? 'opacity-100' : 'pointer-events-none translate-y-3 opacity-0'} ${className}`}
      aria-hidden={!show}
    >
      {children}
    </div>
  )
}

function Bars({ r, grow }: { r: RankedHospital; grow: number }) {
  const segs = [
    ['bg-route', r.breakdown.eta],
    ['bg-ink', r.breakdown.capability],
    ['bg-ink-2', r.breakdown.beds],
    ['bg-line', r.breakdown.erLoad],
  ] as const
  const sum = segs.reduce((a, s) => a + s[1], 0) || 1
  return (
    <div className="flex h-2 w-full bg-paper-2">
      {segs.map(([c, v], i) => (
        <span key={i} className={`${c} h-full border-r border-white transition-[width] duration-300 ease-out last:border-r-0`} style={{ width: `${(v / sum) * r.total * grow * 100}%` }} />
      ))}
    </div>
  )
}

/** The story scene. `getP` is read every frame; in the static version it is a constant. */
function Scene({ getP, compact, still }: { getP: () => number; compact: boolean; still?: boolean }) {
  const d = demo()
  const [view, setView] = useState<View>(() => viewAt(getP()))
  const [map, setMap] = useState<MLMap | null>(null)
  const keyRef = useRef(viewKey(view))
  const getPRef = useRef(getP)
  getPRef.current = getP
  const dz = compact ? -0.95 : 0

  const onReady = useCallback((m: MLMap) => setMap(m), [])

  useEffect(() => {
    if (!map) return
    let raf = 0
    let lastP = -1
    const frame = () => {
      raf = requestAnimationFrame(frame)
      const p = getPRef.current()
      if (Math.abs(p - lastP) < 1e-5) return
      lastP = p
      const cam = camAt(p, dz)
      map.jumpTo({ center: cam.center, zoom: cam.zoom })
      const v = viewAt(p)
      const k = viewKey(v)
      if (k !== keyRef.current) {
        keyRef.current = k
        setView(v)
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [map, dz])

  const { ch, lp } = view
  const at = (c: number, l = 0) => ch > c || (ch === c && lp >= l)
  const ranked = d.ranking.ranked
  const failOrder = d.ranking.filtered.map((f) => f.hospital.id)
  const failAt = [0.2, 0.45, 0.7]

  const hospitalState = (id: string): { state: HospitalMarkState; label: string | null } => {
    const fi = failOrder.indexOf(id)
    if (fi >= 0 && at(2, failAt[fi] ?? 0.8)) return { state: 'filtered', label: ch <= 3 ? d.ranking.filtered[fi].reasons[0] : null }
    const r = ranked.find((x) => x.hospital.id === id)!
    if (at(4, 0.45) && id === d.winner.hospital.id) return { state: 'chosen', label: at(7) ? 'Arrived' : at(4, 0.85) ? 'Bed held for 15:00' : 'Best match' }
    if (ch === 3 && r) {
      const txt = `Updated ${r.ageMin} min ago`
      return { state: r.confidence === 'stale' ? 'stale' : 'ranked', label: txt }
    }
    return { state: 'ranked', label: null }
  }

  const typed = 'Head injury, unconscious, GCS 9'
  const typedN = ch === 1 ? Math.round(clamp01(lp * 1.7) * typed.length) : ch > 1 ? typed.length : 0
  const sig = signalStatesAt(view.drive > 0 ? view.prog : -1e6, d.route.signals.map((s) => s.at))
  const v0 = d.pl.length / d.winner.eta.corridorS
  const holdOf = (i: number) => Math.min(SIM.holdCapS, Math.max(0, (SIM.greenAtM - (d.route.signals[i].at - view.prog)) / v0))
  const top3 = ranked.slice(0, 3)
  const stale = d.stale
  const arrived = view.drive >= 1
  const frozen = ch === 7 && arrived

  const right = compact ? 'relative w-full' : 'absolute right-6 top-[120px] w-[340px]'
  const cursorT = ch === 4 ? clamp01((lp - 0.4) / 0.35) : ch > 4 ? 1 : 0

  return (
    <div className={`relative h-full w-full ${compact ? 'flex flex-col' : ''}`}>
      <div className={compact ? `relative ${still ? 'h-[52%]' : 'h-[46%]'} shrink-0 border-b border-line` : 'absolute inset-0'}>
        <BaseMap center={[73.85, 18.53]} zoom={11.2 + dz} interactive={false} onReady={onReady} label={`Story map, chapter ${ch + 1}: ${CH[ch].id}`}>
          {at(0, 0.3) && <CrashPin lngLat={d.kase.location} />}
          {at(2) &&
            d.hospitals.map((h) => {
              const s = hospitalState(h.id)
              return <HospitalMarker key={h.id} lngLat={[h.lng, h.lat]} name={h.name} state={s.state} label={compact && s.state !== 'filtered' && s.state !== 'chosen' ? null : s.label} />
            })}
          {at(5) && (
            <RouteRunner
              id={still ? `story-still-${ch}` : 'story'}
              route={d.route}
              routeKey="story"
              progress={() => viewAt(getPRef.current()).prog}
              drawIn={() => clamp01((getPRef.current() - 5 / N) / (0.25 / N))}
              lights={() => viewAt(getPRef.current()).drive < 1}
            />
          )}
          {at(5, 0.2) &&
            d.route.signals.map((s, i) => (
              <SignalMarker key={s.id} lngLat={s.loc} heading={s.heading} name={s.name} state={sig[i]} timer={!compact && sig[i] === 'GREEN_FOR_AMBULANCE' ? `HOLD ${Math.round(holdOf(i))}s / CAP ${SIM.holdCapS}s` : null} />
            ))}
        </BaseMap>
      </div>

      {!compact && (
        <div className="pointer-events-none absolute left-6 top-[84px] z-10 flex items-center gap-2">
          <SectionLabel n="02" className="bg-paper/90 px-1.5 py-0.5 text-ink">
            How it works
          </SectionLabel>
          <SampleData className="bg-paper/90" />
        </div>
      )}
      <div className={`${compact ? 'absolute right-2 top-2' : 'absolute right-6 top-[80px]'} z-10 border border-line bg-paper/95 px-3 py-1.5`}>
        <GoldenClock remainingS={view.golden} frozen={frozen} compact={compact} />
      </div>

      <div className={`${right} z-10 ${compact ? 'min-h-0 flex-1 overflow-hidden px-3 py-3' : ''}`}>
        <div className="relative">
          {/* TRIAGE */}
          <Card show={ch === 1} className={`${compact ? 'absolute inset-x-0 top-0' : 'absolute inset-x-0 top-0'} p-4`}>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">Paramedic, ALS-03</span>
              <Chip tone="red">{ch === 1 && lp < 0.9 ? 'Listening' : 'Done'}</Chip>
            </div>
            <svg viewBox="0 0 300 30" className="my-3 h-6 w-full" aria-hidden="true">
              <path
                d={Array.from({ length: 60 }, (_, i) => `${i ? 'L' : 'M'}${i * 5} ${15 + Math.sin(i * 0.9 + lp * 20) * (ch === 1 && lp < 0.9 ? 4 + (i % 5) * 2 : 0.5)}`).join('')}
                fill="none"
                stroke="#0B6B3A"
                strokeWidth="1.5"
              />
            </svg>
            <p className="min-h-[24px] border-l-2 border-route pl-2 text-[15px] italic">&ldquo;{typed.slice(0, typedN)}<span className="blink">|</span>&rdquo;</p>
            <dl className="mt-3 grid grid-cols-3 gap-px border border-line bg-line font-mono text-[11px] uppercase">
              {[
                ['Injury', at(1, 0.45) ? 'Head' : ''],
                ['Conscious', at(1, 0.55) ? 'No' : ''],
                ['GCS', at(1, 0.65) ? '9' : ''],
              ].map(([k, v]) => (
                <div key={k} className="bg-white p-2">
                  <dt className="text-[9px] text-ink-2">{k}</dt>
                  <dd className="h-4 font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {INJURY_RULES.head_injury.requires.map((r, i) => (
                <span key={r.label} className={`transition-opacity duration-300 ${at(1, 0.72 + i * 0.06) ? 'opacity-100' : 'opacity-0'}`}>
                  <Chip tone="ink">{r.label}</Chip>
                </span>
              ))}
            </div>
          </Card>

          {/* TRUST and MATCH */}
          <Card show={ch === 3 || ch === 4} className="absolute inset-x-0 top-0 p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">{ch === 3 ? 'Data confidence' : 'Top 3, score breakdown'}</span>
              <SampleData />
            </div>
            <ul className="mt-3 space-y-3">
              {(ch === 3 ? ranked.slice(0, compact ? 2 : 4) : top3).map((r) => {
                const isStale = stale && r.hospital.id === stale.hospital.id
                const shrink = ch === 3 && isStale ? 1 - clamp01((lp - 0.3) / 0.4) * (1 - r.confidenceFactor) : 1
                const shown = ch === 3 ? { ...r, total: (isStale ? r.raw * shrink : r.total) } : r
                const winner = ch === 4 && r.hospital.id === d.winner.hospital.id && lp >= 0.45
                return (
                  <li key={r.hospital.id} className={`border p-2 transition-colors duration-300 ${winner ? 'border-route outline outline-1 outline-route' : 'border-transparent'}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[14px] font-medium">{r.hospital.name}</span>
                      <span className="font-mono text-[13px] tnum">{shown.total.toFixed(2)}</span>
                    </div>
                    <div className="mt-1.5">
                      <Bars r={shown} grow={ch === 4 ? clamp01(lp / 0.4) : 1} />
                    </div>
                    {ch === 3 && (
                      <div className="mt-1.5">
                        <ConfidenceChip level={r.confidence} text={`Updated ${r.ageMin} min ago`} />
                      </div>
                    )}
                    {winner && lp >= 0.85 && (
                      <div className="mt-1.5">
                        <Chip tone="green">Bed held for 15:00</Chip>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            {ch === 4 && (
              <div className="relative mt-3">
                <div className={`flex h-10 items-center justify-center rounded-[2px] text-[15px] font-medium text-white transition-colors duration-200 ${lp >= 0.78 ? 'bg-ink' : 'bg-route'}`}>
                  {lp >= 0.78 ? 'Confirmed' : 'Confirm'}
                </div>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  className="absolute"
                  style={{ left: `${70 - cursorT * 22}%`, top: `${-90 + cursorT * 105}px`, opacity: cursorT > 0 ? 1 : 0, transform: lp >= 0.78 && lp < 0.84 ? 'scale(0.85)' : 'none' }}
                  aria-hidden="true"
                >
                  <path d="M2 2l6 16 2.5-6.5L17 9z" fill="#FFFFFF" stroke="#171717" strokeWidth="1.3" strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </Card>

          {/* CLEAR ROAD */}
          <Card show={ch === 5} className="absolute inset-x-0 top-0 p-4">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">To {d.winner.hospital.name}</span>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase text-ink-2">Normal</p>
                <p className="font-mono text-[24px] font-medium text-ink-2 line-through decoration-1 tnum">{mins(d.winner.eta.normalS)}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase text-ink-2">Corridor</p>
                <p className="font-mono text-[24px] font-medium text-route tnum">{mins(d.winner.eta.corridorS)}</p>
              </div>
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-2">Simulated. {d.route.signals.length} junctions on real roads.</p>
          </Card>

          {/* HAND OVER */}
          <Card show={ch === 6} className="absolute inset-x-0 top-0 p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">{d.winner.hospital.name}, ER</span>
              <Chip tone="green">Incoming</Chip>
            </div>
            <p className="mt-2 font-mono text-[28px] font-medium tnum">{mmss(d.winner.eta.corridorS * (1 - view.drive))}</p>
            <p className="font-mono text-[10px] uppercase text-ink-2">ETA, corridor (simulated)</p>
            <pre className="mt-3 whitespace-pre-wrap border-t border-line pt-3 font-mono text-[11px] leading-[1.6] text-ink">
              {`HEAD INJURY, GCS 9, UNCONSCIOUS\nPULSE ${d.kase.vitals.pulse}  BP ${d.kase.vitals.systolic}/${d.kase.vitals.diastolic}  SPO2 ${d.kase.vitals.spo2}%\nCRASH ${DEMO_CALL_CLOCK}, UNIVERSITY CHOWK\nGIVEN: ${d.kase.treatment.join(', ').toUpperCase()}`}
            </pre>
          </Card>

          {/* ARRIVE */}
          <Card show={ch === 7} className="absolute inset-x-0 top-0 p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">Replay summary</span>
              <Chip tone="muted">Simulated</Chip>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-px border border-line bg-line text-center">
              {[
                ['Signals cleared', String(d.route.signals.length)],
                ['Min saved', String(d.savedMin)],
                ['Golden hr left', mmss(d.goldenAtArrivalS)],
              ].map(([k, v]) => (
                <div key={k} className="bg-white p-2">
                  <dd className="font-mono text-[18px] font-medium text-route tnum">{v}</dd>
                  <dt className="font-mono text-[9px] uppercase text-ink-2">{k}</dt>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>

      <div className={compact ? 'shrink-0 px-3 pb-3' : 'absolute bottom-[64px] left-6 z-10 w-[400px]'}>
        <div className="bg-ink p-4 text-white">
          <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-white/70">
            [0{ch + 1}] {CH[ch].id}
            {ch === 0 ? ` ${DEMO_CALL_CLOCK}` : ''}
          </p>
          <p className={`mt-2 leading-snug ${compact ? 'min-h-[40px] text-[15px]' : 'min-h-[48px] text-[17px]'}`}>{CH[ch].caption}</p>
          {!still && <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.06em] text-white/60">[Scroll to continue]</p>}
        </div>
      </div>
    </div>
  )
}

/** Hairline with the moving black step bar and a square progress dot. */
function StepBar({ getP }: { getP: () => number }) {
  const dot = useRef<HTMLSpanElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    let lastCh = -1
    const f = () => {
      raf = requestAnimationFrame(f)
      const p = getP()
      if (dot.current) dot.current.style.transform = `translateX(${p * 100}cqw)`
      const ch = Math.min(N - 1, Math.floor(p * N))
      if (ch !== lastCh && bar.current && label.current) {
        lastCh = ch
        bar.current.style.transform = `translateX(min(${(ch / N) * 100}cqw, calc(100cqw - 100%)))`
        label.current.textContent = `${String(ch + 1).padStart(2, '0')} ${CH[ch].id}`
      }
    }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [getP])
  return (
    <div className="absolute inset-x-4 bottom-5 z-10 md:inset-x-6" style={{ containerType: 'inline-size' }} aria-hidden="true">
      <div className="relative h-px w-full bg-ink">
        <div ref={bar} className="absolute bottom-0 left-0 transition-transform duration-500 ease-out" style={{ minWidth: `${100 / N}cqw` }}>
          <span ref={label} className="block whitespace-nowrap bg-ink px-2 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-white">
            01 CALL
          </span>
        </div>
        <span ref={dot} className="absolute -top-[3px] left-0 h-[7px] w-[7px] -translate-x-1/2 bg-route" />
      </div>
    </div>
  )
}

export function Story({ reduced, compact }: { reduced: boolean; compact: boolean }) {
  const section = useRef<HTMLElement>(null)
  const pin = useRef<HTMLDivElement>(null)
  const proxy = useRef({ p: 0 })
  const getP = useCallback(() => proxy.current.p, [])

  useEffect(() => {
    if (reduced) return
    const ctx = gsap.context(() => {
      gsap.to(proxy.current, {
        p: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: section.current,
          start: 'top top',
          end: () => `+=${window.innerHeight * (compact ? 6 : 8)}`,
          pin: pin.current,
          scrub: 0.6,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      })
    }, section)
    return () => ctx.revert()
  }, [reduced, compact])

  if (reduced) return <StaticStory />

  return (
    <section ref={section} id="how" className="relative" aria-label="How it works, in eight chapters">
      <div ref={pin} className="relative h-[100dvh] w-full overflow-hidden bg-paper">
        {compact && (
          <div className="flex h-[56px] items-end px-3 pb-2">
            <SectionLabel n="02">How it works</SectionLabel>
          </div>
        )}
        <div className={compact ? 'h-[calc(100%-56px-40px)]' : 'h-full'}>
          <Scene getP={getP} compact={compact} />
        </div>
        <StepBar getP={getP} />
      </div>
    </section>
  )
}

/** Reduced motion: eight still chapters, each a real map at a fixed state, mounted when near the viewport. */
function StaticStory() {
  return (
    <section id="how" className="px-4 py-[72px] md:px-6 md:py-[120px]" aria-label="How it works">
      <SectionLabel n="02">How it works</SectionLabel>
      <h2 className="headline mt-5 text-[40px] md:text-[64px]">One case, eight steps</h2>
      <ol className="mt-10 space-y-10">
        {CH.map((c, i) => (
          <StillChapter key={c.id} i={i} />
        ))}
      </ol>
    </section>
  )
}

function StillChapter({ i }: { i: number }) {
  const [ref, seen] = useInView<HTMLLIElement>('200px 0px')
  const p = Math.min(0.999, (i + (i === 7 ? 0.99 : 0.9)) / N)
  const getP = useCallback(() => p, [p])
  return (
    <li ref={ref} className="border border-line">
      <div className="h-[640px] md:h-[700px]">{seen ? <Scene getP={getP} compact still /> : null}</div>
    </li>
  )
}
