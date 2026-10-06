import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { useLocatie } from '../lib/locatie'
import { useSessie } from '../lib/sessie'
import { useTeam } from '../lib/keuzelijst'
import { fotosVan, uploadFotos, type Foto } from '../lib/fotos'
import { datumTijd, openStoringStatussen, storingStatus, urgentieNamen } from '../lib/teksten'
import FotoKiezer from '../components/FotoKiezer'
import { storingPlek, storingTitel, storingVelden, type Storing } from '../lib/storingen'

const stappen = ['gemeld', 'toegewezen', 'in_behandeling', 'opgelost', 'gecontroleerd']

export default function StoringDetail() {
  const { storingId } = useParams()
  const { locatie, magRegistreren, magPlannen } = useLocatie()
  const { sessie } = useSessie()
  const team = useTeam(locatie.id)
  const [s, setS] = useState<Storing | null>(null)
  const [fotos, setFotos] = useState<Foto[]>([])
  const [minuten, setMinuten] = useState<number | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)
  const [oplossenOpen, setOplossenOpen] = useState(false)
  const [nieuweFotos, setNieuweFotos] = useState<File[]>([])

  const laad = useCallback(async () => {
    const [st, ft, ur] = await Promise.all([
      supabase.from('storingen').select(storingVelden).eq('id', storingId!).single(),
      fotosVan('storingen', storingId!),
      supabase.from('uren').select('minuten').eq('bron_tabel', 'storingen').eq('bron_id', storingId!),
    ])
    if (st.error) return setFout('Deze storing bestaat niet of je hebt geen toegang.')
    setS(st.data as unknown as Storing)
    setFotos(ft)
    setMinuten(ur.data?.length ? ur.data.reduce((t, u) => t + u.minuten, 0) : null)
  }, [storingId])

  useEffect(() => { laad() }, [laad])

  async function wijzig(velden: Record<string, unknown>) {
    setBezig(true)
    setFout(null)
    const { error } = await supabase.from('storingen').update(velden).eq('id', storingId!)
    setBezig(false)
    if (error) return setFout(error.message.includes('hoofd-greenkeeper') || error.message.includes('gecontroleerd')
      ? error.message : 'Opslaan mislukt.')
    await laad()
  }

  async function fotosToevoegen() {
    if (!nieuweFotos.length || !s) return
    setBezig(true)
    try {
      await uploadFotos(locatie.id, 'storingen', s.id, nieuweFotos, { intern: s.intern })
      setNieuweFotos([])
      await laad()
    } catch {
      setFout("Foto's uploaden mislukt.")
    }
    setBezig(false)
  }

  if (fout && !s) return <main><div className="melding fout">{fout}</div></main>
  if (!s) return <main className="zacht">Laden…</main>

  const mij = sessie!.user.id
  const isOpen = openStoringStatussen.includes(s.status)
  const vanMij = s.toegewezen_aan === mij
  const magUitvoeren = magRegistreren && (vanMij || magPlannen || !s.toegewezen_aan)
  const kaartLink = s.object_id
    ? `/locatie/${locatie.id}?object=${s.object_id}`
    : !s.leiding_id && !s.machine ? `/locatie/${locatie.id}?melding=${s.id}` : null

  return (
    <main>
      <p><Link to={`/locatie/${locatie.id}/storingen`}>← Alle storingen</Link></p>
      <div className="kop-met-knop">
        <h1>{storingTitel(s)}</h1>
        <span className={`label ${isOpen ? 'storing' : ''}`}>{storingStatus[s.status]}</span>
      </div>

      <ol className="stappen" aria-label="Statusverloop">
        {stappen.map((st) => (
          <li key={st} className={stappen.indexOf(st) <= stappen.indexOf(s.status) ? 'gedaan' : ''}>
            {storingStatus[st]}
          </li>
        ))}
      </ol>

      {fout && <div className="melding fout">{fout}</div>}

      <section className="kaart">
        <dl className="velden">
          <div><dt>Plek</dt><dd>{storingPlek(s)}{kaartLink && <> · <Link to={kaartLink}>op de kaart</Link></>}</dd></div>
          <div><dt>Urgentie</dt><dd>{urgentieNamen[s.urgentie]}</dd></div>
          {s.omschrijving && <div><dt>Omschrijving</dt><dd>{s.omschrijving}</dd></div>}
          <div><dt>Gemeld</dt><dd>{datumTijd(s.gemeld_op)}{s.melder?.naam ? ` door ${s.melder.naam}` : ''}</dd></div>
          <div><dt>Uitvoerder</dt><dd>{s.uitvoerder?.naam ?? (s.toegewezen_aan ? 'Toegewezen' : 'Nog niemand')}</dd></div>
          {s.opgelost_op && <div><dt>Opgelost</dt><dd>{datumTijd(s.opgelost_op)}</dd></div>}
          {s.oplossing && <div><dt>Oplossing</dt><dd>{s.oplossing}</dd></div>}
          {s.gebruikte_onderdelen && <div><dt>Onderdelen</dt><dd>{s.gebruikte_onderdelen}</dd></div>}
          {minuten != null && <div><dt>Tijd (intern)</dt><dd>{minuten} min</dd></div>}
          {s.gecontroleerd_op && (
            <div><dt>Gecontroleerd</dt><dd>{datumTijd(s.gecontroleerd_op)}{s.controleur?.naam ? ` door ${s.controleur.naam}` : ''}</dd></div>
          )}
          {s.intern && <div><dt>Zichtbaarheid</dt><dd>Intern (niet voor de golfclub)</dd></div>}
        </dl>
      </section>

      {/* Acties voor uitvoerders */}
      {isOpen && magUitvoeren && !oplossenOpen && (
        <div className="knoppenrij acties">
          {(!s.toegewezen_aan || (vanMij && s.status !== 'in_behandeling')) && (
            <button className="knop" disabled={bezig}
                    onClick={() => wijzig({ toegewezen_aan: mij, status: 'in_behandeling' })}>
              Ik pak dit op
            </button>
          )}
          {s.toegewezen_aan && s.status !== 'in_behandeling' && magPlannen && !vanMij && (
            <button className="knop tweede" disabled={bezig} onClick={() => wijzig({ status: 'in_behandeling' })}>
              In behandeling
            </button>
          )}
          <button className="knop" onClick={() => setOplossenOpen(true)}>Opgelost…</button>
        </div>
      )}

      {oplossenOpen && (
        <Oplossen storing={s} sluit={() => setOplossenOpen(false)} klaar={() => { setOplossenOpen(false); laad() }} />
      )}

      {/* Acties voor hoofd-greenkeeper en hoger */}
      {magPlannen && (
        <section className="kaart">
          <h2>Beheer</h2>
          {isOpen && (
            <>
              <label htmlFor="toewijzen">Toewijzen aan</label>
              <select id="toewijzen" value={s.toegewezen_aan ?? ''} disabled={bezig}
                      onChange={(e) => wijzig({ toegewezen_aan: e.target.value || null,
                        status: e.target.value ? (s.status === 'gemeld' ? 'toegewezen' : s.status) : 'gemeld' })}>
                <option value="">— niemand —</option>
                {team.map((t) => <option key={t.id} value={t.id}>{t.naam}</option>)}
              </select>
              <label htmlFor="urgentie">Urgentie</label>
              <select id="urgentie" value={s.urgentie} disabled={bezig} onChange={(e) => wijzig({ urgentie: e.target.value })}>
                {Object.entries(urgentieNamen).map(([w, n]) => <option key={w} value={w}>{n}</option>)}
              </select>
            </>
          )}
          <div className="knoppenrij">
            {s.status === 'opgelost' && (
              <button className="knop" disabled={bezig} onClick={() => wijzig({ status: 'gecontroleerd' })}>Gecontroleerd</button>
            )}
            {!isOpen && (
              <button className="knop tweede" disabled={bezig}
                      onClick={() => wijzig({ status: s.toegewezen_aan ? 'in_behandeling' : 'gemeld' })}>Heropenen</button>
            )}
            <button className="knop tweede" disabled={bezig} onClick={() => wijzig({ intern: !s.intern })}>
              {s.intern ? 'Zichtbaar maken voor golfclub' : 'Markeren als intern'}
            </button>
          </div>
        </section>
      )}

      <section>
        <h2>Foto's</h2>
        {fotos.length === 0 && <p className="zacht">Nog geen foto's.</p>}
        <div className="fotos">
          {fotos.map((f) => (
            <a key={f.id} href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt={f.omschrijving ?? 'Foto'} /></a>
          ))}
        </div>
        {magRegistreren && (
          <>
            <FotoKiezer fotos={nieuweFotos} wijzig={setNieuweFotos} />
            {nieuweFotos.length > 0 && (
              <button className="knop" disabled={bezig} onClick={fotosToevoegen}>
                {bezig ? 'Uploaden…' : `${nieuweFotos.length} foto('s) toevoegen`}
              </button>
            )}
          </>
        )}
      </section>
    </main>
  )
}

