import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { PaginaKop } from '../components/tabel'
import {
  boodschappen, pictogramUrl, pictogrammen, soortNamen, zoekPictogram, type Boodschap, type Soort,
} from '../lib/pictogrammen'

// HGM → Posters: borden en posters voor de werkplaats en de baan, af te drukken als PDF (A4 of A3).
// Pictogrammen zijn de officiële ISO 7010-tekens, ongewijzigd. Verder alleen tekst, foto en het HGM-logo.
// De poster is getekend in de eenheid --e (1 mm op A4); A3 is precies A4 × √2, dus alleen --e schaalt.

type Sjabloon = Boodschap['sjabloon']
type Formaat = 'A4' | 'A3'

const sjablonen: { waarde: Sjabloon; naam: string }[] = [
  { waarde: 'pictogram', naam: 'Pictogram' }, { waarde: 'foto', naam: 'Foto' }, { waarde: 'tekst', naam: 'Tekst' },
]
const fotos = [
  { url: '/posters/ochtend.jpg', naam: 'Ochtend' }, { url: '/posters/nacht.jpg', naam: 'Nacht' },
  { url: '/posters/schemer.jpg', naam: 'Schemer' }, { url: '/marketing/baan-ochtend.jpg', naam: 'Green' },
  { url: '/marketing/maaier-avond.jpg', naam: 'Maaier' },
]
const soorten = Object.keys(soortNamen) as Soort[]
const maxPictos = 3
const lettersSleutel = 'hgm-poster-letters'

export type Poster = {
  sjabloon: Sjabloon; formaat: Formaat; kop: string; tekst: string; plek: string
  pictos: string[]; foto: string; qr: boolean
}

