import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { rolNamen, supabase, type Rol } from '../lib/supabase'
import { useSessie } from '../lib/sessie'
import { Chip, DataTabel, FilterKeuze, PaginaKop, useUrlParam, useZoekfilter, Werkbalk, Zoekveld, type Kolom } from '../components/tabel'

type Persoon = { id: string; naam: string | null; email: string | null; actief: boolean; globale_rol: Rol | null }
type Koppeling = { profiel_id: string; locatie_id: string; rol: Rol }
type Baan = { id: string; naam: string }
type NieuwWachtwoord = { naam: string; email: string; wachtwoord: string }

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

function useGebruikersdata() {
  const [personen, setPersonen] = useState<Persoon[] | null>(null)
  const [koppelingen, setKoppelingen] = useState<Koppeling[]>([])
  const [banen, setBanen] = useState<Baan[]>([])
  const laad = useCallback(async () => {
    const [p, k, b] = await Promise.all([
      supabase.from('profielen').select('id, naam, email, actief, globale_rol').order('naam'),
      supabase.from('locatie_gebruikers').select('profiel_id, locatie_id, rol'),
      supabase.from('locaties').select('id, naam').eq('soort', 'baan').eq('actief', true).order('naam'),
    ])
    setPersonen(p.data ?? [])
    setKoppelingen(k.data ?? [])
    setBanen(b.data ?? [])
  }, [])
  useEffect(() => { laad() }, [laad])
  const baanNaam = (id: string) => banen.find((b) => b.id === id)?.naam ?? 'Onbekende baan'
  const vanPersoon = (id: string) => koppelingen.filter((k) => k.profiel_id === id)
    .sort((a, b) => baanNaam(a.locatie_id).localeCompare(baanNaam(b.locatie_id)))
  return { personen, koppelingen, banen, laad, baanNaam, vanPersoon }
}

// Beheer → Gebruikers: iedereen over alle banen als tabel; baan en zoekterm in de URL.
// Elke persoon heeft een eigen pagina (/beheer/gebruikers/:id) voor banen, rollen en het account.
export default function BeheerGebruikers() {
  const { personen, koppelingen, banen, vanPersoon, baanNaam } = useGebruikersdata()
  const [baan] = useUrlParam('baan')
  const zichtbaar = personen?.filter((p) => !baan
    || (baan === 'hgm' ? p.globale_rol : koppelingen.some((k) => k.profiel_id === p.id && k.locatie_id === baan))) ?? null
  const rijen = useZoekfilter(zichtbaar, (p) => [p.naam, p.email])

  const kolommen: Kolom<Persoon>[] = [
    { sleutel: 'naam', kop: 'Naam', sorteer: (p) => p.naam ?? p.email ?? '', cel: (p) => <>{p.naam ?? p.email}<span className="sub">{p.email}</span></> },
    { sleutel: 'rol', kop: 'Rol en banen', sorteer: (p) => (p.globale_rol ? rolNamen[p.globale_rol] : vanPersoon(p.id)[0]?.rol ?? 'z'), cel: (p) => {
      const eigen = vanPersoon(p.id)
      return (
        <span className="gebruiker-banen">
          {p.globale_rol ? <span className="chip">{rolNamen[p.globale_rol]} · alle banen</span>
            : eigen.length === 0 ? <span className="zacht">Nog aan geen baan gekoppeld</span>
            : eigen.map((k) => <span key={k.locatie_id} className="chip">{baanNaam(k.locatie_id)} · {rolNamen[k.rol]}</span>)}
        </span>
      )
    } },
    { sleutel: 'status', kop: 'Account', sorteer: (p) => (p.actief ? 0 : 1), cel: (p) => <Chip klasse={p.actief ? 'in-orde' : ''}>{p.actief ? 'Actief' : 'Gedeactiveerd'}</Chip> },
  ]

  return (
    <>
      <PaginaKop titel="Gebruikers" telling={rijen?.length}>
        <Link className="knop" to="/beheer/gebruikers/nieuw">Gebruiker toevoegen</Link>
      </PaginaKop>
      <Werkbalk>
        <Zoekveld placeholder="Zoek op naam of e-mail" />
        <FilterKeuze param="baan" label="Baan" opties={[['hgm', 'HGM-breed (beheer, onderhoudsmanager, monteur)'], ...banen.map((b) => [b.id, b.naam] as [string, string])]} />
      </Werkbalk>
      <DataTabel kolommen={kolommen} rijen={rijen} sleutel={(p) => p.id} naar={(p) => `/beheer/gebruikers/${p.id}`}
                 regelKlasse={(p) => (p.actief ? '' : 'gedempt')} leeg="Niemand gevonden." />
    </>
  )
}

