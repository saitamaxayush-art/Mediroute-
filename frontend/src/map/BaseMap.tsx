import { useEffect, useState, type ReactNode } from 'react'
import Map, { AttributionControl, type MapRef } from 'react-map-gl/maplibre'
import type { Map as MLMap, StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { INDIA_BOUNDS } from '../data/places'
import type { LngLat } from '../types'

const VECTOR_STYLE = 'https://tiles.openfreemap.org/styles/positron'

const RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png`),
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#F5F1EA' } },
    { id: 'carto', type: 'raster', source: 'carto', paint: { 'raster-saturation': -0.6, 'raster-opacity': 0.9 } },
  ],
}

let stylePromise: Promise<StyleSpecification> | null = null
/** Loads the OpenFreeMap style once per session; falls back to CARTO raster tiles. */
function loadStyle(): Promise<StyleSpecification> {
  if (!stylePromise) {
    stylePromise = (async () => {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 6000)
      try {
        const res = await fetch(VECTOR_STYLE, { signal: ctrl.signal })
        if (!res.ok) throw new Error('style')
        const style = (await res.json()) as StyleSpecification
        // Road shields compare a null ref_length with a number on most Pune roads and log warnings. They are clutter here anyway.
        style.layers = style.layers.filter((l) => !l.id.includes('shield'))
        return style
      } catch {
        return RASTER_STYLE
      } finally {
        clearTimeout(t)
      }
    })()
  }
  return stylePromise
}

export function useMapStyle() {
  const [style, setStyle] = useState<StyleSpecification | null>(null)
  useEffect(() => {
    let on = true
    loadStyle().then((s) => on && setStyle(s))
    return () => {
      on = false
    }
  }, [])
  return style
}

const P = {
  paper: '#F5F1EA',
  water: '#DFD9CC',
  park: '#E8E6D6',
  landuse: '#EFEAE0',
  building: '#E7E0D2',
  roadMajor: '#E2D3B6',
  roadMinor: '#ECE3D2',
  casing: '#D9D2C3',
  label: '#4A463E',
  boundary: '#BDB4A2',
}

/** Recolours the Positron style to the MediRoute palette so the map reads as part of the page. */
export function recolour(map: MLMap) {
  const layers = map.getStyle()?.layers ?? []
  const paint = (id: string, prop: string, v: unknown) => {
    try {
      map.setPaintProperty(id, prop, v)
    } catch {
      // Some layers lack the property. Skip them.
    }
  }
  for (const l of layers) {
    const id = l.id
    if (l.type === 'background') paint(id, 'background-color', P.paper)
    else if (l.type === 'fill') {
      if (/water/.test(id)) paint(id, 'fill-color', P.water)
      else if (/park|wood|grass|forest|landcover/.test(id)) paint(id, 'fill-color', P.park)
      else if (/building/.test(id)) {
        paint(id, 'fill-color', P.building)
        paint(id, 'fill-outline-color', P.casing)
      } else paint(id, 'fill-color', P.landuse)
    } else if (l.type === 'line') {
      if (/water|river|stream/.test(id)) paint(id, 'line-color', P.water)
      else if (/boundary|admin/.test(id)) paint(id, 'line-color', P.boundary)
      else if (/casing|outline/.test(id)) paint(id, 'line-color', P.casing)
      else if (/motorway|trunk|primary|major|highway/.test(id)) paint(id, 'line-color', P.roadMajor)
      else if (/road|street|minor|secondary|tertiary|service|path|bridge|tunnel/.test(id)) paint(id, 'line-color', P.roadMinor)
      else if (/rail/.test(id)) paint(id, 'line-color', P.casing)
    } else if (l.type === 'symbol') {
      paint(id, 'text-color', P.label)
      paint(id, 'text-halo-color', P.paper)
    }
  }
}

export interface BaseMapProps {
  center: LngLat
  zoom: number
  interactive?: boolean
  onReady?: (map: MLMap) => void
  onClick?: (lngLat: LngLat) => void
  children?: ReactNode
  className?: string
  mapRef?: React.Ref<MapRef>
  label?: string
  cursor?: string
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}
let webgl: boolean | null = null

export function BaseMap({ center, zoom, interactive = true, onReady, onClick, children, className, mapRef, label, cursor }: BaseMapProps) {
  const style = useMapStyle()
  if (webgl === null) webgl = hasWebGL()
  if (!webgl) {
    return (
      <div className={`relative grid h-full w-full place-items-center bg-paper-2 p-6 text-center ${className ?? ''}`} role="region" aria-label={label ?? 'Map of Pune'}>
        <p className="max-w-[320px] text-[14px] text-ink-2">This map needs WebGL, which is turned off in this browser. Turn on hardware acceleration to see the live map of Pune.</p>
      </div>
    )
  }
  return (
    <div className={`relative h-full w-full bg-paper-2 ${className ?? ''}`} role="region" aria-label={label ?? 'Map of Pune'}>
      {style ? (
        <Map
          ref={mapRef}
          mapStyle={style}
          initialViewState={{ longitude: center[0], latitude: center[1], zoom }}
          maxBounds={INDIA_BOUNDS}
          interactive={interactive}
          attributionControl={false}
          cursor={cursor}
          dragRotate={false}
          pitchWithRotate={false}
          touchPitch={false}
          onLoad={(e) => {
            recolour(e.target)
            onReady?.(e.target)
          }}
          onClick={onClick ? (e) => onClick([e.lngLat.lng, e.lngLat.lat]) : undefined}
          style={{ width: '100%', height: '100%' }}
        >
          <AttributionControl compact position="bottom-right" />
          {children}
        </Map>
      ) : (
        <div className="absolute inset-0 grid place-items-center font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">Loading map</div>
      )}
    </div>
  )
}
