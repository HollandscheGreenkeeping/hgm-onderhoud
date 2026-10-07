import { useCallback, useEffect, useRef, useState } from 'react'
import {
  GeolocateControl, Map as MapLibreKaart, NavigationControl, ScaleControl, addProtocol, setWorkerUrl,
  type FilterSpecification, type GeoJSONSource,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre zoekt zijn worker naast zijn eigen bestand; Vite verplaatst dat. Daarom expliciet
// als gebundelde worker meegeven (werkt in dev én productie).
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { Point } from 'geojson'
import { useNavigate, useSearchParams } from 'react-router'
import { useLocatie } from '../lib/locatie'
import { grenzen, laadKaart, type KaartData, type Selectie } from '../kaart/data'
import {
  basisStijl, bronnen, categorieen, kaartLagen, klikbareLagen, legeBron, selectieLagen,
  statusFilterExpressie,
} from '../kaart/stijl'
import Laagpaneel, { standaardLagen, type HoogteStatus, type Laaginstellingen } from '../kaart/Laagpaneel'
import {
  bereikIn, bereikOpBaan, demBron, hoogtelijnen, hoogteOp, laadHoogte, nap, tekenHoogte, type Bereik, type Hoogtegrid,
} from '../kaart/hoogte'
import type { ImageSource } from 'maplibre-gl'
import Zoeken, { type Zoekresultaat } from '../kaart/Zoeken'
import DetailPaneel from '../kaart/DetailPaneel'
import PositieCorrectie, { type GpsPositie } from '../kaart/PositieCorrectie'
import TekenPaneel from '../kaart/TekenPaneel'
import StoringMelden, { type MeldDoel } from '../components/StoringMelden'
import StoringRij from '../components/StoringRij'
import { useStoringen, type Storing } from '../lib/storingen'
import { openStoringStatussen } from '../lib/teksten'

setWorkerUrl(workerUrl)

const opslagSleutel = 'hgm-lagen'

function bewaardeLagen(): Laaginstellingen {
  try {
    const l = JSON.parse(localStorage.getItem(opslagSleutel) ?? 'null')
    return l ? { ...standaardLagen, ...l } : standaardLagen
  } catch {
    return standaardLagen
  }
}

// Ruime tik-zone: de app wordt buiten en met handschoenen gebruikt.
const TIKMARGE = 14

export default function Kaart() {
  const { locatie, magRegistreren, magPlannen } = useLocatie()
  const container = useRef<HTMLDivElement>(null)
  const [kaart, setKaart] = useState<MapLibreKaart | null>(null)
  const [data, setData] = useState<KaartData | null>(null)
  const [lagen, setLagen] = useState<Laaginstellingen>(bewaardeLagen)
  const [laagpaneelOpen, setLaagpaneelOpen] = useState(false)
  const [selectie, setSelectie] = useState<Selectie | null>(null)
  const [correctie, setCorrectie] = useState<{ id: string; titel: string; start: [number, number] } | null>(null)
  const [gps, setGps] = useState<GpsPositie | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [melden, setMelden] = useState<MeldDoel | null>(null)
  const [kruis, setKruis] = useState<[number, number] | null>(null)
  const [tekenen, setTekenen] = useState(false)
  const geoRef = useRef<GeolocateControl | null>(null)
  // Tijdens corrigeren of melden selecteert een tik op de kaart niets.
  const bezigRef = useRef(false)
  bezigRef.current = Boolean(correctie || melden || tekenen)
  const navigeer = useNavigate()
  const { storingen, herlaad: herlaadStoringen } = useStoringen(locatie.id, 'alle')
  const [zijFilter, setZijFilter] = useState<'alle' | 'open' | 'in_behandeling' | 'opgelost'>('open')
  const [lijstOpen, setLijstOpen] = useState(false) // telefoon: storingenlijst omhoog geveegd
  const veegStart = useRef<number | null>(null)
  const [hoogteStatus, setHoogteStatus] = useState<HoogteStatus>({ status: 'uit' })
  const [hoogteHier, setHoogteHier] = useState<number | null>(null)
  const hoogteRef = useRef<{ grid: Hoogtegrid | null; aan: boolean; op: 'baan' | 'beeld' }>({ grid: null, aan: false, op: 'beeld' })
  hoogteRef.current.aan = lagen.hoogte

  // Kaart aanmaken
  useEffect(() => {
    if (!container.current) return
    const k = new MapLibreKaart({
      container: container.current,
      style: basisStijl,
      center: [5.3, 52.1],
      zoom: 7,
      maxZoom: 22,
      attributionControl: { compact: true },
    })
    k.addControl(new NavigationControl({ visualizePitch: true }), 'top-right')
    const geo = new GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showAccuracyCircle: true,
    })
    geo.on('geolocate', (e) =>
      setGps({ lonlat: [e.coords.longitude, e.coords.latitude], nauwkeurigheid: e.coords.accuracy }))
    k.addControl(geo, 'top-right')
    geoRef.current = geo
    k.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')

    k.on('load', () => {
      for (const b of bronnen) k.addSource(b, legeBron(b))
      k.addSource('holelabels', legeBron())
      for (const l of [...kaartLagen, ...selectieLagen]) k.addLayer(l)
      setKaart(k)
    })

    // Hoogte onder muis of vinger (alleen als de hoogtekaart aan staat).
    const meetHoogte = (e: { lngLat: { lng: number; lat: number } }) => {
      const g = hoogteRef.current.grid
      if (g && hoogteRef.current.aan) setHoogteHier(hoogteOp(g, e.lngLat.lng, e.lngLat.lat))
    }
    k.on('mousemove', meetHoogte)

    k.on('click', (e) => {
      meetHoogte(e)
      if (bezigRef.current) return
      const { x, y } = e.point
      const geraakt = k.queryRenderedFeatures(
        [[x - TIKMARGE, y - TIKMARGE], [x + TIKMARGE, y + TIKMARGE]],
        { layers: klikbareLagen.filter((l) => k.getLayer(l)) },
      )
      // Voorkeur: melding > object > leiding, en dan het dichtstbijzijnde.
      const f = klikbareLagen.map((l) => geraakt.find((g) => g.layer.id === l)).find(Boolean)
      if (!f) return setSelectie(null)
      setSelectie({ soort: f.properties.soort, id: f.properties.id })
      // Op een telefoon schuift het detailpaneel over de onderste helft: punt erboven houden.
      if (k.getContainer().clientWidth <= 700) {
        k.easeTo({ center: e.lngLat, padding: { bottom: k.getContainer().clientHeight * 0.55, top: 0, left: 0, right: 0 } })
      }
    })
    for (const l of klikbareLagen) {
      k.on('mouseenter', l, () => { k.getCanvas().style.cursor = 'pointer' })
      k.on('mouseleave', l, () => { k.getCanvas().style.cursor = '' })
    }
    return () => k.remove()
  }, [])

  const herlaad = useCallback(async (inzoomen = false) => {
    if (!kaart) return
    try {
      const d = await laadKaart(locatie.id)
      setData(d)
      setFout(null)
      for (const b of bronnen) (kaart.getSource(b) as GeoJSONSource).setData(d[b])
      ;(kaart.getSource('holelabels') as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: d.holes.features.flatMap((h) => {
          const g = grenzen([h])
          // Komt het nummer in meer lussen voor (bijv. een korte baan), dan de lus erbij.
          const dubbel = d.holes.features.filter((x) => x.properties?.nummer === h.properties?.nummer).length > 1
          const label = dubbel ? `Hole ${h.properties?.nummer} · ${h.properties?.lus}` : `Hole ${h.properties?.nummer}`
          return g ? [{ type: 'Feature' as const, properties: { ...h.properties, label }, geometry: { type: 'Point' as const,
            coordinates: [(g[0][0] + g[1][0]) / 2, (g[0][1] + g[1][1]) / 2] } }] : []
        }),
      })
      if (inzoomen) {
        // Clubadres meenemen: bij een (nog) bijna lege baan zoom je anders in op één vijver.
        const centrum = d.centrum ? [{ type: 'Feature' as const, properties: {}, geometry: d.centrum }] : []
        const g = d.holes.features.length
          ? grenzen([...d.holes.features, ...d.baanvlakken.features, ...d.objecten.features, ...d.leidingen.features])
          : grenzen([...centrum, ...d.baanvlakken.features, ...d.objecten.features, ...d.leidingen.features])
        if (g && (d.holes.features.length || g[0][0] !== g[1][0])) kaart.fitBounds(g, { padding: 60, maxZoom: 17, duration: 0 })
        else if (d.centrum) kaart.jumpTo({ center: d.centrum.coordinates as [number, number], zoom: 16 })
      }
    } catch {
      setFout('Kaartgegevens konden niet worden geladen.')
    }
  }, [kaart, locatie.id])

  useEffect(() => { herlaad(true) }, [herlaad])

  useEffect(() => {
    if (!melding) return
    const t = setTimeout(() => setMelding(null), 4000)
    return () => clearTimeout(t)
  }, [melding])

  // Link vanuit een andere pagina (?object=...): object selecteren en erheen.
  const [zoekParams, setZoekParams] = useSearchParams()
  useEffect(() => {
    const id = zoekParams.get('object')
    const f = id && data?.objecten.features.find((o) => o.properties?.id === id)
    if (!f || !kaart) return
    kaart.jumpTo({ center: (f.geometry as Point).coordinates as [number, number], zoom: 19 })
    setSelectie({ soort: 'object', id: id! })
    setZoekParams({}, { replace: true })
  }, [data, kaart, zoekParams, setZoekParams])

  // ?melding=... (melding op een plek) en ?melden=1 (vanuit de storingenlijst)
  useEffect(() => {
    if (!kaart || !data) return
    const id = zoekParams.get('melding')
    const f = id && data.meldingen.features.find((m) => m.properties?.id === id)
    if (f) {
      kaart.jumpTo({ center: (f.geometry as Point).coordinates as [number, number], zoom: 19 })
      setSelectie({ soort: 'melding', id: id! })
      setZoekParams({}, { replace: true })
    } else if (zoekParams.has('melden') && magRegistreren) {
      setMelden({ soort: 'plek' })
      setZoekParams({}, { replace: true })
    }
  }, [data, kaart, zoekParams, setZoekParams, magRegistreren])

  // Kruisje voor melden op een plek: midden van het deel van de kaart dat niet onder het paneel ligt.
  useEffect(() => {
    if (!kaart || melden?.soort !== 'plek') return setKruis(null)
    const bereken = () => {
      const { clientWidth: b, clientHeight: h } = kaart.getContainer()
      setKruis(b <= 700 ? [b / 2, h * 0.225] : [(b - Math.min(400, b)) / 2, h / 2])
    }
    bereken()
    kaart.on('resize', bereken)
    return () => { kaart.off('resize', bereken) }
  }, [kaart, melden])

  function naarGps() {
    if (!kaart || !kruis) return
    if (!gps) return geoRef.current?.trigger()
    const { clientWidth: b, clientHeight: h } = kaart.getContainer()
    kaart.easeTo({ center: gps.lonlat, zoom: Math.max(kaart.getZoom(), 19), offset: [kruis[0] - b / 2, kruis[1] - h / 2] })
  }

  const plekBijKruis = (): [number, number] | null => {
    if (!kaart || !kruis) return null
    const p = kaart.unproject(kruis)
    return [p.lng, p.lat]
  }

  // Lagen, filters en achtergrond toepassen
  useEffect(() => {
    try { localStorage.setItem(opslagSleutel, JSON.stringify(lagen)) } catch { /* privémodus */ }
    if (!kaart) return
    const zicht = (aan: boolean) => (aan ? 'visible' : 'none')
    kaart.setLayoutProperty('luchtfoto', 'visibility', zicht(lagen.achtergrond === 'luchtfoto'))
    kaart.setLayoutProperty('brt', 'visibility', zicht(lagen.achtergrond === 'brt'))
    for (const l of ['baanvlakken-vlak', 'baanvlakken-rand']) kaart.setLayoutProperty(l, 'visibility', zicht(lagen.baanvlakken))
    for (const l of ['holes-vlak', 'holes-rand', 'holes-label', 'speellijnen-lijn', 'speellijnen-lengte']) kaart.setLayoutProperty(l, 'visibility', zicht(lagen.holes))
    for (const l of ['meldingen-cirkel', 'meldingen-teken']) kaart.setLayoutProperty(l, 'visibility', zicht(lagen.meldingen))

    const cats = categorieen.filter((c) => lagen.categorieen[c])
    const basis = ['all', ['in', ['get', 'categorie'], ['literal', cats]], statusFilterExpressie(lagen.status)]
    kaart.setFilter('objecten-cirkel', basis as FilterSpecification)
    kaart.setFilter('objecten-label', basis as FilterSpecification)
    kaart.setFilter('leidingen-tekening', [...basis, ['==', ['get', 'nauwkeurigheid'], 'tekening']] as FilterSpecification)
    kaart.setFilter('leidingen-ingemeten', [...basis, ['!=', ['get', 'nauwkeurigheid'], 'tekening']] as FilterSpecification)
  }, [kaart, lagen])

  // Hoogtekaart en 3D-reliëf: het AHN eenmalig ophalen voor de hele baan, daarna alleen aan/uit.
  const hoogteNodig = lagen.hoogte || lagen.reliëf > 0
  useEffect(() => {
    if (!kaart) return
    if (kaart.getLayer('hoogte')) kaart.setLayoutProperty('hoogte', 'visibility', lagen.hoogte ? 'visible' : 'none')
    if (!lagen.hoogte) {
      for (const l of ['hoogtelijnen-lijn', 'hoogtelijnen-label']) if (kaart.getLayer(l)) kaart.setLayoutProperty(l, 'visibility', 'none')
      setHoogteHier(null)
    }
  }, [kaart, lagen.hoogte, hoogteStatus.status])

  useEffect(() => {
    if (!kaart || !data || !hoogteNodig) return
    if (kaart.getSource('hoogte') || hoogteStatus.status === 'laden') return
    const g = grenzen([...data.holes.features, ...data.baanvlakken.features, ...data.objecten.features, ...data.leidingen.features])
    const c = data.centrum?.coordinates
    const marge = 0.002 // ±150 m rond de baan
    const bbox: [number, number, number, number] | null = g
      ? [g[0][0] - marge, g[0][1] - marge, g[1][0] + marge, g[1][1] + marge]
      : c ? [c[0] - 0.008, c[1] - 0.005, c[0] + 0.008, c[1] + 0.005] : null
    if (!bbox) return
    setHoogteStatus({ status: 'laden' })
    laadHoogte(bbox).then((grid) => {
      hoogteRef.current.grid = grid
      const [w, z, o, n] = grid.bbox
      // Kleurbereik standaard op de holes: de lage polder eromheen telt dan niet mee.
      const vlakken = data.holes.features.length ? data.holes.features : data.baanvlakken.features
      const b = kaart.getBounds()
      const bereik = hoogteRef.current.op === 'beeld'
        ? bereikIn(grid, [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
        : bereikOpBaan(grid, vlakken)
      kaart.addSource('hoogte', { type: 'image', url: tekenHoogte(grid, bereik), coordinates: [[w, n], [o, n], [o, z], [w, z]] })
      kaart.addLayer({ id: 'hoogte', type: 'raster', source: 'hoogte', paint: { 'raster-opacity': 0.95, 'raster-resampling': 'linear' } }, 'baanvlakken-vlak')
      kaart.addSource('hoogtelijnen', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      kaart.addLayer({
        id: 'hoogtelijnen-lijn', type: 'line', source: 'hoogtelijnen',
        paint: {
          'line-color': '#1c2414',
          'line-width': ['case', ['get', 'hoofd'], 1.8, 0.8],
          'line-opacity': ['case', ['get', 'hoofd'], 0.85, 0.5],
        },
      }, 'baanvlakken-vlak')
      kaart.addLayer({
        id: 'hoogtelijnen-label', type: 'symbol', source: 'hoogtelijnen', minzoom: 17, filter: ['get', 'hoofd'],
        layout: { 'symbol-placement': 'line', 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Medium'], 'text-size': 12, 'symbol-spacing': 300 },
        paint: { 'text-color': '#1c2414', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
      }, 'baanvlakken-vlak')
      kaart.setLayoutProperty('hoogte', 'visibility', hoogteRef.current.aan ? 'visible' : 'none')
      kaart.addSource('ahn-dem', { type: 'raster-dem', tiles: [demBron(grid, addProtocol)], tileSize: 256, encoding: 'terrarium', maxzoom: 17 })
      setHoogteStatus({ status: 'klaar', ...bereik, op: hoogteRef.current.op })
    }).catch(() => setHoogteStatus({ status: 'fout' }))
  }, [kaart, data, hoogteNodig])

  // 3D-reliëf: MapLibre-terrein op de AHN-tegels. Bij aanzetten de kaart kantelen, anders zie je niets.
  useEffect(() => {
    if (!kaart || hoogteStatus.status !== 'klaar' || !kaart.getSource('ahn-dem')) return
    if (lagen.reliëf > 0) {
      kaart.setTerrain({ source: 'ahn-dem', exaggeration: lagen.reliëf })
      if (kaart.getPitch() < 20) kaart.easeTo({ pitch: 55, duration: 800 })
    } else if (kaart.getTerrain()) {
      kaart.setTerrain(null)
      kaart.easeTo({ pitch: 0, duration: 600 })
    }
  }, [kaart, hoogteStatus.status, lagen.reliëf])

  // Kleuren opnieuw afstemmen: op de holes, of op wat nu in beeld is (bijv. één green).
  function afstemmen(op: 'baan' | 'beeld') {
    const grid = hoogteRef.current.grid
    if (!grid || !kaart || !data) return
    const b = kaart.getBounds()
    const bereik: Bereik = op === 'beeld'
      ? bereikIn(grid, [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
      : bereikOpBaan(grid, data.holes.features.length ? data.holes.features : data.baanvlakken.features)
    const [w, z, o, n] = grid.bbox
    ;(kaart.getSource('hoogte') as ImageSource).updateImage({ url: tekenHoogte(grid, bereik), coordinates: [[w, n], [o, n], [o, z], [w, z]] })
    hoogteRef.current.op = op
    setHoogteStatus({ status: 'klaar', ...bereik, op })
  }
  const afstemmenRef = useRef(afstemmen)
  afstemmenRef.current = afstemmen

  // Standaard volgen de kleuren het beeld: na schuiven of zoomen opnieuw afstemmen,
  // zodat ook kleine verschillen (een green, een bunkerrand) duidelijk worden.
  useEffect(() => {
    if (!kaart) return
    let wacht: ReturnType<typeof setTimeout> | undefined
    const bijBeweging = () => {
      clearTimeout(wacht)
      wacht = setTimeout(() => {
        const h = hoogteRef.current
        if (h.grid && h.aan && h.op === 'beeld' && kaart.getSource('hoogte')) afstemmenRef.current('beeld')
      }, 250)
    }
    kaart.on('moveend', bijBeweging)
    return () => { clearTimeout(wacht); kaart.off('moveend', bijBeweging) }
  }, [kaart])

  // Hoogtelijnen per gekozen interval (berekend in de browser, per interval onthouden).
  const lijnenCache = useRef(new Map<number, ReturnType<typeof hoogtelijnen>>())
  useEffect(() => {
    if (!kaart || hoogteStatus.status !== 'klaar' || !hoogteRef.current.grid) return
    const aan = lagen.hoogte && lagen.hoogtelijnen > 0
    for (const l of ['hoogtelijnen-lijn', 'hoogtelijnen-label']) kaart.setLayoutProperty(l, 'visibility', aan ? 'visible' : 'none')
    if (!aan) return
    let lijnen = lijnenCache.current.get(lagen.hoogtelijnen)
    if (!lijnen) {
      lijnen = hoogtelijnen(hoogteRef.current.grid, lagen.hoogtelijnen)
      lijnenCache.current.set(lagen.hoogtelijnen, lijnen)
    }
    ;(kaart.getSource('hoogtelijnen') as GeoJSONSource).setData(lijnen)
  }, [kaart, hoogteStatus.status, lagen.hoogte, lagen.hoogtelijnen])

  // Selectie accentueren
  useEffect(() => {
    if (!kaart) return
    kaart.setFilter('selectie-punt', ['==', ['get', 'id'], selectie?.soort === 'object' ? selectie.id : ''])
    kaart.setFilter('selectie-lijn', ['==', ['get', 'id'], selectie?.soort === 'leiding' ? selectie.id : ''])
  }, [kaart, selectie])

  function kiesZoekresultaat(r: Zoekresultaat) {
    if (!kaart) return
    if (r.soort === 'hole') {
      const g = grenzen([r.feature])
      if (g) kaart.fitBounds(g, { padding: 40 })
      return
    }
    const c = (r.feature.geometry as Point).coordinates as [number, number]
    kaart.flyTo({ center: c, zoom: Math.max(kaart.getZoom(), 19) })
    setSelectie({ soort: 'object', id: r.feature.properties!.id })
  }

  // ── Storingenlijst naast de kaart ──
  const zichtbareStoringen = (storingen ?? []).filter((s) =>
    zijFilter === 'alle' ? true
      : zijFilter === 'open' ? ['gemeld', 'toegewezen'].includes(s.status)
      : zijFilter === 'in_behandeling' ? s.status === 'in_behandeling'
      : ['opgelost', 'gecontroleerd'].includes(s.status))
  const aantalOpen = (storingen ?? []).filter((s) => openStoringStatussen.includes(s.status)).length
  const aantalOpgelost = (storingen ?? []).filter((s) => !openStoringStatussen.includes(s.status)).length

  // Waar staat deze storing op de kaart? Object, losse melding of leiding.
  function storingOpKaart(s: Storing) {
    if (!data) return null
    if (s.object_id) {
      const f = data.objecten.features.find((o) => o.properties?.id === s.object_id)
      return f && { bron: 'objecten', id: s.object_id, soort: 'object' as const, f }
    }
    if (s.leiding_id) {
      const f = data.leidingen.features.find((o) => o.properties?.id === s.leiding_id)
      return f && { bron: 'leidingen', id: s.leiding_id, soort: 'leiding' as const, f }
    }
    const f = data.meldingen.features.find((o) => o.properties?.id === s.id)
    return f && { bron: 'meldingen', id: s.id, soort: 'melding' as const, f }
  }

  function toonStoring(s: Storing) {
    const plek = storingOpKaart(s)
    if (!plek || !kaart) return navigeer(`/locatie/${locatie.id}/storingen/${s.id}`)
    if (plek.soort === 'leiding') {
      const g = grenzen([plek.f])
      if (g) kaart.fitBounds(g, { padding: 80, maxZoom: 19 })
    } else {
      kaart.flyTo({ center: (plek.f.geometry as Point).coordinates as [number, number], zoom: Math.max(kaart.getZoom(), 19) })
    }
    setSelectie({ soort: plek.soort, id: plek.id })
  }

  function oplichten(s: Storing, aan: boolean) {
    const plek = storingOpKaart(s)
    if (plek && kaart) kaart.setFeatureState({ source: plek.bron, id: plek.id }, { hover: aan })
  }

  function startCorrectie() {
    if (selectie?.soort !== 'object' || !data) return
    const f = data.objecten.features.find((o) => o.properties?.id === selectie.id)
    if (!f) return
    setCorrectie({
      id: selectie.id,
      titel: [f.properties?.type, f.properties?.code].filter(Boolean).join(' '),
      start: (f.geometry as Point).coordinates as [number, number],
    })
  }

  return (
    <div className="kaart-indeling">
    <div className="kaart-scherm">
      <div ref={container} className="kaartvlak" />

      <div className="kaart-boven">
        <button className="knop kaartknop" onClick={() => setLaagpaneelOpen((o) => !o)}>Lagen</button>
        <Zoeken data={data} kies={kiesZoekresultaat} />
        {magPlannen && !tekenen && (
          <button className="knop kaartknop tweede" onClick={() => {
            setSelectie(null); setMelden(null); setCorrectie(null); setLaagpaneelOpen(false); setTekenen(true)
          }}>Tekenen</button>
        )}
      </div>

      {kaart && data && tekenen && (
        <TekenPaneel kaart={kaart} data={data} locatieId={locatie.id}
                     klaar={(m) => { setMelding(m); herlaad() }} sluit={() => setTekenen(false)} />
      )}

      {laagpaneelOpen && <Laagpaneel lagen={lagen} wijzig={setLagen} sluit={() => setLaagpaneelOpen(false)} hoogte={hoogteStatus} afstemmen={afstemmen} />}

      {lagen.hoogte && hoogteStatus.status === 'klaar' && (
        <div className="hoogte-uitlezing mono" aria-live="polite">
          {hoogteHier != null ? nap(hoogteHier) : 'Beweeg of tik voor hoogte'}
        </div>
      )}

      {(fout || melding) && (
        <div className={`kaart-melding melding ${fout ? 'fout' : 'info'}`} onClick={() => setMelding(null)}>
          {fout ?? melding}
        </div>
      )}

      {data && !data.objecten.features.length && !data.holes.features.length && !data.baanvlakken.features.length && (
        <div className="kaart-melding melding info">
          Er is voor deze baan nog niets ingetekend.{magPlannen ? ' Gebruik de knop Tekenen (of QGIS).' : ''}
        </div>
      )}

      {kaart && correctie && (
        <PositieCorrectie
          kaart={kaart} objectId={correctie.id} titel={correctie.titel} start={correctie.start} gps={gps}
          annuleer={() => setCorrectie(null)}
          klaar={(m) => { setCorrectie(null); setMelding(m); herlaad() }}
        />
      )}
      {selectie && !correctie && !melden && !tekenen && (
        <DetailPaneel selectie={selectie} sluit={() => setSelectie(null)} corrigeerPositie={startCorrectie}
                      meldStoring={(d) => { setSelectie(null); setMelden(d) }} />
      )}

      {kruis && (
        <>
          <div className="kruis" style={{ left: kruis[0], top: kruis[1] }} aria-hidden="true" />
          <button className="knop kaartknop gps-knop" style={{ left: kruis[0], top: kruis[1] + 40 }} onClick={naarGps}>
            {gps ? `Naar mijn GPS (±${Math.round(gps.nauwkeurigheid)} m)` : 'GPS aanzetten'}
          </button>
        </>
      )}
      {melden && (
        <aside className="paneel detailpaneel" aria-label="Storing melden">
          <StoringMelden
            doel={melden} plek={plekBijKruis}
            annuleer={() => setMelden(null)}
            klaar={() => { setMelden(null); setMelding('Storing gemeld.'); herlaad(); herlaadStoringen() }}
          />
        </aside>
      )}
      {magRegistreren && !melden && !correctie && !selectie && !tekenen && (
        <button className="knop meldknop" onClick={() => { setLaagpaneelOpen(false); setMelden({ soort: 'plek' }) }}>
          + Storing melden
        </button>
      )}
    </div>

    <aside className={`zijlijst geen-print ${lijstOpen ? 'open' : ''} ${melden || selectie || correctie || tekenen ? 'bezig' : ''}`}
           aria-label="Storingen">
      {/* Telefoon: onderpaneel met greep; tik of veeg omhoog/omlaag */}
      <button type="button" className="zijlijst-greep" aria-expanded={lijstOpen} onClick={() => setLijstOpen((o) => !o)}
              onTouchStart={(e) => { veegStart.current = e.touches[0].clientY }}
              onTouchEnd={(e) => {
                const dy = e.changedTouches[0].clientY - (veegStart.current ?? e.changedTouches[0].clientY)
                if (Math.abs(dy) > 30) { e.preventDefault(); setLijstOpen(dy < 0) }
                veegStart.current = null
              }}>
        Storingen · {aantalOpen} open
      </button>
      <div className="zijlijst-kop">
        <h2>Storingen <small>{aantalOpen} open · {aantalOpgelost} opgelost</small></h2>
        <div className="schakelaar filterbalk">
          {([['open', 'Storing'], ['in_behandeling', 'In behandeling'], ['opgelost', 'Opgelost'], ['alle', 'Alles']] as const).map(([w, n]) => (
            <button key={w} className={`knop ${zijFilter === w ? '' : 'tweede'}`} onClick={() => setZijFilter(w)}>{n}</button>
          ))}
        </div>
      </div>
      <div className="zijlijst-rijen">
        {storingen && zichtbareStoringen.length === 0 && <p className="zacht">Geen storingen.</p>}
        {zichtbareStoringen.map((s) => (
          <StoringRij key={s.id} storing={s} kies={() => { setLijstOpen(false); toonStoring(s) }} hover={(aan) => oplichten(s, aan)} />
        ))}
      </div>
      {magRegistreren && (
        <div className="zijlijst-voet">
          <button className="knop melden" disabled={Boolean(melden)}
                  onClick={() => { setSelectie(null); setLaagpaneelOpen(false); setMelden({ soort: 'plek' }) }}>
            + Storing melden
          </button>
        </div>
      )}
    </aside>
    </div>
  )
}
