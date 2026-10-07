import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { useLocatie } from '../lib/locatie'
import { useSessie } from '../lib/sessie'
import { plekTekst, plekVelden, useBaan } from '../lib/baan'
import { datum, vandaag } from '../lib/teksten'
import { DataTabel, PaginaKop, useUrlParam, useZoekfilter, Weergaven, Werkbalk, Zoekveld, type Kolom } from '../components/tabel'
import WerkFormulier from '../components/WerkFormulier'

type Werkzaamheid = {
  id: string; datum: string; uitgevoerd: boolean; notitie: string | null; medewerker_id: string; gepland_door: string | null
  activiteit: { naam: string } | null
  medewerker: { naam: string | null } | null
  machine: { naam: string | null; merk: string | null; model: string | null } | null
  werkzaamheden_vlakken: { hole: { nummer: number } | null; baanvlak: { type: string; hole: { nummer: number } | null } | null }[]
  middelen_gebruik: { hoeveelheid_totaal: number | null; hoeveelheid_per_ha: number | null; eenheid: string; oppervlakte_ha: number | null; middel: { naam: string } | null }[]
}

const werkVelden = `id, datum, uitgevoerd, notitie, medewerker_id, gepland_door,
  activiteit:keuzelijst_waarden(naam),
  medewerker:profielen!werkzaamheden_medewerker_id_fkey(naam),
  machine:machines(naam, merk, model),
  ${plekVelden},
  middelen_gebruik(hoeveelheid_totaal, hoeveelheid_per_ha, eenheid, oppervlakte_ha, middel:keuzelijst_waarden(naam))`


const dagErbij = (d: string, n: number) => {
  const x = new Date(d + 'T12:00:00')
  x.setDate(x.getDate() + n)
  return x.toISOString().slice(0, 10)
}
const dagNaam = (d: string) =>
  d === vandaag() ? 'Vandaag' : new Date(d + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })

// Werk: dagplanning (afvinken), uitgevoerd werk en het middelenregister. Weergave, dag en periode
// staan in de URL; elke registratie heeft een eigen pagina (/werk/:id), nieuw werk is /werk/nieuw.
export default function Werk() {
  const { locatie, magRegistreren, magPlannen } = useLocatie()
  const [weergave] = useUrlParam('weergave', 'planning')
  const [dag, setDag] = useUrlParam('datum', vandaag())
  const basis = `/locatie/${locatie.id}`

  return (
    <main className="breed">
      <PaginaKop titel="Werk">
        {magPlannen && weergave === 'planning' && <Link className="knop tweede" to={`${basis}/werk/nieuw?klaarzetten=1&datum=${dag}`}>Werk klaarzetten</Link>}
        {magRegistreren && <Link className="knop" to={`${basis}/werk/nieuw`}>Werk registreren</Link>}
      </PaginaKop>
      <Werkbalk>
        <Weergaven standaard="planning" opties={[
          { waarde: 'planning', naam: 'Dagplanning' }, { waarde: 'uitgevoerd', naam: 'Uitgevoerd werk' }, { waarde: 'middelen', naam: 'Middelenregister' },
        ]} />
        {weergave === 'uitgevoerd' && <Zoekveld placeholder="Zoek activiteit, medewerker of machine" />}
      </Werkbalk>
      {weergave === 'planning' && <Dagplanning dag={dag} zetDag={setDag} />}
      {weergave === 'uitgevoerd' && <Overzicht />}
      {weergave === 'middelen' && <Middelenregister />}
    </main>
  )
}

// /werk/nieuw (?klaarzetten=1&datum=…)
export function WerkNieuw() {
  const { locatie } = useLocatie()
  const [zoek] = useSearchParams()
  const navigeer = useNavigate()
  const klaarzetten = zoek.has('klaarzetten')
  const terug = () => navigeer(`/locatie/${locatie.id}/werk${klaarzetten && zoek.get('datum') ? `?datum=${zoek.get('datum')}` : '?weergave=uitgevoerd'}`)
  return (
    <main>
      <PaginaKop titel={klaarzetten ? 'Werk klaarzetten' : 'Werk registreren'} />
      <WerkFormulier planning={klaarzetten} datumStart={zoek.get('datum') ?? undefined} klaar={terug} annuleer={terug} />
    </main>
  )
}

