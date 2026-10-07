import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { useLocatie } from '../lib/locatie'
import { datum, openStoringStatussen, storingStatus, taakStatus, vandaag } from '../lib/teksten'
import StoringMelden from '../components/StoringMelden'
import MachineWerkplaats from '../components/MachineWerkplaats'
import { MachineFormulier, machineElders, machineNaam, machineVelden, type Machine } from './Materieel'

type Gebeurtenis = { sleutel: string; datum: string; soort: 'storing' | 'taak' | 'inzet' | 'uren'; tekst: string; sub?: string; link?: string; open?: boolean }

export default function MachineDetail() {
  const { machineId } = useParams()
  const { locatie, magRegistreren, magPlannen } = useLocatie()
  const [m, setM] = useState<Machine | null>(null)
  const [historie, setHistorie] = useState<Gebeurtenis[]>([])
  const [schemas, setSchemas] = useState<{ id: string; omschrijving: string; interval_waarde: number; interval_eenheid: string; volgende_datum: string | null; volgende_draaiuren: number | null }[]>([])
  const [modus, setModus] = useState<'bewerken' | 'defect' | null>(null)
  const [stand, setStand] = useState('')
  const [melding, setMelding] = useState<{ soort: 'fout' | 'info'; tekst: string } | null>(null)
  const basis = `/locatie/${locatie.id}`

  const laad = useCallback(async () => {
    const [mm, st, tk, wz, du, sc] = await Promise.all([
      supabase.from('machines').select(machineVelden).eq('id', machineId!).single(),
      supabase.from('storingen').select('id, omschrijving, status, gemeld_op, opgelost_op, oplossing, type:keuzelijst_waarden(naam)')
        .eq('machine_id', machineId!).order('gemeld_op', { ascending: false }),
      supabase.from('taken').select('id, omschrijving, status, deadline, afgerond_op').eq('machine_id', machineId!)
        .neq('status', 'geannuleerd').order('aangemaakt_op', { ascending: false }),
      supabase.from('werkzaamheden').select('id, datum, activiteit:keuzelijst_waarden(naam)').eq('machine_id', machineId!)
        .eq('uitgevoerd', true).order('datum', { ascending: false }).limit(30),
      supabase.from('draaiuren_registraties').select('id, datum, stand').eq('machine_id', machineId!)
        .order('datum', { ascending: false }).limit(30),
      supabase.from('onderhoudsschemas').select('id, omschrijving, interval_waarde, interval_eenheid, volgende_datum, volgende_draaiuren')
        .eq('machine_id', machineId!).eq('actief', true),
    ])
    if (mm.error) return setMelding({ soort: 'fout', tekst: 'Deze machine bestaat niet of je hebt geen toegang.' })
    setM(mm.data as unknown as Machine)
    setSchemas(sc.data ?? [])
    const h: Gebeurtenis[] = [
      ...((st.data ?? []) as unknown as { id: string; omschrijving: string | null; status: string; gemeld_op: string; opgelost_op: string | null; oplossing: string | null; type: { naam: string } | null }[])
        .map((s) => ({
          sleutel: `s${s.id}`, datum: (s.opgelost_op ?? s.gemeld_op).slice(0, 10), soort: 'storing' as const,
          tekst: `Defect: ${s.type?.naam ?? s.omschrijving ?? ''}`, sub: [storingStatus[s.status], s.oplossing].filter(Boolean).join(' · '),
          link: `${basis}/storingen/${s.id}`, open: openStoringStatussen.includes(s.status),
        })),
      ...(tk.data ?? []).map((t) => ({
        sleutel: `t${t.id}`, datum: (t.afgerond_op ?? t.deadline ?? vandaag()).slice(0, 10), soort: 'taak' as const,
        tekst: t.omschrijving, sub: taakStatus[t.status], link: `${basis}/taken`, open: t.status !== 'afgerond',
      })),
      ...((wz.data ?? []) as unknown as { id: string; datum: string; activiteit: { naam: string } | null }[]).map((w) => ({
        sleutel: `w${w.id}`, datum: w.datum, soort: 'inzet' as const, tekst: `Ingezet: ${w.activiteit?.naam ?? ''}`,
      })),
      ...(du.data ?? []).map((d) => ({
        sleutel: `d${d.id}`, datum: d.datum, soort: 'uren' as const, tekst: `Draaiuren: ${Number(d.stand).toLocaleString('nl-NL')}`,
      })),
    ].sort((a, b) => b.datum.localeCompare(a.datum))
    setHistorie(h)
  }, [machineId, basis])

  useEffect(() => { laad() }, [laad])

  async function urenOpslaan(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('draaiuren_registraties').insert({ machine_id: machineId, stand: Number(stand.replace(',', '.')) })
    if (error) {
      return setMelding({ soort: 'fout', tekst: error.message.includes('lager') ? error.message : 'Opslaan mislukt.' })
    }
    const voor = historie.filter((h) => h.soort === 'taak' && h.open).length
    setStand('')
    await laad()
    const { count } = await supabase.from('taken').select('id', { count: 'exact', head: true })
      .eq('machine_id', machineId!).in('status', ['open', 'in_behandeling'])
    setMelding({ soort: 'info', tekst: (count ?? 0) > voor ? 'Stand opgeslagen. Er is onderhoud aan de beurt: zie Taken.' : 'Stand opgeslagen.' })
  }

  async function archiveer() {
    if (!m || !window.confirm(`${machineNaam(m)} archiveren? De historie blijft bewaard.`)) return
    await supabase.from('machines').update({ gearchiveerd_op: m.gearchiveerd_op ? null : new Date().toISOString() }).eq('id', m.id)
    laad()
  }

  if (!m) return <main>{melding ? <div className={`melding ${melding.soort}`}>{melding.tekst}</div> : <p className="zacht">Laden…</p>}</main>

  const openDefect = historie.some((h) => h.soort === 'storing' && h.open)
  // Vervangend materieel van een andere baan: melden en draaiuren gaan via de eigen baan of de werkplaats.
  const eigen = m.locatie_id === locatie.id
  const elders = machineElders(m, locatie.id)

  return (
    <main>
      <p><Link to={`${basis}/materieel`}>← Alle machines</Link></p>
      <div className="kop-met-knop">
        <h1>{machineNaam(m)}</h1>
        {openDefect && <span className="label storing">Defect</span>}
        {m.gearchiveerd_op && <span className="label">Gearchiveerd</span>}
        {elders && <span className="label gepland">{elders}</span>}
        {magPlannen && eigen && !modus && <button type="button" className="tekstlink" onClick={() => setModus('bewerken')}>Bewerken</button>}
      </div>
      {melding && <div className={`melding ${melding.soort}`}>{melding.tekst}</div>}

      {modus === 'bewerken' && <MachineFormulier machine={m} klaar={() => { setModus(null); laad() }} annuleer={() => setModus(null)} />}
      {modus === 'defect' && (
        <div className="kaart">
          <StoringMelden doel={{ soort: 'machine', id: m.id, titel: machineNaam(m) }}
                         klaar={() => { setModus(null); setMelding({ soort: 'info', tekst: 'Defect gemeld. De werkplaats krijgt er een werkorder van.' }); laad() }}
                         annuleer={() => setModus(null)} />
        </div>
      )}

      {!modus && (
        <section className="kaart">
          <dl className="velden">
            <div><dt>Draaiuren</dt><dd><strong>{Number(m.draaiuren).toLocaleString('nl-NL')}</strong></dd></div>
            {m.type && <div><dt>Type</dt><dd>{m.type.naam}</dd></div>}
            {(m.merk || m.model) && <div><dt>Merk / model</dt><dd>{[m.merk, m.model].filter(Boolean).join(' ')}</dd></div>}
            {m.serienummer && <div><dt>Serienummer</dt><dd>{m.serienummer}</dd></div>}
            {m.aanschafjaar && <div><dt>Aanschafjaar</dt><dd>{m.aanschafjaar}</dd></div>}
            {m.standplaats && <div><dt>Standplaats</dt><dd>{m.standplaats}</dd></div>}
          </dl>
          {magPlannen && (
            <div className="knoppenrij">
              <button className="knop tweede" onClick={archiveer}>{m.gearchiveerd_op ? 'Terugzetten' : 'Archiveren'}</button>
            </div>
          )}
        </section>
      )}

      {!eigen && <div className="melding info">Deze machine staat hier tijdelijk als vervanger. Een defect meld je bij de werkplaats.</div>}

      {magRegistreren && eigen && !m.gearchiveerd_op && (
        <form className="kaart" onSubmit={urenOpslaan}>
          <h2>Draaiurenstand invoeren</h2>
          <div className="lus-rij">
            <input aria-label="Nieuwe stand" inputMode="decimal" required value={stand} onChange={(e) => setStand(e.target.value)}
                   placeholder={`Huidig: ${Number(m.draaiuren).toLocaleString('nl-NL')}`} />
            <button className="knop">Opslaan</button>
          </div>
        </form>
      )}

      <section className="kaart">
        <h2>Onderhoud</h2>
        {schemas.length === 0 && <p className="zacht">Geen onderhoudsschema voor deze machine.</p>}
        <ul className="tijdlijn">
          {schemas.map((s) => {
            const uren = s.interval_eenheid === 'draaiuren'
            const resterend = uren && s.volgende_draaiuren != null ? s.volgende_draaiuren - m.draaiuren : null
            return (
              <li key={s.id} className={resterend != null && resterend <= 25 ? 'gepland' : ''}>
                <strong>{s.omschrijving}</strong>
                <div className="zacht">
                  Elke {s.interval_waarde} {s.interval_eenheid} ·{' '}
                  {uren ? `volgende bij ${s.volgende_draaiuren} u (nog ${resterend?.toLocaleString('nl-NL')} u)` : `volgende ${datum(s.volgende_datum)}`}
                </div>
              </li>
            )
          })}
        </ul>
        {magPlannen && <Link to={`${basis}/onderhoud`}>Schema toevoegen of wijzigen (Onderhoud → Schema's)</Link>}
      </section>

      <MachineWerkplaats machineId={m.id} eigen={eigen} />

      <section>
        <h2>Historie</h2>
        {historie.length === 0 && <p className="zacht">Nog geen historie.</p>}
        <ul className="tijdlijn">
          {historie.map((h) => (
            <li key={h.sleutel} className={h.soort === 'storing' && h.open ? 'storing' : h.soort === 'taak' && h.open ? 'gepland' : ''}>
              {h.link ? <Link to={h.link}><strong>{h.tekst}</strong></Link> : <strong>{h.tekst}</strong>}
              <div className="zacht">{datum(h.datum)}{h.sub ? ` · ${h.sub}` : ''}</div>
            </li>
          ))}
        </ul>
      </section>

      {/* Hoofdactie; op de telefoon vast onderaan */}
      {!modus && magRegistreren && eigen && !m.gearchiveerd_op && (
        <div className="actiebalk">
          <button className="knop melden" onClick={() => setModus('defect')}>Defect melden</button>
        </div>
      )}
    </main>
  )
}
