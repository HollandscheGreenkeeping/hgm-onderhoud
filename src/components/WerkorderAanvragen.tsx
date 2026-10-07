import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { objectTitel, urgentieNamen } from '../lib/teksten'

type Keuze = { id: string; naam: string }

// Werkorder aanvragen. Met machineId (vanaf de machine) staat het doel vast; anders kies je
// baan en machine of installatie (vanuit de werkplaats). De werkplaats plant hem daarna in.
export default function WerkorderAanvragen({ machineId, klaar, annuleer }: {
  machineId?: string
  klaar: (werkorderId: string) => void
  annuleer: () => void
}) {
  const [banen, setBanen] = useState<Keuze[]>([])
  const [baan, setBaan] = useState('')
  const [soort, setSoort] = useState<'machine' | 'object'>('machine')
  const [doelen, setDoelen] = useState<Keuze[]>([])
  const [doel, setDoel] = useState(machineId ?? '')
  const [omschrijving, setOmschrijving] = useState('')
  const [urgentie, setUrgentie] = useState('normaal')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    if (machineId) return
    supabase.from('locaties').select('id, naam').eq('soort', 'baan').eq('actief', true).order('naam')
      .then(({ data }) => setBanen(data ?? []))
  }, [machineId])

  useEffect(() => {
    if (machineId || !baan) return setDoelen([])
    setDoel('')
    if (soort === 'machine') {
      supabase.from('machines').select('id, naam, merk, model').eq('locatie_id', baan).is('gearchiveerd_op', null).order('naam')
        .then(({ data }) => setDoelen((data ?? []).map((m) => ({ id: m.id, naam: m.naam ?? ([m.merk, m.model].filter(Boolean).join(' ') || 'Machine') }))))
    } else {
      // Installaties: objecten op de baan (pompstations, regelkasten, filters, ...).
      supabase.from('objecten').select('id, code, objecttypes(naam)').eq('locatie_id', baan).is('gearchiveerd_op', null).order('code')
        .then(({ data }) => setDoelen((data ?? []).map((o) => ({ id: o.id, naam: objectTitel(o as never) ?? o.id }))))
    }
  }, [machineId, baan, soort])

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    if (!doel) return setFout('Kies een machine of installatie.')
    setBezig(true)
    setFout(null)
    const { data, error } = await supabase.from('werkorders').insert({
      machine_id: soort === 'machine' ? doel : null,
      object_id: soort === 'object' ? doel : null,
      omschrijving, urgentie,
    }).select('id').single()
    setBezig(false)
    if (error || !data) return setFout('Aanvragen mislukt.')
    klaar(data.id)
  }

  return (
    <form className="kaart" onSubmit={opslaan}>
      <h2>Werkorder aanvragen</h2>
      {!machineId && (
        <>
          <label htmlFor="wo-baan">Baan</label>
          <select id="wo-baan" required value={baan} onChange={(e) => setBaan(e.target.value)}>
            <option value="">— kies baan —</option>
            {banen.map((b) => <option key={b.id} value={b.id}>{b.naam}</option>)}
          </select>
          <div className="schakelaar filterbalk">
            <button type="button" className={`knop ${soort === 'machine' ? '' : 'tweede'}`} onClick={() => setSoort('machine')}>Machine</button>
            <button type="button" className={`knop ${soort === 'object' ? '' : 'tweede'}`} onClick={() => setSoort('object')}>Installatie op de baan</button>
          </div>
          <select aria-label={soort === 'machine' ? 'Machine' : 'Installatie'} required value={doel} onChange={(e) => setDoel(e.target.value)} disabled={!baan}>
            <option value="">{baan ? (doelen.length ? '— kies —' : 'Niets gevonden op deze baan') : 'Kies eerst een baan'}</option>
            {doelen.map((d) => <option key={d.id} value={d.id}>{d.naam}</option>)}
          </select>
        </>
      )}
      <label htmlFor="wo-omschrijving">Wat moet er gebeuren?</label>
      <input id="wo-omschrijving" required value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)}
             placeholder="Bijv. messen slijpen, olie verversen, lekkage pompstation" />
      <label htmlFor="wo-urgentie">Urgentie</label>
      <select id="wo-urgentie" value={urgentie} onChange={(e) => setUrgentie(e.target.value)}>
        {Object.entries(urgentieNamen).map(([w, n]) => <option key={w} value={w}>{n}</option>)}
      </select>
      <p className="zacht klein-tekst">Een defect meld je gewoon als storing op de machine: daar komt automatisch een werkorder van.</p>
      {fout && <div className="melding fout">{fout}</div>}
      <div className="knoppenrij">
        <button className="knop" disabled={bezig}>{bezig ? 'Bezig…' : 'Aanvragen'}</button>
        <button type="button" className="knop tweede" onClick={annuleer}>Annuleren</button>
      </div>
    </form>
  )
}
