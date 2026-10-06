// Hoogtekaart uit het AHN (Actueel Hoogtebestand Nederland, maaiveld/DTM 0,5 m) via PDOK.
// We halen echte hoogtewaarden op (WCS, GeoTIFF) en kleuren die zelf in, met een kleurschaal
// die past bij déze baan. De landelijke kaart van PDOK is voor een polderbaan te grof
// (alles één kleur). Bron: AHN © Rijkswaterstaat/Waterschappen, via PDOK (CC0).

import type { Feature, FeatureCollection, Geometry, MultiLineString } from 'geojson'

export type Hoogtegrid = {
  data: Float32Array        // m NAP, NaN = geen meting (water, gebouwen weggefilterd in DTM)
  breedte: number
  hoogte: number
  bbox: [number, number, number, number] // west, zuid, oost, noord (WGS84)
}

export type Bereik = { laag: number; hoog: number }

const WCS = 'https://service.pdok.nl/rws/ahn/wcs/v1_0'

// Haalt het maaiveld op voor een gebied; resolutie ±1,5 m bij een baan van 2 km breed.
export async function laadHoogte(bbox: [number, number, number, number], maxPixels = 1400): Promise<Hoogtegrid> {
  const [w, z, o, n] = bbox
  const midLat = ((z + n) / 2) * Math.PI / 180
  const breedteM = (o - w) * 111320 * Math.cos(midLat)
  const hoogteM = (n - z) * 110540
  const schaal = Math.min(1, maxPixels / Math.max(breedteM, hoogteM)) // max 1 px per meter
  const px = Math.max(50, Math.round(breedteM * schaal))
  const py = Math.max(50, Math.round(hoogteM * schaal))
  const crs = 'http://www.opengis.net/def/crs/EPSG/0/4326'
  const url = `${WCS}?service=WCS&version=2.0.1&request=GetCoverage&CoverageId=dtm_05m&format=image/tiff`
    + `&subsettingCrs=${encodeURIComponent(crs)}&subset=x(${w},${o})&subset=y(${z},${n})&scalesize=x(${px}),y(${py})`
  const antwoord = await fetch(url)
  if (!antwoord.ok) throw new Error(`AHN niet beschikbaar (${antwoord.status})`)
  const { fromArrayBuffer } = await import('geotiff')
  const tiff = await fromArrayBuffer(await antwoord.arrayBuffer())
  const beeld = await tiff.getImage()
  const ruw = (await beeld.readRasters({ samples: [0] }))[0] as Float32Array
  const data = new Float32Array(ruw.length)
  for (let i = 0; i < ruw.length; i++) {
    const v = ruw[i]
    data[i] = v > -50 && v < 400 ? v : NaN
  }
  const [bw, bz, bo, bn] = beeld.getBoundingBox() as [number, number, number, number]
  return { data, breedte: beeld.getWidth(), hoogte: beeld.getHeight(), bbox: [bw, bz, bo, bn] }
}

const naarPixel = (g: Hoogtegrid, lon: number, lat: number): [number, number] => {
  const [w, z, o, n] = g.bbox
  return [((lon - w) / (o - w)) * g.breedte, ((n - lat) / (n - z)) * g.hoogte]
}

function percentielen(waarden: number[], onder: number, boven: number): Bereik {
  if (!waarden.length) return { laag: 0, hoog: 1 }
  waarden.sort((a, b) => a - b)
  const p = (q: number) => waarden[Math.floor(q * (waarden.length - 1))]
  const laag = p(onder), hoog = p(boven)
  return hoog - laag < 0.05 ? { laag: laag - 0.05, hoog: hoog + 0.05 } : { laag, hoog }
}

