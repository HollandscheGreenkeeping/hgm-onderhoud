import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useParams } from 'react-router'
import { huisstijlUrl, supabase, type Rol } from './supabase'
import { openStoringStatussen } from './teksten'
import Kopbalk from '../components/Kopbalk'
import Menubalk from '../components/Menubalk'

export type Locatie = {
  id: string
  naam: string
  klantnaam: string | null
  klantlogo_pad: string | null
  baanfoto_pad: string | null
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
  if (!s) throw new Error('useLocatie buiten LocatieLayout of LocatieProvider')
  return s
}

// Laadt baan en rol en geeft ze door via useLocatie(). Gebruikt door de baanschermen (LocatieLayout)
// en door Beheer → Banen (instellingen van één baan). De rechten hier zijn alleen voor de weergave;
// de database (RLS) bepaalt wat echt mag.
function useLocatieStaat(locatieId: string | undefined) {
  const [locatie, setLocatie] = useState<Locatie | null>(null)
  const [rol, setRol] = useState<Rol | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [teller, setTeller] = useState(0)

  useEffect(() => {
    if (!locatieId) return
    Promise.all([
      supabase.from('locaties').select('id, naam, klantnaam, klantlogo_pad, baanfoto_pad').eq('id', locatieId).single(),
      supabase.rpc('mijn_rol', { p_locatie: locatieId }),
    ]).then(([l, r]) => {
      if (l.error || !r.data) return setFout('Deze baan bestaat niet of je hebt geen toegang.')
      setLocatie(l.data)
      setRol(r.data)
    })
  }, [locatieId, teller])

  if (!locatie || !rol) return { staat: null, fout, teller }
  const staat: LocatieStaat = {
    locatie,
    rol,
    magRegistreren: rol !== 'baanmanager',
    magPlannen: ['beheer', 'onderhoudsmanager', 'hoofdgreenkeeper'].includes(rol),
    isBeheer: rol === 'beheer',
    isGlobaal: rol === 'beheer' || rol === 'onderhoudsmanager',
    herlaad: () => setTeller((t) => t + 1),
  }
  return { staat, fout, teller }
}

// Alleen de context, zonder kopbalk en menu (voor Beheer → Banen).
export function LocatieProvider({ locatieId, children }: { locatieId: string; children: ReactNode }) {
  const { staat, fout } = useLocatieStaat(locatieId)
  if (fout) return <div className="melding fout">{fout}</div>
  if (!staat) return <p className="zacht">Laden…</p>
  return <LocatieContext.Provider value={staat}>{children}</LocatieContext.Provider>
}

// Kopbalk + menu voor de werkschermen binnen één baan. Beheer (gebruikers, instellingen) staat
// los hiervan onder /beheer.
export default function LocatieLayout() {
  const { locatieId } = useParams()
  const { staat, fout, teller } = useLocatieStaat(locatieId)
  const [openStoringen, setOpenStoringen] = useState(0)
  const { pathname } = useLocation()

  // Bolletje bij Storingen; ververst bij elke paginawissel (lichte count-query).
  useEffect(() => {
    if (!locatieId) return
    supabase.from('storingen').select('id', { count: 'exact', head: true })
      .eq('locatie_id', locatieId).in('status', openStoringStatussen)
      .then(({ count, error }) => setOpenStoringen(error ? 0 : count ?? 0))
  }, [locatieId, pathname, teller])

  if (fout) {
    return (
      <>
        <Kopbalk titel="HGM Golf Onderhoud" />
        <main><div className="melding fout">{fout}</div><NavLink to="/banen">Andere baan kiezen</NavLink></main>
      </>
    )
  }
  if (!staat) return <main className="zacht">Laden…</main>

  const { locatie, magPlannen } = staat
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
      {(magPlannen || staat.rol === 'monteur') && <NavLink to={`/inkoop/voorraad?locatie=${locatie.id}`}>Voorraad</NavLink>}
      {extraKlasse === 'onder' && <NavLink to="/banen" className="rechts">Alle banen</NavLink>}
    </nav>
  )

  // Wat niet in de vijf vakken van de menubalk past, staat onder "Meer".
  const meerPaden = ['onderhoud', 'materieel', 'voorstellen', 'overzicht', 'rapportage', 'meer']
  const opMeer = meerPaden.some((p) => pathname.startsWith(`${basis}/${p}`))

  return (
    <LocatieContext.Provider value={staat}>
      <div className="scherm baan">
        <Kopbalk titel={locatie.naam} titelLink="/banen" klantlogo={logo}
                 logoLink={staat.isBeheer ? `/beheer/banen/${locatie.id}` : undefined}>
          {menu()}
        </Kopbalk>
        {menu('onder')}
        <Outlet />
        <Menubalk>
          <NavLink to={basis} end>Kaart</NavLink>
          <NavLink to={`${basis}/storingen`}>
            Storingen{openStoringen > 0 && <span className="teller-bol">{openStoringen}</span>}
          </NavLink>
          <NavLink to={`${basis}/taken`}>Taken</NavLink>
          <NavLink to={`${basis}/werk`}>Werk</NavLink>
          <NavLink to={`${basis}/meer`} className={opMeer ? 'active' : ''}>Meer</NavLink>
        </Menubalk>
      </div>
    </LocatieContext.Provider>
  )
}
