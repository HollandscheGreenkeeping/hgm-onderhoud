import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import {
  openWerkorderStatussen, useMonteurs, werkorderCode, werkorderDoel, werkorderKlasse, werkorderStatus, werkorderVelden,
  type Werkorder,
} from '../lib/werkplaats'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function maandagVan(d: Date) {
  const m = new Date(d)
  m.setHours(12, 0, 0, 0)
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7))
  return m
}

// Werkplaats → Planning: welke machine wanneer bij welke monteur, over alle banen heen (ma–za).
// Inplannen doe je in de werkorder (monteur + datum); hier zie je de week en wat nog niet gepland is.
export default function WerkplaatsPlanning() {
  const monteurs = useMonteurs()
  const [maandag, setMaandag] = useState(() => maandagVan(new Date()))
  const [gepland, setGepland] = useState<Werkorder[]>([])
  const [ongepland, setOngepland] = useState<Werkorder[]>([])

  const dagen = Array.from({ length: 6 }, (_, i) => { const d = new Date(maandag); d.setDate(d.getDate() + i); return d })
  const van = iso(dagen[0]), tot = iso(dagen[5])

  useEffect(() => {
    Promise.all([
      supabase.from('werkorders').select(werkorderVelden).gte('gepland_op', van).lte('gepland_op', tot).neq('status', 'geannuleerd'),
      supabase.from('werkorders').select(werkorderVelden).in('status', openWerkorderStatussen)
        .or('gepland_op.is.null,monteur_id.is.null').order('aangevraagd_op'),
    ]).then(([g, o]) => {
      setGepland((g.data ?? []) as unknown as Werkorder[])
      setOngepland((o.data ?? []) as unknown as Werkorder[])
    })
  }, [van, tot])

  const week = (n: number) => setMaandag((m) => { const d = new Date(m); d.setDate(d.getDate() + 7 * n); return d })
  const rijen = [...monteurs, ...(gepland.some((w) => !w.monteur_id) ? [{ id: '', naam: 'Zonder monteur' }] : [])]
  const vandaag = iso(new Date())
  const weeknummer = (() => {
    const d = new Date(maandag); d.setDate(d.getDate() + 3)
    const jan4 = new Date(d.getFullYear(), 0, 4)
    return 1 + Math.round(((d.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getDay() + 6) % 7)) / 7)
  })()

  return (
    <>
      <div className="kop-met-knop">
        <h1>Planning</h1>
        <div className="knoppenrij">
          <button className="knop tweede" onClick={() => week(-1)} aria-label="Vorige week">‹</button>
          <button className="knop tweede" onClick={() => setMaandag(maandagVan(new Date()))}>Week {weeknummer}</button>
          <button className="knop tweede" onClick={() => week(1)} aria-label="Volgende week">›</button>
        </div>
      </div>

      {monteurs.length === 0 && (
        <div className="melding info">Er zijn nog geen monteurs. Beheer voegt ze toe bij Beheer → Gebruikers (rol Monteur).</div>
      )}

      <div className="tabel-wrap">
        <table className="tabel planning">
          <thead>
            <tr>
              <th>Monteur</th>
              {dagen.map((d) => (
                <th key={iso(d)} className={iso(d) === vandaag ? 'vandaag' : ''}>
                  {d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'numeric' })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rijen.map((m) => (
              <tr key={m.id || 'geen'}>
                <th scope="row">{m.naam}</th>
                {dagen.map((d) => (
                  <td key={iso(d)} className={iso(d) === vandaag ? 'vandaag' : ''}>
                    {gepland.filter((w) => (w.monteur_id ?? '') === m.id && w.gepland_op === iso(d)).map((w) => (
                      <Link key={w.id} to={`/werkplaats/werkorders/${w.id}`} className={`planblok ${werkorderKlasse(w.status)}`}>
                        <span className="mono">{werkorderCode(w)}</span>
                        <strong>{werkorderDoel(w)}</strong>
                        <span>{w.locatie?.naam}</span>
                      </Link>
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section>
        <h2>Nog in te plannen</h2>
        {ongepland.length === 0 && <p className="zacht">Alles is ingepland.</p>}
        <ul className="lijst">
          {ongepland.map((w) => (
            <li key={w.id}>
              <Link className={`rij urgentie-${w.urgentie}`} to={`/werkplaats/werkorders/${w.id}`}>
                <span className="rij-hoofd">
                  <span className="rij-id">{werkorderCode(w)} · {w.locatie?.naam}</span>
                  <span className={`label ${werkorderKlasse(w.status)}`}>{werkorderStatus[w.status]}</span>
                </span>
                <strong>{werkorderDoel(w)}: {w.omschrijving}</strong>
                <span className="rij-meta">{w.monteur?.naam ?? 'Geen monteur'}{w.gepland_op ? '' : ' · geen datum'}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
