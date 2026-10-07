import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { useSessie } from '../lib/sessie'

type Kosten = { machine_id: string; locatie_id: string; werkorders: number; minuten: number; onderdelen: number; uurkosten: number; totaal: number }
type MachineInfo = { id: string; naam: string | null; merk: string | null; model: string | null; aanschafjaar: number | null; locatie: { naam: string } | null }

const euro = (n: number) => `€ ${Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Werkplaats → Kosten: onderdelen plus uren over de hele levensduur per machine, als basis voor
// repareren of vervangen. Alleen beheer en onderhoudsmanager (de hoofd-greenkeeper ziet het per
// machine op de eigen baan). Het uurtarief stelt beheer hier in.
export default function MachineKosten() {
  const { profiel } = useSessie()
  const isBeheer = profiel?.globale_rol === 'beheer'
  const [kosten, setKosten] = useState<Kosten[] | null>(null)
  const [machines, setMachines] = useState<Record<string, MachineInfo>>({})
  const [tarief, setTarief] = useState('')
  const [melding, setMelding] = useState<string | null>(null)

  const laad = useCallback(async () => {
    const [k, m, t] = await Promise.all([
      supabase.rpc('machine_kosten'),
      supabase.from('machines').select('id, naam, merk, model, aanschafjaar, locatie:locaties!machines_locatie_id_fkey(naam)'),
      supabase.from('instellingen').select('waarde').eq('sleutel', 'werkplaats_uurtarief').maybeSingle(),
    ])
    setKosten(((k.data ?? []) as Kosten[]).filter((r) => r.werkorders > 0).sort((a, b) => b.totaal - a.totaal))
    setMachines(Object.fromEntries(((m.data ?? []) as unknown as MachineInfo[]).map((x) => [x.id, x])))
    setTarief(t.data ? String(t.data.waarde) : '')
  }, [])
  useEffect(() => { laad() }, [laad])

  async function tariefOpslaan(e: FormEvent) {
    e.preventDefault()
    const waarde = Number(tarief.replace(',', '.'))
    const { error } = await supabase.from('instellingen').upsert({ sleutel: 'werkplaats_uurtarief', waarde })
    setMelding(error ? 'Opslaan mislukt.' : 'Uurtarief opgeslagen.')
    laad()
  }

  const naam = (m?: MachineInfo) => m ? (m.naam ?? ([m.merk, m.model].filter(Boolean).join(' ') || 'Machine')) : 'Machine'

  return (
    <>
      <h1>Kosten per machine</h1>
      <p className="zacht">Onderdelen plus uren van alle werkorders, over de hele levensduur. Intern: niet zichtbaar voor de golfclub.</p>

      <form className="lus-rij" onSubmit={tariefOpslaan}>
        <label htmlFor="tarief">Uurtarief werkplaats (€)</label>
        <input id="tarief" inputMode="decimal" className="smal" value={tarief} disabled={!isBeheer}
               onChange={(e) => setTarief(e.target.value)} placeholder="0" />
        {isBeheer && <button className="knop tweede">Opslaan</button>}
        {melding && <span className="zacht">{melding}</span>}
      </form>

      {kosten === null && <p className="zacht">Laden…</p>}
      {kosten?.length === 0 && <p className="zacht">Nog geen werkorders met kosten.</p>}
      {kosten && kosten.length > 0 && (
        <div className="tabel-wrap">
          <table className="tabel">
            <thead>
              <tr><th>Machine</th><th>Baan</th><th>Werkorders</th><th>Uren</th><th>Onderdelen</th><th>Uurkosten</th><th>Totaal</th></tr>
            </thead>
            <tbody>
              {kosten.map((r) => {
                const m = machines[r.machine_id]
                return (
                  <tr key={r.machine_id}>
                    <td><Link to={`/locatie/${r.locatie_id}/materieel/${r.machine_id}`}>{naam(m)}</Link>
                      {m?.aanschafjaar && <span className="zacht"> ({m.aanschafjaar})</span>}</td>
                    <td>{m?.locatie?.naam}</td>
                    <td>{r.werkorders}</td>
                    <td>{Math.round((r.minuten / 60) * 10) / 10}</td>
                    <td>{euro(r.onderdelen)}</td>
                    <td>{euro(r.uurkosten)}</td>
                    <td><strong>{euro(r.totaal)}</strong></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
