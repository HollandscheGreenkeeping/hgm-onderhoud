import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { rolNamen, supabase, type MijnLocatie } from '../lib/supabase'
import { useSessie } from '../lib/sessie'
import Kopbalk from '../components/Kopbalk'
import type { Cijfers } from './Overzicht'

// Banenkeuze, met per baan de kerncijfers: zo is dit ook het overzicht over alle banen
// voor onderhoudsmanager en beheer.
export default function LocatieKiezen() {
  const { profiel } = useSessie()
  const navigeer = useNavigate()
  const [locaties, setLocaties] = useState<MijnLocatie[] | null>(null)
  const [cijfers, setCijfers] = useState<Record<string, Cijfers>>({})
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('mijn_locaties').then(({ data, error }) => {
      if (error) setFout(error.message)
      else setLocaties(data)
    })
    supabase.rpc('dashboard_cijfers').then(({ data }) =>
      setCijfers(Object.fromEntries((data ?? []).map((c: Cijfers) => [c.locatie_id, c]))))
  }, [])

  const isBeheer = profiel?.globale_rol === 'beheer'
  // Eén baan? Dan meteen door (behalve beheer: die moet ook een nieuwe baan kunnen aanmaken).
  if (locaties?.length === 1 && !isBeheer) return <Navigate to={`/locatie/${locaties[0].locatie_id}`} replace />

  const totaal = (k: keyof Cijfers) => Object.values(cijfers).reduce((t, c) => t + Number(c[k]), 0)

  return (
    <>
      <Kopbalk titel="HGM Golf Onderhoud" />
      <main>
        <div className="rij-hoofd">
          <h1>Alle banen</h1>
          {isBeheer && <button className="knop" onClick={() => navigeer('/nieuwe-baan')}>+ Nieuwe baan</button>}
        </div>
        <p className="zacht">Ingelogd als {profiel?.naam ?? profiel?.email}</p>
        {fout && <div className="melding fout">{fout}</div>}
        {locaties?.length === 0 && (
          <div className="melding info">
            Je bent nog niet aan een baan gekoppeld. Vraag beheer om je toegang te geven.
          </div>
        )}
        {(locaties?.length ?? 0) > 1 && (
          <div className="tellers">
            <div className={`teller ${totaal('open_storingen') ? 'aandacht' : ''}`}><div className="getal">{totaal('open_storingen')}</div><div className="naam">Open storingen</div></div>
            <div className={`teller ${totaal('verlopen_taken') ? 'aandacht' : ''}`}><div className="getal">{totaal('verlopen_taken')}</div><div className="naam">Verlopen taken</div></div>
            <div className="teller"><div className="getal">{totaal('werk_deze_week')}</div><div className="naam">Werk deze week</div></div>
            <div className="teller"><div className="getal">{totaal('machines_onderhoud')}</div><div className="naam">Machines met onderhoud</div></div>
          </div>
        )}
        <ul className="lijst banen">
          {locaties?.map((l) => {
            const c = cijfers[l.locatie_id]
            return (
              <li key={l.locatie_id}>
                <button className="knop tweede baan" onClick={() => navigeer(`/locatie/${l.locatie_id}`)}>
                  <span className="rij-hoofd">
                    <span>{l.naam}</span>
                    <span className="zacht">{rolNamen[l.rol]}</span>
                  </span>
                  {c && (
                    <span className="baancijfers">
                      <span className={c.open_storingen ? 'rood' : ''}>{c.open_storingen} storingen</span>
                      <span className={c.verlopen_taken ? 'rood' : ''}>{c.verlopen_taken} verlopen</span>
                      <span>{c.werk_deze_week} werk deze week</span>
                      {c.machines_onderhoud > 0 && <span className="oranje">{c.machines_onderhoud} machine(s) onderhoud</span>}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </main>
    </>
  )
}
