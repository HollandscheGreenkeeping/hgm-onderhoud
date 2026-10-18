import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { useSessie } from '../lib/sessie'
import {
  bankLink, bestandVelden, grootteTekst, opslagVoorvoegsel, soortNaam, uploadNaarBank, useMagBestanden, type Bestand,
} from '../lib/bestanden'
import { Chip, DataTabel, FilterKeuze, PaginaKop, useUrlParam, useZoekfilter, Weergaven, Werkbalk, Zoekveld, type Kolom } from '../components/tabel'
import { PosterBlad, type Poster } from './Posters'

// HGM → Bestanden: alles wat eerder gemaakt is bewaren en terugvinden. Posters uit de generator
// (opnieuw te openen en af te drukken) en losse bestanden zoals flyers, PDF's en mails.

const datum = (d: string) => new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })

export default function Bestanden() {
  const [bestanden, setBestanden] = useState<Bestand[] | null>(null)
  const [weergave] = useUrlParam('weergave', 'alle')
  const [map] = useUrlParam('map')
  const [bewerk, zetBewerk] = useUrlParam('bewerk')

  const laad = useCallback(() => {
    supabase.from('bestanden').select(bestandVelden).is('gearchiveerd_op', null).order('bijgewerkt_op', { ascending: false })
      .then(({ data }) => setBestanden((data ?? []) as Bestand[]))
  }, [])
  useEffect(laad, [laad])

  const mappen = useMemo(() => [...new Set((bestanden ?? []).map((b) => b.map).filter((m): m is string => !!m))].sort(), [bestanden])
  const gefilterd = useMemo(() => bestanden?.filter((b) =>
    (weergave === 'alle' || (weergave === 'posters') === (b.soort === 'poster')) && (!map || b.map === map)) ?? null,
  [bestanden, weergave, map])
  const rijen = useZoekfilter(gefilterd, (b) => [b.titel, b.map, b.omschrijving, b.bestandsnaam, b.maker?.naam])

  const kolommen: Kolom<Bestand>[] = [
    { sleutel: 'titel', kop: 'Titel', sorteer: (b) => b.titel, cel: (b) => <>{b.titel}{b.omschrijving && <span className="sub">{b.omschrijving}</span>}</> },
    { sleutel: 'soort', kop: 'Soort', sorteer: (b) => soortNaam(b), cel: (b) => <Chip>{soortNaam(b)}</Chip> },
    { sleutel: 'map', kop: 'Map', sorteer: (b) => b.map ?? '', cel: (b) => b.map ?? '–' },
    { sleutel: 'grootte', kop: 'Grootte', klasse: 'mono', sorteer: (b) => b.grootte ?? 0, cel: (b) => (b.soort === 'poster' ? '–' : grootteTekst(b.grootte)) },
    { sleutel: 'door', kop: 'Door', sorteer: (b) => b.maker?.naam ?? '', cel: (b) => b.maker?.naam ?? '–' },
    { sleutel: 'datum', kop: 'Bijgewerkt', klasse: 'mono', sorteer: (b) => b.bijgewerkt_op, cel: (b) => datum(b.bijgewerkt_op) },
  ]
  const posters = rijen?.filter((b) => b.soort === 'poster') ?? []
  const telling = (w: string) => bestanden?.filter((b) => w === 'alle' || (w === 'posters') === (b.soort === 'poster')).length

  return (
    <>
      <PaginaKop titel="Bestanden" telling={rijen?.length} sub="Posters, flyers en ander materiaal dat eerder gemaakt is.">
        {!bewerk && <Link className="knop tweede" to="/posters">Nieuwe poster</Link>}
        {!bewerk && <button className="knop" onClick={() => zetBewerk('nieuw')}>Bestand uploaden</button>}
      </PaginaKop>
      {bewerk === 'nieuw' && <UploadFormulier mappen={mappen} klaar={() => { zetBewerk(''); laad() }} annuleer={() => zetBewerk('')} />}
      <Werkbalk>
        <Weergaven standaard="alle" opties={[
          { waarde: 'alle', naam: 'Alles', telling: telling('alle') },
          { waarde: 'posters', naam: 'Posters', telling: telling('posters') },
          { waarde: 'bestanden', naam: 'Bestanden', telling: telling('bestanden') },
        ]} />
        <Zoekveld placeholder="Zoek op titel, map of naam" />
        {mappen.length > 0 && <FilterKeuze param="map" label="Map" opties={mappen.map((m) => [m, m])} />}
      </Werkbalk>
      {weergave === 'posters'
        ? <PosterTegels posters={posters} />
        : <DataTabel kolommen={kolommen} rijen={rijen} sleutel={(b) => b.id} naar={(b) => `/bestanden/${b.id}`}
                     leeg="Nog niets bewaard. Sla een poster op of upload een bestand." />}
    </>
  )
}

