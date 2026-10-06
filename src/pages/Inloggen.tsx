import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useSessie } from '../lib/sessie'
import Kopbalk from '../components/Kopbalk'

export default function Inloggen() {
  const { sessie } = useSessie()
  const [email, setEmail] = useState('')
  const [wachtwoord, setWachtwoord] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  if (sessie) return <Navigate to="/" replace />

  async function metWachtwoord(e: FormEvent) {
    e.preventDefault()
    setBezig(true)
    setFout(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password: wachtwoord })
    if (error) setFout('Inloggen mislukt. Controleer e-mailadres en wachtwoord.')
    setBezig(false)
  }

  async function metLink() {
    if (!email) return setFout('Vul eerst je e-mailadres in.')
    setBezig(true)
    setFout(null)
    // Alleen bestaande accounts; nieuwe gebruikers worden door beheer uitgenodigd.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
    })
    if (error) setFout('Versturen mislukt. Klopt het e-mailadres?')
    else setInfo(`Er is een inloglink gestuurd naar ${email}.`)
    setBezig(false)
  }

  return (
    <>
      <Kopbalk titel="HGM Golf Onderhoud" />
      <main>
        <h1>Inloggen</h1>
        {fout && <div className="melding fout">{fout}</div>}
        {info && <div className="melding info">{info}</div>}
        <form className="kaart" onSubmit={metWachtwoord}>
          <label htmlFor="email">E-mailadres</label>
          <input id="email" type="email" autoComplete="email" required value={email}
                 onChange={(e) => setEmail(e.target.value)} />
          <label htmlFor="wachtwoord">Wachtwoord</label>
          <input id="wachtwoord" type="password" autoComplete="current-password" value={wachtwoord}
                 onChange={(e) => setWachtwoord(e.target.value)} />
          <button className="knop breed" disabled={bezig || !wachtwoord}>Inloggen</button>
        </form>
        <button className="knop tweede breed" disabled={bezig} onClick={metLink}>
          Stuur mij een inloglink
        </button>
      </main>
    </>
  )
}
