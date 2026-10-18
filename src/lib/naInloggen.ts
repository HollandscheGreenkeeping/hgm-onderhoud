// Waar iemand heen wilde voordat het inlogscherm ertussen kwam (bijv. een gescande QR-sticker).
// Beveiligd bewaart het adres; na inloggen, tweestaps of nieuw wachtwoord gaat de app daarheen.
const sleutel = 'hgm-na-inloggen'

export function bewaarDoel(pad: string) {
  try { sessionStorage.setItem(sleutel, pad) } catch { /* privémodus */ }
}

export function doelNaInloggen() {
  try { return sessionStorage.getItem(sleutel) ?? '/' } catch { return '/' }
}

export function vergeetDoel() {
  try { sessionStorage.removeItem(sleutel) } catch { /* privémodus */ }
}
