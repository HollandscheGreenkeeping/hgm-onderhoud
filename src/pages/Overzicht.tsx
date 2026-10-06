import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { rolNamen, supabase } from '../lib/supabase'
import { useLocatie } from '../lib/locatie'
import { datum, openStoringStatussen, vandaag } from '../lib/teksten'
import { storingVelden, type Storing } from '../lib/storingen'
import StoringRij from '../components/StoringRij'

export type Cijfers = {
  locatie_id: string; naam: string; open_storingen: number; spoed_storingen: number; open_taken: number
  verlopen_taken: number; werk_deze_week: number; machines_onderhoud: number; open_voorstellen: number
}

// Dashboard van één baan: wat vraagt nu aandacht, en wat is er deze week gedaan.
export default function Overzicht() {
  const { locatie, rol, magPlannen } = useLocatie()
  const [c, setC] = useState<Cijfers | null>(null)
  const [storingen, setStoringen] = useState<Storing[]>([])
  const [verlopen, setVerlopen] = useState<{ id: string; omschrijving: string; deadline: string }[]>([])
  const [werk, setWerk] = useState<[string, number][]>([])
  const basis = `/locatie/${locatie.id}`

  useEffect(() => {
    const maandag = new Date()
    maandag.setDate(maandag.getDate() - ((maandag.getDay() + 6) % 7))
    Promise.all([
      supabase.rpc('dashboard_cijfers', { p_locatie: locatie.id }),
      supabase.from('storingen').select(storingVelden)
        .eq('locatie_id', locatie.id).in('status', openStoringStatussen)
        .order('urgentie', { ascending: false }).order('gemeld_op').limit(5),
      supabase.from('taken').select('id, omschrijving, deadline').eq('locatie_id', locatie.id)
        .in('status', ['open', 'in_behandeling']).lt('deadline', vandaag()).order('deadline').limit(5),
      supabase.from('werkzaamheden').select('activiteit:keuzelijst_waarden(naam)').eq('locatie_id', locatie.id)
        .eq('uitgevoerd', true).gte('datum', maandag.toISOString().slice(0, 10)),
    ]).then(([cijfers, st, vt, wz]) => {
      setC(cijfers.data?.[0] ?? null)
      setStoringen((st.data ?? []) as never)
      setVerlopen((vt.data ?? []) as never)
      const telling = new Map<string, number>()
      for (const w of (wz.data ?? []) as unknown as { activiteit: { naam: string } | null }[]) {
        const n = w.activiteit?.naam ?? 'Overig'
        telling.set(n, (telling.get(n) ?? 0) + 1)
      }
      setWerk([...telling].sort((a, b) => b[1] - a[1]))
    })
  }, [locatie.id])

  const tegels: [string, number | undefined, string, string?][] = [
    ['Open storingen', c?.open_storingen, `${basis}/storingen`, c?.spoed_storingen ? `${c.spoed_storingen} met hoge urgentie` : undefined],
    ['Verlopen taken', c?.verlopen_taken, `${basis}/onderhoud`, c ? `${c.open_taken} taken open` : undefined],
    ['Werk deze week', c?.werk_deze_week, `${basis}/werk`],
    ['Machines met onderhoud', c?.machines_onderhoud, `${basis}/materieel`],
    ...(magPlannen ? [['Positievoorstellen', c?.open_voorstellen, `${basis}/voorstellen`] as [string, number | undefined, string]] : []),
  ]

  return (
    <main>
      <h1>Dashboard</h1>
      <p className="zacht">{locatie.naam} · jouw rol: {rolNamen[rol]}</p>
      <div className="tellers">
        {tegels.map(([naam, getal, link, sub]) => (
          <Link key={naam} to={link} className={`teller ${getal && (naam.startsWith('Open') || naam.startsWith('Verlopen')) ? 'aandacht' : ''}`}>
            <div className="getal">{getal ?? '–'}</div>
            <div className="naam">{naam}</div>
            {sub && <div className="zacht klein-tekst">{sub}</div>}
          </Link>
        ))}
      </div>

      {storingen.length > 0 && (
        <section>
          <h2>Openstaande storingen</h2>
          <ul className="lijst">
            {storingen.map((s) => (
              <li key={s.id}><StoringRij storing={s} naar={`${basis}/storingen/${s.id}`} /></li>
            ))}
          </ul>
        </section>
      )}

      {verlopen.length > 0 && (
        <section>
          <h2>Verlopen taken</h2>
          <ul className="lijst">
            {verlopen.map((t) => (
              <li key={t.id}>
                <Link className="rij verlopen" to={`${basis}/taken`}>
                  <span className="rij-hoofd"><strong>{t.omschrijving}</strong><span className="zacht">uiterlijk {datum(t.deadline)}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Werk deze week</h2>
        {werk.length === 0 && <p className="zacht">Nog niets geregistreerd deze week.</p>}
        <ul className="staven">
          {werk.map(([naam, n]) => (
            <li key={naam}>
              <span>{naam}</span>
              <span className="staaf" style={{ width: `${(n / werk[0][1]) * 100}%` }} />
              <strong>{n}</strong>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
