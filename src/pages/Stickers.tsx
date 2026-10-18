import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { useLocatie } from '../lib/locatie'
import { PaginaKop, useUrlParam, Weergaven, Werkbalk, Zoekveld } from '../components/tabel'
import QrCode, { appAdres } from '../components/QrCode'
import { machineNaam } from './Materieel'

// QR-stickers per installatie (sprinkler, klep, …) of machine. Scannen opent direct 'storing melden':
// /o/<object-id> en /m/<machine-id> (korte links, dus een kleine QR-code die ook buiten goed scant).
// Afdrukken op etiketvellen in vaste maten (mm): niet schalen, anders vallen de stickers naast de etiketten.

export type Vel = { sleutel: string; naam: string; b: number; h: number; kol: number; rij: number; boven: number; links: number; tussenX: number; tussenY: number }
export const vellen: Vel[] = [
  { sleutel: '70x37', naam: '70 × 37 mm · 24 per vel (bijv. Avery 3474)', b: 70, h: 37, kol: 3, rij: 8, boven: 0.5, links: 0, tussenX: 0, tussenY: 0 },
  { sleutel: '63x38', naam: '63,5 × 38,1 mm · 21 per vel (Avery L7160)', b: 63.5, h: 38.1, kol: 3, rij: 7, boven: 15.15, links: 7.2, tussenX: 2.5, tussenY: 0 },
  { sleutel: '105x74', naam: '105 × 74 mm · 8 per vel (groot, voor machines)', b: 105, h: 74, kol: 2, rij: 4, boven: 0.5, links: 0, tussenX: 0, tussenY: 0 },
]

export type Item = { sleutel: string; soort: 'object' | 'machine'; id: string; titel: string; sub: string; groep: string; kleur: string }

// Kleurband in de kleur van de categorie, net als op de kaart; machines in HGM-olijf.
const kleurVan = (categorie?: string | null) =>
  ['beregening', 'drainage', 'kabel'].includes(categorie ?? '') ? `var(--kleur-${categorie})` : 'var(--kleur-overig)'

