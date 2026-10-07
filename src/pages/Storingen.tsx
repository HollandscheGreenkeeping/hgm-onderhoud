import { useMemo } from 'react'
import { Link } from 'react-router'
import { useLocatie } from '../lib/locatie'
import { useSessie } from '../lib/sessie'
import { relatieveTijd, storingStatus, urgentieNamen } from '../lib/teksten'
import {
  storingCategorie, storingCode, storingPlek, storingStatusKlasse, storingTitel, useStoringen, type Storing, type StoringFilter,
} from '../lib/storingen'
import { Chip, DataTabel, FilterKeuze, PaginaKop, useUrlParam, useZoekfilter, Weergaven, Werkbalk, Zoekveld, type Kolom } from '../components/tabel'

const urgentieVolgorde = ['laag', 'normaal', 'hoog', 'spoed']

// Storingen van de baan als werklijst: weergave, urgentie, soort en zoekterm staan in de URL;
// elke rij opent /storingen/:id.
export default function Storingen() {
  const { locatie, magRegistreren } = useLocatie()
  const { sessie } = useSessie()
  const [weergave] = useUrlParam('weergave', 'open')
  const [urgentie] = useUrlParam('urgentie')
  const [soort] = useUrlParam('soort')
  const { storingen } = useStoringen(locatie.id, weergave as StoringFilter, sessie!.user.id)

  const gefilterd = useMemo(() => storingen?.filter((s) =>
    (!urgentie || s.urgentie === urgentie) && (!soort || storingCategorie(s).klasse === soort)) ?? null, [storingen, urgentie, soort])
  const rijen = useZoekfilter(gefilterd, (s) => [storingCode(s), storingTitel(s), storingPlek(s), s.omschrijving, s.melder?.naam, s.uitvoerder?.naam])

  const kolommen: Kolom<Storing>[] = [
    { sleutel: 'onderwerp', kop: 'Storing', sorteer: storingTitel, cel: (s) => (
      <>{storingTitel(s)}<span className="sub">{storingPlek(s)}</span></>
    ) },
    { sleutel: 'code', kop: 'Code', klasse: 'mono smal', sorteer: storingCode, cel: storingCode },
    { sleutel: 'hole', kop: 'Hole', klasse: 'smal', sorteer: (s) => s.object?.hole?.nummer ?? null, cel: (s) => s.object?.hole?.nummer ?? '–' },
    { sleutel: 'soort', kop: 'Soort', sorteer: (s) => storingCategorie(s).naam, cel: (s) => {
      const c = storingCategorie(s)
      return <span className={`cat ${c.klasse}`}>{c.naam}</span>
    } },
    { sleutel: 'urgentie', kop: 'Urgentie', sorteer: (s) => urgentieVolgorde.indexOf(s.urgentie), cel: (s) => (
      <span className={s.urgentie === 'spoed' || s.urgentie === 'hoog' ? 'urgent' : ''}>{urgentieNamen[s.urgentie]}</span>
    ) },
    { sleutel: 'status', kop: 'Status', sorteer: (s) => s.status, cel: (s) => <Chip klasse={storingStatusKlasse(s.status)}>{storingStatus[s.status]}</Chip> },
    { sleutel: 'uitvoerder', kop: 'Uitvoerder', sorteer: (s) => s.uitvoerder?.naam ?? '', cel: (s) => s.uitvoerder?.naam ?? <span className="zacht">Niemand</span> },
    { sleutel: 'gemeld', kop: 'Gemeld', klasse: 'mono smal', sorteer: (s) => s.gemeld_op, cel: (s) => relatieveTijd(s.gemeld_op) },
  ]

  return (
    <main className="breed">
      <PaginaKop titel="Storingen" telling={rijen?.length}>
        {magRegistreren && <Link className="knop melden" to={`/locatie/${locatie.id}?melden=1`}>Storing melden</Link>}
      </PaginaKop>
      <Werkbalk>
        <Weergaven standaard="open" opties={[
          { waarde: 'open', naam: 'Open' },
          ...(magRegistreren ? [{ waarde: 'mijn', naam: 'Aan mij' }] : []),
          { waarde: 'in_behandeling', naam: 'In behandeling' },
          { waarde: 'opgelost', naam: 'Opgelost' },
          { waarde: 'alle', naam: 'Alle' },
        ]} />
        <Zoekveld placeholder="Zoek op code, plek of melder" />
        <FilterKeuze param="urgentie" label="Urgentie" opties={urgentieVolgorde.slice().reverse().map((u) => [u, urgentieNamen[u]])} />
        <FilterKeuze param="soort" label="Soort" opties={[['beregening', 'Beregening'], ['drainage', 'Drainage'], ['kabel', 'Kabels'], ['overig', 'Overig en materieel']]} />
      </Werkbalk>
      <DataTabel kolommen={kolommen} rijen={rijen} sleutel={(s) => s.id} naar={(s) => `/locatie/${locatie.id}/storingen/${s.id}`}
                 regelKlasse={(s) => (s.urgentie === 'spoed' && ['gemeld', 'toegewezen', 'in_behandeling'].includes(s.status) ? 'let-op' : '')}
                 leeg={weergave === 'mijn' ? 'Er staan geen storingen op jouw naam.' : 'Geen storingen in deze weergave.'} />
    </main>
  )
}
