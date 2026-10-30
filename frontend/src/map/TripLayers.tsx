import { useShallow } from 'zustand/react/shallow'
import { STATE_LABEL, viewOf } from '../pages/console/ConsoleParts'
import { live } from '../sim/simulationService'
import { get, selCase, selTrip, useAppStore, useTripSignals } from '../store/appStore'
import { BlockedRoad, CrashPin, SignalMarker } from './markers'
import { RouteRunner } from './RouteRunner'
import { isAhead } from '../sim/step'

/**
 * The active trip as every map shows it: route, ambulance, blocked roads, signals and crash pin.
 * Selects only route-level fields, so 10 Hz position ticks do not re-render it; the ambulance
 * reads its position from `live` every animation frame.
 */
export function TripLayers({ id, follow = false, alert = false, onSignal, crash = true }: { id: string; follow?: boolean; alert?: boolean; onSignal?: (signalId: string) => void; crash?: boolean }) {
  const t = useAppStore(
    useShallow((s) => {
      const tr = selTrip(s)
      return tr ? { id: tr.id, routeKey: tr.routeKey, route: tr.route, status: tr.status, nextKey: nextSignalKey(s) } : { id: null, routeKey: null, route: null, status: null, nextKey: null }
    }),
  )
  const crashAt = useAppStore((s) => (crash ? selCase(s)?.location ?? null : null))
  const sigs = useTripSignals()
  const blocked = useAppStore((s) => s.blockedRoads)
  const selected = useAppStore((s) => s.selectedSignalId)
  return (
    <>
      {crashAt && <CrashPin lngLat={crashAt} />}
      {t.route && t.routeKey && t.id && (
        <RouteRunner
          id={id}
          route={t.route}
          routeKey={t.routeKey}
          progress={() => (live.routeKey === t.routeKey ? live.progressM : get().trips[t.id!]?.progressM ?? 0)}
          exact={() => live.exact && live.routeKey === t.routeKey}
          lights={() => get().trips[t.id!]?.status === 'enroute'}
          follow={follow}
          alert={alert && t.status === 'enroute'}
        />
      )}
      {blocked
        .filter((b) => b.tripId === t.id)
        .map((b) => (
          <BlockedRoad key={b.id} id={`${id}-${b.id}`} coords={b.coords} />
        ))}
      {t.status === 'enroute' &&
        sigs.map((g) => {
          const view = viewOf(g)
          const showLabel = g.id === selected || g.id === t.nextKey
          return (
            <SignalMarker
              key={g.id}
              lngLat={[g.lng, g.lat]}
              heading={g.heading}
              name={g.name}
              code={g.code}
              state={view}
              tick={g.state === 'RELEASED' && (g.releasedFlashUntil ?? 0) > Date.now()}
              label={showLabel ? `${g.code} ${STATE_LABEL[view]}` : null}
              selected={g.id === selected}
              onClick={onSignal ? () => onSignal(g.id) : undefined}
            />
          )
        })}
    </>
  )
}

/** Id of the next signal ahead, changing only when the ambulance passes one. */
function nextSignalKey(s: ReturnType<typeof get>): string | null {
  const t = selTrip(s)
  if (!t) return null
  return t.signalIds.find((sid) => {
    const g = s.signals[sid]
    return g && isAhead(g, t)
  }) ?? null
}
