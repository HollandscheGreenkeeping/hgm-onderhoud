import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { objectTitel, openStoringStatussen } from './teksten'

export const storingVelden = `id, status, urgentie, omschrijving, gemeld_op, opgelost_op, intern,
  object_id, leiding_id, toegewezen_aan, oplossing, gebruikte_onderdelen, gecontroleerd_op, storingstype_id,
  type:keuzelijst_waarden(naam),
  object:objecten(code, objecttypes(naam, categorie), hole:holes(nummer)),
  leiding:leidingen(type),
  machine:machines(naam, merk, model),
  melder:profielen!storingen_gemeld_door_fkey(naam),
  uitvoerder:profielen!storingen_toegewezen_aan_fkey(naam),
  controleur:profielen!storingen_gecontroleerd_door_fkey(naam)`

export type Storing = {
  id: string; status: string; urgentie: string; omschrijving: string | null
  gemeld_op: string; opgelost_op: string | null; intern: boolean
  object_id: string | null; leiding_id: string | null; toegewezen_aan: string | null
  oplossing: string | null; gebruikte_onderdelen: string | null; gecontroleerd_op: string | null
  storingstype_id: string | null
  type: { naam: string } | null
  object: { code: string | null; objecttypes: { naam: string; categorie?: string } | null; hole?: { nummer: number } | null } | null
  leiding: { type: string } | null
  machine: { naam: string | null; merk: string | null; model: string | null } | null
  melder: { naam: string | null } | null
  uitvoerder: { naam: string | null } | null
  controleur: { naam: string | null } | null
}

export const storingTitel = (s: Storing) =>
  s.type?.naam ?? s.omschrijving?.slice(0, 60) ?? 'Storing'

export const storingPlek = (s: Storing) =>
  objectTitel(s.object) ?? (s.leiding ? `Leiding ${s.leiding.type}`
    : s.machine ? `Machine ${s.machine.naam ?? [s.machine.merk, s.machine.model].filter(Boolean).join(' ')}`
    : 'Plek op de kaart')

// Korte code voor in lijsten, bijv. "S-3F2A".
export const storingCode = (s: Pick<Storing, 'id'>) => `S-${s.id.slice(0, 4).toUpperCase()}`

// Statuslabel-klasse: open = rood, in behandeling = oranje, opgelost = groen.
export const storingStatusKlasse = (status: string) =>
  status === 'in_behandeling' ? 'gepland' : openStoringStatussen.includes(status) ? 'storing' : 'in-orde'

const categorieNamen: Record<string, string> = {
  beregening: 'Beregening', drainage: 'Drainage', kabel: 'Kabels', overig: 'Overig', materieel: 'Materieel',
}

export function storingCategorie(s: Storing): { klasse: string; naam: string } {
  const c = s.object?.objecttypes?.categorie ?? s.leiding?.type ?? (s.machine ? 'materieel' : 'overig')
  return { klasse: c === 'materieel' ? 'overig' : c, naam: categorieNamen[c] ?? c }
}

export type StoringFilter = 'open' | 'mijn' | 'in_behandeling' | 'opgelost' | 'alle'

// Storingen van een locatie met filter. 'herlaad' na een wijziging.
export function useStoringen(locatieId: string, filter: StoringFilter, mij?: string) {
  const [storingen, setStoringen] = useState<Storing[] | null>(null)
  const laad = useCallback(() => {
    let q = supabase.from('storingen').select(storingVelden).eq('locatie_id', locatieId)
    if (filter === 'open' || filter === 'mijn') q = q.in('status', openStoringStatussen)
    if (filter === 'in_behandeling') q = q.eq('status', 'in_behandeling')
    if (filter === 'mijn' && mij) q = q.eq('toegewezen_aan', mij)
    if (filter === 'opgelost') q = q.in('status', ['opgelost', 'gecontroleerd'])
    q = filter === 'open' || filter === 'mijn' || filter === 'in_behandeling'
      ? q.order('urgentie', { ascending: false }).order('gemeld_op')
      : q.order('gemeld_op', { ascending: false }).limit(200)
    q.then(({ data }) => setStoringen((data ?? []) as unknown as Storing[]))
  }, [locatieId, filter, mij])
  useEffect(() => { laad() }, [laad])
  return { storingen, herlaad: laad }
}
