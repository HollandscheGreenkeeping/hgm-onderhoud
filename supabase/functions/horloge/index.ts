// Edge Function 'horloge': een eigen sessie voor de Apple Watch van de ingelogde gebruiker.
// De iPhone-app roept dit aan met zijn eigen sessie (JWT); de functie maakt een eenmalige
// inlogsleutel (magic link, zonder e-mail te versturen) voor dezelfde gebruiker. De app wisselt
// die in voor een nieuwe, losse sessie en geeft die via WatchConnectivity aan het horloge.
// Zo ververst het horloge zijn sessie zelf en zit het de iPhone niet in de weg (Supabase trekt
// een gedeelde verversingssleutel in zodra hij twee keer gebruikt wordt).
// Deployen met verify_jwt aan.

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const antwoord = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return antwoord({ fout: 'Alleen POST' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const publiek = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY')!
  const aanroeper = createClient(url, publiek, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const { data: { user }, error } = await aanroeper.auth.getUser()
  if (error || !user?.email) return antwoord({ fout: 'Niet ingelogd.' }, 401)

  // Alleen actieve accounts.
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: profiel } = await admin.from('profielen').select('actief').eq('id', user.id).maybeSingle()
  if (!profiel?.actief) return antwoord({ fout: 'Dit account is gedeactiveerd.' }, 403)

  const { data, error: fout } = await admin.auth.admin.generateLink({ type: 'magiclink', email: user.email })
  if (fout || !data.properties?.hashed_token) return antwoord({ fout: 'Koppelen mislukt.' }, 500)
  return antwoord({ token_hash: data.properties.hashed_token, email: user.email })
})
