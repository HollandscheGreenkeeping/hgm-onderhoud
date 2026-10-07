import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { DataTabel, FilterKeuze, PaginaKop, useUrlParam, useZoekfilter, Weergaven, Werkbalk, Zoekveld, type Kolom } from '../components/tabel'
import { categorieNamen, euro, productVelden, useMagGoedkeuren, type Leverancier, type Product, type ProductCategorie } from '../lib/inkoop'

// Inkoop → Producten: de catalogus. Beheer en onderhoudsmanager beheren hem, de rest kijkt mee.
// Koppel een meststof of gewasbeschermingsmiddel aan het middel uit de keuzelijst; dan boekt
// het middelengebruik bij uitgevoerd werk automatisch af van de voorraad van de baan.
export default function Producten() {
  const beheerder = useMagGoedkeuren()
  const [producten, setProducten] = useState<Product[] | null>(null)
  const [categorie] = useUrlParam('soort')
  const [weergave] = useUrlParam('weergave', 'gebruik')
  const [bewerk, zetBewerk] = useUrlParam('bewerk')

  const laad = useCallback(() => {
    setProducten(null)
    let q = supabase.from('producten').select(productVelden).order('naam')
    q = weergave === 'archief' ? q.not('gearchiveerd_op', 'is', null) : q.is('gearchiveerd_op', null)
    if (categorie) q = q.eq('categorie', categorie)
    q.then(({ data }) => setProducten((data ?? []) as unknown as Product[]))
  }, [categorie, weergave])
  useEffect(laad, [laad])

  const rijen = useZoekfilter(producten, (p) => [p.naam, p.artikelnummer, p.leverancier?.naam, p.ctgb_nummer, p.middel?.naam])
  const bewerkt = bewerk && bewerk !== 'nieuw' ? producten?.find((p) => p.id === bewerk) : undefined
  const kolommen: Kolom<Product>[] = [
    { sleutel: 'naam', kop: 'Product', sorteer: (p) => p.naam, cel: (p) => <>{p.naam}{p.middel && <span className="sub">Boekt af bij middel {p.middel.naam}</span>}</> },
    { sleutel: 'soort', kop: 'Soort', sorteer: (p) => categorieNamen[p.categorie], cel: (p) => categorieNamen[p.categorie] },
    { sleutel: 'leverancier', kop: 'Leverancier', sorteer: (p) => p.leverancier?.naam ?? '', cel: (p) => p.leverancier?.naam ?? '–' },
    { sleutel: 'art', kop: 'Art.nr.', klasse: 'mono', sorteer: (p) => p.artikelnummer ?? '', cel: (p) => p.artikelnummer ?? '–' },
    { sleutel: 'ctgb', kop: 'Ctgb', klasse: 'mono', cel: (p) => p.ctgb_nummer ?? '–' },
    { sleutel: 'prijs', kop: 'Prijs', klasse: 'mono rechts smal', sorteer: (p) => p.prijs, cel: (p) => (p.prijs != null ? `${euro(p.prijs)} / ${p.eenheid}` : '–') },
  ]

  return (
    <>
      <PaginaKop titel="Producten" telling={rijen?.length}>
        {beheerder && !bewerk && <button className="knop" onClick={() => zetBewerk('nieuw')}>Product toevoegen</button>}
      </PaginaKop>
      {beheerder && (bewerk === 'nieuw' || bewerkt) && (
        <>
          <ProductFormulier key={bewerk} product={bewerkt} klaar={() => { zetBewerk(''); laad() }} annuleer={() => zetBewerk('')} />
          {bewerkt && (
            <p><button className="knop tweede klein" onClick={async () => {
              await supabase.from('producten').update({ gearchiveerd_op: bewerkt.gearchiveerd_op ? null : new Date().toISOString() }).eq('id', bewerkt.id)
              zetBewerk(''); laad()
            }}>{bewerkt.gearchiveerd_op ? 'Terugzetten' : 'Product archiveren'}</button></p>
          )}
        </>
      )}
      <Werkbalk>
        <Weergaven standaard="gebruik" opties={[{ waarde: 'gebruik', naam: 'In gebruik' }, { waarde: 'archief', naam: 'Gearchiveerd' }]} />
        <Zoekveld placeholder="Zoek naam, artikelnummer of Ctgb" />
        <FilterKeuze param="soort" label="Soort" opties={Object.entries(categorieNamen) as [ProductCategorie, string][]} />
      </Werkbalk>
      <DataTabel kolommen={kolommen} rijen={rijen} sleutel={(p) => p.id} naar={beheerder ? (p) => `/inkoop/producten?bewerk=${p.id}` : undefined}
                 leeg="Geen producten." />
    </>
  )
}

