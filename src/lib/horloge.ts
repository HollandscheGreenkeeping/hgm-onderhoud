import { useEffect } from 'react'
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { createClient, FunctionsHttpError } from '@supabase/supabase-js'
import { supabase, supabaseSleutel, supabaseUrl } from './supabase'
import { useSessie } from './sessie'

// Koppeling met de Apple Watch-app (ios/App/HGMWatch). Alleen in de iOS-app.
// Het horloge krijgt een eigen sessie: de Edge Function 'horloge' maakt een eenmalige inlogsleutel,
// die we hier inwisselen in een losse client (niet bewaard, niet ververst) en via WatchConnectivity
// doorgeven. Zo ververst het horloge zijn sessie zelf, los van de iPhone.

type Status = { ondersteund: boolean; gekoppeld: boolean; geinstalleerd: boolean }
type HorlogePlugin = {
  status(): Promise<Status>
  stuurSessie(s: Record<string, string | number>): Promise<void>
  ontkoppel(): Promise<void>
  addListener(gebeurtenis: 'koppelVerzoek', fn: () => void): Promise<PluginListenerHandle>
}

const Horloge = registerPlugin<HorlogePlugin>('Horloge')
export const inIosApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
const gekoppeldSleutel = 'hgm-horloge-gekoppeld' // profiel-id waarvoor het horloge een sessie heeft

export async function horlogeStatus(): Promise<Status | null> {
  if (!inIosApp()) return null
  try {
    const s = await Horloge.status()
    console.info('[Horloge] status', JSON.stringify(s))
    return s
  } catch (e) {
    console.warn('[Horloge] status mislukt:', (e as Error).message)
    return null
  }
}

// Geeft het horloge een eigen sessie. Gooit een fout met een leesbare melding.
export async function koppelHorloge(naam: string) {
  const status = await horlogeStatus()
  if (!status?.gekoppeld) throw new Error('Er is geen Apple Watch aan deze iPhone gekoppeld.')
  if (!status.geinstalleerd) throw new Error('Installeer eerst HGM op je Apple Watch (Watch-app op de iPhone → Beschikbare apps).')

  const { data, error } = await supabase.functions.invoke('horloge', { body: {} })
  if (error) {
    const tekst = error instanceof FunctionsHttpError ? (await error.context.json().catch(() => null))?.fout : null
    throw new Error(tekst ?? 'Koppelen mislukt. Probeer het later opnieuw.')
  }
  const los = createClient(supabaseUrl, supabaseSleutel, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'hgm-horloge' },
  })
  const { data: v, error: fout } = await los.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' })
  if (fout || !v.session) throw new Error('Koppelen mislukt. Probeer het later opnieuw.')
  await Horloge.stuurSessie({
    access_token: v.session.access_token, refresh_token: v.session.refresh_token,
    expires_at: v.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    url: supabaseUrl, sleutel: supabaseSleutel, gebruiker: v.session.user.id, naam,
  })
  try { localStorage.setItem(gekoppeldSleutel, v.session.user.id) } catch { /* privémodus */ }
}

export async function ontkoppelHorloge() {
  if (!inIosApp()) return
  try { localStorage.removeItem(gekoppeldSleutel) } catch { /* privémodus */ }
  try { await Horloge.ontkoppel() } catch { /* geen horloge */ }
}

// Automatisch: na inloggen één keer koppelen, opnieuw als het horloge erom vraagt,
// en ontkoppelen bij uitloggen.
export function HorlogeKoppeling() {
  const { laden, sessie, profiel } = useSessie()
  const id = sessie?.user.id
  const naam = profiel?.naam ?? profiel?.email ?? ''

  useEffect(() => {
    if (!inIosApp() || laden) return
    let vorige: string | null = null
    try { vorige = localStorage.getItem(gekoppeldSleutel) } catch { /* privémodus */ }
    if (!id) { if (vorige) ontkoppelHorloge(); return }   // uitgelogd
    const al = vorige === id
    if (!al) koppelHorloge(naam).catch((e) => console.warn('[Horloge] koppelen:', (e as Error).message))
    let handvat: PluginListenerHandle | undefined
    Horloge.addListener('koppelVerzoek', () => { koppelHorloge(naam).catch((e) => console.warn('[Horloge] koppelen:', (e as Error).message)) }).then((h) => { handvat = h })
    return () => { handvat?.remove() }
  }, [laden, id, naam])

  return null
}
