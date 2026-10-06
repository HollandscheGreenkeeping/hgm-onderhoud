import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Hole = { id: string; nummer: number; lus: string; lus_volgorde: number }
export type Baanvlak = { id: string; hole_id: string | null; type: string; oppervlakte_m2: number | null }

export const vlaktypes = [
  ['green', 'Greens'],
  ['tee', 'Tees'],
  ['fairway', 'Fairways'],
  ['rough', 'Rough'],
  ['bunker', 'Bunkers'],
  ['water', 'Water'],
] as const

export const vlaktypeNaam = Object.fromEntries(vlaktypes) as Record<string, string>

// Holes en baanvlakken van een locatie (voor plekkeuze en oppervlakte).
export function useBaan(locatieId: string) {
  const [holes, setHoles] = useState<Hole[]>([])
  const [vlakken, setVlakken] = useState<Baanvlak[]>([])
  useEffect(() => {
    supabase.from('holes').select('id, nummer, lussen(naam, volgorde)').eq('locatie_id', locatieId)
      .then(({ data }) => setHoles(((data ?? []) as unknown as { id: string; nummer: number; lussen: { naam: string; volgorde: number } }[])
        .map((h) => ({ id: h.id, nummer: h.nummer, lus: h.lussen.naam, lus_volgorde: h.lussen.volgorde }))
        .sort((a, b) => a.lus_volgorde - b.lus_volgorde || a.nummer - b.nummer)))
    supabase.from('baanvlakken').select('id, hole_id, type, oppervlakte_m2')
      .eq('locatie_id', locatieId).is('gearchiveerd_op', null)
      .then(({ data }) => setVlakken(data ?? []))
  }, [locatieId])
  return { holes, vlakken }
}

export type Plekkeuze = { holeIds: string[]; types: string[] }

// Vertaalt de keuze naar rijen voor werkzaamheden_vlakken, plus de oppervlakte in ha.
// Met vlaktypes: de getekende baanvlakken van die soort op de gekozen holes (of op de hele baan).
// Zijn die er (nog) niet, of is er geen vlaktype gekozen, dan worden het hele holes.
export function plekRijen(keuze: Plekkeuze, holes: Hole[], vlakken: Baanvlak[]) {
  const opHoles = (v: Baanvlak) => !keuze.holeIds.length || (v.hole_id != null && keuze.holeIds.includes(v.hole_id))
  const passend = keuze.types.length ? vlakken.filter((v) => keuze.types.includes(v.type) && opHoles(v)) : []
  if (passend.length) {
    return {
      rijen: passend.map((v) => ({ baanvlak_id: v.id, hole_id: null })),
      ha: passend.reduce((t, v) => t + (v.oppervlakte_m2 ?? 0), 0) / 10000,
    }
  }
  const holeIds = keuze.holeIds.length ? keuze.holeIds : keuze.types.length ? holes.map((h) => h.id) : []
  const binnen = vlakken.filter((v) => v.hole_id && holeIds.includes(v.hole_id))
  return {
    rijen: holeIds.map((id) => ({ baanvlak_id: null, hole_id: id })),
    ha: binnen.reduce((t, v) => t + (v.oppervlakte_m2 ?? 0), 0) / 10000,
  }
}

type VlakRij = {
  hole: { nummer: number } | null
  baanvlak: { type: string; hole: { nummer: number } | null } | null
}

// Korte omschrijving van waar het werk is gedaan, bijv. "Greens 1, 2, 3 · Hole 7".
export function plekTekst(rijen: VlakRij[], aantalHoles?: number) {
  const holesLos = rijen.filter((r) => r.hole).map((r) => r.hole!.nummer)
  const perType = new Map<string, number[]>()
  for (const r of rijen) {
    if (!r.baanvlak) continue
    const lijst = perType.get(r.baanvlak.type) ?? []
    if (r.baanvlak.hole) lijst.push(r.baanvlak.hole.nummer)
    perType.set(r.baanvlak.type, lijst)
  }
  const delen = [...perType].map(([type, nrs]) =>
    `${vlaktypeNaam[type] ?? type}${nrs.length ? ' ' + [...new Set(nrs)].sort((a, b) => a - b).join(', ') : ''}`)
  if (holesLos.length) {
    delen.push(aantalHoles && holesLos.length >= aantalHoles
      ? 'Hele baan'
      : `Hole ${[...new Set(holesLos)].sort((a, b) => a - b).join(', ')}`)
  }
  return delen.join(' · ') || '—'
}

export const plekVelden = `werkzaamheden_vlakken(
  hole:holes(nummer),
  baanvlak:baanvlakken(type, hole:holes(nummer))
)`