// /werk/:werkId: één registratie of klaargezet werk.
export function WerkDetail() {
  const { werkId } = useParams()
  const { locatie, magPlannen } = useLocatie()
  const { sessie } = useSessie()
  const { holes } = useBaan(locatie.id)
  const navigeer = useNavigate()
  const [w, setW] = useState<Werkzaamheid | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const basis = `/locatie/${locatie.id}`

  const laad = useCallback(() => {
    supabase.from('werkzaamheden').select(werkVelden).eq('id', werkId!).single().then(({ data, error }) => {
      if (error) return setFout('Deze registratie bestaat niet of je hebt geen toegang.')
      setW(data as unknown as Werkzaamheid)
    })
  }, [werkId])
  useEffect(laad, [laad])

  if (fout && !w) return <main><div className="melding fout">{fout}</div></main>
  if (!w) return <main className="zacht">Laden…</main>
  const magWijzigen = magPlannen || w.medewerker_id === sessie!.user.id

  async function vink() {
    await supabase.from('werkzaamheden').update({ uitgevoerd: !w!.uitgevoerd }).eq('id', w!.id)
    laad()
  }
  async function verwijder() {
    if (!window.confirm('Deze registratie verwijderen?')) return
    const { error } = await supabase.from('werkzaamheden').delete().eq('id', w!.id)
    if (error) return setFout('Verwijderen mislukt.')
    navigeer(`${basis}/werk?weergave=uitgevoerd`)
  }

  return (
    <main>
      <PaginaKop titel={w.activiteit?.naam ?? 'Werk'} sub={dagNaam(w.datum)} />
      {fout && <div className="melding fout">{fout}</div>}
      <section className="kaart">
        <dl className="velden">
          <div><dt>Status</dt><dd>{w.uitgevoerd ? 'Uitgevoerd' : 'Klaargezet, nog niet afgevinkt'}</dd></div>
          <div><dt>Waar</dt><dd>{plekTekst(w.werkzaamheden_vlakken, holes.length)}</dd></div>
          <div><dt>Medewerker</dt><dd>{w.medewerker?.naam}</dd></div>
          {w.machine && <div><dt>Machine</dt><dd>{w.machine.naam ?? [w.machine.merk, w.machine.model].filter(Boolean).join(' ')}</dd></div>}
          {w.notitie && <div><dt>Notitie</dt><dd>{w.notitie}</dd></div>}
          {w.middelen_gebruik.map((m, i) => (
            <div key={i}><dt>{i === 0 ? 'Middelen' : ''}</dt><dd>{m.middel?.naam}: {m.hoeveelheid_totaal ?? '?'} {m.eenheid}{m.hoeveelheid_per_ha != null ? ` (${m.hoeveelheid_per_ha} ${m.eenheid}/ha)` : ''}</dd></div>
          ))}
        </dl>
      </section>
      {magWijzigen && (
        <div className="actiebalk">
          <button className="knop tweede" onClick={vink}>{w.uitgevoerd ? 'Terug naar planning' : 'Afvinken'}</button>
          <button className="knop tweede" onClick={verwijder}>Verwijderen</button>
        </div>
      )}
    </main>
  )
}

