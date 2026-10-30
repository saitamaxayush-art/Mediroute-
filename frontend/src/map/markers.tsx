import { Layer, Marker, Source } from 'react-map-gl/maplibre'
import type { LngLat, SignalState } from '../types'

export type HospitalMarkState = 'chosen' | 'ranked' | 'filtered' | 'stale' | 'idle'

export function HospitalMarker({
  lngLat,
  name,
  state,
  label,
  onClick,
  onHover,
  rank,
  labelPos = 'right',
}: {
  lngLat: LngLat
  name: string
  state: HospitalMarkState
  label?: string | null
  onClick?: () => void
  onHover?: (on: boolean) => void
  rank?: number
  labelPos?: 'right' | 'above' | 'below'
}) {
  const cls = {
    chosen: 'bg-route border-route text-white',
    ranked: 'bg-white border-ink text-ink',
    stale: 'bg-white border-signal text-signal',
    filtered: 'bg-paper-2 border-line text-ink-2 opacity-70',
    idle: 'bg-white border-ink text-ink',
  }[state]
  return (
    <Marker longitude={lngLat[0]} latitude={lngLat[1]} anchor="center">
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => onHover?.(true)}
        onMouseLeave={() => onHover?.(false)}
        onFocus={() => onHover?.(true)}
        onBlur={() => onHover?.(false)}
        aria-label={`${name}${label ? `: ${label}` : ''}`}
        className="group relative block focus-visible:outline-none"
      >
        <span className={`grid h-[18px] w-[18px] place-items-center border-[1.5px] font-mono text-[10px] leading-none transition-colors duration-300 ${cls} group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-route`}>
          {rank ?? (
            <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
              <path d="M4 0.5v7M0.5 4h7" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          )}
        </span>
        {state === 'chosen' && <span className="pointer-events-none absolute -inset-[5px] border border-route" />}
        {label && (
          <span
            className={`pointer-events-none absolute whitespace-nowrap ${labelPos === 'right' ? 'left-[24px] top-1/2 -translate-y-1/2' : labelPos === 'above' ? 'bottom-[24px] left-1/2 -translate-x-1/2' : 'left-1/2 top-[24px] -translate-x-1/2'} px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] ${
              state === 'filtered' || state === 'stale' ? 'bg-signal text-white' : state === 'chosen' ? 'bg-route text-white' : 'bg-ink text-white'
            }`}
          >
            {label}
          </span>
        )}
      </button>
    </Marker>
  )
}

export function CrashPin({ lngLat, label = 'Crash location' }: { lngLat: LngLat; label?: string }) {
  return (
    <Marker longitude={lngLat[0]} latitude={lngLat[1]} anchor="center">
      <span className="crash-pin" role="img" aria-label={label}>
        <span className="crash-ring" />
        <span className="crash-ring crash-ring-2" />
        <span className="crash-dot" />
      </span>
    </Marker>
  )
}

export type SignalView = SignalState | 'ADVISED'

/**
 * Four-way junction, rotated so the ambulance approach is the bottom arm.
 * NORMAL grey ring, ARMED amber, GREEN_FOR_AMBULANCE green approach with an arrow and the other
 * three red, RED_HOLD red approach, RELEASED grey (with a green tick just after), ADVISED dashed grey.
 */