function PosterTegels({ posters }: { posters: Bestand[] }) {
  if (!posters.length) return <p className="zacht">Nog geen posters bewaard.</p>
  return (
    <div className="bestanden-tegels">
      {posters.map((b) => (
        <Link key={b.id} to={`/bestanden/${b.id}`} className="bestanden-tegel">
          <PosterVoorbeeld bestand={b} e={0.8} />
          <strong>{b.titel}</strong>
          <span className="zacht">{b.map ?? 'Zonder map'} · {datum(b.bijgewerkt_op)}</span>
        </Link>
      ))}
    </div>
  )
}

// Poster uit de bank tekenen; een eigen foto staat in de opslag en krijgt een tijdelijke link.
export function usePosterUitBank(bestand: Bestand | null) {
  const [poster, setPoster] = useState<Poster | null>(null)
  useEffect(() => {
    if (!bestand?.poster) { setPoster(null); return }
    const p = bestand.poster as Poster
    if (!p.foto?.startsWith(opslagVoorvoegsel)) { setPoster(p); return }
    let actief = true
    bankLink(p.foto.slice(opslagVoorvoegsel.length)).then((url) => { if (actief) setPoster({ ...p, foto: url ?? '' }) })
    return () => { actief = false }
  }, [bestand])
  return poster
}

function PosterVoorbeeld({ bestand, e }: { bestand: Bestand; e: number }) {
  const poster = usePosterUitBank(bestand)
  const stijl = { '--e': `${e}px` } as CSSProperties
  return poster ? <PosterBlad poster={poster} stijl={stijl} /> : <div className="poster-blad" style={stijl} />
}

function UploadFormulier({ mappen, klaar, annuleer }: { mappen: string[]; klaar: () => void; annuleer: () => void }) {
  const [bestand, setBestand] = useState<File | null>(null)
  const [titel, setTitel] = useState('')
  const [map, setMap] = useState('')
  const [omschrijving, setOmschrijving] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    if (!bestand) return
    setBezig(true); setFout(null)
    try {
      const pad = await uploadNaarBank(bestand, bestand.name)
      const { error } = await supabase.from('bestanden').insert({
        soort: 'bestand', titel: titel.trim() || bestand.name, map: map.trim() || null, omschrijving: omschrijving.trim() || null,
        opslag_pad: pad, bestandsnaam: bestand.name, mime_type: bestand.type || null, grootte: bestand.size,
      })
      if (error) throw error
      klaar()
    } catch (x) {
      setFout(x instanceof Error ? x.message : 'Uploaden lukte niet.')
      setBezig(false)
    }
  }

  return (
    <form className="kaart" onSubmit={opslaan}>
      <h2>Bestand uploaden</h2>
      <label>Bestand (max. 50 MB: PDF, afbeelding, HTML-mail, Word, PowerPoint, Excel of MP4)
        <input type="file" required onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          setBestand(f)
          if (f && !titel) setTitel(f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '))
        }} />
      </label>
      <label>Titel<input value={titel} onChange={(e) => setTitel(e.target.value)} required /></label>
      <label>Map<input value={map} onChange={(e) => setMap(e.target.value)} list="bestanden-mappen" placeholder="bijv. Flyers, Veiligheid, Mails" /></label>
      <datalist id="bestanden-mappen">{mappen.map((m) => <option key={m} value={m} />)}</datalist>
      <label>Omschrijving<input value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} /></label>
      {fout && <div className="melding fout">{fout}</div>}
      <div className="knoppenrij">
        <button className="knop" disabled={!bestand || bezig}>{bezig ? 'Uploaden…' : 'Uploaden'}</button>
        <button type="button" className="knop tweede" onClick={annuleer}>Annuleren</button>
      </div>
    </form>
  )
}

