import { createContext, useContext, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useParams } from 'react-router'
import { huisstijlUrl, supabase, type Rol } from './supabase'
import { openStoringStatussen } from './teksten'
import Kopbalk from '../components/Kopbalk'

export type Locatie = {
  id: string
  naam: string
  klantnaam: string | null
  klantlogo_pad: string | null
}

type LocatieStaat = {
  locatie: Locatie
  rol: Rol
  magRegistreren: boolean // alles behalve baanmanager
  magPlannen: boolean // hoofd-greenkeeper en hoger
  isBeheer: boolean
  isGlobaal: boolean // beheer of onderhoudsmanager
  herlaad: () => void
}

const LocatieContext = createContext<LocatieStaat | null>(null)

export function useLocatie() {
  const s = useContext(LocatieContext)
  if (!s) throw new Error('useLocatie buiten LocatieLayout')
  return s
}

// Kopbalk + menu voor alle schermen binnen één baan. De rechten hier zijn alleen voor de
// weergave; de database (RLS) bepaalt wat echt mag.
export default function LocatieLayout() {
  const { locatieId } = useParams()
  const [locatie, setLocatie] = useState<Locatie | null>(null)
  const [rol, setRol] = useState<Rol | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [teller, setTeller] = useState(0)
  const [openStoringen, setOpenStoringen] = useState(0)
  const { pathname } = useLocation()

  // Bolletje bij Storingen; ververst bij elke paginawissel (lichte count-query).
  useEffect(() => {
    if (!locatieId) return
    supabase.from('storingen').select('id', { count: 'exact', head: true })
      .eq('locatie_id', locatieId).in('status', openStoringStatussen)
      .then(({ count, error }) => setOpenStoringen(error ? 0 : count ?? 0))
  }, [locatieId, pathname, teller])

  useEffect(() => {
    if (!locatieId) return
    Promise.all([
      supabase.from('locaties').select('id, naam, klantnaam, klantlogo_pad').eq('id', locatieId).single(),
      supabase.rpc('mijn_rol', { p_locatie: locatieId }),
    ]).then(([l, r]) => {
      if (l.error || !r.data) return setFout('Deze baan bestaat niet of je hebt geen toegang.')
      setLocatie(l.data)
      setRol(r.data)
    })
  }, [locatieId, teller])

  if (fout) {
    return (
      <>
        <Kopbalk titel="HGM Golf Onderhoud" />
        <main><div className="melding fout">{fout}</div><NavLink to="/">Andere baan kiezen</NavLink></main>
      </>
    )
  }
  if (!locatie || !rol) return <main className="zacht">Laden…</main>

  const magPlannen = ['beheer', 'onderhoudsmanager', 'hoofdgreenkeeper'].includes(rol)
  const staat: LocatieStaat = {
    locatie,
    rol,
    magRegistreren: rol !== 'baanmanager',
    magPlannen,
    isBeheer: rol === 'beheer',
    isGlobaal: rol === 'beheer' || rol === 'onderhoudsmanager',
    herlaad: () => setTeller((t) => t + 1),
  }
  const logo = locatie.klantlogo_pad ? huisstijlUrl(locatie.klantlogo_pad) : null
  const basis = `/locatie/${locatie.id}`

  const menu = (extraKlasse = '') => (
    <nav className={`menu geen-print ${extraKlasse}`}>
      <NavLink to={basis} end>Kaart</NavLink>
      <NavLink to={`${basis}/storingen`}>
        Storingen{openStoringen > 0 && <span className="teller-bol">{openStoringen}</span>}
      </NavLink>
      <NavLink to={`${basis}/taken`}>Taken</NavLink>
      <NavLink to={`${basis}/werk`}>Werk</NavLink>
      <NavLink to={`${basis}/onderhoud`}>Onderhoud</NavLink>
      <NavLink to={`${basis}/materieel`}>Materieel</NavLink>
      {magPlannen && <NavLink to={`${basis}/voorstellen`}>Voorstellen</NavLink>}
      <NavLink to={`${basis}/overzicht`}>Dashboard</NavLink>
      <NavLink to={`${basis}/rapportage`}>Rapportage</NavLink>
      {staat.isGlobaal && <NavLink to={`${basis}/gebruikers`}>Gebruikers</NavLink>}
      {staat.isBeheer && <NavLink to={`${basis}/instellingen`}>Instellingen</NavLink>}
      {extraKlasse === 'onder' && <NavLink to="/" className="rechts">Andere baan</NavLink>}
    </nav>
  )

  return (
    <LocatieContext.Provider value={staat}>
      <div className="scherm">
        <Kopbalk titel={locatie.naam} titelLink="/" klantlogo={logo}
                 logoLink={staat.isBeheer ? `${basis}/instellingen` : undefined}>
          {menu()}
        </Kopbalk>
        {menu('onder')}
        <Outlet />
      </div>
    </LocatieContext.Provider>
  )
}