import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const sleutel = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !sleutel) {
  throw new Error('VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY ontbreken; zie .env.example')
}

export const supabase = createClient(url, sleutel)

export type Rol = 'beheer' | 'onderhoudsmanager' | 'monteur' | 'hoofdgreenkeeper' | 'greenkeeper' | 'baanmanager'

export const rolNamen: Record<Rol, string> = {
  beheer: 'Beheer',
  onderhoudsmanager: 'Onderhoudsmanager',
  monteur: 'Monteur',
  hoofdgreenkeeper: 'Hoofd-greenkeeper',
  greenkeeper: 'Greenkeeper',
  baanmanager: 'Baanmanager',
}

export type MijnLocatie = { locatie_id: string; naam: string; rol: Rol; soort: 'baan' | 'werkplaats' }

export function huisstijlUrl(pad: string) {
  return supabase.storage.from('huisstijl').getPublicUrl(pad).data.publicUrl
}
