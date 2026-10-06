import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useSessie } from '../lib/sessie'
import Kopbalk from '../components/Kopbalk'

// Tweestapsverificatie (TOTP) voor beheer en onderhoudsmanager.
// Eerste keer: QR-code scannen met een authenticator-app; daarna alleen de 6-cijferige code.
export default function Tweestaps() {
  const { sessie, tweestapsNodig, verversen } = useSessie()
  const navigeer = useNavigate()
  const [factorId, setFactorId] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    if (!sessie) return
    ;(async () => {
      const { data } = await supabase.auth.mfa.listFactors()
      const bestaand = data?.totp.find((f) => f.status === 'verified')
      if (bestaand) return setFactorId(bestaand.id)
      const { data: nieuw, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'HGM Onderhoud' })
      if (error) return setFout(error.message)
      setFactorId(nieuw.id)
      setQr(nieuw.totp.qr_code)
    })()
  }, [sessie])

  if (!sessie) return <Navigate to="/inloggen" replace />
  if (!tweestapsNodig) return <Navigate to="/" replace />

  async function bevestig(e: FormEvent) {
    e.preventDefault()
    if (!factorId) return
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    if (error) return setFout('Code klopt niet. Probeer het opnieuw.')
    await verversen()
    navigeer('/')
  }

  return (
    <>
      <Kopbalk titel="Tweestapsverificatie" />
      <main>
        <h1>Tweestapsverificatie</h1>
        {fout && <div className="melding fout">{fout}</div>}
        <form className="kaart" onSubmit={bevestig}>
          {qr && (
            <>
              <p>Scan deze code met een authenticator-app (bijv. Microsoft of Google Authenticator).</p>
              <img className="qr" src={qr} alt="QR-code voor authenticator-app" />
            </>
          )}
          <label htmlFor="code">Code uit de app</label>
          <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
                 onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <button className="knop breed" disabled={code.length !== 6}>Bevestigen</button>
        </form>
      </main>
    </>
  )
}