export default function Stickers() {
  const { locatie, rol, magPlannen } = useLocatie()
  const [items, setItems] = useState<Item[] | null>(null)
  const [weergave] = useUrlParam('weergave', 'objecten')
  const [zoek] = useUrlParam('q')
  const [type, setType] = useState('')
  const [gekozen, setGekozen] = useState<Set<string>>(new Set())
  const [velSleutel, setVelSleutel] = useState(vellen[0].sleutel)
  const [start, setStart] = useState(1)
  const [aantal, setAantal] = useState(1)
  const vel = vellen.find((v) => v.sleutel === velSleutel)!
  const magStickers = magPlannen || rol === 'monteur'

  useEffect(() => {
    Promise.all([
      supabase.from('objecten').select('id, code, objecttype:objecttypes(naam, categorie), hole:holes(nummer)')
        .eq('locatie_id', locatie.id).is('gearchiveerd_op', null).order('code'),
      supabase.from('machines').select('id, naam, merk, model, standplaats, type:keuzelijst_waarden(naam)')
        .eq('locatie_id', locatie.id).is('gearchiveerd_op', null).order('naam'),
    ]).then(([o, m]) => {
      type O = { id: string; code: string | null; objecttype: { naam: string; categorie: string } | null; hole: { nummer: number } | null }
      type M = { id: string; naam: string | null; merk: string | null; model: string | null; standplaats: string | null; type: { naam: string } | null }
      setItems([
        ...((o.data ?? []) as unknown as O[]).map((x) => ({
          sleutel: `o:${x.id}`, soort: 'object' as const, id: x.id, titel: x.code ?? x.objecttype?.naam ?? 'Object',
          sub: [x.objecttype?.naam, x.hole ? `hole ${x.hole.nummer}` : null].filter(Boolean).join(' · '), groep: x.objecttype?.naam ?? 'Overig', kleur: kleurVan(x.objecttype?.categorie),
        })),
        ...((m.data ?? []) as unknown as M[]).map((x) => ({
          sleutel: `m:${x.id}`, soort: 'machine' as const, id: x.id, titel: machineNaam(x),
          sub: [x.type?.naam, x.standplaats].filter(Boolean).join(' · '), groep: x.type?.naam ?? 'Overig', kleur: 'var(--kleur-primair)',
        })),
      ])
    })
  }, [locatie.id])

  // Afdrukken: alleen de vellen, A4 zonder marges.
  useEffect(() => {
    const html = document.documentElement
    html.classList.add('stickerdruk')
    const pagina = document.createElement('style')
    pagina.textContent = '@media print { @page { size: A4 portrait; margin: 0; } }'
    document.head.appendChild(pagina)
    return () => { html.classList.remove('stickerdruk'); pagina.remove() }
  }, [])

  const soort = weergave === 'machines' ? 'machine' : 'object'
  const groepen = useMemo(() => [...new Set((items ?? []).filter((i) => i.soort === soort).map((i) => i.groep))].sort(), [items, soort])
  const zichtbaar = (items ?? []).filter((i) => i.soort === soort && (!type || i.groep === type)
    && (!zoek || `${i.titel} ${i.sub}`.toLowerCase().includes(zoek.toLowerCase())))
  const alleGekozen = zichtbaar.length > 0 && zichtbaar.every((i) => gekozen.has(i.sleutel))

  function wissel(sleutels: string[], aan: boolean) {
    setGekozen((oud) => {
      const n = new Set(oud)
      sleutels.forEach((s) => (aan ? n.add(s) : n.delete(s)))
      return n
    })
  }

  // Stickers in volgorde, met lege plekken vooraan voor een deels gebruikt vel.
  const perVel = vel.kol * vel.rij
  const reeks: (Item | null)[] = [
    ...Array(Math.min(start - 1, perVel - 1)).fill(null),
    ...(items ?? []).filter((i) => gekozen.has(i.sleutel)).flatMap((i) => Array(aantal).fill(i)),
  ]
  const aantalStickers = reeks.filter(Boolean).length
  const vellenLijst = Array.from({ length: Math.max(1, Math.ceil(reeks.length / perVel)) }, (_, v) => reeks.slice(v * perVel, (v + 1) * perVel))

  if (!magStickers) return <Navigate to={`/locatie/${locatie.id}`} replace />

  return (
    <main className="breed">
      <PaginaKop titel="QR-stickers" telling={aantalStickers}
        sub="Voor op sprinklers, kleppen en machines. Scannen opent direct 'storing melden' voor dat ding.">
        <button className="knop" disabled={!aantalStickers} onClick={() => window.print()}>
          Afdrukken ({vellenLijst.length} {vellenLijst.length === 1 ? 'vel' : 'vellen'})
        </button>
      </PaginaKop>

      <div className="stickers">
        <div className="stickers-lijst">
          <Werkbalk>
            <Weergaven standaard="objecten" opties={[
              { waarde: 'objecten', naam: 'Installaties', telling: items?.filter((i) => i.soort === 'object').length },
              { waarde: 'machines', naam: 'Machines', telling: items?.filter((i) => i.soort === 'machine').length },
            ]} />
            <Zoekveld placeholder="Zoek op code, type of hole" />
            <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type" className="stickers-type">
              <option value="">Alle types</option>
              {groepen.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </Werkbalk>
          {items === null ? <p className="zacht">Laden…</p> : (
            <div className="stickers-tabel">
              <label className="stickers-rij kop">
                <input type="checkbox" checked={alleGekozen} onChange={(e) => wissel(zichtbaar.map((i) => i.sleutel), e.target.checked)} />
                <span>{alleGekozen ? 'Alles uit' : `Alle ${zichtbaar.length} kiezen`}</span>
              </label>
              {zichtbaar.map((i) => (
                <label key={i.sleutel} className="stickers-rij">
                  <input type="checkbox" checked={gekozen.has(i.sleutel)} onChange={(e) => wissel([i.sleutel], e.target.checked)} />
                  <strong className={i.soort === 'object' ? 'mono' : undefined}>{i.titel}</strong>
                  <span className="zacht">{i.sub}</span>
                </label>
              ))}
              {!zichtbaar.length && <p className="zacht">Niets gevonden.</p>}
            </div>
          )}
        </div>

        <div className="stickers-instellingen">
          <label>Etiketvel
            <select value={velSleutel} onChange={(e) => { setVelSleutel(e.target.value); setStart(1) }}>
              {vellen.map((v) => <option key={v.sleutel} value={v.sleutel}>{v.naam}</option>)}
            </select>
          </label>
          <div className="twee-kolommen">
            <label>Beginnen bij etiket
              <input type="number" min={1} max={perVel} value={start} onChange={(e) => setStart(Math.max(1, Math.min(perVel, Number(e.target.value) || 1)))} />
            </label>
            <label>Stickers per stuk
              <input type="number" min={1} max={10} value={aantal} onChange={(e) => setAantal(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} />
            </label>
          </div>
          <p className="zacht klein-tekst">Druk af op A4 met schaal 100% en zonder marges. Gebruik buiten weerbestendige etiketten (polyester of vinyl).</p>
          <div className="stickers-voorbeeld">
            <StickerVel vel={vel} stickers={vellenLijst[0]} baan={locatie.naam} />
          </div>
          {vellenLijst.length > 1 && <p className="zacht klein-tekst">Voorbeeld van vel 1 van {vellenLijst.length}.</p>}
        </div>
      </div>

      {createPortal(
        <div className="sticker-druk">{vellenLijst.map((s, i) => <StickerVel key={i} vel={vel} stickers={s} baan={locatie.naam} />)}</div>,
        document.body,
      )}
    </main>
  )
}

export function StickerVel({ vel, stickers, baan }: { vel: Vel; stickers: (Item | null)[]; baan: string }) {
  return (
    <div className="sticker-vel">
      {stickers.map((s, n) => {
        if (!s) return null
        const kol = n % vel.kol
        const rij = Math.floor(n / vel.kol)
        const stijl = {
          left: `${vel.links + kol * (vel.b + vel.tussenX)}mm`, top: `${vel.boven + rij * (vel.h + vel.tussenY)}mm`,
          width: `${vel.b}mm`, height: `${vel.h}mm`, '--q': vel.h / 37, '--k': Math.min(vel.h / 37, vel.b / 70), '--c': s.kleur,
        } as CSSProperties
        return (
          <div key={n} className="sticker" style={stijl}>
            <div className="sticker-kaart">
              <div className="sticker-band">
                <span>Storing? Scan en meld</span>
                <img src="/hgm-logo-wit.png" alt="HGM" />
              </div>
              <div className="sticker-lijf">
                <div className="sticker-qr"><QrCode tekst={`${appAdres}/${s.soort === 'object' ? 'o' : 'm'}/${s.id}`} /></div>
                <div className="sticker-tekst">
                  <strong className={s.soort === 'object' ? 'sticker-code mono' : 'sticker-code'}>{s.titel}</strong>
                  {s.sub && <span className="sticker-sub">{s.sub}</span>}
                  <span className="sticker-baan">{baan}</span>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// /o/:id en /m/:id (van een QR-sticker): zoek de baan op en open daar de meldflow.
export function NaarMelden({ soort }: { soort: 'object' | 'machine' }) {
  const { id } = useParams()
  const [doel, setDoel] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    const tabel = soort === 'object' ? 'objecten' : 'machines'
    supabase.from(tabel).select('locatie_id').eq('id', id!).maybeSingle().then(({ data }) => {
      if (!data) return setDoel(null)
      setDoel(soort === 'object'
        ? `/locatie/${data.locatie_id}?object=${id}&melden=1`
        : `/locatie/${data.locatie_id}/materieel/${id}?melden=1`)
    })
  }, [soort, id])
  if (doel === undefined) return <main className="zacht">Laden…</main>
  if (doel === null) return <main><div className="melding fout">Deze sticker hoort bij iets wat niet (meer) bestaat, of je hebt er geen toegang toe.</div></main>
  return <Navigate to={doel} replace />
}
