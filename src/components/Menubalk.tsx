import type { ReactNode } from 'react'

// Huisstijl 2a – vaste menubalk onderaan op de telefoon (≤ 700 px). De aanroeper geeft de NavLinks
// mee: binnen een baan Kaart · Storingen · Taken · Werk · Meer, daarbuiten Overzicht · Banen · Beheer.
export default function Menubalk({ children }: { children: ReactNode }) {
  return <nav className="menubalk geen-print" aria-label="Hoofdmenu">{children}</nav>
}
