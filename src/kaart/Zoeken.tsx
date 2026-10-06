import { useMemo, useState } from 'react'
import type { Feature } from 'geojson'
import type { KaartData } from './data'

export type Zoekresultaat = { sleutel: string; titel: string; sub: string; feature: Feature; soort: 'object' | 'hole' }

// Zoeken op hole-nummer, objectcode of objecttype, in de al geladen kaartdata.
export default function Zoeken({ data, kies }: { data: KaartData | null; kies: (r: Zoekresultaat) => void }) {
  const [tekst, setTekst] = useState('')

  const resultaten = useMemo<Zoekresultaat[]>(() => {
    const q = tekst.trim().toLowerCase()
    if (!data || !q) return []
    const holeNummer = q.match(/^(?:hole\s*)?(\d{1,2})$/)?.[1]
    const holes: Zoekresultaat[] = data.holes.features
      .filter((f) => holeNummer && String(f.properties?.nummer) === holeNummer)
      .map((f) => ({
        sleutel: `h${f.properties?.id}`,
        titel: `Hole ${f.properties?.nummer}`,
        sub: f.properties?.lus ?? '',
        feature: f,
        soort: 'hole',
      }))
    const objecten: Zoekresultaat[] = data.objecten.features
      .filter((f) => {
        const p = f.properties ?? {}
        return [p.code, p.type, p.hole != null ? `hole ${p.hole}` : null]
          .some((v) => v && String(v).toLowerCase().includes(q))
      })
      .slice(0, 15)
      .map((f) => ({
        sleutel: `o${f.properties?.id}`,
        titel: [f.properties?.type, f.properties?.code].filter(Boolean).join(' '),
        sub: f.properties?.hole != null ? `Hole ${f.properties.hole}` : '',
        feature: f,
        soort: 'object',
      }))
    return [...holes, ...objecten]
  }, [data, tekst])

  return (
    <div className="zoeken">
      <input type="search" placeholder="Zoek hole, code of type…" value={tekst} aria-label="Zoeken"
             onChange={(e) => setTekst(e.target.value)} />
      {tekst && (
        <ul className="zoekresultaten">
          {resultaten.length === 0 && <li className="zacht">Niets gevonden</li>}
          {resultaten.map((r) => (
            <li key={r.sleutel}>
              <button onClick={() => { kies(r); setTekst('') }}>
                <span>{r.titel}</span><span className="zacht">{r.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
