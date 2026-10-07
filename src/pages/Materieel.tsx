import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useLocatie } from '../lib/locatie'
import { useKeuzelijst } from '../lib/keuzelijst'
import { Chip, DataTabel, PaginaKop, useUrlParam, useZoekfilter, Weergaven, Werkbalk, Zoekveld, type Kolom } from '../components/tabel'

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

// Materieel van de baan als tabel (eigen machines plus vervangend materieel dat hier staat).
// Weergave en zoekterm in de URL; elke machine opent /materieel/:id.
export default function Materieel() {
  const { locatie, magPlannen } = useLocatie()
  const [weergave] = useUrlParam('weergave', 'gebruik')
  const [machines, setMachines] = useState<Machine[] | null>(null)
  const [status, setStatus] = useState<Record<string, Status>>({})
  const basis = `/locatie/${locatie.id}`

  const laad = useCallback(async () => {
    setMachines(null)
    let q = supabase.from('machines').select(machineVelden)
      .or(`locatie_id.eq.${locatie.id},huidige_locatie_id.eq.${locatie.id}`).order('naam')
    q = weergave === 'archief' ? q.not('gearchiveerd_op', 'is', null) : q.is('gearchiveerd_op', null)
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
  }, [locatie.id, weergave])
  useEffect(() => { laad() }, [laad])

  const rijen = useZoekfilter(machines, (m) => [machineNaam(m), m.type?.naam, m.merk, m.model, m.serienummer, m.standplaats])
  const toestand = (m: Machine) => {
    const s = status[m.id]
    const elders = machineElders(m, locatie.id)
    return s?.storing ? { klasse: 'storing', tekst: 'Defect' } : s?.onderhoud ? { klasse: 'gepland', tekst: 'Onderhoud' }
      : elders ? { klasse: 'gepland', tekst: elders } : { klasse: 'in-orde', tekst: 'In gebruik' }
  }
  const kolommen: Kolom<Machine>[] = [
    { sleutel: 'naam', kop: 'Machine', sorteer: machineNaam, cel: (m) => <>{machineNaam(m)}<span className="sub">{[m.merk, m.model].filter(Boolean).join(' ')}</span></> },
    { sleutel: 'type', kop: 'Type', sorteer: (m) => m.type?.naam ?? '', cel: (m) => m.type?.naam ?? '–' },
    { sleutel: 'serie', kop: 'Serienummer', klasse: 'mono', sorteer: (m) => m.serienummer ?? '', cel: (m) => m.serienummer ?? '–' },
    { sleutel: 'jaar', kop: 'Jaar', klasse: 'mono smal', sorteer: (m) => m.aanschafjaar, cel: (m) => m.aanschafjaar ?? '–' },
    { sleutel: 'uren', kop: 'Draaiuren', klasse: 'mono rechts smal', sorteer: (m) => Number(m.draaiuren), cel: (m) => Number(m.draaiuren).toLocaleString('nl-NL') },
    { sleutel: 'standplaats', kop: 'Standplaats', sorteer: (m) => m.standplaats ?? '', cel: (m) => m.standplaats ?? '–' },
    { sleutel: 'status', kop: 'Status', sorteer: (m) => toestand(m).tekst, cel: (m) => { const t = toestand(m); return <Chip klasse={t.klasse}>{t.tekst}</Chip> } },
  ]

  return (
    <main className="breed">
      <PaginaKop titel="Materieel" telling={rijen?.length}>
        {magPlannen && <Link className="knop" to={`${basis}/materieel/nieuw`}>Machine toevoegen</Link>}
      </PaginaKop>
      <Werkbalk>
        <Weergaven standaard="gebruik" opties={[{ waarde: 'gebruik', naam: 'In gebruik' }, { waarde: 'archief', naam: 'Gearchiveerd' }]} />
        <Zoekveld placeholder="Zoek op naam, type, merk of serienummer" />
      </Werkbalk>
      <DataTabel kolommen={kolommen} rijen={rijen} sleutel={(m) => m.id} naar={(m) => `${basis}/materieel/${m.id}`}
                 regelKlasse={(m) => (status[m.id]?.storing ? 'let-op' : '')}
                 leeg={weergave === 'archief' ? 'Geen gearchiveerde machines.' : 'Nog geen machines.'} />
    </main>
  )
}

// /materieel/nieuw
export function MachineNieuw() {
  const { locatie } = useLocatie()
  const navigeer = useNavigate()
  const terug = () => navigeer(`/locatie/${locatie.id}/materieel`)
  return (
    <main>
      <PaginaKop titel="Machine toevoegen" />
      <MachineFormulier klaar={terug} annuleer={terug} />
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
