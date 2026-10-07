import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { datum } from '../lib/teksten'
import { certificaatOpenen, keuringDoel, keuringStaat, keuringVelden, type Keuring } from '../lib/werkplaats'
import KeuringFormulier from '../components/KeuringFormulier'
import { Chip, DataTabel, PaginaKop, useUrlParam, useZoekfilter, Weergaven, Werkbalk, Zoekveld, type Kolom } from '../components/tabel'

// Werkplaats → Keuringen: verlopen en binnenkort eerst. Weergave en bewerken (?bewerk=id|nieuw) in de URL.
export default function Keuringen() {
  const [keuringen, setKeuringen] = useState<Keuring[] | null>(null)
  const [weergave] = useUrlParam('weergave', 'aandacht')
  const [bewerk, zetBewerk] = useUrlParam('bewerk')

  const laad = useCallback(() => {
    supabase.from('keuringen').select(keuringVelden).is('gearchiveerd_op', null).order('geldig_tot')
      .then(({ data }) => setKeuringen((data ?? []) as unknown as Keuring[]))
  }, [])
  useEffect(laad, [laad])

  async function archiveer(k: Keuring) {
    if (!window.confirm('Deze keuring archiveren? Bijvoorbeeld omdat de machine weg is.')) return
    await supabase.from('keuringen').update({ gearchiveerd_op: new Date().toISOString() }).eq('id', k.id)
    zetBewerk('')
    laad()
  }

  type Rij = Keuring & { dagen: number; staat: 'verlopen' | 'binnenkort' | 'geldig' }
  const metStaat: Rij[] | null = keuringen?.map((k) => ({ ...k, ...keuringStaat(k) })) ?? null
  const aandacht = metStaat?.filter((x) => x.staat !== 'geldig') ?? null
  const rijen = useZoekfilter(weergave === 'alle' ? metStaat : aandacht, (k) => [keuringDoel(k), k.soort?.naam, k.locatie?.naam, k.keurder])
  const bewerkt = bewerk && bewerk !== 'nieuw' ? keuringen?.find((k) => k.id === bewerk) : undefined

  const kolommen: Kolom<Rij>[] = [
    { sleutel: 'doel', kop: 'Machine', sorteer: keuringDoel, cel: (k) => <>{keuringDoel(k)}<span className="sub">{k.soort?.naam}</span></> },
    { sleutel: 'baan', kop: 'Baan', sorteer: (k) => k.locatie?.naam ?? '', cel: (k) => k.locatie?.naam },
    { sleutel: 'gekeurd', kop: 'Gekeurd', klasse: 'mono smal', sorteer: (k) => k.gekeurd_op, cel: (k) => datum(k.gekeurd_op) },
    { sleutel: 'geldig', kop: 'Geldig tot', klasse: 'mono smal', sorteer: (k) => k.geldig_tot, cel: (k) => datum(k.geldig_tot) },
    { sleutel: 'staat', kop: 'Status', sorteer: (k) => k.dagen, cel: (k) => (
      <Chip klasse={k.staat === 'verlopen' ? 'storing' : k.staat === 'binnenkort' ? 'gepland' : 'in-orde'}>
        {k.staat === 'verlopen' ? `${-k.dagen} dagen verlopen` : k.staat === 'binnenkort' ? `nog ${k.dagen} dagen` : 'Geldig'}
      </Chip>
    ) },
    { sleutel: 'acties', kop: '', klasse: 'smal', cel: (k) => (
      <span className="knoppenrij">
        {k.certificaat_pad && <button className="knop tweede klein" onClick={() => certificaatOpenen(k.certificaat_pad!)}>Certificaat</button>}
        {k.machine_id && <Link className="knop tweede klein" to={`/locatie/${k.locatie_id}/materieel/${k.machine_id}`}>Machine</Link>}
      </span>
    ) },
  ]

  return (
    <>
      <PaginaKop titel="Keuringen" telling={rijen?.length}>
        {!bewerk && <button className="knop" onClick={() => zetBewerk('nieuw')}>Keuring vastleggen</button>}
      </PaginaKop>
      {(bewerk === 'nieuw' || bewerkt) && (
        <>
          <KeuringFormulier key={bewerk} keuring={bewerkt} klaar={() => { zetBewerk(''); laad() }} annuleer={() => zetBewerk('')} />
          {bewerkt && <p><button className="knop tweede klein" onClick={() => archiveer(bewerkt)}>Keuring archiveren</button></p>}
        </>
      )}
      <Werkbalk>
        <Weergaven standaard="aandacht" opties={[
          { waarde: 'aandacht', naam: 'Verlopen en binnenkort', telling: aandacht?.length }, { waarde: 'alle', naam: 'Alle', telling: metStaat?.length },
        ]} />
        <Zoekveld placeholder="Zoek machine, soort of baan" />
      </Werkbalk>
      <DataTabel kolommen={kolommen} rijen={rijen} sleutel={(k) => k.id} naar={(k) => `/werkplaats/keuringen?bewerk=${k.id}`}
                 regelKlasse={(k) => (k.staat === 'verlopen' ? 'let-op' : '')}
                 leeg={weergave === 'alle' ? 'Nog geen keuringen.' : 'Niets verlopen en niets binnenkort.'} />
    </>
  )
}
