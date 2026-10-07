import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { useLocatie } from '../lib/locatie'
import { useTeam } from '../lib/keuzelijst'
import { datum, objectTitel, vandaag } from '../lib/teksten'
import { Chip, DataTabel, PaginaKop, useUrlParam, useZoekfilter, Weergaven, Werkbalk, Zoekveld, type Kolom } from '../components/tabel'

type Eenheid = 'dagen' | 'weken' | 'maanden' | 'jaren' | 'draaiuren'

type Schema = {
  id: string; omschrijving: string; interval_waarde: number; interval_eenheid: Eenheid
  volgende_datum: string | null; volgende_draaiuren: number | null; vooruit_dagen: number; actief: boolean; intern: boolean
  via_werkplaats: boolean
  objecttype_id: string | null; object_id: string | null; machine_id: string | null; toegewezen_aan: string | null
  objecttype: { naam: string } | null
  object: { code: string | null; objecttypes: { naam: string } | null } | null
  machine: { naam: string | null; merk: string | null; model: string | null } | null
  uitvoerder: { naam: string | null } | null
}

const schemaVelden = `id, omschrijving, interval_waarde, interval_eenheid, volgende_datum, volgende_draaiuren,
  vooruit_dagen, actief, intern, via_werkplaats, objecttype_id, object_id, machine_id, toegewezen_aan,
  objecttype:objecttypes(naam), object:objecten(code, objecttypes(naam)), machine:machines(naam, merk, model),
  uitvoerder:profielen!onderhoudsschemas_toegewezen_aan_fkey(naam)`

const eenheidNamen: Record<Eenheid, [string, string]> = {
  dagen: ['dag', 'dagen'], weken: ['week', 'weken'], maanden: ['maand', 'maanden'],
  jaren: ['jaar', 'jaar'], draaiuren: ['draaiuur', 'draaiuren'],
}
const intervalTekst = (s: Pick<Schema, 'interval_waarde' | 'interval_eenheid'>) =>
  s.interval_waarde === 1
    ? `Elke ${eenheidNamen[s.interval_eenheid][0]}`
    : `Elke ${s.interval_waarde} ${eenheidNamen[s.interval_eenheid][1]}`

const doelTekst = (s: Schema) =>
  s.object ? objectTitel(s.object)
    : s.objecttype ? `Alle ${s.objecttype.naam.toLowerCase()}s`
    : s.machine ? s.machine.naam ?? [s.machine.merk, s.machine.model].filter(Boolean).join(' ')
    : 'Hele baan'

function volgende(d: string, s: Pick<Schema, 'interval_waarde' | 'interval_eenheid'>) {
  const x = new Date(d + 'T12:00:00')
  const n = s.interval_waarde
  if (s.interval_eenheid === 'dagen') x.setDate(x.getDate() + n)
  if (s.interval_eenheid === 'weken') x.setDate(x.getDate() + 7 * n)
  if (s.interval_eenheid === 'maanden') x.setMonth(x.getMonth() + n)
  if (s.interval_eenheid === 'jaren') x.setFullYear(x.getFullYear() + n)
  return x.toISOString().slice(0, 10)
}

// Gepland onderhoud. Weergave (kalender, schema's, verlopen) en maand staan in de URL;
// elk schema heeft een eigen pagina (/onderhoud/schemas/:id).
export default function Onderhoud() {
  const { magPlannen } = useLocatie()
  const [weergave] = useUrlParam('weergave', 'kalender')
  const { locatie } = useLocatie()
  return (
    <main className="breed">
      <PaginaKop titel="Gepland onderhoud">
        {magPlannen && <Link className="knop" to={`/locatie/${locatie.id}/onderhoud/schemas/nieuw`}>Nieuw schema</Link>}
      </PaginaKop>
      <Werkbalk>
        <Weergaven standaard="kalender" opties={[{ waarde: 'kalender', naam: 'Kalender' }, { waarde: 'schemas', naam: "Schema's" }, { waarde: 'verlopen', naam: 'Verlopen' }]} />
        {weergave === 'schemas' && <Zoekveld placeholder="Zoek schema" />}
      </Werkbalk>
      {weergave === 'kalender' && <Kalender />}
      {weergave === 'schemas' && <Schemas />}
      {weergave === 'verlopen' && <Verlopen />}
    </main>
  )
}

