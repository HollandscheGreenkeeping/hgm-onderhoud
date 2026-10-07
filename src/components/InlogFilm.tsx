import { useEffect, useState } from 'react'

// Achtergrondfilm op het inlogscherm: greenkeeper-knipjes uit de HGM-film "KLM Open 2019"
// (public/inlog-film.mp4, 28 s, zonder geluid). Alleen op brede schermen, want het beeldvak is op de
// telefoon verborgen; bij "minder beweging" alleen de stilstaande foto.
export default function InlogFilm() {
  const [film, setFilm] = useState(false)

  useEffect(() => {
    const breed = window.matchMedia('(min-width: 901px)').matches
    const rustig = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setFilm(breed && !rustig)
  }, [])

  return film
    ? <video className="inlog-film" src="/inlog-film.mp4" poster="/inlog-film.jpg" autoPlay muted loop playsInline aria-hidden="true" />
    : <img className="inlog-film" src="/inlog-film.jpg" alt="" />
}
