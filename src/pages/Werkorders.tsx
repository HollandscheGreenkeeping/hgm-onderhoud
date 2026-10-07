import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useSessie } from '../lib/sessie'
import { datum, urgentieNamen } from '../lib/teksten'
import { Chip, DataTabel, FilterKeuze, PaginaKop, useUrlParam, useZoekfilter, Weergaven, Werkbalk, Zoekveld, type Kolom } from '../components/tabel'
import WerkorderAanvragen from '../components/WerkorderAanvragen'
import {
  openWerkorderStatussen, werkorderCode, werkorderDoel, werkorderKlasse, werkorderStatus, werkorderVelden, type Werkorder,
} from '../lib/werkplaats'

type Filter = 'open' | 'mijn' | 'afgerond' | 'alle'
const urgentieVolgorde = ['laag', 'normaal', 'hoog', 'spoed']

// Werkplaats → Werkorders: alle werkorders over alle banen. Weergave, baan en zoekterm in de URL;
// elke werkorder opent /werkplaats/werkorders/:id.
export default function Werkorders() {
  const { sessie, profiel } = useSessie()
  const isMonteur = profiel?.globale_rol === 'monteur'
  const [filterTekst] = useUrlParam('weergave', isMonteur ? 'mijn' : 'open')
  const filter = filterTekst as Filter
  const [baan] = useUrlParam('baan')
  const [banen, setBanen] = useState<{ id: string; naam: string }[]>([])
  const [werkorders, setWerkorders] = useState<Werkorder[] | null>(null)

  useEffect(() => {
    supabase.from('locaties').select('id, naam').eq('soort', 'baan').eq('actief', true).order('naam')
      .then(({ data }) => setBanen(data ?? []))
  }, [])

  useEffect(() => {
    setWerkorders(null)
    let q = supabase.from('werkorders').select(werkorderVelden)
    if (filter === 'open' || filter === 'mijn') q = q.in('status', openWerkorderStatussen)
    if (filter === 'mijn') q = q.eq('monteur_id', sessie!.user.id)
    if (filter === 'afgerond') q = q.in('status', ['terug_op_locatie', 'geannuleerd'])
    if (baan) q = q.eq('locatie_id', baan)
    q.order(filter === 'afgerond' ? 'afgerond_op' : 'aangevraagd_op', { ascending: filter !== 'afgerond' }).limit(300)
      .then(({ data }) => setWerkorders((data ?? []) as unknown as Werkorder[]))
  }, [filter, baan, sessie])

  const rijen = useZoekfilter(werkorders, (w) => [werkorderCode(w), werkorderDoel(w), w.omschrijving, w.locatie?.naam, w.monteur?.naam])
  const kolommen: Kolom<Werkorder>[] = [
    { sleutel: 'doel', kop: 'Werkorder', sorteer: werkorderDoel, cel: (w) => <>{werkorderDoel(w)}<span className="sub">{w.omschrijving}</span></> },
    { sleutel: 'code', kop: 'Nummer', klasse: 'mono smal', sorteer: (w) => w.nummer, cel: werkorderCode },
    { sleutel: 'baan', kop: 'Baan', sorteer: (w) => w.locatie?.naam ?? '', cel: (w) => w.locatie?.naam },
    { sleutel: 'urgentie', kop: 'Urgentie', sorteer: (w) => urgentieVolgorde.indexOf(w.urgentie), cel: (w) => (
      <span className={w.urgentie === 'spoed' || w.urgentie === 'hoog' ? 'urgent' : ''}>{urgentieNamen[w.urgentie]}</span>
    ) },
    { sleutel: 'monteur', kop: 'Monteur', sorteer: (w) => w.monteur?.naam ?? '', cel: (w) => w.monteur?.naam ?? <span className="zacht">Nog niemand</span> },
    { sleutel: 'gepland', kop: 'Gepland', klasse: 'mono smal', sorteer: (w) => w.gepland_op, cel: (w) => datum(w.gepland_op) },
    { sleutel: 'status', kop: 'Status', sorteer: (w) => w.status, cel: (w) => <Chip klasse={werkorderKlasse(w.status)}>{werkorderStatus[w.status]}</Chip> },
  ]

  return (
    <>
      <PaginaKop titel="Werkorders" telling={rijen?.length}>
        <Link className="knop" to="/werkplaats/werkorders/nieuw">Werkorder aanmaken</Link>
      </PaginaKop>
      <Werkbalk>
        <Weergaven standaard={isMonteur ? 'mijn' : 'open'} opties={[
          { waarde: 'open', naam: 'Open' }, { waarde: 'mijn', naam: 'Mijn werk' }, { waarde: 'afgerond', naam: 'Afgerond' }, { waarde: 'alle', naam: 'Alles' },
        ]} />
        <Zoekveld placeholder="Zoek nummer, machine of monteur" />
        <FilterKeuze param="baan" label="Baan" opties={banen.map((b) => [b.id, b.naam])} />
      </Werkbalk>
      <DataTabel kolommen={kolommen} rijen={rijen} sleutel={(w) => w.id} naar={(w) => `/werkplaats/werkorders/${w.id}`}
                 regelKlasse={(w) => (w.urgentie === 'spoed' && openWerkorderStatussen.includes(w.status) ? 'let-op' : '')}
                 leeg="Geen werkorders in deze weergave." />
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
