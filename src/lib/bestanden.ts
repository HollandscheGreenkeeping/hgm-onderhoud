import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Bestandenbank (HGM → Bestanden): opgeslagen posters en geüploade bestanden.
// Bestanden staan in de privé-bucket 'bestanden' onder <profiel-id>/…; lezen gaat via een tijdelijke link.

export type Bestand = {
  id: string; soort: 'poster' | 'bestand'; titel: string; map: string | null; omschrijving: string | null
  poster: Record<string, unknown> | null; opslag_pad: string | null; bestandsnaam: string | null
  mime_type: string | null; grootte: number | null
  aangemaakt_door: string; aangemaakt_op: string; bijgewerkt_op: string
  maker?: { naam: string | null } | null
}

export const bestandVelden = '*, maker:profielen!aangemaakt_door(naam)'

// Eigen foto's van posters staan in de opslag; in de posterinstellingen als 'opslag:<pad>'.
export const opslagVoorvoegsel = 'opslag:'

export async function uploadNaarBank(bestand: Blob, naam: string) {
  const { data } = await supabase.auth.getUser()
  const veilig = naam.toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-').replace(/^-+|-+$/g, '') || 'bestand'
  const pad = `${data.user?.id}/${crypto.randomUUID()}-${veilig}`
  const { error } = await supabase.storage.from('bestanden').upload(pad, bestand, { contentType: bestand.type || undefined })
  if (error) throw error
  return pad
}

export async function bankLink(pad: string, downloaden?: string) {
  const { data } = await supabase.storage.from('bestanden').createSignedUrl(pad, 3600, downloaden ? { download: downloaden } : undefined)
  return data?.signedUrl ?? null
}

export function soortNaam(b: Pick<Bestand, 'soort' | 'mime_type' | 'bestandsnaam'>) {
  if (b.soort === 'poster') return 'Poster'
  const t = b.mime_type ?? ''
  if (t === 'application/pdf') return 'PDF'
  if (t.startsWith('image/')) return 'Afbeelding'
  if (t.startsWith('video/')) return 'Video'
  if (t === 'text/html') return 'HTML (mail)'
  return (b.bestandsnaam?.split('.').pop() ?? 'Bestand').toUpperCase()
}

export function grootteTekst(n: number | null) {
  if (n == null) return '–'
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} kB`
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

// Wie de bestandenbank mag gebruiken (zelfde regel als de database: niet alleen-baanmanager).
let magCache: Promise<boolean> | null = null
supabase.auth.onAuthStateChange(() => { magCache = null })
export function useMagBestanden() {
  const [mag, setMag] = useState<boolean | null>(null)   // null: nog aan het laden
  useEffect(() => {
    magCache ??= Promise.resolve(supabase.rpc('is_hgm_medewerker')).then(({ data }) => data === true)
    let actief = true
    magCache.then((m) => { if (actief) setMag(m) })
    return () => { actief = false }
  }, [])
  return mag
}
