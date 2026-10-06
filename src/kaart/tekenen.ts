// Tekengereedschap op de kaart: een punt, lijn of vlak tekenen en aanpassen.
// Tik op de kaart = punt erbij. Punt slepen = verplaatsen. Tik op een rondje halverwege twee punten
// = punt ertussen. Tik op een punt = kiezen (om te verwijderen). Werkt met muis en vinger.

import { LngLat, type GeoJSONSource, type Map as Kaart, type MapMouseEvent, type MapTouchEvent } from 'maplibre-gl'
import type { Feature, FeatureCollection, Geometry } from 'geojson'

export type Vorm = 'punt' | 'lijn' | 'vlak'
export type Coord = [number, number]
export type TekenStand = { punten: Coord[]; gekozen: number | null; kanOngedaan: boolean }

const BRON = 'teken'
const RAAK = 16 // px rond een punt dat nog als 'raak' telt (vinger, handschoen)
const leeg: FeatureCollection = { type: 'FeatureCollection', features: [] }

export class Tekenaar {
  private punten: Coord[]
  private gekozen: number | null = null
  private historie: Coord[][] = []
  private sleept: number | null = null
  private netGesleept = false

  constructor(
    private kaart: Kaart,
    private vorm: Vorm,
    start: Coord[],
    private bijWijziging: (s: TekenStand) => void,
  ) {
    this.punten = start.map(([x, y]) => [x, y])
    if (!kaart.getSource(BRON)) kaart.addSource(BRON, { type: 'geojson', data: leeg })
    const lagen: Parameters<Kaart['addLayer']>[0][] = [
      { id: 'teken-vlak', type: 'fill', source: BRON, filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#ffeb3b', 'fill-opacity': 0.25 } },
      { id: 'teken-lijn-rand', type: 'line', source: BRON, filter: ['!=', ['geometry-type'], 'Point'],
        paint: { 'line-color': '#1c2414', 'line-width': 6, 'line-opacity': 0.6 } },
      { id: 'teken-lijn', type: 'line', source: BRON, filter: ['!=', ['geometry-type'], 'Point'],
        paint: { 'line-color': '#ffeb3b', 'line-width': 3 } },
      { id: 'teken-midden', type: 'circle', source: BRON, filter: ['==', ['get', 'soort'], 'midden'],
        paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-opacity': 0.75, 'circle-stroke-color': '#1c2414', 'circle-stroke-width': 1.5 } },
      { id: 'teken-punt', type: 'circle', source: BRON, filter: ['==', ['get', 'soort'], 'punt'],
        paint: {
          'circle-radius': 9,
          'circle-color': ['case', ['get', 'gekozen'], '#fb8c00', '#ffffff'],
          'circle-stroke-color': '#1c2414', 'circle-stroke-width': 3,
        } },
    ]
    for (const l of lagen) if (!kaart.getLayer(l.id)) kaart.addLayer(l)
    kaart.doubleClickZoom.disable()
    kaart.on('click', this.klik)
    kaart.on('mousedown', this.neer)
    kaart.on('touchstart', this.neer)
    kaart.on('mousemove', this.zweef)
    this.teken()
  }

  opruimen() {
    const k = this.kaart
    k.off('click', this.klik)
    k.off('mousedown', this.neer)
    k.off('touchstart', this.neer)
    k.off('mousemove', this.zweef)
    this.stopSlepen()
    k.doubleClickZoom.enable()
    k.getCanvas().style.cursor = ''
    for (const l of ['teken-punt', 'teken-midden', 'teken-lijn', 'teken-lijn-rand', 'teken-vlak']) if (k.getLayer(l)) k.removeLayer(l)
    if (k.getSource(BRON)) k.removeSource(BRON)
  }

  ongedaan() {
    const vorige = this.historie.pop()
    if (!vorige) return
    this.punten = vorige
    this.gekozen = null
    this.teken()
  }

  verwijderGekozen() {
    if (this.gekozen == null) return
    this.bewaar()
    this.punten.splice(this.gekozen, 1)
    this.gekozen = null
    this.teken()
  }

  // ── Interactie ──

  private raak(e: { point: { x: number; y: number } }, laag: string): number | null {
    const { x, y } = e.point
    if (!this.kaart.getLayer(laag)) return null
    const f = this.kaart.queryRenderedFeatures([[x - RAAK, y - RAAK], [x + RAAK, y + RAAK]], { layers: [laag] })
    if (!f.length) return null
    // Dichtstbijzijnde nemen als er meer binnen bereik liggen.
    let beste: number | null = null, min = Infinity
    for (const g of f) {
      const i = g.properties.i as number
      const p = this.kaart.project(g.geometry.type === 'Point' ? (g.geometry.coordinates as Coord) : this.punten[i])
      const d = (p.x - x) ** 2 + (p.y - y) ** 2
      if (d < min) { min = d; beste = i }
    }
    return beste
  }

  private klik = (e: MapMouseEvent) => {
    if (this.netGesleept) { this.netGesleept = false; return }
    const p: Coord = [e.lngLat.lng, e.lngLat.lat]
    const punt = this.raak(e, 'teken-punt')
    if (punt != null) {
      this.gekozen = this.gekozen === punt ? null : punt
      return this.teken()
    }
    const midden = this.raak(e, 'teken-midden')
    if (midden != null) {
      this.bewaar()
      this.punten.splice(midden + 1, 0, this.middenVan(midden))
      this.gekozen = midden + 1
      return this.teken()
    }
    this.bewaar()
    if (this.vorm === 'punt') this.punten = [p]
    else this.punten.push(p)
    this.gekozen = null
    this.teken()
  }

  private neer = (e: MapMouseEvent | MapTouchEvent) => {
    if ('points' in e && e.points.length !== 1) return
    const i = this.raak(e, 'teken-punt')
    if (i == null) return
    e.preventDefault() // kaart niet laten schuiven
    this.bewaar()
    this.sleept = i
    this.kaart.on('mousemove', this.sleep)
    this.kaart.on('touchmove', this.sleep)
    this.kaart.once('mouseup', this.stopSlepen)
    this.kaart.once('touchend', this.stopSlepen)
  }

  private sleep = (e: MapMouseEvent | MapTouchEvent) => {
    if (this.sleept == null) return
    e.preventDefault()
    this.punten[this.sleept] = [e.lngLat.lng, e.lngLat.lat]
    this.netGesleept = true
    this.teken()
  }

  private stopSlepen = () => {
    this.kaart.off('mousemove', this.sleep)
    this.kaart.off('touchmove', this.sleep)
    // Slepen zonder beweging telt als gewone tik (punt kiezen).
    if (this.sleept != null && !this.netGesleept) this.historie.pop()
    this.sleept = null
    // De click na het loslaten hoort nog bij het slepen; daarna weer gewoon.
    setTimeout(() => { this.netGesleept = false }, 0)
  }

  private zweef = (e: MapMouseEvent) => {
    if (this.sleept != null) return
    const c = this.kaart.getCanvas()
    c.style.cursor = this.raak(e, 'teken-punt') != null ? 'move' : this.raak(e, 'teken-midden') != null ? 'copy' : 'crosshair'
  }

  // ── Intern ──

  private bewaar() {
    this.historie.push(this.punten.map(([x, y]) => [x, y]))
    if (this.historie.length > 100) this.historie.shift()
  }

  private middenVan(i: number): Coord {
    const a = this.punten[i], b = this.punten[(i + 1) % this.punten.length]
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  }

  private teken() {
    const n = this.punten.length
    const features: Feature<Geometry>[] = []
    if (this.vorm === 'vlak' && n >= 3) {
      features.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...this.punten, this.punten[0]]] } })
    } else if (this.vorm !== 'punt' && n >= 2) {
      features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: this.punten } })
    }
    if (this.vorm !== 'punt') {
      const segmenten = this.vorm === 'vlak' && n >= 3 ? n : n - 1
      for (let i = 0; i < segmenten; i++) {
        features.push({ type: 'Feature', properties: { soort: 'midden', i }, geometry: { type: 'Point', coordinates: this.middenVan(i) } })
      }
    }
    this.punten.forEach((p, i) => features.push({
      type: 'Feature', properties: { soort: 'punt', i, gekozen: i === this.gekozen }, geometry: { type: 'Point', coordinates: p },
    }))
    ;(this.kaart.getSource(BRON) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features })
    this.bijWijziging({ punten: this.punten.map(([x, y]) => [x, y]), gekozen: this.gekozen, kanOngedaan: this.historie.length > 0 })
  }
}

