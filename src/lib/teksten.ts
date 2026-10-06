// Weergaveteksten voor waarden uit de database.

export const storingStatus: Record<string, string> = {
  gemeld: 'Gemeld',
  toegewezen: 'Toegewezen',
  in_behandeling: 'In behandeling',
  opgelost: 'Opgelost',
  gecontroleerd: 'Gecontroleerd',
}
export const openStoringStatussen = ['gemeld', 'toegewezen', 'in_behandeling']

export const urgentieNamen: Record<string, string> = {
  laag: 'Laag',
  normaal: 'Normaal',
  hoog: 'Hoog',
  spoed: 'Spoed',
}

export const taakStatus: Record<string, string> = {
  open: 'Open',
  in_behandeling: 'Bezig',
  afgerond: 'Afgerond',
  geannuleerd: 'Geannuleerd',
}

export const objectStatus: Record<string, string> = {
  in_orde: 'In orde',
  storing: 'Storing',
  in_onderhoud: 'In onderhoud',
}

export const datum = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

export const datumTijd = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

export const vandaag = () => new Date().toISOString().slice(0, 10)

// Kort en mono-geschikt: "nu", "12 m", "2 u", "1 d", "3 w".
export function relatieveTijd(d: string | null | undefined) {
  if (!d) return ''
  const min = Math.max(0, Math.round((Date.now() - Date.parse(d)) / 60000))
  if (min < 1) return 'nu'
  if (min < 60) return `${min} m`
  if (min < 60 * 24) return `${Math.round(min / 60)} u`
  if (min < 60 * 24 * 14) return `${Math.round(min / 1440)} d`
  return `${Math.round(min / 10080)} w`
}

// Twee letters voor een avatarrondje.
export const initialen = (naam: string | null | undefined) =>
  (naam ?? '?').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

// Naam van een object of leiding voor in lijsten.
export function objectTitel(o: { code: string | null; objecttypes: { naam: string } | null } | null) {
  return o ? [o.objecttypes?.naam, o.code].filter(Boolean).join(' ') : null
}
