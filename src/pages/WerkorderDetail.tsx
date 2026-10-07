import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { useSessie } from '../lib/sessie'
import { datum, datumTijd, urgentieNamen } from '../lib/teksten'
import { fotosVan, uploadFotos, type Foto } from '../lib/fotos'
import {
  useMonteurs, vervangerTekst, werkorderBron, werkorderCode, werkorderDoel, werkorderKlasse, werkorderStappen,
  werkorderStatus, werkorderVelden, type Werkorder, type WerkorderStatus,
} from '../lib/werkplaats'
import FotoKiezer from '../components/FotoKiezer'

type Regel = { id: string; omschrijving: string; aantal: number; eenheid: string | null; bedrag: number | null; product_id: string | null }
type Onderdeel = { id: string; naam: string; eenheid: string; prijs: number | null }
type Uur = { id: string; datum: string; minuten: number; notitie: string | null; medewerker: { naam: string | null } | null }

// Volgende stappen per status (de knoppen onderaan). Annuleren kan zolang de werkorder open is.
const volgende: Record<WerkorderStatus, WerkorderStatus[]> = {
  aangevraagd: ['in_werkplaats'],
  ingepland: ['in_werkplaats'],
  in_werkplaats: ['wacht_op_onderdelen', 'gereed'],
  wacht_op_onderdelen: ['in_werkplaats', 'gereed'],
  gereed: ['terug_op_locatie'],
  terug_op_locatie: [],
  geannuleerd: ['aangevraagd'],
}
const knopTekst: Partial<Record<WerkorderStatus, string>> = {
  in_werkplaats: 'In werkplaats', wacht_op_onderdelen: 'Wacht op onderdelen', gereed: 'Gereed',
  terug_op_locatie: 'Terug op locatie', aangevraagd: 'Heropenen',
}

