import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { huisstijlUrl, supabase } from '../lib/supabase'
import { Chip, DataTabel, PaginaKop, useZoekfilter, Werkbalk, Zoekveld, type Kolom } from '../components/tabel'

type Baan = { id: string; naam: string; klantnaam: string | null; adres: string | null; klantlogo_pad: string | null; baanfoto_pad: string | null }

// Beheer → Banen: alle banen; per baan logo, foto en lussen instellen (BaanInstellingen.tsx).
export default function BeheerBanen() {
  const [banen, setBanen] = useState<Baan[] | null>(null)

  useEffect(() => {
    supabase.from('locaties').select('id, naam, klantnaam, adres, klantlogo_pad, baanfoto_pad').eq('soort', 'baan').eq('actief', true).order('naam')
      .then(({ data }) => setBanen(data ?? []))
  }, [])

  const rijen = useZoekfilter(banen, (b) => [b.naam, b.klantnaam, b.adres])
  const kolommen: Kolom<Baan>[] = [
    { sleutel: 'logo', kop: 'Logo', klasse: 'smal', cel: (b) => (
      <span className="beheer-baan-logo">{b.klantlogo_pad ? <img src={huisstijlUrl(b.klantlogo_pad)} alt="" /> : <span className="zacht">Geen logo</span>}</span>
    ) },
    { sleutel: 'naam', kop: 'Baan', sorteer: (b) => b.naam, cel: (b) => <>{b.naam}<span className="sub">{b.klantnaam}</span></> },
    { sleutel: 'adres', kop: 'Adres', sorteer: (b) => b.adres ?? '', cel: (b) => b.adres ?? '–' },
    { sleutel: 'compleet', kop: 'Nog te doen', cel: (b) => {
      const mist = [!b.klantlogo_pad && 'logo', !b.baanfoto_pad && 'baanfoto'].filter(Boolean)
      return mist.length ? <Chip klasse="gepland">{mist.join(' en ')} ontbreekt</Chip> : <Chip klasse="in-orde">Compleet</Chip>
    } },
  ]

  return (
    <>
      <PaginaKop titel="Banen" telling={rijen?.length} sub="Logo, baanfoto en lussen per baan. Tekenen doe je op de kaart van de baan zelf.">
        <Link className="knop" to="/beheer/banen/nieuw">Nieuwe baan</Link>
      </PaginaKop>
      <Werkbalk><Zoekveld placeholder="Zoek baan" /></Werkbalk>
      <DataTabel kolommen={kolommen} rijen={rijen} sleutel={(b) => b.id} naar={(b) => `/beheer/banen/${b.id}`} leeg="Nog geen banen." />
    </>
  )
}