// ── Schema's ─────────────────────────────────────────────────────────────

function Schemas() {
  const { locatie, magPlannen } = useLocatie()
  const [schemas, setSchemas] = useState<Schema[] | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const basis = `/locatie/${locatie.id}`

  const laad = useCallback(() => {
    supabase.from('onderhoudsschemas').select(schemaVelden).eq('locatie_id', locatie.id)
      .order('actief', { ascending: false }).order('volgende_datum', { nullsFirst: false })
      .then(({ data }) => setSchemas((data ?? []) as unknown as Schema[]))
  }, [locatie.id])
  useEffect(laad, [laad])

  async function nuAanmaken() {
    const { data, error } = await supabase.rpc('genereer_taken_uit_schemas', { p_locatie: locatie.id })
    setMelding(error ? 'Aanmaken mislukt.' : data ? `${data} taak/taken of werkorder(s) aangemaakt.` : 'Er is nu niets aan de beurt.')
    laad()
  }

  const rijen = useZoekfilter(schemas, (s) => [s.omschrijving, doelTekst(s), s.uitvoerder?.naam])
  const kolommen: Kolom<Schema>[] = [
    { sleutel: 'omschrijving', kop: 'Schema', sorteer: (s) => s.omschrijving, cel: (s) => <>{s.omschrijving}<span className="sub">{doelTekst(s)}</span></> },
    { sleutel: 'interval', kop: 'Interval', sorteer: (s) => intervalTekst(s), cel: intervalTekst },
    { sleutel: 'volgende', kop: 'Volgende', klasse: 'mono smal', sorteer: (s) => s.volgende_datum ?? s.volgende_draaiuren,
      cel: (s) => (s.interval_eenheid === 'draaiuren' ? `${s.volgende_draaiuren} u` : datum(s.volgende_datum)) },
    { sleutel: 'uitvoerder', kop: 'Uitvoerder', sorteer: (s) => (s.via_werkplaats ? 'werkplaats' : s.uitvoerder?.naam ?? ''),
      cel: (s) => (s.via_werkplaats ? 'Werkplaats' : s.uitvoerder?.naam ?? <span className="zacht">Later</span>) },
    { sleutel: 'status', kop: 'Status', sorteer: (s) => (s.actief ? 0 : 1), cel: (s) => <Chip klasse={s.actief ? 'in-orde' : ''}>{s.actief ? 'Actief' : 'Gepauzeerd'}</Chip> },
  ]

  return (
    <section>
      <p className="zacht">
        Een schema maakt automatisch een taak (of een werkorder voor de werkplaats) aan zodra de vervaldatum binnen
        de ingestelde termijn valt. Daarna schuift de volgende datum op met het interval.
      </p>
      {magPlannen && <div className="knoppenrij acties"><button className="knop tweede" onClick={nuAanmaken}>Wat aan de beurt is nu aanmaken</button></div>}
      {melding && <div className="melding info">{melding}</div>}
      <DataTabel kolommen={kolommen} rijen={rijen} sleutel={(s) => s.id} naar={(s) => `${basis}/onderhoud/schemas/${s.id}`}
                 regelKlasse={(s) => (s.actief ? '' : 'gedempt')} leeg="Nog geen onderhoudsschema's." />
    </section>
  )
}

