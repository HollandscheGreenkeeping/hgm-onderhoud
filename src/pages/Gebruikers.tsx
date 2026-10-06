import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { rolNamen, supabase, type Rol } from '../lib/supabase'
import { useLocatie } from '../lib/locatie'
import { useSessie } from '../lib/sessie'

type Lid = { profiel_id: string; rol: Rol; naam: string | null; email: string | null; actief: boolean }

const locatieRollen: Rol[] = ['hoofdgreenkeeper', 'greenkeeper', 'baanmanager']

// Roept de Edge Function 'gebruikers' aan en geeft de foutmelding uit de functie terug.
async function gebruikersFunctie(body: Record<string, string | undefined>) {
  const { data, error } = await supabase.functions.invoke('gebruikers', { body })
  if (error) {
    const tekst = error instanceof FunctionsHttpError
      ? (await error.context.json().catch(() => null))?.fout
      : null
    throw new Error(tekst ?? 'Er ging iets mis. Probeer het opnieuw.')
  }
  return data as { profiel_id?: string; nieuw?: boolean; wachtwoord?: string }
}

// Beheer en onderhoudsmanager: wie heeft toegang tot deze baan, met welke rol.
export default function Gebruikers() {
  const { locatie, isGlobaal, isBeheer } = useLocatie()
  const { sessie } = useSessie()
  const [leden, setLeden] = useState<Lid[] | null>(null)
  const [hgm, setHgm] = useState<Lid[]>([])
  const [toevoegen, setToevoegen] = useState(false)
  const [wachtwoord, setWachtwoord] = useState<{ naam: string; email: string; wachtwoord: string } | null>(null)
  const [fout, setFout] = useState<string | null>(null)

  const laad = useCallback(async () => {
    const [lg, gl] = await Promise.all([
      supabase.from('locatie_gebruikers').select('profiel_id, rol, profiel:profielen(naam, email, actief)')
        .eq('locatie_id', locatie.id),
      supabase.from('profielen').select('id, naam, email, actief, globale_rol').not('globale_rol', 'is', null).order('naam'),
    ])
    setLeden(((lg.data ?? []) as unknown as { profiel_id: string; rol: Rol; profiel: { naam: string | null; email: string | null; actief: boolean } }[])
      .map((r) => ({ profiel_id: r.profiel_id, rol: r.rol, ...r.profiel }))
      .sort((a, b) => locatieRollen.indexOf(a.rol) - locatieRollen.indexOf(b.rol) || (a.naam ?? '').localeCompare(b.naam ?? '')))
    setHgm((gl.data ?? []).map((p) => ({ profiel_id: p.id, rol: p.globale_rol as Rol, naam: p.naam, email: p.email, actief: p.actief })))
  }, [locatie.id])
  useEffect(() => { laad() }, [laad])

  async function actie(f: () => PromiseLike<{ error: unknown }>) {
    setFout(null)
    const { error } = await f()
    if (error) setFout('Opslaan mislukt.')
    laad()
  }

  async function nieuwWachtwoord(l: Lid) {
    if (!window.confirm(`Nieuw tijdelijk wachtwoord voor ${l.naam ?? l.email}? Het oude werkt dan niet meer.`)) return
    setFout(null)
    try {
      const r = await gebruikersFunctie({ actie: 'wachtwoord', profiel_id: l.profiel_id })
      setWachtwoord({ naam: l.naam ?? '', email: l.email ?? '', wachtwoord: r.wachtwoord! })
    } catch (e) {
      setFout((e as Error).message)
    }
  }

  if (!isGlobaal) return <main><div className="melding fout">Alleen voor beheer en onderhoudsmanager.</div></main>

  const mij = sessie!.user.id

  return (
    <main>
      <div className="kop-met-knop">
        <h1>Gebruikers</h1>
        {!toevoegen && <button className="knop" onClick={() => { setToevoegen(true); setWachtwoord(null) }}>Gebruiker toevoegen</button>}
      </div>
      <p className="zacht">Wie heeft toegang tot {locatie.naam}, en met welke rol.</p>
      {fout && <div className="melding fout">{fout}</div>}
      {wachtwoord && <WachtwoordKaart {...wachtwoord} sluit={() => setWachtwoord(null)} />}
      {toevoegen && (
        <Toevoegen
          sluit={() => setToevoegen(false)}
          klaar={(w) => { setToevoegen(false); if (w) setWachtwoord(w); laad() }}
        />
      )}

      <section>
        <h2>Op deze baan</h2>
        {leden?.length === 0 && <p className="zacht">Nog niemand gekoppeld.</p>}
        <ul className="lijst">
          {leden?.map((l) => (
            <li key={l.profiel_id} className={`rij ${l.actief ? '' : 'inactief'}`}>
              <span className="rij-hoofd">
                <strong>{l.naam ?? l.email}{!l.actief && ' (gedeactiveerd)'}</strong>
                <select aria-label={`Rol van ${l.naam}`} value={l.rol} className="rolkeuze"
                        onChange={(e) => actie(() => supabase.from('locatie_gebruikers').update({ rol: e.target.value })
                          .eq('profiel_id', l.profiel_id).eq('locatie_id', locatie.id))}>
                  {locatieRollen.map((r) => <option key={r} value={r}>{rolNamen[r]}</option>)}
                </select>
              </span>
              <span className="zacht">{l.email}</span>
              <div className="knoppenrij">
                <button className="knop tweede klein" onClick={() => nieuwWachtwoord(l)}>Nieuw wachtwoord</button>
                <button className="knop tweede klein"
                        onClick={() => actie(() => supabase.from('profielen').update({ actief: !l.actief }).eq('id', l.profiel_id))}>
                  {l.actief ? 'Deactiveren' : 'Activeren'}
                </button>
                <button className="knop tweede klein"
                        onClick={() => window.confirm(`${l.naam ?? l.email} van ${locatie.naam} halen? Het account blijft bestaan.`)
                          && actie(() => supabase.from('locatie_gebruikers').delete()
                            .eq('profiel_id', l.profiel_id).eq('locatie_id', locatie.id))}>
                  Van baan halen
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>HGM-breed (alle banen)</h2>
        <ul className="lijst">
          {hgm.map((l) => (
            <li key={l.profiel_id} className={`rij ${l.actief ? '' : 'inactief'}`}>
              <span className="rij-hoofd"><strong>{l.naam ?? l.email}</strong><span className="label">{rolNamen[l.rol]}</span></span>
              <span className="zacht">{l.email}</span>
              {isBeheer && l.profiel_id !== mij && (
                <div className="knoppenrij">
                  <button className="knop tweede klein" onClick={() => nieuwWachtwoord(l)}>Nieuw wachtwoord</button>
                  <button className="knop tweede klein"
                          onClick={() => actie(() => supabase.from('profielen').update({ actief: !l.actief }).eq('id', l.profiel_id))}>
                    {l.actief ? 'Deactiveren' : 'Activeren'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

function Toevoegen({ sluit, klaar }: {
  sluit: () => void
  klaar: (w: { naam: string; email: string; wachtwoord: string } | null) => void
}) {
  const { locatie, isBeheer } = useLocatie()
  const [naam, setNaam] = useState('')
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<string>('greenkeeper')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const globaal = rol === 'beheer' || rol === 'onderhoudsmanager'

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    setBezig(true)
    setFout(null)
    try {
      const r = await gebruikersFunctie({
        actie: 'aanmaken', naam, email,
        ...(globaal ? { globale_rol: rol } : { locatie_id: locatie.id, rol }),
      })
      klaar(r.wachtwoord ? { naam, email, wachtwoord: r.wachtwoord } : null)
    } catch (e) {
      setFout((e as Error).message)
      setBezig(false)
    }
  }

  return (
    <form className="kaart" onSubmit={opslaan}>
      <h2>Gebruiker toevoegen</h2>
      <label htmlFor="g-naam">Naam</label>
      <input id="g-naam" required value={naam} onChange={(e) => setNaam(e.target.value)} />
      <label htmlFor="g-email">E-mailadres</label>
      <input id="g-email" type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
      <label htmlFor="g-rol">Rol</label>
      <select id="g-rol" value={rol} onChange={(e) => setRol(e.target.value)}>
        {locatieRollen.map((r) => <option key={r} value={r}>{rolNamen[r]} op {locatie.naam}</option>)}
        {isBeheer && <option value="onderhoudsmanager">Onderhoudsmanager (alle banen)</option>}
        {isBeheer && <option value="beheer">Beheer (alle banen, incl. instellingen)</option>}
      </select>
      <p className="zacht klein-tekst">
        Bestaat het e-mailadres al, dan wordt dat account alleen gekoppeld. Een nieuw account krijgt een
        tijdelijk wachtwoord dat je zelf doorgeeft; bij de eerste keer inloggen kiest de gebruiker een eigen wachtwoord.
      </p>
      {fout && <div className="melding fout">{fout}</div>}
      <div className="knoppenrij">
        <button className="knop" disabled={bezig}>{bezig ? 'Bezig…' : 'Toevoegen'}</button>
        <button type="button" className="knop tweede" onClick={sluit}>Annuleren</button>
      </div>
    </form>
  )
}

function WachtwoordKaart({ naam, email, wachtwoord, sluit }: { naam: string; email: string; wachtwoord: string; sluit: () => void }) {
  const [gekopieerd, setGekopieerd] = useState(false)
  const tekst = `Inloggen bij HGM Golf Onderhoud: ${window.location.origin}\nE-mail: ${email}\nTijdelijk wachtwoord: ${wachtwoord}\nJe kiest bij de eerste keer inloggen een eigen wachtwoord.`
  return (
    <div className="kaart wachtwoordkaart" role="status">
      <h2>Account klaar{naam ? ` voor ${naam}` : ''}</h2>
      <p>Geef deze gegevens persoonlijk door (niet in een groepsapp). Dit wachtwoord wordt maar één keer getoond.</p>
      <dl className="velden">
        <div><dt>E-mail</dt><dd>{email}</dd></div>
        <div><dt>Tijdelijk wachtwoord</dt><dd><code className="wachtwoord">{wachtwoord}</code></dd></div>
      </dl>
      <div className="knoppenrij">
        <button className="knop" onClick={() => navigator.clipboard.writeText(tekst).then(() => setGekopieerd(true))}>
          {gekopieerd ? 'Gekopieerd' : 'Kopieer inloggegevens'}
        </button>
        <button className="knop tweede" onClick={sluit}>Sluiten</button>
      </div>
    </div>
  )
}
