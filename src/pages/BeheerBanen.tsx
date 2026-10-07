import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { huisstijlUrl, supabase } from '../lib/supabase'

type Baan = { id: string; naam: string; klantnaam: string | null; adres: string | null; klantlogo_pad: string | null; baanfoto_pad: string | null }

// Beheer → Banen: alle banen; per baan logo, foto en lussen instellen (BaanInstellingen.tsx).
export default function BeheerBanen() {
  const [banen, setBanen] = useState<Baan[] | null>(null)

  useEffect(() => {
    supabase.from('locaties').select('id, naam, klantnaam, adres, klantlogo_pad, baanfoto_pad').eq('actief', true).order('naam')
      .then(({ data }) => setBanen(data ?? []))
  }, [])

  return (
    <>
      <div className="kop-met-knop">
        <h1>Banen</h1>
        <Link className="knop" to="/beheer/banen/nieuw">+ Nieuwe baan</Link>
      </div>
      <p className="zacht">Logo, baanfoto en lussen per baan. Tekenen doe je op de kaart van de baan zelf.</p>
      {banen === null && <p className="zacht">Laden…</p>}
      <ul className="lijst">
        {banen?.map((b) => (
          <li key={b.id}>
            <Link className="rij beheer-baan" to={`/beheer/banen/${b.id}`}>
              <span className="beheer-baan-logo">
                {b.klantlogo_pad ? <img src={huisstijlUrl(b.klantlogo_pad)} alt="" /> : <span className="zacht">Geen logo</span>}
              </span>
              <span className="beheer-baan-tekst">
                <strong>{b.naam}</strong>
                <span className="zacht klein-tekst">{[b.klantnaam, b.adres].filter(Boolean).join(' · ') || 'Geen adres'}</span>
                <span className="klein-tekst">
                  {[!b.klantlogo_pad && 'logo ontbreekt', !b.baanfoto_pad && 'foto ontbreekt'].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span aria-hidden>›</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