function Oplossen({ storing, sluit, klaar }: { storing: Storing; sluit: () => void; klaar: () => void }) {
  const { locatie } = useLocatie()
  const [oplossing, setOplossing] = useState('')
  const [onderdelen, setOnderdelen] = useState('')
  const [minuten, setMinuten] = useState('')
  const [fotos, setFotos] = useState<File[]>([])
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    setBezig(true)
    setFout(null)
    const { data: gebruiker } = await supabase.auth.getUser()
    const { error } = await supabase.from('storingen').update({
      status: 'opgelost',
      oplossing,
      gebruikte_onderdelen: onderdelen || null,
      toegewezen_aan: storing.toegewezen_aan ?? gebruiker.user?.id,
    }).eq('id', storing.id)
    if (error) {
      setBezig(false)
      return setFout('Opslaan mislukt.')
    }
    try {
      if (Number(minuten) > 0) {
        await supabase.from('uren').insert({
          locatie_id: locatie.id, minuten: Number(minuten), bron_tabel: 'storingen', bron_id: storing.id,
        }).throwOnError()
      }
      if (fotos.length) await uploadFotos(locatie.id, 'storingen', storing.id, fotos, { intern: storing.intern, omschrijving: 'Na herstel' })
    } catch {
      setBezig(false)
      return setFout("Opgelost opgeslagen, maar tijd of foto's niet. Probeer die opnieuw toe te voegen.")
    }
    klaar()
  }

  return (
    <form className="kaart" onSubmit={opslaan}>
      <h2>Storing oplossen</h2>
      <label htmlFor="oplossing">Wat is er gedaan?</label>
      <textarea id="oplossing" rows={3} required value={oplossing} onChange={(e) => setOplossing(e.target.value)} />
      <label htmlFor="onderdelen">Gebruikte onderdelen</label>
      <input id="onderdelen" value={onderdelen} onChange={(e) => setOnderdelen(e.target.value)}
             placeholder="Bijv. 1× sproeikop Toro 54" />
      <label htmlFor="minuten">Tijd besteed (minuten, intern)</label>
      <input id="minuten" type="number" inputMode="numeric" min={1} max={1440} value={minuten}
             onChange={(e) => setMinuten(e.target.value)} />
      <span className="veldlabel">Foto achteraf</span>
      <FotoKiezer fotos={fotos} wijzig={setFotos} />
      {fout && <div className="melding fout">{fout}</div>}
      <div className="knoppenrij">
        <button className="knop" disabled={bezig}>{bezig ? 'Opslaan…' : 'Opgelost'}</button>
        <button type="button" className="knop tweede" onClick={sluit}>Annuleren</button>
      </div>
    </form>
  )
}
