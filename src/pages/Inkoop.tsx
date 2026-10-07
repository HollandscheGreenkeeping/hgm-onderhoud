import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet } from 'react-router'
import { supabase } from '../lib/supabase'
import { useSessie } from '../lib/sessie'

// Inkoop en voorraad, over alle banen en de werkplaats: bestellingen, voorraad, producten,
// leveranciers en budget. Voor beheer, onderhoudsmanager, monteur en hoofd-greenkeeper.
export default function Inkoop() {
  const { profiel } = useSessie()
  const [inkoper, setInkoper] = useState<boolean | null>(null)
  useEffect(() => { supabase.rpc('is_inkoper').then(({ data }) => setInkoper(Boolean(data))) }, [])

  if (inkoper === null) return <main className="zacht">Laden…</main>
  if (!inkoper) return <Navigate to="/" replace />
  const tab = ({ isActive }: { isActive: boolean }) => `knop ${isActive ? '' : 'tweede'}`
  const budget = profiel?.globale_rol !== 'monteur' // kosten en budget: niet voor de monteur

  return (
    <main className="inkoop">
      <span className="label-klein geen-print">Inkoop en voorraad</span>
      <nav className="schakelaar filterbalk geen-print" aria-label="Inkoop">
        <NavLink to="/inkoop/bestellingen" className={tab}>Bestellingen</NavLink>
        <NavLink to="/inkoop/voorraad" className={tab}>Voorraad</NavLink>
        <NavLink to="/inkoop/producten" className={tab}>Producten</NavLink>
        <NavLink to="/inkoop/leveranciers" className={tab}>Leveranciers</NavLink>
        {budget && <NavLink to="/inkoop/budget" className={tab}>Budget</NavLink>}
      </nav>
      <Outlet />
    </main>
  )
}
