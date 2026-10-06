import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { huisstijlUrl, supabase } from '../lib/supabase'
import { useLocatie } from '../lib/locatie'
import { useKeuzelijst } from '../lib/keuzelijst'
import { uploadFotos } from '../lib/fotos'
import { puntEwkt } from '../kaart/data'
import FotoKiezer from './FotoKiezer'

export type MeldDoel =
  | { soort: 'object' | 'leiding' | 'machine'; id: string; titel: string }
  | { soort: 'plek' }

const urgenties: [string, string, string][] = [
  ['laag', 'Laag', 'var(--kleur-overig)'],
  ['normaal', 'Normaal', 'var(--kleur-beregening)'],
  ['hoog', 'Hoog', 'var(--kleur-gepland)'],
  ['spoed', 'Spoed', 'var(--kleur-storing)'],
]

const kleur = (c: string) => ({ '--c': c }) as CSSProperties

// Storing melden in drie stappen: waar · wat · hoe dringend. Groot en duidelijk voor gebruik
// buiten. Bij een plek geeft de aanroeper de coördinaat mee bij het versturen (kruisje of GPS).
export default function StoringMelden({ doel, plek, klaar, annuleer }: {
  doel: MeldDoel
  plek?: () => [number, number] | null
  klaar: (storingId: string) => void
  annuleer: () => void
}) {
  const { locatie, magPlannen } = useLocatie()
  const types = useKeuzelijst('storingstype', locatie.id)
  const [stap, setStap] = useState(1)
  const [typeId, setTypeId] = useState('')
  const [urgentie, setUrgentie] = useState('normaal')
  const [omschrijving, setOmschrijving] = useState('')
  const [intern, setIntern] = useState(false)
  const [fotos, setFotos] = useState<File[]>([])
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const logo = locatie.klantlogo_pad ? huisstijlUrl(locatie.klantlogo_pad) : null
  const wortel = useRef<HTMLDivElement>(null)

  // Elke stap begint bovenaan (het paneel kan halverwege gescrold staan).
  useEffect(() => { wortel.current?.closest('.paneel')?.scrollTo({ top: 0 }) }, [stap])

  async function verstuur() {
    const positie = doel.soort === 'plek' ? plek?.() : null
    if (doel.soort === 'plek' && !positie) return setFout('Geen plek bekend.')
    if (!typeId && !omschrijving.trim()) {
      setStap(2)
      return setFout('Kies een soort storing of beschrijf wat er aan de hand is.')
    }
    setBezig(true)
    setFout(null)
    const { data: gebruiker } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('storingen').insert({
      locatie_id: locatie.id,
      object_id: doel.soort === 'object' ? doel.id : null,
      leiding_id: doel.soort === 'leiding' ? doel.id : null,
      machine_id: doel.soort === 'machine' ? doel.id : null,
      geom: positie ? puntEwkt(positie) : null,
      storingstype_id: typeId || null,
      urgentie,
      omschrijving: omschrijving || null,
      intern,
      gemeld_door: gebruiker.user?.id,
    }).select('id').single()
    if (error) {
      setBezig(false)
      return setFout('Melden mislukt. Probeer het opnieuw.')
    }
    try {
      if (fotos.length) await uploadFotos(locatie.id, 'storingen', data.id, fotos, { intern })
    } catch {
      setBezig(false)
      return setFout("De storing is gemeld, maar de foto's konden niet worden geüpload.")
    }
    klaar(data.id)
  }

  const koppen = ['Waar is het?', 'Wat is er aan de hand?', 'Hoe dringend?']

  return (
    <div className="meldflow" ref={wortel}>
      <div className="meldflow-kop">
        <button type="button" className="knop tweede klein" onClick={() => (stap > 1 ? setStap(stap - 1) : annuleer())}>
          ← {stap > 1 ? 'Terug' : 'Annuleren'}
        </button>
        {logo && <img src={logo} alt="" className="meldflow-logo" />}
        <span className="mono">stap {stap} van 3</span>
      </div>
      <ol className="stappen" aria-label="Voortgang">
        {['Waar', 'Wat', 'Urgentie'].map((n, i) => <li key={n} className={i < stap ? 'gedaan' : ''}>{n}</li>)}
      </ol>
      <h2 className="meldflow-titel">{doel.soort === 'machine' && stap === 1 ? 'Welke machine?' : koppen[stap - 1]}</h2>

      {stap === 1 && (
        doel.soort === 'plek' ? (
          <div className="kaart">
            <strong>Plek op de kaart</strong>
            <p className="zacht">
              Verschuif de kaart tot het kruisje precies op de plek staat, of druk op "Naar mijn GPS"
              op de kaart. Bijvoorbeeld een natte plek of lekkage zonder bekend object.
            </p>
          </div>
        ) : (
          <div className="kaart">
            <span className="label-klein">{doel.soort === 'machine' ? 'Machine' : doel.soort === 'leiding' ? 'Leiding' : 'Object'}</span>
            <p><strong>{doel.titel}</strong></p>
          </div>
        )
      )}

      {stap === 2 && (
        <>
          {types.length > 0 ? (
            <div className="tegels">
              {types.map((t) => (
                <button type="button" key={t.id} aria-pressed={typeId === t.id}
                        className={`tegel ${typeId === t.id ? 'aan' : ''}`}
                        onClick={() => setTypeId(typeId === t.id ? '' : t.id)}>
                  {t.naam}
                </button>
              ))}
            </div>
          ) : (
            <p className="zacht">Er zijn nog geen storingstypes ingesteld; beschrijf de storing hieronder.</p>
          )}
          <label htmlFor="omschrijving">Omschrijving</label>
          <textarea id="omschrijving" rows={3} value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)}
                    placeholder="Wat zie je?" />
          <span className="veldlabel">Foto's</span>
          <FotoKiezer fotos={fotos} wijzig={setFotos} />
        </>
      )}

      {stap === 3 && (
        <>
          <div className="tegels">
            {urgenties.map(([w, n, c]) => (
              <button type="button" key={w} aria-pressed={urgentie === w} style={kleur(c)}
                      className={`tegel ${urgentie === w ? 'aan' : ''}`} onClick={() => setUrgentie(w)}>
                {n}
              </button>
            ))}
          </div>
          <label className="vink">
            <input type="checkbox" checked={intern} onChange={(e) => setIntern(e.target.checked)} />
            Intern (niet zichtbaar voor de golfclub)
          </label>
          {!magPlannen && <p className="zacht klein-tekst">De hoofd-greenkeeper ziet je melding en wijst hem toe.</p>}
        </>
      )}

      {fout && <div className="melding fout">{fout}</div>}
      <div className="meldflow-voet">
        {stap < 3
          ? <button type="button" className="knop breed groot" onClick={() => { setFout(null); setStap(stap + 1) }}>
              Volgende: {stap === 1 ? 'wat is er aan de hand' : 'urgentie'}
            </button>
          : <button type="button" className="knop melden breed groot" disabled={bezig} onClick={verstuur}>
              {bezig ? 'Bezig met versturen…' : 'Storing versturen'}
            </button>}
      </div>
    </div>
  )
}
