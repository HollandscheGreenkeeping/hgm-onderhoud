import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useSessie } from '../lib/sessie'
import { datum } from '../lib/teksten'
import WerkorderAanvragen from '../components/WerkorderAanvragen'
import {
  openWerkorderStatussen, werkorderCode, werkorderDoel, werkorderKlasse, werkorderStatus, werkorderVelden, type Werkorder,
} from '../lib/werkplaats'

type Filter = 'open' | 'mijn' | 'afgerond' | 'alle'

// Werkplaats → Werkorders: alle werkorders over alle banen, dringendste eerst.
export default function Werkorders() {
  const { sessie, profiel } = useSessie()
  const isMonteur = profiel?.globale_rol === 'monteur'
  const [filter, setFilter] = useState<Filter>(isMonteur ? 'mijn' : 'open')
  const [baan, setBaan] = useState('')
  const [banen, setBanen] = useState<{ id: string; naam: string }[]>([])
  const [werkorders, setWerkorders] = useState<Werkorder[] | null>(null)

  useEffect(() => {
    supabase.from('locaties').select('id, naam').eq('soort', 'baan').eq('actief', true).order('naam')
      .then(({ data }) => setBanen(data ?? []))
  }, [])

  useEffect(() => {
    let q = supabase.from('werkorders').select(werkorderVelden)
    if (filter === 'open' || filter === 'mijn') q = q.in('status', openWerkorderStatussen)
    if (filter === 'mijn') q = q.eq('monteur_id', sessie!.user.id)
    if (filter === 'afgerond') q = q.in('status', ['terug_op_locatie', 'geannuleerd'])
    if (baan) q = q.eq('locatie_id', baan)
    q.order(filter === 'afgerond' ? 'afgerond_op' : 'aangevraagd_op', { ascending: filter !== 'afgerond' }).limit(200)
      .then(({ data }) => setWerkorders((data ?? []) as unknown as Werkorder[]))
  }, [filter, baan, sessie])

  // Spoed en hoog eerst, daarna op aanvraagdatum (de query sorteert al op datum).
  const urgentie = ['spoed', 'hoog', 'normaal', 'laag']
  const lijst = filter === 'afgerond' ? werkorders : werkorders && [...werkorders].sort((a, b) => urgentie.indexOf(a.urgentie) - urgentie.indexOf(b.urgentie))

  return (
    <>
      <div className="kop-met-knop">
        <h1>Werkorders</h1>
        <Link className="knop" to="/werkplaats/werkorders/nieuw">+ Werkorder</Link>
      </div>
      <div className="schakelaar filterbalk">
        {([['open', 'Open'], ['mijn', 'Mijn werk'], ['afgerond', 'Afgerond'], ['alle', 'Alles']] as const).map(([f, n]) => (
          <button key={f} className={`knop ${filter === f ? '' : 'tweede'}`} onClick={() => setFilter(f)}>{n}</button>
        ))}
      </div>
      <select aria-label="Baan" value={baan} onChange={(e) => setBaan(e.target.value)}>
        <option value="">Alle banen</option>
        {banen.map((b) => <option key={b.id} value={b.id}>{b.naam}</option>)}
      </select>

      {lijst === null && <p className="zacht">Laden…</p>}
      {lijst?.length === 0 && <p className="zacht">Geen werkorders.</p>}
      <ul className="lijst">
        {lijst?.map((w) => <li key={w.id}><WerkorderRij werkorder={w} /></li>)}
      </ul>
    </>
  )
}

export function WerkorderRij({ werkorder: w, naar }: { werkorder: Werkorder; naar?: string }) {
  return (
    <Link className={`rij urgentie-${w.urgentie}`} to={naar ?? `/werkplaats/werkorders/${w.id}`}>
      <span className="rij-hoofd">
        <span className="rij-id">{werkorderCode(w)} · {w.locatie?.naam}</span>
        <span className={`label ${werkorderKlasse(w.status)}`}>{werkorderStatus[w.status]}</span>
      </span>
      <strong>{werkorderDoel(w)}: {w.omschrijving}</strong>
      <span className="rij-meta">
        <span>{w.monteur?.naam ?? 'Nog geen monteur'}</span>
        {w.gepland_op && <><span>·</span><span>gepland {datum(w.gepland_op)}</span></>}
        <span className="mono" style={{ marginLeft: 'auto' }}>aangevraagd {datum(w.aangevraagd_op)}</span>
      </span>
    </Link>
  )
}

// Werkplaats → nieuwe werkorder (handmatig, voor een machine of installatie op een baan).
export function WerkorderNieuw() {
  const navigeer = useNavigate()
  return (
    <>
      <p><Link to="/werkplaats/werkorders">← Alle werkorders</Link></p>
      <WerkorderAanvragen klaar={(id) => navigeer(`/werkplaats/werkorders/${id}`)} annuleer={() => navigeer('/werkplaats/werkorders')} />
    </>
  )
}
