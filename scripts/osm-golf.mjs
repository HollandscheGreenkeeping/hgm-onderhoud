// Haalt golfgegevens uit OpenStreetMap op en schrijft ze als SQL naar een tijdelijke tabel
// `osm_golf`, als startpunt voor het intekenen van een baan (daarna controleren in QGIS).
//
//   node scripts/osm-golf.mjs <zuid,west,noord,oost> > osm.sql
//   bijv. node scripts/osm-golf.mjs 51.763,4.960,51.780,4.992 > almkreek.sql
//   Overpass druk? Geef een eerder opgeslagen Overpass-antwoord (JSON) mee als tweede argument.
//
// Wordt overgenomen: golf=hole (speellijn), green, tee, bunker, fairway, rough, water_hazard,
// lateral_water_hazard. Data © OpenStreetMap-bijdragers, ODbL.

const bbox = process.argv[2]
if (!/^[\d.]+,[\d.]+,[\d.]+,[\d.]+$/.test(bbox ?? '')) {
  console.error('Gebruik: node scripts/osm-golf.mjs <zuid,west,noord,oost>')
  process.exit(1)
}

const vraag = `[out:json][timeout:60];way["golf"](${bbox});out geom tags;`
const servers = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

let data = process.argv[3]
  ? JSON.parse((await import('node:fs')).readFileSync(process.argv[3], 'utf8').replace(/^\uFEFF/, ''))
  : null
for (const url of data ? [] : servers) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'User-Agent': 'HGM-Golf-GIS/0.1', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: vraag }),
      signal: AbortSignal.timeout(90_000),
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    data = await r.json()
    console.error(`OSM: ${data.elements.length} elementen via ${url}`)
    break
  } catch (e) {
    console.error(`OSM-server ${url} faalde: ${e.message}`)
  }
}
if (!data) process.exit(1)

const soorten = new Set(['hole', 'green', 'tee', 'bunker', 'fairway', 'rough', 'water_hazard', 'lateral_water_hazard'])
const tekst = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`)
const coords = (g) => g.map((p) => `${p.lon} ${p.lat}`).join(',')

const rijen = []
for (const el of data.elements) {
  const soort = el.tags?.golf
  if (!soorten.has(soort) || !el.geometry?.length) continue
  const g = el.geometry
  const gesloten = g.length > 3 && g[0].lat === g.at(-1).lat && g[0].lon === g.at(-1).lon
  let wkt
  if (soort === 'hole') wkt = `LINESTRING(${coords(g)})`
  else if (gesloten) wkt = `POLYGON((${coords(g)}))`
  else continue // open lijn voor een vlak: overslaan
  rijen.push(`  (${el.id}, ${tekst(soort)}, ${tekst(el.tags.ref)}, ${tekst(el.tags.par)}, 'SRID=4326;${wkt}')`)
}

console.log(`-- Gegenereerd door scripts/osm-golf.mjs voor bbox ${bbox} op ${new Date().toISOString()}
-- Data © OpenStreetMap-bijdragers (ODbL)
create temp table osm_golf (osm_id bigint, soort text, ref text, par text, geom geometry);
insert into osm_golf values
${rijen.join(',\n')};`)
console.error(`${rijen.length} bruikbare elementen geschreven`)
