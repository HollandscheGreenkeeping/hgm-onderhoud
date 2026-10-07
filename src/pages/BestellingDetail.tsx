import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { useSessie } from '../lib/sessie'
import { datum, datumTijd } from '../lib/teksten'
import {
  bestelCode, bestelKlasse, bestelStatus, bestellingVelden, bestelTotaal, euro, getal, regelTotaal, useMagGoedkeuren,
  type Bestelling, type Bestelregel,
} from '../lib/inkoop'

// Inkoop → bestelling: beoordelen, bestellen (bestelbon als PDF of e-mail), ontvangst boeken.
export default function BestellingDetail() {
  const { bestellingId } = useParams()
  const { sessie } = useSessie()
  const goedkeurder = useMagGoedkeuren()
  const [b, setB] = useState<Bestelling | null>(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)

  const laad = useCallback(async () => {
    const { data, error } = await supabase.from('bestellingen').select(bestellingVelden).eq('id', bestellingId!).single()
    if (error) return setFout('Deze bestelling bestaat niet of je hebt geen toegang.')
    setB(data as unknown as Bestelling)
  }, [bestellingId])
  useEffect(() => { laad() }, [laad])

  async function status(velden: Record<string, unknown>, tekst?: string) {
    setBezig(true)
    setFout(null)
    const { error } = await supabase.from('bestellingen').update(velden).eq('id', bestellingId!)
    setBezig(false)
    if (error) return setFout(error.message.includes('Alleen') || error.message.includes('eerst') ? error.message : 'Opslaan mislukt.')
    if (tekst) setMelding(tekst)
    laad()
  }

  async function afwijzen() {
    const reden = window.prompt('Waarom afwijzen? (de aanvrager ziet dit)')
    if (reden === null) return
    status({ status: 'afgewezen', beoordeling: reden || null }, 'Aanvraag afgewezen.')
  }

  if (fout && !b) return <div className="melding fout">{fout}</div>
  if (!b) return <p className="zacht">Laden…</p>

  const eigen = b.aangevraagd_door === sessie?.user.id
  const lev = b.leverancier
  const mailtekst = [
    `Beste ${lev?.contactpersoon ?? lev?.naam ?? ''},`, '',
    `Graag bestellen wij (bestelling ${bestelCode(b)}${lev?.klantnummer ? `, klantnummer ${lev.klantnummer}` : ''}):`, '',
    ...b.regels.map((r) => `- ${getal(r.aantal)} ${r.product?.eenheid ?? ''} ${r.product?.naam ?? ''}${r.product?.artikelnummer ? ` (art. ${r.product.artikelnummer})` : ''}`),
    '', `Afleveren: ${b.locatie?.naam ?? ''}${b.locatie?.adres ? `, ${b.locatie.adres}` : ''}`,
    ...(b.gewenst_op ? [`Graag uiterlijk ${datum(b.gewenst_op)}.`] : []),
    '', 'Met vriendelijke groet,', 'Hollandsche Greenkeeping Maatschappij',
  ].join('\n')
  const mailto = `mailto:${lev?.email ?? ''}?subject=${encodeURIComponent(`Bestelling ${bestelCode(b)} – Hollandsche Greenkeeping Maatschappij`)}&body=${encodeURIComponent(mailtekst)}`
  const ontvangbaar = b.status === 'besteld' || b.status === 'deels_ontvangen'

  return (
    <div className="bestelling">
      <p className="geen-print"><Link to="/inkoop/bestellingen">← Alle bestellingen</Link></p>
      <div className="kop-met-knop geen-print">
        <h1>{bestelCode(b)} · {lev?.naam}</h1>
        <span className={`label ${bestelKlasse(b.status)}`}>{bestelStatus[b.status]}</span>
      </div>
      {fout && <div className="melding fout geen-print">{fout}</div>}
      {melding && <div className="melding info geen-print">{melding}</div>}

      <section className="kaart geen-print">
        <dl className="velden">
          <div><dt>Voor</dt><dd>{b.locatie?.naam}</dd></div>
          <div><dt>Aangevraagd</dt><dd>{datumTijd(b.aangevraagd_op)}{b.aanvrager?.naam ? ` door ${b.aanvrager.naam}` : ''}</dd></div>
          {b.gewenst_op && <div><dt>Graag binnen op</dt><dd>{datum(b.gewenst_op)}</dd></div>}
          {b.toelichting && <div><dt>Toelichting</dt><dd>{b.toelichting}</dd></div>}
          {b.beoordeeld_op && (
            <div><dt>{b.status === 'afgewezen' ? 'Afgewezen' : 'Goedgekeurd'}</dt>
              <dd>{datumTijd(b.beoordeeld_op)}{b.beoordelaar?.naam ? ` door ${b.beoordelaar.naam}` : ''}{b.beoordeling ? ` · ${b.beoordeling}` : ''}</dd></div>
          )}
          {b.besteld_op && <div><dt>Besteld</dt><dd>{datumTijd(b.besteld_op)}</dd></div>}
          {b.ontvangen_op && <div><dt>Ontvangen</dt><dd>{datumTijd(b.ontvangen_op)}</dd></div>}
        </dl>
      </section>

      {/* Bestelbon: ook de afdruk (PDF) voor de leverancier */}
      <article className="kaart bestelbon">
        <header className="bestelbon-kop">
          <img src="/hgm-logo.png" alt="Hollandsche Greenkeeping Maatschappij" />
          <div>
            <h2>Bestelling {bestelCode(b)}</h2>
            <p className="zacht">{datum(b.besteld_op ?? b.aangevraagd_op)}</p>
          </div>
        </header>
        <div className="twee-kolommen">
          <div>
            <span className="label-klein">Leverancier</span>
            <p>{lev?.naam}{lev?.contactpersoon && <><br />t.a.v. {lev.contactpersoon}</>}{lev?.adres && <><br />{lev.adres}</>}
              {lev?.klantnummer && <><br />Ons klantnummer: {lev.klantnummer}</>}</p>
          </div>
          <div>
            <span className="label-klein">Afleveradres</span>
            <p>{b.locatie?.naam}{b.locatie?.adres && <><br />{b.locatie.adres}</>}{b.gewenst_op && <><br />Graag uiterlijk {datum(b.gewenst_op)}</>}</p>
          </div>
        </div>
        <div className="tabel-wrap">
          <table className="tabel">
            <thead><tr><th>Product</th><th>Art.nr.</th><th>Aantal</th><th>Prijs</th><th>Totaal</th>{b.status !== 'aanvraag' && <th className="geen-print">Ontvangen</th>}</tr></thead>
            <tbody>
              {b.regels.map((r) => (
                <tr key={r.id}>
                  <td>{r.product?.naam}</td>
                  <td>{r.product?.artikelnummer ?? ''}</td>
                  <td>{getal(r.aantal)} {r.product?.eenheid}</td>
                  <td>{r.prijs != null ? euro(r.prijs) : '–'}</td>
                  <td>{euro(regelTotaal(r))}</td>
                  {b.status !== 'aanvraag' && <td className="geen-print">{getal(r.ontvangen)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="bestelbon-totaal"><strong>Totaal {euro(bestelTotaal(b))}</strong> excl. btw</p>
      </article>

      {ontvangbaar && (
        <section className="kaart geen-print">
          <h2>Ontvangst boeken</h2>
          <p className="zacht">Wat er binnen is, gaat direct op de voorraad van {b.locatie?.naam}. Deels ontvangen kan.</p>
          {b.regels.filter((r) => r.ontvangen < r.aantal).map((r) => (
            <Ontvangst key={r.id} regel={r} locatieId={b.locatie_id} klaar={() => { setMelding('Ontvangst geboekt.'); laad() }} fout={setFout} />
          ))}
        </section>
      )}

      <div className="actiebalk geen-print">
        {b.status === 'aanvraag' && goedkeurder && (
          <>
            <button className="knop groen" disabled={bezig || !b.regels.length} onClick={() => status({ status: 'goedgekeurd' }, 'Goedgekeurd.')}>Goedkeuren</button>
            <button className="knop tweede" disabled={bezig} onClick={afwijzen}>Afwijzen</button>
          </>
        )}
        {b.status === 'goedgekeurd' && goedkeurder && (
          <button className="knop" disabled={bezig} onClick={() => status({ status: 'besteld' }, 'Gemarkeerd als besteld. Stuur de bestelbon naar de leverancier.')}>
            Markeren als besteld
          </button>
        )}
        {['goedgekeurd', 'besteld', 'deels_ontvangen', 'ontvangen'].includes(b.status) && (
          <>
            <button className="knop tweede" onClick={() => window.print()}>Bestelbon als PDF</button>
            {lev?.email && <a className="knop tweede" href={mailto}>Mail naar {lev.naam}</a>}
          </>
        )}
        {b.status === 'aanvraag' && (eigen || goedkeurder) && (
          <button className="knop tweede" disabled={bezig}
                  onClick={() => window.confirm('Aanvraag annuleren?') && status({ status: 'geannuleerd' }, 'Aanvraag geannuleerd.')}>
            Annuleren
          </button>
        )}
      </div>
    </div>
  )
}

function Ontvangst({ regel: r, locatieId, klaar, fout }: { regel: Bestelregel; locatieId: string; klaar: () => void; fout: (t: string) => void }) {
  const rest = Number(r.aantal) - Number(r.ontvangen)
  const [aantal, setAantal] = useState(String(rest))
  const [houdbaar, setHoudbaar] = useState('')
  const [bezig, setBezig] = useState(false)

  async function boek() {
    const n = Number(aantal.replace(',', '.'))
    if (!(n > 0)) return
    setBezig(true)
    // De database controleert locatie en product tegen de bestelregel en werkt de bestelling bij.
    const { error } = await supabase.from('voorraadmutaties').insert({
      bron_tabel: 'bestelregels', bron_id: r.id, aantal: n, soort: 'ontvangst',
      locatie_id: locatieId, product_id: r.product_id, houdbaar_tot: houdbaar || null,
    })
    setBezig(false)
    if (error) return fout('Ontvangst boeken mislukt.')
    klaar()
  }

  return (
    <div className="lus-rij ontvangst">
      <span className="gebruiker-baan">{r.product?.naam}</span>
      <span className="zacht">nog {getal(rest)} {r.product?.eenheid}</span>
      <input aria-label={`Ontvangen ${r.product?.naam}`} inputMode="decimal" className="smal" value={aantal} onChange={(e) => setAantal(e.target.value)} />
      {r.product?.categorie === 'gewasbescherming' && (
        <input aria-label="Houdbaar tot" type="date" title="Houdbaar tot" value={houdbaar} onChange={(e) => setHoudbaar(e.target.value)} />
      )}
      <button className="knop tweede klein" disabled={bezig} onClick={boek}>Ontvangen</button>
    </div>
  )
}
