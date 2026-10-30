/** Every assumption the simulation makes, in one place. Shown in the "Simulation assumptions" tooltip. */
export const SIM = {
  /** OSRM gives free-flow times. Pune peak traffic is modelled as 1.5 times slower. */
  peakTrafficFactor: 1.5,
  /** Average wait at each red signal without a corridor, seconds. */
  signalWaitS: 45,
  /** Most signals kept on a route. */
  maxSignals: 6,
  /** Smallest gap between kept signals, metres. */
  minSignalGapM: 350,
  /** Cross traffic is never held longer than this, seconds. Editable in settings. */
  holdCapS: 40,
  /** A signal turns green when the ambulance is this close, metres. */
  greenAtM: 250,
  /** How many signals ahead are armed. */
  armAhead: 2,
  /** Slow to this share of speed before a turn or a signal that is not green. */
  slowFactor: 0.6,
  slowZoneM: 80,
  /** Bed hold length, seconds. */
  bedHoldS: 15 * 60,
  goldenHourS: 60 * 60,
  /** Radius of the drivers-ahead alert, metres. */
  alertRadiusM: 300,
  /** Ambulance speed to the crash scene, km/h, used for unit matching. */
  unitSpeedKmh: 30,
  roadFactor: 1.35,
} as const

export const ASSUMPTION_LINES = [
  `Normal ETA = OSRM free-flow time x ${SIM.peakTrafficFactor} (peak traffic), plus ${SIM.signalWaitS} s wait at each signal.`,
  `Corridor ETA = OSRM free-flow time x ${SIM.peakTrafficFactor}, with no signal waits.`,
  `Up to ${SIM.maxSignals} signals per route, taken from real OSRM junctions at least ${SIM.minSignalGapM} m apart.`,
  `A signal arms ${SIM.armAhead} junctions ahead, turns green within ${SIM.greenAtM} m, and never holds cross traffic past ${SIM.holdCapS} s.`,
  `Bed holds last ${SIM.bedHoldS / 60} minutes.`,
]
