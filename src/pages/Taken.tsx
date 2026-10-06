import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { useLocatie } from '../lib/locatie'
import { useSessie } from '../lib/sessie'
import { useTeam } from '../lib/keuzelijst'
import { datum, initialen, objectTitel, openStoringStatussen, taakStatus, vandaag } from '../lib/teksten'
import { storingCode, storingVelden, type Storing } from '../lib/storingen'
import StoringRij from '../components/StoringRij'

type Taak = {
  id: string; omschrijving: string; status: string; deadline: string | null; gepland_op: string | null
  toegewezen_aan: string | null; afgerond_op: string | null; intern: boolean; object_id: string | null
  storing_id: string | null
  object: { code: string | null; objecttypes: { naam: string; categorie: string } | null; hole: { nummer: number } | null } | null
  uitvoerder: { naam: string | null } | null
}

const taakVelden = `id, omschrijving, status, deadline, gepland_op, toegewezen_aan, afgerond_op, intern, object_id, storing_id,
  object:objecten(code, objecttypes(naam, categorie), hole:holes(nummer)),
  uitvoerder:profielen!taken_toegewezen_aan_fkey(naam)`

type Weergave = 'bord' | 'lijst' | 'hole'
type Lijstfilter = 'mijn' | 'open' | 'afgerond'

const verlopen = (t: Taak) => t.deadline != null && t.deadline < vandaag() && ['open', 'in_behandeling'].includes(t.status)

const categorieNaam: Record<string, string> = { beregening: 'Beregening', drainage: 'Drainage', kabel: 'Kabels', overig: 'Overig' }

const kolommen: [string, string, string, (t: Taak) => boolean][] = [
  ['teplannen', 'Te plannen', 'var(--kleur-rand-sterk)', (t) => t.status === 'open' && !t.toegewezen_aan],
  ['ingepland', 'Ingepland', 'var(--kleur-beregening)', (t) => t.status === 'open' && !!t.toegewezen_aan],
  ['bezig', 'Bezig', 'var(--kleur-gepland)', (t) => t.status === 'in_behandeling'],
  ['klaar', 'Klaar', 'var(--kleur-in-orde)', (t) => t.status === 'afgerond'],
]