// /onderhoud/schemas/:schemaId en /onderhoud/schemas/nieuw
export function SchemaPagina() {
  const { schemaId } = useParams()
  const { locatie, magPlannen } = useLocatie()
  const navigeer = useNavigate()
  const [schema, setSchema] = useState<Schema | null | undefined>(schemaId === 'nieuw' ? null : undefined)
  const terug = () => navigeer(`/locatie/${locatie.id}/onderhoud?weergave=schemas`)

  useEffect(() => {
    if (schemaId === 'nieuw') return setSchema(null)
    supabase.from('onderhoudsschemas').select(schemaVelden).eq('id', schemaId!).single()
      .then(({ data }) => setSchema((data ?? null) as unknown as Schema | null))
  }, [schemaId])

  if (schema === undefined) return <main className="zacht">Laden…</main>
  if (!magPlannen) return (
    <main>
      <PaginaKop titel={schema?.omschrijving ?? 'Schema'} sub={schema ? `${doelTekst(schema)} · ${intervalTekst(schema)}` : undefined} />
      <p className="zacht">Alleen de hoofd-greenkeeper en hoger wijzigen schema's.</p>
    </main>
  )
  return (
    <main>
      <PaginaKop titel={schema ? schema.omschrijving : 'Nieuw onderhoudsschema'} sub={schema ? doelTekst(schema) : undefined} />
      <SchemaFormulier schema={schema} klaar={terug} annuleer={terug} />
    </main>
  )
}

