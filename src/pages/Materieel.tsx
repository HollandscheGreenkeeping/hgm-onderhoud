import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { useLocatie } from '../lib/locatie'
import { useKeuzelijst } from '../lib/keuzelijst'

export type Machine = {
  id: string; naam: string | null; merk: string | null; model: string | null; serienummer: string | null
  aanschafjaar: number | null; standplaats: string | null; draaiuren: number; gearchiveerd_op: string | null
  machinetype_id: string | null
  locatie_id: string; huidige_locatie_id: string
  type: { naam: string } | null
  eigen: { naam: string } | null                                  // baan waar de machine bij hoort
  huidig: { naam: string; soort: 'baan' | 'werkplaats' } | null   // waar hij nu staat
}

export const machineVelden = `id, naam, merk, model, serienummer, aanschafjaar, standplaats, draaiuren, gearchiveerd_op,
  machinetype_id, locatie_id, huidige_locatie_id, type:keuzelijst_waarden(naam),
  eigen:locaties!machines_locatie_id_fkey(naam), huidig:locaties!machines_huidige_locatie_id_fkey(naam, soort)`

// Standplaats als het niet de eigen baan is: in de werkplaats, op een andere baan, of hier als vervanger.
export function machineElders(m: Pick<Machine, 'locatie_id' | 'huidige_locatie_id' | 'eigen' | 'huidig'>, baanId: string) {
  if (m.locatie_id !== baanId) return `Vervangend materieel van ${m.eigen?.naam ?? 'een andere baan'}`
  if (m.huidige_locatie_id === baanId) return null
  return m.huidig?.soort === 'werkplaats' ? 'In de werkplaats' : `Staat op ${m.huidig?.naam ?? 'een andere baan'}`
}

export const machineNaam = (m: Pick<Machine, 'naam' | 'merk' | 'model'>) =>
  m.naam ?? ([m.merk, m.model].filter(Boolean).join(' ') || 'Machine')

type Status = { storing: boolean; onderhoud: boolean }

