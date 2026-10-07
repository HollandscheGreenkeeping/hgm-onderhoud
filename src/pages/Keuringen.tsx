import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { datum } from '../lib/teksten'
import { certificaatOpenen, keuringDoel, keuringStaat, keuringVelden, type Keuring } from '../lib/werkplaats'
import KeuringFormulier from '../components/KeuringFormulier'

// Werkplaats → Keuringen: voertuigkeuringen, SKL, veiligheidskeuringen. Verlopen en binnenkort bovenaan.
export default function Keuringen() {
  const [keuringen, setKeuringen] = useState<Keuring[] | null>(null)
  const [bewerken, setBewerken] = useState<Keuring | 'nieuw' | null>(null)
  const [alles, setAlles] = useState(false)

  const laad = useCallback(() => {
    supabase.from('keuringen').select(keuringVelden).is('gearchiveerd_op', null).order('geldig_tot')
      .then(({ data }) => setKeuringen((data ?? []) as unknown as Keuring[]))
  }, [])
  useEffect(laad, [laad])

  async function archiveer(k: Keuring) {
    if (!window.confirm('Deze keuring archiveren? Bijvoorbeeld omdat de machine weg is.')) return
    await supabase.from('keuringen').update({ gearchiveerd_op: new Date().toISOString() }).eq('id', k.id)
    laad()
  }

  const metStaat = (keuringen ?? []).map((k) => ({ k, ...keuringStaat(k) }))
  const aandacht = metStaat.filter((x) => x.staat !== 'geldig')
  const zichtbaar = alles ? metStaat : aandacht

  return (
    <>
      <div className="kop-met-knop">
        <h1>Keuringen</h1>
        {!bewerken && <button className="knop" onClick={() => setBewerken('nieuw')}>+ Keuring</button>}
      </div>
      {bewerken && (
        <KeuringFormulier keuring={bewerken === 'nieuw' ? undefined : bewerken}
                          klaar={() => { setBewerken(null); laad() }} annuleer={() => setBewerken(null)} />
      )}
      <div className="schakelaar filterbalk">
        <button className={`knop ${alles ? 'tweede' : ''}`} onClick={() => setAlles(false)}>Verlopen en binnenkort ({aandacht.length})</button>
        <button className={`knop ${alles ? '' : 'tweede'}`} onClick={() => setAlles(true)}>Alle ({metStaat.length})</button>
      </div>
      {keuringen === null && <p className="zacht">Laden…</p>}
      {keuringen && zichtbaar.length === 0 && <p className="zacht">{alles ? 'Nog geen keuringen.' : 'Niets verlopen, en niets binnenkort. Mooi zo.'}</p>}
      <ul className="lijst">
        {zichtbaar.map(({ k, dagen, staat }) => (
          <li key={k.id} className={`rij ${staat === 'verlopen' ? 'urgentie-spoed' : staat === 'binnenkort' ? 'urgentie-hoog' : ''}`}>
            <span className="rij-hoofd">
              <span className="rij-id">{k.locatie?.naam}</span>
              <span className={`label ${staat === 'verlopen' ? 'storing' : staat === 'binnenkort' ? 'gepland' : 'in-orde'}`}>
                {staat === 'verlopen' ? `${-dagen} dagen verlopen` : staat === 'binnenkort' ? `nog ${dagen} dagen` : 'Geldig'}
              </span>
            </span>
            <strong>
              {k.machine_id ? <Link to={`/locatie/${k.locatie_id}/materieel/${k.machine_id}`}>{keuringDoel(k)}</Link> : keuringDoel(k)}
              {' · '}{k.soort?.naam}
            </strong>
            <span className="rij-meta">
              <span>geldig tot {datum(k.geldig_tot)}</span>
              {k.gekeurd_op && <><span>·</span><span>gekeurd {datum(k.gekeurd_op)}{k.keurder ? ` door ${k.keurder}` : ''}</span></>}
            </span>
            <div className="knoppenrij">
              <button className="knop tweede klein" onClick={() => setBewerken(k)}>Opnieuw gekeurd / bewerken</button>
              {k.certificaat_pad && <button className="knop tweede klein" onClick={() => certificaatOpenen(k.certificaat_pad!)}>Certificaat</button>}
              <button className="knop tweede klein" onClick={() => archiveer(k)}>Archiveren</button>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
