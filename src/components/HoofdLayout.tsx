import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router'
import { supabase, type MijnLocatie } from '../lib/supabase'
import { useSessie } from '../lib/sessie'
import Kopbalk from './Kopbalk'
import Menubalk from './Menubalk'

// Alles buiten één baan: Overzicht (alle banen samen) · Banen (baan kiezen) · Beheer.
// Wie maar op één baan werkt en geen HGM-brede rol heeft, gaat meteen door naar die baan.
export default function HoofdLayout() {
  const { profiel } = useSessie()
  const { pathname } = useLocation()
  const [banen, setBanen] = useState<MijnLocatie[] | null>(null)
  const isGlobaal = profiel?.globale_rol === 'beheer' || profiel?.globale_rol === 'onderhoudsmanager'

  useEffect(() => {
    supabase.rpc('mijn_locaties').then(({ data }) => setBanen(data ?? []))
  }, [])

  if (!banen || !profiel) return <main className="zacht">Laden…</main>
  if (!isGlobaal && banen.length === 1 && !pathname.startsWith('/beheer')) {
    return <Navigate to={`/locatie/${banen[0].locatie_id}`} replace />
  }

  const links = (
    <>
      <NavLink to="/" end>Overzicht</NavLink>
      <NavLink to="/banen">Banen</NavLink>
      {isGlobaal && <NavLink to="/beheer">Beheer</NavLink>}
    </>
  )

  return (
    <div className="scherm hoofd">
      <Kopbalk titel="HGM Golf Onderhoud">
        <nav className="menu kort geen-print">{links}</nav>
      </Kopbalk>
      <Outlet />
      <Menubalk>{links}</Menubalk>
    </div>
  )
}
