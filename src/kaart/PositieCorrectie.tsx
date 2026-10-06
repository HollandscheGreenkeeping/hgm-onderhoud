import { useEffect, useRef, useState } from 'react'
import { LngLat, Marker, type Map as Kaart } from 'maplibre-gl'
import { supabase } from '../lib/supabase'
import { useLocatie } from '../lib/locatie'
import { puntEwkt } from './data'

export type GpsPositie = { lonlat: [number, number]; nauwkeurigheid: number }

const afstand = ([a, b]: [number, number], [c, d]: [number, number]) =>
  new LngLat(a, b).distanceTo(new LngLat(c, d))

// Object verslepen of op de eigen GPS-positie zetten.
// Hoofd-greenkeeper en hoger verplaatsen direct; een greenkeeper dient een voorstel in.
export default function PositieCorrectie({ kaart, objectId, titel, start, gps, klaar, annuleer }: {
  kaart: Kaart
  objectId: string
  titel: string
  start: [number, number]
  gps: GpsPositie | null
  klaar: (melding: string) => void
  annuleer: () => void
}) {
  const { magPlannen } = useLocatie()
  const marker = useRef<Marker | null>(null)
  const [positie, setPositie] = useState<[number, number]>(start)
  const [toelichting, setToelichting] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    const m = new Marker({ draggable: true, color: '#fb8c00' }).setLngLat(start).addTo(kaart)
    m.on('dragend', () => {
      const p = m.getLngLat()
      setPositie([p.lng, p.lat])
    })
    marker.current = m
    kaart.easeTo({ center: start, zoom: Math.max(kaart.getZoom(), 19) })
    return () => { m.remove() }
  }, [kaart, start])

  function naarGps() {
    if (!gps) return
    marker.current?.setLngLat(gps.lonlat)
    setPositie(gps.lonlat)
    kaart.easeTo({ center: gps.lonlat })
  }

  async function opslaan() {
    setBezig(true)
    setFout(null)
    const { error } = magPlannen
      ? await supabase.from('objecten').update({ geom: puntEwkt(positie) }).eq('id', objectId)
      : await supabase.from('positievoorstellen').insert({
          object_id: objectId,
          nieuwe_geom: puntEwkt(positie),
          toelichting: toelichting || null,
        })
    setBezig(false)
    if (error) return setFout('Opslaan mislukt. Probeer het opnieuw.')
    klaar(magPlannen ? 'Object verplaatst.' : 'Voorstel ingediend. De hoofd-greenkeeper keurt het goed of af.')
  }

  const verschoven = afstand(start, positie)

  return (
    <aside className="paneel detailpaneel" aria-label="Positie corrigeren">
      <div className="paneel-kop">
        <strong>Positie {titel}</strong>
        <button className="knop tweede klein" onClick={annuleer}>Annuleren</button>
      </div>
      <p>Sleep de oranje marker naar de juiste plek, of gebruik je GPS-positie.</p>
      <button className="knop tweede breed" disabled={!gps} onClick={naarGps}>
        {gps ? `Op mijn GPS-positie (±${Math.round(gps.nauwkeurigheid)} m)` : 'GPS-positie onbekend: zet GPS aan (knop op de kaart)'}
      </button>
      {gps && gps.nauwkeurigheid > 5 && (
        <p className="zacht">Let op: GPS is nu ±{Math.round(gps.nauwkeurigheid)} m nauwkeurig. Slepen op de luchtfoto is vaak preciezer.</p>
      )}
      <p><strong>Verschoven: {verschoven < 0.1 ? 'nog niet' : `${verschoven.toFixed(1)} m`}</strong></p>
      {!magPlannen && (
        <>
          <label htmlFor="toelichting">Toelichting (optioneel)</label>
          <input id="toelichting" value={toelichting} onChange={(e) => setToelichting(e.target.value)}
                 placeholder="Bijv. staat naast het pad" />
        </>
      )}
      {fout && <div className="melding fout">{fout}</div>}
      <button className="knop breed" disabled={bezig || verschoven < 0.1} onClick={opslaan}>
        {magPlannen ? 'Verplaatsen' : 'Voorstel indienen'}
      </button>
    </aside>
  )
}
