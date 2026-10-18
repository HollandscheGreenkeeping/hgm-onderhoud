// Officiële ISO 7010-pictogrammen voor de postergenerator (HGM → Posters).
// De SVG's staan ongewijzigd in public/pictogrammen/iso7010 (Wikimedia Commons, public domain; zie BRON.md).
// Geen baandata, dus geen keuzelijst in de database: de set ligt vast in de norm.

export type Soort = 'verbod' | 'gebod' | 'waarschuwing' | 'redding' | 'brand'

export const soortNamen: Record<Soort, string> = {
  verbod: 'Verbod', gebod: 'Gebod', waarschuwing: 'Waarschuwing', redding: 'Redding en EHBO', brand: 'Brand',
}

export type Pictogram = { code: string; naam: string; soort: Soort }

export const pictogrammen: Pictogram[] = [
  { code: 'P002', naam: 'Roken verboden', soort: 'verbod' },
  { code: 'P003', naam: 'Open vuur en roken verboden', soort: 'verbod' },
  { code: 'P004', naam: 'Verboden voor voetgangers', soort: 'verbod' },
  { code: 'P006', naam: 'Verboden voor heftrucks', soort: 'verbod' },
  { code: 'P010', naam: 'Niet aanraken', soort: 'verbod' },
  { code: 'P011', naam: 'Niet blussen met water', soort: 'verbod' },
  { code: 'P012', naam: 'Geen zware last', soort: 'verbod' },
  { code: 'M001', naam: 'Algemeen gebod', soort: 'gebod' },
  { code: 'M003', naam: 'Gehoorbescherming', soort: 'gebod' },
  { code: 'M004', naam: 'Oogbescherming', soort: 'gebod' },
  { code: 'M008', naam: 'Veiligheidsschoenen', soort: 'gebod' },
  { code: 'M009', naam: 'Veiligheidshandschoenen', soort: 'gebod' },
  { code: 'M010', naam: 'Beschermende kleding', soort: 'gebod' },
  { code: 'M014', naam: 'Veiligheidshelm', soort: 'gebod' },
  { code: 'M015', naam: 'Signaalkleding', soort: 'gebod' },
  { code: 'M016', naam: 'Mondmasker', soort: 'gebod' },
  { code: 'M017', naam: 'Ademhalingsbescherming', soort: 'gebod' },
  { code: 'W001', naam: 'Algemeen gevaar', soort: 'waarschuwing' },
  { code: 'W011', naam: 'Gladde vloer', soort: 'waarschuwing' },
  { code: 'W012', naam: 'Elektrische spanning', soort: 'waarschuwing' },
  { code: 'W014', naam: 'Heftrucks', soort: 'waarschuwing' },
  { code: 'W016', naam: 'Giftige stoffen', soort: 'waarschuwing' },
  { code: 'W021', naam: 'Brandbare stoffen', soort: 'waarschuwing' },
  { code: 'W023', naam: 'Bijtende stoffen', soort: 'waarschuwing' },
  { code: 'W024', naam: 'Handletsel', soort: 'waarschuwing' },
  { code: 'W026', naam: 'Accu’s laden', soort: 'waarschuwing' },
  { code: 'E001', naam: 'Nooduitgang (links)', soort: 'redding' },
  { code: 'E002', naam: 'Nooduitgang (rechts)', soort: 'redding' },
  { code: 'E003', naam: 'EHBO', soort: 'redding' },
  { code: 'E004', naam: 'Noodtelefoon', soort: 'redding' },
  { code: 'E009', naam: 'Arts', soort: 'redding' },
  { code: 'E010', naam: 'AED', soort: 'redding' },
  { code: 'E011', naam: 'Oogdouche', soort: 'redding' },
  { code: 'F001', naam: 'Brandblusser', soort: 'brand' },
  { code: 'F005', naam: 'Brandmelder', soort: 'brand' },
]

export const pictogramUrl = (code: string) => `/pictogrammen/iso7010/${code}.svg`
export const zoekPictogram = (code: string) => pictogrammen.find((p) => p.code === code)

// Kant-en-klare boodschappen: tekst en pictogrammen, daarna vrij aan te passen.
export type Boodschap = {
  naam: string; groep: string
  sjabloon: 'pictogram' | 'foto' | 'tekst'
  kop: string; tekst: string; pictos: string[]; foto?: string; qr?: boolean
}

