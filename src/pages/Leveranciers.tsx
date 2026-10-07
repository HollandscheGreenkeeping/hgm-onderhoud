import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useMagGoedkeuren, type Leverancier } from '../lib/inkoop'

// Inkoop → Leveranciers met contactgegevens en afspraken. Beheer en onderhoudsmanager beheren ze.
export default function Leveranciers() {
  const beheerder = useMagGoedkeuren()
  const [leveranciers, setLeveranciers] = useState<Leverancier[] | null>(null)
  const [bewerken, setBewerken] = useState<Leverancier | 'nieuw' | null>(null)

  const laad = useCallback(() => {
    supabase.from('leveranciers').select('*').is('gearchiveerd_op', null).order('naam')
      .then(({ data }) => setLeveranciers(data ?? []))
  }, [])
  useEffect(laad, [laad])

  return (
    <>
      <div className="kop-met-knop">
        <h1>Leveranciers</h1>
        {beheerder && !bewerken && <button className="knop" onClick={() => setBewerken('nieuw')}>+ Leverancier</button>}
      </div>
      {bewerken && (
        <LeverancierFormulier leverancier={bewerken === 'nieuw' ? undefined : bewerken}
                              klaar={() => { setBewerken(null); laad() }} annuleer={() => setBewerken(null)} />
      )}
      {leveranciers === null && <p className="zacht">Laden…</p>}
      {leveranciers?.length === 0 && <p className="zacht">Nog geen leveranciers.</p>}
      <ul className="lijst">
        {leveranciers?.map((l) => (
          <li key={l.id} className="rij">
            <strong>{l.naam}</strong>
            <span className="zacht">
              {[l.contactpersoon, l.telefoon, l.klantnummer && `klantnr. ${l.klantnummer}`].filter(Boolean).join(' · ')}
            </span>
            {l.email && <a href={`mailto:${l.email}`}>{l.email}</a>}
            {l.afspraken && <span className="klein-tekst">{l.afspraken}</span>}
            {beheerder && (
              <div className="knoppenrij">
                <button className="knop tweede klein" onClick={() => setBewerken(l)}>Bewerken</button>
                <button className="knop tweede klein" onClick={async () => {
                  if (!window.confirm(`${l.naam} archiveren? Oude bestellingen blijven bewaard.`)) return
                  await supabase.from('leveranciers').update({ gearchiveerd_op: new Date().toISOString() }).eq('id', l.id)
                  laad()
                }}>Archiveren</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

function LeverancierFormulier({ leverancier, klaar, annuleer }: { leverancier?: Leverancier; klaar: () => void; annuleer: () => void }) {
  const leeg = { naam: '', contactpersoon: '', email: '', telefoon: '', adres: '', website: '', klantnummer: '', afspraken: '' }
  const [v, setV] = useState({ ...leeg, ...Object.fromEntries(Object.entries(leverancier ?? {}).map(([k, x]) => [k, x ?? ''])) })
  const [fout, setFout] = useState<string | null>(null)
  const zet = (k: keyof typeof leeg) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    const velden = { ...Object.fromEntries(Object.keys(leeg).map((k) => [k, (v as Record<string, string>)[k] || null])), naam: v.naam }
    const { error } = leverancier
      ? await supabase.from('leveranciers').update(velden).eq('id', leverancier.id)
      : await supabase.from('leveranciers').insert(velden)
    if (error) return setFout(error.code === '23505' ? 'Er is al een leverancier met deze naam.' : 'Opslaan mislukt.')
    klaar()
  }

  return (
    <form className="kaart" onSubmit={opslaan}>
      <h2>{leverancier ? 'Leverancier bewerken' : 'Nieuwe leverancier'}</h2>
      <label htmlFor="l-naam">Naam</label>
      <input id="l-naam" required value={v.naam} onChange={zet('naam')} />
      <div className="twee-kolommen">
        <div><label htmlFor="l-contact">Contactpersoon</label><input id="l-contact" value={v.contactpersoon} onChange={zet('contactpersoon')} /></div>
        <div><label htmlFor="l-email">E-mail (voor bestellingen)</label><input id="l-email" type="email" value={v.email} onChange={zet('email')} /></div>
        <div><label htmlFor="l-tel">Telefoon</label><input id="l-tel" type="tel" value={v.telefoon} onChange={zet('telefoon')} /></div>
        <div><label htmlFor="l-klant">Ons klantnummer</label><input id="l-klant" value={v.klantnummer} onChange={zet('klantnummer')} /></div>
      </div>
      <label htmlFor="l-adres">Adres</label>
      <input id="l-adres" value={v.adres} onChange={zet('adres')} />
      <label htmlFor="l-web">Website</label>
      <input id="l-web" type="url" value={v.website} onChange={zet('website')} placeholder="https://" />
      <label htmlFor="l-afspraken">Afspraken</label>
      <textarea id="l-afspraken" rows={3} value={v.afspraken} onChange={zet('afspraken')} placeholder="Levertijd, minimale afname, kortingen" />
      {fout && <div className="melding fout">{fout}</div>}
      <div className="knoppenrij">
        <button className="knop">Opslaan</button>
        <button type="button" className="knop tweede" onClick={annuleer}>Annuleren</button>
      </div>
    </form>
  )
}