function Dagplanning({ dag, zetDag }: { dag: string; zetDag: (d: string) => void }) {
  const { locatie, magPlannen } = useLocatie()
  const { sessie } = useSessie()
  const { holes } = useBaan(locatie.id)
  const [werk, setWerk] = useState<Werkzaamheid[] | null>(null)
  const mij = sessie!.user.id

  const laad = useCallback(() => {
    supabase.from('werkzaamheden').select(werkVelden).eq('locatie_id', locatie.id).eq('datum', dag)
      .order('volgorde').order('aangemaakt_op')
      .then(({ data }) => setWerk((data ?? []) as unknown as Werkzaamheid[]))
  }, [locatie.id, dag])
  useEffect(laad, [laad])

  const perMedewerker = useMemo(() => {
    const m = new Map<string, Werkzaamheid[]>()
    for (const w of werk ?? []) {
      const naam = w.medewerker_id === mij ? 'Ikzelf' : w.medewerker?.naam ?? 'Medewerker'
      m.set(naam, [...(m.get(naam) ?? []), w])
    }
    return [...m].sort(([a], [b]) => (a === 'Ikzelf' ? -1 : b === 'Ikzelf' ? 1 : a.localeCompare(b)))
  }, [werk, mij])

  async function vink(w: Werkzaamheid) {
    await supabase.from('werkzaamheden').update({ uitgevoerd: !w.uitgevoerd }).eq('id', w.id)
    laad()
  }

  async function verwijder(w: Werkzaamheid) {
    if (!window.confirm(`"${w.activiteit?.naam}" uit de planning halen?`)) return
    await supabase.from('werkzaamheden').delete().eq('id', w.id)
    laad()
  }

  const totaal = werk?.length ?? 0
  const gedaan = werk?.filter((w) => w.uitgevoerd).length ?? 0

  return (
    <section>
      <div className="dagkiezer">
        <button className="knop tweede" aria-label="Vorige dag" onClick={() => zetDag(dagErbij(dag, -1))}>‹</button>
        <input type="date" aria-label="Datum" value={dag} onChange={(e) => e.target.value && zetDag(e.target.value)} />
        <button className="knop tweede" aria-label="Volgende dag" onClick={() => zetDag(dagErbij(dag, 1))}>›</button>
      </div>
      <h2>{dagNaam(dag)}</h2>
      {totaal > 0 && <p className="zacht">{gedaan} van {totaal} afgevinkt</p>}
      {werk?.length === 0 && <p className="zacht">Niets gepland of geregistreerd voor deze dag.</p>}

      {perMedewerker.map(([naam, lijst]) => (
        <div key={naam} className="kaart">
          <h3>{naam}</h3>
          <ul className="lijst">
            {lijst.map((w) => {
              const magVinken = magPlannen || w.medewerker_id === mij
              return (
                <li key={w.id} className={`planregel ${w.uitgevoerd ? 'gedaan' : ''}`}>
                  <label className="vink groot">
                    <input type="checkbox" checked={w.uitgevoerd} disabled={!magVinken} onChange={() => vink(w)} />
                    <span>
                      <strong>{w.activiteit?.naam}</strong>
                      <span className="zacht"> · {plekTekst(w.werkzaamheden_vlakken, holes.length)}</span>
                      {w.notitie && <span className="zacht"><br />{w.notitie}</span>}
                    </span>
                  </label>
                  {magPlannen && !w.uitgevoerd && (
                    <button className="knop tweede klein" aria-label="Uit planning halen" onClick={() => verwijder(w)}>×</button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}

function Overzicht() {
  const { locatie } = useLocatie()
  const { holes } = useBaan(locatie.id)
  const [van, setVan] = useUrlParam('van', dagErbij(vandaag(), -13))
  const [werk, setWerk] = useState<Werkzaamheid[] | null>(null)
  const basis = `/locatie/${locatie.id}`

  useEffect(() => {
    setWerk(null)
    supabase.from('werkzaamheden').select(werkVelden).eq('locatie_id', locatie.id).eq('uitgevoerd', true)
      .gte('datum', van).order('datum', { ascending: false }).order('aangemaakt_op', { ascending: false }).limit(500)
      .then(({ data }) => setWerk((data ?? []) as unknown as Werkzaamheid[]))
  }, [locatie.id, van])

  const machine = (w: Werkzaamheid) => (w.machine ? w.machine.naam ?? [w.machine.merk, w.machine.model].filter(Boolean).join(' ') : null)
  const rijen = useZoekfilter(werk, (w) => [w.activiteit?.naam, w.medewerker?.naam, machine(w), w.notitie])
  const kolommen: Kolom<Werkzaamheid>[] = [
    { sleutel: 'activiteit', kop: 'Activiteit', sorteer: (w) => w.activiteit?.naam ?? '', cel: (w) => (
      <>{w.activiteit?.naam}{w.notitie && <span className="sub">{w.notitie}</span>}</>
    ) },
    { sleutel: 'datum', kop: 'Datum', klasse: 'mono smal', sorteer: (w) => w.datum, cel: (w) => datum(w.datum) },
    { sleutel: 'waar', kop: 'Waar', cel: (w) => plekTekst(w.werkzaamheden_vlakken, holes.length) },
    { sleutel: 'medewerker', kop: 'Medewerker', sorteer: (w) => w.medewerker?.naam ?? '', cel: (w) => w.medewerker?.naam },
    { sleutel: 'machine', kop: 'Machine', sorteer: (w) => machine(w) ?? '', cel: (w) => machine(w) ?? '–' },
    { sleutel: 'middelen', kop: 'Middelen', cel: (w) => w.middelen_gebruik.map((m) => `${m.middel?.naam} ${m.hoeveelheid_totaal ?? '?'} ${m.eenheid}`).join(', ') || '–' },
  ]

  return (
    <section>
      <div className="lus-rij werk-periode">
        <label htmlFor="van">Vanaf</label>
        <input id="van" type="date" value={van} onChange={(e) => e.target.value && setVan(e.target.value)} />
      </div>
      <DataTabel kolommen={kolommen} rijen={rijen} sleutel={(w) => w.id} naar={(w) => `${basis}/werk/${w.id}`}
                 leeg="Geen uitgevoerd werk in deze periode." />
    </section>
  )
}

// Registratie van bemesting en gewasbescherming, als basis voor de wettelijke registratieplicht.
function Middelenregister() {
  const { locatie } = useLocatie()
  const { holes } = useBaan(locatie.id)
  const navigeer = useNavigate()
  const jaar = new Date().getFullYear()
  const [van, setVan] = useUrlParam('van', `${jaar}-01-01`)
  const [tot, setTot] = useUrlParam('tot', vandaag())
  const [werk, setWerk] = useState<Werkzaamheid[] | null>(null)

  useEffect(() => {
    supabase.from('werkzaamheden').select(werkVelden.replace('middelen_gebruik(', 'middelen_gebruik!inner('))
      .eq('locatie_id', locatie.id).eq('uitgevoerd', true).gte('datum', van).lte('datum', tot)
      .order('datum', { ascending: false })
      .then(({ data }) => setWerk((data ?? []) as unknown as Werkzaamheid[]))
  }, [locatie.id, van, tot])

  const regels = (werk ?? []).flatMap((w) => w.middelen_gebruik.map((m, i) => ({ w, m, sleutel: `${w.id}-${i}` })))
  const totalen = new Map<string, number>()
  for (const { m } of regels) {
    const k = `${m.middel?.naam} (${m.eenheid})`
    totalen.set(k, (totalen.get(k) ?? 0) + (m.hoeveelheid_totaal ?? 0))
  }

  return (
    <section>
      <div className="twee-kolommen">
        <div><label htmlFor="mvan">Van</label><input id="mvan" type="date" value={van} onChange={(e) => setVan(e.target.value)} /></div>
        <div><label htmlFor="mtot">Tot en met</label><input id="mtot" type="date" value={tot} onChange={(e) => setTot(e.target.value)} /></div>
      </div>
      {regels.length === 0 && <p className="zacht">Geen middelen geregistreerd in deze periode.</p>}
      {regels.length > 0 && (
        <>
          <div className="datatabel-wrap">
            <table className="datatabel">
              <thead><tr><th>Datum</th><th>Middel</th><th>Totaal</th><th>Per ha</th><th>Ha</th><th>Waar</th><th>Door</th></tr></thead>
              <tbody>
                {regels.map(({ w, m, sleutel }) => (
                  <tr key={sleutel} className="klikbaar" onClick={() => navigeer(`/locatie/${locatie.id}/werk/${w.id}`)}>
                    <td>{datum(w.datum)}</td>
                    <td>{m.middel?.naam}</td>
                    <td>{m.hoeveelheid_totaal ?? '–'} {m.eenheid}</td>
                    <td>{m.hoeveelheid_per_ha ?? '–'}</td>
                    <td>{m.oppervlakte_ha ?? '–'}</td>
                    <td>{plekTekst(w.werkzaamheden_vlakken, holes.length)}</td>
                    <td>{w.medewerker?.naam}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Totaal in deze periode</h3>
          <ul>
            {[...totalen].map(([k, v]) => <li key={k}>{k}: {Math.round(v * 100) / 100}</li>)}
          </ul>
        </>
      )}
    </section>
  )
}
