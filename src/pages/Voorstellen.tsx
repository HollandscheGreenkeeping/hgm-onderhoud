import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { useLocatie } from '../lib/locatie'
import { datumTijd, relatieveTijd } from '../lib/teksten'
import { DataTabel, PaginaKop, useZoekfilter, Werkbalk, Zoekveld, type Kolom } from '../components/tabel'

type Voorstel = {
  id: string; object_id: string; object_code: string | null; objecttype: string; toelichting: string | null
  ingediend_door: string | null; ingediend_op: string; afstand_m: number
  oud_lon: number; oud_lat: number; nieuw_lon: number; nieuw_lat: number
}

const titel = (v: Voorstel) => [v.objecttype, v.object_code].filter(Boolean).join(' ')

function useVoorstellen(locatieId: string) {
  const [voorstellen, setVoorstellen] = useState<Voorstel[] | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const laad = useCallback(() => {
    supabase.rpc('open_positievoorstellen', { p_locatie: locatieId }).then(({ data, error }) => {
      if (error) setFout('Voorstellen konden niet worden geladen.')
      else setVoorstellen(data)
    })
  }, [locatieId])
  useEffect(laad, [laad])
  return { voorstellen, fout }
}

// Positiecorrecties van greenkeepers, om te beoordelen. Elk voorstel heeft een eigen pagina.
export default function Voorstellen() {
  const { locatie, magPlannen } = useLocatie()
  const { voorstellen, fout } = useVoorstellen(locatie.id)
  const rijen = useZoekfilter(voorstellen, (v) => [titel(v), v.ingediend_door, v.toelichting])
  const basis = `/locatie/${locatie.id}`

  if (!magPlannen) return <main><div className="melding fout">Alleen voor hoofd-greenkeeper en hoger.</div></main>

  const kolommen: Kolom<Voorstel>[] = [
    { sleutel: 'object', kop: 'Object', sorteer: titel, cel: (v) => <>{titel(v)}{v.toelichting && <span className="sub">{v.toelichting}</span>}</> },
    { sleutel: 'afstand', kop: 'Verschuiving', klasse: 'mono rechts smal', sorteer: (v) => v.afstand_m, cel: (v) => `${v.afstand_m} m` },
    { sleutel: 'door', kop: 'Ingediend door', sorteer: (v) => v.ingediend_door ?? '', cel: (v) => v.ingediend_door ?? 'Onbekend' },
    { sleutel: 'op', kop: 'Ingediend', klasse: 'mono smal', sorteer: (v) => v.ingediend_op, cel: (v) => relatieveTijd(v.ingediend_op) },
  ]

  return (
    <main className="breed">
      <PaginaKop titel="Positievoorstellen" telling={rijen?.length} sub="Goedkeuren verschuift het object op de kaart; de oude plek blijft in de historie." />
      <Werkbalk><Zoekveld placeholder="Zoek object of indiener" /></Werkbalk>
      {fout && <div className="melding fout">{fout}</div>}
      <DataTabel kolommen={kolommen} rijen={rijen} sleutel={(v) => v.id} naar={(v) => `${basis}/voorstellen/${v.id}`}
                 leeg="Er staan geen voorstellen open." />
    </main>
  )
}

// /voorstellen/:voorstelId
export function VoorstelDetail() {
  const { voorstelId } = useParams()
  const { locatie, magPlannen } = useLocatie()
  const navigeer = useNavigate()
  const { voorstellen, fout: laadfout } = useVoorstellen(locatie.id)
  const [fout, setFout] = useState<string | null>(null)
  const v = voorstellen?.find((x) => x.id === voorstelId)
  const basis = `/locatie/${locatie.id}`

  async function beoordeel(goed: boolean) {
    let reden: string | null = null
    if (!goed) {
      reden = window.prompt('Waarom wordt dit voorstel afgekeurd?')
      if (reden === null) return
    }
    const { error } = await supabase.from('positievoorstellen')
      .update({ status: goed ? 'goedgekeurd' : 'afgekeurd', reden_afwijzing: reden }).eq('id', voorstelId!)
    if (error) return setFout('Opslaan mislukt.')
    navigeer(`${basis}/voorstellen`)
  }

  if (!magPlannen) return <main><div className="melding fout">Alleen voor hoofd-greenkeeper en hoger.</div></main>
  if (laadfout) return <main><div className="melding fout">{laadfout}</div></main>
  if (!voorstellen) return <main className="zacht">Laden…</main>
  if (!v) return <main><PaginaKop titel="Voorstel" /><p className="zacht">Dit voorstel is al beoordeeld of bestaat niet.</p><Link to={`${basis}/voorstellen`}>Naar de voorstellen</Link></main>

  return (
    <main>
      <PaginaKop titel={titel(v)} sub={`${v.afstand_m} m verschoven`} />
      {fout && <div className="melding fout">{fout}</div>}
      <section className="kaart">
        <dl className="velden">
          <div><dt>Ingediend</dt><dd>{datumTijd(v.ingediend_op)} door {v.ingediend_door ?? 'onbekend'}</dd></div>
          {v.toelichting && <div><dt>Toelichting</dt><dd>{v.toelichting}</dd></div>}
          <div><dt>Oude plek</dt><dd className="mono">{v.oud_lat.toFixed(6)}, {v.oud_lon.toFixed(6)}</dd></div>
          <div><dt>Nieuwe plek</dt><dd className="mono">{v.nieuw_lat.toFixed(6)}, {v.nieuw_lon.toFixed(6)}</dd></div>
        </dl>
        <Link to={`${basis}?object=${v.object_id}`}>Op de kaart bekijken</Link>
        <span className="zacht"> (oranje stippellijn van oude naar nieuwe plek)</span>
      </section>
      <div className="actiebalk">
        <button className="knop groen" onClick={() => beoordeel(true)}>Goedkeuren</button>
        <button className="knop tweede" onClick={() => beoordeel(false)}>Afkeuren</button>
      </div>
    </main>
  )
}
