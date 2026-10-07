import { useState, type ChangeEvent } from 'react'
import { huisstijlUrl } from '../lib/supabase'
import { useLocatie } from '../lib/locatie'
import { uploadBaanfoto, verwijderBaanfoto } from '../lib/baanfoto'

// Instellingen (beheer): de foto op de tegel van deze baan in "Alle banen".
export default function BaanfotoInstelling() {
  const { locatie, herlaad } = useLocatie()
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState<{ soort: 'fout' | 'info'; tekst: string } | null>(null)

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const bestand = e.target.files?.[0]
    e.target.value = ''
    if (!bestand) return
    if (!bestand.type.startsWith('image/')) return setMelding({ soort: 'fout', tekst: 'Kies een foto (JPG of PNG).' })
    setBezig(true)
    const fout = await uploadBaanfoto(locatie.id, locatie.baanfoto_pad, bestand)
    setBezig(false)
    if (fout) return setMelding({ soort: 'fout', tekst: 'Uploaden mislukt. Probeer een andere foto.' })
    setMelding({ soort: 'info', tekst: 'Baanfoto opgeslagen.' })
    herlaad()
  }

  async function verwijder() {
    if (!locatie.baanfoto_pad) return
    setBezig(true)
    const fout = await verwijderBaanfoto(locatie.id, locatie.baanfoto_pad)
    setBezig(false)
    setMelding(fout ? { soort: 'fout', tekst: 'Verwijderen mislukt.' } : { soort: 'info', tekst: 'Baanfoto verwijderd.' })
    herlaad()
  }

  return (
    <section className="kaart">
      <h2>Baanfoto {locatie.naam}</h2>
      <p className="zacht">Op de tegel in "Alle banen". Liggend werkt het best, bijvoorbeeld een green in ochtendlicht.</p>
      {melding && <div className={`melding ${melding.soort}`}>{melding.tekst}</div>}
      {locatie.baanfoto_pad && (
        <div className="baanfoto-voorbeeld"><img src={huisstijlUrl(locatie.baanfoto_pad)} alt="Huidige baanfoto" /></div>
      )}
      <div className="knoppenrij">
        <label className="knop tweede">
          {bezig ? 'Bezig…' : locatie.baanfoto_pad ? 'Andere foto kiezen' : 'Foto kiezen'}
          <input type="file" accept="image/*" hidden disabled={bezig} onChange={upload} />
        </label>
        {locatie.baanfoto_pad && <button className="knop tweede" disabled={bezig} onClick={verwijder}>Verwijderen</button>}
      </div>
    </section>
  )
}
