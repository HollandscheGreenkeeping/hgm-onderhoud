import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { datum } from '../lib/teksten'
import {
  bestelCode, bestelKlasse, bestelStatus, bestellingVelden, bestelTotaal, euro, useInkoopLocaties, useMagGoedkeuren,
  type BestelStatus, type Bestelling, type Leverancier,
} from '../lib/inkoop'

type Filter = 'beoordelen' | 'open' | 'afgerond' | 'alle'
const open: BestelStatus[] = ['aanvraag', 'goedgekeurd', 'besteld', 'deels_ontvangen']
const afgerond: BestelStatus[] = ['ontvangen', 'afgewezen', 'geannuleerd']

// Inkoop → Bestellingen. Beheer en onderhoudsmanager beginnen bij "Te beoordelen".
export default function Bestellingen() {
  const goedkeurder = useMagGoedkeuren()
  const locaties = useInkoopLocaties()
  const [filter, setFilter] = useState<Filter>(goedkeurder ? 'beoordelen' : 'open')
  const [locatie, setLocatie] = useState('')
  const [bestellingen, setBestellingen] = useState<Bestelling[] | null>(null)

  useEffect(() => {
    let q = supabase.from('bestellingen').select(bestellingVelden)
    if (filter === 'beoordelen') q = q.eq('status', 'aanvraag')
    if (filter === 'open') q = q.in('status', open)
    if (filter === 'afgerond') q = q.in('status', afgerond)
    if (locatie) q = q.eq('locatie_id', locatie)
    q.order('aangevraagd_op', { ascending: false }).limit(200)
      .then(({ data }) => setBestellingen((data ?? []) as unknown as Bestelling[]))
  }, [filter, locatie])

  return (
    <>
      <div className="kop-met-knop">
        <h1>Bestellingen</h1>
        <Link className="knop" to="/inkoop/bestellingen/nieuw">+ Bestelaanvraag</Link>
      </div>
      <div className="schakelaar filterbalk">
        {([...(goedkeurder ? [['beoordelen', 'Te beoordelen']] : []), ['open', 'Open'], ['afgerond', 'Afgerond'], ['alle', 'Alles']] as [Filter, string][])
          .map(([f, n]) => <button key={f} className={`knop ${filter === f ? '' : 'tweede'}`} onClick={() => setFilter(f)}>{n}</button>)}
      </div>
      {(locaties?.length ?? 0) > 1 && (
        <select aria-label="Locatie" value={locatie} onChange={(e) => setLocatie(e.target.value)}>
          <option value="">Alle locaties</option>
          {locaties!.map((l) => <option key={l.id} value={l.id}>{l.naam}</option>)}
        </select>
      )}
      {bestellingen === null && <p className="zacht">Laden…</p>}
      {bestellingen?.length === 0 && <p className="zacht">{filter === 'beoordelen' ? 'Niets te beoordelen.' : 'Geen bestellingen.'}</p>}
      <ul className="lijst">
        {bestellingen?.map((b) => (
          <li key={b.id}>
            <Link className="rij" to={`/inkoop/bestellingen/${b.id}`}>
              <span className="rij-hoofd">
                <span className="rij-id">{bestelCode(b)} · {b.locatie?.naam}</span>
                <span className={`label ${bestelKlasse(b.status)}`}>{bestelStatus[b.status]}</span>
              </span>
              <strong>{b.leverancier?.naam}: {b.regels.map((r) => r.product?.naam).join(', ') || 'nog geen regels'}</strong>
              <span className="rij-meta">
                <span>{b.aanvrager?.naam}</span>
                <span>·</span>
                <span>{euro(bestelTotaal(b))}</span>
                <span className="mono" style={{ marginLeft: 'auto' }}>{datum(b.aangevraagd_op)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

type Regel = { product_id: string; aantal: string }
type ProductKeuze = { id: string; naam: string; eenheid: string; prijs: number | null; leverancier_id: string | null }

// Inkoop → Bestelaanvraag: locatie, leverancier en regels (producten van die leverancier).
export function BestellingNieuw() {
  const navigeer = useNavigate()
  const [zoek] = useSearchParams()
  const locaties = useInkoopLocaties()
  const [leveranciers, setLeveranciers] = useState<Leverancier[]>([])
  const [producten, setProducten] = useState<ProductKeuze[]>([])
  const [locatie, setLocatie] = useState(zoek.get('locatie') ?? '')
  const [leverancier, setLeverancier] = useState('')
  const [gewenst, setGewenst] = useState('')
  const [toelichting, setToelichting] = useState('')
  const [regels, setRegels] = useState<Regel[]>([{ product_id: zoek.get('product') ?? '', aantal: '' }])
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('leveranciers').select('*').is('gearchiveerd_op', null).order('naam').then(({ data }) => setLeveranciers(data ?? []))
    supabase.from('producten').select('id, naam, eenheid, prijs, leverancier_id').is('gearchiveerd_op', null).order('naam')
      .then(({ data }) => {
        setProducten(data ?? [])
        const vooraf = (data ?? []).find((p) => p.id === zoek.get('product'))
        if (vooraf?.leverancier_id) setLeverancier(vooraf.leverancier_id)
      })
  }, [zoek])
  useEffect(() => { if (!locatie && locaties?.length === 1) setLocatie(locaties[0].id) }, [locaties, locatie])

  const keuze = producten.filter((p) => !leverancier || p.leverancier_id === leverancier || !p.leverancier_id)
  const zet = (i: number, v: Partial<Regel>) => setRegels(regels.map((r, j) => (j === i ? { ...r, ...v } : r)))
  const totaal = regels.reduce((t, r) => t + Number(r.aantal.replace(',', '.') || 0) * Number(producten.find((p) => p.id === r.product_id)?.prijs ?? 0), 0)

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    const geldig = regels.filter((r) => r.product_id && Number(r.aantal.replace(',', '.')) > 0)
    if (!geldig.length) return setFout('Voeg minstens één product met een aantal toe.')
    setBezig(true)
    setFout(null)
    const { data, error } = await supabase.from('bestellingen')
      .insert({ locatie_id: locatie, leverancier_id: leverancier, gewenst_op: gewenst || null, toelichting: toelichting || null })
      .select('id').single()
    if (error || !data) { setBezig(false); return setFout('Aanvragen mislukt.') }
    const { error: fr } = await supabase.from('bestelregels')
      .insert(geldig.map((r) => ({ bestelling_id: data.id, product_id: r.product_id, aantal: Number(r.aantal.replace(',', '.')) })))
    setBezig(false)
    if (fr) return setFout('De aanvraag is aangemaakt, maar de regels niet. Voeg ze toe in de bestelling.')
    navigeer(`/inkoop/bestellingen/${data.id}`)
  }

  return (
    <>
      <p><Link to="/inkoop/bestellingen">← Alle bestellingen</Link></p>
      <form className="kaart" onSubmit={opslaan}>
        <h1>Bestelaanvraag</h1>
        <div className="twee-kolommen">
          <div>
            <label htmlFor="b-locatie">Voor</label>
            <select id="b-locatie" required value={locatie} onChange={(e) => setLocatie(e.target.value)}>
              <option value="">— kies locatie —</option>
              {locaties?.map((l) => <option key={l.id} value={l.id}>{l.naam}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="b-leverancier">Leverancier</label>
            <select id="b-leverancier" required value={leverancier} onChange={(e) => setLeverancier(e.target.value)}>
              <option value="">{leveranciers.length ? '— kies leverancier —' : '(nog geen leveranciers)'}</option>
              {leveranciers.map((l) => <option key={l.id} value={l.id}>{l.naam}</option>)}
            </select>
          </div>
        </div>
        <span className="veldlabel">Wat</span>
        {regels.map((r, i) => {
          const p = producten.find((x) => x.id === r.product_id)
          return (
            <div key={i} className="lus-rij">
              <select aria-label="Product" value={r.product_id} onChange={(e) => zet(i, { product_id: e.target.value })}>
                <option value="">— kies product —</option>
                {keuze.map((x) => <option key={x.id} value={x.id}>{x.naam}{x.prijs != null ? ` (${euro(x.prijs)}/${x.eenheid})` : ''}</option>)}
              </select>
              <input aria-label="Aantal" inputMode="decimal" className="smal" placeholder="Aantal" value={r.aantal}
                     onChange={(e) => zet(i, { aantal: e.target.value })} />
              <span className="zacht">{p?.eenheid}</span>
              {regels.length > 1 && <button type="button" className="knop tweede klein" onClick={() => setRegels(regels.filter((_, j) => j !== i))}>Weg</button>}
            </div>
          )
        })}
        <button type="button" className="knop tweede klein" onClick={() => setRegels([...regels, { product_id: '', aantal: '' }])}>+ Regel</button>
        {totaal > 0 && <p><strong>Totaal {euro(totaal)}</strong> <span className="zacht">excl. btw</span></p>}
        <div className="twee-kolommen">
          <div>
            <label htmlFor="b-gewenst">Graag binnen op</label>
            <input id="b-gewenst" type="date" value={gewenst} onChange={(e) => setGewenst(e.target.value)} />
          </div>
          <div>
            <label htmlFor="b-toelichting">Toelichting</label>
            <input id="b-toelichting" value={toelichting} onChange={(e) => setToelichting(e.target.value)} placeholder="Waarvoor, waarom nu" />
          </div>
        </div>
        <p className="zacht klein-tekst">De onderhoudsmanager keurt de aanvraag goed; daarna gaat de bestelling naar de leverancier.</p>
        {fout && <div className="melding fout">{fout}</div>}
        <div className="actiebalk">
          <button className="knop" disabled={bezig}>{bezig ? 'Bezig…' : 'Aanvraag versturen'}</button>
          <button type="button" className="knop tweede" onClick={() => navigeer('/inkoop/bestellingen')}>Annuleren</button>
        </div>
      </form>
    </>
  )
}
