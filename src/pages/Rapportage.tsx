import { useEffect, useMemo, useState } from 'react'
import { huisstijlUrl, supabase } from '../lib/supabase'
import { useLocatie } from '../lib/locatie'
import { plekTekst, plekVelden, useBaan } from '../lib/baan'
import { datum, objectTitel, storingStatus, vandaag } from '../lib/teksten'
import { downloadCsv } from '../lib/csv'
import { PaginaKop, useUrlParam, Weergaven, Werkbalk } from '../components/tabel'

type Weergave = 'rapport' | 'export'

export default function Rapportage() {
  const { magPlannen } = useLocatie()
  const [weergaveTekst] = useUrlParam('weergave', 'rapport')
  const weergave = weergaveTekst as Weergave
  return (
    <main className="rapportage">
      <div className="geen-print">
        <PaginaKop titel="Rapportage" />
        {magPlannen && (
          <Werkbalk>
            <Weergaven standaard="rapport" opties={[{ waarde: 'rapport', naam: 'Klantrapport' }, { waarde: 'export', naam: 'Export (Excel/CSV)' }]} />
          </Werkbalk>
        )}
      </div>
      {weergave === 'rapport' ? <Klantrapport /> : <Export />}
    </main>
  )
}

// ── Klantrapport ─────────────────────────────────────────────────────────
// Bewust zonder interne zaken: geen uren, geen namen van medewerkers, geen interne
// storingen of taken (ook als een HGM-gebruiker het rapport maakt).

type Werk = {
  id: string; datum: string
  activiteit: { naam: string } | null
  werkzaamheden_vlakken: { hole: { nummer: number } | null; baanvlak: { type: string; hole: { nummer: number } | null } | null }[]
  middelen_gebruik: { hoeveelheid_totaal: number | null; eenheid: string; middel: { naam: string } | null }[]
}
type Storing = {
  id: string; status: string; gemeld_op: string; opgelost_op: string | null; omschrijving: string | null; oplossing: string | null
  type: { naam: string } | null; object: { code: string | null; objecttypes: { naam: string } | null } | null
  machine: { naam: string | null } | null
}
type Taak = { id: string; omschrijving: string; afgerond_op: string; object: { code: string | null; objecttypes: { naam: string } | null } | null }

const hgmLogo = '/icon.svg'