// ── Maten en omzetten ──

export function lengteM(punten: Coord[], gesloten = false): number {
  let som = 0
  const n = punten.length
  for (let i = 0; i < (gesloten ? n : n - 1); i++) {
    const a = punten[i], b = punten[(i + 1) % n]
    som += new LngLat(a[0], a[1]).distanceTo(new LngLat(b[0], b[1]))
  }
  return som
}

// Oppervlakte in m² (lokaal plat gerekend; ruim nauwkeurig genoeg voor een golfbaan).
export function oppervlakteM2(punten: Coord[]): number {
  if (punten.length < 3) return 0
  const lat0 = (punten.reduce((s, p) => s + p[1], 0) / punten.length) * Math.PI / 180
  const mx = 111320 * Math.cos(lat0), my = 110540
  let som = 0
  for (let i = 0; i < punten.length; i++) {
    const [x1, y1] = punten[i], [x2, y2] = punten[(i + 1) % punten.length]
    som += x1 * mx * (y2 * my) - x2 * mx * (y1 * my)
  }
  return Math.abs(som) / 2
}

export function middelpunt(punten: Coord[]): Coord {
  return [punten.reduce((s, p) => s + p[0], 0) / punten.length, punten.reduce((s, p) => s + p[1], 0) / punten.length]
}

export function puntInVlak([x, y]: Coord, geom: Geometry): boolean {
  const ringIn = (ring: number[][]) => {
    let binnen = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j]
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) binnen = !binnen
    }
    return binnen
  }
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : []
  return polys.some((p) => ringIn(p[0]) && !p.slice(1).some(ringIn))
}

const xy = (p: number[]) => `${p[0]} ${p[1]}`
export const lijnEwkt = (punten: Coord[]) => `SRID=4326;LINESTRING(${punten.map(xy).join(',')})`
// Multipolygoon; 'overig' zijn de delen die niet bewerkt zijn (bij een vlak uit meer stukken).
export function vlakEwkt(buitenrand: Coord[], binnenringen: number[][][] = [], overig: number[][][][] = []): string {
  const ring = (r: number[][]) => `(${r.map(xy).join(',')})`
  const sluit = (r: number[][]) => (r.length && (r[0][0] !== r.at(-1)![0] || r[0][1] !== r.at(-1)![1]) ? [...r, r[0]] : r)
  const delen = [[sluit(buitenrand), ...binnenringen], ...overig]
  return `SRID=4326;MULTIPOLYGON(${delen.map((d) => `(${d.map((r) => ring(sluit(r))).join(',')})`).join(',')})`
}
