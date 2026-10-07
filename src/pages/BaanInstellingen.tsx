import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { huisstijlUrl, supabase } from '../lib/supabase'
import { LocatieProvider, useLocatie } from '../lib/locatie'
import { logoBijsnijden } from '../lib/logo'
import BaanfotoInstelling from '../components/BaanfotoInstelling'

// Beheer → Banen → één baan: klantlogo, baanfoto, lussen en holes.
export default function BaanInstellingen() {
  const { locatieId } = useParams()
  return (
    <div className="baan-instellingen">
      <p><Link to="/beheer/banen">← Alle banen</Link></p>
      <LocatieProvider key={locatieId} locatieId={locatieId!}>
        <Kop />
        <Klantlogo />
        <BaanfotoInstelling />
        <Lussen />
      </LocatieProvider>
    </div>
  )
}

function Kop() {
  const { locatie } = useLocatie()
  return (
    <div className="kop-met-knop">
      <h2 className="beheer-titel">{locatie.naam}</h2>
      <Link className="knop tweede" to={`/locatie/${locatie.id}`}>Open baan →</Link>
    </div>
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