export const boodschappen: Boodschap[] = [
  { groep: 'Veiligheid', naam: 'Niet roken', sjabloon: 'pictogram', pictos: ['P002'],
    kop: 'Niet roken', tekst: 'Ook geen e-sigaret. Roken mag alleen op de rookplek buiten.' },
  { groep: 'Veiligheid', naam: 'Geen open vuur', sjabloon: 'pictogram', pictos: ['P003'],
    kop: 'Geen open vuur', tekst: 'Hier staan brandstof en middelen opgeslagen. Niet roken, niet lassen zonder vergunning.' },
  { groep: 'Veiligheid', naam: 'Veiligheidsschoenen', sjabloon: 'pictogram', pictos: ['M008'],
    kop: 'Veiligheidsschoenen verplicht', tekst: 'In de werkplaats en bij het werken met machines.' },
  { groep: 'Veiligheid', naam: 'Gehoorbescherming', sjabloon: 'pictogram', pictos: ['M003'],
    kop: 'Gehoorbescherming verplicht', tekst: 'Bij maaien, blazen, slijpen en zagen. Doppen liggen in de kantine.' },
  { groep: 'Veiligheid', naam: 'PBM in de werkplaats', sjabloon: 'pictogram', pictos: ['M008', 'M009', 'M004'],
    kop: 'Persoonlijke bescherming verplicht', tekst: 'Veiligheidsschoenen, handschoenen en een veiligheidsbril.' },
  { groep: 'Veiligheid', naam: 'Messen en cilinders', sjabloon: 'pictogram', pictos: ['W024'],
    kop: 'Eerst motor uit, sleutel eruit', tekst: 'Pas dan aan maaimessen, cilinders of de aandrijving werken.' },
  { groep: 'Veiligheid', naam: 'Accu’s laden', sjabloon: 'pictogram', pictos: ['W026', 'P003'],
    kop: 'Laadplek accu’s', tekst: 'Zorg voor ventilatie. Geen open vuur, niet roken.' },
  { groep: 'Veiligheid', naam: 'Heftruck', sjabloon: 'pictogram', pictos: ['W014'],
    kop: 'Let op: heftruck', tekst: 'Blijf uit de rijbaan als er geladen of gelost wordt.' },
  { groep: 'Veiligheid', naam: 'Gladde vloer', sjabloon: 'pictogram', pictos: ['W011'],
    kop: 'Gladde vloer', tekst: 'Vooral bij de wasplaats. Rustig lopen.' },
  { groep: 'Veiligheid', naam: 'Pompstation', sjabloon: 'pictogram', pictos: ['W012', 'P010'],
    kop: 'Pompstation beregening', tekst: 'Alleen voor bevoegde medewerkers. Storing? Meld het in de app.' },
  { groep: 'Middelen en brandstof', naam: 'Opslag gewasbescherming', sjabloon: 'pictogram', pictos: ['W016'],
    kop: 'Opslag gewasbeschermingsmiddelen', tekst: 'Alleen toegang met spuitlicentie. Deur altijd op slot.' },
  { groep: 'Middelen en brandstof', naam: 'Middelen mengen', sjabloon: 'pictogram', pictos: ['M009', 'M004', 'M017'],
    kop: 'Mengen en vullen', tekst: 'Draag handschoenen, een bril en ademhalingsbescherming. Gebruik boeken in de app.' },
  { groep: 'Middelen en brandstof', naam: 'Brandstofopslag', sjabloon: 'pictogram', pictos: ['W021', 'P003'],
    kop: 'Brandstofopslag', tekst: 'Niet roken, geen open vuur. Lekbak gebruiken bij het tanken.' },
  { groep: 'Middelen en brandstof', naam: 'Bijtende stoffen', sjabloon: 'pictogram', pictos: ['W023', 'M004'],
    kop: 'Bijtende stoffen', tekst: 'Draag een veiligheidsbril. Oogdouche staat bij de wasplaats.' },
  { groep: 'Nood en EHBO', naam: 'EHBO', sjabloon: 'pictogram', pictos: ['E003'],
    kop: 'EHBO', tekst: 'Hier hangt de verbandtrommel. Bij nood: bel 112.' },
  { groep: 'Nood en EHBO', naam: 'AED', sjabloon: 'pictogram', pictos: ['E010'],
    kop: 'AED', tekst: 'Bij een hartstilstand: bel 112, start reanimatie en laat de AED halen.' },
  { groep: 'Nood en EHBO', naam: 'Brandblusser', sjabloon: 'pictogram', pictos: ['F001'],
    kop: 'Brandblusser', tekst: 'Houd de blusser vrij. Gebruikt? Meld het, dan wordt hij gevuld.' },
  { groep: 'Nood en EHBO', naam: 'Nooduitgang', sjabloon: 'pictogram', pictos: ['E002'],
    kop: 'Nooduitgang', tekst: 'Altijd vrijhouden.' },
  { groep: 'Werkplaats', naam: 'Machine schoon terug', sjabloon: 'foto', pictos: [], foto: '/posters/nacht.jpg', qr: true,
    kop: 'Machine schoon terug', tekst: 'Na gebruik afspuiten, tanken en terugzetten. Defect? Meld het in de app.' },
  { groep: 'Werkplaats', naam: 'Storing melden', sjabloon: 'foto', pictos: [], foto: '/posters/ochtend.jpg', qr: true,
    kop: 'Zie je iets kapot? Meld het.', tekst: 'Waar, wat en hoe dringend, met een foto. Meteen bij de juiste persoon.' },
  { groep: 'Werkplaats', naam: 'Deur dicht', sjabloon: 'tekst', pictos: [],
    kop: 'Deur dicht houden', tekst: 'Ook overdag. Er staan machines en middelen binnen.' },
]
