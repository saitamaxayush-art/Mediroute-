import { Layers, Navigation } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Marker, NavigationControl, Popup, type MapRef } from 'react-map-gl/maplibre'
import { BaseMap } from '../../map/BaseMap'
import { CrashPin, HospitalMarker, SignalIcon, StaticLine, type HospitalMarkState } from '../../map/markers'
import { TripLayers } from '../../map/TripLayers'
import { useShallow } from 'zustand/react/shallow'
import { AMBULANCE_SVG } from '../../map/ambulance'
import { useNow } from '../../hooks/hooks'
import { caseRoutes, computeRanking } from '../../services/api'
import { nearestPreset, presetRoutes } from '../../services/routing'
import { get, selCase, selTrip, setLocal, useAppStore } from '../../store/appStore'
import { SignalPanel, useSelectedSignal } from './ConsoleParts'
import { ago } from '../../engine/text'
import type { LngLat } from '../../types'

const START: LngLat = [73.845, 18.53]
const SEV_COLOR = { critical: '#C8261D', serious: '#B7790C', stable: '#171717' }

export function ConsoleMap() {
  const mapRef = useRef<MapRef>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const inputs = useAppStore(useShallow((s) => ({ cases: s.cases, activeCaseId: s.activeCaseId, hospitals: s.hospitals, weights: s.weights, liveRoutes: s.liveRoutes, excluded: s.excluded })))
  // Re-render every 30 s so data ages tick over; computeRanking memoises by input and minute.
  useNow(30_000)
  const ranking = computeRanking(inputs)
  const [hover, setHover] = useState<string | null>(null)
  const [legend, setLegend] = useState(false)
  const kaseId = inputs.activeCaseId
  const trip = useAppStore(useShallow((s) => {
    const t = selTrip(s)
    return t ? { hospitalId: t.hospitalId, routeKey: t.routeKey, status: t.status, altRoute: t.altRoute, ambulanceId: t.ambulanceId } : null
  }))
  const ambulances = useAppStore((s) => s.ambulances)
  const follow = useAppStore((s) => s.follow)
  const mci = useAppStore((s) => s.mci)
  const draft = useAppStore((s) => s.draft)
  const selectedHospitalId = useAppStore((s) => s.selectedHospitalId)
  const selectedSignal = useSelectedSignal()

  // Keep the map sized to its box when side panels open or close.
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => mapRef.current?.getMap().resize())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Frame the case when it changes.
  useEffect(() => {
    const map = mapRef.current
    const k = selCase(get())
    if (!map || !k) return
    const pts: LngLat[] = [k.location, ...get().hospitals.map((h) => [h.lng, h.lat] as LngLat)]
    const lngs = pts.map((p) => p[0])
    const lats = pts.map((p) => p[1])
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 60, duration: 900 },
    )
  }, [kaseId])

  // Frame the route when a trip starts or is re-routed.
  const routeKey = trip?.routeKey
  useEffect(() => {
    const map = mapRef.current
    const g = selTrip(get())?.route.geometry
    if (!map || !g || get().follow) return
    const lngs = g.map((p) => p[0])
    const lats = g.map((p) => p[1])
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: map.getContainer().clientWidth < 700 ? 40 : { top: 80, bottom: 60, left: 120, right: 120 }, duration: 900, maxZoom: 15 },
    )
  }, [routeKey])

  const markState = (id: string): { state: HospitalMarkState; label: string | null; rank?: number; pos?: 'right' | 'above' | 'below' } => {
    // Names show only for the destination or the top 3; everything else is on hover.
    if (!ranking) return { state: 'idle', label: null }
    const name = inputs.hospitals.find((h) => h.id === id)?.name ?? null
    if (trip) return trip.hospitalId === id ? { state: 'chosen', label: name } : { state: ranking.filtered.some((x) => x.hospital.id === id) ? 'filtered' : 'idle', label: null }
    if (ranking.filtered.some((x) => x.hospital.id === id)) return { state: 'filtered', label: null }
    const i = ranking.ranked.findIndex((x) => x.hospital.id === id)
    // Top results can sit close together; stack the first two labels above and below.
    if (i === 0) return { state: 'chosen', label: name, rank: 1, pos: 'above' }
    return { state: ranking.ranked[i]?.confidence === 'stale' ? 'stale' : 'ranked', label: i < 3 ? name : null, rank: i + 1, pos: i === 1 ? 'below' : 'right' }
  }

  const preview = !trip && kaseId && ranking?.ranked[0] ? caseRoutes(inputs, selectedHospitalId && ranking.ranked.some((r) => r.hospital.id === selectedHospitalId) ? selectedHospitalId : ranking.ranked[0].hospital.id) : []
  const hovered = hover ? inputs.hospitals.find((h) => h.id === hover) : null
  const hoveredR = hover ? ranking?.ranked.find((r) => r.hospital.id === hover) : null
  const hoveredF = hover ? ranking?.filtered.find((r) => r.hospital.id === hover) : null
  const idle = !kaseId

  const ctrlBtn = 'grid h-10 w-10 place-items-center rounded-[4px] border border-line bg-white hover:border-route hover:text-route'
  return (
    <div ref={wrap} className="relative h-full w-full">
      <BaseMap
        mapRef={mapRef}
        center={START}
        zoom={12.2}
        label="Operator map of Pune"
        cursor={idle ? 'crosshair' : undefined}
        onClick={(p) => {
          if (idle) setLocal((st) => ({ draft: { ...st.draft, loc: p, label: null, presetId: null } }))
          else setLocal({ selectedSignalId: null })
        }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {preview[1] && <StaticLine id="alt-preview" coords={preview[1].geometry} />}
        {preview[0] && <StaticLine id="main-preview" coords={preview[0].geometry} color="#0B6B3A" width={3} opacity={0.75} />}
        {trip?.altRoute && trip.status === 'enroute' && <StaticLine id="alt" coords={trip.altRoute.geometry} />}
        {mci?.rows.map(
          (r, i) =>
            r.hospital && <StaticLine key={r.patient.id} id={`mci-${i}`} coords={caseRoutesForMci(r.hospital.id, mci.at)} color={SEV_COLOR[r.patient.severity]} dashed={false} width={2} opacity={0.7} />,
        )}
        <TripLayers id="trip" follow={follow} alert onSignal={(sid) => setLocal({ selectedSignalId: sid })} />
        {ambulances
          .filter((a) => a.id !== trip?.ambulanceId)
          .map((a) => (
            <Marker key={a.id} longitude={a.lng} latitude={a.lat} anchor="center">
              <span className="block scale-[0.7] opacity-90" role="img" aria-label={`${a.id}, ${a.type}, ${a.status}`} title={`${a.id}, ${a.type}`} dangerouslySetInnerHTML={{ __html: AMBULANCE_SVG }} />
            </Marker>
          ))}
        {idle && draft.loc && <CrashPin lngLat={draft.loc} />}
        {inputs.hospitals.map((h) => {
          const m = markState(h.id)
          return (
            <HospitalMarker
              key={h.id}
              lngLat={[h.lng, h.lat]}
              name={h.name}
              state={m.state}
              label={m.label}
              rank={m.rank}
              labelPos={m.pos}
              onHover={(on) => setHover(on ? h.id : null)}
              onClick={() => !trip && setLocal({ selectedHospitalId: h.id })}
            />
          )
        })}
        {hovered && (
          <Popup longitude={hovered.lng} latitude={hovered.lat} anchor="bottom" offset={14} closeButton={false} closeOnClick={false} className="mr-popup">
            <div className="min-w-[200px] font-sans">
              <p className="text-[14px] font-medium leading-tight">{hovered.name}</p>
              <p className="text-[12px] text-ink-2">{hovered.area}</p>
              <p className="mt-1 font-mono text-[11px] uppercase tnum">
                ICU {hovered.beds.icu} / GEN {hovered.beds.general}
                {hoveredR ? ` / SCORE ${hoveredR.total.toFixed(2)}` : ''}
              </p>
              <p className="font-mono text-[10px] uppercase text-ink-2">{ago(hovered.lastUpdated, Date.now())}</p>
              {hoveredF && <p className="mt-1 text-[12px] text-signal">{hoveredF.reasons.join(', ')}</p>}
            </div>
          </Popup>
        )}
        {selectedSignal && trip?.status === 'enroute' && (
          <Popup longitude={selectedSignal.lng} latitude={selectedSignal.lat} anchor="bottom" offset={18} closeButton={false} closeOnClick={false} maxWidth="320px" className="mr-popup">
            <SignalPanel g={selectedSignal} onClose={() => setLocal({ selectedSignalId: null })} />
          </Popup>
        )}
      </BaseMap>

      <div className="absolute right-[10px] top-[86px] flex flex-col gap-2">
        <button type="button" className={`${ctrlBtn} ${follow ? '!border-route !bg-route-soft text-route' : ''}`} aria-pressed={follow} onClick={() => setLocal({ follow: !follow })} title="Follow ambulance" aria-label="Follow ambulance">
          <Navigation size={16} aria-hidden />
        </button>
        <button type="button" className={ctrlBtn} onClick={() => setLegend((x) => !x)} aria-expanded={legend} title="Legend" aria-label="Legend">
          <Layers size={16} aria-hidden />
        </button>
      </div>
      {legend && <Legend />}
    </div>
  )
}

