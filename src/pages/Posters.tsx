import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { PaginaKop, useUrlParam } from '../components/tabel'
import { supabase } from '../lib/supabase'
import { useSessie } from '../lib/sessie'
import { bankLink, opslagVoorvoegsel, uploadNaarBank, useMagBestanden } from '../lib/bestanden'
import {
  boodschappen, pictogramUrl, pictogrammen, soortNamen, zoekPictogram, type Merk, type Sjabloon, type Soort,
} from '../lib/pictogrammen'
import { fotoGroepen, posterFotos } from '../lib/posterfotos'
import { isSymbool, symboolGroepen, symbolen, zoekSymbool } from '../lib/symbolen'

// HGM → Posters: borden en posters voor de werkplaats en de baan, af te drukken als PDF (A4 of A3).
// Pictogrammen zijn de officiële ISO 7010-tekens, ongewijzigd. Verder alleen tekst, foto en het HGM-logo.
// De poster is getekend in de eenheid --e (1 mm op A4); A3 is precies A4 × √2, dus alleen --e schaalt.

type Formaat = 'A4' | 'A3'

const sjablonen: { waarde: Sjabloon; naam: string; uitleg: string }[] = [
  { waarde: 'pictogram', naam: 'Pictogram', uitleg: 'Groot veiligheidsteken met tekstbord' },
  { waarde: 'foto', naam: 'Foto', uitleg: 'Foto over de hele poster, tekst onderin' },
  { waarde: 'split', naam: 'Gedeeld', uitleg: 'Foto boven, kleurvlak met tekst onder' },
  { waarde: 'kader', naam: 'Kader', uitleg: 'Foto in een witte lijst met een tekstlabel' },
  { waarde: 'kaart', naam: 'Kaart', uitleg: 'Kleurvlak met gecentreerde tekst, witte voet' },
  { waarde: 'tekst', naam: 'Tekst', uitleg: 'Alleen tekst op een kleurvlak' },
]
const metFoto: Sjabloon[] = ['foto', 'split', 'kader']
const soorten = Object.keys(soortNamen) as Soort[]
const maxPictos = 4
const lettersSleutel = 'hgm-poster-letters'

// Huisstijlen. Logo's ongewijzigd: HGM heeft een witte versie, de Hollandsche Golfclub niet
// (daar staat het kleurenlogo op een wit vlak op gekleurde posters).
type Kleur = { sleutel: string; naam: string; token: string; licht?: boolean }
const merken: Record<Merk, {
  naam: string; logo: string; logoWit: string | null; logoAlt: string; website?: string; standaardFoto: string; kleuren: Kleur[]
}> = {
  hgm: {
    naam: 'HGM Golf', logo: '/hgm-logo.png', logoWit: '/hgm-logo-wit.png', logoAlt: 'Hollandsche Greenkeeping Maatschappij',
    standaardFoto: '/posters/ochtend.jpg',
    kleuren: [
      { sleutel: 'olijf', naam: 'Olijf', token: '--hgm-olijf' },
      { sleutel: 'limoen', naam: 'Limoen', token: '--hgm-limoen', licht: true },
      { sleutel: 'antraciet', naam: 'Antraciet', token: '--hgm-antraciet' },
    ],
  },
  hgc: {
    naam: 'Hollandsche Golfclub', logo: '/merken/hollandsche-golfclub.png', logoWit: '/merken/hollandsche-golfclub-wit.svg', logoAlt: 'Hollandsche Golfclub',
    website: 'hollandschegolfclub.nl', standaardFoto: '/merken/hgc-fotos/baan-22264.jpg',
    kleuren: [
      { sleutel: 'blauw', naam: 'Blauw', token: '--hgc-blauw' },
      { sleutel: 'groen', naam: 'Groen', token: '--hgc-groen' },
      { sleutel: 'lichtblauw', naam: 'Lichtblauw', token: '--hgc-lichtblauw' },
      { sleutel: 'paars', naam: 'Paars', token: '--hgc-paars' },
      { sleutel: 'antraciet', naam: 'Antraciet', token: '--hgc-antraciet' },
      { sleutel: 'oranje', naam: 'Oranje', token: '--hgc-oranje', licht: true },
      { sleutel: 'hgclimoen', naam: 'Limoen', token: '--hgc-limoen', licht: true },
    ],
  },
}
// Golfparken van de Hollandsche Golfclub met hun eigen logo (ongewijzigd van hollandschegolfclub.nl).
const parken: { sleutel: string; naam: string; logo: string }[] = [
  ['almkreek', 'Almkreek'], ['de-berendonck', 'De Berendonck'], ['de-breuninkhof', 'De Breuninkhof'], ['de-haverleij', 'De Haverleij'],
  ['de-kurenpolder', 'De Kurenpolder'], ['de-loonsche-duynen', 'De Loonsche Duynen'], ['de-purmer', 'De Purmer'], ['gendersteyn', 'Gendersteyn'],
  ['maastricht', 'International Maastricht'], ['land-van-thorn', 'Land van Thorn'], ['naarderbos', 'Naarderbos'], ['reymerswael', 'Reymerswael'],
  ['rotterdam', 'Rotterdam'], ['shortgolf-utrecht', 'ShortGolf Utrecht'], ['sint-nyk', 'Sint Nyk'], ['westerpark', 'Westerpark'],
].map(([sleutel, naam]) => ({
  sleutel, naam: sleutel === 'shortgolf-utrecht' ? naam : `Golfpark ${naam}`,
  logo: `/merken/parken/${sleutel}.${sleutel === 'maastricht' || sleutel === 'naarderbos' ? 'png' : 'svg'}`,
}))

