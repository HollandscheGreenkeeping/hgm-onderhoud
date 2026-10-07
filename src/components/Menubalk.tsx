import { NavLink, useLocation } from 'react-router'

// Huisstijl 2a – vaste menubalk onderaan op de telefoon (≤ 700 px). Ontwerp: HGM Mobiel.dc.html.
// Alles wat niet in de vijf vakken past staat onder "Meer" (src/pages/Meer.tsx).
const meerPaden = ['onderhoud', 'materieel', 'voorstellen', 'overzicht', 'rapportage', 'gebruikers', 'instellingen', 'meer']

export default function Menubalk({ basis, openStoringen }: { basis: string; openStoringen: number }) {
  const { pathname } = useLocation()
  const opMeer = meerPaden.some((p) => pathname.startsWith(`${basis}/${p}`))

  return (
    <nav className="menubalk geen-print" aria-label="Hoofdmenu">
      <NavLink to={basis} end>Kaart</NavLink>
      <NavLink to={`${basis}/storingen`}>
        Storingen{openStoringen > 0 && <span className="teller-bol">{openStoringen}</span>}
      </NavLink>
      <NavLink to={`${basis}/taken`}>Taken</NavLink>
      <NavLink to={`${basis}/werk`}>Werk</NavLink>
      <NavLink to={`${basis}/meer`} className={opMeer ? 'active' : ''}>Meer</NavLink>
    </nav>
  )
}
