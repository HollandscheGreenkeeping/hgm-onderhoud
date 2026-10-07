import { Navigate, NavLink, Outlet } from 'react-router'
import { useSessie } from '../lib/sessie'

// Werkplaats en technische dienst, over alle banen heen: werkorders, planning per monteur,
// keuringen en (alleen beheer en onderhoudsmanager) kosten per machine.
export default function Werkplaats() {
  const { profiel } = useSessie()
  const rol = profiel?.globale_rol
  if (rol !== 'beheer' && rol !== 'onderhoudsmanager' && rol !== 'monteur') return <Navigate to="/" replace />
  const tab = ({ isActive }: { isActive: boolean }) => `knop ${isActive ? '' : 'tweede'}`

  return (
    <main className="werkplaats">
      <span className="label-klein subnav">Werkplaats</span>
      <nav className="schakelaar filterbalk subnav" aria-label="Werkplaats">
        <NavLink to="/werkplaats/werkorders" className={tab}>Werkorders</NavLink>
        <NavLink to="/werkplaats/planning" className={tab}>Planning</NavLink>
        <NavLink to="/werkplaats/keuringen" className={tab}>Keuringen</NavLink>
        {rol !== 'monteur' && <NavLink to="/werkplaats/kosten" className={tab}>Kosten</NavLink>}
      </nav>
      <Outlet />
    </main>
  )
}

// Kosten zijn niet voor de monteur (rechtenmatrix); de database geeft hem ook niets terug.
export function AlleenGlobaal({ children }: { children: React.ReactNode }) {
  const { profiel } = useSessie()
  if (profiel?.globale_rol !== 'beheer' && profiel?.globale_rol !== 'onderhoudsmanager') {
    return <Navigate to="/werkplaats/werkorders" replace />
  }
  return children
}
