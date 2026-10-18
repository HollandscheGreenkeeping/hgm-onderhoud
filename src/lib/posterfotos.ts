// Foto's voor de postergenerator.
// - HGM-film: stills uit de HGM-film (public/posters).
// - Hollandsche Golfclub: van hollandschegolfclub.nl (public/merken/hgc-fotos, verkleind; klein/ = keuzelijst).
//   Alleen baan, onderhoud, details en clubhuizen; geen herkenbare portretten.

export type PosterFoto = { url: string; klein: string; groep: string; naam: string }

const hgc: { bestand: string; groep: string; plek: string | null }[] = [
  { bestand: 'baan-22264', groep: 'Baan', plek: null },
  { bestand: 'baan-22265', groep: 'Baan', plek: null },
  { bestand: 'baan-22268', groep: 'Baan', plek: null },
  { bestand: 'baan-22270', groep: 'Baan', plek: null },
  { bestand: 'baan-22276', groep: 'Baan', plek: 'Golfpark International Maastricht' },
  { bestand: 'baan-22279', groep: 'Baan', plek: 'Golfpark International Maastricht' },
  { bestand: 'baan-22284', groep: 'Baan', plek: 'Golfpark International Maastricht' },
  { bestand: 'baan-22286', groep: 'Baan', plek: 'Golfpark International Maastricht' },
  { bestand: 'baan-22287', groep: 'Baan', plek: 'Golfpark International Maastricht' },
  { bestand: 'baan-22293', groep: 'Baan', plek: 'Golfpark International Maastricht' },
  { bestand: 'baan-22303', groep: 'Baan', plek: 'Golfpark International Maastricht' },
  { bestand: 'baan-22306', groep: 'Baan', plek: 'Golfpark International Maastricht' },
  { bestand: 'baan-22309', groep: 'Baan', plek: 'Golfpark International Maastricht' },
  { bestand: 'baan-22310', groep: 'Baan', plek: 'Golfpark International Maastricht' },
  { bestand: 'baan-22317', groep: 'Baan', plek: 'Golfpark International Maastricht' },
  { bestand: 'baan-22324', groep: 'Baan', plek: 'Golfpark International Maastricht' },
  { bestand: 'baan-22331', groep: 'Baan', plek: 'Golfpark International Maastricht' },
  { bestand: 'baan-22339', groep: 'Baan', plek: null },
  { bestand: 'baan-22346', groep: 'Baan', plek: null },
  { bestand: 'baan-22348', groep: 'Baan', plek: null },
  { bestand: 'baan-22351', groep: 'Baan', plek: null },
  { bestand: 'baan-22300', groep: 'Baan', plek: 'Golfpark International Maastricht' },
  { bestand: 'baan-22313', groep: 'Baan', plek: 'Golfpark International Maastricht' },
  { bestand: 'onderhoud-6243', groep: 'Onderhoud', plek: null },
  { bestand: 'onderhoud-22370', groep: 'Onderhoud', plek: null },
  { bestand: 'onderhoud-22373', groep: 'Onderhoud', plek: null },
  { bestand: 'onderhoud-22976', groep: 'Onderhoud', plek: 'Golfpark Naarderbos' },
  { bestand: 'onderhoud-22365', groep: 'Onderhoud', plek: null },
  { bestand: 'onderhoud-22368', groep: 'Onderhoud', plek: null },
  { bestand: 'details-7219', groep: 'Details', plek: null },
  { bestand: 'details-11946', groep: 'Details', plek: null },
  { bestand: 'details-13523', groep: 'Details', plek: null },
  { bestand: 'details-23014', groep: 'Details', plek: null },
  { bestand: 'details-10681', groep: 'Details', plek: 'Golfpark Almkreek' },
  { bestand: 'details-10305', groep: 'Details', plek: 'Golfpark Almkreek' },
  { bestand: 'details-16987', groep: 'Details', plek: null },
  { bestand: 'details-16988', groep: 'Details', plek: null },
  { bestand: 'details-11637', groep: 'Details', plek: null },
  { bestand: 'details-11636', groep: 'Details', plek: null },
  { bestand: 'seizoen-10306', groep: 'Seizoen', plek: null },
  { bestand: 'seizoen-23132', groep: 'Seizoen', plek: null },
  { bestand: 'clubhuis-7166', groep: 'Clubhuis', plek: null },
  { bestand: 'clubhuis-22266', groep: 'Clubhuis', plek: null },
  { bestand: 'clubhuis-5886', groep: 'Clubhuis', plek: null },
  { bestand: 'clubhuis-11621', groep: 'Clubhuis', plek: null },
  { bestand: 'clubhuis-7123', groep: 'Clubhuis', plek: null },
]

export const posterFotos: PosterFoto[] = [
  { url: '/posters/ochtend.jpg', klein: '/posters/ochtend.jpg', groep: 'HGM-film', naam: 'Ochtend' },
  { url: '/posters/nacht.jpg', klein: '/posters/nacht.jpg', groep: 'HGM-film', naam: 'Nacht' },
  { url: '/posters/schemer.jpg', klein: '/posters/schemer.jpg', groep: 'HGM-film', naam: 'Schemer' },
  { url: '/marketing/baan-ochtend.jpg', klein: '/marketing/baan-ochtend.jpg', groep: 'HGM-film', naam: 'Green' },
  { url: '/marketing/maaier-avond.jpg', klein: '/marketing/maaier-avond.jpg', groep: 'HGM-film', naam: 'Maaier' },
  ...hgc.map((f) => ({
    url: `/merken/hgc-fotos/${f.bestand}.jpg`, klein: `/merken/hgc-fotos/klein/${f.bestand}.jpg`,
    groep: f.groep, naam: f.plek ?? f.groep,
  })),
]

export const fotoGroepen = [...new Set(posterFotos.map((f) => f.groep))]