function Klantrapport() {
  const { locatie } = useLocatie()
  const { holes } = useBaan(locatie.id)
  // Standaard: vorige maand (rapport aan het begin van de maand). In de URL, zodat de link deelbaar is.
  const [maand, setMaand] = useUrlParam('maand', (() => { const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 7) })())
  const [werk, setWerk] = useState<Werk[]>([])
  const [storingen, setStoringen] = useState<Storing[]>([])
  const [taken, setTaken] = useState<Taak[]>([])
  const [laden, setLaden] = useState(true)

  const { start, eind } = useMemo(() => {
    const s = new Date(`${maand}-01T12:00:00`)
    const e = new Date(s.getFullYear(), s.getMonth() + 1, 0, 12)
    return { start: `${maand}-01`, eind: e.toISOString().slice(0, 10) }
  }, [maand])

  useEffect(() => {
    setLaden(true)
    const eindTijd = `${eind}T23:59:59`
    Promise.all([
      supabase.from('werkzaamheden').select(`id, datum, activiteit:keuzelijst_waarden(naam), ${plekVelden},
          middelen_gebruik(hoeveelheid_totaal, eenheid, middel:keuzelijst_waarden(naam))`)
        .eq('locatie_id', locatie.id).eq('uitgevoerd', true).gte('datum', start).lte('datum', eind).order('datum'),
      supabase.from('storingen').select('id, status, gemeld_op, opgelost_op, omschrijving, oplossing, type:keuzelijst_waarden(naam), object:objecten(code, objecttypes(naam)), machine:machines(naam)')
        .eq('locatie_id', locatie.id).eq('intern', false)
        .or(`and(gemeld_op.gte.${start},gemeld_op.lte.${eindTijd}),and(opgelost_op.gte.${start},opgelost_op.lte.${eindTijd})`)
        .order('gemeld_op'),
      supabase.from('taken').select('id, omschrijving, afgerond_op, object:objecten(code, objecttypes(naam))')
        .eq('locatie_id', locatie.id).eq('intern', false).eq('status', 'afgerond')
        .gte('afgerond_op', start).lte('afgerond_op', eindTijd).order('afgerond_op'),
    ]).then(([w, s, t]) => {
      setWerk((w.data ?? []) as unknown as Werk[])
      setStoringen((s.data ?? []) as unknown as Storing[])
      setTaken((t.data ?? []) as unknown as Taak[])
      setLaden(false)
    })
  }, [locatie.id, start, eind])

  const perActiviteit = useMemo(() => {
    const m = new Map<string, Werk[]>()
    for (const w of werk) m.set(w.activiteit?.naam ?? 'Overig', [...(m.get(w.activiteit?.naam ?? 'Overig') ?? []), w])
    return [...m].sort((a, b) => b[1].length - a[1].length)
  }, [werk])

  const middelen = useMemo(() => {
    const m = new Map<string, number>()
    for (const w of werk) for (const g of w.middelen_gebruik) {
      const k = `${g.middel?.naam} (${g.eenheid})`
      m.set(k, (m.get(k) ?? 0) + (g.hoeveelheid_totaal ?? 0))
    }
    return [...m]
  }, [werk])

  const titelMaand = new Date(`${maand}-15T12:00:00`).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
  const gemeld = storingen.filter((s) => s.gemeld_op.slice(0, 10) >= start && s.gemeld_op.slice(0, 10) <= eind).length
  const opgelost = storingen.filter((s) => s.opgelost_op && s.opgelost_op.slice(0, 10) >= start && s.opgelost_op.slice(0, 10) <= eind).length

  return (
    <>
      <div className="knoppenrij geen-print rapport-bediening">
        <input type="month" aria-label="Maand" value={maand} max={vandaag().slice(0, 7)} onChange={(e) => e.target.value && setMaand(e.target.value)} />
      </div>
      <p className="zacht klein-tekst geen-print">Kies in het afdrukvenster "Opslaan als PDF" als printer.</p>

      <article className="rapport">
        <header className="rapport-kop">
          <img src={hgmLogo} alt="HGM Golf" />
          <div>
            <h2>Onderhoudsrapport {titelMaand}</h2>
            <p>{locatie.klantnaam ?? locatie.naam}</p>
          </div>
          {locatie.klantlogo_pad && <img src={huisstijlUrl(locatie.klantlogo_pad)} alt="Logo golfclub" />}
        </header>

        {laden ? <p className="zacht">Laden…</p> : (
          <>
            <section className="rapport-samenvatting">
              <div><strong>{werk.length}</strong><span>werkzaamheden</span></div>
              <div><strong>{taken.length}</strong><span>onderhoudstaken afgerond</span></div>
              <div><strong>{gemeld}</strong><span>storingen gemeld</span></div>
              <div><strong>{opgelost}</strong><span>storingen opgelost</span></div>
            </section>

            <section>
              <h3>Uitgevoerde werkzaamheden</h3>
              {perActiviteit.length === 0 && <p className="zacht">Geen werkzaamheden geregistreerd.</p>}
              {perActiviteit.map(([naam, lijst]) => (
                <div key={naam} className="rapport-blok">
                  <h4>{naam} <span className="zacht">({lijst.length}×)</span></h4>
                  <table className="tabel">
                    <tbody>
                      {lijst.map((w) => (
                        <tr key={w.id}>
                          <td>{datum(w.datum)}</td>
                          <td>{plekTekst(w.werkzaamheden_vlakken, holes.length)}</td>
                          <td>{w.middelen_gebruik.map((g) => `${g.middel?.naam} ${g.hoeveelheid_totaal ?? ''} ${g.eenheid}`).join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </section>

            {middelen.length > 0 && (
              <section>
                <h3>Gebruikte middelen</h3>
                <table className="tabel"><tbody>
                  {middelen.map(([k, v]) => <tr key={k}><td>{k}</td><td>{Math.round(v * 100) / 100}</td></tr>)}
                </tbody></table>
              </section>
            )}

            <section>
              <h3>Gepland onderhoud afgerond</h3>
              {taken.length === 0 && <p className="zacht">Geen afgeronde onderhoudstaken.</p>}
              {taken.length > 0 && (
                <table className="tabel"><tbody>
                  {taken.map((t) => (
                    <tr key={t.id}><td>{datum(t.afgerond_op)}</td><td>{t.omschrijving}</td><td>{objectTitel(t.object) ?? ''}</td></tr>
                  ))}
                </tbody></table>
              )}
            </section>

            <section>
              <h3>Storingen en reparaties</h3>
              {storingen.length === 0 && <p className="zacht">Geen storingen deze maand.</p>}
              {storingen.length > 0 && (
                <table className="tabel">
                  <thead><tr><th>Gemeld</th><th>Wat</th><th>Waar</th><th>Status</th><th>Oplossing</th></tr></thead>
                  <tbody>
                    {storingen.map((s) => (
                      <tr key={s.id}>
                        <td>{datum(s.gemeld_op)}</td>
                        <td>{s.type?.naam ?? s.omschrijving}</td>
                        <td>{objectTitel(s.object) ?? (s.machine ? `Machine ${s.machine.naam}` : 'Op de baan')}</td>
                        <td>{storingStatus[s.status]}{s.opgelost_op ? ` (${datum(s.opgelost_op)})` : ''}</td>
                        <td>{s.oplossing}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <footer className="rapport-voet">
              Opgesteld door Hollandsche Greenkeeping Maatschappij B.V. · {datum(new Date().toISOString())}
            </footer>
          </>
        )}
      </article>

      <div className="actiebalk geen-print">
        <button className="knop" onClick={() => window.print()} disabled={laden}>Rapport als PDF</button>
      </div>
    </>
  )
}

// ── Export ───────────────────────────────────────────────────────────────

function Export() {
  const { locatie, magPlannen } = useLocatie()
  const { holes } = useBaan(locatie.id)
  const jaar = new Date().getFullYear()
  const [van, setVan] = useState(`${jaar}-01-01`)
  const [tot, setTot] = useState(vandaag())
  const [bezig, setBezig] = useState<string | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const bestand = (soort: string) => `${locatie.naam.replace(/[^\w-]+/g, '_')}_${soort}_${van}_${tot}.csv`
  const totTijd = `${tot}T23:59:59`

  async function exporteer(soort: string, maak: () => Promise<void>) {
    setBezig(soort)
    setFout(null)
    try { await maak() } catch { setFout(`Export "${soort}" mislukt.`) }
    setBezig(null)
  }

  const exports: [string, string, () => Promise<void>][] = [
    ['storingen', 'Storingen', async () => {
      const { data, error } = await supabase.from('storingen')
        .select(`gemeld_op, status, urgentie, omschrijving, oplossing, gebruikte_onderdelen, opgelost_op, gecontroleerd_op, intern,
          type:keuzelijst_waarden(naam), object:objecten(code, objecttypes(naam)), leiding:leidingen(type), machine:machines(naam),
          melder:profielen!storingen_gemeld_door_fkey(naam), uitvoerder:profielen!storingen_toegewezen_aan_fkey(naam)`)
        .eq('locatie_id', locatie.id).gte('gemeld_op', van).lte('gemeld_op', totTijd).order('gemeld_op')
      if (error) throw error
      downloadCsv(bestand('storingen'),
        ['Gemeld', 'Type', 'Object', 'Leiding', 'Machine', 'Urgentie', 'Status', 'Omschrijving', 'Oplossing', 'Onderdelen', 'Opgelost', 'Gecontroleerd', 'Melder', 'Uitvoerder', 'Intern'],
        (data as any[]).map((s) => [s.gemeld_op?.slice(0, 16).replace('T', ' '), s.type?.naam, objectTitel(s.object), s.leiding?.type, s.machine?.naam,
          s.urgentie, storingStatus[s.status], s.omschrijving, s.oplossing, s.gebruikte_onderdelen,
          s.opgelost_op?.slice(0, 10), s.gecontroleerd_op?.slice(0, 10), s.melder?.naam, s.uitvoerder?.naam, s.intern]))
    }],
    ['taken', 'Taken', async () => {
      const { data, error } = await supabase.from('taken')
        .select('omschrijving, bron, status, deadline, afgerond_op, intern, object:objecten(code, objecttypes(naam)), machine:machines(naam), uitvoerder:profielen!taken_toegewezen_aan_fkey(naam), aangemaakt_op')
        .eq('locatie_id', locatie.id).gte('aangemaakt_op', van).lte('aangemaakt_op', totTijd).order('aangemaakt_op')
      if (error) throw error
      downloadCsv(bestand('taken'), ['Aangemaakt', 'Omschrijving', 'Bron', 'Object', 'Machine', 'Deadline', 'Status', 'Afgerond', 'Uitvoerder', 'Intern'],
        (data as any[]).map((t) => [t.aangemaakt_op.slice(0, 10), t.omschrijving, t.bron, objectTitel(t.object), t.machine?.naam,
          t.deadline, t.status, t.afgerond_op?.slice(0, 10), t.uitvoerder?.naam, t.intern]))
    }],
    ['werkzaamheden', 'Werkzaamheden', async () => {
      const { data, error } = await supabase.from('werkzaamheden')
        .select(`datum, notitie, activiteit:keuzelijst_waarden(naam), medewerker:profielen!werkzaamheden_medewerker_id_fkey(naam),
          machine:machines(naam), ${plekVelden}`)
        .eq('locatie_id', locatie.id).eq('uitgevoerd', true).gte('datum', van).lte('datum', tot).order('datum')
      if (error) throw error
      downloadCsv(bestand('werkzaamheden'), ['Datum', 'Activiteit', 'Waar', 'Medewerker', 'Machine', 'Notitie'],
        (data as any[]).map((w) => [w.datum, w.activiteit?.naam, plekTekst(w.werkzaamheden_vlakken, holes.length), w.medewerker?.naam, w.machine?.naam, w.notitie]))
    }],
    ['middelen', 'Middelenregister', async () => {
      const { data, error } = await supabase.from('werkzaamheden')
        .select(`datum, activiteit:keuzelijst_waarden(naam), medewerker:profielen!werkzaamheden_medewerker_id_fkey(naam), ${plekVelden},
          middelen_gebruik!inner(hoeveelheid_totaal, hoeveelheid_per_ha, eenheid, oppervlakte_ha, middel:keuzelijst_waarden(naam))`)
        .eq('locatie_id', locatie.id).eq('uitgevoerd', true).gte('datum', van).lte('datum', tot).order('datum')
      if (error) throw error
      downloadCsv(bestand('middelenregister'), ['Datum', 'Activiteit', 'Middel', 'Totaal', 'Eenheid', 'Per ha', 'Oppervlakte (ha)', 'Waar', 'Uitgevoerd door'],
        (data as any[]).flatMap((w) => w.middelen_gebruik.map((m: any) => [w.datum, w.activiteit?.naam, m.middel?.naam, m.hoeveelheid_totaal,
          m.eenheid, m.hoeveelheid_per_ha, m.oppervlakte_ha, plekTekst(w.werkzaamheden_vlakken, holes.length), w.medewerker?.naam])))
    }],
    ['machines', 'Machines en draaiuren', async () => {
      const { data, error } = await supabase.from('machines')
        .select('naam, merk, model, serienummer, aanschafjaar, standplaats, draaiuren, gearchiveerd_op, type:keuzelijst_waarden(naam)')
        .eq('locatie_id', locatie.id).order('naam')
      if (error) throw error
      downloadCsv(bestand('machines'), ['Naam', 'Type', 'Merk', 'Model', 'Serienummer', 'Aanschafjaar', 'Standplaats', 'Draaiuren', 'Gearchiveerd'],
        (data as any[]).map((m) => [m.naam, m.type?.naam, m.merk, m.model, m.serienummer, m.aanschafjaar, m.standplaats, m.draaiuren, m.gearchiveerd_op?.slice(0, 10)]))
    }],
    ['uren', 'Uren (intern)', async () => {
      const { data, error } = await supabase.from('uren').select('datum, minuten, bron_tabel, notitie, medewerker:profielen(naam)')
        .eq('locatie_id', locatie.id).gte('datum', van).lte('datum', tot).order('datum')
      if (error) throw error
      downloadCsv(bestand('uren'), ['Datum', 'Medewerker', 'Minuten', 'Uren', 'Bij', 'Notitie'],
        (data as any[]).map((u) => [u.datum, u.medewerker?.naam, u.minuten, Math.round((u.minuten / 60) * 100) / 100, u.bron_tabel, u.notitie]))
    }],
  ]

  if (!magPlannen) return null

  return (
    <section>
      <p className="zacht">Exporteer registraties als CSV. Opent direct in Excel (Nederlandse instellingen).</p>
      <div className="twee-kolommen">
        <div><label htmlFor="evan">Van</label><input id="evan" type="date" value={van} onChange={(e) => setVan(e.target.value)} /></div>
        <div><label htmlFor="etot">Tot en met</label><input id="etot" type="date" value={tot} onChange={(e) => setTot(e.target.value)} /></div>
      </div>
      {fout && <div className="melding fout">{fout}</div>}
      <div className="export-knoppen">
        {exports.map(([soort, naam, maak]) => (
          <button key={soort} className="knop tweede" disabled={bezig != null} onClick={() => exporteer(soort, maak)}>
            {bezig === soort ? 'Bezig…' : `${naam} downloaden`}
          </button>
        ))}
      </div>
    </section>
  )
}
