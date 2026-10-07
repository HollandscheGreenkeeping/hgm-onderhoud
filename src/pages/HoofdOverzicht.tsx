import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { supabase, type MijnLocatie } from '../lib/supabase'
import { useSessie } from '../lib/sessie'
import { datum, openStoringStatussen, vandaag } from '../lib/teksten'
import { storingVelden, type Storing } from '../lib/storingen'
import StoringRij from '../components/StoringRij'
import type { Cijfers } from './Overzicht'

// Overzicht over alle banen samen: wat vraagt nu aandacht, per baan en in totaal.
// Een baan kiezen gaat via Banen (LocatieKiezen.tsx); het dashboard van één baan is Overzicht.tsx.

const dagdeel = () => { const u = new Date().getHours(); return u < 12 ? 'Goedemorgen' : u < 18 ? 'Goedemiddag' : 'Goedenavond' }
const n = (v: unknown) => Number(v ?? 0)
const telwoord = (x: number) => ['Geen', 'Eén', 'Twee', 'Drie', 'Vier', 'Vijf', 'Zes', 'Zeven', 'Acht', 'Negen', 'Tien'][x] ?? String(x)

type StoringMetBaan = Storing & { locatie_id: string; locatie: { naam: string } | null }
type VerlopenTaak = { id: string; omschrijving: string; deadline: string; locatie_id: string; locatie: { naam: string } | null }

// Telt van 0 op naar de waarde (respecteert prefers-reduced-motion)
function Teller({ waarde }: { waarde: number }) {
  const [getal, setGetal] = useState(0)
  const vorige = useRef(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setGetal(waarde); return }
    const start = performance.now(), van = vorige.current, duur = 700
    let frame = 0
    const stap = (t: number) => {
      const p = Math.min(1, (t - start) / duur), e = 1 - Math.pow(1 - p, 3)
      setGetal(Math.round(van + (waarde - van) * e))
      if (p < 1) frame = requestAnimationFrame(stap); else vorige.current = waarde
    }
    frame = requestAnimationFrame(stap)
    return () => cancelAnimationFrame(frame)
  }, [waarde])
  return <>{getal}</>
}

