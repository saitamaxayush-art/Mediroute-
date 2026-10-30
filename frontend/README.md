# MediRoute

The right hospital, a clear road, faster care.

MediRoute finds the nearest hospital that can actually treat this patient, shows how much to trust that hospital's data, and turns the signals green on the way there. Frontend prototype for the Geek Fiesta '26 Ideathon (Mobility and Public Safety). All hospital and trip data is sample data; signal control is simulated.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173 (use --port if taken)
npm test             # engine unit tests, including the demo scenario
npm run build        # type-check and production build
npm run preview      # serve the build, with the service worker
```

Road routes are real OSRM routes, already fetched into `src/data/routes/*.json` so the demo works offline. To refetch them: `npm run fetch-routes`. PWA icons come from `node scripts/make-icons.mjs`.

Maps need WebGL. Tiles come from OpenFreeMap (vector, recoloured to the palette), falling back to CARTO raster tiles.

## Demo in 3 minutes

1. **Landing (`/`), 40 s.** Let the preloader draw the Pune road network. Point at the hero map: the nearest hospital is tagged "No neurosurgeon in the building" and the ambulance drives the green route. Scroll through "How it works": eight chapters, from the 112 call to arrival, scrubbed by scroll.
2. **Two tabs, 20 s.** Open `/console` and, side by side, `/hospital` (it opens on Riverside Trauma Centre).
3. **Console, 60 s.** Press **Load demo case**. Show the right panel:
   - Northgate (nearest) is filtered: no neurosurgeon. Westend is filtered: 0 ICU beds (open "Filtered out").
   - Mula Road shows "Updated 41 min ago" in red: its raw score is highest but it drops to second.
   - Riverside wins, about 5 minutes further than the nearest. The left panel says ALS-03 was chosen over the nearer BLS-01.
   - Open **Ranking weights**, drag a slider, and watch the list re-sort.
4. **Dispatch, 30 s.** Press **Confirm and dispatch**. The hospital tab shows the incoming case and a 15:00 bed hold within a second. Press **Approve corridor**. Junctions go WAITING, ARMED, GREEN, RELEASED in the bottom drawer; holds stay under the 40 s cap.
5. **Things going wrong, 30 s.** In **Demo controls**: **Report blocked road** (switches to the OSRM alternative), then in the hospital tab press **Divert** (or **Hospital ICU fills up** in the console) to re-route to the next best hospital. **Signal link fails** restores normal cycles and switches to advisory mode. **Network drop** shows the SMS fallback in `/paramedic`.
6. **Replay.** Open `/replay` to see the finished trip junction by junction.

Speed defaults to 10x. Use **Reset demo** in Demo controls to start clean.

## Where things live

| Path | What it is |
| --- | --- |
| `src/services/api.ts` | **The service layer the backend replaces.** Every UI action goes through it. |
| `src/services/routing.ts` | Preset routes and live OSRM calls, with fallback to the nearest preset. |
| `src/engine/` | Pure decision engine: requirements, hard filter, scoring, confidence, penalties, ambulance match, mass-casualty allocation, voice parser. Unit tested. |
| `src/sim/` | Trip simulation (signal state machine, red waits, slow-downs) and the driver that runs it in one tab. |
| `src/store/` | Zustand store, mirrored across tabs with BroadcastChannel and kept for 15 min in localStorage. |
| `src/config/simulation.ts` | Every simulation assumption, shown in the "Simulation assumptions" tooltip. |
| `src/data/` | Sample hospitals (fictional names, real Pune locations), fleet, triage table, demo scenario, OSRM routes. |
| `src/map/` | MapLibre base map, ambulance marker and route runner, markers. |

## How the pages stay in sync

- `src/store/appStore.ts` is the single store. Every change goes through `commit()`, which builds an event `{ id, ts, actor, type, payload }`, applies it, writes the audit log entry, broadcasts it on a `BroadcastChannel` and persists the state to localStorage (`mediroute.state.v2`). Other tabs apply events in order and ignore duplicates by id.
- Event payloads are small operations (`put`, `merge`, `mergeItem`, `push`, `append`, `settings`), so a 10 Hz position tick never overwrites an operator command.
- `src/sim/simulationService.ts` starts once at the app root. The tab holding the Web Lock `mediroute-sim-leader` runs the simulation; a hidden tab hands the lock on. The leader broadcasts positions about 10 times a second and other tabs interpolate.
- Presence: each page sends a heartbeat every 2 s; the dots in the top bar show which roles are open.

## Service API for the backend

All functions are async today unless marked sync. Types are in `src/types.ts`; store and event types in `src/store/appStore.ts`.

| Function | Request | Response |
| --- | --- | --- |
| `getHospitals()` | none | `Hospital[]` |
| `updateHospitalStatus(id, patch, note?)` | `id: string`, `patch: Partial<Pick<Hospital, 'beds' \| 'capabilities' \| 'specialists' \| 'strokeTeam' \| 'erLoad'>>`, `note?: string` | `Hospital` (with `lastUpdated` set to now). Triggers a re-route check. |
| `confirmStatusUnchanged(id)` | `id: string` | `void` (refreshes `lastUpdated`) |
| `createCase(input)` | `CaseInput { injuryClass, gcs, vitals: Vitals, conscious, location: [lng, lat], locationLabel?, presetId?, treatment?, notes? }` | `Case`. Also sets the ambulance match. Live routes when `presetId` is null. |
| `updateCase(patch, actor?)` (sync) | triage or vitals fields; `actor` is `'operator'` or `'paramedic'` | `void` |
| `rankHospitals()` | none (uses the open case) | `Ranking { required: Requirement[], ranked: RankedHospital[], filtered: FilteredHospital[] } \| null` |
| `dispatch(hospitalId)` | `hospitalId: string` | `Trip \| null`. Places a 15 min bed hold. |
| `approveCorridor()` | none | `Trip \| null` with `corridor: 'active' \| 'advisory'` |
| `reportBlockedRoad(actor?)` | blocks the segment ahead on the active trip | `Trip \| null` on the alternative route |
| `divert(hospitalId, reason)` | `hospitalId: string`, `reason: string` | `void`. Logs a refusal and re-routes. |
| `rerouteIfNeeded()` | none | `boolean` (true when re-routed) |
| `getTrips()` | none | `CompletedTrip[]` |
| `commandSignal(signalId, cmd, opts?)` | `cmd: 'green' \| 'red' \| 'normal'`, `opts: { actor?, source?: 'auto' \| 'operator' \| 'request', quiet? }` | `boolean`. In advisory mode the command becomes advice. Logged with the previous state; undo via toast. |
| `clearNext(n)`, `releaseBehind()`, `extendHold(signalId)` | bulk and hold commands | `void` |
| `requestGreen()` | none (paramedic, next signal) | `void`. Creates a `SignalRequest`. |
| `approveRequest(id)`, `dismissRequest(id)` | request id | `void` |
| `sendHandoverNote(text)` | `text: string` | `void`. Stored in `handoverNotes[caseId]`. |
| `setCorridorMode(mode)`, `setHoldCap(s)`, `setAdvisory(on)`, `setSpeed(x)`, `setPlaying(on)` | settings | `void` |
| `triggerIcuFull()`, `signalLinkFail()`, `restoreSignalLink()`, `setNetwork(up)`, `setAdvisory(on)` | demo controls | `void` |
| `massCasualty(patients, at)` (sync) | `McPatient[] { id, severity, injuryClass }`, `[lng, lat]` | `McRow[] { patient, hospital, bed, etaS, note }` |

A backend would own: hospital status (write from the ER dashboard, read by ranking), cases and trips, bed holds with expiry, the audit log, the signal controller link, and routing. The BroadcastChannel sync in `src/store/sync.ts` becomes a WebSocket subscription.

## Notes

- Hospital names are fictional. Every number is sample data or simulated, and labelled so.
- The only gradient in the CSS is the soft-edged cursor mask on the footer wordmark, which is functional rather than decorative. MapLibre's `line-gradient` draws the travelled part of the route.
- Map data: OpenStreetMap contributors (ODbL). Tiles: OpenFreeMap, CARTO. Routing: OSRM public server.