// Werkplaats → werkorder: planning, statusverloop, bevindingen, uren, onderdelen en foto's.
export default function WerkorderDetail() {
  const { werkorderId } = useParams()
  const { profiel } = useSessie()
  const isGlobaal = profiel?.globale_rol === 'beheer' || profiel?.globale_rol === 'onderhoudsmanager'
  const monteurs = useMonteurs()
  const [w, setW] = useState<Werkorder | null>(null)
  const [regels, setRegels] = useState<Regel[]>([])
  const [uren, setUren] = useState<Uur[]>([])
  const [fotos, setFotos] = useState<Foto[]>([])
  const [vervangers, setVervangers] = useState<{ id: string; naam: string; baan: string }[]>([])
  const [onderdelen, setOnderdelen] = useState<Onderdeel[]>([])
  const [nieuweFotos, setNieuweFotos] = useState<File[]>([])
  const [bevindingen, setBevindingen] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  const laad = useCallback(async () => {
    const [wo, rg, ur, ft] = await Promise.all([
      supabase.from('werkorders').select(werkorderVelden).eq('id', werkorderId!).single(),
      supabase.from('werkorder_regels').select('id, omschrijving, aantal, eenheid, bedrag, product_id').eq('werkorder_id', werkorderId!).order('aangemaakt_op'),
      supabase.from('uren').select('id, datum, minuten, notitie, medewerker:profielen(naam)')
        .eq('bron_tabel', 'werkorders').eq('bron_id', werkorderId!).order('datum'),
      fotosVan('werkorders', werkorderId!),
    ])
    if (wo.error) return setFout('Deze werkorder bestaat niet of je hebt geen toegang.')
    const data = wo.data as unknown as Werkorder
    setW(data)
    setBevindingen(data.bevindingen ?? '')
    setRegels(rg.data ?? [])
    setUren((ur.data ?? []) as unknown as Uur[])
    setFotos(ft)
  }, [werkorderId])
  useEffect(() => { laad() }, [laad])

  // Onderdelen en materialen uit de catalogus (boeken af van de werkplaatsvoorraad).
  useEffect(() => {
    supabase.from('producten').select('id, naam, eenheid, prijs').in('categorie', ['onderdeel', 'materiaal'])
      .is('gearchiveerd_op', null).order('naam').then(({ data }) => setOnderdelen(data ?? []))
  }, [])

  // Vervangend materieel: machines van andere banen of de werkplaats die nu thuis staan.
  useEffect(() => {
    if (!w?.machine_id) return
    supabase.from('machines').select('id, naam, merk, model, locatie_id, huidige_locatie_id, locatie:locaties!machines_locatie_id_fkey(naam)')
      .is('gearchiveerd_op', null).neq('id', w.machine_id).order('naam')
      .then(({ data }) => setVervangers(((data ?? []) as unknown as { id: string; naam: string | null; merk: string | null; model: string | null; locatie_id: string; huidige_locatie_id: string; locatie: { naam: string } | null }[])
        .filter((m) => m.locatie_id !== w.locatie_id && (m.huidige_locatie_id === m.locatie_id || m.id === w.vervangende_machine_id))
        .map((m) => ({ id: m.id, naam: m.naam ?? ([m.merk, m.model].filter(Boolean).join(' ') || 'Machine'), baan: m.locatie?.naam ?? '' }))))
  }, [w?.machine_id, w?.locatie_id, w?.vervangende_machine_id])

  async function wijzig(velden: Partial<Werkorder>) {
    setBezig(true)
    setFout(null)
    const { error } = await supabase.from('werkorders').update(velden).eq('id', werkorderId!)
    setBezig(false)
    if (error) setFout('Opslaan mislukt.')
    laad()
  }

  async function regelToevoegen(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const bedrag = String(f.get('bedrag') ?? '').replace(',', '.')
    const product = onderdelen.find((o) => o.id === f.get('product_id'))
    if (!product && !f.get('omschrijving')) return setFout('Kies een onderdeel of typ een omschrijving.')
    // Uit de catalogus: prijs berekent de database (prijs × aantal) als je geen bedrag invult.
    const { error } = await supabase.from('werkorder_regels').insert({
      werkorder_id: werkorderId, product_id: product?.id ?? null,
      omschrijving: f.get('omschrijving') || product?.naam,
      aantal: Number(String(f.get('aantal') || '1').replace(',', '.')), eenheid: f.get('eenheid') || product?.eenheid || null,
      bedrag: bedrag ? Number(bedrag) : null,
    })
    if (error) return setFout('Onderdeel opslaan mislukt.')
    e.currentTarget.reset()
    laad()
  }

  async function regelVerwijderen(id: string) {
    await supabase.from('werkorder_regels').delete().eq('id', id)
    laad()
  }

  async function urenToevoegen(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const { error } = await supabase.from('uren').insert({
      locatie_id: w!.locatie_id, minuten: Number(f.get('minuten')), datum: f.get('datum'),
      notitie: f.get('notitie') || null, bron_tabel: 'werkorders', bron_id: werkorderId,
    })
    if (error) return setFout('Uren opslaan mislukt.')
    e.currentTarget.reset()
    laad()
  }

  async function fotosToevoegen() {
    if (!w || !nieuweFotos.length) return
    setBezig(true)
    try {
      await uploadFotos(w.locatie_id, 'werkorders', w.id, nieuweFotos, { intern: true })
      setNieuweFotos([])
      await laad()
    } catch {
      setFout("Foto's uploaden mislukt.")
    }
    setBezig(false)
  }

  if (fout && !w) return <div className="melding fout">{fout}</div>
  if (!w) return <p className="zacht">Laden…</p>

  const open = !['terug_op_locatie', 'geannuleerd'].includes(w.status)
  const huidigeStap = werkorderStappen.indexOf(w.status)
  const minuten = uren.reduce((t, u) => t + u.minuten, 0)
  const onderdelenTotaal = regels.reduce((t, r) => t + Number(r.bedrag ?? 0), 0)

  return (
    <div className="werkorder">
      <p><Link to="/werkplaats/werkorders">← Alle werkorders</Link></p>
      <div className="kop-met-knop">
        <h1>{werkorderDoel(w)}</h1>
        <span className={`label ${werkorderKlasse(w.status)}`}>{werkorderStatus[w.status]}</span>
      </div>
      <p className="zacht"><span className="mono">{werkorderCode(w)}</span> · {w.locatie?.naam} · {w.omschrijving}</p>

      {w.status !== 'geannuleerd' && (
        <ol className="stappen" aria-label="Statusverloop">
          {werkorderStappen.map((s, i) => <li key={s} className={i <= huidigeStap ? 'gedaan' : ''}>{werkorderStatus[s]}</li>)}
        </ol>
      )}
      {fout && <div className="melding fout">{fout}</div>}

      <section className="kaart">
        <dl className="velden">
          <div><dt>Bron</dt><dd>
            {werkorderBron[w.bron]}
            {w.storing_id && <> · <Link to={`/locatie/${w.locatie_id}/storingen/${w.storing_id}`}>defectmelding</Link></>}
          </dd></div>
          <div><dt>Urgentie</dt><dd>{urgentieNamen[w.urgentie]}</dd></div>
          <div><dt>Aangevraagd</dt><dd>{datumTijd(w.aangevraagd_op)}{w.aanvrager?.naam ? ` door ${w.aanvrager.naam}` : ''}</dd></div>
          {w.machine_id && (
            <div><dt>Machine</dt><dd><Link to={`/locatie/${w.locatie_id}/materieel/${w.machine_id}`}>{werkorderDoel(w)}</Link></dd></div>
          )}
          {w.gereed_op && <div><dt>Gereed</dt><dd>{datumTijd(w.gereed_op)}</dd></div>}
          {w.afgerond_op && <div><dt>Afgerond</dt><dd>{datumTijd(w.afgerond_op)}</dd></div>}
        </dl>
      </section>

      <section className="kaart">
        <h2>Planning</h2>
        <div className="twee-kolommen">
          <div>
            <label htmlFor="wo-monteur">Monteur</label>
            <select id="wo-monteur" value={w.monteur_id ?? ''} disabled={bezig || !open}
                    onChange={(e) => wijzig({ monteur_id: e.target.value || null })}>
              <option value="">— nog niemand —</option>
              {monteurs.map((m) => <option key={m.id} value={m.id}>{m.naam}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="wo-datum">Gepland op</label>
            <input id="wo-datum" type="date" value={w.gepland_op ?? ''} disabled={bezig || !open}
                   onChange={(e) => wijzig({ gepland_op: e.target.value || null })} />
          </div>
        </div>
        {w.status === 'aangevraagd' && <p className="zacht klein-tekst">Met een monteur en een datum staat de werkorder op Ingepland.</p>}
        {w.machine_id && (
          <>
            <label htmlFor="wo-vervanger">Vervangend materieel</label>
            <select id="wo-vervanger" value={w.vervangende_machine_id ?? ''} disabled={bezig || !open}
                    onChange={(e) => wijzig({ vervangende_machine_id: e.target.value || null })}>
              <option value="">— geen —</option>
              {vervangers.map((m) => <option key={m.id} value={m.id}>{m.naam}{m.baan ? ` (${m.baan})` : ''}</option>)}
            </select>
            {vervangerTekst(w) && open && (
              <p className="zacht klein-tekst">{vervangerTekst(w)} staat zolang op {w.locatie?.naam} en gaat terug bij Terug op locatie.</p>
            )}
          </>
        )}
      </section>

      <section className="kaart">
        <h2>Bevindingen</h2>
        <textarea aria-label="Bevindingen" rows={3} value={bevindingen} onChange={(e) => setBevindingen(e.target.value)}
                  placeholder="Wat is er gevonden en gedaan?" />
        {bevindingen !== (w.bevindingen ?? '') && (
          <button className="knop tweede" disabled={bezig} onClick={() => wijzig({ bevindingen: bevindingen || null })}>Bevindingen opslaan</button>
        )}
        {w.storing_id && <p className="zacht klein-tekst">Bij Gereed wordt de defectmelding opgelost, met deze bevindingen als oplossing.</p>}
      </section>

      <section className="kaart">
        <h2>Uren <small className="zacht">(intern{isGlobaal ? '' : ', alleen je eigen uren'})</small></h2>
        {uren.length > 0 && (
          <ul className="lijst compact">
            {uren.map((u) => (
              <li key={u.id} className="lus-rij">
                <span className="mono">{datum(u.datum)}</span>
                <span>{u.medewerker?.naam}</span>
                <strong>{u.minuten} min</strong>
                {u.notitie && <span className="zacht">{u.notitie}</span>}
              </li>
            ))}
          </ul>
        )}
        {uren.length > 1 && <p className="zacht">Totaal {Math.round((minuten / 60) * 10) / 10} uur</p>}
        <form className="lus-rij" onSubmit={urenToevoegen}>
          <input name="datum" type="date" aria-label="Datum" required defaultValue={new Date().toISOString().slice(0, 10)} />
          <input name="minuten" type="number" aria-label="Minuten" placeholder="Minuten" min={1} max={1440} required className="smal" />
          <input name="notitie" aria-label="Notitie" placeholder="Notitie (optioneel)" />
          <button className="knop tweede">Uren toevoegen</button>
        </form>
      </section>

      <section className="kaart">
        <h2>Onderdelen</h2>
        {regels.length > 0 && (
          <div className="tabel-wrap">
            <table className="tabel">
              <thead><tr><th>Onderdeel</th><th>Aantal</th><th>Kosten</th><th /></tr></thead>
              <tbody>
                {regels.map((r) => (
                  <tr key={r.id}>
                    <td>{r.omschrijving}</td>
                    <td>{Number(r.aantal).toLocaleString('nl-NL')} {r.eenheid}</td>
                    <td>{r.bedrag != null ? `€ ${Number(r.bedrag).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}` : '–'}</td>
                    <td><button className="knop tweede klein" onClick={() => regelVerwijderen(r.id)}>Weg</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {onderdelenTotaal > 0 && <p className="zacht">Onderdelen totaal € {onderdelenTotaal.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</p>}
        {regels.some((r) => r.product_id) && <p className="zacht klein-tekst">Onderdelen uit de catalogus gaan van de werkplaatsvoorraad af.</p>}
        <form className="lus-rij" onSubmit={regelToevoegen}>
          {onderdelen.length > 0 && (
            <select name="product_id" aria-label="Uit de catalogus" defaultValue="">
              <option value="">— uit de catalogus —</option>
              {onderdelen.map((o) => <option key={o.id} value={o.id}>{o.naam}{o.prijs != null ? ` (€ ${o.prijs})` : ''}</option>)}
            </select>
          )}
          <input name="omschrijving" aria-label="Onderdeel" placeholder={onderdelen.length ? 'of omschrijving' : 'Onderdeel, bijv. bovenmes'} />
          <input name="aantal" aria-label="Aantal" placeholder="Aantal" inputMode="decimal" className="smal" />
          <input name="eenheid" aria-label="Eenheid" placeholder="st / l" className="smal" />
          <input name="bedrag" aria-label="Kosten in euro" placeholder="€ kosten" inputMode="decimal" className="smal" />
          <button className="knop tweede">Toevoegen</button>
        </form>
      </section>

      <section>
        <h2>Foto's</h2>
        {fotos.length === 0 && <p className="zacht">Nog geen foto's.</p>}
        <div className="fotos">
          {fotos.map((f) => <a key={f.id} href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt={f.omschrijving ?? 'Foto'} /></a>)}
        </div>
        <FotoKiezer fotos={nieuweFotos} wijzig={setNieuweFotos} />
        {nieuweFotos.length > 0 && (
          <button className="knop" disabled={bezig} onClick={fotosToevoegen}>{bezig ? 'Uploaden…' : `${nieuweFotos.length} foto('s) toevoegen`}</button>
        )}
      </section>

      {/* Statusknoppen; op de telefoon vast onderaan */}
      <div className="actiebalk">
        {volgende[w.status].map((s) => (
          <button key={s} className={`knop ${s === 'gereed' || s === 'terug_op_locatie' ? 'groen' : s === 'aangevraagd' ? 'tweede' : ''}`}
                  disabled={bezig} onClick={() => wijzig({ status: s })}>
            {knopTekst[s]}
          </button>
        ))}
        {open && (
          <button className="knop tweede" disabled={bezig}
                  onClick={() => window.confirm('Werkorder annuleren?') && wijzig({ status: 'geannuleerd' })}>
            Annuleren
          </button>
        )}
      </div>
    </div>
  )
}
