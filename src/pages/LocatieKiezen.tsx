import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { huisstijlUrl, rolNamen, supabase, type MijnLocatie } from '../lib/supabase'
import { useSessie } from '../lib/sessie'
import type { Cijfers } from './Overzicht'

// Banen – "Clubhuis": per baan een tegel met foto, logo en kerncijfers; klik = naar die baan.
// De totalen over alle banen staan op Overzicht (HoofdOverzicht.tsx). Klassen: ".clubhuis-…" in app.css.

const initialen = (naam: string) => naam.replace(/^Golfpark\s+(de\s+)?/i, '').replace(/\(.*\)/, '').trim().slice(0, 2).toUpperCase()
const n = (v: unknown) => Number(v ?? 0)

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
      const banen = ((data ?? []) as MijnLocatie[]).filter((l) => l.soort === 'baan') // werkplaats staat onder Werkplaats
      setLocaties(banen)
      const ids = banen.map((l) => l.locatie_id)
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
  const aandacht = (id: string) => n(cijfers[id]?.open_storingen) + n(cijfers[id]?.verlopen_taken)
  const lijst = [...(locaties ?? [])].sort((a, b) =>
    aandacht(b.locatie_id) - aandacht(a.locatie_id) || n(cijfers[b.locatie_id]?.machines_onderhoud) - n(cijfers[a.locatie_id]?.machines_onderhoud) || a.naam.localeCompare(b.naam))

  return (
    <main className="clubhuis">
      <div className="clubhuis-kop">
        <div className="clubhuis-groet">
          <span className="label-klein">{lijst.length} {lijst.length === 1 ? 'baan' : 'banen'}</span>
          <h1>Banen</h1>
          <p>Kies een baan voor de kaart, storingen, taken en het werk.</p>
        </div>
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
            <Link to="/beheer/banen/nieuw" className="clubhuis-nieuw"><span>+</span>Nieuwe baan toevoegen</Link>
          </li>
        )}
      </ul>
    </main>
  )
}
