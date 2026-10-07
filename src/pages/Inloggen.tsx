import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useSessie } from '../lib/sessie'
import InlogFilm from '../components/InlogFilm'

// Huisstijl 2a – inlogscherm. Ontwerp: Inloggen.dc.html. Klassen staan onderaan app.css (".inlog-…").
export default function Inloggen() {
  const { sessie } = useSessie()
  const [modus, setModus] = useState<'ww' | 'link'>('ww')
  const [email, setEmail] = useState('')
  const [wachtwoord, setWachtwoord] = useState('')
  const [toon, setToon] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [verstuurd, setVerstuurd] = useState(false)

  if (sessie) return <Navigate to="/" replace />

  function kies(m: 'ww' | 'link') { setModus(m); setFout(null); setVerstuurd(false) }

  async function verstuur(e: FormEvent) {
    e.preventDefault()
    if (!email) return setFout('Vul je e-mailadres in.')
    if (modus === 'ww' && !wachtwoord) return setFout('Vul je wachtwoord in, of kies "Met inloglink".')
    setBezig(true); setFout(null)
    if (modus === 'ww') {
      const { error } = await supabase.auth.signInWithPassword({ email, password: wachtwoord })
      if (error) setFout('Inloggen mislukt. Controleer e-mailadres en wachtwoord.')
    } else {
      // Alleen bestaande accounts; nieuwe gebruikers worden door beheer uitgenodigd.
      const { error } = await supabase.auth.signInWithOtp({
        email, options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
      })
      if (error) setFout('Versturen mislukt. Klopt het e-mailadres?')
      else setVerstuurd(true)
    }
    setBezig(false)
  }

  return (
    <div className="inlog">
      <div className="inlog-kolom">
        <div className="inlog-top">
          <img className="inlog-logo" src="/hgm-logo.png" alt="Hollandsche Greenkeeping Maatschappij" />
        </div>

        <div className="inlog-midden">
          <span className="label-klein">HGM Golf Onderhoud</span>
          <h1 className="inlog-titel">Welkom terug</h1>
          <p className="zacht inlog-intro">Log in om storingen te melden, taken te plannen en de baan te beheren.</p>

          <div className="schakelaar inlog-schakelaar" role="tablist">
            <button type="button" className={`knop ${modus === 'ww' ? '' : 'tweede'}`} onClick={() => kies('ww')}>Met wachtwoord</button>
            <button type="button" className={`knop ${modus === 'link' ? '' : 'tweede'}`} onClick={() => kies('link')}>Met inloglink</button>
          </div>

          {fout && <div className="melding fout" role="alert">{fout}</div>}

          {verstuurd ? (
            <div className="kaart inlog-verstuurd">
              <span className="label-klein groen">Link verstuurd</span>
              <strong>Kijk in je mail</strong>
              <p className="zacht">We hebben een inloglink gestuurd naar <b>{email}</b>. Open hem op dit apparaat.</p>
              <button className="knop tweede" onClick={() => { setVerstuurd(false); setEmail('') }}>Ander e-mailadres</button>
            </div>
          ) : (
            <form className="inlog-form" onSubmit={verstuur}>
              <div>
                <label htmlFor="email">E-mailadres</label>
                <input id="email" type="email" autoComplete="email" placeholder="naam@golfclub.nl"
                       value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {modus === 'ww' ? (
                <div>
                  <div className="inlog-labelrij">
                    <label htmlFor="wachtwoord">Wachtwoord</label>
                    <a href="#" onClick={(e) => { e.preventDefault(); kies('link') }}>Vergeten?</a>
                  </div>
                  <div className="inlog-ww">
                    <input id="wachtwoord" type={toon ? 'text' : 'password'} autoComplete="current-password"
                           value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)} />
                    <button type="button" onClick={() => setToon(!toon)}>{toon ? 'Verberg' : 'Toon'}</button>
                  </div>
                </div>
              ) : (
                <p className="zacht klein-tekst">Geen wachtwoord nodig. Je krijgt een link waarmee je direct bent ingelogd.</p>
              )}
              <button className="knop breed inlog-knop" disabled={bezig}>
                {bezig ? 'Even geduld…' : modus === 'ww' ? 'Inloggen' : 'Stuur inloglink'} <span aria-hidden>→</span>
              </button>
            </form>
          )}

          <p className="zacht klein-tekst inlog-voetnoot">Nog geen account? Je baanbeheerder stuurt je een uitnodiging.</p>
        </div>

        <div className="inlog-voet">
          <span>Hollandsche Greenkeeping Maatschappij</span>
          <a href="mailto:support@hgmgolf.nl">Hulp nodig?</a>
        </div>
      </div>

      <div className="inlog-beeld">
        <InlogFilm />
        <span className="inlog-pil">Gemaakt voor buiten — ook met handschoenen</span>
      </div>
    </div>
  )
}