function caseRoutesForMci(hospitalId: string, at: LngLat) {
  return presetRoutes(nearestPreset(at).id, hospitalId)[0]?.geometry ?? []
}

function Legend() {
  const row = 'flex items-center gap-2.5 text-[12px]'
  return (
    <div className="float absolute right-[60px] top-[86px] w-[240px] rounded-[4px] border border-line bg-white p-4" role="dialog" aria-label="Map legend">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.06em]">Legend</p>
      <div className="space-y-2">
        <div className={row}><span className="h-3.5 w-3.5 border-[1.5px] border-route bg-route" /> Best match or destination</div>
        <div className={row}><span className="h-3.5 w-3.5 border-[1.5px] border-ink bg-white" /> Ranked hospital</div>
        <div className={row}><span className="h-3.5 w-3.5 border-[1.5px] border-signal bg-white" /> Stale data</div>
        <div className={row}><span className="h-3.5 w-3.5 border-[1.5px] border-line bg-paper-2" /> Filtered out</div>
        <div className={row}><span className="h-1 w-6 bg-route" /> Travelled, corridor route</div>
        <div className={row}><span className="h-0 w-6 border-t-2 border-dashed border-ink" /> Remaining route</div>
        <div className={row}><span className="h-0 w-6 border-t-2 border-dashed border-ink-2" /> Alternative route</div>
        <div className={row}><SignalIcon state="GREEN_FOR_AMBULANCE" heading={0} size={18} /> Approach green, cross traffic red</div>
        <div className={row}><SignalIcon state="ARMED" heading={0} size={18} /> Armed, corridor coming</div>
        <div className={row}><SignalIcon state="RED_HOLD" heading={0} size={18} /> Ambulance held red</div>
        <div className={row}><SignalIcon state="NORMAL" heading={0} size={18} /> Normal signal cycle</div>
        <div className={row}><SignalIcon state="ADVISED" heading={0} size={18} /> Advised to traffic police</div>
        <div className={row}><span className="h-1.5 w-6 bg-signal" /> Blocked road</div>
      </div>
    </div>
  )
}