// Kleurbereik op basis van alleen de holes (de polder eromheen telt dan niet mee).
export function bereikOpBaan(g: Hoogtegrid, vlakken: Feature<Geometry>[]): Bereik {
  const canvas = document.createElement('canvas')
  canvas.width = g.breedte
  canvas.height = g.hoogte
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  for (const f of vlakken) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates]
      : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : []
    for (const poly of polys) {
      ctx.beginPath()
      for (const ring of poly) ring.forEach(([lon, lat], i) => {
        const [x, y] = naarPixel(g, lon, lat)
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      })
      ctx.fill('evenodd')
    }
  }
  const masker = ctx.getImageData(0, 0, g.breedte, g.hoogte).data
  const waarden: number[] = []
  for (let i = 0; i < g.data.length; i += 3) {
    if (masker[i * 4 + 3] > 0 && !Number.isNaN(g.data[i])) waarden.push(g.data[i])
  }
  return waarden.length > 500 ? percentielen(waarden, 0.03, 0.97) : bereikIn(g, g.bbox)
}

// Kleurbereik voor wat nu in beeld is (bijv. ingezoomd op één green).
export function bereikIn(g: Hoogtegrid, [w, z, o, n]: [number, number, number, number]): Bereik {
  const [x0, y0] = naarPixel(g, w, n), [x1, y1] = naarPixel(g, o, z)
  const xa = Math.max(0, Math.floor(x0)), xb = Math.min(g.breedte - 1, Math.ceil(x1))
  const ya = Math.max(0, Math.floor(y0)), yb = Math.min(g.hoogte - 1, Math.ceil(y1))
  const stap = Math.max(1, Math.floor(Math.sqrt(((xb - xa) * (yb - ya)) / 200_000)))
  const waarden: number[] = []
  for (let y = ya; y <= yb; y += stap) for (let x = xa; x <= xb; x += stap) {
    const v = g.data[y * g.breedte + x]
    if (!Number.isNaN(v)) waarden.push(v)
  }
  return percentielen(waarden, 0.02, 0.98)
}

// Kleurschaal laag → hoog, fel genoeg om centimeters te zien: diepblauw (nat/laag) via groen
// en geel naar oranje en roodbruin (hoog).
const stops: [number, [number, number, number]][] = [
  [0, [24, 70, 150]],
  [0.18, [44, 127, 208]],
  [0.36, [70, 180, 170]],
  [0.52, [130, 196, 82]],
  [0.68, [240, 214, 72]],
  [0.84, [236, 140, 52]],
  [1, [160, 52, 32]],
]

// Buiten de schaal niet afkappen: lager wordt grijs (hoe lager, hoe donkerder), hoger wordt paars.
// Anders krijgt bij inzoomen op een heuvel alles eromheen (snelweg, polder) dezelfde kleur als de voet.
const onder: [number, number, number] = [178, 180, 186], diepOnder: [number, number, number] = [72, 74, 82]
const boven: [number, number, number] = [150, 60, 150], hoogBoven: [number, number, number] = [235, 205, 240]
const meng = (a: number[], b: number[], f: number): [number, number, number] =>
  [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]

function kleur(t: number): [number, number, number] {
  if (t < 0) return meng(onder, diepOnder, Math.min(1, -t / 1.5))
  if (t > 1) return meng(boven, hoogBoven, Math.min(1, (t - 1) / 1.5))
  const x = t
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [a, ka] = stops[i - 1], [b, kb] = stops[i]
      const f = (x - a) / (b - a)
      return [ka[0] + (kb[0] - ka[0]) * f, ka[1] + (kb[1] - ka[1]) * f, ka[2] + (kb[2] - ka[2]) * f]
    }
  }
  return stops.at(-1)![1]
}

export const kleurschaalCss = `linear-gradient(to right, ${stops.map(([t, k]) => `rgb(${k.join(',')}) ${t * 100}%`).join(', ')})`
export const kleurOnderCss = `rgb(${onder.join(',')})`
export const kleurBovenCss = `rgb(${boven.join(',')})`

// Tekent kleur × reliëfschaduw naar een PNG (data-URL) voor een MapLibre image-bron.
// 'overdrijving' maakt kleine hoogteverschillen in de schaduw zichtbaar. Standaard past die zich aan:
// in de polder (paar decimeter) flink overdrijven, bij een heuvel of talud juist niet, anders
// overheersen de schaduwen van snelwegtaluds en heuvelflanken de kleuren.
export const standaardOverdrijving = (b: Bereik) => Math.min(12, Math.max(2, 30 / Math.max(0.05, b.hoog - b.laag)))

