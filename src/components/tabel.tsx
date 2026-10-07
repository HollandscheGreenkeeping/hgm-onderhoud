import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

// Bouwstenen voor de lijstschermen (Freshservice-stijl): compacte kop, weergaven en filters die
// in de URL staan (deelbaar, terug-knop werkt), en een sorteerbare tabel waarvan elke rij een
// eigen detail-URL heeft. Op de telefoon wordt de tabel een lijst rijkaarten.

// ── URL-parameters ───────────────────────────────────────────────────────

export function useUrlParam(naam: string, standaard = ''): [string, (waarde: string) => void] {
  const [zoek, setZoek] = useSearchParams()
  const waarde = zoek.get(naam) ?? standaard
  const zet = (w: string) => {
    const nieuw = new URLSearchParams(zoek)
    if (w === standaard || w === '') nieuw.delete(naam)
    else nieuw.set(naam, w)
    setZoek(nieuw, { replace: true })
  }
  return [waarde, zet]
}

// ── Paginakop ────────────────────────────────────────────────────────────

export function PaginaKop({ titel, telling, sub, children }: {
  titel: string
  telling?: number | null
  sub?: ReactNode
  children?: ReactNode   // acties rechts
}) {
  return (
    <header className="paginakop">
      <div>
        <h1>{titel}{telling != null && <span className="paginakop-telling">{telling}</span>}</h1>
        {sub && <p className="paginakop-sub">{sub}</p>}
      </div>
      {children && <div className="paginakop-acties">{children}</div>}
    </header>
  )
}

// ── Werkbalk: weergaven, zoeken, filters ─────────────────────────────────

export type Weergave = { waarde: string; naam: string; telling?: number }

export function Werkbalk({ children }: { children: ReactNode }) {
  return <div className="werkbalk">{children}</div>
}

export function Weergaven({ opties, param = 'weergave', standaard }: { opties: Weergave[]; param?: string; standaard: string }) {
  const [actief, zet] = useUrlParam(param, standaard)
  return (
    <nav className="weergaven" aria-label="Weergave">
      {opties.map((o) => (
        <button key={o.waarde} type="button" className={actief === o.waarde ? 'actief' : ''} aria-pressed={actief === o.waarde}
                onClick={() => zet(o.waarde)}>
          {o.naam}{o.telling != null && <span className="weergave-telling">{o.telling}</span>}
        </button>
      ))}
    </nav>
  )
}

export function Zoekveld({ param = 'q', placeholder = 'Zoeken' }: { param?: string; placeholder?: string }) {
  const [waarde, zet] = useUrlParam(param)
  const [tekst, setTekst] = useState(waarde)
  useEffect(() => setTekst(waarde), [waarde])
  useEffect(() => {
    if (tekst === waarde) return
    const t = setTimeout(() => zet(tekst), 250)
    return () => clearTimeout(t)
  }, [tekst]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input type="search" className="werkbalk-zoek" aria-label={placeholder} placeholder={placeholder}
           value={tekst} onChange={(e) => setTekst(e.target.value)} />
  )
}

export function FilterKeuze({ param, label, opties }: { param: string; label: string; opties: [string, string][] }) {
  const [waarde, zet] = useUrlParam(param)
  return (
    <select className={`werkbalk-filter ${waarde ? 'aan' : ''}`} aria-label={label} value={waarde} onChange={(e) => zet(e.target.value)}>
      <option value="">{label}: alle</option>
      {opties.map(([w, n]) => <option key={w} value={w}>{n}</option>)}
    </select>
  )
}

// Zoekterm toepassen op een lijst: alle gegeven teksten van een rij doorzoeken.
export function useZoekfilter<T>(rijen: T[] | null, teksten: (r: T) => (string | null | undefined)[]) {
  const [q] = useUrlParam('q')
  return useMemo(() => {
    if (!rijen || !q.trim()) return rijen
    const term = q.trim().toLowerCase()
    return rijen.filter((r) => teksten(r).some((t) => t?.toLowerCase().includes(term)))
  }, [rijen, q]) // eslint-disable-line react-hooks/exhaustive-deps
}

// ── Tabel ────────────────────────────────────────────────────────────────

export type Kolom<T> = {
  sleutel: string
  kop: string
  cel: (r: T) => ReactNode
  sorteer?: (r: T) => string | number | null   // zonder: niet sorteerbaar
  klasse?: string                                // bijv. 'mono', 'rechts', 'smal'
}

export function DataTabel<T>({ kolommen, rijen, sleutel, naar, leeg, regelKlasse }: {
  kolommen: Kolom<T>[]
  rijen: T[] | null
  sleutel: (r: T) => string
  naar?: (r: T) => string
  leeg: ReactNode
  regelKlasse?: (r: T) => string
}) {
  const navigeer = useNavigate()
  const [sorteer, zetSorteer] = useUrlParam('sorteer')
  const [veld, richting] = sorteer.split(':')
  const kolom = kolommen.find((k) => k.sleutel === veld && k.sorteer)

  const gesorteerd = useMemo(() => {
    if (!rijen || !kolom) return rijen
    const f = kolom.sorteer!
    return [...rijen].sort((a, b) => {
      const x = f(a), y = f(b)
      if (x == null) return 1
      if (y == null) return -1
      const v = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'nl', { numeric: true })
      return richting === 'af' ? -v : v
    })
  }, [rijen, kolom, richting])

  if (rijen === null) return <div className="tabel-laden" aria-busy="true">Laden…</div>
  if (rijen.length === 0) return <div className="tabel-leeg">{leeg}</div>

  return (
    <div className="datatabel-wrap">
      <table className="datatabel">
        <thead>
          <tr>
            {kolommen.map((k) => {
              const aan = kolom?.sleutel === k.sleutel
              return (
                <th key={k.sleutel} className={k.klasse} aria-sort={aan ? (richting === 'af' ? 'descending' : 'ascending') : undefined}>
                  {k.sorteer
                    ? <button type="button" onClick={() => zetSorteer(aan && richting !== 'af' ? `${k.sleutel}:af` : aan ? '' : `${k.sleutel}:op`)}>
                        {k.kop}<span className="sorteerpijl" aria-hidden>{aan ? (richting === 'af' ? '↓' : '↑') : ''}</span>
                      </button>
                    : k.kop}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {gesorteerd!.map((r) => {
            const link = naar?.(r)
            return (
              <tr key={sleutel(r)} className={`${link ? 'klikbaar' : ''} ${regelKlasse?.(r) ?? ''}`}
                  onClick={link ? (e) => {
                    if ((e.target as HTMLElement).closest('a, button, input, select, label')) return
                    navigeer(link)
                  } : undefined}>
                {kolommen.map((k, i) => (
                  <td key={k.sleutel} className={k.klasse} data-kop={k.kop}>
                    {i === 0 && link ? <Link to={link} className="rijlink">{k.cel(r)}</Link> : k.cel(r)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Status als kleine chip; klasse volgt de bestaande labelkleuren (storing · gepland · in-orde).
export function Chip({ klasse = '', children }: { klasse?: string; children: ReactNode }) {
  return <span className={`chip-status ${klasse}`}>{children}</span>
}
