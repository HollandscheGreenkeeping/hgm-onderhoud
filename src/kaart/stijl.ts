import type { FeatureCollection } from 'geojson'
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl'

// Kleuren op de kaart. Status gaat altijd voor categorie: rood = open storing,
// oranje = in onderhoud of gepland binnen 7 dagen.
export const kleuren = {
  storing: '#c8402f',
  gepland: '#9c6312',
  beregening: '#2c7fd0',
  drainage: '#8a5a3c',
  kabel: '#7a3fb0',
  overig: '#6b7280',
  green: '#43a047',
  tee: '#7cb342',
  fairway: '#9ccc65',
  rough: '#c5e1a5',
  bunker: '#f3e5ab',
  water: '#4fc3f7',
}

export const categorieen = ['beregening', 'drainage', 'kabel', 'overig'] as const
export type Categorie = (typeof categorieen)[number]

export type Statusfilter = 'alle' | 'storing' | 'onderhoud' | 'in_orde'

export const lettertype = ['Noto Sans Medium']

// Achtergrond: PDOK luchtfoto (tot zoom 21, ±8 cm) en BRT-achtergrondkaart.
export const basisStijl: StyleSpecification = {
  version: 8,
  glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
  sources: {
    luchtfoto: {
      type: 'raster',
      tiles: ['https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg'],
      tileSize: 256,
      maxzoom: 21,
      attribution: 'Luchtfoto © <a href="https://www.pdok.nl">PDOK</a> / Beeldmateriaal Nederland',
    },
    brt: {
      type: 'raster',
      tiles: ['https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 21,
      attribution: 'Kaart © <a href="https://www.pdok.nl">PDOK</a> / Kadaster',
    },
  },
  layers: [
    { id: 'luchtfoto', type: 'raster', source: 'luchtfoto' },
    { id: 'brt', type: 'raster', source: 'brt', layout: { visibility: 'none' }, paint: { 'raster-saturation': -0.25 } },
  ],
}

const leeg = (): FeatureCollection => ({ type: 'FeatureCollection', features: [] })
export const bronnen = ['holes', 'speellijnen', 'baanvlakken', 'leidingen', 'objecten', 'meldingen', 'voorstellen'] as const
export type Bron = (typeof bronnen)[number]
// Baangeometrie kan (deels) uit OpenStreetMap komen: bronvermelding verplicht (ODbL).
const osmBronnen = new Set<string>(['holes', 'speellijnen', 'baanvlakken'])
export const legeBron = (bron?: string) => ({
  type: 'geojson' as const, data: leeg(), promoteId: 'id',
  ...(bron && osmBronnen.has(bron) ? { attribution: 'Baan deels © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers' } : {}),
})

const statusKleur = (categorieKleur: ExpressionSpecification): ExpressionSpecification => [
  'match', ['get', 'kaartstatus'],
  'storing', kleuren.storing,
  ['gepland', 'in_onderhoud'], kleuren.gepland,
  categorieKleur,
]

const categorieKleur: ExpressionSpecification = [
  'match', ['get', 'categorie'],
  'beregening', kleuren.beregening,
  'drainage', kleuren.drainage,
  'kabel', kleuren.kabel,
  kleuren.overig,
]

const lijnBreedte: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 14, 1.5, 18, 3, 21, 6]

