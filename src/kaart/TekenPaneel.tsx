import { useEffect, useRef, useState } from 'react'
import type { Map as Kaart, MapMouseEvent } from 'maplibre-gl'
import type { Feature, Geometry } from 'geojson'
import { supabase } from '../lib/supabase'
import { useBaan, vlaktypes } from '../lib/baan'
import type { KaartData } from './data'
import { puntEwkt } from './data'
import {
  Tekenaar, lengteM, lijnEwkt, middelpunt, oppervlakteM2, puntInVlak, vlakEwkt, type Coord, type TekenStand, type Vorm,
} from './tekenen'

type Soort = 'baanvlak' | 'holevlak' | 'speellijn' | 'leiding' | 'object'

const soorten: { soort: Soort; naam: string; uitleg: string; vorm: Vorm }[] = [
  { soort: 'speellijn', naam: 'Speellijn van een hole', uitleg: 'Van tee naar green, met een knik bij een dogleg', vorm: 'lijn' },
  { soort: 'holevlak', naam: 'Omtrek van een hole', uitleg: 'Het hele speelgebied van de hole', vorm: 'vlak' },
  { soort: 'baanvlak', naam: 'Baanvlak', uitleg: 'Green, tee, fairway, bunker, water of rough', vorm: 'vlak' },
  { soort: 'leiding', naam: 'Leiding of kabel', uitleg: 'Beregening, drainage of kabel', vorm: 'lijn' },
  { soort: 'object', naam: 'Object', uitleg: 'Sproeier, put, kast, klep…', vorm: 'punt' },
]
const vormVan = (s: Soort) => soorten.find((x) => x.soort === s)!.vorm

const leidingtypes = [['beregening', 'Beregening'], ['drainage', 'Drainage'], ['kabel', 'Kabel']] as const
const nauwkeurigheden = [
  ['tekening', 'Overgetrokken van tekening of luchtfoto'],
  ['veld_gecontroleerd', 'In het veld gecontroleerd'],
  ['rtk_gps', 'Ingemeten met RTK-GPS'],
] as const

type Objecttype = { id: string; naam: string; locatie_ids: string[] | null }

// Wat er getekend wordt, met de eigenschappen die erbij horen.
type Werk = {
  soort: Soort
  id?: string                     // bestaand record (aanpassen) of leeg (nieuw)
  holeId?: string                 // voor speellijn / holevlak, of baanvlak/object bij een hole
  type?: string                   // baanvlak- of leidingtype
  naam?: string
  nauwkeurigheid?: string
  materiaal?: string
  diameter?: string
  objecttypeId?: string
  code?: string
  binnenringen?: number[][][]     // eilanden in een vlak blijven bewaard
  overig?: number[][][][]         // overige delen van een vlak uit meer stukken
  start: Coord[]
}

// Bestaande geometrie omzetten naar bewerkbare punten (bij een multipolygoon: het grootste deel).
function naarPunten(g: Geometry): Pick<Werk, 'start' | 'binnenringen' | 'overig'> {
  const open = (r: number[][]) => r.slice(0, -1).map(([x, y]) => [x, y] as Coord)
  if (g.type === 'Point') return { start: [g.coordinates as Coord] }
  if (g.type === 'LineString') return { start: g.coordinates.map(([x, y]) => [x, y] as Coord) }
  const delen = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
  if (!delen.length) return { start: [] }
  const grootste = delen.reduce((b, d) => (oppervlakteM2(open(d[0])) > oppervlakteM2(open(b[0])) ? d : b))
  return { start: open(grootste[0]), binnenringen: grootste.slice(1), overig: delen.filter((d) => d !== grootste) }
}

const oppTekst = (m2: number) => (m2 >= 10000 ? `${(m2 / 10000).toFixed(2).replace('.', ',')} ha` : `${Math.round(m2)} m²`)

