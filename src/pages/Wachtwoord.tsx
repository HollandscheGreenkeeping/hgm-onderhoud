import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useSessie } from '../lib/sessie'
import Kopbalk from '../components/Kopbalk'

// Eigen wachtwoord kiezen. Verplicht na een tijdelijk wachtwoord van beheer.
export default function Wachtwoord() {
  const { sessie, verversen } = useSessie()
  const navigeer = useNavigate()
  const [nieuw, setNieuw] = useState('')
  const [herhaal, setHerhaal] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  if (!sessie) return <Navigate to="/inloggen" replace />
  const verplicht = Boolean(sessie.user.user_metadata?.wachtwoord_wijzigen)

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    if (nieuw.length < 10) return setFout('Kies minstens 10 tekens.')
    if (nieuw !== herhaal) return setFout('De twee wachtwoorden zijn niet gelijk.')
    setBezig(true)
    setFout(null)
    const { error } = await supabase.auth.updateUser({ password: nieuw, data: { wachtwoord_wijzigen: false } })
    setBezig(false)
    if (error) {
      return setFout(error.code === 'same_password' ? 'Kies een ander wachtwoord dan het tijdelijke.'
        : error.code === 'weak_password' ? 'Dit wachtwoord is te zwak of komt voor in gelekte lijsten.'
        : 'Wijzigen mislukt. Probeer het opnieuw.')
    }
    await verversen()
    navigeer('/', { replace: true })
  }

  return (
    <>
      <Kopbalk titel="HGM Golf Onderhoud" />
      <main className="zonder-menubalk">
        <h1>{verplicht ? 'Kies je eigen wachtwoord' : 'Wachtwoord wijzigen'}</h1>
        {verplicht && <p>Je bent ingelogd met een tijdelijk wachtwoord. Kies nu een eigen wachtwoord van minstens 10 tekens.</p>}
        <form className="kaart" onSubmit={opslaan}>
          <input type="email" autoComplete="username" value={sessie.user.email ?? ''} readOnly hidden />
          <label htmlFor="nieuw">Nieuw wachtwoord</label>
          <input id="nieuw" type="password" autoComplete="new-password" required value={nieuw} onChange={(e) => setNieuw(e.target.value)} />
          <label htmlFor="herhaal">Herhaal nieuw wachtwoord</label>
          <input id="herhaal" type="password" autoComplete="new-password" required value={herhaal} onChange={(e) => setHerhaal(e.target.value)} />
          {fout && <div className="melding fout">{fout}</div>}
          <div className="actiebalk">
            <button className="knop" disabled={bezig}>{bezig ? 'Opslaan…' : 'Opslaan'}</button>
            {!verplicht && <button type="button" className="knop tweede" onClick={() => navigeer(-1)}>Annuleren</button>}
          </div>
        </form>
      </main>
    </>
  )
}