function ProductFormulier({ product, klaar, annuleer }: { product?: Product; klaar: () => void; annuleer: () => void }) {
  const [leveranciers, setLeveranciers] = useState<Leverancier[]>([])
  const [middelen, setMiddelen] = useState<{ id: string; naam: string; eenheid: string | null }[]>([])
  const [v, setV] = useState({
    naam: product?.naam ?? '', categorie: product?.categorie ?? 'meststof' as ProductCategorie,
    leverancier_id: product?.leverancier_id ?? '', artikelnummer: product?.artikelnummer ?? '', eenheid: product?.eenheid ?? '',
    prijs: product?.prijs != null ? String(product.prijs) : '', ctgb_nummer: product?.ctgb_nummer ?? '',
    middel_id: product?.middel_id ?? '', opmerking: product?.opmerking ?? '',
  })
  const [fout, setFout] = useState<string | null>(null)
  const zet = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  const middelSoort = v.categorie === 'meststof' || v.categorie === 'gewasbescherming' || v.categorie === 'graszaad' || v.categorie === 'zand'

  useEffect(() => {
    supabase.from('leveranciers').select('*').is('gearchiveerd_op', null).order('naam').then(({ data }) => setLeveranciers(data ?? []))
    supabase.from('keuzelijst_waarden').select('id, naam, eenheid').eq('lijst', 'middel').eq('gearchiveerd', false).order('naam')
      .then(({ data }) => setMiddelen(data ?? []))
  }, [])

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    const velden = {
      naam: v.naam, categorie: v.categorie, leverancier_id: v.leverancier_id || null, artikelnummer: v.artikelnummer || null,
      eenheid: v.eenheid, prijs: v.prijs ? Number(v.prijs.replace(',', '.')) : null,
      ctgb_nummer: v.categorie === 'gewasbescherming' ? v.ctgb_nummer || null : null,
      middel_id: middelSoort ? v.middel_id || null : null, opmerking: v.opmerking || null,
    }
    const { error } = product
      ? await supabase.from('producten').update(velden).eq('id', product.id)
      : await supabase.from('producten').insert(velden)
    if (error) return setFout(error.code === '23505' ? 'Er is al een product gekoppeld aan dit middel.' : 'Opslaan mislukt.')
    klaar()
  }

  return (
    <form className="kaart" onSubmit={opslaan}>
      <h2>{product ? 'Product bewerken' : 'Nieuw product'}</h2>
      <label htmlFor="p-naam">Naam</label>
      <input id="p-naam" required value={v.naam} onChange={zet('naam')} placeholder="Bijv. Greenmaster 25 kg of Bovenmes Toro 3250" />
      <div className="twee-kolommen">
        <div>
          <label htmlFor="p-cat">Soort</label>
          <select id="p-cat" value={v.categorie} onChange={zet('categorie')}>
            {Object.entries(categorieNamen).map(([w, n]) => <option key={w} value={w}>{n}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="p-lev">Leverancier</label>
          <select id="p-lev" value={v.leverancier_id} onChange={zet('leverancier_id')}>
            <option value="">— geen vaste —</option>
            {leveranciers.map((l) => <option key={l.id} value={l.id}>{l.naam}</option>)}
          </select>
        </div>
        <div><label htmlFor="p-art">Artikelnummer</label><input id="p-art" value={v.artikelnummer} onChange={zet('artikelnummer')} /></div>
        <div><label htmlFor="p-eenheid">Eenheid</label><input id="p-eenheid" required value={v.eenheid} onChange={zet('eenheid')} placeholder="kg, l, st, zak" /></div>
        <div><label htmlFor="p-prijs">Prijs per eenheid (€, excl. btw)</label><input id="p-prijs" inputMode="decimal" value={v.prijs} onChange={zet('prijs')} /></div>
        {v.categorie === 'gewasbescherming' && (
          <div><label htmlFor="p-ctgb">Ctgb-toelatingsnummer</label><input id="p-ctgb" value={v.ctgb_nummer} onChange={zet('ctgb_nummer')} /></div>
        )}
      </div>
      {middelSoort && (
        <>
          <label htmlFor="p-middel">Gekoppeld middel (voor automatisch afboeken)</label>
          <select id="p-middel" value={v.middel_id} onChange={(e) => {
            const m = middelen.find((x) => x.id === e.target.value)
            setV({ ...v, middel_id: e.target.value, eenheid: v.eenheid || m?.eenheid || '' })
          }}>
            <option value="">— niet koppelen —</option>
            {middelen.map((m) => <option key={m.id} value={m.id}>{m.naam}{m.eenheid ? ` (${m.eenheid})` : ''}</option>)}
          </select>
          <p className="zacht klein-tekst">Gebruik dezelfde eenheid als het middel: het geregistreerde totaal gaat 1-op-1 van de voorraad af.</p>
        </>
      )}
      <label htmlFor="p-opm">Opmerking</label>
      <input id="p-opm" value={v.opmerking} onChange={zet('opmerking')} placeholder="Houdbaarheid, opslag, verpakking" />
      {fout && <div className="melding fout">{fout}</div>}
      <div className="knoppenrij">
        <button className="knop">Opslaan</button>
        <button type="button" className="knop tweede" onClick={annuleer}>Annuleren</button>
      </div>
    </form>
  )
}
