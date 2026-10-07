import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { useLocatie } from '../lib/locatie'
import { useSessie } from '../lib/sessie'
import { useTeam } from '../lib/keuzelijst'
import { datum, datumTijd, initialen, objectTitel, openStoringStatussen, taakStatus, vandaag } from '../lib/teksten'
import { storingCode, storingVelden, type Storing } from '../lib/storingen'
import StoringRij from '../components/StoringRij'
import { Chip, DataTabel, PaginaKop, useUrlParam, useZoekfilter, Weergaven, Werkbalk, Zoekveld, type Kolom } from '../components/tabel'

type Taak = {
  id: string; omschrijving: string; status: string; deadline: string | null; gepland_op: string | null
  toegewezen_aan: string | null; afgerond_op: string | null; intern: boolean; object_id: string | null
  storing_id: string | null; machine_id: string | null; bron: string; aangemaakt_op: string
  object: { code: string | null; objecttypes: { naam: string; categorie: string } | null; hole: { nummer: number } | null } | null
  uitvoerder: { naam: string | null } | null
}

const taakVelden = `id, omschrijving, status, deadline, gepland_op, toegewezen_aan, afgerond_op, intern, object_id, storing_id,
  machine_id, bron, aangemaakt_op,
  object:objecten(code, objecttypes(naam, categorie), hole:holes(nummer)),
  uitvoerder:profielen!taken_toegewezen_aan_fkey(naam)`

const isOpen = (t: Pick<Taak, 'status'>) => ['open', 'in_behandeling'].includes(t.status)
const verlopen = (t: Taak) => t.deadline != null && t.deadline < vandaag() && isOpen(t)
const statusKlasse = (t: Taak) => (verlopen(t) ? 'storing' : t.status === 'afgerond' ? 'in-orde' : t.status === 'in_behandeling' ? 'gepland' : '')
const bronNamen: Record<string, string> = { schema: 'Onderhoudsschema', storing: 'Storing', handmatig: 'Handmatig', dagplanning: 'Dagplanning' }
const categorieNaam: Record<string, string> = { beregening: 'Beregening', drainage: 'Drainage', kabel: 'Kabels', overig: 'Overig' }

const kolommenBord: [string, string, string, (t: Taak) => boolean][] = [
  ['teplannen', 'Te plannen', 'var(--kleur-rand-sterk)', (t) => t.status === 'open' && !t.toegewezen_aan],
  ['ingepland', 'Ingepland', 'var(--kleur-beregening)', (t) => t.status === 'open' && !!t.toegewezen_aan],
  ['bezig', 'Bezig', 'var(--kleur-gepland)', (t) => t.status === 'in_behandeling'],
  ['klaar', 'Klaar', 'var(--kleur-in-orde)', (t) => t.status === 'afgerond'],
]