export const kaartLagen: LayerSpecification[] = [
  {
    id: 'baanvlakken-vlak', type: 'fill', source: 'baanvlakken',
    paint: {
      'fill-color': ['match', ['get', 'type'],
        'green', kleuren.green, 'tee', kleuren.tee, 'fairway', kleuren.fairway,
        'bunker', kleuren.bunker, 'water', kleuren.water, kleuren.rough],
      'fill-opacity': 0.3,
    },
  },
  {
    id: 'baanvlakken-rand', type: 'line', source: 'baanvlakken',
    paint: {
      'line-color': ['match', ['get', 'type'],
        'green', kleuren.green, 'tee', kleuren.tee, 'fairway', kleuren.fairway,
        'bunker', '#d4b85a', 'water', '#0288d1', kleuren.rough],
      'line-width': 1.5,
    },
  },
  {
    // Onzichtbaar vlak: alleen om een hole aan te kunnen tikken (tekenen).
    id: 'holes-vlak', type: 'fill', source: 'holes',
    paint: { 'fill-color': '#000000', 'fill-opacity': 0 },
  },
  {
    id: 'holes-rand', type: 'line', source: 'holes',
    // Holegrens subtiel: de speellijn is het belangrijkste beeld.
    paint: { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.35 },
  },
  {
    id: 'speellijnen-lijn', type: 'line', source: 'speellijnen',
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1, 18, 2.5], 'line-opacity': 0.85, 'line-dasharray': [3, 2] },
  },
  {
    id: 'speellijnen-lengte', type: 'symbol', source: 'speellijnen', minzoom: 16.5,
    layout: {
      'symbol-placement': 'line-center',
      'text-field': ['concat', ['to-string', ['get', 'lengte_m']], ' m'],
      'text-font': lettertype, 'text-size': 13, 'text-offset': [0, -0.8],
    },
    paint: { 'text-color': '#ffffff', 'text-halo-color': '#26301c', 'text-halo-width': 1.5 },
  },
  {
    // Eigen puntbron (midden van de hole), anders herhaalt MapLibre het label per kaarttegel.
    id: 'holes-label', type: 'symbol', source: 'holelabels',
    layout: {
      'text-field': ['coalesce', ['get', 'label'], ['concat', 'Hole ', ['to-string', ['get', 'nummer']]]],
      'text-font': lettertype,
      'text-size': 16,
    },
    paint: { 'text-color': '#ffffff', 'text-halo-color': '#1b3d26', 'text-halo-width': 2 },
  },
  // Leidingen die alleen van tekening zijn overgetrokken: gestippeld (minder betrouwbaar).
  {
    id: 'leidingen-tekening', type: 'line', source: 'leidingen',
    filter: ['==', ['get', 'nauwkeurigheid'], 'tekening'],
    layout: { 'line-cap': 'butt' },
    paint: { 'line-color': statusKleur(categorieKleur), 'line-width': lijnBreedte, 'line-dasharray': [2, 1.5] },
  },
  {
    id: 'leidingen-ingemeten', type: 'line', source: 'leidingen',
    filter: ['!=', ['get', 'nauwkeurigheid'], 'tekening'],
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': statusKleur(categorieKleur), 'line-width': lijnBreedte },
  },
  {
    id: 'voorstellen-lijn', type: 'line', source: 'voorstellen',
    paint: { 'line-color': kleuren.gepland, 'line-width': 3, 'line-dasharray': [1, 1] },
  },
  {
    id: 'objecten-cirkel', type: 'circle', source: 'objecten',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 3, 18, 7, 21, 12],
      'circle-color': statusKleur(categorieKleur),
      // Oplichten als de muis boven de bijbehorende rij in de storingenlijst staat.
      'circle-stroke-color': ['case', ['boolean', ['feature-state', 'hover'], false], '#2a3520', '#ffffff'],
      'circle-stroke-width': ['case', ['boolean', ['feature-state', 'hover'], false], 5, 1.5],
    },
  },
  {
    id: 'objecten-label', type: 'symbol', source: 'objecten', minzoom: 18,
    layout: {
      'text-field': ['coalesce', ['get', 'code'], ''],
      'text-font': lettertype,
      'text-size': 14,
      'text-offset': [0, 1.3],
      'text-anchor': 'top',
    },
    paint: { 'text-color': '#ffffff', 'text-halo-color': '#000000', 'text-halo-width': 1.5 },
  },
  {
    id: 'meldingen-cirkel', type: 'circle', source: 'meldingen',
    paint: {
      'circle-radius': ['case', ['boolean', ['feature-state', 'hover'], false], 15, 11],
      'circle-color': kleuren.storing,
      'circle-stroke-color': ['case', ['boolean', ['feature-state', 'hover'], false], '#2a3520', '#ffffff'],
      'circle-stroke-width': ['case', ['boolean', ['feature-state', 'hover'], false], 4, 2],
    },
  },
  {
    id: 'meldingen-teken', type: 'symbol', source: 'meldingen',
    layout: { 'text-field': '!', 'text-font': lettertype, 'text-size': 16, 'text-allow-overlap': true },
    paint: { 'text-color': '#ffffff' },
  },
]

// Selectie-accent (gele rand) bovenop alles.
export const selectieLagen: LayerSpecification[] = [
  {
    id: 'selectie-lijn', type: 'line', source: 'leidingen',
    filter: ['==', ['get', 'id'], ''],
    paint: { 'line-color': '#ffeb3b', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 6, 18, 8, 21, 12], 'line-opacity': 0.9 },
  },
  {
    id: 'selectie-punt', type: 'circle', source: 'objecten',
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 8, 18, 13, 21, 18],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': '#ffeb3b',
      'circle-stroke-width': 4,
    },
  },
]

// Lagen waarop je kunt tikken, in volgorde van voorkeur.
export const klikbareLagen = ['meldingen-cirkel', 'objecten-cirkel', 'leidingen-ingemeten', 'leidingen-tekening']

export function statusFilterExpressie(filter: Statusfilter): ExpressionSpecification | true {
  switch (filter) {
    case 'storing': return ['==', ['get', 'kaartstatus'], 'storing']
    case 'onderhoud': return ['in', ['get', 'kaartstatus'], ['literal', ['gepland', 'in_onderhoud']]]
    case 'in_orde': return ['==', ['get', 'kaartstatus'], 'in_orde']
    default: return true
  }
}