export default function Materieel() {
  const { locatie, magPlannen } = useLocatie()
  const [machines, setMachines] = useState<Machine[] | null>(null)
  const [status, setStatus] = useState<Record<string, Status>>({})
  const [nieuw, setNieuw] = useState(false)
  const [archief, setArchief] = useState(false)

  const laad = useCallback(async () => {
    // Eigen machines, plus vervangend materieel dat hier tijdelijk staat.
    let q = supabase.from('machines').select(machineVelden)
      .or(`locatie_id.eq.${locatie.id},huidige_locatie_id.eq.${locatie.id}`).order('naam')
    q = archief ? q.not('gearchiveerd_op', 'is', null) : q.is('gearchiveerd_op', null)
    const [m, s, t] = await Promise.all([
      q,
      supabase.from('storingen').select('machine_id').eq('locatie_id', locatie.id).not('machine_id', 'is', null)
        .in('status', ['gemeld', 'toegewezen', 'in_behandeling']),
      supabase.from('taken').select('machine_id').eq('locatie_id', locatie.id).not('machine_id', 'is', null)
        .in('status', ['open', 'in_behandeling']),
    ])
    const st: Record<string, Status> = {}
    for (const r of s.data ?? []) st[r.machine_id!] = { ...(st[r.machine_id!] ?? { onderhoud: false }), storing: true }
    for (const r of t.data ?? []) st[r.machine_id!] = { ...(st[r.machine_id!] ?? { storing: false }), onderhoud: true }
    setStatus(st)
    setMachines((m.data ?? []) as unknown as Machine[])
  }, [locatie.id, archief])
  useEffect(() => { laad() }, [laad])

  return (
    <main>
      <div className="kop-met-knop">
        <h1>Materieel</h1>
        {magPlannen && !nieuw && <button className="knop" onClick={() => setNieuw(true)}>Machine toevoegen</button>}
      </div>
      {nieuw && <MachineFormulier klaar={() => { setNieuw(false); laad() }} annuleer={() => setNieuw(false)} />}
      <div className="schakelaar filterbalk">
        <button className={`knop ${archief ? 'tweede' : ''}`} onClick={() => setArchief(false)}>In gebruik</button>
        <button className={`knop ${archief ? '' : 'tweede'}`} onClick={() => setArchief(true)}>Gearchiveerd</button>
      </div>
      {machines?.length === 0 && <p className="zacht">{archief ? 'Geen gearchiveerde machines.' : 'Nog geen machines.'}</p>}
      <ul className="lijst">
        {machines?.map((m) => {
          const s = status[m.id]
          const elders = machineElders(m, locatie.id)
          return (
            <li key={m.id}>
              <Link className={`rij ${s?.storing ? 'urgentie-spoed' : s?.onderhoud ? 'urgentie-hoog' : ''}`} to={m.id}>
                <span className="rij-hoofd">
                  <strong>{machineNaam(m)}</strong>
                  {s?.storing ? <span className="label storing">Defect</span>
                    : s?.onderhoud ? <span className="label gepland">Onderhoud</span>
                    : elders ? <span className="label">{elders}</span>
                    : <span className="zacht">{Number(m.draaiuren).toLocaleString('nl-NL')} u</span>}
                </span>
                <span className="zacht">
                  {[(s?.storing || s?.onderhoud) && elders, m.type?.naam, [m.merk, m.model].filter(Boolean).join(' '), m.standplaats]
                    .filter(Boolean).join(' · ')}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </main>
  )
}

export function MachineFormulier({ machine, klaar, annuleer }: { machine?: Machine; klaar: () => void; annuleer: () => void }) {
  const { locatie } = useLocatie()
  const types = useKeuzelijst('machinetype', locatie.id)
  const [v, setV] = useState({
    naam: machine?.naam ?? '', machinetype_id: machine?.machinetype_id ?? '', merk: machine?.merk ?? '',
    model: machine?.model ?? '', serienummer: machine?.serienummer ?? '',
    aanschafjaar: machine?.aanschafjaar ? String(machine.aanschafjaar) : '', standplaats: machine?.standplaats ?? '',
    draaiuren: machine ? String(machine.draaiuren) : '0',
  })
  const [fout, setFout] = useState<string | null>(null)
  const zet = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    const velden = {
      naam: v.naam || null, machinetype_id: v.machinetype_id || null, merk: v.merk || null, model: v.model || null,
      serienummer: v.serienummer || null, aanschafjaar: v.aanschafjaar ? Number(v.aanschafjaar) : null,
      standplaats: v.standplaats || null,
    }
    const { error } = machine
      ? await supabase.from('machines').update(velden).eq('id', machine.id)
      : await supabase.from('machines').insert({ ...velden, locatie_id: locatie.id, draaiuren: Number(v.draaiuren) || 0 })
    if (error) return setFout('Opslaan mislukt.')
    klaar()
  }

  return (
    <form className="kaart" onSubmit={opslaan}>
      <h2>{machine ? 'Machine bewerken' : 'Nieuwe machine'}</h2>
      <label htmlFor="naam">Naam</label>
      <input id="naam" required value={v.naam} onChange={zet('naam')} placeholder="Bijv. Greenmaaier 1" />
      <label htmlFor="type">Type</label>
      <select id="type" value={v.machinetype_id} onChange={zet('machinetype_id')}>
        <option value="">{types.length ? '— kies —' : '(nog geen machinetypes ingesteld)'}</option>
        {types.map((t) => <option key={t.id} value={t.id}>{t.naam}</option>)}
      </select>
      <div className="twee-kolommen">
        <div><label htmlFor="merk">Merk</label><input id="merk" value={v.merk} onChange={zet('merk')} /></div>
        <div><label htmlFor="model">Model</label><input id="model" value={v.model} onChange={zet('model')} /></div>
        <div><label htmlFor="serie">Serienummer</label><input id="serie" value={v.serienummer} onChange={zet('serienummer')} /></div>
        <div><label htmlFor="jaar">Aanschafjaar</label>
          <input id="jaar" type="number" min={1950} max={2100} value={v.aanschafjaar} onChange={zet('aanschafjaar')} /></div>
      </div>
      <label htmlFor="standplaats">Standplaats</label>
      <input id="standplaats" value={v.standplaats} onChange={zet('standplaats')} placeholder="Bijv. loods 2" />
      {!machine && (
        <>
          <label htmlFor="uren">Huidige draaiurenstand</label>
          <input id="uren" type="number" min={0} step="0.1" value={v.draaiuren} onChange={zet('draaiuren')} />
        </>
      )}
      {fout && <div className="melding fout">{fout}</div>}
      <div className="knoppenrij">
        <button className="knop">Opslaan</button>
        <button type="button" className="knop tweede" onClick={annuleer}>Annuleren</button>
      </div>
    </form>
  )
}
