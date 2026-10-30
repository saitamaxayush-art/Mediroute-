import { useEffect, useMemo, useRef } from 'react'
import { Layer, Source, useMap } from 'react-map-gl/maplibre'
import maplibregl, { type GeoJSONSource } from 'maplibre-gl'
import { circle } from '@turf/turf'
import { along } from '../engine/geo'
import { polylineOf } from '../sim/step'
import { SIM } from '../config/simulation'
import type { RouteData } from '../types'
import { makeAmbulanceEl, setAmbulanceScale, setLights } from './ambulance'

export const GREEN = '#0B6B3A'
const CLEAR = 'rgba(11,107,58,0)'

const gradient = (f: number) => ['step', ['line-progress'], GREEN, Math.min(0.99999, Math.max(0.00001, f)), CLEAR]

interface Props {
  id: string
  route: RouteData
  routeKey: string
  /** Target distance along the route in metres, read every frame. */
  progress: () => number
  /** True when progress is exact and needs no smoothing. */
  exact?: () => boolean
  lights?: () => boolean
  follow?: boolean
  alert?: boolean
  showAmbulance?: boolean
  /** Hide the dashed "remaining" line, for story views that draw the route in. */
  drawIn?: () => number
}

/**
 * Draws a route with travelled (solid green) and remaining (dashed ink) parts and drives
 * the ambulance marker along it on requestAnimationFrame. Nothing here re-renders React per frame.
 */
export function RouteRunner({ id, route, routeKey, progress, exact, lights, follow, alert, showAmbulance = true, drawIn }: Props) {
  const { current: mapRef } = useMap()
  const data = useMemo(
    () => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: route.geometry } }),
    [route],
  )
  const followRef = useRef(follow)
  followRef.current = follow
  const fns = useRef({ progress, exact, lights, drawIn })
  fns.current = { progress, exact, lights, drawIn }

  const donePaint = useMemo(() => ({ 'line-width': 5, 'line-gradient': gradient(0) as never }), [])
  const hasDraw = !!drawIn
  const restPaint = useMemo(
    () => ({ 'line-color': '#171717', 'line-width': 2.5, 'line-dasharray': [1.6, 1.4], 'line-opacity': hasDraw ? 0 : 1 }),
    [hasDraw],
  )

  useEffect(() => {
    const map = mapRef?.getMap()
    if (!map) return
    const pl = polylineOf(route)
    const el = makeAmbulanceEl()
    const marker = new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' })
    if (showAmbulance) marker.setLngLat(pl.coords[0]).addTo(map)
    let display = Math.min(fns.current.progress(), pl.length)
    let heading = along(pl, display).heading
    let lastFrac = -1
    let lastDraw = -1
    let lastFollow = 0
    let lastAlert = 0
    let lastLights: boolean | null = null
    let raf = 0
    let prev = performance.now()
    const onZoom = () => setAmbulanceScale(el, map.getZoom())
    onZoom()
    map.on('zoom', onZoom)

    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.1, (ts - prev) / 1000)
      prev = ts
      const target = Math.min(Math.max(0, fns.current.progress()), pl.length)
      if (fns.current.exact?.() ?? true) display = target
      else display += (target - display) * Math.min(1, dt * 6)
      const { p, heading: h } = along(pl, display)
      let diff = ((h - heading + 540) % 360) - 180
      if (Math.abs(diff) > 120 && Math.abs(target - display) < 1) diff = 0
      heading = (heading + diff * 0.15 + 360) % 360
      if (showAmbulance) {
        marker.setLngLat(p)
        marker.setRotation(heading)
      }
      const on = fns.current.lights?.() ?? true
      if (on !== lastLights) {
        setLights(el, on)
        lastLights = on
      }
      const frac = display / (pl.length || 1)
      if (Math.abs(frac - lastFrac) > 0.0004 && map.getLayer(`${id}-done`)) {
        map.setPaintProperty(`${id}-done`, 'line-gradient', gradient(frac))
        lastFrac = frac
      }
      const draw = fns.current.drawIn?.()
      if (draw !== undefined && Math.abs(draw - lastDraw) > 0.001 && map.getLayer(`${id}-rest`)) {
        map.setPaintProperty(`${id}-rest`, 'line-opacity', draw >= 0.999 ? 1 : 0)
        map.setPaintProperty(`${id}-draw`, 'line-gradient', ['step', ['line-progress'], 'rgba(23,23,23,0.9)', Math.min(0.99999, Math.max(0.00001, draw)), 'rgba(0,0,0,0)'])
        lastDraw = draw
      }
      if (followRef.current && ts - lastFollow > 500) {
        lastFollow = ts
        map.easeTo({ center: p, duration: 500, easing: (t) => t })
      }
      if (alert && ts - lastAlert > 200) {
        lastAlert = ts
        const src = map.getSource(`${id}-alert`) as GeoJSONSource | undefined
        const ahead = along(pl, Math.min(pl.length, display + SIM.alertRadiusM * 0.6)).p
        if (src) src.setData(display < pl.length - 5 ? circle(ahead, SIM.alertRadiusM / 1000, { steps: 40 }) : { type: 'FeatureCollection', features: [] })
      }
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      map.off('zoom', onZoom)
      marker.remove()
    }
  }, [mapRef, route, routeKey, id, alert, showAmbulance])

  return (
    <>
      <Source id={`${id}-route`} type="geojson" data={data} lineMetrics>
        <Layer id={`${id}-casing`} type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': '#F5F1EA', 'line-width': 8 }} />
        <Layer id={`${id}-rest`} type="line" layout={{ 'line-join': 'round' }} paint={restPaint as never} />
        {drawIn && (
          <Layer id={`${id}-draw`} type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-width': 2.5, 'line-gradient': gradient(0) as never }} />
        )}
        <Layer id={`${id}-done`} type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={donePaint} />
      </Source>
      {alert && (
        <Source id={`${id}-alert`} type="geojson" data={{ type: 'FeatureCollection', features: [] }}>
          <Layer id={`${id}-alert-fill`} type="fill" paint={{ 'fill-color': GREEN, 'fill-opacity': 0.08 }} />
          <Layer id={`${id}-alert-line`} type="line" paint={{ 'line-color': GREEN, 'line-width': 1, 'line-dasharray': [2, 2], 'line-opacity': 0.6 }} />
        </Source>
      )}
    </>
  )
}
