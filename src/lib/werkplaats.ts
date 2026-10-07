import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Werkplaats en technische dienst (fase 6): werkorders, planning, keuringen.

export type WerkorderStatus =
  'aangevraagd' | 'ingepland' | 'in_werkplaats' | 'wacht_op_onderdelen' | 'gereed' | 'terug_op_locatie' | 'geannuleerd'

export const werkorderStatus: Record<WerkorderStatus, string> = {
  aangevraagd: 'Aangevraagd',
  ingepland: 'Ingepland',
  in_werkplaats: 'In werkplaats',
  wacht_op_onderdelen: 'Wacht op onderdelen',
  gereed: 'Gereed',
  terug_op_locatie: 'Terug op locatie',
  geannuleerd: 'Geannuleerd',
}

// Volgorde van het statusverloop (zonder 'geannuleerd').
export const werkorderStappen: WerkorderStatus[] =
  ['aangevraagd', 'ingepland', 'in_werkplaats', 'wacht_op_onderdelen', 'gereed', 'terug_op_locatie']

export const openWerkorderStatussen: WerkorderStatus[] =
  ['aangevraagd', 'ingepland', 'in_werkplaats', 'wacht_op_onderdelen', 'gereed']

// Labelkleur in lijsten: storing (rood) · gepland (oranje) · in-orde (groen).
export const werkorderKlasse = (s: WerkorderStatus) =>
  s === 'aangevraagd' || s === 'wacht_op_onderdelen' ? 'storing'
    : s === 'gereed' || s === 'terug_op_locatie' ? 'in-orde'
    : s === 'geannuleerd' ? '' : 'gepland'

export const werkorderBron = { defect: 'Defectmelding', onderhoud: 'Gepland onderhoud', handmatig: 'Handmatig' } as const

export const werkorderCode = (w: { nummer: number }) => `WO-${w.nummer}`

export type Werkorder = {
  id: string; nummer: number; locatie_id: string; machine_id: string | null; object_id: string | null
  bron: keyof typeof werkorderBron; storing_id: string | null; schema_id: string | null
  omschrijving: string; urgentie: string; status: WerkorderStatus
  monteur_id: string | null; gepland_op: string | null; bevindingen: string | null
  vervangende_machine_id: string | null; aangevraagd_op: string; gereed_op: string | null; afgerond_op: string | null
  locatie: { naam: string } | null
  machine: { naam: string | null; merk: string | null; model: string | null; huidige_locatie_id: string } | null
  object: { code: string | null; objecttypes: { naam: string } | null } | null
  monteur: { naam: string | null } | null
  aanvrager: { naam: string | null } | null
  vervanger: { naam: string | null; merk: string | null; model: string | null } | null
}

export const werkorderVelden = `id, nummer, locatie_id, machine_id, object_id, bron, storing_id, schema_id, omschrijving,
  urgentie, status, monteur_id, gepland_op, bevindingen, vervangende_machine_id, aangevraagd_op, gereed_op, afgerond_op,
  locatie:locaties(naam),
  machine:machines!werkorders_machine_id_fkey(naam, merk, model, huidige_locatie_id),
  object:objecten(code, objecttypes(naam)),
  monteur:profielen!werkorders_monteur_id_fkey(naam),
  aanvrager:profielen!werkorders_aangevraagd_door_fkey(naam),
  vervanger:machines!werkorders_vervangende_machine_id_fkey(naam, merk, model)`

const machineTekst = (m: { naam: string | null; merk: string | null; model: string | null }) =>
  m.naam ?? ([m.merk, m.model].filter(Boolean).join(' ') || 'Machine')

// Waar gaat de werkorder over: machine, of installatie op de baan.
export const werkorderDoel = (w: Pick<Werkorder, 'machine' | 'object'>) =>
  w.machine ? machineTekst(w.machine)
    : w.object ? [w.object.objecttypes?.naam, w.object.code].filter(Boolean).join(' ') || 'Installatie'
    : '–'

export const vervangerTekst = (w: Pick<Werkorder, 'vervanger'>) => (w.vervanger ? machineTekst(w.vervanger) : null)

export type Monteur = { id: string; naam: string }

// Monteurs (rol monteur, actief) om werkorders aan toe te wijzen.
export function useMonteurs() {
  const [monteurs, setMonteurs] = useState<Monteur[]>([])
  useEffect(() => {
    supabase.from('profielen').select('id, naam, email').eq('globale_rol', 'monteur').eq('actief', true).order('naam')
      .then(({ data }) => setMonteurs((data ?? []).map((p) => ({ id: p.id, naam: p.naam ?? p.email ?? 'Monteur' }))))
  }, [])
  return monteurs
}

export type Keuring = {
  id: string; locatie_id: string; machine_id: string | null; object_id: string | null; soort_id: string
  gekeurd_op: string | null; geldig_tot: string; interval_maanden: number | null; herinnering_dagen: number
  keurder: string | null; certificaat_pad: string | null; opmerking: string | null; gearchiveerd_op: string | null
  soort: { naam: string } | null
  locatie: { naam: string } | null
  machine: { naam: string | null; merk: string | null; model: string | null } | null
  object: { code: string | null; objecttypes: { naam: string } | null } | null
}

export const keuringVelden = `id, locatie_id, machine_id, object_id, soort_id, gekeurd_op, geldig_tot, interval_maanden,
  herinnering_dagen, keurder, certificaat_pad, opmerking, gearchiveerd_op,
  soort:keuzelijst_waarden(naam), locatie:locaties(naam), machine:machines(naam, merk, model),
  object:objecten(code, objecttypes(naam))`

// verlopen · binnenkort (binnen de herinneringstermijn) · geldig
export function keuringStaat(k: Pick<Keuring, 'geldig_tot' | 'herinnering_dagen'>) {
  const dagen = Math.round((new Date(`${k.geldig_tot}T12:00:00`).getTime() - Date.now()) / 86_400_000)
  return { dagen, staat: dagen < 0 ? 'verlopen' : dagen <= k.herinnering_dagen ? 'binnenkort' : 'geldig' } as const
}

export const keuringDoel = (k: Pick<Keuring, 'machine' | 'object'>) => werkorderDoel({ machine: k.machine as never, object: k.object })

// Certificaat (PDF of foto) in de privé-bucket 'fotos'; openen via een tijdelijke link.
export async function certificaatUploaden(locatieId: string, keuringId: string, bestand: File) {
  const extensie = bestand.name.split('.').pop()?.toLowerCase() ?? 'pdf'
  const pad = `${locatieId}/keuringen/${keuringId}/${crypto.randomUUID()}.${extensie}`
  const { error } = await supabase.storage.from('fotos').upload(pad, bestand, { contentType: bestand.type })
  if (error) throw error
  return pad
}

export async function certificaatOpenen(pad: string) {
  const { data } = await supabase.storage.from('fotos').createSignedUrl(pad, 600)
  if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener')
}

// Volgende geldig-tot-datum: gekeurd op + interval.
export function volgendeGeldigTot(gekeurdOp: string, maanden: number) {
  const d = new Date(`${gekeurdOp}T12:00:00`)
  d.setMonth(d.getMonth() + maanden)
  return d.toISOString().slice(0, 10)
}
