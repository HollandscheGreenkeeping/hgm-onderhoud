import { useEffect, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import { rolNamen, supabase } from '../lib/supabase'
import { useSessie } from '../lib/sessie'

// App-schil voor alle schermen (Freshservice-stijl): links een vaste zijbalk in HGM-olijf met de
// baan en de HGM-onderdelen, rechts een smalle kopregel met kruimelpad en de inhoud.
// Op de telefoon (≤ 700 px) verdwijnt de zijbalk; daar blijven kopbalk en menubalk onderaan.

export type SchilBaan = {
  id: string; naam: string; logo: string | null
  magRegistreren: boolean; magPlannen: boolean; openStoringen: number
}

const laatsteBaanSleutel = 'hgm-laatste-baan'

export function onthoudBaan(b: SchilBaan) {
  try { localStorage.setItem(laatsteBaanSleutel, JSON.stringify(b)) } catch { /* privémodus */ }
}
function laatsteBaan(): SchilBaan | null {
  try { return JSON.parse(localStorage.getItem(laatsteBaanSleutel) ?? 'null') } catch { return null }
}

// Kruimelpad-namen per pad-onderdeel.
const namen: Record<string, string> = {
  storingen: 'Storingen', taken: 'Taken', werk: 'Werk', onderhoud: 'Onderhoud', materieel: 'Materieel',
  voorstellen: 'Voorstellen', overzicht: 'Dashboard', rapportage: 'Rapportage', meer: 'Meer',
  banen: 'Banen', werkplaats: 'Werkplaats', werkorders: 'Werkorders', planning: 'Planning', keuringen: 'Keuringen',
  kosten: 'Kosten', inkoop: 'Inkoop', bestellingen: 'Bestellingen', voorraad: 'Voorraad', producten: 'Producten',
  leveranciers: 'Leveranciers', budget: 'Budget', beheer: 'Beheer', gebruikers: 'Gebruikers', keuzelijsten: 'Keuzelijsten',
  nieuw: 'Nieuw', schemas: "Schema's", kalender: 'Kalender', verlopen: 'Verlopen',
}

export default function AppSchil({ baan, magInkoop, mobielKop, mobielMenu, children }: {
  baan?: SchilBaan            // binnen een baan; daarbuiten de laatst bezochte baan
  magInkoop: boolean
  mobielKop: ReactNode        // kopbalk voor de telefoon
  mobielMenu: ReactNode       // menubalk onderaan voor de telefoon
  children: ReactNode
}) {
  const { profiel } = useSessie()
  const { pathname } = useLocation()
  const navigeer = useNavigate()
  const rol = profiel?.globale_rol
  const isGlobaal = rol === 'beheer' || rol === 'onderhoudsmanager'
  const isBeheer = rol === 'beheer'
  const magWerkplaats = isGlobaal || rol === 'monteur'
  const b = baan ?? laatsteBaan()

  useEffect(() => { if (baan) onthoudBaan(baan) }, [baan])

  async function uitloggen() {
    await supabase.auth.signOut()
    navigeer('/inloggen')
  }

  const basis = b ? `/locatie/${b.id}` : null
  const onder = (pad: string) => pathname === pad || pathname.startsWith(`${pad}/`)

  // Kruimelpad: [baan of HGM] / sectie / (detail)
  const delen = pathname.split('/').filter(Boolean)
  const kruimels: { naam: string; naar?: string }[] = []
  if (delen[0] === 'locatie' && baan) {
    kruimels.push({ naam: baan.naam, naar: `/locatie/${baan.id}` })
    if (delen[2]) kruimels.push({ naam: namen[delen[2]] ?? delen[2], naar: delen[3] ? `/locatie/${baan.id}/${delen[2]}` : undefined })
    if (delen[3]) kruimels.push({ naam: namen[delen[3]] ?? 'Details' })
  } else {
    kruimels.push({ naam: 'HGM', naar: '/' })
    if (!delen.length) kruimels.push({ naam: 'Overzicht' })
    delen.forEach((d, i) => {
      const naar = i < delen.length - 1 ? `/${delen.slice(0, i + 1).join('/')}` : undefined
      kruimels.push({ naam: namen[d] ?? 'Details', naar })
    })
  }

  return (
    <div className="schil">
      <aside className="zijbalk geen-print" aria-label="Hoofdmenu">
        <div className="zijbalk-baan">
          {b?.logo ? <img src={b.logo} alt="" className="zijbalk-logo" /> : <span className="zijbalk-logo leeg" aria-hidden>{b?.naam.slice(0, 2) ?? 'HGM'}</span>}
          <div>
            <span className="zijbalk-baanlabel">{baan ? 'Baan' : b ? 'Laatste baan' : 'Geen baan gekozen'}</span>
            <Link to="/banen" className="zijbalk-baannaam" title="Andere baan kiezen">{b?.naam ?? 'Kies een baan'} <span aria-hidden>▾</span></Link>
          </div>
        </div>

        {basis && b && (
          <nav className="zijbalk-groep" aria-label={b.naam}>
            <NavLink to={basis} end>Kaart</NavLink>
            <NavLink to={`${basis}/storingen`}>Storingen{b.openStoringen > 0 && <span className="zijbalk-telling">{b.openStoringen}</span>}</NavLink>
            <NavLink to={`${basis}/taken`}>Taken</NavLink>
            <NavLink to={`${basis}/werk`}>Werk</NavLink>
            <NavLink to={`${basis}/onderhoud`}>Onderhoud</NavLink>
            <NavLink to={`${basis}/materieel`}>Materieel</NavLink>
            {b.magPlannen && <NavLink to={`${basis}/voorstellen`}>Voorstellen</NavLink>}
            <NavLink to={`${basis}/overzicht`}>Dashboard</NavLink>
            <NavLink to={`${basis}/rapportage`}>Rapportage</NavLink>
          </nav>
        )}

        <nav className="zijbalk-groep" aria-label="HGM">
          <span className="zijbalk-groepnaam">HGM</span>
          <NavLink to="/" end>Overzicht</NavLink>
          <NavLink to="/banen">Alle banen</NavLink>
          {magWerkplaats && <NavLink to="/werkplaats">Werkplaats</NavLink>}
          {magWerkplaats && onder('/werkplaats') && (
            <div className="zijbalk-sub">
              <NavLink to="/werkplaats/werkorders">Werkorders</NavLink>
              <NavLink to="/werkplaats/planning">Planning</NavLink>
              <NavLink to="/werkplaats/keuringen">Keuringen</NavLink>
              {isGlobaal && <NavLink to="/werkplaats/kosten">Kosten</NavLink>}
            </div>
          )}
          {magInkoop && <NavLink to="/inkoop">Inkoop</NavLink>}
          {magInkoop && onder('/inkoop') && (
            <div className="zijbalk-sub">
              <NavLink to="/inkoop/bestellingen">Bestellingen</NavLink>
              <NavLink to="/inkoop/voorraad">Voorraad</NavLink>
              <NavLink to="/inkoop/producten">Producten</NavLink>
              <NavLink to="/inkoop/leveranciers">Leveranciers</NavLink>
              {rol !== 'monteur' && <NavLink to="/inkoop/budget">Budget</NavLink>}
            </div>
          )}
          {isGlobaal && <NavLink to="/beheer">Beheer</NavLink>}
          {isGlobaal && onder('/beheer') && (
            <div className="zijbalk-sub">
              <NavLink to="/beheer/gebruikers">Gebruikers</NavLink>
              {isBeheer && <NavLink to="/beheer/banen">Banen</NavLink>}
              {isBeheer && <NavLink to="/beheer/keuzelijsten">Keuzelijsten</NavLink>}
            </div>
          )}
        </nav>

        <div className="zijbalk-voet">
          <div className="zijbalk-gebruiker">
            <strong>{profiel?.naam ?? profiel?.email}</strong>
            {rol && <span>{rolNamen[rol]}</span>}
          </div>
          <div className="zijbalk-acties">
            <Link to="/wachtwoord">Wachtwoord</Link>
            <button type="button" onClick={uitloggen}>Uitloggen</button>
          </div>
          <div className="zijbalk-hgm">
            <span>beheer door</span>
            <img src="/hgm-logo.png" alt="Hollandsche Greenkeeping Maatschappij" />
          </div>
        </div>
      </aside>

      <div className={`scherm ${baan ? 'baan' : 'hoofd'}`}>
        {mobielKop}
        <div className="kopregel geen-print">
          <nav className="kruimelpad" aria-label="Kruimelpad">
            {kruimels.map((k, i) => (
              <span key={i}>
                {i > 0 && <span className="kruimel-scheiding" aria-hidden>/</span>}
                {k.naar ? <Link to={k.naar}>{k.naam}</Link> : <span aria-current="page">{k.naam}</span>}
              </span>
            ))}
          </nav>
        </div>
        {children}
        {mobielMenu}
      </div>
    </div>
  )
}