// /beheer/gebruikers/nieuw (?baan=… zet de baan alvast)
export function GebruikerNieuw() {
  const { profiel } = useSessie()
  const { banen } = useGebruikersdata()
  const [zoek] = useSearchParams()
  const navigeer = useNavigate()
  const [wachtwoord, setWachtwoord] = useState<NieuwWachtwoord | null>(null)
  return (
    <>
      <p><Link to="/beheer/gebruikers">← Alle gebruikers</Link></p>
      <PaginaKop titel="Gebruiker toevoegen" />
      {wachtwoord
        ? <WachtwoordKaart {...wachtwoord} sluit={() => navigeer('/beheer/gebruikers')} />
        : <Toevoegen banen={banen} isBeheer={profiel?.globale_rol === 'beheer'} standaardBaan={zoek.get('baan') ?? undefined}
                     sluit={() => navigeer('/beheer/gebruikers')}
                     klaar={(w) => (w ? setWachtwoord(w) : navigeer('/beheer/gebruikers'))} />}
    </>
  )
}

// /beheer/gebruikers/:profielId: banen en rollen, wachtwoord en account.
export function GebruikerDetail() {
  const { profielId } = useParams()
  const { sessie, profiel } = useSessie()
  const isBeheer = profiel?.globale_rol === 'beheer'
  const { personen, banen, laad, baanNaam, vanPersoon } = useGebruikersdata()
  const [wachtwoord, setWachtwoord] = useState<NieuwWachtwoord | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const p = personen?.find((x) => x.id === profielId)

  async function actie(f: () => PromiseLike<{ error: unknown }>) {
    setFout(null)
    const { error } = await f()
    if (error) setFout('Opslaan mislukt.')
    laad()
  }

  async function nieuwWachtwoord() {
    if (!p || !window.confirm(`Nieuw tijdelijk wachtwoord voor ${p.naam ?? p.email}? Het oude werkt dan niet meer.`)) return
    setFout(null)
    try {
      const r = await gebruikersFunctie({ actie: 'wachtwoord', profiel_id: p.id })
      setWachtwoord({ naam: p.naam ?? '', email: p.email ?? '', wachtwoord: r.wachtwoord! })
    } catch (e) {
      setFout((e as Error).message)
    }
  }

  if (!personen) return <p className="zacht">Laden…</p>
  if (!p) return <><p><Link to="/beheer/gebruikers">← Alle gebruikers</Link></p><p className="zacht">Deze gebruiker bestaat niet.</p></>
  const eigen = vanPersoon(p.id)
  // Onderhoudsmanager beheert geen accounts van beheer; niemand wijzigt hier zichzelf.
  const magAccount = p.id !== sessie!.user.id && (isBeheer || p.globale_rol !== 'beheer')

  return (
    <>
      <p><Link to="/beheer/gebruikers">← Alle gebruikers</Link></p>
      <PaginaKop titel={p.naam ?? p.email ?? 'Gebruiker'} sub={p.email}>
        <Chip klasse={p.actief ? 'in-orde' : ''}>{p.actief ? 'Actief' : 'Gedeactiveerd'}</Chip>
      </PaginaKop>
      {fout && <div className="melding fout">{fout}</div>}
      {wachtwoord && <WachtwoordKaart {...wachtwoord} sluit={() => setWachtwoord(null)} />}

      <section className="kaart">
        <h2>Banen en rollen</h2>
        {p.globale_rol ? <p>{rolNamen[p.globale_rol]}: werkt op alle banen.</p> : (
          <>
            {eigen.length === 0 && <p className="zacht">Nog aan geen baan gekoppeld.</p>}
            {eigen.map((k) => (
              <div key={k.locatie_id} className="lus-rij gebruiker-koppeling">
                <span className="gebruiker-baan">{baanNaam(k.locatie_id)}</span>
                <select aria-label={`Rol op ${baanNaam(k.locatie_id)}`} value={k.rol} className="rolkeuze"
                        onChange={(e) => actie(() => supabase.from('locatie_gebruikers').update({ rol: e.target.value })
                          .eq('profiel_id', p.id).eq('locatie_id', k.locatie_id))}>
                  {locatieRollen.map((r) => <option key={r} value={r}>{rolNamen[r]}</option>)}
                </select>
                <button className="knop tweede klein"
                        onClick={() => window.confirm(`${p.naam ?? p.email} van ${baanNaam(k.locatie_id)} halen? Het account blijft bestaan.`)
                          && actie(() => supabase.from('locatie_gebruikers').delete().eq('profiel_id', p.id).eq('locatie_id', k.locatie_id))}>
                  Van baan halen
                </button>
              </div>
            ))}
            <Koppelen banen={banen.filter((b) => !eigen.some((k) => k.locatie_id === b.id))}
                      koppel={(locatie_id, rol) => actie(() => supabase.from('locatie_gebruikers').insert({ profiel_id: p.id, locatie_id, rol }))} />
          </>
        )}
      </section>

      {magAccount && (
        <div className="actiebalk">
          <button className="knop tweede" onClick={nieuwWachtwoord}>Nieuw tijdelijk wachtwoord</button>
          <button className="knop tweede" onClick={() => actie(() => supabase.from('profielen').update({ actief: !p.actief }).eq('id', p.id))}>
            {p.actief ? 'Account deactiveren' : 'Account activeren'}
          </button>
        </div>
      )}
    </>
  )
}

