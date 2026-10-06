import { Link, useNavigate } from 'react-router'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useSessie } from '../lib/sessie'

// Huisstijl 2a: witte kopbalk. Clublogo links, baannaam, menu (children), "beheer door HGM" rechts.
// Zonder klantlogo ziet alleen beheer een gestippeld vak dat naar het uploaden linkt (logoLink).
export default function Kopbalk({ titel, titelLink, klantlogo, logoLink, children }: {
  titel: string
  titelLink?: string
  klantlogo?: string | null
  logoLink?: string
  children?: ReactNode
}) {
  const navigeer = useNavigate()
  const { sessie } = useSessie()

  async function uitloggen() {
    await supabase.auth.signOut()
    navigeer('/inloggen')
  }

  return (
    <header className="kopbalk geen-print">
      {klantlogo
        ? <img className="klantlogo" src={klantlogo} alt="Logo golfclub" />
        : logoLink && <Link className="klantlogo-leeg" to={logoLink} title="Clublogo uploaden">Logo club</Link>}
      {(klantlogo || logoLink) && <span className="scheiding" />}
      <div className="baan">
        <span className="baan-label">{titelLink ? 'Baan' : 'Onderhoud'}</span>
        <span className="titel">
          {titelLink ? <Link to={titelLink} title="Andere baan kiezen">{titel}</Link> : titel}
        </span>
      </div>
      {children}
      <div className="rechts">
        <span className="beheer-door">
          <span>beheer door</span>
          <img className="hgm-logo" src="/hgm-logo.png" alt="Hollandsche Greenkeeping Maatschappij" />
        </span>
        {sessie && <button className="knop verberg-smal" onClick={() => navigeer('/wachtwoord')}>Wachtwoord</button>}
        {sessie && <button className="knop" onClick={uitloggen}>Uitloggen</button>}
      </div>
    </header>
  )
}
