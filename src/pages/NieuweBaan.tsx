import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { puntEwkt } from '../kaart/data'

type Adres = { weergavenaam: string; lonlat: [number, number] }

// Gangbare indelingen; namen en nummers zijn later aan te passen bij Beheer → Banen.
const indelingen: { sleutel: string; naam: string; lussen: { naam: string; eerste_hole: number; aantal_holes: number }[] }[] = [
  { sleutel: '18', naam: '18 holes, één lus', lussen: [{ naam: 'Baan', eerste_hole: 1, aantal_holes: 18 }] },
  { sleutel: '2x9', naam: '2 × 9 holes (Geel 1–9, Rood 10–18)', lussen: [
    { naam: 'Geel', eerste_hole: 1, aantal_holes: 9 }, { naam: 'Rood', eerste_hole: 10, aantal_holes: 9 }] },
  { sleutel: '3x9', naam: '3 × 9 holes (Geel, Rood, Blauw)', lussen: [
    { naam: 'Geel', eerste_hole: 1, aantal_holes: 9 }, { naam: 'Rood', eerste_hole: 10, aantal_holes: 9 },
    { naam: 'Blauw', eerste_hole: 19, aantal_holes: 9 }] },
  { sleutel: '9', naam: '9 holes', lussen: [{ naam: 'Baan', eerste_hole: 1, aantal_holes: 9 }] },
  { sleutel: 'later', naam: 'Later instellen', lussen: [] },
]

// PDOK Locatieserver: gratis adreszoeker van de overheid (geen sleutel nodig).
async function zoekAdres(q: string): Promise<Adres[]> {
  const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(q)}&rows=6&fl=weergavenaam,centroide_ll`
  const antwoord = await fetch(url)
  if (!antwoord.ok) throw new Error('adreszoeker')
  const { response } = await antwoord.json() as { response: { docs: { weergavenaam: string; centroide_ll: string }[] } }
  return response.docs.map((d) => {
    const [lon, lat] = d.centroide_ll.replace(/POINT\(|\)/g, '').split(' ').map(Number)
    return { weergavenaam: d.weergavenaam, lonlat: [lon, lat] }
  })
}

export default function NieuweBaan() {
  const navigeer = useNavigate()
  const [naam, setNaam] = useState('')
  const [klantnaam, setKlantnaam] = useState('')
  const [zoekterm, setZoekterm] = useState('')
  const [treffers, setTreffers] = useState<Adres[] | null>(null)
  const [adres, setAdres] = useState<Adres | null>(null)
  const [indeling, setIndeling] = useState('18')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function zoek() {
    if (!zoekterm.trim()) return
    setFout(null)
    try {
      setTreffers(await zoekAdres(zoekterm))
    } catch {
      setFout('Adres zoeken lukt nu niet. Probeer het later, of maak de baan aan zonder adres.')
    }
  }

  async function aanmaken(e: FormEvent) {
    e.preventDefault()
    setBezig(true)
    setFout(null)
    const { data: locatie, error } = await supabase.from('locaties').insert({
      naam: naam.trim(),
      klantnaam: klantnaam.trim() || null,
      adres: adres?.weergavenaam ?? null,
      geom: adres ? puntEwkt(adres.lonlat) : null,
    }).select('id').single()
    if (error || !locatie) {
      setBezig(false)
      return setFout(error?.code === '23505' ? 'Er bestaat al een baan met deze naam.' : 'Aanmaken mislukt. Probeer het opnieuw.')
    }
    const lussen = indelingen.find((i) => i.sleutel === indeling)!.lussen
    if (lussen.length) {
      const { error: lusFout } = await supabase.from('lussen')
        .insert(lussen.map((l, i) => ({ ...l, locatie_id: locatie.id, volgorde: i + 1 })))
      if (lusFout) {
        setBezig(false)
        return setFout('De baan is aangemaakt, maar de lussen niet. Stel ze in bij Beheer → Banen.')
      }
    }
    navigeer(`/beheer/banen/${locatie.id}`)
  }

  return (
    <div className="nieuwe-baan">
      <p><Link to="/beheer/banen">← Alle banen</Link></p>
      <h1>Nieuwe baan</h1>
      <p className="zacht">
        Daarna kom je bij de instellingen van de baan: logo, baanfoto, lussen en holes. Teken de baan vervolgens met
        de knop Tekenen op de kaart, en geef het team toegang bij Beheer → Gebruikers.
      </p>
      <form className="kaart formulier" onSubmit={aanmaken}>
        <label htmlFor="nb-naam">Naam van de baan</label>
        <input id="nb-naam" required value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Bijv. Golfpark De Hoge Dijk" />

        <label htmlFor="nb-klant">Klant / eigenaar (optioneel)</label>
        <input id="nb-klant" value={klantnaam} onChange={(e) => setKlantnaam(e.target.value)} />

        <label htmlFor="nb-adres">Adres (voor de plek op de kaart)</label>
        {adres ? (
          <div className="lus-rij">
            <span>{adres.weergavenaam}</span>
            <button type="button" className="knop tweede klein" onClick={() => { setAdres(null); setTreffers(null) }}>Wijzigen</button>
          </div>
        ) : (
          <>
            <div className="lus-rij">
              <input id="nb-adres" value={zoekterm} onChange={(e) => setZoekterm(e.target.value)} placeholder="Straat, huisnummer, plaats"
                     onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); zoek() } }} />
              <button type="button" className="knop tweede" onClick={zoek}>Zoeken</button>
            </div>
            {treffers && (treffers.length ? (
              <ul className="lijst">
                {treffers.map((t) => (
                  <li key={t.weergavenaam}>
                    <button type="button" className="knop tweede breed links" onClick={() => setAdres(t)}>{t.weergavenaam}</button>
                  </li>
                ))}
              </ul>
            ) : <p className="zacht">Niets gevonden.</p>)}
          </>
        )}

        <fieldset>
          <legend>Indeling</legend>
          {indelingen.map((i) => (
            <label key={i.sleutel} className="vink">
              <input type="radio" name="indeling" checked={indeling === i.sleutel} onChange={() => setIndeling(i.sleutel)} />
              <span>{i.naam}</span>
            </label>
          ))}
        </fieldset>

        {fout && <div className="melding fout">{fout}</div>}
        <div className="actiebalk">
          <button className="knop" disabled={bezig || !naam.trim()}>{bezig ? 'Bezig…' : 'Baan aanmaken'}</button>
          <button type="button" className="knop tweede" onClick={() => navigeer('/beheer/banen')}>Annuleren</button>
        </div>
      </form>
    </div>
  )
}
