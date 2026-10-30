// Fetches real road geometry from the public OSRM server and stores it in src/data/routes.
// Run once with `npm run fetch-routes`. The JSON is committed so the demo works offline.
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src/data/routes')
const OSRM = 'https://router.project-osrm.org'

// Keep in sync with src/data/places.ts
const HOSPITAL_SEEDS = [
  { id: 'h-shivajinagar', lat: 18.5308, lng: 73.8475 },
  { id: 'h-kothrud', lat: 18.5074, lng: 73.8077 },
  { id: 'h-aundh', lat: 18.559, lng: 73.8078 },
  { id: 'h-baner', lat: 18.559, lng: 73.7868 },
  { id: 'h-vimannagar', lat: 18.5679, lng: 73.9143 },
  { id: 'h-hadapsar', lat: 18.5089, lng: 73.926 },
  { id: 'h-swargate', lat: 18.5018, lng: 73.8636 },
  { id: 'h-katraj', lat: 18.4575, lng: 73.8677 },
]

const PRESETS = [
  { id: 'p-university', lat: 18.5293, lng: 73.8296 },
  { id: 'p-yerawada', lat: 18.553, lng: 73.884 },
  { id: 'p-nalstop', lat: 18.5082, lng: 73.8328 },
  { id: 'p-kharadi', lat: 18.548, lng: 73.937 },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'MediRoute-hackathon-prototype' } })
      if (res.ok) return await res.json()
      console.warn(`  HTTP ${res.status}, retrying`)
    } catch (e) {
      console.warn(`  ${e.message}, retrying`)
    }
    await sleep(1500 * (i + 1))
  }
  throw new Error(`Failed: ${url}`)
}

const r5 = (n) => Math.round(n * 1e5) / 1e5

function trimRoute(route) {
  const junctions = []
  for (const leg of route.legs) {
    for (const step of leg.steps) {
      for (const ix of step.intersections ?? []) {
        if ((ix.bearings?.length ?? 0) < 3 || ix.in === undefined) continue
        junctions.push({
          loc: [r5(ix.location[0]), r5(ix.location[1])],
          name: step.name || '',
          bearings: ix.bearings,
          in: ix.in,
        })
      }
    }
  }
  return {
    geometry: route.geometry.coordinates.map(([x, y]) => [r5(x), r5(y)]),
    distance: Math.round(route.distance),
    duration: Math.round(route.duration),
    junctions,
  }
}

async function route(a, b, via) {
  const pts = [a, ...(via ? [via] : []), b].map((p) => `${p.lng},${p.lat}`).join(';')
  const alt = via ? '' : '&alternatives=true'
  const url = `${OSRM}/route/v1/driving/${pts}?overview=full&geometries=geojson&steps=true${alt}`
  const data = await getJson(url)
  if (data.code !== 'Ok') throw new Error(`OSRM ${data.code}`)
  return data.routes
}

async function main() {
  await mkdir(OUT, { recursive: true })

  const snapped = {}
  for (const h of HOSPITAL_SEEDS) {
    const data = await getJson(`${OSRM}/nearest/v1/driving/${h.lng},${h.lat}?number=1`)
    const wp = data.waypoints[0]
    snapped[h.id] = { lng: r5(wp.location[0]), lat: r5(wp.location[1]), road: wp.name || '' }
    console.log(`snapped ${h.id} to ${wp.name || 'unnamed road'}`)
    await sleep(400)
  }
  await writeFile(join(ROOT, 'src/data/snapped.json'), JSON.stringify(snapped, null, 2))

  for (const p of PRESETS) {
    for (const h of HOSPITAL_SEEDS) {
      const dest = snapped[h.id]
      const routes = await route(p, dest)
      let out = routes.slice(0, 2).map(trimRoute)
      if (out.length < 2) {
        // No OSRM alternative: build one through a via point offset from the midpoint.
        const g = routes[0].geometry.coordinates
        const mid = g[Math.floor(g.length / 2)]
        const dx = dest.lng - p.lng
        const dy = dest.lat - p.lat
        const len = Math.hypot(dx, dy) || 1
        const via = { lng: mid[0] - (dy / len) * 0.006, lat: mid[1] + (dx / len) * 0.006 }
        try {
          const detour = await route(p, dest, via)
          out.push(trimRoute(detour[0]))
        } catch {
          console.warn(`  no alternative for ${p.id} to ${h.id}`)
        }
      }
      const file = `${p.id}__${h.id}.json`
      await writeFile(join(OUT, file), JSON.stringify({ from: p.id, to: h.id, routes: out }))
      console.log(`${file}: ${(out[0].distance / 1000).toFixed(1)} km, ${Math.round(out[0].duration / 60)} min, ${out.length} routes`)
      await sleep(600)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