function weekNummer(d = new Date()) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7))
  return Math.ceil(((x.getTime() - Date.UTC(x.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7)
}

// Taken van de baan. Weergave (lijst, bord, per hole) en filter staan in de URL; elke taak heeft
// een eigen pagina (/taken/:id) met de acties. Op de telefoon altijd de lijst.
export default function Taken() {
  const { locatie, magRegistreren, magPlannen } = useLocatie()
  const { sessie } = useSessie()
  const [weergave] = useUrlParam('weergave', 'lijst')
  const [filter] = useUrlParam('filter', magRegistreren ? 'mijn' : 'open')
  const [taken, setTaken] = useState<Taak[] | null>(null)
  const [storingen, setStoringen] = useState<Storing[]>([])
  const [smal, setSmal] = useState(() => window.matchMedia('(max-width: 700px)').matches)
  const mij = sessie!.user.id
  const actief = smal ? 'lijst' : weergave
  const basis = `/locatie/${locatie.id}`

  useEffect(() => {
    const m = window.matchMedia('(max-width: 700px)')
    const wissel = () => setSmal(m.matches)
    m.addEventListener('change', wissel)
    return () => m.removeEventListener('change', wissel)
  }, [])

  const laad = useCallback(async () => {
    setTaken(null)
    let q = supabase.from('taken').select(taakVelden).eq('locatie_id', locatie.id)
    if (actief === 'bord') {
      const tweeWeken = new Date(Date.now() - 14 * 864e5).toISOString()
      q = q.or(`status.in.(open,in_behandeling),and(status.eq.afgerond,afgerond_op.gte.${tweeWeken})`).order('deadline', { nullsFirst: false })
    } else if (actief === 'lijst' && filter === 'afgerond') {
      q = q.in('status', ['afgerond', 'geannuleerd']).order('afgerond_op', { ascending: false }).limit(200)
    } else {
      q = q.in('status', ['open', 'in_behandeling']).order('deadline', { nullsFirst: false }).order('aangemaakt_op')
      if (actief === 'lijst' && filter === 'mijn') q = q.eq('toegewezen_aan', mij)
    }
    const metStoringen = actief === 'lijst' && filter === 'mijn'
    const [t, s] = await Promise.all([
      q,
      metStoringen
        ? supabase.from('storingen').select(storingVelden).eq('locatie_id', locatie.id)
            .eq('toegewezen_aan', mij).in('status', openStoringStatussen).order('urgentie', { ascending: false })
        : Promise.resolve({ data: [] }),
    ])
    setTaken((t.data ?? []) as unknown as Taak[])
    setStoringen((s.data ?? []) as unknown as Storing[])
  }, [locatie.id, actief, filter, mij])
  useEffect(() => { laad() }, [laad])

  const rijen = useZoekfilter(taken, (t) => [t.omschrijving, objectTitel(t.object), t.uitvoerder?.naam])

  const perHole = useMemo(() => {
    const m = new Map<string, Taak[]>()
    for (const t of rijen ?? []) {
      const k = t.object?.hole ? `Hole ${t.object.hole.nummer}` : 'Zonder hole'
      m.set(k, [...(m.get(k) ?? []), t])
    }
    return [...m].sort(([a], [b]) => (a === 'Zonder hole' ? 1 : b === 'Zonder hole' ? -1 : Number(a.slice(5)) - Number(b.slice(5))))
  }, [rijen])

  const kolommen: Kolom<Taak>[] = [
    { sleutel: 'omschrijving', kop: 'Taak', sorteer: (t) => t.omschrijving, cel: (t) => (
      <>{t.omschrijving}<span className="sub">{objectTitel(t.object) ?? bronNamen[t.bron]}{t.storing_id ? ` · uit ${storingCode({ id: t.storing_id })}` : ''}</span></>
    ) },
    { sleutel: 'hole', kop: 'Hole', klasse: 'smal', sorteer: (t) => t.object?.hole?.nummer ?? null, cel: (t) => t.object?.hole?.nummer ?? '–' },
    { sleutel: 'uitvoerder', kop: 'Uitvoerder', sorteer: (t) => t.uitvoerder?.naam ?? '', cel: (t) => t.uitvoerder?.naam ?? <span className="zacht">Nog niemand</span> },
    { sleutel: 'deadline', kop: filter === 'afgerond' ? 'Afgerond' : 'Uiterlijk', klasse: 'mono smal',
      sorteer: (t) => (filter === 'afgerond' ? t.afgerond_op : t.deadline), cel: (t) => (
        <span className={verlopen(t) ? 'rood' : ''}>{filter === 'afgerond' ? datum(t.afgerond_op) : t.deadline ? datum(t.deadline) : '–'}</span>
      ) },
    { sleutel: 'status', kop: 'Status', sorteer: (t) => t.status, cel: (t) => <Chip klasse={statusKlasse(t)}>{verlopen(t) ? 'Verlopen' : taakStatus[t.status]}</Chip> },
  ]

  return (
    <main className="breed">
      <PaginaKop titel="Taken" telling={rijen?.length} sub={`Week ${weekNummer()}`}>
        {magPlannen && <Link className="knop groen" to={`${basis}/taken/nieuw`}>Nieuwe taak</Link>}
      </PaginaKop>
      <Werkbalk>
        {!smal && <Weergaven standaard="lijst" opties={[{ waarde: 'lijst', naam: 'Lijst' }, { waarde: 'bord', naam: 'Bord' }, { waarde: 'hole', naam: 'Per hole' }]} />}
        {actief === 'lijst' && (
          <Weergaven param="filter" standaard={magRegistreren ? 'mijn' : 'open'} opties={[
            ...(magRegistreren ? [{ waarde: 'mijn', naam: 'Mijn werk' }] : []),
            { waarde: 'open', naam: 'Alle open' },
            { waarde: 'afgerond', naam: 'Afgerond' },
          ]} />
        )}
        <Zoekveld placeholder="Zoek op taak, object of uitvoerder" />
      </Werkbalk>

      {actief === 'lijst' && filter === 'mijn' && storingen.length > 0 && (
        <section className="taken-storingen">
          <h2>Storingen aan mij</h2>
          <ul className="lijst">
            {storingen.map((s) => <li key={s.id}><StoringRij storing={s} naar={`${basis}/storingen/${s.id}`} /></li>)}
          </ul>
          <h2>Taken</h2>
        </section>
      )}

      {actief === 'lijst' && (
        <DataTabel kolommen={kolommen} rijen={rijen} sleutel={(t) => t.id} naar={(t) => `${basis}/taken/${t.id}`}
                   regelKlasse={(t) => (verlopen(t) ? 'let-op' : isOpen(t) ? '' : 'gedempt')}
                   leeg={filter === 'mijn' ? 'Je hebt geen openstaande taken.' : 'Geen taken in deze weergave.'} />
      )}

      {actief === 'bord' && (
        <div className="bord">
          {kolommenBord.map(([sleutel, naam, kleur, hoort]) => {
            const lijst = (rijen ?? []).filter(hoort)
            return (
              <section key={sleutel} className="bord-kolom" style={{ '--c': kleur } as CSSProperties}>
                <div className="bord-kop"><strong>{naam}</strong><span>{lijst.length}</span></div>
                {lijst.map((t) => (
                  <Link key={t.id} to={`${basis}/taken/${t.id}`} className={`rij ${verlopen(t) ? 'verlopen' : ''}`}>
                    <span className="rij-hoofd">
                      <strong>{t.omschrijving}</strong>
                      {t.uitvoerder?.naam && <span className="avatar" title={t.uitvoerder.naam}>{initialen(t.uitvoerder.naam)}</span>}
                    </span>
                    <span className="rij-meta">
                      {t.object?.hole && <span className="hole-pil">Hole {t.object.hole.nummer}</span>}
                      {t.object?.objecttypes && <span className={`cat ${t.object.objecttypes.categorie}`}>{categorieNaam[t.object.objecttypes.categorie] ?? t.object.objecttypes.categorie}</span>}
                    </span>
                    <span className={`mono ${verlopen(t) ? 'rood' : 'zacht'}`}>
                      {t.status === 'afgerond' ? `afgerond ${datum(t.afgerond_op)}` : t.deadline ? `uiterlijk ${datum(t.deadline)}` : 'geen deadline'}
                    </span>
                  </Link>
                ))}
              </section>
            )
          })}
        </div>
      )}

      {actief === 'hole' && (
        <>
          {rijen?.length === 0 && <p className="zacht">Geen open taken.</p>}
          {perHole.map(([hole, lijst]) => (
            <section key={hole} className="perhole">
              <h2>{hole} <span className="mono zacht">{lijst.length}</span></h2>
              <DataTabel kolommen={kolommen.filter((k) => k.sleutel !== 'hole')} rijen={lijst} sleutel={(t) => t.id}
                         naar={(t) => `${basis}/taken/${t.id}`} regelKlasse={(t) => (verlopen(t) ? 'let-op' : '')} leeg="" />
            </section>
          ))}
        </>
      )}
    </main>
  )
}

// /taken/:taakId: alles over één taak, met de acties (bezig, afronden met tijd, annuleren, heropenen)
// en voor de hoofd-greenkeeper het wijzigen van omschrijving, uitvoerder en deadline.
export function TaakDetail() {
  const { taakId } = useParams()
  const { locatie, magRegistreren, magPlannen } = useLocatie()
  const { sessie } = useSessie()
  const team = useTeam(locatie.id)
  const [t, setT] = useState<Taak | null>(null)
  const [minuten, setMinuten] = useState('')
  const [afronden, setAfronden] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const basis = `/locatie/${locatie.id}`

  const laad = useCallback(() => {
    supabase.from('taken').select(taakVelden).eq('id', taakId!).single().then(({ data, error }) => {
      if (error) return setFout('Deze taak bestaat niet of je hebt geen toegang.')
      setT(data as unknown as Taak)
    })
  }, [taakId])
  useEffect(laad, [laad])

  async function wijzig(velden: Record<string, unknown>) {
    setBezig(true)
    setFout(null)
    const { error } = await supabase.from('taken').update(velden).eq('id', taakId!)
    if (!error && velden.status === 'afgerond' && Number(minuten) > 0) {
      await supabase.from('uren').insert({ locatie_id: locatie.id, minuten: Number(minuten), bron_tabel: 'taken', bron_id: taakId })
    }
    setBezig(false)
    setAfronden(false)
    if (error) return setFout(error.message.includes('greenkeeper') ? error.message : 'Opslaan mislukt.')
    laad()
  }

  if (fout && !t) return <main><div className="melding fout">{fout}</div></main>
  if (!t) return <main className="zacht">Laden…</main>

  const magAfronden = magPlannen || (magRegistreren && t.toegewezen_aan === sessie!.user.id)

  return (
    <main>
      <PaginaKop titel={t.omschrijving}>
        <Chip klasse={statusKlasse(t)}>{verlopen(t) ? 'Verlopen' : taakStatus[t.status]}</Chip>
      </PaginaKop>
      {fout && <div className="melding fout">{fout}</div>}

      <section className="kaart">
        <dl className="velden">
          <div><dt>Waar</dt><dd>{objectTitel(t.object) ?? 'Hele baan'}{t.object_id && <> · <Link to={`${basis}?object=${t.object_id}`}>op de kaart</Link></>}</dd></div>
          <div><dt>Bron</dt><dd>{bronNamen[t.bron]}{t.storing_id && <> · <Link to={`${basis}/storingen/${t.storing_id}`}>{storingCode({ id: t.storing_id })}</Link></>}</dd></div>
          {t.machine_id && <div><dt>Machine</dt><dd><Link to={`${basis}/materieel/${t.machine_id}`}>Naar de machine</Link></dd></div>}
          <div><dt>Aangemaakt</dt><dd>{datumTijd(t.aangemaakt_op)}</dd></div>
          {t.afgerond_op && <div><dt>Afgerond</dt><dd>{datumTijd(t.afgerond_op)}</dd></div>}
          {t.intern && <div><dt>Zichtbaarheid</dt><dd>Intern (niet voor de golfclub)</dd></div>}
        </dl>
      </section>

      <section className="kaart">
        <h2>Planning</h2>
        <div className="twee-kolommen">
          <div>
            <label htmlFor="t-uitvoerder">Uitvoerder</label>
            <select id="t-uitvoerder" value={t.toegewezen_aan ?? ''} disabled={!magPlannen || bezig}
                    onChange={(e) => wijzig({ toegewezen_aan: e.target.value || null })}>
              <option value="">— nog niemand —</option>
              {team.map((m) => <option key={m.id} value={m.id}>{m.naam}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="t-deadline">Uiterlijk klaar op</label>
            <input id="t-deadline" type="date" value={t.deadline ?? ''} disabled={!magPlannen || bezig}
                   onChange={(e) => wijzig({ deadline: e.target.value || null })} />
          </div>
        </div>
        {magPlannen && (
          <>
            <label htmlFor="t-omschrijving">Omschrijving</label>
            <input id="t-omschrijving" defaultValue={t.omschrijving}
                   onBlur={(e) => e.target.value && e.target.value !== t.omschrijving && wijzig({ omschrijving: e.target.value })} />
          </>
        )}
      </section>

      {afronden && (
        <section className="kaart">
          <h2>Afronden</h2>
          <label htmlFor="t-minuten">Tijd besteed (minuten, optioneel)</label>
          <input id="t-minuten" type="number" inputMode="numeric" min={1} max={1440} value={minuten} onChange={(e) => setMinuten(e.target.value)} />
          <div className="knoppenrij">
            <button className="knop groen" disabled={bezig} onClick={() => wijzig({ status: 'afgerond' })}>Afgerond</button>
            <button className="knop tweede" onClick={() => setAfronden(false)}>Terug</button>
          </div>
        </section>
      )}

      {!afronden && (
        <div className="actiebalk">
          {isOpen(t) && magAfronden && t.status === 'open' && (
            <button className="knop tweede" disabled={bezig} onClick={() => wijzig({ status: 'in_behandeling' })}>Ik ben bezig</button>
          )}
          {isOpen(t) && magAfronden && <button className="knop groen" disabled={bezig} onClick={() => setAfronden(true)}>Afronden…</button>}
          {isOpen(t) && magPlannen && (
            <button className="knop tweede" disabled={bezig} onClick={() => window.confirm('Taak annuleren?') && wijzig({ status: 'geannuleerd' })}>Annuleren</button>
          )}
          {!isOpen(t) && magPlannen && <button className="knop tweede" disabled={bezig} onClick={() => wijzig({ status: 'open' })}>Heropenen</button>}
        </div>
      )}
    </main>
  )
}

// /taken/nieuw (eventueel ?object=… vanaf de kaart)
export function TaakNieuw() {
  const { locatie, magPlannen } = useLocatie()
  const [zoek] = useSearchParams()
  const navigeer = useNavigate()
  const team = useTeam(locatie.id)
  const objectId = zoek.get('object')
  const [object, setObject] = useState<string | null>(null)
  const [omschrijving, setOmschrijving] = useState('')
  const [toegewezen, setToegewezen] = useState('')
  const [deadline, setDeadline] = useState('')
  const [intern, setIntern] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const basis = `/locatie/${locatie.id}`

  useEffect(() => {
    if (!objectId) return
    supabase.from('objecten').select('code, objecttypes(naam)').eq('id', objectId).single()
      .then(({ data }) => setObject(objectTitel(data as never)))
  }, [objectId])

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    const { data, error } = await supabase.from('taken').insert({
      locatie_id: locatie.id, bron: 'handmatig', object_id: objectId, omschrijving,
      toegewezen_aan: toegewezen || null, deadline: deadline || null, intern,
    }).select('id').single()
    if (error || !data) return setFout('Opslaan mislukt.')
    navigeer(`${basis}/taken/${data.id}`)
  }

  if (!magPlannen) return <main><div className="melding fout">Alleen de hoofd-greenkeeper en hoger plannen taken.</div></main>

  return (
    <main>
      <PaginaKop titel="Nieuwe taak" sub={objectId ? `Voor ${object ?? '…'}` : undefined} />
      <form className="kaart" onSubmit={opslaan}>
        <label htmlFor="omschrijving">Wat moet er gebeuren?</label>
        <input id="omschrijving" required value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} />
        <div className="twee-kolommen">
          <div>
            <label htmlFor="toegewezen">Toewijzen aan</label>
            <select id="toegewezen" value={toegewezen} onChange={(e) => setToegewezen(e.target.value)}>
              <option value="">— later —</option>
              {team.map((t) => <option key={t.id} value={t.id}>{t.naam}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="deadline">Uiterlijk klaar op</label>
            <input id="deadline" type="date" min={vandaag()} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
        </div>
        <label className="vink">
          <input type="checkbox" checked={intern} onChange={(e) => setIntern(e.target.checked)} />
          Intern (niet zichtbaar voor de golfclub)
        </label>
        {fout && <div className="melding fout">{fout}</div>}
        <div className="actiebalk">
          <button className="knop">Taak opslaan</button>
          <button type="button" className="knop tweede" onClick={() => navigeer(`${basis}/taken`)}>Annuleren</button>
        </div>
      </form>
    </main>
  )
}
