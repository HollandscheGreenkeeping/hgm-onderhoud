import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLocatie } from '../lib/locatie'
import { useSessie } from '../lib/sessie'
import { plekTekst, plekVelden, useBaan } from '../lib/baan'
import { datum, vandaag } from '../lib/teksten'
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

type Weergave = 'planning' | 'overzicht' | 'middelen'

const dagErbij = (d: string, n: number) => {
  const x = new Date(d + 'T12:00:00')
  x.setDate(x.getDate() + n)
  return x.toISOString().slice(0, 10)
}
const dagNaam = (d: string) =>
  d === vandaag() ? 'Vandaag' : new Date(d + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })

export default function Werk() {
  const { magRegistreren, magPlannen } = useLocatie()
  const [weergave, setWeergave] = useState<Weergave>('planning')
  const [formulier, setFormulier] = useState<'registreren' | 'klaarzetten' | null>(null)
  const [dag, setDag] = useState(vandaag())
  const [teller, setTeller] = useState(0)
  const ververs = () => { setFormulier(null); setTeller((t) => t + 1) }

  return (
    <main>
      <div className="kop-met-knop">
        <h1>Werk</h1>
        {magRegistreren && !formulier && <button className="knop" onClick={() => setFormulier('registreren')}>Werk registreren</button>}
      </div>
      {formulier && (
        <WerkFormulier planning={formulier === 'klaarzetten'} datumStart={formulier === 'klaarzetten' ? dag : undefined}
                       klaar={ververs} annuleer={() => setFormulier(null)} />
      )}
      <div className="schakelaar filterbalk">
        {([['planning', 'Dagplanning'], ['overzicht', 'Uitgevoerd werk'], ['middelen', 'Middelenregister']] as [Weergave, string][])
          .map(([w, n]) => (
            <button key={w} className={`knop ${weergave === w ? '' : 'tweede'}`} onClick={() => setWeergave(w)}>{n}</button>
          ))}
      </div>
      {weergave === 'planning' && (
        <Dagplanning key={`${dag}-${teller}`} dag={dag} zetDag={setDag}
                     klaarzetten={magPlannen && !formulier ? () => setFormulier('klaarzetten') : undefined} />
      )}
      {weergave === 'overzicht' && <Overzicht key={teller} />}
      {weergave === 'middelen' && <Middelenregister key={teller} />}
    </main>
  )
}

function Dagplanning({ dag, zetDag, klaarzetten }: { dag: string; zetDag: (d: string) => void; klaarzetten?: () => void }) {
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
      <div className="kop-met-knop">
        <h2>{dagNaam(dag)}</h2>
        {klaarzetten && <button className="knop tweede" onClick={klaarzetten}>+ Werk klaarzetten</button>}
      </div>
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
  const [van, setVan] = useState(dagErbij(vandaag(), -13))
  const [werk, setWerk] = useState<Werkzaamheid[] | null>(null)

  useEffect(() => {
    supabase.from('werkzaamheden').select(werkVelden).eq('locatie_id', locatie.id).eq('uitgevoerd', true)
      .gte('datum', van).order('datum', { ascending: false }).order('aangemaakt_op', { ascending: false }).limit(500)
      .then(({ data }) => setWerk((data ?? []) as unknown as Werkzaamheid[]))
  }, [locatie.id, van])

  return (
    <section>
      <label htmlFor="van">Vanaf</label>
      <input id="van" type="date" value={van} onChange={(e) => e.target.value && setVan(e.target.value)} />
      {werk?.length === 0 && <p className="zacht">Geen uitgevoerd werk in deze periode.</p>}
      <ul className="lijst">
        {werk?.map((w) => (
          <li key={w.id} className="rij">
            <span className="rij-hoofd"><strong>{w.activiteit?.naam}</strong><span className="zacht">{datum(w.datum)}</span></span>
            <span className="zacht">
              {[
                plekTekst(w.werkzaamheden_vlakken, holes.length),
                w.medewerker?.naam,
                w.machine ? w.machine.naam ?? [w.machine.merk, w.machine.model].filter(Boolean).join(' ') : null,
              ].filter(Boolean).join(' · ')}
            </span>
            {w.middelen_gebruik.map((m, i) => (
              <span key={i} className="zacht">
                {m.middel?.naam}: {m.hoeveelheid_totaal ?? '?'} {m.eenheid}
                {m.hoeveelheid_per_ha != null ? ` (${m.hoeveelheid_per_ha} ${m.eenheid}/ha)` : ''}
              </span>
            ))}
            {w.notitie && <span className="zacht">{w.notitie}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

// Registratie van bemesting en gewasbescherming, als basis voor de wettelijke registratieplicht.
function Middelenregister() {
  const { locatie } = useLocatie()
  const { holes } = useBaan(locatie.id)
  const jaar = new Date().getFullYear()
  const [van, setVan] = useState(`${jaar}-01-01`)
  const [tot, setTot] = useState(vandaag())
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
          <div className="tabel-wrap">
            <table className="tabel">
              <thead><tr><th>Datum</th><th>Middel</th><th>Totaal</th><th>Per ha</th><th>Ha</th><th>Waar</th><th>Door</th></tr></thead>
              <tbody>
                {regels.map(({ w, m, sleutel }) => (
                  <tr key={sleutel}>
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
