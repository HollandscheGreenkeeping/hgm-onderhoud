import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { certificaatUploaden, volgendeGeldigTot, type Keuring } from '../lib/werkplaats'

type Keuze = { id: string; naam: string }

// Keuring vastleggen of bijwerken. Met machineId staat de machine vast (machinepagina);
// anders kies je baan en machine (Werkplaats → Keuringen). Bij "opnieuw gekeurd" schuift
// geldig tot op met het interval.
export default function KeuringFormulier({ keuring, machineId, klaar, annuleer }: {
  keuring?: Keuring
  machineId?: string
  klaar: () => void
  annuleer: () => void
}) {
  const [soorten, setSoorten] = useState<Keuze[]>([])
  const [banen, setBanen] = useState<Keuze[]>([])
  const [machines, setMachines] = useState<Keuze[]>([])
  const [baan, setBaan] = useState('')
  const [machine, setMachine] = useState(keuring?.machine_id ?? machineId ?? '')
  const [soort, setSoort] = useState(keuring?.soort_id ?? '')
  const [gekeurdOp, setGekeurdOp] = useState(keuring?.gekeurd_op ?? new Date().toISOString().slice(0, 10))
  const [maanden, setMaanden] = useState(String(keuring?.interval_maanden ?? 12))
  const [geldigTot, setGeldigTot] = useState(keuring?.geldig_tot ?? '')
  const [herinnering, setHerinnering] = useState(String(keuring?.herinnering_dagen ?? 30))
  const [keurder, setKeurder] = useState(keuring?.keurder ?? '')
  const [opmerking, setOpmerking] = useState(keuring?.opmerking ?? '')
  const [certificaat, setCertificaat] = useState<File | null>(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const vast = Boolean(keuring || machineId)

  useEffect(() => {
    supabase.from('keuzelijst_waarden').select('id, naam').eq('lijst', 'keuringsoort').eq('gearchiveerd', false).order('volgorde')
      .then(({ data }) => setSoorten(data ?? []))
    if (!vast) {
      supabase.from('locaties').select('id, naam').eq('soort', 'baan').eq('actief', true).order('naam').then(({ data }) => setBanen(data ?? []))
    }
  }, [vast])

  useEffect(() => {
    if (vast || !baan) return setMachines([])
    supabase.from('machines').select('id, naam, merk, model').eq('locatie_id', baan).is('gearchiveerd_op', null).order('naam')
      .then(({ data }) => setMachines((data ?? []).map((m) => ({ id: m.id, naam: m.naam ?? ([m.merk, m.model].filter(Boolean).join(' ') || 'Machine') }))))
  }, [vast, baan])

  // Geldig tot volgt uit gekeurd op + interval zodra je een van beide wijzigt (niet bij openen,
  // zodat een bestaande of zelf ingevulde datum blijft staan).
  const eersteKeer = useRef(Boolean(keuring))
  useEffect(() => {
    if (eersteKeer.current) { eersteKeer.current = false; return }
    if (gekeurdOp && Number(maanden) > 0) setGeldigTot(volgendeGeldigTot(gekeurdOp, Number(maanden)))
  }, [gekeurdOp, maanden])

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    if (!machine) return setFout('Kies een machine.')
    if (!soort) return setFout('Kies de soort keuring (in te stellen bij Beheer → Keuzelijsten).')
    setBezig(true)
    setFout(null)
    const velden = {
      machine_id: machine, soort_id: soort, gekeurd_op: gekeurdOp || null, geldig_tot: geldigTot,
      interval_maanden: Number(maanden) || null, herinnering_dagen: Number(herinnering) || 0,
      keurder: keurder || null, opmerking: opmerking || null,
    }
    const { data, error } = keuring
      ? await supabase.from('keuringen').update(velden).eq('id', keuring.id).select('id, locatie_id').single()
      : await supabase.from('keuringen').insert(velden).select('id, locatie_id').single()
    if (error || !data) { setBezig(false); return setFout('Opslaan mislukt.') }
    if (certificaat) {
      try {
        const pad = await certificaatUploaden(data.locatie_id, data.id, certificaat)
        await supabase.from('keuringen').update({ certificaat_pad: pad }).eq('id', data.id)
      } catch {
        setBezig(false)
        return setFout('De keuring is opgeslagen, maar het certificaat niet (PDF of foto, max. 15 MB).')
      }
    }
    setBezig(false)
    klaar()
  }

  return (
    <form className="kaart" onSubmit={opslaan}>
      <h2>{keuring ? 'Keuring bijwerken' : 'Keuring vastleggen'}</h2>
      {!vast && (
        <div className="twee-kolommen">
          <div>
            <label htmlFor="k-baan">Baan</label>
            <select id="k-baan" required value={baan} onChange={(e) => { setBaan(e.target.value); setMachine('') }}>
              <option value="">— kies baan —</option>
              {banen.map((b) => <option key={b.id} value={b.id}>{b.naam}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="k-machine">Machine</label>
            <select id="k-machine" required value={machine} disabled={!baan} onChange={(e) => setMachine(e.target.value)}>
              <option value="">— kies machine —</option>
              {machines.map((m) => <option key={m.id} value={m.id}>{m.naam}</option>)}
            </select>
          </div>
        </div>
      )}
      <label htmlFor="k-soort">Soort keuring</label>
      <select id="k-soort" required value={soort} onChange={(e) => setSoort(e.target.value)}>
        <option value="">{soorten.length ? '— kies —' : '(nog geen soorten: Beheer → Keuzelijsten)'}</option>
        {soorten.map((s) => <option key={s.id} value={s.id}>{s.naam}</option>)}
      </select>
      <div className="twee-kolommen">
        <div>
          <label htmlFor="k-gekeurd">Gekeurd op</label>
          <input id="k-gekeurd" type="date" value={gekeurdOp} onChange={(e) => setGekeurdOp(e.target.value)} />
        </div>
        <div>
          <label htmlFor="k-interval">Elke … maanden</label>
          <input id="k-interval" type="number" min={1} max={120} value={maanden} onChange={(e) => setMaanden(e.target.value)} />
        </div>
        <div>
          <label htmlFor="k-geldig">Geldig tot</label>
          <input id="k-geldig" type="date" required value={geldigTot} onChange={(e) => setGeldigTot(e.target.value)} />
        </div>
        <div>
          <label htmlFor="k-herinnering">Herinnering … dagen vooraf</label>
          <input id="k-herinnering" type="number" min={0} max={365} value={herinnering} onChange={(e) => setHerinnering(e.target.value)} />
        </div>
      </div>
      <label htmlFor="k-keurder">Keurder</label>
      <input id="k-keurder" value={keurder} onChange={(e) => setKeurder(e.target.value)} placeholder="Bijv. keuringsinstantie of naam" />
      <label htmlFor="k-opmerking">Opmerking</label>
      <input id="k-opmerking" value={opmerking} onChange={(e) => setOpmerking(e.target.value)} />
      <label htmlFor="k-certificaat">Certificaat {keuring?.certificaat_pad ? '(vervangen)' : ''}</label>
      <input id="k-certificaat" type="file" accept="application/pdf,image/*" onChange={(e) => setCertificaat(e.target.files?.[0] ?? null)} />
      {fout && <div className="melding fout">{fout}</div>}
      <div className="knoppenrij">
        <button className="knop" disabled={bezig}>{bezig ? 'Bezig…' : 'Opslaan'}</button>
        <button type="button" className="knop tweede" onClick={annuleer}>Annuleren</button>
      </div>
    </form>
  )
}