export function BestandDetail() {
  const { bestandId } = useParams()
  const { profiel } = useSessie()
  const navigeer = useNavigate()
  const [b, setB] = useState<Bestand | null | undefined>(undefined)
  const [link, setLink] = useState<string | null>(null)
  const [bewerk, zetBewerk] = useUrlParam('bewerk')
  const poster = usePosterUitBank(b ?? null)

  const laad = useCallback(() => {
    supabase.from('bestanden').select(bestandVelden).eq('id', bestandId!).is('gearchiveerd_op', null).maybeSingle()
      .then(({ data }) => setB(data as Bestand | null))
  }, [bestandId])
  useEffect(laad, [laad])
  useEffect(() => {
    if (b?.soort === 'bestand' && b.opslag_pad) bankLink(b.opslag_pad).then(setLink)
  }, [b])

  if (b === undefined) return <p className="zacht">Laden…</p>
  if (b === null) return <Navigate to="/bestanden" replace />
  const magWijzigen = b.aangemaakt_door === profiel?.id || profiel?.globale_rol === 'beheer' || profiel?.globale_rol === 'onderhoudsmanager'
  const isBeeld = b.mime_type?.startsWith('image/')

  async function downloaden() {
    const url = await bankLink(b!.opslag_pad!, b!.bestandsnaam ?? b!.titel)
    if (url) window.location.href = url
  }

  return (
    <>
      <PaginaKop titel={b.titel} sub={<>{soortNaam(b)}{b.map && <> · {b.map}</>} · {b.maker?.naam ?? 'onbekend'} · {datum(b.bijgewerkt_op)}</>}>
        {b.soort === 'poster' && <Link className="knop" to={`/posters?id=${b.id}`}>Openen in de generator</Link>}
        {b.soort === 'bestand' && link && <a className="knop tweede" href={link} target="_blank" rel="noreferrer">Openen</a>}
        {b.soort === 'bestand' && <button className="knop" onClick={downloaden}>Downloaden</button>}
        {magWijzigen && !bewerk && <button className="knop tweede" onClick={() => zetBewerk('1')}>Wijzigen</button>}
      </PaginaKop>

      {bewerk && magWijzigen && (
        <GegevensFormulier bestand={b} klaar={() => { zetBewerk(''); laad() }} annuleer={() => zetBewerk('')}
          archiveer={async () => {
            await supabase.from('bestanden').update({ gearchiveerd_op: new Date().toISOString() }).eq('id', b.id)
            navigeer('/bestanden')
          }} />
      )}
      {b.omschrijving && <p>{b.omschrijving}</p>}

      <div className="bestanden-detail">
        {b.soort === 'poster' && poster && <PosterBlad poster={poster} stijl={{ '--e': '2px' } as CSSProperties} />}
        {b.soort === 'bestand' && link && isBeeld && <img src={link} alt={b.titel} />}
        {b.soort === 'bestand' && link && b.mime_type === 'application/pdf' && <iframe src={link} title={b.titel} />}
        {b.soort === 'bestand' && !isBeeld && b.mime_type !== 'application/pdf' && (
          <p className="zacht">{b.bestandsnaam} · {grootteTekst(b.grootte)}. Geen voorbeeld; open of download het bestand.</p>
        )}
      </div>
    </>
  )
}

function GegevensFormulier({ bestand, klaar, annuleer, archiveer }: {
  bestand: Bestand; klaar: () => void; annuleer: () => void; archiveer: () => void
}) {
  const [titel, setTitel] = useState(bestand.titel)
  const [map, setMap] = useState(bestand.map ?? '')
  const [omschrijving, setOmschrijving] = useState(bestand.omschrijving ?? '')
  const [zeker, setZeker] = useState(false)

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    await supabase.from('bestanden').update({ titel: titel.trim() || bestand.titel, map: map.trim() || null, omschrijving: omschrijving.trim() || null })
      .eq('id', bestand.id)
    klaar()
  }

  return (
    <form className="kaart" onSubmit={opslaan}>
      <label>Titel<input value={titel} onChange={(e) => setTitel(e.target.value)} required /></label>
      <label>Map<input value={map} onChange={(e) => setMap(e.target.value)} /></label>
      <label>Omschrijving<input value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} /></label>
      <div className="knoppenrij">
        <button className="knop">Opslaan</button>
        <button type="button" className="knop tweede" onClick={annuleer}>Annuleren</button>
        {zeker
          ? <button type="button" className="knop melden" onClick={archiveer}>Ja, archiveren</button>
          : <button type="button" className="knop tweede" onClick={() => setZeker(true)}>Archiveren</button>}
      </div>
    </form>
  )
}

// Alleen voor HGM-medewerkers (de database weigert de rest ook).
export function AlleenHgm({ children }: { children: ReactNode }) {
  const mag = useMagBestanden()
  if (mag === null) return <p className="zacht">Laden…</p>
  return mag ? <>{children}</> : <Navigate to="/" replace />
}
