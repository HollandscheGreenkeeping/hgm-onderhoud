import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { huisstijlUrl, rolNamen, supabase, type MijnLocatie } from '../lib/supabase'
import { useSessie } from '../lib/sessie'
import Kopbalk from '../components/Kopbalk'
import type { Cijfers } from './Overzicht'

// Alle banen – "Clubhuis": per baan een tegel met foto, logo en kerncijfers. Zo is dit ook het overzicht
// over alle banen voor onderhoudsmanager en beheer. Klassen: ".clubhuis-…" in app.css.

const dagdeel = () => { const u = new Date().getHours(); return u < 12 ? 'Goedemorgen' : u < 18 ? 'Goedemiddag' : 'Goedenavond' }
const initialen = (naam: string) => naam.replace(/^Golfpark\s+(de\s+)?/i, '').replace(/\(.*\)/, '').trim().slice(0, 2).toUpperCase()
const n = (v: unknown) => Number(v ?? 0)
const telwoord = (x: number) => ['Geen', 'Eén', 'Twee', 'Drie', 'Vier', 'Vijf', 'Zes', 'Zeven', 'Acht', 'Negen', 'Tien'][x] ?? String(x)

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

// Zonder foto (of als hij niet laadt) blijft de groene achtergrond staan.
function Baanfoto({ url }: { url: string }) {
  const [status, setStatus] = useState<'laden' | 'ok' | 'geen'>('laden')
  if (status === 'geen') return null
  return (
    <img className={`clubhuis-foto ${status === 'ok' ? 'geladen' : ''}`} src={url} alt=""
         onLoad={() => setStatus('ok')} onError={() => setStatus('geen')} />
  )
}

type Beeld = { logo: string | null; foto: string | null }

