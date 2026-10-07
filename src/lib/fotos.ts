import { supabase } from './supabase'

export type FotoTabel = 'objecten' | 'leidingen' | 'storingen' | 'taken' | 'werkzaamheden' | 'machines' | 'werkorders'

const MAX_ZIJDE = 1600

// Telefoonfoto's zijn vaak 4–8 MB. Verkleinen tot max. 1600 px JPEG scheelt opslag en
// werkt ook op een zwakke verbinding in het veld.
async function verklein(bestand: File): Promise<Blob> {
  const beeld = await createImageBitmap(bestand).catch(() => null)
  if (!beeld) return bestand // bijv. HEIC dat de browser niet kan lezen: origineel uploaden
  const schaal = Math.min(1, MAX_ZIJDE / Math.max(beeld.width, beeld.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(beeld.width * schaal)
  canvas.height = Math.round(beeld.height * schaal)
  canvas.getContext('2d')!.drawImage(beeld, 0, 0, canvas.width, canvas.height)
  return new Promise((klaar) => canvas.toBlob((b) => klaar(b ?? bestand), 'image/jpeg', 0.82))
}

export async function uploadFotos(
  locatieId: string, tabel: FotoTabel, rijId: string, bestanden: File[],
  opties: { intern?: boolean; omschrijving?: string } = {},
) {
  const { data: gebruiker } = await supabase.auth.getUser()
  for (const bestand of bestanden) {
    const blob = await verklein(bestand)
    const extensie = blob.type === 'image/jpeg' ? 'jpg' : bestand.name.split('.').pop() ?? 'jpg'
    const pad = `${locatieId}/${tabel}/${rijId}/${crypto.randomUUID()}.${extensie}`
    const { error } = await supabase.storage.from('fotos').upload(pad, blob, { contentType: blob.type })
    if (error) throw error
    const { error: fout } = await supabase.from('fotos').insert({
      locatie_id: locatieId, tabel, rij_id: rijId, opslag_pad: pad,
      intern: opties.intern ?? false, omschrijving: opties.omschrijving ?? null,
      gemaakt_door: gebruiker.user?.id,
    })
    if (fout) throw fout
  }
}

export type Foto = { id: string; url: string; omschrijving: string | null }

export async function fotosVan(tabel: FotoTabel, id: string): Promise<Foto[]> {
  const { data } = await supabase.from('fotos').select('id, opslag_pad, omschrijving')
    .eq('tabel', tabel).eq('rij_id', id).order('gemaakt_op', { ascending: false })
  if (!data?.length) return []
  const { data: urls } = await supabase.storage.from('fotos').createSignedUrls(data.map((f) => f.opslag_pad), 3600)
  return data.map((f, i) => ({ id: f.id, omschrijving: f.omschrijving, url: urls?.[i]?.signedUrl ?? '' }))
}