export function SignalIcon({ state, heading, size = 26, tick = false }: { state: SignalView; heading: number; size?: number; tick?: boolean }) {
  const grey = '#4A463E'
  const approach = state === 'GREEN_FOR_AMBULANCE' ? '#0B6B3A' : state === 'RED_HOLD' ? '#C8261D' : state === 'ARMED' ? '#B7790C' : grey
  const cross = state === 'GREEN_FOR_AMBULANCE' ? '#C8261D' : grey
  const ring = state === 'ARMED' ? '#B7790C' : state === 'GREEN_FOR_AMBULANCE' ? '#0B6B3A' : state === 'RED_HOLD' ? '#C8261D' : '#B9B09D'
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <g style={{ transform: `rotate(${heading}deg)`, transformOrigin: '13px 13px' }}>
        <rect x="11" y="1" width="4" height="7" fill={cross} opacity={state === 'NORMAL' || state === 'RELEASED' || state === 'ADVISED' ? 0.55 : 1} />
        <rect x="18" y="11" width="7" height="4" fill={cross} opacity={state === 'NORMAL' || state === 'RELEASED' || state === 'ADVISED' ? 0.55 : 1} />
        <rect x="1" y="11" width="7" height="4" fill={cross} opacity={state === 'NORMAL' || state === 'RELEASED' || state === 'ADVISED' ? 0.55 : 1} />
        <rect x="11" y="18" width="4" height="7" fill={approach} />
        {state === 'GREEN_FOR_AMBULANCE' && <path d="M13 17.2l-2.6 3.4h5.2z" fill="#FFFFFF" />}
      </g>
      <circle cx="13" cy="13" r="4.2" fill="#FFFFFF" stroke={ring} strokeWidth="1.6" strokeDasharray={state === 'ADVISED' ? '2 1.4' : undefined} />
      {tick && <path d="M10.6 13.2l1.7 1.7 3.2-3.4" fill="none" stroke="#0B6B3A" strokeWidth="1.6" />}
    </svg>
  )
}

export function SignalMarker({
  lngLat,
  state,
  heading,
  name,
  code,
  label,
  timer,
  tick = false,
  selected = false,
  onClick,
}: {
  lngLat: LngLat
  state: SignalView
  heading: number
  name: string
  code?: string
  label?: string | null
  timer?: string | null
  tick?: boolean
  selected?: boolean
  onClick?: () => void
}) {
  const body = (
    <>
      <span className={`block rounded-full bg-white/85 p-[1px] ${selected ? 'outline outline-2 outline-offset-1 outline-ink' : ''}`}>
        <SignalIcon state={state} heading={heading} tick={tick} />
      </span>
      {(label || timer) && (
        <span className="pointer-events-none absolute left-[32px] top-0 whitespace-nowrap rounded-[2px] bg-ink px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-white tnum">
          {[label, timer].filter(Boolean).join(' ')}
        </span>
      )}
    </>
  )
  const aria = `Signal ${code ?? ''} ${name}: ${state.replace(/_/g, ' ').toLowerCase()}`
  return (
    <Marker longitude={lngLat[0]} latitude={lngLat[1]} anchor="center">
      {onClick ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onClick()
          }}
          className="relative block rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-route"
          aria-label={aria}
        >
          {body}
        </button>
      ) : (
        <span className="relative block" role="img" aria-label={aria}>
          {body}
        </span>
      )}
    </Marker>
  )
}

export function BlockedRoad({ id, coords }: { id: string; coords: LngLat[] }) {
  const mid = coords[Math.floor(coords.length / 2)]
  return (
    <>
      <Source id={`${id}-blocked`} type="geojson" data={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }}>
        <Layer id={`${id}-blocked-base`} type="line" paint={{ 'line-color': '#C8261D', 'line-width': 9, 'line-opacity': 0.18 }} />
        <Layer id={`${id}-blocked-hatch`} type="line" paint={{ 'line-color': '#C8261D', 'line-width': 7, 'line-dasharray': [0.4, 0.6] }} />
      </Source>
      <Marker longitude={mid[0]} latitude={mid[1]} anchor="center">
        <span className="grid h-6 w-6 place-items-center border border-signal bg-white" role="img" aria-label="Blocked road">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="#C8261D" strokeWidth="2" />
          </svg>
        </span>
      </Marker>
    </>
  )
}

export function StaticLine({ id, coords, color = '#4A463E', dashed = true, width = 2.5, opacity = 0.8 }: { id: string; coords: LngLat[]; color?: string; dashed?: boolean; width?: number; opacity?: number }) {
  return (
    <Source id={id} type="geojson" data={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }}>
      <Layer
        id={`${id}-line`}
        type="line"
        layout={{ 'line-join': 'round', 'line-cap': dashed ? 'butt' : 'round' }}
        paint={{ 'line-color': color, 'line-width': width, 'line-opacity': opacity, ...(dashed ? { 'line-dasharray': [2, 2] } : {}) }}
      />
    </Source>
  )
}
