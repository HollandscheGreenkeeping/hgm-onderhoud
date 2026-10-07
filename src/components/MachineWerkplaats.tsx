import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { useSessie } from '../lib/sessie'
import { useLocatie } from '../lib/locatie'
import { datum } from '../lib/teksten'
import {
  certificaatOpenen, keuringStaat, keuringVelden, werkorderCode, werkorderKlasse, werkorderStatus, werkorderVelden,
  type Keuring, type Werkorder,
} from '../lib/werkplaats'
import WerkorderAanvragen from './WerkorderAanvragen'
import KeuringFormulier from './KeuringFormulier'

type Kosten = { werkorders: number; minuten: number; onderdelen: number; uurkosten: number; totaal: number }
const euro = (n: number) => `€ ${Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Op de machinepagina: werkorders, keuringen en (wie mag plannen) de kosten van deze machine.
// De werkplaats zelf (plannen, uren, onderdelen) staat onder Werkplaats, buiten de baan.
export default function MachineWerkplaats({ machineId, eigen }: { machineId: string; eigen: boolean }) {
  const { locatie, magRegistreren, magPlannen } = useLocatie()
  const { profiel } = useSessie()
  const werkplaats = ['beheer', 'onderhoudsmanager', 'monteur'].includes(profiel?.globale_rol ?? '')
  const [werkorders, setWerkorders] = useState<Werkorder[]>([])
  const [keuringen, setKeuringen] = useState<Keuring[]>([])
  const [kosten, setKosten] = useState<Kosten | null>(null)
  const [modus, setModus] = useState<'aanvragen' | 'keuring' | null>(null)

  const laad = useCallback(async () => {
    const [w, k, c] = await Promise.all([
      supabase.from('werkorders').select(werkorderVelden).eq('machine_id', machineId).order('aangevraagd_op', { ascending: false }).limit(20),
      supabase.from('keuringen').select(keuringVelden).eq('machine_id', machineId).is('gearchiveerd_op', null).order('geldig_tot'),
      magPlannen ? supabase.rpc('machine_kosten', { p_locatie: locatie.id }) : Promise.resolve({ data: [] }),
    ])
    setWerkorders((w.data ?? []) as unknown as Werkorder[])
    setKeuringen((k.data ?? []) as unknown as Keuring[])
    setKosten(((c.data ?? []) as (Kosten & { machine_id: string })[]).find((r) => r.machine_id === machineId) ?? null)
  }, [machineId, magPlannen, locatie.id])
  useEffect(() => { laad() }, [laad])

  // Wie geen werkorders mag zien (baanmanager) krijgt dit blok niet.
  if (!magRegistreren) return null

  return (
    <section className="kaart">
      <h2>Werkplaats</h2>
      {modus === 'aanvragen' && (
        <WerkorderAanvragen machineId={machineId} klaar={() => { setModus(null); laad() }} annuleer={() => setModus(null)} />
      )}
      {werkorders.length === 0 && modus !== 'aanvragen' && <p className="zacht">Nog geen werkorders voor deze machine.</p>}
      <ul className="lijst">
        {werkorders.map((w) => {
          const inhoud = (
            <>
              <span className="rij-hoofd">
                <span className="rij-id">{werkorderCode(w)}</span>
                <span className={`label ${werkorderKlasse(w.status)}`}>{werkorderStatus[w.status]}</span>
              </span>
              <strong>{w.omschrijving}</strong>
              <span className="rij-meta">
                <span>{w.monteur?.naam ?? 'Nog geen monteur'}</span>
                {w.gepland_op && <><span>·</span><span>gepland {datum(w.gepland_op)}</span></>}
                <span className="mono" style={{ marginLeft: 'auto' }}>{datum(w.afgerond_op ?? w.aangevraagd_op)}</span>
              </span>
            </>
          )
          return (
            <li key={w.id}>
              {werkplaats
                ? <Link className={`rij urgentie-${w.urgentie}`} to={`/werkplaats/werkorders/${w.id}`}>{inhoud}</Link>
                : <div className={`rij urgentie-${w.urgentie}`}>{inhoud}</div>}
            </li>
          )
        })}
      </ul>
      {eigen && !modus && (
        <button className="knop tweede" onClick={() => setModus('aanvragen')}>Werkorder aanvragen</button>
      )}

      <h3>Keuringen</h3>
      {modus === 'keuring' && (
        <KeuringFormulier machineId={machineId} klaar={() => { setModus(null); laad() }} annuleer={() => setModus(null)} />
      )}
      {keuringen.length === 0 && modus !== 'keuring' && <p className="zacht">Geen keuringen vastgelegd.</p>}
      <ul className="tijdlijn">
        {keuringen.map((k) => {
          const { dagen, staat } = keuringStaat(k)
          return (
            <li key={k.id} className={staat === 'verlopen' ? 'storing' : staat === 'binnenkort' ? 'gepland' : ''}>
              <strong>{k.soort?.naam}</strong>
              <div className="zacht">
                geldig tot {datum(k.geldig_tot)}
                {staat === 'verlopen' ? ` · ${-dagen} dagen verlopen` : staat === 'binnenkort' ? ` · nog ${dagen} dagen` : ''}
                {k.certificaat_pad && <> · <button type="button" className="tekstlink" onClick={() => certificaatOpenen(k.certificaat_pad!)}>certificaat</button></>}
              </div>
            </li>
          )
        })}
      </ul>
      {(magPlannen || werkplaats) && eigen && !modus && (
        <button className="knop tweede" onClick={() => setModus('keuring')}>Keuring vastleggen</button>
      )}

      {kosten && kosten.werkorders > 0 && (
        <>
          <h3>Kosten <small className="zacht">(intern)</small></h3>
          <p>
            {kosten.werkorders} werkorder{kosten.werkorders === 1 ? '' : 's'} · {Math.round((kosten.minuten / 60) * 10) / 10} uur ·
            onderdelen {euro(kosten.onderdelen)} · <strong>totaal {euro(kosten.totaal)}</strong>
          </p>
        </>
      )}
    </section>
  )
}