export function tekenHoogte(g: Hoogtegrid, bereik: Bereik, overdrijving = standaardOverdrijving(bereik)): string {
  const canvas = document.createElement('canvas')
  canvas.width = g.breedte
  canvas.height = g.hoogte
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(g.breedte, g.hoogte)
  img.data.set(kleurHoogte(g, bereik, overdrijving))
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

// RGBA-pixels (kleur × reliëfschaduw); los van canvas zodat het ook buiten de browser te testen is.
export function kleurHoogte(g: Hoogtegrid, bereik: Bereik, overdrijving = standaardOverdrijving(bereik)): Uint8ClampedArray {
  const img = { data: new Uint8ClampedArray(g.breedte * g.hoogte * 4) }
  const [w, z, o, n] = g.bbox
  const midLat = ((z + n) / 2) * Math.PI / 180
  const dx = ((o - w) / g.breedte) * 111320 * Math.cos(midLat)
  const dy = ((n - z) / g.hoogte) * 110540
  const span = Math.max(0.05, bereik.hoog - bereik.laag)
  // Licht uit het noordwesten, 40° hoog (klassieke reliëfschaduw).
  const az = (315 * Math.PI) / 180, alt = (40 * Math.PI) / 180
  const v = (x: number, y: number, terug: number) => {
    const xx = Math.min(g.breedte - 1, Math.max(0, x)), yy = Math.min(g.hoogte - 1, Math.max(0, y))
    const w2 = g.data[yy * g.breedte + xx]
    return Number.isNaN(w2) ? terug : w2
  }
  for (let y = 0; y < g.hoogte; y++) {
    for (let x = 0; x < g.breedte; x++) {
      const i = y * g.breedte + x
      const h = g.data[i]
      if (Number.isNaN(h)) { img.data[i * 4 + 3] = 0; continue }
      const dzdx = ((v(x + 1, y - 1, h) + 2 * v(x + 1, y, h) + v(x + 1, y + 1, h))
                  - (v(x - 1, y - 1, h) + 2 * v(x - 1, y, h) + v(x - 1, y + 1, h))) / (8 * dx) * overdrijving
      const dzdy = ((v(x - 1, y + 1, h) + 2 * v(x, y + 1, h) + v(x + 1, y + 1, h))
                  - (v(x - 1, y - 1, h) + 2 * v(x, y - 1, h) + v(x + 1, y - 1, h))) / (8 * dy) * overdrijving
      const helling = Math.atan(Math.hypot(dzdx, dzdy))
      const aspect = Math.atan2(dzdy, -dzdx)
      const schaduw = Math.max(0, Math.cos(alt) * Math.cos(helling)
        + Math.sin(alt) * Math.sin(helling) * Math.cos(az - aspect))
      const [r, gr, b] = kleur((h - bereik.laag) / span)
      const f = 0.3 + 0.95 * schaduw
      img.data[i * 4] = Math.min(255, r * f)
      img.data[i * 4 + 1] = Math.min(255, gr * f)
      img.data[i * 4 + 2] = Math.min(255, b * f)
      img.data[i * 4 + 3] = 255
    }
  }
  return img.data
}

// Hoogtelijnen (marching squares) op een licht gladgestreken, gehalveerd grid, zodat de lijnen
// rustig zijn en het aantal lijnstukken beperkt blijft. Elke halve meter is een 'hoofd'-lijn.
export function hoogtelijnen(g: Hoogtegrid, interval: number): FeatureCollection<MultiLineString> {
  const f = 2
  const bw = Math.floor(g.breedte / f), bh = Math.floor(g.hoogte / f)
  const grof = new Float32Array(bw * bh)
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    let som = 0, aantal = 0
    for (let dy = -1; dy <= f; dy++) for (let dx = -1; dx <= f; dx++) {
      const xx = x * f + dx, yy = y * f + dy
      if (xx < 0 || yy < 0 || xx >= g.breedte || yy >= g.hoogte) continue
      const v = g.data[yy * g.breedte + xx]
      if (!Number.isNaN(v)) { som += v; aantal++ }
    }
    grof[y * bw + x] = aantal > 4 ? som / aantal : NaN
  }
  const [w, z, o, n] = g.bbox
  const lon = (x: number) => w + ((x * f + f / 2) / g.breedte) * (o - w)
  const lat = (y: number) => n - ((y * f + f / 2) / g.hoogte) * (n - z)

  let min = Infinity, max = -Infinity
  for (const v of grof) if (!Number.isNaN(v)) { if (v < min) min = v; if (v > max) max = v }
  const niveaus: number[] = []
  for (let h = Math.ceil(min / interval) * interval; h <= max && niveaus.length < 400; h += interval) niveaus.push(+h.toFixed(3))

  const lijnen = new Map<number, number[][][]>()
  const snij = (a: number, b: number, h: number) => (h - a) / (b - a)
  for (let y = 0; y < bh - 1; y++) for (let x = 0; x < bw - 1; x++) {
    const a = grof[y * bw + x], b = grof[y * bw + x + 1], c = grof[(y + 1) * bw + x + 1], d = grof[(y + 1) * bw + x]
    if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) continue
    const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d)
    for (const h of niveaus) {
      if (h < lo || h > hi) continue
      // Snijpunten op de vier randen van de cel (boven, rechts, onder, links).
      const p: number[][] = []
      if ((a < h) !== (b < h)) p.push([lon(x + snij(a, b, h)), lat(y)])
      if ((b < h) !== (c < h)) p.push([lon(x + 1), lat(y + snij(b, c, h))])
      if ((d < h) !== (c < h)) p.push([lon(x + snij(d, c, h)), lat(y + 1)])
      if ((a < h) !== (d < h)) p.push([lon(x), lat(y + snij(a, d, h))])
      if (p.length >= 2) {
        const lijst = lijnen.get(h) ?? []
        lijst.push([p[0], p[1]])
        if (p.length === 4) lijst.push([p[2], p[3]])
        lijnen.set(h, lijst)
      }
    }
  }
  return {
    type: 'FeatureCollection',
    features: [...lijnen].map(([h, stukken]) => ({
      type: 'Feature',
      properties: { hoogte: h, hoofd: Math.abs(h / 0.5 - Math.round(h / 0.5)) < 1e-6, label: nap(h) },
      geometry: { type: 'MultiLineString', coordinates: aanElkaar(stukken) },
    })),
  }
}

