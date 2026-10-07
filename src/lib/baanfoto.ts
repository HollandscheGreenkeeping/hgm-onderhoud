import { supabase } from './supabase'

// Eén foto per baan (tegel in "Alle banen"), in de openbare bucket 'huisstijl' met het pad in
// locaties.baanfoto_pad. Elk nieuw bestand krijgt een eigen naam, dus de CDN-cache zit nooit in de weg.

// Verkleint naar max. 1600 px breed (JPEG 82 %), uploadt, zet het pad en ruimt de vorige foto op.
export async function uploadBaanfoto(locatieId: string, vorigPad: string | null, bestand: File) {
  const bitmap = await createImageBitmap(bestand)
  const schaal = Math.min(1, 1600 / bitmap.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * schaal)
  canvas.height = Math.round(bitmap.height * schaal)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.82))
  if (!blob) return new Error('Foto kon niet worden verkleind.')

  const pad = `baanfotos/${locatieId}-${Date.now()}.jpg`
  const { error } = await supabase.storage.from('huisstijl').upload(pad, blob, { contentType: 'image/jpeg' })
  if (error) return error
  const { error: fout } = await supabase.from('locaties').update({ baanfoto_pad: pad }).eq('id', locatieId)
  if (fout) return fout
  if (vorigPad) await supabase.storage.from('huisstijl').remove([vorigPad])
  return null
}

export async function verwijderBaanfoto(locatieId: string, pad: string) {
  const { error } = await supabase.from('locaties').update({ baanfoto_pad: null }).eq('id', locatieId)
  if (error) return error
  await supabase.storage.from('huisstijl').remove([pad])
  return null
}
