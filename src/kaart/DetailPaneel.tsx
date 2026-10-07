import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { useLocatie } from '../lib/locatie'
import { fotosVan, type Foto } from '../lib/fotos'
import { datum, objectStatus, storingStatus, taakStatus } from '../lib/teksten'
import type { MeldDoel } from '../components/StoringMelden'
import type { Selectie } from './data'

const nauwkeurigheid: Record<string, string> = {
  tekening: 'Overgetrokken van tekening',
  veld_gecontroleerd: 'In het veld gecontroleerd',
  rtk_gps: 'Ingemeten met RTK-GPS',
}

type Storing = {
  id: string; omschrijving: string | null; status: string; urgentie: string
  gemeld_op: string; opgelost_op: string | null; oplossing: string | null
  keuzelijst_waarden: { naam: string } | null
}
type Taak = { id: string; omschrijving: string; status: string; deadline: string | null; gepland_op: string | null; afgerond_op: string | null }

type Details = {
  titel: string
  status?: string
  velden: [string, string | number | null | undefined][]
  waarschuwing?: string
  storingen: Storing[]
  taken: Taak[]
  fotos: Foto[]
}

const storingVelden = 'id, omschrijving, status, urgentie, gemeld_op, opgelost_op, oplossing, keuzelijst_waarden(naam)'

async function laadDetails(s: Selectie): Promise<Details> {
  if (s.soort === 'object') {
    const [o, st, tk, ft] = await Promise.all([
      supabase.from('objecten')
        .select('code, merk, model, aanlegjaar, status, eigenschappen, objecttypes(naam), holes(nummer, lussen(naam))')
        .eq('id', s.id).single(),
      supabase.from('storingen').select(storingVelden).eq('object_id', s.id).order('gemeld_op', { ascending: false }),
      supabase.from('taken').select('id, omschrijving, status, deadline, gepland_op, afgerond_op')
        .eq('object_id', s.id).order('aangemaakt_op', { ascending: false }),
      fotosVan('objecten', s.id),
    ])
    if (o.error) throw o.error
    const d = o.data as any
    const eigenschappen = Object.entries((d.eigenschappen ?? {}) as Record<string, string | number>)
    return {
      titel: [d.objecttypes?.naam, d.code].filter(Boolean).join(' '),
      status: objectStatus[d.status],
      velden: [
        ['Hole', d.holes ? `${d.holes.nummer} (${d.holes.lussen?.naam})` : null],
        ['Merk', d.merk], ['Model', d.model], ['Aanlegjaar', d.aanlegjaar],
        ...eigenschappen.map(([k, v]) => [k, v] as [string, string | number]),
      ],
      storingen: (st.data ?? []) as unknown as Storing[],
      taken: tk.data ?? [],
      fotos: ft,
    }
  }
  if (s.soort === 'leiding') {
    const [l, st, ft] = await Promise.all([
      supabase.from('leidingen')
        .select('type, materiaal, diameter_mm, diepte_cm, aanlegjaar, nauwkeurigheid, opmerking')
        .eq('id', s.id).single(),
      supabase.from('storingen').select(storingVelden).eq('leiding_id', s.id).order('gemeld_op', { ascending: false }),
      fotosVan('leidingen', s.id),
    ])
    if (l.error) throw l.error
    const d = l.data
    return {
      titel: `Leiding ${d.type}`,
      velden: [
        ['Materiaal', d.materiaal],
        ['Diameter', d.diameter_mm ? `${d.diameter_mm} mm` : null],
        ['Diepte', d.diepte_cm ? `${d.diepte_cm} cm` : null],
        ['Aanlegjaar', d.aanlegjaar],
        ['Nauwkeurigheid', nauwkeurigheid[d.nauwkeurigheid]],
        ['Opmerking', d.opmerking],
      ],
      waarschuwing: d.nauwkeurigheid === 'tekening'
        ? 'Ligging overgetrokken van een tekening en niet in het veld gecontroleerd. Niet op vertrouwen bij graafwerk.'
        : undefined,
      storingen: (st.data ?? []) as unknown as Storing[],
      taken: [],
      fotos: ft,
    }
  }
  const [m, ft] = await Promise.all([
    supabase.from('storingen').select(storingVelden).eq('id', s.id).single(),
    fotosVan('storingen', s.id),
  ])
  if (m.error) throw m.error
  const d = m.data as unknown as Storing
  return {
    titel: d.keuzelijst_waarden?.naam ?? 'Melding',
    status: storingStatus[d.status],
    velden: [['Omschrijving', d.omschrijving], ['Urgentie', d.urgentie], ['Gemeld', datum(d.gemeld_op)]],
    storingen: [],
    taken: [],
    fotos: ft,
  }
}

