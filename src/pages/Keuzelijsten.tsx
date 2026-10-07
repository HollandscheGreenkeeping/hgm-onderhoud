import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Lijst } from '../lib/keuzelijst'

type Waarde = { id: string; naam: string; eenheid: string | null; volgorde: number; gearchiveerd: boolean; locatie_ids: string[] | null }

const lijsten: [Lijst, string][] = [
  ['storingstype', 'Storingstypes'],
  ['activiteit', 'Activiteiten'],
  ['middel', 'Middelen (bemesting en gewasbescherming)'],
  ['machinetype', 'Machinetypes'],
  ['keuringsoort', 'Keuringen (soorten)'],
]

// Beheer → Keuzelijsten: gelden voor alle banen, of per waarde voor gekozen banen. Gearchiveerde waarden
// verdwijnen uit de keuzelijst maar blijven zichtbaar in oude registraties.
export default function Keuzelijsten() {
  const [lijst, setLijst] = useState<Lijst>('storingstype')
  const [waarden, setWaarden] = useState<Waarde[]>([])
  const [banen, setBanen] = useState<{ id: string; naam: string }[]>([])
  const [naam, setNaam] = useState('')
  const [eenheid, setEenheid] = useState('')
  const [fout, setFout] = useState<string | null>(null)

  const laad = useCallback(() => {
    supabase.from('keuzelijst_waarden').select('id, naam, eenheid, volgorde, gearchiveerd, locatie_ids')
      .eq('lijst', lijst).order('gearchiveerd').order('volgorde').order('naam')
      .then(({ data }) => setWaarden(data ?? []))
  }, [lijst])
  useEffect(laad, [laad])
  useEffect(() => {
    supabase.from('locaties').select('id, naam').eq('soort', 'baan').order('naam').then(({ data }) => setBanen(data ?? []))
  }, [])

  async function wijzig(id: string, velden: Partial<Waarde>) {
    const { error } = await supabase.from('keuzelijst_waarden').update(velden).eq('id', id)
    setFout(error ? (error.code === '23505' ? 'Deze naam bestaat al.' : 'Opslaan mislukt.') : null)
    laad()
  }

  async function verplaats(i: number, richting: -1 | 1) {
    const actief = waarden.filter((w) => !w.gearchiveerd)
    const j = i + richting
    if (j < 0 || j >= actief.length) return
    const nieuw = [...actief]
    ;[nieuw[i], nieuw[j]] = [nieuw[j], nieuw[i]]
    await Promise.all(nieuw.map((w, k) => supabase.from('keuzelijst_waarden').update({ volgorde: k + 1 }).eq('id', w.id)))
    laad()
  }

  async function voegToe(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('keuzelijst_waarden').insert({
      lijst, naam, eenheid: lijst === 'middel' ? eenheid || null : null,
      volgorde: waarden.filter((w) => !w.gearchiveerd).length + 1,
    })
    if (error) return setFout(error.code === '23505' ? 'Deze naam bestaat al (mogelijk gearchiveerd).' : 'Opslaan mislukt.')
    setNaam('')
    setEenheid('')
    setFout(null)
    laad()
  }

  const actief = waarden.filter((w) => !w.gearchiveerd)
  const archief = waarden.filter((w) => w.gearchiveerd)

  return (
    <section className="kaart">
      <h2>Keuzelijsten</h2>
      <p className="zacht">Gelden voor alle banen, tenzij je per waarde banen kiest. Gearchiveerde waarden verdwijnen
        uit de keuzelijst maar blijven zichtbaar in oude registraties.</p>
      <div className="schakelaar filterbalk">
        {lijsten.map(([l, n]) => (
          <button key={l} className={`knop ${lijst === l ? '' : 'tweede'}`} onClick={() => setLijst(l)}>{n.split(' ')[0]}</button>
        ))}
      </div>
      {fout && <div className="melding fout">{fout}</div>}
      <ul className="lijst">
        {actief.map((w, i) => (
          <li key={w.id} className="waarde-rij">
            <div className="lus-rij">
              <input aria-label="Naam" defaultValue={w.naam}
                     onBlur={(e) => e.target.value && e.target.value !== w.naam && wijzig(w.id, { naam: e.target.value })} />
              {lijst === 'middel' && (
                <input aria-label="Eenheid" placeholder="kg / l" defaultValue={w.eenheid ?? ''} className="smal"
                       onBlur={(e) => e.target.value !== (w.eenheid ?? '') && wijzig(w.id, { eenheid: e.target.value || null })} />
              )}
              <button className="knop tweede klein" aria-label="Omhoog" disabled={i === 0} onClick={() => verplaats(i, -1)}>↑</button>
              <button className="knop tweede klein" aria-label="Omlaag" disabled={i === actief.length - 1} onClick={() => verplaats(i, 1)}>↓</button>
              <button className="knop tweede klein" onClick={() => wijzig(w.id, { gearchiveerd: true })}>Archiveren</button>
            </div>
            <details>
              <summary className="zacht">{w.locatie_ids ? `Alleen ${w.locatie_ids.length} baan/banen` : 'Alle banen'}</summary>
              {banen.map((b) => (
                <label key={b.id} className="vink">
                  <input type="checkbox" checked={!w.locatie_ids || w.locatie_ids.includes(b.id)}
                         onChange={(e) => {
                           const huidig = w.locatie_ids ?? banen.map((x) => x.id)
                           const nieuw = e.target.checked ? [...huidig, b.id] : huidig.filter((x) => x !== b.id)
                           wijzig(w.id, { locatie_ids: nieuw.length === banen.length ? null : nieuw })
                         }} />
                  {b.naam}
                </label>
              ))}
            </details>
          </li>
        ))}
      </ul>
      {actief.length === 0 && <p className="zacht">Nog geen waarden.</p>}
      <form className="lus-rij" onSubmit={voegToe}>
        <input aria-label="Nieuwe waarde" placeholder="Nieuwe waarde" required value={naam} onChange={(e) => setNaam(e.target.value)} />
        {lijst === 'middel' && <input aria-label="Eenheid" placeholder="kg / l" className="smal" value={eenheid} onChange={(e) => setEenheid(e.target.value)} />}
        <button className="knop">Toevoegen</button>
      </form>
      {archief.length > 0 && (
        <details>
          <summary>Gearchiveerd ({archief.length})</summary>
          <ul className="lijst">
            {archief.map((w) => (
              <li key={w.id} className="lus-rij">
                <span>{w.naam}</span>
                <button className="knop tweede klein" onClick={() => wijzig(w.id, { gearchiveerd: false })}>Terugzetten</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