function SchemaFormulier({ schema, klaar, annuleer }: { schema: Schema | null; klaar: () => void; annuleer: () => void }) {
  const { locatie } = useLocatie()
  const team = useTeam(locatie.id)
  const [types, setTypes] = useState<{ id: string; naam: string }[]>([])
  const [objecten, setObjecten] = useState<{ id: string; titel: string }[]>([])
  const [machines, setMachines] = useState<{ id: string; naam: string }[]>([])
  const doelStart = schema?.object_id ? 'object' : schema?.objecttype_id ? 'type' : schema?.machine_id ? 'machine' : 'baan'
  const [doel, setDoel] = useState<'type' | 'object' | 'machine' | 'baan'>(doelStart)
  const [doelId, setDoelId] = useState(schema?.object_id ?? schema?.objecttype_id ?? schema?.machine_id ?? '')
  const [omschrijving, setOmschrijving] = useState(schema?.omschrijving ?? '')
  const [waarde, setWaarde] = useState(String(schema?.interval_waarde ?? 1))
  const [eenheid, setEenheid] = useState<Eenheid>(schema?.interval_eenheid ?? 'maanden')
  const [volgendeDatum, setVolgendeDatum] = useState(schema?.volgende_datum ?? vandaag())
  const [volgendeUren, setVolgendeUren] = useState(String(schema?.volgende_draaiuren ?? ''))
  const [vooruit, setVooruit] = useState(String(schema?.vooruit_dagen ?? 7))
  const [uitvoerder, setUitvoerder] = useState(schema?.toegewezen_aan ?? '')
  const [intern, setIntern] = useState(schema?.intern ?? false)
  const [actief, setActief] = useState(schema?.actief ?? true)
  const [viaWerkplaats, setViaWerkplaats] = useState(schema?.via_werkplaats ?? false)
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('objecttypes').select('id, naam, locatie_ids').eq('gearchiveerd', false).order('volgorde')
      .then(({ data }) => setTypes((data ?? []).filter((t) => !t.locatie_ids || t.locatie_ids.includes(locatie.id))))
    supabase.from('objecten').select('id, code, objecttypes(naam)').eq('locatie_id', locatie.id).is('gearchiveerd_op', null)
      .order('code').then(({ data }) => setObjecten((data ?? []).map((o) => ({ id: o.id, titel: objectTitel(o as never) ?? o.id }))))
    supabase.from('machines').select('id, naam, merk, model').eq('locatie_id', locatie.id).is('gearchiveerd_op', null)
      .then(({ data }) => setMachines((data ?? []).map((m) => ({ id: m.id, naam: m.naam ?? [m.merk, m.model].filter(Boolean).join(' ') }))))
  }, [locatie.id])

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    if (doel !== 'baan' && !doelId) return setFout('Kies waar dit schema voor geldt.')
    if (eenheid === 'draaiuren' && doel !== 'machine') return setFout('Een interval in draaiuren kan alleen voor een machine.')
    const velden = {
      locatie_id: locatie.id, omschrijving,
      objecttype_id: doel === 'type' ? doelId : null,
      object_id: doel === 'object' ? doelId : null,
      machine_id: doel === 'machine' ? doelId : null,
      interval_waarde: Number(waarde), interval_eenheid: eenheid,
      volgende_datum: eenheid === 'draaiuren' ? null : volgendeDatum,
      volgende_draaiuren: eenheid === 'draaiuren' ? Number(volgendeUren) : null,
      vooruit_dagen: Number(vooruit), toegewezen_aan: uitvoerder || null, intern, actief,
      via_werkplaats: viaWerkplaats && (doel === 'machine' || doel === 'object'),
    }
    const { error } = schema
      ? await supabase.from('onderhoudsschemas').update(velden).eq('id', schema.id)
      : await supabase.from('onderhoudsschemas').insert(velden)
    if (error) return setFout('Opslaan mislukt.')
    klaar()
  }

  return (
    <form className="kaart" onSubmit={opslaan}>
      <h2>{schema ? 'Schema bewerken' : 'Nieuw onderhoudsschema'}</h2>
      <label htmlFor="omschrijving">Wat moet er gebeuren?</label>
      <input id="omschrijving" required value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)}
             placeholder='Bijv. "Beregening winterklaar maken" of "Pomp inspecteren"' />

      <span className="veldlabel">Geldt voor</span>
      <div className="schakelaar filterbalk">
        {([['type', 'Objecttype'], ['object', 'Eén object'], ['machine', 'Machine'], ['baan', 'Hele baan']] as const).map(([d, n]) => (
          <button type="button" key={d} className={`knop ${doel === d ? '' : 'tweede'}`}
                  onClick={() => { setDoel(d); setDoelId('') }}>{n}</button>
        ))}
      </div>
      {doel === 'type' && (
        <select aria-label="Objecttype" value={doelId} onChange={(e) => setDoelId(e.target.value)}>
          <option value="">— kies objecttype —</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.naam}</option>)}
        </select>
      )}
      {doel === 'object' && (
        <select aria-label="Object" value={doelId} onChange={(e) => setDoelId(e.target.value)}>
          <option value="">— kies object —</option>
          {objecten.map((o) => <option key={o.id} value={o.id}>{o.titel}</option>)}
        </select>
      )}
      {doel === 'machine' && (
        machines.length
          ? <select aria-label="Machine" value={doelId} onChange={(e) => setDoelId(e.target.value)}>
              <option value="">— kies machine —</option>
              {machines.map((m) => <option key={m.id} value={m.id}>{m.naam}</option>)}
            </select>
          : <p className="zacht">Nog geen machines (komt in het onderdeel Materieel).</p>
      )}

      <span className="veldlabel">Interval</span>
      <div className="twee-kolommen">
        <input aria-label="Aantal" type="number" min={1} required value={waarde} onChange={(e) => setWaarde(e.target.value)} />
        <select aria-label="Eenheid" value={eenheid} onChange={(e) => setEenheid(e.target.value as Eenheid)}>
          <option value="dagen">dagen</option>
          <option value="weken">weken</option>
          <option value="maanden">maanden</option>
          <option value="jaren">jaar</option>
          {doel === 'machine' && <option value="draaiuren">draaiuren</option>}
        </select>
      </div>

      {eenheid === 'draaiuren' ? (
        <>
          <label htmlFor="uren">Eerstvolgende keer bij draaiurenstand</label>
          <input id="uren" type="number" min={0} required value={volgendeUren} onChange={(e) => setVolgendeUren(e.target.value)} />
        </>
      ) : (
        <div className="twee-kolommen">
          <div>
            <label htmlFor="volgende">Eerstvolgende vervaldatum</label>
            <input id="volgende" type="date" required value={volgendeDatum} onChange={(e) => setVolgendeDatum(e.target.value)} />
          </div>
          <div>
            <label htmlFor="vooruit">Taak aanmaken (dagen vooraf)</label>
            <input id="vooruit" type="number" min={0} max={60} value={vooruit} onChange={(e) => setVooruit(e.target.value)} />
          </div>
        </div>
      )}

      <label htmlFor="uitvoerder">Standaard uitvoerder</label>
      <select id="uitvoerder" value={uitvoerder} onChange={(e) => setUitvoerder(e.target.value)}>
        <option value="">— later toewijzen —</option>
        {team.map((t) => <option key={t.id} value={t.id}>{t.naam}</option>)}
      </select>
      <label className="vink"><input type="checkbox" checked={intern} onChange={(e) => setIntern(e.target.checked)} />Intern (niet zichtbaar voor de golfclub)</label>
      {(doel === 'machine' || doel === 'object') && (
        <label className="vink">
          <input type="checkbox" checked={viaWerkplaats} onChange={(e) => setViaWerkplaats(e.target.checked)} />
          Via de werkplaats (maakt een werkorder voor de monteur in plaats van een taak)
        </label>
      )}
      {schema && (
        <label className="vink"><input type="checkbox" checked={actief} onChange={(e) => setActief(e.target.checked)} />Actief</label>
      )}
      {fout && <div className="melding fout">{fout}</div>}
      <div className="knoppenrij">
        <button className="knop">Opslaan</button>
        <button type="button" className="knop tweede" onClick={annuleer}>Annuleren</button>
      </div>
    </form>
  )
}

