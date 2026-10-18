import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { inIosApp, koppelHorloge } from '../lib/horloge'
import { useSessie } from '../lib/sessie'
import { supabase } from '../lib/supabase'
import { useLocatie } from '../lib/locatie'

// "Meer"-scherm voor de telefoon: alle menu-items van de baan die niet in de menubalk passen,
// en de weg terug naar Overzicht, Banen, Werkplaats en Beheer.
export default function Meer() {
  const { locatie, rol, magPlannen, isGlobaal } = useLocatie()
  const navigeer = useNavigate()
  const { profiel } = useSessie()
  const [horloge, setHorloge] = useState<string | null>(null)
  const basis = `/locatie/${locatie.id}`

  async function uitloggen() {
    await supabase.auth.signOut()
    navigeer('/inloggen')
  }

  return (
    <main className="meer">
      <h1>Meer</h1>
      <nav className="menulijst">
        <Link to={`${basis}/overzicht`}>Dashboard</Link>
        <Link to={`${basis}/onderhoud`}>Onderhoud</Link>
        <Link to={`${basis}/materieel`}>Materieel</Link>
        {magPlannen && <Link to={`${basis}/voorstellen`}>Voorstellen</Link>}
        <Link to={`${basis}/rapportage`}>Rapportage</Link>
      </nav>
      <span className="label-klein">HGM</span>
      <nav className="menulijst">
        <Link to="/">Overzicht alle banen</Link>
        <Link to="/banen">Andere baan</Link>
        {(isGlobaal || rol === 'monteur') && <Link to="/werkplaats">Werkplaats</Link>}
        {(magPlannen || rol === 'monteur') && <Link to={`/inkoop/voorraad?locatie=${locatie.id}`}>Inkoop en voorraad</Link>}
        {isGlobaal && <Link to="/beheer">Beheer</Link>}
      </nav>
      {inIosApp() && (
        <>
          <nav className="menulijst">
            <button type="button" onClick={() => koppelHorloge(profiel?.naam ?? profiel?.email ?? '')
              .then(() => setHorloge('Apple Watch gekoppeld.')).catch((e) => setHorloge((e as Error).message))}>
              Apple Watch koppelen
            </button>
          </nav>
          {horloge && <div className="melding info">{horloge}</div>}
        </>
      )}
      <nav className="menulijst">
        <Link to="/wachtwoord">Wachtwoord wijzigen</Link>
        <button type="button" className="uitloggen" onClick={uitloggen}>Uitloggen</button>
      </nav>
    </main>
  )
}
