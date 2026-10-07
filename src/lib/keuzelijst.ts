import { useEffect, useState } from 'react'
import { supabase, type Rol } from './supabase'

export type Lijst = 'activiteit' | 'storingstype' | 'middel' | 'machinetype' | 'keuringsoort'
export type Keuze = { id: string; naam: string; eenheid: string | null }

// Actieve waarden van een keuzelijst voor deze locatie (null in locatie_ids = alle locaties).
export function useKeuzelijst(lijst: Lijst, locatieId: string) {
  const [waarden, setWaarden] = useState<Keuze[]>([])
  useEffect(() => {
    supabase.from('keuzelijst_waarden').select('id, naam, eenheid, locatie_ids')
      .eq('lijst', lijst).eq('gearchiveerd', false).order('volgorde').order('naam')
      .then(({ data }) => setWaarden((data ?? [])
        .filter((w) => !w.locatie_ids || w.locatie_ids.includes(locatieId))
        .map(({ id, naam, eenheid }) => ({ id, naam, eenheid }))))
  }, [lijst, locatieId])
  return waarden
}

export type Teamlid = { id: string; naam: string; rol: Rol }

export function useTeam(locatieId: string) {
  const [team, setTeam] = useState<Teamlid[]>([])
  useEffect(() => {
    supabase.rpc('locatie_team', { p_locatie: locatieId }).then(({ data }) => setTeam(data ?? []))
  }, [locatieId])
  return team
}