export default function Posters() {
  const eerste = boodschappen[0]
  const [p, setP] = useState<Poster>({
    sjabloon: eerste.sjabloon, formaat: 'A4', kop: eerste.kop, tekst: eerste.tekst, plek: '',
    pictos: eerste.pictos, foto: fotos[0].url, qr: false,
  })
  const [eigenFoto, setEigenFoto] = useState<string | null>(null)
  const zet = <K extends keyof Poster>(k: K, v: Poster[K]) => setP((oud) => ({ ...oud, [k]: v }))

  // Lettertypes van hgmgolf.nl alleen op deze pagina laden.
  useEffect(() => {
    if (document.getElementById(lettersSleutel)) return
    const l = document.createElement('link')
    l.id = lettersSleutel; l.rel = 'stylesheet'
    l.href = 'https://fonts.googleapis.com/css2?family=EB+Garamond:wght@500;600&family=Poppins:wght@400;500;600;700&display=swap'
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

  useEffect(() => () => { if (eigenFoto) URL.revokeObjectURL(eigenFoto) }, [eigenFoto])

  function kiesBoodschap(naam: string) {
    const b = boodschappen.find((x) => x.naam === naam)
    if (!b) return
    setP((oud) => ({ ...oud, sjabloon: b.sjabloon, kop: b.kop, tekst: b.tekst, pictos: b.pictos, foto: b.foto ?? oud.foto, qr: b.qr ?? false }))
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

  const groepen = [...new Set(boodschappen.map((b) => b.groep))]

  return (
    <>
      <PaginaKop titel="Posters" sub="Borden voor de werkplaats en de baan. Kies een boodschap, pas de tekst aan en druk af of bewaar als PDF.">
        <button className="knop" onClick={afdrukken}>Afdrukken of PDF ({p.formaat})</button>
      </PaginaKop>

      <div className="posters">
        <div className="posters-bediening">
          <label>
            Boodschap
            <select value="" onChange={(e) => kiesBoodschap(e.target.value)}>
              <option value="" disabled>Kies een kant-en-klare boodschap…</option>
              {groepen.map((g) => (
                <optgroup key={g} label={g}>
                  {boodschappen.filter((b) => b.groep === g).map((b) => <option key={b.naam} value={b.naam}>{b.naam}</option>)}
                </optgroup>
              ))}
            </select>
          </label>

          <div>
            <span className="veldlabel">Sjabloon</span>
            <div className="posters-keuze" role="group" aria-label="Sjabloon">
              {sjablonen.map((s) => (
                <button key={s.waarde} type="button" aria-pressed={p.sjabloon === s.waarde} onClick={() => zet('sjabloon', s.waarde)}>{s.naam}</button>
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
          <label>Onderregel<input value={p.plek} onChange={(e) => zet('plek', e.target.value)} placeholder="bijv. Werkplaats Golfpark Almkreek" maxLength={60} /></label>

          {p.sjabloon === 'foto' && (
            <div>
              <span className="veldlabel">Foto</span>
              <div className="posters-fotos">
                {fotos.map((f) => (
                  <button key={f.url} type="button" aria-pressed={p.foto === f.url} onClick={() => zet('foto', f.url)}
                          style={{ backgroundImage: `url('${f.url}')` }} title={f.naam}><span>{f.naam}</span></button>
                ))}
                {eigenFoto && (
                  <button type="button" aria-pressed={p.foto === eigenFoto} onClick={() => zet('foto', eigenFoto)}
                          style={{ backgroundImage: `url('${eigenFoto}')` }}><span>Eigen</span></button>
                )}
              </div>
              <label className="posters-upload knop tweede klein">
                Eigen foto kiezen
                <input type="file" accept="image/*" onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  const url = URL.createObjectURL(f)
                  setEigenFoto(url); zet('foto', url)
                }} />
              </label>
            </div>
          )}

          <label className="posters-vink">
            <input type="checkbox" checked={p.qr} onChange={(e) => zet('qr', e.target.checked)} />
            QR-code naar de app (om te melden)
          </label>

          <div>
            <span className="veldlabel">Pictogrammen <span className="zacht">({p.pictos.length}/{maxPictos}, ISO 7010)</span></span>
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
  const soort = zoekPictogram(p.pictos[0] ?? '')?.soort
  const pictos = p.pictos.length > 0 && (
    <div className={`poster-pictos aantal-${p.pictos.length}`}>
      {p.pictos.map((c) => <img key={c} src={pictogramUrl(c)} alt={zoekPictogram(c)?.naam ?? c} />)}
    </div>
  )
  const voet = (
    <div className="poster-voet">
      <div className="poster-merk">
        <img src="/hgm-logo.png" alt="Hollandsche Greenkeeping Maatschappij" />
        {p.plek && <span>{p.plek}</span>}
      </div>
      {p.qr && <div className="poster-qr"><span>Meld het<br />in de app</span><div><img src="/marketing/qr-app.svg" alt="QR-code naar HGM Golf Onderhoud" /></div></div>}
    </div>
  )

  return (
    <div className={`poster-blad sjabloon-${p.sjabloon} kop-${kopMaat(p.kop)}`} style={stijl} data-soort={soort}>
      {p.sjabloon === 'pictogram' && (
        <>
          <div className="poster-pictovlak">{pictos}</div>
          <div className="poster-bord">{p.kop}</div>
          {p.tekst && <p className="poster-tekst">{p.tekst}</p>}
        </>
      )}
      {p.sjabloon === 'foto' && (
        <>
          <div className="poster-foto" style={{ backgroundImage: `url('${p.foto}')` }} />
          <div className="poster-inhoud">
            {pictos}
            <h1>{p.kop}</h1>
            {p.tekst && <p className="poster-tekst">{p.tekst}</p>}
          </div>
        </>
      )}
      {p.sjabloon === 'tekst' && (
        <div className="poster-inhoud">
          {pictos}
          <h1>{p.kop}</h1>
          {p.tekst && <p className="poster-tekst">{p.tekst}</p>}
        </div>
      )}
      {voet}
    </div>
  )
}
