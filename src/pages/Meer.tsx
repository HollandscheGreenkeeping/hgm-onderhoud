import { Link, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useLocatie } from '../lib/locatie'

// "Meer"-scherm voor de telefoon: alle menu-items die niet in de menubalk passen.
export default function Meer() {
  const { locatie, magPlannen, isBeheer, isGlobaal } = useLocatie()
  const navigeer = useNavigate()
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
      {(isGlobaal || isBeheer) && (
        <>
          <span className="label-klein">Beheer</span>
          <nav className="menulijst">
            {isGlobaal && <Link to={`${basis}/gebruikers`}>Gebruikers</Link>}
            {isBeheer && <Link to={`${basis}/instellingen`}>Instellingen</Link>}
          </nav>
        </>
      )}
      <nav className="menulijst">
        <Link to="/">Andere baan</Link>
        <Link to="/wachtwoord">Wachtwoord wijzigen</Link>
        <button type="button" className="uitloggen" onClick={uitloggen}>Uitloggen</button>
      </nav>
    </main>
  )
}
