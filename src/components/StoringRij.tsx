import { Link } from 'react-router'
import { relatieveTijd, storingStatus } from '../lib/teksten'
import {
  storingCategorie, storingCode, storingPlek, storingStatusKlasse, storingTitel, type Storing,
} from '../lib/storingen'

// Storing als wit kaartje: code · hole en status, titel, categorie · melder · tijd.
// Met 'naar' een link; met 'kies' een knop (bijv. in de lijst naast de kaart).
export default function StoringRij({ storing: s, naar, kies, hover }: {
  storing: Storing
  naar?: string
  kies?: () => void
  hover?: (aan: boolean) => void
}) {
  const cat = storingCategorie(s)
  const hole = s.object?.hole?.nummer
  const inhoud = (
    <>
      <span className="rij-hoofd">
        <span className="rij-id">{storingCode(s)}{hole != null ? ` · hole ${hole}` : ''}</span>
        <span className={`label ${storingStatusKlasse(s.status)}`}>{storingStatus[s.status]}</span>
      </span>
      <strong>{storingTitel(s)}</strong>
      <span className="rij-meta">
        <span className={`cat ${cat.klasse}`}>{cat.naam}</span>
        <span>·</span>
        <span>{s.object || s.leiding || s.machine ? storingPlek(s) : s.melder?.naam ?? 'Plek op de kaart'}</span>
        {s.intern && <><span>·</span><span>intern</span></>}
        <span className="mono" style={{ marginLeft: 'auto' }}>{relatieveTijd(s.gemeld_op)}</span>
      </span>
    </>
  )
  const klasse = `rij urgentie-${s.urgentie}`
  const muis = hover ? { onMouseEnter: () => hover(true), onMouseLeave: () => hover(false) } : {}
  if (kies) return <button type="button" className={`${klasse} rij-knop`} onClick={kies} {...muis}>{inhoud}</button>
  return <Link className={klasse} to={naar!} {...muis}>{inhoud}</Link>
}