function weekNummer(d = new Date()) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7))
  return Math.ceil(((x.getTime() - Date.UTC(x.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7)
}

const opslagSleutel = 'hgm-taken-weergave'
const smal = () => window.matchMedia('(max-width: 700px)').matches

export default function Taken() {
  const { locatie, magRegistreren, magPlannen } = useLocatie()
  const { sessie } = useSessie()
  const [zoekParams, setZoekParams] = useSearchParams()
  const [weergave, zetWeergave] = useState<Weergave>(() => {
    try { return (localStorage.getItem(opslagSleutel) as Weergave) ?? 'bord' } catch { return 'bord' }
  })
  const [isSmal, setIsSmal] = useState(smal)
  const [lijstfilter, setLijstfilter] = useState<Lijstfilter>(magRegistreren ? 'mijn' : 'open')
  const [taken, setTaken] = useState<Taak[] | null>(null)
  const [storingen, setStoringen] = useState<Storing[]>([])
  const [nieuw, setNieuw] = useState(zoekParams.has('nieuw'))
  const mij = sessie!.user.id
  // Op een telefoon altijd de lijst: een bord met vier kolommen past daar niet.
  const actief: Weergave = isSmal ? 'lijst' : weergave

  useEffect(() => {
    const m = window.matchMedia('(max-width: 700px)')
    const wissel = () => setIsSmal(m.matches)
    m.addEventListener('change', wissel)
    return () => m.removeEventListener('change', wissel)
  }, [])

  function setWeergave(w: Weergave) {
    zetWeergave(w)
    try { localStorage.setItem(opslagSleutel, w) } catch { /* privémodus */ }
  }

  const laad = useCallback(async () => {
    let q = supabase.from('taken').select(taakVelden).eq('locatie_id', locatie.id)
    if (actief === 'bord') {
      const tweeWeken = new Date(Date.now() - 14 * 864e5).toISOString()
      q = q.or(`status.in.(open,in_behandeling),and(status.eq.afgerond,afgerond_op.gte.${tweeWeken})`)
        .order('deadline', { nullsFirst: false })
    } else if (actief === 'lijst' && lijstfilter === 'afgerond') {
      q = q.in('status', ['afgerond', 'geannuleerd']).order('afgerond_op', { ascending: false }).limit(100)
    } else {
      q = q.in('status', ['open', 'in_behandeling']).order('deadline', { nullsFirst: false }).order('aangemaakt_op')
      if (actief === 'lijst' && lijstfilter === 'mijn') q = q.eq('toegewezen_aan', mij)
    }
    const metStoringen = actief === 'lijst' && lijstfilter === 'mijn'
    const [t, s] = await Promise.all([
      q,
      metStoringen
        ? supabase.from('storingen').select(storingVelden).eq('locatie_id', locatie.id)
            .eq('toegewezen_aan', mij).in('status', openStoringStatussen).order('urgentie', { ascending: false })
        : Promise.resolve({ data: [] }),
    ])
    setTaken((t.data ?? []) as unknown as Taak[])
    setStoringen((s.data ?? []) as unknown as Storing[])
  }, [locatie.id, actief, lijstfilter, mij])

  useEffect(() => { laad() }, [laad])

  // Storingcodes voor "uit S-…" op taken die uit een storing komen.
  const perHole = useMemo(() => {
    const m = new Map<string, Taak[]>()
    for (const t of taken ?? []) {
      const k = t.object?.hole ? `Hole ${t.object.hole.nummer}` : 'Zonder hole'
      m.set(k, [...(m.get(k) ?? []), t])
    }
    return [...m].sort(([a], [b]) => (a === 'Zonder hole' ? 1 : b === 'Zonder hole' ? -1
      : Number(a.slice(5)) - Number(b.slice(5))))
  }, [taken])

  return (
    <main className={actief === 'bord' ? 'breed' : ''}>
      <div className="kop-met-knop">
        <div>
          <span className="label-klein">Week {weekNummer()} · {locatie.naam}</span>
          <h1>Taken</h1>
        </div>
        {magPlannen && !nieuw && <button className="knop groen" onClick={() => setNieuw(true)}>+ Nieuwe taak</button>}
      </div>

      {nieuw && (
        <NieuweTaak
          objectId={zoekParams.get('object')}
          sluit={() => { setNieuw(false); setZoekParams({}, { replace: true }) }}
          klaar={() => { setNieuw(false); setZoekParams({}, { replace: true }); laad() }}
        />
      )}

      {!isSmal && (
        <div className="schakelaar filterbalk">
          {([['bord', 'Bord'], ['lijst', 'Lijst'], ['hole', 'Per hole']] as [Weergave, string][]).map(([w, n]) => (
            <button key={w} className={`knop ${weergave === w ? '' : 'tweede'}`} onClick={() => setWeergave(w)}>{n}</button>
          ))}
        </div>
      )}

      {actief === 'bord' && (
        <div className="bord">
          {kolommen.map(([sleutel, naam, kleur, hoort]) => {
            const lijst = (taken ?? []).filter(hoort)
            return (
              <section key={sleutel} className="bord-kolom" style={{ '--c': kleur } as CSSProperties}>
                <div className="bord-kop"><strong>{naam}</strong><span>{lijst.length}</span></div>
                {lijst.map((t) => <TaakRij key={t.id} taak={t} mij={mij} herlaad={laad} kaartje />)}
              </section>
            )
          })}
        </div>
      )}

      {actief === 'lijst' && (
        <>
          <div className="schakelaar filterbalk">
            {([...(magRegistreren ? [['mijn', 'Mijn werk']] : []), ['open', 'Alle open'], ['afgerond', 'Afgerond']] as [Lijstfilter, string][])
              .map(([w, n]) => (
                <button key={w} className={`knop ${lijstfilter === w ? '' : 'tweede'}`} onClick={() => setLijstfilter(w)}>{n}</button>
              ))}
          </div>
          {lijstfilter === 'mijn' && storingen.length > 0 && (
            <>
              <h2>Storingen aan mij</h2>
              <ul className="lijst">
                {storingen.map((s) => (
                  <li key={s.id}><StoringRij storing={s} naar={`/locatie/${locatie.id}/storingen/${s.id}`} /></li>
                ))}
              </ul>
              <h2>Taken</h2>
            </>
          )}
          {taken?.length === 0 && <p className="zacht">{lijstfilter === 'mijn' ? 'Je hebt geen openstaande taken.' : 'Geen taken.'}</p>}
          <ul className="lijst">
            {taken?.map((t) => <li key={t.id}><TaakRij taak={t} mij={mij} herlaad={laad} /></li>)}
          </ul>
        </>
      )}

      {actief === 'hole' && (
        <>
          {taken?.length === 0 && <p className="zacht">Geen open taken.</p>}
          {perHole.map(([hole, lijst]) => (
            <section key={hole}>
              <h2>{hole} <span className="mono zacht">{lijst.length}</span></h2>
              <ul className="lijst">
                {lijst.map((t) => <li key={t.id}><TaakRij taak={t} mij={mij} herlaad={laad} /></li>)}
              </ul>
            </section>
          ))}
        </>
      )}
    </main>
  )
}
function TaakRij({ taak: t, mij, herlaad, kaartje = false }: { taak: Taak; mij: string; herlaad: () => void; kaartje?: boolean }) {
  const { locatie, magRegistreren, magPlannen } = useLocatie()
  const [afronden, setAfronden] = useState(false)
  const [minuten, setMinuten] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const magAfronden = magPlannen || (magRegistreren && t.toegewezen_aan === mij)
  const isOpen = ['open', 'in_behandeling'].includes(t.status)

  async function zetStatus(status: string) {
    setBezig(true)
    setFout(null)
    const { error } = await supabase.from('taken').update({ status }).eq('id', t.id)
    if (!error && status === 'afgerond' && Number(minuten) > 0) {
      await supabase.from('uren').insert({ locatie_id: locatie.id, minuten: Number(minuten), bron_tabel: 'taken', bron_id: t.id })
    }
    setBezig(false)
    if (error) return setFout('Opslaan mislukt.')
    herlaad()
  }

  return (
    <div className={`rij ${verlopen(t) ? 'verlopen' : ''}`}>
      <span className="rij-hoofd">
        <strong>{t.omschrijving}</strong>
        {!kaartje && (
          <span className={`label ${verlopen(t) ? 'storing' : t.status === 'afgerond' ? 'in-orde' : t.status === 'in_behandeling' ? 'gepland' : ''}`}>
            {verlopen(t) ? 'Verlopen' : taakStatus[t.status]}
          </span>
        )}
        {kaartje && t.uitvoerder?.naam && <span className="avatar" title={t.uitvoerder.naam}>{initialen(t.uitvoerder.naam)}</span>}
      </span>
      <span className="rij-meta">
        {t.object?.hole && <span className="hole-pil">Hole {t.object.hole.nummer}</span>}
        {t.object?.objecttypes && (
          <span className={`cat ${t.object.objecttypes.categorie}`}>{categorieNaam[t.object.objecttypes.categorie] ?? t.object.objecttypes.categorie}</span>
        )}
        {!kaartje && <span>{objectTitel(t.object)}</span>}
        {!kaartje && <span>{t.uitvoerder?.naam ?? (t.toegewezen_aan || !isOpen ? '' : 'nog niet toegewezen')}</span>}
        {t.intern && <span>intern</span>}
        {t.object_id && <Link to={`/locatie/${locatie.id}?object=${t.object_id}`} style={{ marginLeft: 'auto' }}>kaart</Link>}
      </span>
      <span className={`mono ${verlopen(t) ? 'rood' : 'zacht'}`}>
        {t.status === 'afgerond' ? `afgerond ${datum(t.afgerond_op)}` : t.deadline ? `uiterlijk ${datum(t.deadline)}` : 'geen deadline'}
        {t.storing_id ? ` · uit ${storingCode({ id: t.storing_id })}` : ''}
      </span>
      {fout && <div className="melding fout">{fout}</div>}
      {isOpen && magAfronden && !afronden && (
        <div className="knoppenrij">
          {t.status === 'open' && (
            <button className="knop tweede klein" disabled={bezig} onClick={() => zetStatus('in_behandeling')}>Bezig</button>
          )}
          <button className="knop klein" disabled={bezig} onClick={() => setAfronden(true)}>Afronden</button>
          {magPlannen && <button className="knop tweede klein" disabled={bezig} onClick={() => zetStatus('geannuleerd')}>Annuleren</button>}
        </div>
      )}
      {afronden && (
        <div className="afronden">
          <label htmlFor={`min-${t.id}`}>Tijd besteed (minuten, optioneel)</label>
          <input id={`min-${t.id}`} type="number" inputMode="numeric" min={1} max={1440} value={minuten}
                 onChange={(e) => setMinuten(e.target.value)} />
          <div className="knoppenrij">
            <button className="knop" disabled={bezig} onClick={() => zetStatus('afgerond')}>Afgerond</button>
            <button className="knop tweede" onClick={() => setAfronden(false)}>Terug</button>
          </div>
        </div>
      )}
      {!isOpen && magPlannen && (
        <div className="knoppenrij"><button className="knop tweede klein" disabled={bezig} onClick={() => zetStatus('open')}>Heropenen</button></div>
      )}
    </div>
  )
}

function NieuweTaak({ objectId, sluit, klaar }: { objectId: string | null; sluit: () => void; klaar: () => void }) {
  const { locatie } = useLocatie()
  const team = useTeam(locatie.id)
  const [object, setObject] = useState<string | null>(null)
  const [omschrijving, setOmschrijving] = useState('')
  const [toegewezen, setToegewezen] = useState('')
  const [deadline, setDeadline] = useState('')
  const [intern, setIntern] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    if (!objectId) return
    supabase.from('objecten').select('code, objecttypes(naam)').eq('id', objectId).single()
      .then(({ data }) => setObject(objectTitel(data as never)))
  }, [objectId])

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('taken').insert({
      locatie_id: locatie.id, bron: 'handmatig', object_id: objectId, omschrijving,
      toegewezen_aan: toegewezen || null, deadline: deadline || null, intern,
    })
    if (error) return setFout('Opslaan mislukt.')
    klaar()
  }

  return (
    <form className="kaart" onSubmit={opslaan}>
      <h2>Nieuwe taak</h2>
      {objectId && <p className="zacht">Voor: {object ?? '…'}</p>}
      <label htmlFor="omschrijving">Wat moet er gebeuren?</label>
      <input id="omschrijving" required value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} />
      <label htmlFor="toegewezen">Toewijzen aan</label>
      <select id="toegewezen" value={toegewezen} onChange={(e) => setToegewezen(e.target.value)}>
        <option value="">— later —</option>
        {team.map((t) => <option key={t.id} value={t.id}>{t.naam}</option>)}
      </select>
      <label htmlFor="deadline">Uiterlijk klaar op</label>
      <input id="deadline" type="date" min={vandaag()} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      <label className="vink">
        <input type="checkbox" checked={intern} onChange={(e) => setIntern(e.target.checked)} />
        Intern (niet zichtbaar voor de golfclub)
      </label>
      {fout && <div className="melding fout">{fout}</div>}
      <div className="knoppenrij">
        <button className="knop">Taak opslaan</button>
        <button type="button" className="knop tweede" onClick={sluit}>Annuleren</button>
      </div>
    </form>
  )
}
