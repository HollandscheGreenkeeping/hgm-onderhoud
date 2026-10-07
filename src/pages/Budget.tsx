import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { euro, useInkoopLocaties, useMagGoedkeuren } from '../lib/inkoop'

type Maandkosten = { locatie_id: string; maand: number; inkoop: number; werkplaats: number; budget: number | null }

const maandNamen = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

// Inkoop → Budget: per locatie per maand inkoop + werkplaats tegen het budget. Intern: beheer,
// onderhoudsmanager en de hoofd-greenkeeper (eigen baan). Beheer en onderhoudsmanager zetten het
// jaarbudget; per maand telt dan 1/12, tenzij er een maandbudget is.
export default function Budget() {
  const beheerder = useMagGoedkeuren()
  const locaties = useInkoopLocaties()
  const [jaar, setJaar] = useState(new Date().getFullYear())
  const [kosten, setKosten] = useState<Maandkosten[]>([])
  const [jaarbudget, setJaarbudget] = useState<Record<string, number>>({})
  const [fout, setFout] = useState<string | null>(null)

  const laad = useCallback(async () => {
    const [k, b] = await Promise.all([
      supabase.rpc('kosten_per_maand', { p_jaar: jaar }),
      supabase.from('budgetten').select('locatie_id, bedrag').eq('jaar', jaar).is('maand', null),
    ])
    setKosten((k.data ?? []) as Maandkosten[])
    setJaarbudget(Object.fromEntries((b.data ?? []).map((r) => [r.locatie_id, Number(r.bedrag)])))
  }, [jaar])
  useEffect(() => { laad() }, [laad])

  async function budgetZetten(locatieId: string, waarde: string) {
    setFout(null)
    const bedrag = Number(waarde.replace(/\./g, '').replace(',', '.'))
    const bestaand = await supabase.from('budgetten').select('id').eq('locatie_id', locatieId).eq('jaar', jaar).is('maand', null).maybeSingle()
    const { error } = waarde.trim() === ''
      ? await supabase.from('budgetten').delete().eq('locatie_id', locatieId).eq('jaar', jaar).is('maand', null)
      : bestaand.data
        ? await supabase.from('budgetten').update({ bedrag }).eq('id', bestaand.data.id)
        : await supabase.from('budgetten').insert({ locatie_id: locatieId, jaar, bedrag })
    if (error) setFout('Budget opslaan mislukt.')
    laad()
  }

  const metKosten = (locaties ?? []).filter((l) => kosten.some((k) => k.locatie_id === l.id))
  const huidigeMaand = jaar === new Date().getFullYear() ? new Date().getMonth() + 1 : 12

  return (
    <>
      <div className="kop-met-knop">
        <h1>Budget en kosten</h1>
        <div className="knoppenrij">
          <button className="knop tweede" onClick={() => setJaar(jaar - 1)} aria-label="Vorig jaar">‹</button>
          <span className="mono">{jaar}</span>
          <button className="knop tweede" onClick={() => setJaar(jaar + 1)} aria-label="Volgend jaar">›</button>
        </div>
      </div>
      <p className="zacht">Inkoop = waarde van wat binnenkwam. Werkplaats = onderdelen en uren op werkorders voor machines van die baan. Intern.</p>
      {fout && <div className="melding fout">{fout}</div>}
      {metKosten.length === 0 && <p className="zacht">Geen locaties om te tonen.</p>}

      {metKosten.map((l) => {
        const rijen = kosten.filter((k) => k.locatie_id === l.id)
        const tot = (k: keyof Maandkosten) => rijen.reduce((t, r) => t + Number(r[k] ?? 0), 0)
        const besteed = tot('inkoop') + tot('werkplaats')
        const budgetTotNu = rijen.filter((r) => r.maand <= huidigeMaand).reduce((t, r) => t + Number(r.budget ?? 0), 0)
        return (
          <section key={l.id} className="kaart">
            <div className="kop-met-knop">
              <h2>{l.naam}</h2>
              <span className={`label ${jaarbudget[l.id] ? (besteed > budgetTotNu ? 'storing' : 'in-orde') : ''}`}>
                {euro(besteed)} besteed{jaarbudget[l.id] ? ` van ${euro(jaarbudget[l.id])}` : ''}
              </span>
            </div>
            <div className="lus-rij">
              <label htmlFor={`budget-${l.id}`}>Jaarbudget (€)</label>
              <input id={`budget-${l.id}`} inputMode="decimal" className="smal" key={`${l.id}-${jaar}-${jaarbudget[l.id] ?? ''}`}
                     defaultValue={jaarbudget[l.id] ?? ''} disabled={!beheerder}
                     onBlur={(e) => e.target.value !== String(jaarbudget[l.id] ?? '') && budgetZetten(l.id, e.target.value)} />
            </div>
            <div className="tabel-wrap">
              <table className="tabel">
                <thead><tr><th>Maand</th><th>Inkoop</th><th>Werkplaats</th><th>Totaal</th><th>Budget</th><th>Verschil</th></tr></thead>
                <tbody>
                  {rijen.map((r) => {
                    const totaal = Number(r.inkoop) + Number(r.werkplaats)
                    const verschil = r.budget != null ? Number(r.budget) - totaal : null
                    return (
                      <tr key={r.maand}>
                        <td>{maandNamen[r.maand - 1]}</td>
                        <td>{euro(r.inkoop)}</td>
                        <td>{euro(r.werkplaats)}</td>
                        <td>{euro(totaal)}</td>
                        <td>{r.budget != null ? euro(r.budget) : '–'}</td>
                        <td className={verschil != null && verschil < 0 ? 'rood' : ''}>{verschil != null ? euro(verschil) : '–'}</td>
                      </tr>
                    )
                  })}
                  <tr className="totaalrij">
                    <td><strong>Jaar</strong></td>
                    <td><strong>{euro(tot('inkoop'))}</strong></td>
                    <td><strong>{euro(tot('werkplaats'))}</strong></td>
                    <td><strong>{euro(besteed)}</strong></td>
                    <td><strong>{jaarbudget[l.id] != null || rijen.some((r) => r.budget != null) ? euro(tot('budget')) : '–'}</strong></td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </>
  )
}
