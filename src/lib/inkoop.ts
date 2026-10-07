import { useEffect, useState } from 'react'
import { supabase, type MijnLocatie } from './supabase'
import { useSessie } from './sessie'

// Inkoop en voorraad (fase 7): leveranciers, producten, bestellingen, voorraad en budget.

export type ProductCategorie = 'meststof' | 'gewasbescherming' | 'graszaad' | 'zand' | 'onderdeel' | 'materiaal'

export const categorieNamen: Record<ProductCategorie, string> = {
  meststof: 'Meststof', gewasbescherming: 'Gewasbescherming', graszaad: 'Graszaad', zand: 'Zand',
  onderdeel: 'Onderdeel', materiaal: 'Materiaal',
}

export type BestelStatus = 'aanvraag' | 'goedgekeurd' | 'afgewezen' | 'besteld' | 'deels_ontvangen' | 'ontvangen' | 'geannuleerd'

export const bestelStatus: Record<BestelStatus, string> = {
  aanvraag: 'Aanvraag', goedgekeurd: 'Goedgekeurd', afgewezen: 'Afgewezen', besteld: 'Besteld',
  deels_ontvangen: 'Deels ontvangen', ontvangen: 'Ontvangen', geannuleerd: 'Geannuleerd',
}

export const bestelKlasse = (s: BestelStatus) =>
  s === 'aanvraag' ? 'gepland' : s === 'afgewezen' ? 'storing' : s === 'ontvangen' ? 'in-orde' : s === 'geannuleerd' ? '' : 'gepland'

export const bestelCode = (b: { nummer: number }) => `B-${b.nummer}`

export type Leverancier = {
  id: string; naam: string; contactpersoon: string | null; email: string | null; telefoon: string | null
  adres: string | null; website: string | null; klantnummer: string | null; afspraken: string | null; gearchiveerd_op: string | null
}

export type Product = {
  id: string; naam: string; categorie: ProductCategorie; leverancier_id: string | null; artikelnummer: string | null
  eenheid: string; prijs: number | null; ctgb_nummer: string | null; middel_id: string | null; opmerking: string | null
  gearchiveerd_op: string | null
  leverancier: { naam: string } | null
  middel: { naam: string } | null
}

export const productVelden = `id, naam, categorie, leverancier_id, artikelnummer, eenheid, prijs, ctgb_nummer, middel_id,
  opmerking, gearchiveerd_op, leverancier:leveranciers(naam), middel:keuzelijst_waarden(naam)`

export type Bestelling = {
  id: string; nummer: number; locatie_id: string; leverancier_id: string; status: BestelStatus
  toelichting: string | null; gewenst_op: string | null; aangevraagd_op: string; beoordeeld_op: string | null
  beoordeling: string | null; besteld_op: string | null; ontvangen_op: string | null; aangevraagd_door: string | null
  locatie: { naam: string; adres: string | null } | null
  leverancier: Leverancier | null
  aanvrager: { naam: string | null } | null
  beoordelaar: { naam: string | null } | null
  regels: Bestelregel[]
}

export type Bestelregel = {
  id: string; product_id: string; aantal: number; prijs: number | null; ontvangen: number
  product: { naam: string; eenheid: string; artikelnummer: string | null; categorie: ProductCategorie } | null
}

export const bestellingVelden = `id, nummer, locatie_id, leverancier_id, status, toelichting, gewenst_op, aangevraagd_op,
  beoordeeld_op, beoordeling, besteld_op, ontvangen_op, aangevraagd_door,
  locatie:locaties(naam, adres),
  leverancier:leveranciers(id, naam, contactpersoon, email, telefoon, adres, website, klantnummer, afspraken, gearchiveerd_op),
  aanvrager:profielen!bestellingen_aangevraagd_door_fkey(naam),
  beoordelaar:profielen!bestellingen_beoordeeld_door_fkey(naam),
  regels:bestelregels(id, product_id, aantal, prijs, ontvangen, product:producten(naam, eenheid, artikelnummer, categorie))`

export const regelTotaal = (r: Pick<Bestelregel, 'aantal' | 'prijs'>) => Number(r.aantal) * Number(r.prijs ?? 0)
export const bestelTotaal = (b: Pick<Bestelling, 'regels'>) => b.regels.reduce((t, r) => t + regelTotaal(r), 0)

export const euro = (n: number) => `€ ${Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const getal = (n: number) => Number(n).toLocaleString('nl-NL', { maximumFractionDigits: 2 })

export type InkoopLocatie = { id: string; naam: string; soort: 'baan' | 'werkplaats' }

// Locaties waarvoor je mag bestellen en voorraad boeken: alles voor beheer, onderhoudsmanager en
// monteur; de eigen banen voor de hoofd-greenkeeper. (De database controleert dit ook.)
export function useInkoopLocaties() {
  const { profiel } = useSessie()
  const [locaties, setLocaties] = useState<InkoopLocatie[] | null>(null)
  useEffect(() => {
    if (!profiel) return
    const overal = profiel.globale_rol != null
    supabase.rpc('mijn_locaties').then(({ data }) => setLocaties(((data ?? []) as MijnLocatie[])
      .filter((l) => overal || l.rol === 'hoofdgreenkeeper')
      .sort((a, b) => (a.soort === b.soort ? a.naam.localeCompare(b.naam) : a.soort === 'werkplaats' ? -1 : 1))
      .map((l) => ({ id: l.locatie_id, naam: l.naam, soort: l.soort }))))
  }, [profiel])
  return locaties
}

// Beheer en onderhoudsmanager keuren goed, beheren catalogus, leveranciers en budget.
export function useMagGoedkeuren() {
  const { profiel } = useSessie()
  return profiel?.globale_rol === 'beheer' || profiel?.globale_rol === 'onderhoudsmanager'
}
