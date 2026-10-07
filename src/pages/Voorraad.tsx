import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { datum, datumTijd } from '../lib/teksten'
import { categorieNamen, euro, getal, useInkoopLocaties, type ProductCategorie } from '../lib/inkoop'

type Stand = { product_id: string; stand: number; minimum: number | null; onder_minimum: boolean }
type ProductInfo = { id: string; naam: string; categorie: ProductCategorie; eenheid: string; prijs: number | null }
type Mutatie = {
  id: string; product_id: string; aantal: number; soort: 'ontvangst' | 'verbruik' | 'correctie'; bron_tabel: string | null
  houdbaar_tot: string | null; notitie: string | null; op: string; door: { naam: string | null } | null
}

const bronTekst: Record<string, string> = {
  bestelregels: 'bestelling', middelen_gebruik: 'werk op de baan', werkorder_regels: 'werkorder',
}

// Inkoop → Voorraad per locatie (baan of werkplaats): stand, minimum, correcties en mutaties.
// Verbruik boekt de app zelf af: middelen via uitgevoerd werk, onderdelen via werkorders.
export default function Voorraad() {
  const [zoek, setZoek] = useSearchParams()
  const locaties = useInkoopLocaties()
  const locatie = zoek.get('locatie') ?? locaties?.[0]?.id ?? ''
  const [standen, setStanden] = useState<Stand[]>([])
  const [producten, setProducten] = useState<ProductInfo[]>([])
  const [mutaties, setMutaties] = useState<Mutatie[]>([])
  const [alleenTekort, setAlleenTekort] = useState(false)
  const [correctie, setCorrectie] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  const laad = useCallback(async () => {
    if (!locatie) return
    const [v, p, m] = await Promise.all([
      supabase.from('voorraad').select('product_id, stand, minimum, onder_minimum').eq('locatie_id', locatie),
      supabase.from('producten').select('id, naam, categorie, eenheid, prijs').is('gearchiveerd_op', null).order('naam'),
      supabase.from('voorraadmutaties').select('id, product_id, aantal, soort, bron_tabel, houdbaar_tot, notitie, op, door:profielen(naam)')
        .eq('locatie_id', locatie).order('op', { ascending: false }).limit(40),
    ])
    setStanden(v.data ?? [])
    setProducten(p.data ?? [])
    setMutaties((m.data ?? []) as unknown as Mutatie[])
  }, [locatie])
  useEffect(() => { laad() }, [laad])

  async function minimumZetten(productId: string, waarde: string) {
    const n = Number(waarde.replace(',', '.'))
    const { error } = waarde.trim() === ''
      ? await supabase.from('voorraad_minimum').delete().eq('locatie_id', locatie).eq('product_id', productId)
      : await supabase.from('voorraad_minimum').upsert({ locatie_id: locatie, product_id: productId, minimum: n })
    if (error) setFout('Minimum opslaan mislukt.')
    laad()
  }

  const product = (id: string) => producten.find((p) => p.id === id)
  const rijen = standen
    .filter((s) => product(s.product_id) && (!alleenTekort || s.onder_minimum))
    .sort((a, b) => Number(b.onder_minimum) - Number(a.onder_minimum) || product(a.product_id)!.naam.localeCompare(product(b.product_id)!.naam))
  const tekort = standen.filter((s) => s.onder_minimum).length
  const waarde = standen.reduce((t, s) => t + Math.max(0, Number(s.stand)) * Number(product(s.product_id)?.prijs ?? 0), 0)
  const bijnaOver = mutaties.filter((m) => m.houdbaar_tot && m.houdbaar_tot <= new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10))

  return (
    <>
      <div className="kop-met-knop">
        <h1>Voorraad</h1>
        {!correctie && locatie && <button className="knop tweede" onClick={() => setCorrectie(true)}>Correctie of beginvoorraad</button>}
      </div>
      <select aria-label="Locatie" value={locatie} onChange={(e) => setZoek({ locatie: e.target.value })}>
        {locaties?.map((l) => <option key={l.id} value={l.id}>{l.naam}{l.soort === 'werkplaats' ? ' (onderdelen)' : ''}</option>)}
      </select>
      {fout && <div className="melding fout">{fout}</div>}
      {correctie && (
        <Correctie locatieId={locatie} producten={producten} klaar={() => { setCorrectie(false); laad() }} annuleer={() => setCorrectie(false)} />
      )}

      {tekort > 0 && (
        <div className="melding fout">
          {tekort} {tekort === 1 ? 'product is' : 'producten zijn'} onder het minimum.{' '}
          <Link to={`/inkoop/bestellingen/nieuw?locatie=${locatie}`}>Bestelaanvraag doen</Link>
        </div>
      )}
      {bijnaOver.length > 0 && (
        <div className="melding info">
          Houdbaarheid: {bijnaOver.map((m) => `${product(m.product_id)?.naam} (tot ${datum(m.houdbaar_tot)})`).join(', ')}.
        </div>
      )}

      <div className="schakelaar filterbalk">
        <button className={`knop ${alleenTekort ? 'tweede' : ''}`} onClick={() => setAlleenTekort(false)}>Alles</button>
        <button className={`knop ${alleenTekort ? '' : 'tweede'}`} onClick={() => setAlleenTekort(true)}>Onder minimum ({tekort})</button>
      </div>
      {rijen.length === 0 && <p className="zacht">{alleenTekort ? 'Niets onder het minimum.' : 'Nog geen voorraad op deze locatie.'}</p>}
      {rijen.length > 0 && (
        <div className="tabel-wrap">
          <table className="tabel">
            <thead><tr><th>Product</th><th>Soort</th><th>Voorraad</th><th>Minimum</th><th>Waarde</th><th /></tr></thead>
            <tbody>
              {rijen.map((s) => {
                const p = product(s.product_id)!
                return (
                  <tr key={s.product_id}>
                    <td>{p.naam}</td>
                    <td>{categorieNamen[p.categorie]}</td>
                    <td className={s.onder_minimum ? 'rood' : ''}>{getal(s.stand)} {p.eenheid}</td>
                    <td>
                      <input aria-label={`Minimum ${p.naam}`} inputMode="decimal" className="smal" defaultValue={s.minimum ?? ''}
                             onBlur={(e) => e.target.value !== String(s.minimum ?? '') && minimumZetten(p.id, e.target.value)} />
                    </td>
                    <td>{p.prijs != null ? euro(Math.max(0, s.stand) * p.prijs) : '–'}</td>
                    <td>{s.onder_minimum && <Link to={`/inkoop/bestellingen/nieuw?locatie=${locatie}&product=${p.id}`}>Bestellen</Link>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {waarde > 0 && <p className="zacht">Voorraadwaarde {euro(waarde)} (catalogusprijs, excl. btw)</p>}

      <section>
        <h2>Laatste mutaties</h2>
        {mutaties.length === 0 && <p className="zacht">Nog geen mutaties.</p>}
        <ul className="lijst compact">
          {mutaties.map((m) => (
            <li key={m.id} className="lus-rij">
              <span className="mono">{datumTijd(m.op)}</span>
              <strong className={m.aantal < 0 ? 'rood' : ''}>{m.aantal > 0 ? '+' : ''}{getal(m.aantal)} {product(m.product_id)?.eenheid}</strong>
              <span>{product(m.product_id)?.naam ?? 'Product'}</span>
              <span className="zacht">
                {m.soort}{m.bron_tabel ? ` · ${bronTekst[m.bron_tabel]}` : ''}{m.door?.naam ? ` · ${m.door.naam}` : ''}{m.notitie ? ` · ${m.notitie}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function Correctie({ locatieId, producten, klaar, annuleer }: {
  locatieId: string; producten: ProductInfo[]; klaar: () => void; annuleer: () => void
}) {
  const [product, setProduct] = useState('')
  const [aantal, setAantal] = useState('')
  const [notitie, setNotitie] = useState('')
  const [fout, setFout] = useState<string | null>(null)

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    const n = Number(aantal.replace(',', '.'))
    if (!n) return setFout('Vul een aantal in: positief erbij, negatief eraf.')
    const { error } = await supabase.from('voorraadmutaties').insert({
      locatie_id: locatieId, product_id: product, aantal: n, soort: 'correctie', notitie: notitie || null,
    })
    if (error) return setFout('Opslaan mislukt.')
    klaar()
  }

  return (
    <form className="kaart" onSubmit={opslaan}>
      <h2>Correctie of beginvoorraad</h2>
      <p className="zacht">Na een telling, breuk of verlopen partij. Positief telt op, negatief trekt af.</p>
      <select aria-label="Product" required value={product} onChange={(e) => setProduct(e.target.value)}>
        <option value="">— kies product —</option>
        {producten.map((p) => <option key={p.id} value={p.id}>{p.naam} ({p.eenheid})</option>)}
      </select>
      <div className="twee-kolommen">
        <input aria-label="Aantal" inputMode="decimal" placeholder="Aantal, bijv. 10 of -2" required value={aantal} onChange={(e) => setAantal(e.target.value)} />
        <input aria-label="Notitie" placeholder="Reden, bijv. telling 1 oktober" value={notitie} onChange={(e) => setNotitie(e.target.value)} />
      </div>
      {fout && <div className="melding fout">{fout}</div>}
      <div className="knoppenrij">
        <button className="knop">Boeken</button>
        <button type="button" className="knop tweede" onClick={annuleer}>Annuleren</button>
      </div>
    </form>
  )
}
