// Edge Function 'gebruikers': accounts aanmaken en tijdelijke wachtwoorden zetten vanuit de app.
// Alleen voor beheer en onderhoudsmanager (is_globaal). Accounts aanmaken kan alleen met de
// service-sleutel; die staat hier op de server en nooit in de app.
//
// Acties (POST, JSON):
//   { actie: 'aanmaken', email, naam, locatie_id?, rol?, globale_rol? }
//       → bestaand account (zelfde e-mail) wordt alleen gekoppeld; nieuw account krijgt een
//         tijdelijk wachtwoord dat de gebruiker bij de eerste keer inloggen moet wijzigen.
//   { actie: 'wachtwoord', profiel_id } → nieuw tijdelijk wachtwoord.
//
// Koppelen aan een locatie en globale rollen gaan via de client van de aanroeper, zodat de
// gewone RLS en triggers gelden (bijv. alleen beheer mag een globale rol toekennen).

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const antwoord = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// Leesbaar tijdelijk wachtwoord zonder verwarrende tekens (0/O, 1/l/I).
function tijdelijkWachtwoord() {
  const tekens = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const r = crypto.getRandomValues(new Uint32Array(12))
  const s = Array.from(r, (n) => tekens[n % tekens.length]).join('')
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`
}

const rollen = ['hoofdgreenkeeper', 'greenkeeper', 'baanmanager']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return antwoord({ fout: 'Alleen POST' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const publiek = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY')!
  const dienst = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const aanroeper = createClient(url, publiek, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const admin = createClient(url, dienst, { auth: { persistSession: false } })

  const [{ data: globaal }, { data: beheer }] = await Promise.all([
    aanroeper.rpc('is_globaal'),
    aanroeper.rpc('is_beheer'),
  ])
  if (!globaal) return antwoord({ fout: 'Alleen beheer of onderhoudsmanager mag gebruikers beheren.' }, 403)

  let body: Record<string, string | undefined>
  try {
    body = await req.json()
  } catch {
    return antwoord({ fout: 'Ongeldige aanvraag' }, 400)
  }

  if (body.actie === 'aanmaken') {
    const email = (body.email ?? '').trim().toLowerCase()
    const naam = (body.naam ?? '').trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return antwoord({ fout: 'Ongeldig e-mailadres.' }, 400)
    if (body.rol && !rollen.includes(body.rol)) return antwoord({ fout: 'Ongeldige rol.' }, 400)
    if (body.globale_rol && !beheer) return antwoord({ fout: 'Alleen beheer mag een globale rol toekennen.' }, 403)
    if (!body.globale_rol && !(body.locatie_id && body.rol)) return antwoord({ fout: 'Kies een baan en rol.' }, 400)

    const { data: bestaand } = await admin.from('profielen').select('id').eq('email', email).maybeSingle()
    let profielId = bestaand?.id as string | undefined
    let wachtwoord: string | undefined

    if (!profielId) {
      wachtwoord = tijdelijkWachtwoord()
      const { data, error } = await admin.auth.admin.createUser({
        email, password: wachtwoord, email_confirm: true,
        user_metadata: { naam, wachtwoord_wijzigen: true },
      })
      if (error) return antwoord({ fout: `Account aanmaken mislukt: ${error.message}` }, 400)
      profielId = data.user.id
    }

    if (body.globale_rol) {
      const { error } = await aanroeper.from('profielen').update({ globale_rol: body.globale_rol }).eq('id', profielId)
      if (error) return antwoord({ fout: `Rol toekennen mislukt: ${error.message}` }, 400)
    }
    if (body.locatie_id && body.rol) {
      const { error } = await aanroeper.from('locatie_gebruikers')
        .upsert({ profiel_id: profielId, locatie_id: body.locatie_id, rol: body.rol })
      if (error) return antwoord({ fout: `Koppelen aan baan mislukt: ${error.message}` }, 400)
    }
    return antwoord({ profiel_id: profielId, nieuw: !bestaand, wachtwoord })
  }

  if (body.actie === 'wachtwoord') {
    const { data: doel } = await admin.from('profielen').select('id, globale_rol').eq('id', body.profiel_id ?? '').maybeSingle()
    if (!doel) return antwoord({ fout: 'Gebruiker niet gevonden.' }, 404)
    if (doel.globale_rol === 'beheer' && !beheer) {
      return antwoord({ fout: 'Alleen beheer kan het wachtwoord van beheer wijzigen.' }, 403)
    }
    const wachtwoord = tijdelijkWachtwoord()
    const { error } = await admin.auth.admin.updateUserById(doel.id, {
      password: wachtwoord, user_metadata: { wachtwoord_wijzigen: true },
    })
    if (error) return antwoord({ fout: `Wachtwoord wijzigen mislukt: ${error.message}` }, 400)
    return antwoord({ wachtwoord })
  }

  return antwoord({ fout: 'Onbekende actie' }, 400)
})