export default function DetailPaneel({ selectie, sluit, corrigeerPositie, meldStoring }: {
  selectie: Selectie
  sluit: () => void
  corrigeerPositie: () => void
  meldStoring: (doel: MeldDoel) => void
}) {
  const { locatie, magRegistreren, magPlannen } = useLocatie()
  const basis = `/locatie/${locatie.id}`
  const [details, setDetails] = useState<Details | null>(null)
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    setDetails(null)
    setFout(null)
    laadDetails(selectie).then(setDetails).catch(() => setFout('Gegevens konden niet worden geladen.'))
  }, [selectie])

  const open = details?.storingen.filter((s) => !['opgelost', 'gecontroleerd'].includes(s.status)) ?? []
  const openTaken = details?.taken.filter((t) => ['open', 'in_behandeling'].includes(t.status)) ?? []
  const historie = [
    ...(details?.storingen.filter((s) => !open.includes(s)).map((s) => ({
      sleutel: s.id, datum: s.opgelost_op ?? s.gemeld_op,
      tekst: `Storing: ${s.keuzelijst_waarden?.naam ?? s.omschrijving ?? ''}`, sub: s.oplossing, storing: true,
    })) ?? []),
    ...(details?.taken.filter((t) => t.status === 'afgerond').map((t) => ({
      sleutel: t.id, datum: t.afgerond_op!, tekst: t.omschrijving, sub: null, storing: false,
    })) ?? []),
  ].sort((a, b) => b.datum.localeCompare(a.datum))

  return (
    <aside className="paneel detailpaneel" aria-label="Details">
      <div className="paneel-kop">
        <strong>{details?.titel ?? 'Laden…'}</strong>
        <button className="knop tweede klein" onClick={sluit}>Sluiten</button>
      </div>
      {fout && <div className="melding fout">{fout}</div>}
      {details && (
        <>
          {open.length > 0 && selectie.soort !== 'melding'
            ? <p><span className="label storing">Open storing</span></p>
            : details.status && <p><span className={`label ${openTaken.length ? 'gepland' : ''}`}>
                {openTaken.length ? 'Onderhoud gepland' : details.status}
              </span></p>}
          {details.waarschuwing && <div className="melding waarschuwing">{details.waarschuwing}</div>}

          <dl className="velden">
            {details.velden.filter(([, w]) => w != null && w !== '').map(([k, w]) => (
              <div key={k}><dt>{k}</dt><dd>{w}</dd></div>
            ))}
          </dl>

          {selectie.soort === 'melding' && (
            <Link className="knop breed" to={`${basis}/storingen/${selectie.id}`}>Melding openen</Link>
          )}
          {selectie.soort !== 'melding' && (magRegistreren || magPlannen) && (
            <div className="knoppenrij paneel-acties">
              {magRegistreren && (
                <button className="knop" onClick={() => meldStoring({ soort: selectie.soort as 'object' | 'leiding', id: selectie.id, titel: details.titel })}>
                  Storing melden
                </button>
              )}
              {selectie.soort === 'object' && magPlannen && (
                <Link className="knop tweede" to={`${basis}/taken/nieuw?object=${selectie.id}`}>Taak plannen</Link>
              )}
              {selectie.soort === 'object' && magRegistreren && (
                <button className="knop tweede" onClick={corrigeerPositie}>Positie corrigeren</button>
              )}
            </div>
          )}

          {details.fotos.length > 0 && (
            <section>
              <h2>Foto's</h2>
              <div className="fotos">
                {details.fotos.map((f) => (
                  <a key={f.id} href={f.url} target="_blank" rel="noreferrer">
                    <img src={f.url} alt={f.omschrijving ?? 'Foto'} />
                  </a>
                ))}
              </div>
            </section>
          )}

          {(open.length > 0 || openTaken.length > 0) && (
            <section>
              <h2>Openstaand</h2>
              <ul className="tijdlijn">
                {open.map((s) => (
                  <li key={s.id} className="storing">
                    <Link to={`${basis}/storingen/${s.id}`}><strong>{s.keuzelijst_waarden?.naam ?? 'Storing'}</strong></Link>
                    {' · '}{storingStatus[s.status]}
                    <div className="zacht">{s.omschrijving} · {datum(s.gemeld_op)}</div>
                  </li>
                ))}
                {openTaken.map((t) => (
                  <li key={t.id} className="gepland">
                    <strong>{t.omschrijving}</strong> · {taakStatus[t.status]}
                    <div className="zacht">{t.deadline ? `Uiterlijk ${datum(t.deadline)}` : datum(t.gepland_op)}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {selectie.soort !== 'melding' && (
            <section>
              <h2>Onderhoudshistorie</h2>
              {historie.length === 0 && <p className="zacht">Nog geen onderhoud geregistreerd.</p>}
              <ul className="tijdlijn">
                {historie.map((h) => (
                  <li key={h.sleutel}>
                    {h.storing
                      ? <Link to={`${basis}/storingen/${h.sleutel}`}><strong>{h.tekst}</strong></Link>
                      : <strong>{h.tekst}</strong>}
                    <div className="zacht">{datum(h.datum)}{h.sub ? ` · ${h.sub}` : ''}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </aside>
  )
}