export default function TekenPaneel({ kaart, data, locatieId, klaar, sluit }: {
  kaart: Kaart
  data: KaartData
  locatieId: string
  klaar: (melding: string) => void
  sluit: () => void
}) {
  const { holes } = useBaan(locatieId)
  const [objecttypes, setObjecttypes] = useState<Objecttype[]>([])
  const [werk, setWerk] = useState<Werk | null>(null)
  const [stand, setStand] = useState<TekenStand>({ punten: [], gekozen: null, kanOngedaan: false })
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [zeker, setZeker] = useState(false)
  const tekenaar = useRef<Tekenaar | null>(null)

  useEffect(() => {
    supabase.from('objecttypes').select('id, naam, locatie_ids').eq('gearchiveerd', false).eq('geometrietype', 'punt').order('volgorde')
      .then(({ data: d }) => setObjecttypes((d ?? []).filter((t) => !t.locatie_ids || t.locatie_ids.includes(locatieId))))
  }, [locatieId])

  // Tekenaar aan zolang er iets getekend wordt. Alleen opnieuw bij een ander doel (niet bij elke eigenschap).
  const sleutel = werk ? `${werk.soort}:${werk.id ?? ''}:${werk.holeId ?? ''}:${werk.start.length}` : ''
  useEffect(() => {
    if (!werk || ((werk.soort === 'speellijn' || werk.soort === 'holevlak') && !werk.holeId)) {
      setStand({ punten: [], gekozen: null, kanOngedaan: false })
      return
    }
    const t = new Tekenaar(kaart, vormVan(werk.soort), werk.start, setStand)
    tekenaar.current = t
    setZeker(false)
    return () => { t.opruimen(); tekenaar.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kaart, sleutel])

  // Nog niets gekozen: tik op de kaart op iets bestaands om het aan te passen.
  useEffect(() => {
    if (werk) return
    const lagen = ['objecten-cirkel', 'leidingen-ingemeten', 'leidingen-tekening', 'speellijnen-lijn', 'baanvlakken-vlak', 'holes-vlak']
    const klik = (e: MapMouseEvent) => {
      const { x, y } = e.point
      const geraakt = kaart.queryRenderedFeatures([[x - 12, y - 12], [x + 12, y + 12]], { layers: lagen.filter((l) => kaart.getLayer(l)) })
      const f = lagen.map((l) => geraakt.find((g) => g.layer.id === l)).find(Boolean)
      if (!f) return
      const id = f.properties.id as string
      const bron = (lijst: Feature[]) => lijst.find((x) => x.properties?.id === id)
      switch (f.layer.id) {
        case 'objecten-cirkel': {
          const o = bron(data.objecten.features)
          if (o) setWerk({ soort: 'object', id, ...naarPunten(o.geometry) })
          break
        }
        case 'leidingen-ingemeten': case 'leidingen-tekening': {
          const l = bron(data.leidingen.features)
          if (l) setWerk({
            soort: 'leiding', id, type: l.properties?.categorie, nauwkeurigheid: l.properties?.nauwkeurigheid,
            materiaal: l.properties?.materiaal ?? '', diameter: l.properties?.diameter_mm?.toString() ?? '', ...naarPunten(l.geometry),
          })
          break
        }
        case 'speellijnen-lijn': {
          const s = bron(data.speellijnen.features)
          if (s) setWerk({ soort: 'speellijn', id, holeId: id, ...naarPunten(s.geometry) })
          break
        }
        case 'baanvlakken-vlak': {
          const b = bron(data.baanvlakken.features)
          if (b) setWerk({ soort: 'baanvlak', id, type: b.properties?.type, holeId: b.properties?.hole_id ?? '', naam: b.properties?.naam ?? '', ...naarPunten(b.geometry) })
          break
        }
        case 'holes-vlak': {
          const h = bron(data.holes.features)
          if (h) setWerk({ soort: 'holevlak', id, holeId: id, ...naarPunten(h.geometry) })
          break
        }
      }
    }
    kaart.on('click', klik)
    return () => { kaart.off('click', klik) }
  }, [kaart, data, werk])

  const zet = (deel: Partial<Werk>) => setWerk((w) => (w ? { ...w, ...deel } : w))

  // Hole gekozen voor speellijn/omtrek: bestaande vorm laden zodat je die aanpast in plaats van overtekent.
  function kiesHole(holeId: string) {
    if (!werk) return
    const bron = werk.soort === 'speellijn' ? data.speellijnen : data.holes
    const f = bron.features.find((x) => x.properties?.id === holeId)
    setWerk({ soort: werk.soort, holeId, id: f ? holeId : undefined, ...(f ? naarPunten(f.geometry) : { start: [] }) })
  }

  function begin(soort: Soort) {
    setFout(null)
    setWerk({
      soort, start: [],
      type: soort === 'baanvlak' ? 'green' : soort === 'leiding' ? 'beregening' : undefined,
      nauwkeurigheid: soort === 'leiding' ? 'tekening' : undefined,
      holeId: '', objecttypeId: objecttypes[0]?.id,
    })
  }

  // Bij een vlak of object zonder gekozen hole: de hole waar het in ligt.
  function holeBij(punten: Coord[]): string | null {
    const m = middelpunt(punten)
    return (data.holes.features.find((h) => puntInVlak(m, h.geometry))?.properties?.id as string | undefined) ?? null
  }

  const vorm = werk ? vormVan(werk.soort) : 'punt'
  const n = stand.punten.length
  const genoeg = vorm === 'punt' ? n === 1 : vorm === 'lijn' ? n >= 2 : n >= 3
  const holeNodig = werk && (werk.soort === 'speellijn' || werk.soort === 'holevlak')

  async function opslaan() {
    if (!werk || !genoeg) return
    setBezig(true)
    setFout(null)
    const p = stand.punten
    const geom = vorm === 'punt' ? puntEwkt(p[0]) : vorm === 'lijn' ? lijnEwkt(p) : vlakEwkt(p, werk.binnenringen, werk.overig)
    const holeId = werk.holeId || (vorm !== 'lijn' ? holeBij(p) : null)
    let antwoord
    switch (werk.soort) {
      case 'speellijn':
        antwoord = await supabase.from('holes').update({ speellijn: geom }).eq('id', werk.holeId!)
        break
      case 'holevlak':
        antwoord = await supabase.from('holes').update({ geom }).eq('id', werk.holeId!)
        break
      case 'baanvlak': {
        const rij = { type: werk.type, hole_id: holeId, naam: werk.naam || null, geom }
        antwoord = werk.id
          ? await supabase.from('baanvlakken').update(rij).eq('id', werk.id)
          : await supabase.from('baanvlakken').insert({ ...rij, locatie_id: locatieId })
        break
      }
      case 'leiding': {
        const rij = {
          type: werk.type, nauwkeurigheid: werk.nauwkeurigheid, materiaal: werk.materiaal || null,
          diameter_mm: werk.diameter ? Number(werk.diameter) : null, geom,
        }
        antwoord = werk.id
          ? await supabase.from('leidingen').update(rij).eq('id', werk.id)
          : await supabase.from('leidingen').insert({ ...rij, locatie_id: locatieId })
        break
      }
      case 'object':
        antwoord = werk.id
          ? await supabase.from('objecten').update({ geom }).eq('id', werk.id)
          : await supabase.from('objecten').insert({
              locatie_id: locatieId, objecttype_id: werk.objecttypeId, code: werk.code || null, hole_id: holeId, geom,
            })
        break
    }
    setBezig(false)
    if (antwoord?.error) {
      return setFout(antwoord.error.code === '23505' ? 'Deze code bestaat al op deze baan.' : 'Opslaan mislukt. Probeer het opnieuw.')
    }
    setWerk(null)
    klaar('Opgeslagen.')
  }

  // Weghalen: baanvlakken, leidingen en objecten worden gearchiveerd; bij een hole alleen de vorm gewist.
  async function weghalen() {
    if (!werk?.id) return
    if (!zeker) return setZeker(true)
    setBezig(true)
    const nu = new Date().toISOString()
    const antwoord =
      werk.soort === 'speellijn' ? await supabase.from('holes').update({ speellijn: null }).eq('id', werk.id)
      : werk.soort === 'holevlak' ? await supabase.from('holes').update({ geom: null }).eq('id', werk.id)
      : await supabase.from(werk.soort === 'baanvlak' ? 'baanvlakken' : werk.soort === 'leiding' ? 'leidingen' : 'objecten')
          .update({ gearchiveerd_op: nu }).eq('id', werk.id)
    setBezig(false)
    if (antwoord.error) return setFout('Weghalen mislukt.')
    setWerk(null)
    klaar(werk.soort === 'speellijn' || werk.soort === 'holevlak' ? 'Vorm gewist.' : 'Gearchiveerd (niet verwijderd).')
  }

  const holeNaam = (id: string) => {
    const h = holes.find((x) => x.id === id)
    return h ? `Hole ${h.nummer} · ${h.lus}` : ''
  }
  const titel = werk
    ? `${werk.id ? 'Aanpassen' : 'Nieuw'}: ${soorten.find((s) => s.soort === werk.soort)!.naam.toLowerCase()}`
    : 'Tekenen'

  return (
    <aside className="paneel detailpaneel tekenpaneel" aria-label="Tekenen">
      <div className="paneel-kop">
        <strong>{titel}</strong>
        <button className="knop tweede klein" onClick={() => (werk ? setWerk(null) : sluit())}>
          {werk ? 'Annuleren' : 'Klaar met tekenen'}
        </button>
      </div>

      {!werk && (
        <>
          <p>Wat wil je tekenen?</p>
          <div className="tekenkeuze">
            {soorten.map((s) => (
              <button key={s.soort} className="knop baan" onClick={() => begin(s.soort)}>
                <span>{s.naam}</span>
                <span className="zacht klein-tekst">{s.uitleg}</span>
              </button>
            ))}
          </div>
          <p className="zacht">Iets aanpassen of weghalen? Tik het aan op de kaart.</p>
        </>
      )}

      {werk && (
        <>
          {holeNodig && (
            <>
              <label htmlFor="teken-hole">Hole</label>
              <select id="teken-hole" value={werk.holeId ?? ''} onChange={(e) => kiesHole(e.target.value)}>
                <option value="" disabled>Kies een hole…</option>
                {holes.map((h) => <option key={h.id} value={h.id}>{holeNaam(h.id)}</option>)}
              </select>
            </>
          )}

          {werk.soort === 'baanvlak' && (
            <>
              <label htmlFor="teken-type">Soort vlak</label>
              <select id="teken-type" value={werk.type} onChange={(e) => zet({ type: e.target.value })}>
                {vlaktypes.map(([w, naam]) => <option key={w} value={w}>{naam.replace(/s$/, '')}</option>)}
              </select>
              <label htmlFor="teken-vlakhole">Hoort bij</label>
              <select id="teken-vlakhole" value={werk.holeId ?? ''} onChange={(e) => zet({ holeId: e.target.value })}>
                <option value="">Automatisch (de hole waar het in ligt)</option>
                {holes.map((h) => <option key={h.id} value={h.id}>{holeNaam(h.id)}</option>)}
              </select>
            </>
          )}

          {werk.soort === 'leiding' && (
            <>
              <label htmlFor="teken-ltype">Soort</label>
              <select id="teken-ltype" value={werk.type} onChange={(e) => zet({ type: e.target.value })}>
                {leidingtypes.map(([w, naam]) => <option key={w} value={w}>{naam}</option>)}
              </select>
              <label htmlFor="teken-nauw">Hoe zeker is de ligging?</label>
              <select id="teken-nauw" value={werk.nauwkeurigheid} onChange={(e) => zet({ nauwkeurigheid: e.target.value })}>
                {nauwkeurigheden.map(([w, naam]) => <option key={w} value={w}>{naam}</option>)}
              </select>
              <div className="tekenvelden">
                <div>
                  <label htmlFor="teken-mat">Materiaal</label>
                  <input id="teken-mat" value={werk.materiaal ?? ''} onChange={(e) => zet({ materiaal: e.target.value })} placeholder="Bijv. PE" />
                </div>
                <div>
                  <label htmlFor="teken-dia">Diameter (mm)</label>
                  <input id="teken-dia" inputMode="numeric" value={werk.diameter ?? ''}
                         onChange={(e) => zet({ diameter: e.target.value.replace(/\D/g, '') })} />
                </div>
              </div>
            </>
          )}

          {werk.soort === 'object' && !werk.id && (
            <>
              <label htmlFor="teken-otype">Soort object</label>
              {objecttypes.length ? (
                <select id="teken-otype" value={werk.objecttypeId} onChange={(e) => zet({ objecttypeId: e.target.value })}>
                  {objecttypes.map((t) => <option key={t.id} value={t.id}>{t.naam}</option>)}
                </select>
              ) : <p className="melding info">Er zijn nog geen objecttypes voor deze baan.</p>}
              <label htmlFor="teken-code">Code (optioneel)</label>
              <input id="teken-code" value={werk.code ?? ''} onChange={(e) => zet({ code: e.target.value })} placeholder="Bijv. S-12" />
            </>
          )}

          {(!holeNodig || werk.holeId) && (
            <>
              <p className="tekenuitleg">
                {vorm === 'punt' && (n ? 'Sleep het punt, of tik ergens anders om het te verplaatsen.' : 'Tik op de kaart waar het object staat.')}
                {vorm === 'lijn' && (werk.soort === 'speellijn' && !n ? 'Tik eerst op de tee, dan op eventuele knikpunten, en als laatste op de green.'
                  : 'Tik om punten toe te voegen. Sleep een punt om het te verplaatsen; tik op een rondje ertussen voor een extra punt.')}
                {vorm === 'vlak' && 'Tik rondom de rand om punten te zetten. Sleep een punt om het te verplaatsen; tik op een rondje ertussen voor een extra punt.'}
              </p>
              <p className="mono tekenmaat">
                {vorm === 'vlak' && (n >= 3 ? `${oppTekst(oppervlakteM2(stand.punten))} · omtrek ${Math.round(lengteM(stand.punten, true))} m` : `${n} van minimaal 3 punten`)}
                {vorm === 'lijn' && (n >= 2 ? `${Math.round(lengteM(stand.punten))} m` : `${n} van minimaal 2 punten`)}
                {vorm === 'punt' && (n ? 'Punt gezet' : 'Nog geen punt')}
              </p>
              <div className="knoppenrij">
                <button className="knop tweede" disabled={!stand.kanOngedaan} onClick={() => tekenaar.current?.ongedaan()}>Ongedaan maken</button>
                {vorm !== 'punt' && (
                  <button className="knop tweede" disabled={stand.gekozen == null} onClick={() => tekenaar.current?.verwijderGekozen()}>
                    Gekozen punt weg
                  </button>
                )}
              </div>
            </>
          )}

          {fout && <div className="melding fout">{fout}</div>}
          <button className="knop breed groot" disabled={bezig || !genoeg || (holeNodig && !werk.holeId) || (werk.soort === 'object' && !werk.id && !werk.objecttypeId)}
                  onClick={opslaan}>
            {bezig ? 'Bezig…' : 'Opslaan'}
          </button>
          {werk.id && (
            <button className={`knop breed ${zeker ? 'melden' : 'tweede'}`} disabled={bezig} onClick={weghalen}>
              {zeker
                ? 'Zeker weten? Tik nog een keer'
                : werk.soort === 'speellijn' || werk.soort === 'holevlak' ? 'Vorm wissen' : 'Weghalen (archiveren)'}
            </button>
          )}
        </>
      )}
    </aside>
  )
}
