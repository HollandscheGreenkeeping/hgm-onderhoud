import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useLocatie } from '../lib/locatie'
import { useSessie } from '../lib/sessie'
import { useKeuzelijst, useTeam } from '../lib/keuzelijst'
import { plekRijen, useBaan, type Plekkeuze } from '../lib/baan'
import { vandaag } from '../lib/teksten'
import PlekKiezer from './PlekKiezer'

type MiddelRij = { middel_id: string; per_ha: string; totaal: string }

const getal = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))
const rond = (n: number) => String(Math.round(n * 100) / 100)

// Werk vastleggen, of (met planning=true) klaarzetten voor een medewerker in de dagplanning.
export default function WerkFormulier({ planning = false, datumStart, klaar, annuleer }: {
  planning?: boolean
  datumStart?: string
  klaar: () => void
  annuleer: () => void
}) {
  const { locatie, magPlannen } = useLocatie()
  const { sessie } = useSessie()
  const activiteiten = useKeuzelijst('activiteit', locatie.id)
  const middelen = useKeuzelijst('middel', locatie.id)
  const team = useTeam(locatie.id)
  const { holes, vlakken } = useBaan(locatie.id)
  const [machines, setMachines] = useState<{ id: string; naam: string }[]>([])

  const [activiteit, setActiviteit] = useState('')
  const [datum, setDatum] = useState(datumStart ?? vandaag())
  const [medewerker, setMedewerker] = useState(planning ? '' : sessie!.user.id)
  const [machine, setMachine] = useState('')
  const [plek, setPlek] = useState<Plekkeuze>({ holeIds: [], types: [] })
  const [minuten, setMinuten] = useState('')
  const [notitie, setNotitie] = useState('')
  const [middelRijen, setMiddelRijen] = useState<MiddelRij[]>([])
  const [haHandmatig, setHaHandmatig] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('machines').select('id, naam, merk, model').eq('locatie_id', locatie.id).is('gearchiveerd_op', null)
      .order('naam').then(({ data }) => setMachines((data ?? []).map((m) => ({
        id: m.id, naam: m.naam ?? [m.merk, m.model].filter(Boolean).join(' '),
      }))))
  }, [locatie.id])

  const { rijen, ha: haKaart } = plekRijen(plek, holes, vlakken)
  const ha = haKaart > 0 ? haKaart : getal(haHandmatig) ?? 0
  const naamActiviteit = activiteiten.find((a) => a.id === activiteit)?.naam.toLowerCase() ?? ''
  const metMiddelen = middelRijen.length > 0 || /bemest|spuit|gewas/.test(naamActiviteit)

  function zetMiddel(i: number, deel: Partial<MiddelRij>) {
    setMiddelRijen((r) => r.map((m, j) => {
      if (j !== i) return m
      const nieuw = { ...m, ...deel }
      // Per ha en totaal rekenen elkaar uit zodra de oppervlakte bekend is.
      if (ha > 0 && 'per_ha' in deel) nieuw.totaal = getal(deel.per_ha!) != null ? rond(getal(deel.per_ha!)! * ha) : ''
      if (ha > 0 && 'totaal' in deel) nieuw.per_ha = getal(deel.totaal!) != null ? rond(getal(deel.totaal!)! / ha) : ''
      return nieuw
    }))
  }

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    if (!activiteit) return setFout('Kies een activiteit.')
    if (!medewerker) return setFout('Kies een medewerker.')
    setBezig(true)
    setFout(null)
    const { data, error } = await supabase.from('werkzaamheden').insert({
      locatie_id: locatie.id, activiteit_id: activiteit, datum, medewerker_id: medewerker,
      machine_id: machine || null, notitie: notitie || null, uitgevoerd: !planning,
    }).select('id').single()
    if (error) {
      setBezig(false)
      return setFout('Opslaan mislukt.')
    }
    try {
      if (rijen.length) {
        await supabase.from('werkzaamheden_vlakken').insert(rijen.map((r) => ({ ...r, werkzaamheid_id: data.id }))).throwOnError()
      }
      const geldig = middelRijen.filter((m) => m.middel_id && (getal(m.totaal) != null || getal(m.per_ha) != null))
      if (geldig.length) {
        await supabase.from('middelen_gebruik').insert(geldig.map((m) => ({
          werkzaamheid_id: data.id, middel_id: m.middel_id,
          hoeveelheid_totaal: getal(m.totaal), hoeveelheid_per_ha: getal(m.per_ha),
          eenheid: middelen.find((x) => x.id === m.middel_id)?.eenheid ?? 'kg',
          oppervlakte_ha: ha > 0 ? Math.round(ha * 1000) / 1000 : null,
        }))).throwOnError()
      }
      if (!planning && Number(minuten) > 0) {
        await supabase.from('uren').insert({
          locatie_id: locatie.id, profiel_id: medewerker, datum, minuten: Number(minuten),
          bron_tabel: 'werkzaamheden', bron_id: data.id,
        }).throwOnError()
      }
    } catch {
      setBezig(false)
      return setFout('Werk opgeslagen, maar plekken, middelen of tijd niet volledig. Controleer het overzicht.')
    }
    klaar()
  }

  return (
    <form className="kaart" onSubmit={opslaan}>
      <h2>{planning ? 'Werk klaarzetten' : 'Werk registreren'}</h2>

      <span className="veldlabel">Activiteit</span>
      {activiteiten.length === 0 && <p className="zacht">Nog geen activiteiten ingesteld (Instellingen → Keuzelijsten).</p>}
      <div className="chips">
        {activiteiten.map((a) => (
          <button type="button" key={a.id} aria-pressed={activiteit === a.id}
                  className={`chip ${activiteit === a.id ? 'aan' : ''}`} onClick={() => setActiviteit(a.id)}>
            {a.naam}
          </button>
        ))}
      </div>

      <div className="twee-kolommen">
        <div>
          <label htmlFor="datum">Datum</label>
          <input id="datum" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </div>
        {(magPlannen || planning) && (
          <div>
            <label htmlFor="medewerker">Medewerker</label>
            <select id="medewerker" value={medewerker} onChange={(e) => setMedewerker(e.target.value)}>
              <option value="">— kies —</option>
              <option value={sessie!.user.id}>Ikzelf</option>
              {team.filter((t) => t.id !== sessie!.user.id).map((t) => (
                <option key={t.id} value={t.id}>{t.naam}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <PlekKiezer holes={holes} vlakken={vlakken} keuze={plek} wijzig={setPlek} />

      {machines.length > 0 && (
        <>
          <label htmlFor="machine">Machine</label>
          <select id="machine" value={machine} onChange={(e) => setMachine(e.target.value)}>
            <option value="">— geen —</option>
            {machines.map((m) => <option key={m.id} value={m.id}>{m.naam}</option>)}
          </select>
        </>
      )}

      {metMiddelen ? (
        <fieldset className="middelen">
          <legend>Middelen (bemesting / gewasbescherming)</legend>
          {haKaart === 0 && (
            <>
              <label htmlFor="ha">Behandelde oppervlakte (ha)</label>
              <input id="ha" inputMode="decimal" value={haHandmatig} onChange={(e) => setHaHandmatig(e.target.value)}
                     placeholder="Bijv. 1,2" />
            </>
          )}
          {middelRijen.map((m, i) => {
            const eenheid = middelen.find((x) => x.id === m.middel_id)?.eenheid ?? ''
            return (
              <div key={i} className="middel-rij">
                <select aria-label="Middel" value={m.middel_id} onChange={(e) => zetMiddel(i, { middel_id: e.target.value })}>
                  <option value="">— middel —</option>
                  {middelen.map((x) => <option key={x.id} value={x.id}>{x.naam}{x.eenheid ? ` (${x.eenheid})` : ''}</option>)}
                </select>
                <input aria-label="Per hectare" inputMode="decimal" placeholder={`per ha ${eenheid}`} value={m.per_ha}
                       onChange={(e) => zetMiddel(i, { per_ha: e.target.value })} />
                <input aria-label="Totaal" inputMode="decimal" placeholder={`totaal ${eenheid}`} value={m.totaal}
                       onChange={(e) => zetMiddel(i, { totaal: e.target.value })} />
                <button type="button" className="knop tweede klein" aria-label="Middel verwijderen"
                        onClick={() => setMiddelRijen((r) => r.filter((_, j) => j !== i))}>×</button>
              </div>
            )
          })}
          {middelen.length === 0 && <p className="zacht">Nog geen middelen ingesteld (Instellingen → Keuzelijsten).</p>}
          <button type="button" className="knop tweede" disabled={!middelen.length}
                  onClick={() => setMiddelRijen((r) => [...r, { middel_id: '', per_ha: '', totaal: '' }])}>
            + Middel
          </button>
        </fieldset>
      ) : (
        <button type="button" className="knop tweede klein" onClick={() => setMiddelRijen([{ middel_id: '', per_ha: '', totaal: '' }])}>
          + Middel toevoegen
        </button>
      )}

      {!planning && (
        <>
          <label htmlFor="minuten">Tijd (minuten, intern)</label>
          <input id="minuten" type="number" inputMode="numeric" min={1} max={1440} value={minuten}
                 onChange={(e) => setMinuten(e.target.value)} />
        </>
      )}
      <label htmlFor="notitie">Notitie</label>
      <input id="notitie" value={notitie} onChange={(e) => setNotitie(e.target.value)}
             placeholder={planning ? 'Bijv. maaihoogte 3,5 mm' : ''} />

      {fout && <div className="melding fout">{fout}</div>}
      <div className="knoppenrij">
        <button className="knop" disabled={bezig}>{bezig ? 'Opslaan…' : planning ? 'Klaarzetten' : 'Opslaan'}</button>
        <button type="button" className="knop tweede" onClick={annuleer}>Annuleren</button>
      </div>
    </form>
  )
}
