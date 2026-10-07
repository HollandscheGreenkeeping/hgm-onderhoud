import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router'
import { supabase, type MijnLocatie } from '../lib/supabase'
import { useSessie } from '../lib/sessie'
import Kopbalk from './Kopbalk'
import Menubalk from './Menubalk'

// Alles buiten één baan: Overzicht (alle banen samen) · Banen (baan kiezen) · Werkplaats · Inkoop · Beheer.
// Wie maar op één baan werkt en geen HGM-brede rol heeft, gaat meteen door naar die baan.
export default function HoofdLayout() {
  const { profiel } = useSessie()
  const { pathname } = useLocation()
  const [banen, setBanen] = useState<MijnLocatie[] | null>(null)
  const isGlobaal = profiel?.globale_rol === 'beheer' || profiel?.globale_rol === 'onderhoudsmanager'
  const magWerkplaats = isGlobaal || profiel?.globale_rol === 'monteur'

  useEffect(() => {
    supabase.rpc('mijn_locaties').then(({ data }) => setBanen(((data ?? []) as MijnLocatie[]).filter((l) => l.soort === 'baan')))
  }, [])

  if (!banen || !profiel) return <main className="zacht">Laden…</main>
  // Inkoop: ook voor de hoofd-greenkeeper (eigen baan).
  const magInkoop = magWerkplaats || banen.some((b) => b.rol === 'hoofdgreenkeeper')
  if (!magWerkplaats && banen.length === 1 && !pathname.startsWith('/beheer') && !pathname.startsWith('/inkoop')) {
    return <Navigate to={`/locatie/${banen[0].locatie_id}`} replace />
  }

  const links = (
    <>
      <NavLink to="/" end>Overzicht</NavLink>
      <NavLink to="/banen">Banen</NavLink>
      {magWerkplaats && <NavLink to="/werkplaats">Werkplaats</NavLink>}
      {magInkoop && <NavLink to="/inkoop">Inkoop</NavLink>}
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
