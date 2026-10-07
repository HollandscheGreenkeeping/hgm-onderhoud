import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { huisstijlUrl, supabase } from '../lib/supabase'
import { useLocatie } from '../lib/locatie'
import type { Lijst } from '../lib/keuzelijst'
import BaanfotoInstelling from '../components/BaanfotoInstelling'
import { logoBijsnijden } from '../lib/logo'

// Beheer: klantlogo, baanfoto en lussen van deze baan, en de keuzelijsten (gelden voor alle banen,
// of per waarde voor gekozen banen).
export default function Instellingen() {
  const { isBeheer } = useLocatie()
  if (!isBeheer) return <main><div className="melding fout">Alleen voor beheer.</div></main>
  return (
    <main>
      <h1>Instellingen</h1>
      <Klantlogo />
      <BaanfotoInstelling />
      <Lussen />
      <Keuzelijsten />
    </main>
  )
}

function Klantlogo() {
  const { locatie, herlaad } = useLocatie()
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState<{ soort: 'fout' | 'info'; tekst: string } | null>(null)

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const bestand = e.target.files?.[0]
    if (!bestand) return
    if (!['image/png', 'image/svg+xml'].includes(bestand.type)) {
      return setMelding({ soort: 'fout', tekst: 'Gebruik een PNG of SVG met transparante achtergrond.' })
    }
    setBezig(true)
    const pad = `klantlogos/${locatie.id}-${Date.now()}.${bestand.type === 'image/png' ? 'png' : 'svg'}`
    const logo = await logoBijsnijden(bestand) // lege randen weg: logo overal zo groot mogelijk
    const { error } = await supabase.storage.from('huisstijl').upload(pad, logo, { contentType: bestand.type })
    const { error: fout } = error ? { error } : await supabase.from('locaties').update({ klantlogo_pad: pad }).eq('id', locatie.id)
    setBezig(false)
    if (fout) return setMelding({ soort: 'fout', tekst: 'Uploaden mislukt (max. 2 MB).' })
    if (locatie.klantlogo_pad) await supabase.storage.from('huisstijl').remove([locatie.klantlogo_pad])
    setMelding({ soort: 'info', tekst: 'Logo opgeslagen.' })
    herlaad()
  }

  return (
    <section className="kaart">
      <h2>Klantlogo {locatie.naam}</h2>
      <p className="zacht">Linksboven in de app, op de tegel in "Alle banen" en op klantrapportages. PNG of SVG, transparant,
        max. 2 MB. Lege randen worden automatisch weggesneden.</p>
      {melding && <div className={`melding ${melding.soort}`}>{melding.tekst}</div>}
      {locatie.klantlogo_pad && (
        <div className="logo-voorbeeld"><img src={huisstijlUrl(locatie.klantlogo_pad)} alt="Huidig klantlogo" /></div>
      )}
      <label className="knop tweede">
        {bezig ? 'Bezig…' : locatie.klantlogo_pad ? 'Ander logo kiezen' : 'Logo kiezen'}
        <input type="file" accept="image/png,image/svg+xml" hidden disabled={bezig} onChange={upload} />
      </label>
    </section>
  )
}

type Lus = { id: string; naam: string; volgorde: number; aantal_holes: number; eerste_hole: number }

function Lussen() {
  const { locatie } = useLocatie()
  const [lussen, setLussen] = useState<Lus[]>([])
  const [naam, setNaam] = useState('')
  const [aantal, setAantal] = useState('9')
  const [eerste, setEerste] = useState('1')
  const [fout, setFout] = useState<string | null>(null)

  const laad = useCallback(() => {
    supabase.from('lussen').select('id, naam, volgorde, aantal_holes, eerste_hole').eq('locatie_id', locatie.id).order('volgorde')
      .then(({ data }) => setLussen(data ?? []))
  }, [locatie.id])
  useEffect(laad, [laad])

  async function wijzig(id: string, velden: Partial<Lus>) {
    const { error } = await supabase.from('lussen').update(velden).eq('id', id)
    setFout(error ? 'Opslaan mislukt.' : null)
    laad()
  }

  async function voegToe(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('lussen').insert({
      locatie_id: locatie.id, naam, aantal_holes: Number(aantal), eerste_hole: Number(eerste) || 1, volgorde: lussen.length + 1,
    })
    if (error) return setFout(error.code === '23505' ? 'Er is al een lus met deze naam.' : 'Opslaan mislukt.')
    setNaam('')
    setFout(null)
    laad()
  }

  return (
    <section className="kaart">
      <h2>Lussen en holes</h2>
      <p className="zacht">
        Bijvoorbeeld "Geel" (holes 1–9) en "Rood" (eerste hole 10, 9 holes), of één lus van 18. Holes worden automatisch aangemaakt;
        teken ze daarna met de knop Tekenen op de kaart (of in QGIS). Minder holes instellen verwijdert geen bestaande holes.
      </p>
      {fout && <div className="melding fout">{fout}</div>}
      <ul className="lijst">
        {lussen.map((l) => (
          <li key={l.id} className="lus-rij">
            <input aria-label="Naam van de lus" defaultValue={l.naam}
                   onBlur={(e) => e.target.value && e.target.value !== l.naam && wijzig(l.id, { naam: e.target.value })} />
            <span className="zacht">holes</span>
            <input aria-label="Eerste hole" type="number" min={1} max={99} defaultValue={l.eerste_hole}
                   onBlur={(e) => Number(e.target.value) !== l.eerste_hole && wijzig(l.id, { eerste_hole: Number(e.target.value) })} />
            <span className="zacht">t/m {l.eerste_hole + l.aantal_holes - 1}, aantal</span>
            <input aria-label="Aantal holes" type="number" min={1} max={36} defaultValue={l.aantal_holes}
                   onBlur={(e) => Number(e.target.value) !== l.aantal_holes && wijzig(l.id, { aantal_holes: Number(e.target.value) })} />
          </li>
        ))}
      </ul>
      <form className="lus-rij" onSubmit={voegToe}>
        <input aria-label="Naam nieuwe lus" placeholder="Naam nieuwe lus" required value={naam} onChange={(e) => setNaam(e.target.value)} />
        <input aria-label="Eerste hole" title="Eerste holenummer" type="number" min={1} max={99} required value={eerste} onChange={(e) => setEerste(e.target.value)} />
        <input aria-label="Aantal holes" title="Aantal holes" type="number" min={1} max={36} required value={aantal} onChange={(e) => setAantal(e.target.value)} />
        <button className="knop">Toevoegen</button>
      </form>
    </section>
  )
}

type Waarde = { id: string; naam: string; eenheid: string | null; volgorde: number; gearchiveerd: boolean; locatie_ids: string[] | null }

const lijsten: [Lijst, string][] = [
  ['storingstype', 'Storingstypes'],
  ['activiteit', 'Activiteiten'],
  ['middel', 'Middelen (bemesting en gewasbescherming)'],
  ['machinetype', 'Machinetypes'],
]

function Keuzelijsten() {
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
    supabase.from('locaties').select('id, naam').order('naam').then(({ data }) => setBanen(data ?? []))
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
