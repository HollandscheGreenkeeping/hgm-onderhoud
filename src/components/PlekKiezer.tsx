import { useMemo } from 'react'
import { plekRijen, vlaktypes, type Baanvlak, type Hole, type Plekkeuze } from '../lib/baan'

// Kies holes (per lus) en eventueel soorten vlakken. Grote tikvakken voor gebruik buiten.
export default function PlekKiezer({ holes, vlakken, keuze, wijzig }: {
  holes: Hole[]
  vlakken: Baanvlak[]
  keuze: Plekkeuze
  wijzig: (k: Plekkeuze) => void
}) {
  const lussen = useMemo(() => {
    const m = new Map<string, Hole[]>()
    for (const h of holes) m.set(h.lus, [...(m.get(h.lus) ?? []), h])
    return [...m]
  }, [holes])
  const { ha } = plekRijen(keuze, holes, vlakken)
  const wissel = <T,>(lijst: T[], w: T) => (lijst.includes(w) ? lijst.filter((x) => x !== w) : [...lijst, w])
  const getekendeTypes = new Set(vlakken.map((v) => v.type))

  return (
    <div className="plekkiezer">
      <span className="veldlabel">Waar?</span>
      <div className="chips">
        {vlaktypes.map(([t, naam]) => (
          <button type="button" key={t} aria-pressed={keuze.types.includes(t)} aria-label={naam}
                  className={`chip ${keuze.types.includes(t) ? 'aan' : ''}`}
                  title={getekendeTypes.has(t) ? undefined : 'Nog niet ingetekend: wordt per hole vastgelegd'}
                  onClick={() => wijzig({ ...keuze, types: wissel(keuze.types, t) })}>
            {naam}
          </button>
        ))}
      </div>
      {lussen.map(([lus, lijst]) => (
        <div key={lus} className="lus-chips">
          <div className="lus-kop">
            <span className="zacht">{lus}</span>
            <button type="button" className="knop tweede klein"
                    onClick={() => {
                      const ids = lijst.map((h) => h.id)
                      const alles = ids.every((id) => keuze.holeIds.includes(id))
                      wijzig({ ...keuze, holeIds: alles
                        ? keuze.holeIds.filter((id) => !ids.includes(id))
                        : [...new Set([...keuze.holeIds, ...ids])] })
                    }}>
              Alle
            </button>
          </div>
          <div className="chips">
            {lijst.map((h) => (
              <button type="button" key={h.id} aria-pressed={keuze.holeIds.includes(h.id)}
                      className={`chip rond ${keuze.holeIds.includes(h.id) ? 'aan' : ''}`}
                      onClick={() => wijzig({ ...keuze, holeIds: wissel(keuze.holeIds, h.id) })}>
                {h.nummer}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="zacht klein-tekst">
        {!keuze.holeIds.length && keuze.types.length ? 'Geen holes gekozen: geldt voor de hele baan. ' : ''}
        {ha > 0 ? `Oppervlakte volgens kaart: ${ha.toLocaleString('nl-NL', { maximumFractionDigits: 3 })} ha.` : 'Oppervlakte onbekend (nog niet ingetekend).'}
      </p>
    </div>
  )
}