export default function LocatieKiezen() {
  const { profiel } = useSessie()
  const [locaties, setLocaties] = useState<MijnLocatie[] | null>(null)
  const [cijfers, setCijfers] = useState<Record<string, Cijfers>>({})
  const [beelden, setBeelden] = useState<Record<string, Beeld>>({})
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('mijn_locaties').then(({ data, error }) => {
      if (error) return setFout(error.message)
      setLocaties(data)
      const ids = (data ?? []).map((l: MijnLocatie) => l.locatie_id)
      if (ids.length) supabase.from('locaties').select('id, klantlogo_pad, baanfoto_pad').in('id', ids).then(({ data: rijen }) =>
        setBeelden(Object.fromEntries((rijen ?? []).map((r) => [r.id, {
          logo: r.klantlogo_pad ? huisstijlUrl(r.klantlogo_pad) : null,
          foto: r.baanfoto_pad ? huisstijlUrl(r.baanfoto_pad) : null,
        }]))))
    })
    supabase.rpc('dashboard_cijfers').then(({ data }) =>
      setCijfers(Object.fromEntries((data ?? []).map((c: Cijfers) => [c.locatie_id, c]))))
  }, [])

  const isBeheer = profiel?.globale_rol === 'beheer'
  // Eén baan? Dan meteen door (behalve beheer: die moet ook een nieuwe baan kunnen aanmaken).
  if (locaties?.length === 1 && !isBeheer) return <Navigate to={`/locatie/${locaties[0].locatie_id}`} replace />

  const alle = Object.values(cijfers)
  const totaal = (k: keyof Cijfers) => alle.reduce((t, c) => t + n(c[k]), 0)
  const st = totaal('open_storingen'), vl = totaal('verlopen_taken'), mo = totaal('machines_onderhoud'), wk = totaal('werk_deze_week')
  const aandacht = (id: string) => n(cijfers[id]?.open_storingen) + n(cijfers[id]?.verlopen_taken)
  const lijst = [...(locaties ?? [])].sort((a, b) =>
    aandacht(b.locatie_id) - aandacht(a.locatie_id) || n(cijfers[b.locatie_id]?.machines_onderhoud) - n(cijfers[a.locatie_id]?.machines_onderhoud) || a.naam.localeCompare(b.naam))
  const metStoring = lijst.filter((l) => n(cijfers[l.locatie_id]?.open_storingen) > 0)

  const voornaam = (profiel?.naam ?? '').split(' ')[0]
  const vandaag = new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })

  function samenvatting() {
    if (!lijst.length || !alle.length) return null
    const aantal = `${telwoord(lijst.length)} ${lijst.length === 1 ? 'baan' : 'banen'} in beheer.`
    if (!st && !vl) return <>{aantal} Alles is in orde.</>
    if (metStoring.length === 1) return <>{aantal} Op <strong className="rood">{metStoring[0].naam}</strong> {st === 1 ? 'staat één storing' : `staan ${telwoord(st).toLowerCase()} storingen`} open{metStoring.length < lijst.length ? '; de rest is in orde.' : '.'}</>
    return <>{aantal} Er staan <strong className="rood">{st} storingen</strong> open op {metStoring.length} banen.</>
  }

  return (
    <>
      <Kopbalk titel="HGM Golf Onderhoud" />
      <main className="clubhuis">
        <div className="clubhuis-kop">
          <div className="clubhuis-groet">
            <span className="label-klein clubhuis-datum">{vandaag}</span>
            <h1>{dagdeel()}{voornaam && `, ${voornaam}`}</h1>
            <p>{samenvatting()}</p>
          </div>
          {lijst.length > 1 && (
            <div className="clubhuis-tellers">
              <span className={st ? 'rood' : ''}><b><Teller waarde={st} /></b>open storingen</span>
              {vl > 0 && <span className="rood"><b><Teller waarde={vl} /></b>verlopen taken</span>}
              <span className={mo ? 'oranje' : ''}><b><Teller waarde={mo} /></b>in onderhoud</span>
              <span><b><Teller waarde={wk} /></b>werk deze week</span>
            </div>
          )}
        </div>

        {fout && <div className="melding fout">{fout}</div>}
        {locaties?.length === 0 && (
          <div className="melding info">Je bent nog niet aan een baan gekoppeld. Vraag beheer om je toegang te geven.</div>
        )}

        <ul className="clubhuis-raster">
          {locaties === null && [0, 1].map((i) => <li key={i} className="clubhuis-skelet" />)}
          {lijst.map((l, i) => {
            const c = cijfers[l.locatie_id]
            const s = n(c?.open_storingen), v = n(c?.verlopen_taken), w = n(c?.werk_deze_week)
            const letOp = s + v > 0
            const status = letOp ? [s && `${s} open ${s === 1 ? 'storing' : 'storingen'}`, v && `${v} verlopen`].filter(Boolean).join(' · ') : 'Alles in orde'
            const { logo, foto } = beelden[l.locatie_id] ?? { logo: null, foto: null }
            return (
              <li key={l.locatie_id} style={{ ['--i' as string]: i }}>
                <Link to={`/locatie/${l.locatie_id}`} className={`clubhuis-tegel ${letOp ? 'aandacht' : ''}`}>
                  <span className="clubhuis-beeld">
                    {foto && <Baanfoto url={foto} />}
                    <span className="clubhuis-verloop" />
                    {c && <span className={`clubhuis-status ${letOp ? 'rood' : 'groen'}`}><i />{status}</span>}
                    <span className="clubhuis-naamblok">
                      <span className="clubhuis-logo">{logo ? <img src={logo} alt="" /> : initialen(l.naam)}</span>
                      <span><strong>{l.naam}</strong><span>{rolNamen[l.rol]}</span></span>
                    </span>
                  </span>
                  <span className="clubhuis-cijfers">
                    <span className={s ? 'rood' : 'nul'}><b>{c ? s : '–'}</b>storingen</span>
                    <span className={v ? 'rood' : 'nul'}><b>{c ? v : '–'}</b>verlopen</span>
                    <span className={w ? '' : 'nul'}><b>{c ? w : '–'}</b>werk deze week</span>
                    <span className="clubhuis-open">Open baan <span aria-hidden>→</span></span>
                  </span>
                </Link>
              </li>
            )
          })}
          {isBeheer && locaties !== null && (
            <li className="clubhuis-nieuw-li" style={{ ['--i' as string]: lijst.length }}>
              <Link to="/nieuwe-baan" className="clubhuis-nieuw"><span>+</span>Nieuwe baan toevoegen</Link>
            </li>
          )}
        </ul>
      </main>
    </>
  )
}
