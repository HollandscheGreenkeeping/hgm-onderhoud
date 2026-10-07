import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { datum } from '../lib/teksten'
import { Chip, DataTabel, FilterKeuze, PaginaKop, useUrlParam, useZoekfilter, Weergaven, Werkbalk, Zoekveld, type Kolom } from '../components/tabel'
import {
  bestelCode, bestelKlasse, bestelStatus, bestellingVelden, bestelTotaal, euro, useInkoopLocaties, useMagGoedkeuren,
  type BestelStatus, type Bestelling, type Leverancier,
} from '../lib/inkoop'

type Filter = 'beoordelen' | 'open' | 'afgerond' | 'alle'
const open: BestelStatus[] = ['aanvraag', 'goedgekeurd', 'besteld', 'deels_ontvangen']
const afgerond: BestelStatus[] = ['ontvangen', 'afgewezen', 'geannuleerd']

// Inkoop → Bestellingen. Weergave, locatie en zoekterm in de URL; elke bestelling opent een eigen pagina.
// Beheer en onderhoudsmanager beginnen bij "Te beoordelen".
export default function Bestellingen() {
  const goedkeurder = useMagGoedkeuren()
  const locaties = useInkoopLocaties()
  const [filterTekst] = useUrlParam('weergave', goedkeurder ? 'beoordelen' : 'open')
  const filter = filterTekst as Filter
  const [locatie] = useUrlParam('locatie')
  const [bestellingen, setBestellingen] = useState<Bestelling[] | null>(null)

  useEffect(() => {
    setBestellingen(null)
    let q = supabase.from('bestellingen').select(bestellingVelden)
    if (filter === 'beoordelen') q = q.eq('status', 'aanvraag')
    if (filter === 'open') q = q.in('status', open)
    if (filter === 'afgerond') q = q.in('status', afgerond)
    if (locatie) q = q.eq('locatie_id', locatie)
    q.order('aangevraagd_op', { ascending: false }).limit(300)
      .then(({ data }) => setBestellingen((data ?? []) as unknown as Bestelling[]))
  }, [filter, locatie])

  const rijen = useZoekfilter(bestellingen, (b) => [bestelCode(b), b.leverancier?.naam, b.locatie?.naam, b.aanvrager?.naam, ...b.regels.map((r) => r.product?.naam)])
  const kolommen: Kolom<Bestelling>[] = [
    { sleutel: 'leverancier', kop: 'Bestelling', sorteer: (b) => b.leverancier?.naam ?? '', cel: (b) => (
      <>{b.leverancier?.naam}<span className="sub">{b.regels.map((r) => r.product?.naam).join(', ') || 'Nog geen regels'}</span></>
    ) },
    { sleutel: 'nummer', kop: 'Nummer', klasse: 'mono smal', sorteer: (b) => b.nummer, cel: bestelCode },
    { sleutel: 'voor', kop: 'Voor', sorteer: (b) => b.locatie?.naam ?? '', cel: (b) => b.locatie?.naam },
    { sleutel: 'aanvrager', kop: 'Aanvrager', sorteer: (b) => b.aanvrager?.naam ?? '', cel: (b) => b.aanvrager?.naam },
    { sleutel: 'totaal', kop: 'Totaal', klasse: 'mono rechts smal', sorteer: bestelTotaal, cel: (b) => euro(bestelTotaal(b)) },
    { sleutel: 'datum', kop: 'Aangevraagd', klasse: 'mono smal', sorteer: (b) => b.aangevraagd_op, cel: (b) => datum(b.aangevraagd_op) },
    { sleutel: 'status', kop: 'Status', sorteer: (b) => b.status, cel: (b) => <Chip klasse={bestelKlasse(b.status)}>{bestelStatus[b.status]}</Chip> },
  ]

  return (
    <>
      <PaginaKop titel="Bestellingen" telling={rijen?.length}>
        <Link className="knop" to="/inkoop/bestellingen/nieuw">Bestelaanvraag</Link>
      </PaginaKop>
      <Werkbalk>
        <Weergaven standaard={goedkeurder ? 'beoordelen' : 'open'} opties={[
          ...(goedkeurder ? [{ waarde: 'beoordelen', naam: 'Te beoordelen' }] : []),
          { waarde: 'open', naam: 'Open' }, { waarde: 'afgerond', naam: 'Afgerond' }, { waarde: 'alle', naam: 'Alles' },
        ]} />
        <Zoekveld placeholder="Zoek nummer, leverancier of product" />
        {(locaties?.length ?? 0) > 1 && <FilterKeuze param="locatie" label="Locatie" opties={locaties!.map((l) => [l.id, l.naam])} />}
      </Werkbalk>
      <DataTabel kolommen={kolommen} rijen={rijen} sleutel={(b) => b.id} naar={(b) => `/inkoop/bestellingen/${b.id}`}
                 leeg={filter === 'beoordelen' ? 'Niets te beoordelen.' : 'Geen bestellingen in deze weergave.'} />
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
