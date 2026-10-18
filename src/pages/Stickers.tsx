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

// Etiketvellen met een weerbestendige (polyester) Avery-variant voor buiten en een papieren voor binnen.
// Layouts: standaard A4-indelingen van Avery, etiketten gecentreerd met 2,54 mm tussenruimte.
export type Vel = {
  sleutel: string; naam: string; buiten: string; binnen?: string
  b: number; h: number; kol: number; rij: number; boven: number; links: number; tussenX: number; tussenY: number
  rond?: boolean   // rond etiket: alleen logo, QR-code en code (voor sprinklers en deksels)
}
export const vellen: Vel[] = [
  { sleutel: 'rond40', naam: 'Rond Ø 40 mm · 24 per vel (sprinklers)', buiten: 'Avery Heavy Duty rond Ø 40 mm (polyester)', binnen: 'Avery L3415',
    b: 40, h: 40, kol: 4, rij: 6, boven: 16, links: 17.5, tussenX: 5, tussenY: 5, rond: true },
  { sleutel: 'rond60', naam: 'Rond Ø 60 mm · 12 per vel', buiten: 'Avery Heavy Duty rond Ø 60 mm (polyester)', binnen: 'Avery L3416',
    b: 60, h: 60, kol: 3, rij: 4, boven: 25.5, links: 13, tussenX: 2, tussenY: 2, rond: true },
  { sleutel: '70x37', naam: '70 × 37 mm · 24 per vel', buiten: 'Avery Zweckform L4718-20', binnen: 'Avery 3474',
    b: 70, h: 37, kol: 3, rij: 8, boven: 0.5, links: 0, tussenX: 0, tussenY: 0 },
  { sleutel: '63x38', naam: '63,5 × 38,1 mm · 21 per vel', buiten: 'Avery L7060-20', binnen: 'Avery L7160',
    b: 63.5, h: 38.1, kol: 3, rij: 7, boven: 15.15, links: 7.21, tussenX: 2.54, tussenY: 0 },
  { sleutel: '63x34', naam: '63,5 × 33,9 mm · 24 per vel (klein, voor deksels)', buiten: 'Avery L4773-20', binnen: 'Avery L7159',
    b: 63.5, h: 33.9, kol: 3, rij: 8, boven: 12.9, links: 7.21, tussenX: 2.54, tussenY: 0 },
  { sleutel: '99x42', naam: '99,1 × 42,3 mm · 12 per vel (machines)', buiten: 'Avery L4776-20',
    b: 99.1, h: 42.3, kol: 2, rij: 6, boven: 21.6, links: 4.63, tussenX: 2.54, tussenY: 0 },
  { sleutel: '99x57', naam: '99,1 × 57 mm · 10 per vel (groot, machines)', buiten: 'Avery L7992-25', binnen: 'Avery L7173',
    b: 99.1, h: 57, kol: 2, rij: 5, boven: 6, links: 4.63, tussenX: 2.54, tussenY: 0 },
]

export type Item = { sleutel: string; soort: 'object' | 'machine'; id: string; titel: string; sub: string; groep: string; kleur: string }

// Voetbalk in de kleur van de categorie, net als op de kaart; machines in grasgroen (de sticker zelf is olijf).
const kleurVan = (categorie?: string | null) =>
  ['beregening', 'drainage', 'kabel'].includes(categorie ?? '') ? `var(--kleur-${categorie})` : 'var(--kleur-overig)'

export default function Stickers() {
  const { locatie, rol, magPlannen } = useLocatie()
  const [items, setItems] = useState<Item[] | null>(null)
  const [weergave] = useUrlParam('weergave', 'objecten')
  const [zoek] = useUrlParam('q')
  const [type, setType] = useState('')
  const [gekozen, setGekozen] = useState<Set<string>>(new Set())
  // Installaties (sprinklers, kleppen) standaard op een rond etiket, machines op een rechthoekig.
  const [velSleutel, setVelSleutel] = useState(weergave === 'machines' ? '70x37' : 'rond40')
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
          sub: [x.type?.naam, x.standplaats].filter(Boolean).join(' · '), groep: x.type?.naam ?? 'Overig', kleur: 'var(--kleur-secundair)',
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
          <p className="stickers-koop">
            <strong>Buiten:</strong> {vel.buiten} (weerbestendig polyester, laserprinter)
            {vel.binnen && <><br /><strong>Binnen:</strong> {vel.binnen} (papier)</>}
          </p>
          <p className="zacht klein-tekst">Druk af op A4 met schaal 100% en zonder marges. Doe eerst een proef op gewoon papier en leg die tegen het etiketvel.</p>
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
        const qr = <QrCode tekst={`${appAdres}/${s.soort === 'object' ? 'o' : 'm'}/${s.id}`} />
        if (vel.rond) return (
          <div key={n} className="sticker rond" style={{ ...stijl, '--d': `${vel.b}mm` } as CSSProperties}>
            <img src="/hgm-logo-wit.png" alt="HGM" />
            <div className="sticker-qr">{qr}</div>
            <strong className="mono">{s.titel}</strong>
          </div>
        )
        return (
          <div key={n} className="sticker" style={stijl}>
            <div className="sticker-kaart">
              <div className="sticker-lijf">
                <div className="sticker-qr">{qr}</div>
                <div className="sticker-tekst">
                  <strong className={s.soort === 'object' && s.titel.length <= 8 ? 'sticker-code mono' : 'sticker-code'}>{s.titel}</strong>
                  {s.sub && <span className="sticker-sub">{s.sub}</span>}
                  <div className="sticker-voet"><span>{baan}</span><img src="/hgm-logo-wit.png" alt="HGM" /></div>
                </div>
              </div>
              <div className="sticker-band"><b>Storing? Scan en meld</b><span>HGM Onderhoud</span></div>
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
