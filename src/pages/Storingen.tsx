import { useState } from 'react'
import { Link } from 'react-router'
import { useLocatie } from '../lib/locatie'
import { useSessie } from '../lib/sessie'
import { useStoringen, type StoringFilter } from '../lib/storingen'
import StoringRij from '../components/StoringRij'

export default function Storingen() {
  const { locatie, magRegistreren } = useLocatie()
  const { sessie } = useSessie()
  const [filter, setFilter] = useState<StoringFilter>('open')
  const { storingen } = useStoringen(locatie.id, filter, sessie!.user.id)

  const filters: [StoringFilter, string][] = [
    ['open', 'Open'],
    ...(magRegistreren ? [['mijn', 'Aan mij'] as [StoringFilter, string]] : []),
    ['in_behandeling', 'In behandeling'],
    ['opgelost', 'Opgelost'],
    ['alle', 'Alle'],
  ]

  return (
    <main>
      <div className="kop-met-knop">
        <div>
          <span className="label-klein">{locatie.naam}</span>
          <h1>Storingen</h1>
        </div>
        {magRegistreren && <Link className="knop melden" to={`/locatie/${locatie.id}?melden=1`}>+ Storing melden</Link>}
      </div>
      <div className="schakelaar filterbalk">
        {filters.map(([f, n]) => (
          <button key={f} className={`knop ${filter === f ? '' : 'tweede'}`} onClick={() => setFilter(f)}>{n}</button>
        ))}
      </div>

      {storingen?.length === 0 && <p className="zacht">Geen storingen.</p>}
      <ul className="lijst">
        {storingen?.map((s) => (
          <li key={s.id}><StoringRij storing={s} naar={s.id} /></li>
        ))}
      </ul>
    </main>
  )
}
