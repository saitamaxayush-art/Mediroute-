import { MousePointer2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Map as MLMap } from 'maplibre-gl'
import { LinkButton, Button, SampleData } from '../../components/ui'
import { scrollToId } from '../../components/SiteNav'
import { INDIA_CENTER, fmtCoord } from '../../data/places'
import { mins } from '../../engine/text'
import { BaseMap } from '../../map/BaseMap'
import { CrashPin, HospitalMarker, SignalMarker } from '../../map/markers'
import { RouteRunner } from '../../map/RouteRunner'
import { SIM } from '../../config/simulation'
import type { SignalState } from '../../types'
import { RevealLines } from './bits'
import { demo } from './demo'

const CYCLE = 17000

/** Signal states from the ambulance position, the same rule the console uses. */
export function signalStatesAt(progress: number, at: number[]): SignalState[] {
  let armed = 0
  return at.map((a) => {
    if (a < progress - 1) return 'RELEASED'
    if (armed >= SIM.armAhead) return 'NORMAL'
    armed++
    return a - progress <= SIM.greenAtM ? 'GREEN_FOR_AMBULANCE' : 'ARMED'
  })
}

export function Hero({ reduced, ready }: { reduced: boolean; ready: boolean }) {
  const d = demo()
  const signalsAt = d.route.signals.map((s) => s.at)
  const loop = useRef({ draw: reduced ? 1 : 0, prog: reduced ? d.pl.length * 0.45 : 0, lights: true })
  const [phase, setPhase] = useState({ shown: reduced, tagged: reduced, matched: reduced })
  const [sig, setSig] = useState<SignalState[]>(() => signalStatesAt(loop.current.prog, signalsAt))
  const [explore, setExplore] = useState(false)
  const [map, setMap] = useState<MLMap | null>(null)
  const sigKey = useRef(sig.join())

  const onReady = useCallback(
    (m: MLMap) => {
      m.scrollZoom.disable()
      m.dragPan.disable()
      m.doubleClickZoom.disable()
      m.touchZoomRotate.disable()
      m.keyboard.disable()
      setMap(m)
    },
    [],
  )

  // Fly from India to Pune once the preloader is gone, then loop the demo case.
  useEffect(() => {
    if (!map || !ready) return
    const target = { center: [73.826, 18.543] as [number, number], zoom: 12.3 }
    if (reduced) {
      map.jumpTo(target)
      return
    }
    let raf = 0
    let start = 0
    let alive = true
    map.flyTo({ ...target, duration: 2500, essential: true, curve: 1.5 })
    const kick = setTimeout(() => {
      start = performance.now()
      raf = requestAnimationFrame(frame)
    }, 2500)
    const frame = (ts: number) => {
      if (!alive) return
      raf = requestAnimationFrame(frame)
      const t = (ts - start) % CYCLE
      const L = d.pl.length
      const draw = Math.min(1, Math.max(0, (t - 1500) / 1500))
      const drive = Math.min(1, Math.max(0, (t - 3000) / 11000))
      const eased = drive < 0.5 ? 2 * drive * drive : 1 - (-2 * drive + 2) ** 2 / 2
      loop.current.draw = draw
      loop.current.prog = eased * L
      loop.current.lights = drive < 1
      const next = { shown: t > 200, tagged: t > 900, matched: t > 2600 }
      setPhase((p) => (p.shown === next.shown && p.tagged === next.tagged && p.matched === next.matched ? p : next))
      const s = signalStatesAt(drive > 0 ? eased * L : -1e6, signalsAt)
      const k = s.join()
      if (k !== sigKey.current) {
        sigKey.current = k
        setSig(s)
      }
    }
    return () => {
      alive = false
      clearTimeout(kick)
      cancelAnimationFrame(raf)
    }
    // Demo data is fixed for the page lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ready, reduced])

  const enableExplore = () => {
    if (!map) return
    map.scrollZoom.enable()
    map.dragPan.enable()
    map.doubleClickZoom.enable()
    map.touchZoomRotate.enable()
    map.keyboard.enable()
    setExplore(true)
  }

  const strip = [
    ['Sample case', `Head injury, GCS ${d.kase.gcs}`],
    ['Matched', d.winner.hospital.name],
    ['ETA', `${mins(d.winner.eta.normalS)} normal, ${mins(d.winner.eta.corridorS)} with corridor (simulated)`],
    ['Location', `Pune, ${fmtCoord(d.kase.location).replace(',', '')}`],
  ]

  return (
    <section className="relative pt-16" aria-labelledby="hero-h">
      <div className="grid gap-6 px-4 pt-6 md:px-6 lg:min-h-[calc(100vh-64px-104px)] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
        <div className="relative flex flex-col justify-between py-4 lg:py-8">
          <p className="font-mono text-[12px] uppercase tracking-[0.06em] text-ink-2">[00] MediRoute, smart ambulance navigation</p>
          <div className="my-10 lg:my-0">
            <RevealLines as="h1" id="hero-h" lines={['The right', 'hospital.', 'A clear', 'road.']} className="headline text-[52px] sm:text-[72px] xl:text-[84px]" play={ready} />
            <p className="mt-6 max-w-[520px] text-[18px] leading-[1.55] text-ink-2">
              MediRoute helps 112 operators send every ambulance to the nearest hospital that can actually treat the patient, then turns the traffic signals green on the way there.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton to="/console" size="lg" arrow>
                Open the operator console
              </LinkButton>
              <Button size="lg" variant="secondary" onClick={() => scrollToId('how')}>
                Watch a case unfold
              </Button>
            </div>
          </div>
          <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">Mobility and Public Safety</p>
        </div>
        <div className="relative h-[62vh] min-h-[420px] overflow-hidden rounded-[4px] border border-line lg:h-auto">
          <BaseMap center={INDIA_CENTER} zoom={3.6} onReady={onReady} label="Map of Pune showing the demo case">
            {phase.shown && <CrashPin lngLat={d.kase.location} />}
            {phase.shown &&
              d.hospitals.map((h) => {
                const isNearest = h.id === d.nearest.hospital.id
                const isWinner = h.id === d.winner.hospital.id
                if (!isNearest && !isWinner) return <HospitalMarker key={h.id} lngLat={[h.lng, h.lat]} name={h.name} state="ranked" />
                if (isNearest) return <HospitalMarker key={h.id} lngLat={[h.lng, h.lat]} name={h.name} state={phase.tagged ? 'filtered' : 'ranked'} label={phase.tagged ? d.nearest.reasons[0] : null} />
                return <HospitalMarker key={h.id} lngLat={[h.lng, h.lat]} name={h.name} state={phase.matched ? 'chosen' : 'ranked'} label={phase.matched ? 'Matched' : null} />
              })}
            {phase.shown && (
              <RouteRunner
                id="hero"
                route={d.route}
                routeKey="hero"
                progress={() => loop.current.prog}
                drawIn={() => loop.current.draw}
                lights={() => loop.current.lights}
                showAmbulance
              />
            )}
            {phase.matched &&
              d.route.signals.map((s, i) => <SignalMarker key={s.id} lngLat={s.loc} heading={s.heading} name={s.name} state={sig[i]} />)}
          </BaseMap>
          <div className="pointer-events-none absolute left-3 top-3 flex gap-2">
            <SampleData className="bg-paper/90" />
          </div>
          {!explore && (
            <button type="button" onClick={enableExplore} className="absolute bottom-10 left-3 flex h-9 items-center gap-2 rounded-[2px] border border-ink bg-paper px-3 text-[14px] hover:bg-paper-2">
              <MousePointer2 size={14} aria-hidden /> Explore map
            </button>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 px-4 py-6 sm:grid-cols-2 md:px-6 xl:grid-cols-4">
        {strip.map(([k, v]) => (
          <div key={k}>
            <dt className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">{k}</dt>
            <dd className="mt-1 font-mono text-[13px] font-medium uppercase tracking-[0.04em]">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
