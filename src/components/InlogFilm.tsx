import { useEffect, useRef, useState } from 'react'

// Achtergrondfilm op het inlogscherm: korte greenkeeper-knipjes uit de HGM-film "KLM Open 2019"
// (YouTube, eigen film van HGM). Zonder geluid en zonder bediening; de stukjes spelen na elkaar.
// Alleen op brede schermen (het beeldvak is op de telefoon verborgen), en via youtube-nocookie.
const filmId = 'rvfk6l1ELZo'
const knipjes: [number, number][] = [
  [7, 11],   // sproeien met de slang bij zonsopkomst
  [16, 19],  // greensmaaier met lampen in de schemering
  [47, 52],  // rode maaier 's nachts, dichtbij
  [65, 69],  // hole verzetten en vlag terugzetten
  [70, 74],  // silhouet in tegenlicht, holesnijder
  [75, 79],  // bal rolt de hole in
]

type Speler = {
  loadVideoById: (o: { videoId: string; startSeconds: number; endSeconds: number }) => void
  mute: () => void
  destroy: () => void
}
type YtApi = {
  Player: new (el: HTMLElement, o: object) => Speler
  PlayerState: { ENDED: number; PLAYING: number }
}
declare global {
  interface Window { YT?: YtApi; onYouTubeIframeAPIReady?: () => void }
}

function laadApi(): Promise<YtApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  return new Promise((klaar) => {
    const vorige = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { vorige?.(); klaar(window.YT!) }
    if (!document.querySelector('script[data-yt-api]')) {
      const s = document.createElement('script')
      s.src = 'https://www.youtube.com/iframe_api'
      s.dataset.ytApi = ''
      document.head.appendChild(s)
    }
  })
}

export default function InlogFilm() {
  const plek = useRef<HTMLDivElement>(null)
  const [zichtbaar, setZichtbaar] = useState(false)

  useEffect(() => {
    const breed = window.matchMedia('(min-width: 901px)').matches
    const rustig = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!breed || rustig || !plek.current) return
    let speler: Speler | null = null
    let weg = false
    let nr = 0
    const speel = () => {
      const [start, eind] = knipjes[nr % knipjes.length]
      speler?.loadVideoById({ videoId: filmId, startSeconds: start, endSeconds: eind })
    }
    laadApi().then((YT) => {
      if (weg || !plek.current) return
      speler = new YT.Player(plek.current, {
        host: 'https://www.youtube-nocookie.com',
        videoId: filmId,
        playerVars: { autoplay: 1, mute: 1, controls: 0, disablekb: 1, playsinline: 1, rel: 0, iv_load_policy: 3, start: knipjes[0][0], end: knipjes[0][1] },
        events: {
          onReady: () => { speler?.mute(); speel() },
          onStateChange: (e: { data: number }) => {
            if (e.data === YT.PlayerState.PLAYING) setZichtbaar(true)
            if (e.data === YT.PlayerState.ENDED) { setZichtbaar(false); nr += 1; setTimeout(speel, 300) }
          },
        },
      })
    })
    return () => { weg = true; speler?.destroy() }
  }, [])

  return (
    <div className={`inlog-film ${zichtbaar ? 'speelt' : ''}`} aria-hidden="true">
      <div ref={plek} />
    </div>
  )
}