const kleurVan = (merk: Merk, sleutel?: string) => merken[merk].kleuren.find((k) => k.sleutel === sleutel) ?? merken[merk].kleuren[0]

export type Poster = {
  sjabloon: Sjabloon; formaat: Formaat; kop: string; tekst: string; plek: string
  pictos: string[]; foto: string; qr: boolean
  merk?: Merk     // ontbreekt bij oudere opgeslagen posters: HGM
  kleur?: string  // sleutel uit merken[merk].kleuren; leeg = eerste kleur
  park?: string   // alleen Hollandsche Golfclub: sleutel uit parken (eigen parklogo in de voet)
}

export default function Posters() {
  const eerste = boodschappen[0]
  const [p, setP] = useState<Poster>({
    sjabloon: eerste.sjabloon, formaat: 'A4', kop: eerste.kop, tekst: eerste.tekst, plek: '',
    pictos: eerste.pictos, foto: merken.hgm.standaardFoto, qr: false, merk: 'hgm',
  })
  // Eigen foto: nieuw gekozen (bestand, nog niet in de opslag) of uit de bestandenbank (pad).
  const [eigenFoto, setEigenFoto] = useState<{ url: string; bestand?: File; pad?: string } | null>(null)
  const zet = <K extends keyof Poster>(k: K, v: Poster[K]) => setP((oud) => ({ ...oud, [k]: v }))
  const { profiel } = useSessie()
  const magBewaren = useMagBestanden()
  const [id, zetId] = useUrlParam('id')
  const [eigenaar, setEigenaar] = useState<string | null>(null)
  const [bewaren, setBewaren] = useState<'bezig' | 'klaar' | string | null>(null)
  const netBewaard = useRef<string | null>(null)   // eigen insert: niet opnieuw laden

  // Poster uit de bestandenbank openen (/posters?id=…).
  useEffect(() => {
    if (!id || id === netBewaard.current) return
    let actief = true
    supabase.from('bestanden').select('poster, aangemaakt_door').eq('id', id).eq('soort', 'poster').maybeSingle()
      .then(async ({ data }) => {
        if (!actief || !data?.poster) return
        const opgeslagen = data.poster as Poster
        setEigenaar(data.aangemaakt_door)
        if (opgeslagen.foto?.startsWith(opslagVoorvoegsel)) {
          const pad = opgeslagen.foto.slice(opslagVoorvoegsel.length)
          const url = (await bankLink(pad)) ?? ''
          if (!actief) return
          setEigenFoto({ url, pad })
          setP({ ...opgeslagen, foto: url })
        } else setP(opgeslagen)
      })
    return () => { actief = false }
  }, [id])

  const isGlobaal = profiel?.globale_rol === 'beheer' || profiel?.globale_rol === 'onderhoudsmanager'
  const magOverschrijven = !!id && (eigenaar === profiel?.id || isGlobaal)

  async function bewaar(alsNieuw: boolean) {
    setBewaren('bezig')
    try {
      let foto = p.foto
      if (eigenFoto && p.foto === eigenFoto.url) {
        let pad = eigenFoto.pad
        if (!pad && eigenFoto.bestand) {
          pad = await uploadNaarBank(eigenFoto.bestand, eigenFoto.bestand.name)
          setEigenFoto({ ...eigenFoto, pad })
        }
        foto = `${opslagVoorvoegsel}${pad}`
      }
      const poster = { ...p, foto }
      if (!alsNieuw && magOverschrijven) {
        const { error } = await supabase.from('bestanden').update({ poster, titel: p.kop || 'Poster' }).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('bestanden')
          .insert({ soort: 'poster', titel: p.kop || 'Poster', map: 'Posters', poster }).select('id').single()
        if (error) throw error
        setEigenaar(profiel?.id ?? null)
        netBewaard.current = data.id
        zetId(data.id)
      }
      setBewaren('klaar')
    } catch (x) {
      setBewaren(x instanceof Error ? x.message : 'Bewaren lukte niet.')
    }
  }

  // Lettertypes van hgmgolf.nl alleen op deze pagina laden.
  useEffect(() => {
    if (document.getElementById(lettersSleutel)) return
    const l = document.createElement('link')
    l.id = lettersSleutel; l.rel = 'stylesheet'
    l.href = 'https://fonts.googleapis.com/css2?family=EB+Garamond:wght@500;600&family=Poppins:wght@400;500;600;700&family=Montserrat:wght@500;600;700&display=swap'
    document.head.appendChild(l)
  }, [])

  // Afdrukken: alleen de poster, zonder marges, op het gekozen papierformaat.
  useEffect(() => {
    const html = document.documentElement
    html.classList.add('posterdruk')
    html.classList.toggle('a3', p.formaat === 'A3')
    const pagina = document.createElement('style')
    pagina.textContent = `@media print { @page { size: ${p.formaat} portrait; margin: 0; } }`
    document.head.appendChild(pagina)
    return () => { html.classList.remove('posterdruk', 'a3'); pagina.remove() }
  }, [p.formaat])

  useEffect(() => () => { if (eigenFoto?.bestand) URL.revokeObjectURL(eigenFoto.url) }, [eigenFoto])
  useEffect(() => { if (bewaren === 'klaar') setBewaren(null) }, [p])  // na een wijziging weer 'bewaren'

  function kiesBoodschap(naam: string) {
    const b = boodschappen.find((x) => x.naam === naam)
    if (!b) return
    setP((oud) => ({ ...oud, sjabloon: b.sjabloon, kop: b.kop, tekst: b.tekst, pictos: b.pictos, foto: b.foto ?? oud.foto, qr: b.qr ?? false, kleur: b.kleur }))
  }

  function wisselPicto(code: string) {
    setP((oud) => {
      if (oud.pictos.includes(code)) return { ...oud, pictos: oud.pictos.filter((c) => c !== code) }
      if (oud.pictos.length >= maxPictos) return oud
      return { ...oud, pictos: [...oud.pictos, code] }
    })
  }

  function afdrukken() {
    const titel = document.title
    document.title = `Poster ${p.kop || 'HGM'} (${p.formaat})`
    window.print()
    document.title = titel
  }

  const merk = p.merk ?? 'hgm'
  const lijst = boodschappen.filter((b) => (b.merken ?? ['hgm']).includes(merk))
  const groepen = [...new Set(lijst.map((b) => b.groep))]

  return (
    <>
      <PaginaKop titel="Posters" sub="Borden voor de werkplaats en de baan. Kies een boodschap, pas de tekst aan en druk af of bewaar als PDF.">
        {magBewaren && (magOverschrijven
          ? <>
              <button className="knop tweede" onClick={() => bewaar(false)} disabled={bewaren === 'bezig'}>Wijzigingen bewaren</button>
              <button className="knop tweede" onClick={() => bewaar(true)} disabled={bewaren === 'bezig'}>Als nieuwe bewaren</button>
            </>
          : <button className="knop tweede" onClick={() => bewaar(true)} disabled={bewaren === 'bezig'}>Bewaren in Bestanden</button>)}
        <button className="knop" onClick={afdrukken}>Afdrukken of PDF ({p.formaat})</button>
      </PaginaKop>
      {bewaren === 'klaar' && <p className="posters-opgeslagen zacht">Bewaard. Terug te vinden in <Link to="/bestanden?weergave=posters">Bestanden</Link>.</p>}
      {bewaren && bewaren !== 'klaar' && bewaren !== 'bezig' && <div className="melding fout">{bewaren}</div>}

      <div className="posters">
        <div className="posters-bediening">
          <div>
            <span className="veldlabel">Huisstijl</span>
            <div className="posters-keuze" role="group" aria-label="Huisstijl">
              {(Object.keys(merken) as Merk[]).map((m) => (
                <button key={m} type="button" aria-pressed={merk === m}
                        onClick={() => setP((oud) => ({ ...oud, merk: m, kleur: undefined, park: undefined, qr: m === 'hgc' ? false : oud.qr,
                          foto: posterFotos.some((f) => f.url === oud.foto) ? oud.foto : merken[m].standaardFoto }))}>{merken[m].naam}</button>
              ))}
            </div>
          </div>

          {merk === 'hgc' && (
            <label>
              Golfpark
              <select value={p.park ?? ''} onChange={(e) => {
                const park = parken.find((x) => x.sleutel === e.target.value)
                setP((oud) => ({ ...oud, park: park?.sleutel,
                  plek: !oud.plek || parken.some((x) => x.naam === oud.plek) ? park?.naam ?? '' : oud.plek }))
              }}>
                <option value="">Geen (alleen Hollandsche Golfclub)</option>
                {parken.map((x) => <option key={x.sleutel} value={x.sleutel}>{x.naam}</option>)}
              </select>
            </label>
          )}

          <label>
            Boodschap
            <select value="" onChange={(e) => kiesBoodschap(e.target.value)}>
              <option value="" disabled>Kies een kant-en-klare boodschap…</option>
              {groepen.map((g) => (
                <optgroup key={g} label={g}>
                  {lijst.filter((b) => b.groep === g).map((b) => <option key={b.naam} value={b.naam}>{b.naam}</option>)}
                </optgroup>
              ))}
            </select>
          </label>

          <div>
            <span className="veldlabel">Sjabloon</span>
            <div className="posters-keuze raster" role="group" aria-label="Sjabloon">
              {sjablonen.map((s) => (
                <button key={s.waarde} type="button" aria-pressed={p.sjabloon === s.waarde} title={s.uitleg}
                        onClick={() => setP((oud) => ({ ...oud, sjabloon: s.waarde,
                          foto: metFoto.includes(s.waarde) && !oud.foto ? merken[merk].standaardFoto : oud.foto }))}>{s.naam}</button>
              ))}
            </div>
          </div>

          <div>
            <span className="veldlabel">Kleur <span className="zacht">({kleurVan(merk, p.kleur).naam})</span></span>
            <div className="posters-kleuren" role="group" aria-label="Kleur">
              {merken[merk].kleuren.map((k) => (
                <button key={k.sleutel} type="button" aria-pressed={kleurVan(merk, p.kleur).sleutel === k.sleutel} title={k.naam}
                        style={{ '--c': `var(${k.token})` } as CSSProperties} onClick={() => zet('kleur', k.sleutel)}>
                  <span className="sr-only">{k.naam}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="veldlabel">Formaat</span>
            <div className="posters-keuze" role="group" aria-label="Formaat">
              {(['A4', 'A3'] as Formaat[]).map((f) => (
                <button key={f} type="button" aria-pressed={p.formaat === f} onClick={() => zet('formaat', f)}>{f} staand</button>
              ))}
            </div>
          </div>

          <label>Kop<input value={p.kop} onChange={(e) => zet('kop', e.target.value)} maxLength={60} /></label>
          <label>Tekst<textarea rows={3} value={p.tekst} onChange={(e) => zet('tekst', e.target.value)} maxLength={180} /></label>
          <label>Onderregel<input value={p.plek} onChange={(e) => zet('plek', e.target.value)} placeholder={merk === 'hgc' ? 'bijv. Golfpark Almkreek' : 'bijv. Werkplaats Golfpark Almkreek'} maxLength={60} /></label>

          {metFoto.includes(p.sjabloon) && (
            <div>
              <span className="veldlabel">Foto</span>
              <div className="posters-fotolijst">
                {eigenFoto && (
                  <div className="posters-fotos">
                    <button type="button" aria-pressed={p.foto === eigenFoto.url} onClick={() => zet('foto', eigenFoto.url)}
                            style={{ backgroundImage: `url('${eigenFoto.url}')` }}><span>Eigen foto</span></button>
                  </div>
                )}
                {fotoGroepen.map((g) => (
                  <div key={g}>
                    <span className="label-klein">{g}</span>
                    <div className="posters-fotos">
                      {posterFotos.filter((f) => f.groep === g).map((f) => (
                        <button key={f.url} type="button" aria-pressed={p.foto === f.url} onClick={() => zet('foto', f.url)}
                                style={{ backgroundImage: `url('${f.klein}')` }} title={f.naam}><span>{f.naam}</span></button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <label className="posters-upload knop tweede klein">
                Eigen foto kiezen
                <input type="file" accept="image/*" onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  const url = URL.createObjectURL(f)
                  setEigenFoto({ url, bestand: f }); zet('foto', url)
                }} />
              </label>
            </div>
          )}

          {merk === 'hgm' && <label className="posters-vink">
            <input type="checkbox" checked={p.qr} onChange={(e) => zet('qr', e.target.checked)} />
            QR-code naar de app (om te melden)
          </label>}

          <div>
            <span className="veldlabel">Pictogrammen en symbolen <span className="zacht">({p.pictos.length}/{maxPictos})</span></span>
            {symboolGroepen.map((g) => (
              <div key={g} className="posters-pictogroep">
                <span className="label-klein">{g}</span>
                <div className="posters-pictos symbolen">
                  {symbolen.filter((x) => x.groep === g).map((x) => {
                    const gekozen = p.pictos.includes(x.code)
                    return (
                      <button key={x.code} type="button" aria-pressed={gekozen} title={x.naam}
                              disabled={!gekozen && p.pictos.length >= maxPictos} onClick={() => wisselPicto(x.code)}>
                        <SymboolSvg code={x.code} /><span>{x.naam}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            <span className="posters-normkop">Veiligheidstekens (ISO 7010)</span>
            {soorten.map((s) => (
              <div key={s} className="posters-pictogroep">
                <span className="label-klein">{soortNamen[s]}</span>
                <div className="posters-pictos">
                  {pictogrammen.filter((x) => x.soort === s).map((x) => {
                    const gekozen = p.pictos.includes(x.code)
                    return (
                      <button key={x.code} type="button" aria-pressed={gekozen} title={`${x.code} ${x.naam}`}
                              disabled={!gekozen && p.pictos.length >= maxPictos} onClick={() => wisselPicto(x.code)}>
                        <img src={pictogramUrl(x.code)} alt={x.naam} />
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <Voorbeeld poster={p} />
      </div>

      {createPortal(<div className="poster-druk"><PosterBlad poster={p} /></div>, document.body)}
    </>
  )
}

// Voorbeeld op schermbreedte: --e rekent mee met de beschikbare ruimte.
function Voorbeeld({ poster }: { poster: Poster }) {
  const ref = useRef<HTMLDivElement>(null)
  const [e, setE] = useState(2)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const meet = () => setE(Math.min(el.clientWidth / 210, (window.innerHeight - 140) / 297))
    meet()
    const ro = new ResizeObserver(meet)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div className="posters-voorbeeld" ref={ref}>
      <PosterBlad poster={poster} stijl={{ '--e': `${Math.max(e, 1)}px` } as CSSProperties} />
      <p className="zacht">{poster.formaat} staand · {poster.formaat === 'A4' ? '210 × 297 mm' : '297 × 420 mm'}</p>
    </div>
  )
}

// Kopmaat naar lengte, en kleiner als één lang woord (gewasbeschermingsmiddelen) anders niet past.
function kopMaat(kop: string) {
  const n = kop.length
  const woord = Math.max(0, ...kop.split(/\s+/).map((w) => w.length))
  if (woord > 17) return 'mini'
  return n <= 12 && woord <= 9 ? 'groot' : n <= 26 && woord <= 13 ? 'middel' : 'klein'
}

export function PosterBlad({ poster: p, stijl }: { poster: Poster; stijl?: CSSProperties }) {
  const merk = p.merk ?? 'hgm'
  const m = merken[merk]
  const kleur = kleurVan(merk, p.kleur)
  // Waar staat het logo: op wit (pictogram, kaart, kader) of op de posterkleur.
  const opKleur = ['foto', 'split', 'tekst'].includes(p.sjabloon)
  const logo = !opKleur || kleur.licht ? m.logo : m.logoWit ?? m.logo
  const logoOpVlak = opKleur && !m.logoWit   // clublogo heeft geen witte versie: op een wit vlak
  const soort = isSymbool(p.pictos[0] ?? '') ? undefined : zoekPictogram(p.pictos[0] ?? '')?.soort
  const kleurStijl = { '--poster-olijf': `var(${kleur.token})`, '--poster-olijf-diep': `var(${kleur.token})` } as CSSProperties

  const pictos = p.pictos.length > 0 && (
    <div className={`poster-pictos aantal-${p.pictos.length}`}>
      {p.pictos.map((c) => isSymbool(c)
        ? <span key={c} className="poster-symbool" role="img" aria-label={zoekSymbool(c)?.naam}><SymboolSvg code={c} /></span>
        : <img key={c} src={pictogramUrl(c)} alt={zoekPictogram(c)?.naam ?? c} />)}
    </div>
  )
  const park = merk === 'hgc' ? parken.find((x) => x.sleutel === p.park) : undefined
  const inhoud = (
    <div className="poster-inhoud">
      {pictos}
      <h1>{p.kop}</h1>
      {p.tekst && <p className="poster-tekst">{p.tekst}</p>}
    </div>
  )
  // Foto als echte afbeelding: Safari drukt CSS-achtergronden niet goed af.
  const foto = p.foto ? <img src={p.foto} alt="" /> : null
  const voet = (
    <div className="poster-voet">
      <div className="poster-merk">
        {park && <img src={park.logo} alt={park.naam} className={`parklogo${opKleur ? ' op-vlak' : ''}`} />}
        <img src={logo} alt={m.logoAlt} className={logoOpVlak ? 'op-vlak' : undefined} />
        {(p.plek || m.website) && <span>{p.plek}{p.plek && m.website && <br />}{m.website}</span>}
      </div>
      {p.qr && <div className="poster-qr"><span>Meld het<br />in de app</span><div><img src="/marketing/qr-app.svg" alt="QR-code naar HGM Golf Onderhoud" /></div></div>}
    </div>
  )

  return (
    <div className={`poster-blad merk-${merk} sjabloon-${p.sjabloon} kop-${kopMaat(p.kop)}`} style={{ ...kleurStijl, ...stijl }}
         data-soort={soort} data-licht={kleur.licht ? '' : undefined}>
      {p.sjabloon === 'pictogram' && (
        <>
          <div className="poster-pictovlak">{pictos}</div>
          <div className="poster-bord">{p.kop}</div>
          {p.tekst && <p className="poster-tekst">{p.tekst}</p>}
          {voet}
        </>
      )}
      {p.sjabloon === 'foto' && (
        <>
          {/* Verloop als PNG (merkkleur met alpha): Safari drukt CSS-verlopen met transparantie zwart af. */}
          <div className="poster-foto">{foto}<img src={`/posters/verloop/${kleur.sleutel}.png`} alt="" /></div>
          {inhoud}
          {voet}
        </>
      )}
      {p.sjabloon === 'split' && (
        <>
          <div className="split-foto">{foto}</div>
          <div className="split-paneel">{inhoud}{voet}</div>
        </>
      )}
      {p.sjabloon === 'kader' && (
        <>
          <div className="kader-foto">{foto}</div>
          <div className="kader-label">{inhoud}{voet}</div>
        </>
      )}
      {p.sjabloon === 'kaart' && (
        <>
          <div className="kaart-vlak">{inhoud}</div>
          <div className="kaart-voet">{voet}</div>
        </>
      )}
      {p.sjabloon === 'tekst' && <>{inhoud}{voet}</>}
    </div>
  )
}

// Symbool uit symbolen.ts als inline SVG (lijnen in currentColor; drukt ook in Safari goed af).
function SymboolSvg({ code }: { code: string }) {
  const s = zoekSymbool(code)
  return s ? <svg viewBox="0 0 24 24" aria-hidden dangerouslySetInnerHTML={{ __html: s.body }} /> : null
}