export default function HoofdOverzicht() {
  const { profiel } = useSessie()
  const [banen, setBanen] = useState<MijnLocatie[]>([])
  const [cijfers, setCijfers] = useState<Cijfers[] | null>(null)
  const [storingen, setStoringen] = useState<StoringMetBaan[]>([])
  const [verlopen, setVerlopen] = useState<VerlopenTaak[]>([])

  useEffect(() => {
    Promise.all([
      supabase.rpc('mijn_locaties'),
      supabase.rpc('dashboard_cijfers'),
      supabase.from('storingen').select(`${storingVelden}, locatie_id, locatie:locaties(naam)`)
        .in('status', openStoringStatussen).order('urgentie', { ascending: false }).order('gemeld_op').limit(8),
      supabase.from('taken').select('id, omschrijving, deadline, locatie_id, locatie:locaties(naam)')
        .in('status', ['open', 'in_behandeling']).lt('deadline', vandaag()).order('deadline').limit(8),
    ]).then(([b, c, st, vt]) => {
      setBanen(b.data ?? [])
      setCijfers(c.data ?? [])
      setStoringen((st.data ?? []) as never)
      setVerlopen((vt.data ?? []) as never)
    })
  }, [])

  const alle = cijfers ?? []
  const totaal = (k: keyof Cijfers) => alle.reduce((t, c) => t + n(c[k]), 0)
  const st = totaal('open_storingen'), vl = totaal('verlopen_taken'), mo = totaal('machines_onderhoud'), wk = totaal('werk_deze_week')
  const metStoring = alle.filter((c) => n(c.open_storingen) > 0)
  const perBaan = [...alle].sort((a, b) =>
    n(b.open_storingen) + n(b.verlopen_taken) - n(a.open_storingen) - n(a.verlopen_taken) || a.naam.localeCompare(b.naam))

  const voornaam = (profiel?.naam ?? '').split(' ')[0]
  const datumVandaag = new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })

  function samenvatting() {
    if (!cijfers) return null
    const aantal = `${telwoord(banen.length)} ${banen.length === 1 ? 'baan' : 'banen'}.`
    if (!st && !vl) return <>{aantal} Alles is in orde.</>
    if (metStoring.length === 1) return <>{aantal} Op <strong className="rood">{metStoring[0].naam}</strong> {st === 1 ? 'staat één storing' : `staan ${telwoord(st).toLowerCase()} storingen`} open{metStoring.length < banen.length ? '; de rest is in orde.' : '.'}</>
    if (!st) return <>{aantal} Er {vl === 1 ? 'is één taak' : `zijn ${vl} taken`} over de deadline.</>
    return <>{aantal} Er staan <strong className="rood">{st} storingen</strong> open op {metStoring.length} banen.</>
  }

  return (
    <main className="clubhuis">
      <div className="clubhuis-kop">
        <div className="clubhuis-groet">
          <span className="label-klein clubhuis-datum">{datumVandaag}</span>
          <h1>{dagdeel()}{voornaam && `, ${voornaam}`}</h1>
          <p>{samenvatting()}</p>
        </div>
        <div className="clubhuis-tellers">
          <span className={st ? 'rood' : ''}><b><Teller waarde={st} /></b>open storingen</span>
          <span className={vl ? 'rood' : ''}><b><Teller waarde={vl} /></b>verlopen taken</span>
          <span className={mo ? 'oranje' : ''}><b><Teller waarde={mo} /></b>in onderhoud</span>
          <span><b><Teller waarde={wk} /></b>werk deze week</span>
        </div>
      </div>

      <div className="overzicht-kolommen">
        <section>
          <h2>Per baan</h2>
          <div className="tabel-wrap">
            <table className="tabel">
              <thead>
                <tr><th>Baan</th><th>Storingen</th><th>Verlopen</th><th>Werk deze week</th><th>Onderhoud</th></tr>
              </thead>
              <tbody>
                {perBaan.map((c) => (
                  <tr key={c.locatie_id}>
                    <td><Link to={`/locatie/${c.locatie_id}/overzicht`}>{c.naam}</Link></td>
                    <td className={n(c.open_storingen) ? 'rood' : 'zacht'}>{c.open_storingen}</td>
                    <td className={n(c.verlopen_taken) ? 'rood' : 'zacht'}>{c.verlopen_taken}</td>
                    <td>{c.werk_deze_week}</td>
                    <td className={n(c.machines_onderhoud) ? 'oranje' : 'zacht'}>{c.machines_onderhoud}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2>Open storingen</h2>
          {cijfers && storingen.length === 0 && <p className="zacht">Geen open storingen. Mooi zo.</p>}
          <ul className="lijst">
            {storingen.map((s) => (
              <li key={s.id}>
                <StoringRij storing={s} baan={s.locatie?.naam} naar={`/locatie/${s.locatie_id}/storingen/${s.id}`} />
              </li>
            ))}
          </ul>
          {st > storingen.length && <p className="zacht klein-tekst">De {storingen.length} dringendste van {st}. De rest staat per baan onder Storingen.</p>}

          {verlopen.length > 0 && (
            <>
              <h2>Verlopen taken</h2>
              <ul className="lijst">
                {verlopen.map((t) => (
                  <li key={t.id}>
                    <Link className="rij verlopen" to={`/locatie/${t.locatie_id}/taken`}>
                      <span className="rij-hoofd">
                        <span className="rij-id">{t.locatie?.naam}</span>
                        <span className="zacht">uiterlijk {datum(t.deadline)}</span>
                      </span>
                      <strong>{t.omschrijving}</strong>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