function Koppelen({ banen, koppel }: { banen: Baan[]; koppel: (locatieId: string, rol: Rol) => void }) {
  const [baan, setBaan] = useState('')
  const [rol, setRol] = useState<Rol>('greenkeeper')
  if (banen.length === 0) return null
  return (
    <form className="lus-rij" onSubmit={(e) => { e.preventDefault(); if (baan) { koppel(baan, rol); setBaan('') } }}>
      <select aria-label="Baan toevoegen" value={baan} onChange={(e) => setBaan(e.target.value)} required>
        <option value="">+ Aan baan koppelen…</option>
        {banen.map((b) => <option key={b.id} value={b.id}>{b.naam}</option>)}
      </select>
      <select aria-label="Rol" value={rol} className="rolkeuze" onChange={(e) => setRol(e.target.value as Rol)}>
        {locatieRollen.map((r) => <option key={r} value={r}>{rolNamen[r]}</option>)}
      </select>
      <button className="knop tweede klein" disabled={!baan}>Koppelen</button>
    </form>
  )
}

function Toevoegen({ banen, isBeheer, standaardBaan, sluit, klaar }: {
  banen: Baan[]
  isBeheer: boolean
  standaardBaan?: string
  sluit: () => void
  klaar: (w: NieuwWachtwoord | null) => void
}) {
  const [naam, setNaam] = useState('')
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<string>('greenkeeper')
  const [baan, setBaan] = useState(standaardBaan ?? '')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const globaal = rol === 'beheer' || rol === 'onderhoudsmanager' || rol === 'monteur'

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    setBezig(true)
    setFout(null)
    try {
      const r = await gebruikersFunctie({
        actie: 'aanmaken', naam, email,
        ...(globaal ? { globale_rol: rol } : { locatie_id: baan, rol }),
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
        {locatieRollen.map((r) => <option key={r} value={r}>{rolNamen[r]}</option>)}
        {isBeheer && <option value="monteur">Monteur (technische dienst, alle banen)</option>}
        {isBeheer && <option value="onderhoudsmanager">Onderhoudsmanager (alle banen)</option>}
        {isBeheer && <option value="beheer">Beheer (alle banen, incl. instellingen)</option>}
      </select>
      {!globaal && (
        <>
          <label htmlFor="g-baan">Baan</label>
          <select id="g-baan" required value={baan} onChange={(e) => setBaan(e.target.value)}>
            <option value="">Kies een baan…</option>
            {banen.map((b) => <option key={b.id} value={b.id}>{b.naam}</option>)}
          </select>
        </>
      )}
      <p className="zacht klein-tekst">
        Bestaat het e-mailadres al, dan wordt dat account alleen gekoppeld. Een nieuw account krijgt een
        tijdelijk wachtwoord dat je zelf doorgeeft; bij de eerste keer inloggen kiest de gebruiker een eigen wachtwoord.
        Meer banen koppelen kan daarna in de lijst.
      </p>
      {fout && <div className="melding fout">{fout}</div>}
      <div className="knoppenrij">
        <button className="knop" disabled={bezig}>{bezig ? 'Bezig…' : 'Toevoegen'}</button>
        <button type="button" className="knop tweede" onClick={sluit}>Annuleren</button>
      </div>
    </form>
  )
}

function WachtwoordKaart({ naam, email, wachtwoord, sluit }: NieuwWachtwoord & { sluit: () => void }) {
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
