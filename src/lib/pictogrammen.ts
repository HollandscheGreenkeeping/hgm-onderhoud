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

// Huisstijlen: HGM Golf (onderhoud, werkvloer) en de Hollandsche Golfclub (golfers op de baan).
export type Merk = 'hgm' | 'hgc'
export type Sjabloon = 'pictogram' | 'foto' | 'split' | 'kaart' | 'kader' | 'tekst'

// Kant-en-klare boodschappen: tekst en pictogrammen, daarna vrij aan te passen.
// merken: bij welke huisstijl ze in de lijst staan (standaard alleen HGM).
export type Boodschap = {
  naam: string; groep: string; merken?: Merk[]
  sjabloon: Sjabloon; kleur?: string
  kop: string; tekst: string; pictos: string[]; foto?: string; qr?: boolean
}

export const boodschappen: Boodschap[] = [
  { groep: 'Veiligheid', naam: 'Niet roken', merken: ['hgm', 'hgc'], sjabloon: 'pictogram', pictos: ['P002'],
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
  { groep: 'Nood en EHBO', naam: 'EHBO', merken: ['hgm', 'hgc'], sjabloon: 'pictogram', pictos: ['E003'],
    kop: 'EHBO', tekst: 'Hier hangt de verbandtrommel. Bij nood: bel 112.' },
  { groep: 'Nood en EHBO', naam: 'AED', merken: ['hgm', 'hgc'], sjabloon: 'pictogram', pictos: ['E010'],
    kop: 'AED', tekst: 'Bij een hartstilstand: bel 112, start reanimatie en laat de AED halen.' },
  { groep: 'Nood en EHBO', naam: 'Brandblusser', merken: ['hgm', 'hgc'], sjabloon: 'pictogram', pictos: ['F001'],
    kop: 'Brandblusser', tekst: 'Houd de blusser vrij. Gebruikt? Meld het, dan wordt hij gevuld.' },
  { groep: 'Nood en EHBO', naam: 'Nooduitgang', merken: ['hgm', 'hgc'], sjabloon: 'pictogram', pictos: ['E002'],
    kop: 'Nooduitgang', tekst: 'Altijd vrijhouden.' },
  { groep: 'Werkplaats', naam: 'Machine schoon terug', sjabloon: 'foto', pictos: [], foto: '/posters/nacht.jpg', qr: true,
    kop: 'Machine schoon terug', tekst: 'Na gebruik afspuiten, tanken en terugzetten. Defect? Meld het in de app.' },
  { groep: 'Werkplaats', naam: 'Storing melden', sjabloon: 'foto', pictos: [], foto: '/posters/ochtend.jpg', qr: true,
    kop: 'Zie je iets kapot? Meld het.', tekst: 'Waar, wat en hoe dringend, met een foto. Meteen bij de juiste persoon.' },
  { groep: 'Werkplaats', naam: 'Deur dicht', sjabloon: 'tekst', pictos: [],
    kop: 'Deur dicht houden', tekst: 'Ook overdag. Er staan machines en middelen binnen.' },
  { groep: 'Op de baan', naam: 'Pitchmarks', merken: ['hgc'], sjabloon: 'kader', pictos: [], foto: '/merken/hgc-fotos/baan-22346.jpg',
    kop: 'Herstel je pitchmark', tekst: 'En nog één erbij. Zo blijft de green mooi voor iedereen.' },
  { groep: 'Op de baan', naam: 'Bunker harken', merken: ['hgc'], sjabloon: 'split', pictos: [], foto: '/merken/hgc-fotos/baan-22331.jpg',
    kop: 'Hark de bunker', tekst: 'Laat de bunker achter zoals je hem zelf zou willen aantreffen.' },
  { groep: 'Op de baan', naam: 'Trolleys en buggy’s', merken: ['hgc'], sjabloon: 'kaart', kleur: 'groen', pictos: [],
    kop: 'Trolleys niet op tee en green', tekst: 'Ook niet tussen green en bunker. Volg de paden en de paaltjes.' },
  { groep: 'Op de baan', naam: 'Greenkeepers aan het werk', merken: ['hgc'], sjabloon: 'pictogram', pictos: ['W001'],
    kop: 'Greenkeepers aan het werk', tekst: 'Wacht op een teken van de greenkeeper voordat je slaat.' },
  { groep: 'Op de baan', naam: 'Onweer', merken: ['hgc'], sjabloon: 'pictogram', pictos: ['W001'],
    kop: 'Onweer? Verlaat de baan', tekst: 'Ga naar het clubhuis of een schuilhut. Niet schuilen onder bomen.' },
  { groep: 'Op de baan', naam: 'Paddestoelen', merken: ['hgc'], sjabloon: 'split', kleur: 'oranje', pictos: [], foto: '/merken/hgc-fotos/details-13523.jpg',
    kop: 'Paddestoelen op de baan', tekst: 'Mooi om te zien, niet om te plukken of te eten. Sommige soorten zijn giftig.' },
  { groep: 'Baanstatus', naam: 'Baan gesloten', merken: ['hgc'], sjabloon: 'kaart', pictos: [],
    kop: 'Baan gesloten', tekst: 'Vanwege de weersomstandigheden is de baan vandaag gesloten. Kijk voor actuele informatie op de website.' },
  { groep: 'Baanstatus', naam: 'Wintergreens', merken: ['hgc'], sjabloon: 'kader', pictos: [], foto: '/merken/hgc-fotos/seizoen-10306.jpg',
    kop: 'Vandaag wintergreens', tekst: 'De zomergreens zijn gesloten. Speel naar de wintergreens.' },
  { groep: 'Baanstatus', naam: 'Onderhoud greens', merken: ['hgc'], sjabloon: 'foto', pictos: [], foto: '/merken/hgc-fotos/onderhoud-22370.jpg',
    kop: 'Greens in onderhoud', tekst: 'De greens zijn gestoken en bezand. De komende weken rollen ze iets langzamer. Dank voor je begrip.' },
  { groep: 'Op de baan', naam: 'Schapen in de baan', merken: ['hgc'], sjabloon: 'split', kleur: 'limoen', pictos: [], foto: '/merken/hgc-fotos/details-10681.jpg',
    kop: 'Schapen in de baan', tekst: 'Onze grazers houden de rough kort. Geef ze de ruimte en sla niet als ze in de buurt zijn.' },
  { groep: 'Op de baan', naam: 'Speeltempo', merken: ['hgc'], sjabloon: 'kaart', kleur: 'lichtblauw', pictos: [],
    kop: 'Houd het tempo erin', tekst: 'Blijf aansluiten bij de flight voor je. Laat sneller spel door als er een hole vrij is.' },
  { groep: 'Op de baan', naam: 'Natuur', merken: ['hgc'], sjabloon: 'kader', kleur: 'groen', pictos: [], foto: '/merken/hgc-fotos/details-10305.jpg',
    kop: 'Natuur op de baan', tekst: 'Ecologisch beheerde rough met bloemen en insecten. Zoek je bal hier niet te lang.' },
  { groep: 'Baanstatus', naam: 'Bunkers in onderhoud', merken: ['hgc'], sjabloon: 'split', pictos: [], foto: '/merken/hgc-fotos/onderhoud-22365.jpg',
    kop: 'Bunkers in onderhoud', tekst: 'De bunkers krijgen nieuw zand. Kijk voor de plaatselijke regel op het bord bij de starter.' },
  { groep: 'Werkplaats', naam: 'Gemaaid en klaar', sjabloon: 'kader', pictos: [], foto: '/merken/hgc-fotos/onderhoud-22976.jpg',
    kop: 'Elke streep telt', tekst: 'Goed maaiwerk begint bij scherpe messen. Na elke ronde: schoon, getankt en gecontroleerd.' },
  { groep: 'Faciliteiten', naam: 'Buggy’s op het pad', merken: ['hgc'], sjabloon: 'pictogram', pictos: ['sym:golf-cart'],
    kop: 'Buggy’s alleen op het pad', tekst: 'Blijf op afstand van greens en tees. Volg de paaltjes.' },
  { groep: 'Faciliteiten', naam: 'Golfsets te huur', merken: ['hgc'], sjabloon: 'split', pictos: ['sym:golf-bat', 'sym:golf-cart', 'sym:golf-ball'],
    foto: '/merken/hgc-fotos/baan-22264.jpg', kop: 'Golfsets te huur', tekst: 'Huur een set clubs, ballen of een buggy bij de receptie.' },
  { groep: 'Faciliteiten', naam: 'Clubhuis en horeca', merken: ['hgc'], sjabloon: 'kaart', kleur: 'groen', pictos: ['sym:coffee-02', 'sym:spoon-and-knife', 'sym:beer'],
    kop: 'Clubhuis', tekst: 'Koffie, lunch en een borrel na je ronde.' },
  { groep: 'Faciliteiten', naam: 'Terras', merken: ['hgc'], sjabloon: 'kader', kleur: 'oranje', pictos: ['sym:sun-03', 'sym:drink'],
    foto: '/merken/hgc-fotos/baan-22339.jpg', kop: 'Terras open', tekst: 'Geniet na je ronde van een drankje met uitzicht op de baan.' },
  { groep: 'Faciliteiten', naam: 'Toiletten en kleedruimte', merken: ['hgc'], sjabloon: 'tekst', kleur: 'blauw', pictos: ['sym:toilet-01', 'sym:shower-head', 'sym:locker'],
    kop: 'Toiletten en kleedruimte', tekst: 'Met douches en kluisjes. Neem je eigen slot mee.' },
  { groep: 'Faciliteiten', naam: 'Laadplek buggy’s', sjabloon: 'pictogram', merken: ['hgm', 'hgc'], pictos: ['sym:ev-charging', 'W026'],
    kop: 'Laadplek buggy’s', tekst: 'Alleen voor elektrische buggy’s. Stekker na het laden terug in de houder.' },
]

