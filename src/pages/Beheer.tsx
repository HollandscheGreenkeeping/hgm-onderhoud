import { Navigate, NavLink, Outlet } from 'react-router'
import { useSessie } from '../lib/sessie'

// Beheer, los van de banen: gebruikers (beheer en onderhoudsmanager), banen en keuzelijsten (alleen beheer).
// De rechten hier zijn alleen voor de weergave; de database (RLS) bepaalt wat echt mag.
export default function Beheer() {
  const { profiel } = useSessie()
  const rol = profiel?.globale_rol
  if (rol !== 'beheer' && rol !== 'onderhoudsmanager') return <Navigate to="/" replace />
  const tab = ({ isActive }: { isActive: boolean }) => `knop ${isActive ? '' : 'tweede'}`

  return (
    <main className="beheer">
      <span className="label-klein">Beheer</span>
      {rol === 'beheer' && (
        <nav className="schakelaar filterbalk" aria-label="Beheer">
          <NavLink to="/beheer/gebruikers" className={tab}>Gebruikers</NavLink>
          <NavLink to="/beheer/banen" className={tab}>Banen</NavLink>
          <NavLink to="/beheer/keuzelijsten" className={tab}>Keuzelijsten</NavLink>
        </nav>
      )}
      <Outlet />
    </main>
  )
}

// Onderdelen die alleen beheer mag openen (onderhoudsmanager gaat terug naar Gebruikers).
export function AlleenBeheer({ children }: { children: React.ReactNode }) {
  const { profiel } = useSessie()
  if (profiel?.globale_rol !== 'beheer') return <Navigate to="/beheer/gebruikers" replace />
  return children
}