// ── Kalender ─────────────────────────────────────────────────────────────

type KalenderItem = { datum: string; tekst: string; soort: 'taak' | 'verlopen' | 'gedaan' | 'schema'; link?: string }

function Kalender() {
  const { locatie } = useLocatie()
  const [maand, setMaand] = useUrlParam('maand', vandaag().slice(0, 7))
  const [items, setItems] = useState<KalenderItem[]>([])

  useEffect(() => {
    const start = `${maand}-01`
    const eindDatum = new Date(start + 'T12:00:00')
    eindDatum.setMonth(eindDatum.getMonth() + 1)
    eindDatum.setDate(0)
    const eind = eindDatum.toISOString().slice(0, 10)
    Promise.all([
      supabase.from('taken').select('id, omschrijving, status, deadline, gepland_op')
        .eq('locatie_id', locatie.id).neq('status', 'geannuleerd')
        .or(`and(deadline.gte.${start},deadline.lte.${eind}),and(gepland_op.gte.${start},gepland_op.lte.${eind})`),
      supabase.from('onderhoudsschemas').select('omschrijving, interval_waarde, interval_eenheid, volgende_datum')
        .eq('locatie_id', locatie.id).eq('actief', true).neq('interval_eenheid', 'draaiuren').not('volgende_datum', 'is', null),
    ]).then(([t, s]) => {
      const lijst: KalenderItem[] = (t.data ?? []).map((x) => ({
        datum: (x.gepland_op ?? x.deadline)!,
        tekst: x.omschrijving,
        soort: x.status === 'afgerond' ? 'gedaan' : (x.deadline && x.deadline < vandaag()) ? 'verlopen' : 'taak',
        link: `/locatie/${locatie.id}/taken/${x.id}`,
      }))
      // Toekomstige keren van een schema (nog geen taak) als voorspelling tonen.
      for (const sch of (s.data ?? []) as Pick<Schema, 'omschrijving' | 'interval_waarde' | 'interval_eenheid' | 'volgende_datum'>[]) {
        let d = sch.volgende_datum!
        for (let i = 0; i < 400 && d <= eind; i++) {
          if (d >= start) lijst.push({ datum: d, tekst: sch.omschrijving, soort: 'schema' })
          d = volgende(d, sch)
        }
      }
      setItems(lijst)
    })
  }, [locatie.id, maand])

  const dagen = useMemo(() => {
    const eerste = new Date(`${maand}-01T12:00:00`)
    const leeg = (eerste.getDay() + 6) % 7 // maandag eerst
    const aantal = new Date(eerste.getFullYear(), eerste.getMonth() + 1, 0).getDate()
    return [...Array(leeg).fill(null), ...Array.from({ length: aantal }, (_, i) => `${maand}-${String(i + 1).padStart(2, '0')}`)]
  }, [maand])

  const verschuif = (n: number) => {
    const d = new Date(`${maand}-15T12:00:00`)
    d.setMonth(d.getMonth() + n)
    setMaand(d.toISOString().slice(0, 7))
  }
  const titel = new Date(`${maand}-15T12:00:00`).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })

  return (
    <section>
      <div className="dagkiezer">
        <button className="knop tweede" aria-label="Vorige maand" onClick={() => verschuif(-1)}>‹</button>
        <strong className="maandtitel">{titel}</strong>
        <button className="knop tweede" aria-label="Volgende maand" onClick={() => verschuif(1)}>›</button>
      </div>
      <div className="kalender">
        {['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map((d) => <div key={d} className="kal-kop">{d}</div>)}
        {dagen.map((d, i) => (
          <div key={d ?? `leeg-${i}`} className={`kal-dag ${d === vandaag() ? 'vandaag' : ''} ${d ? '' : 'leeg'}`}>
            {d && <span className="kal-nr">{Number(d.slice(8))}</span>}
            {d && items.filter((x) => x.datum === d).map((x, j) => (
              x.link
                ? <Link key={j} to={x.link} className={`kal-item ${x.soort}`}>{x.tekst}</Link>
                : <span key={j} className={`kal-item ${x.soort}`}>{x.tekst}</span>
            ))}
          </div>
        ))}
      </div>
      <p className="zacht klein-tekst legenda">
        <span className="kal-item taak">taak</span> <span className="kal-item verlopen">verlopen</span>{' '}
        <span className="kal-item gedaan">afgerond</span> <span className="kal-item schema">volgt uit schema</span>
      </p>
    </section>
  )
}

// ── Verlopen ─────────────────────────────────────────────────────────────

function Verlopen() {
  const { locatie } = useLocatie()
  const [taken, setTaken] = useState<{ id: string; omschrijving: string; deadline: string; uitvoerder: { naam: string | null } | null }[] | null>(null)

  useEffect(() => {
    supabase.from('taken').select('id, omschrijving, deadline, uitvoerder:profielen!taken_toegewezen_aan_fkey(naam)')
      .eq('locatie_id', locatie.id).in('status', ['open', 'in_behandeling']).lt('deadline', vandaag()).order('deadline')
      .then(({ data }) => setTaken((data ?? []) as never))
  }, [locatie.id])

  return (
    <section>
      {taken?.length === 0 && <p className="zacht">Geen verlopen taken. Mooi.</p>}
      <ul className="lijst">
        {taken?.map((t) => {
          const dagenTe = Math.round((Date.parse(vandaag()) - Date.parse(t.deadline)) / 864e5)
          return (
            <li key={t.id}>
              <Link className="rij verlopen" to={`/locatie/${locatie.id}/taken/${t.id}`}>
                <span className="rij-hoofd"><strong>{t.omschrijving}</strong><span className="label storing">{dagenTe} dag(en) te laat</span></span>
                <span className="zacht">Uiterlijk {datum(t.deadline)}{t.uitvoerder?.naam ? ` · ${t.uitvoerder.naam}` : ' · niet toegewezen'}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