// Plakt losse lijnstukjes met gedeelde eindpunten aan elkaar tot doorlopende lijnen
// (minder werk voor de kaart, en lang genoeg om er een hoogtelabel op te zetten).
function aanElkaar(stukken: number[][][]): number[][][] {
  const sleutel = (p: number[]) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`
  const bij = new Map<string, number[]>()
  stukken.forEach((s, i) => {
    for (const p of s) {
      const k = sleutel(p)
      const lijst = bij.get(k)
      if (lijst) lijst.push(i); else bij.set(k, [i])
    }
  })
  const gebruikt = new Uint8Array(stukken.length)
  const volgende = (p: number[]) => (bij.get(sleutel(p)) ?? []).find((j) => !gebruikt[j])
  const uit: number[][][] = []
  for (let i = 0; i < stukken.length; i++) {
    if (gebruikt[i]) continue
    gebruikt[i] = 1
    const lijn = [...stukken[i]]
    for (const richting of ['achter', 'voor'] as const) {
      for (;;) {
        const eind = richting === 'achter' ? lijn[lijn.length - 1] : lijn[0]
        const j = volgende(eind)
        if (j == null) break
        gebruikt[j] = 1
        const [a, b] = stukken[j]
        const nieuw = sleutel(a) === sleutel(eind) ? b : a
        if (richting === 'achter') lijn.push(nieuw); else lijn.unshift(nieuw)
      }
    }
    uit.push(lijn)
  }
  return uit
}

// ── 3D-reliëf ────────────────────────────────────────────────────────────────────────────────
// MapLibre wil voor 3D 'raster-dem'-tegels. PDOK levert die niet, dus maken we ze zelf uit het
// AHN-grid dat we toch al hebben: een eigen protocol 'ahn://' dat per tegel een PNG in
// Terrarium-codering tekent. Gaten (water, weggefilterde gebouwen) eerst opvullen, anders
// worden het putten.

// Vult NaN-gaten met het gemiddelde van de omgeving (piramide: steeds grover tot alles gevuld is).
function vulGaten(d: Float32Array, w: number, h: number): Float32Array {
  if (!d.some(Number.isNaN)) return d
  if (w <= 1 && h <= 1) return new Float32Array([0])
  const w2 = Math.ceil(w / 2), h2 = Math.ceil(h / 2)
  const grof = new Float32Array(w2 * h2)
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
    let som = 0, aantal = 0
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const xx = x * 2 + dx, yy = y * 2 + dy
      if (xx >= w || yy >= h) continue
      const v = d[yy * w + xx]
      if (!Number.isNaN(v)) { som += v; aantal++ }
    }
    grof[y * w2 + x] = aantal ? som / aantal : NaN
  }
  const gevuld = vulGaten(grof, w2, h2)
  const uit = d.slice()
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (Number.isNaN(uit[y * w + x])) uit[y * w + x] = gevuld[(y >> 1) * w2 + (x >> 1)]
  }
  return uit
}

let demGrid: Hoogtegrid | null = null
let demVersie = 0
let protocolGeregistreerd = false

// Hoogte (bilineair) op lon/lat; buiten het grid de dichtstbijzijnde rand.
function demHoogte(g: Hoogtegrid, lon: number, lat: number): number {
  const [x, y] = naarPixel(g, lon, lat)
  const fx = Math.min(g.breedte - 1.001, Math.max(0, x - 0.5)), fy = Math.min(g.hoogte - 1.001, Math.max(0, y - 0.5))
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0
  const d = g.data, b = g.breedte
  const boven = d[y0 * b + x0] * (1 - tx) + d[y0 * b + x0 + 1] * tx
  const onder = d[(y0 + 1) * b + x0] * (1 - tx) + d[(y0 + 1) * b + x0 + 1] * tx
  return boven * (1 - ty) + onder * ty
}

async function demTegel(z: number, tx: number, ty: number): Promise<ArrayBuffer> {
  const g = demGrid
  const n = 256, schaal = n * 2 ** z
  const canvas = new OffscreenCanvas(n, n)
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(n, n)
  for (let py = 0; py < n; py++) {
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty * n + py + 0.5)) / schaal))) * 180) / Math.PI
    for (let px = 0; px < n; px++) {
      const lon = ((tx * n + px + 0.5) / schaal) * 360 - 180
      const v = (g ? demHoogte(g, lon, lat) : 0) + 32768 // Terrarium: (R·256 + G + B/256) − 32768
      const i = (py * n + px) * 4
      img.data[i] = Math.floor(v / 256)
      img.data[i + 1] = Math.floor(v) % 256
      img.data[i + 2] = Math.floor((v - Math.floor(v)) * 256)
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()
}

// Zet het grid klaar als 3D-hoogtebron en geeft de tegel-URL terug (nieuw per grid, dus geen oude tegels).
export function demBron(g: Hoogtegrid, addProtocol: (naam: string, laad: (p: { url: string }) => Promise<{ data: ArrayBuffer }>) => void): string {
  demGrid = { ...g, data: vulGaten(g.data, g.breedte, g.hoogte) }
  demVersie++
  if (!protocolGeregistreerd) {
    addProtocol('ahn', async ({ url }) => {
      const [z, x, y] = url.split('/').slice(-3).map(Number)
      return { data: await demTegel(z, x, y) }
    })
    protocolGeregistreerd = true
  }
  return `ahn://${demVersie}/{z}/{x}/{y}`
}

// Hoogte (m NAP) op een punt, of null buiten het gebied / zonder meting.
export function hoogteOp(g: Hoogtegrid, lon: number, lat: number): number | null {
  const [w, z, o, n] = g.bbox
  if (lon < w || lon > o || lat < z || lat > n) return null
  const [x, y] = naarPixel(g, lon, lat)
  const v = g.data[Math.min(g.hoogte - 1, Math.floor(y)) * g.breedte + Math.min(g.breedte - 1, Math.floor(x))]
  return Number.isNaN(v) ? null : v
}

export const nap = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2).replace('.', ',')} m NAP`
