import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { useLocatie } from '../lib/locatie'

type Voorstel = {
  id: string; object_id: string; object_code: string | null; objecttype: string; toelichting: string | null
  ingediend_door: string | null; ingediend_op: string; afstand_m: number
  oud_lon: number; oud_lat: number; nieuw_lon: number; nieuw_lat: number
}

// Positiecorrecties van greenkeepers. Goedkeuren verschuift het object (database-trigger).
export default function Voorstellen() {
  const { locatie, magPlannen } = useLocatie()
  const [voorstellen, setVoorstellen] = useState<Voorstel[] | null>(null)
  const [fout, setFout] = useState<string | null>(null)

  const laad = useCallback(() => {
    supabase.rpc('open_positievoorstellen', { p_locatie: locatie.id }).then(({ data, error }) => {
      if (error) setFout('Voorstellen konden niet worden geladen.')
      else setVoorstellen(data)
    })
  }, [locatie.id])

  useEffect(laad, [laad])

  async function beoordeel(v: Voorstel, goed: boolean) {
    let reden: string | null = null
    if (!goed) {
      reden = window.prompt('Waarom wordt dit voorstel afgekeurd?')
      if (reden === null) return
    }
    const { error } = await supabase.from('positievoorstellen')
      .update({ status: goed ? 'goedgekeurd' : 'afgekeurd', reden_afwijzing: reden })
      .eq('id', v.id)
    if (error) return setFout('Opslaan mislukt.')
    laad()
  }

  if (!magPlannen) return <main><div className="melding fout">Alleen voor hoofd-greenkeeper en hoger.</div></main>

  return (
    <main>
      <h1>Positievoorstellen</h1>
      {fout && <div className="melding fout">{fout}</div>}
      {voorstellen?.length === 0 && <p className="zacht">Er staan geen voorstellen open.</p>}
      <ul className="lijst">
        {voorstellen?.map((v) => (
          <li key={v.id} className="kaart">
            <strong>{[v.objecttype, v.object_code].filter(Boolean).join(' ')}</strong>
            <span className="zacht"> · {v.afstand_m} m verschoven</span>
            <p className="zacht">
              Door {v.ingediend_door ?? 'onbekend'} op{' '}
              {new Date(v.ingediend_op).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })}
              {v.toelichting && <><br />“{v.toelichting}”</>}
            </p>
            <p>
              <Link to={`/locatie/${locatie.id}?object=${v.object_id}`}>Op de kaart bekijken</Link>
              <span className="zacht"> (oranje stippellijn van oude naar nieuwe plek)</span>
            </p>
            <div className="knoppenrij">
              <button className="knop" onClick={() => beoordeel(v, true)}>Goedkeuren</button>
              <button className="knop tweede" onClick={() => beoordeel(v, false)}>Afkeuren</button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
