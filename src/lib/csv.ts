// CSV voor Nederlandse Excel: puntkomma als scheidingsteken, komma als decimaalteken,
// UTF-8 met BOM zodat é en ë goed binnenkomen.

type Waarde = string | number | boolean | null | undefined

function cel(w: Waarde): string {
  if (w == null) return ''
  if (typeof w === 'boolean') return w ? 'ja' : 'nee'
  const s = typeof w === 'number' ? String(w).replace('.', ',') : w
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv(bestandsnaam: string, koppen: string[], rijen: Waarde[][]) {
  const tekst = [koppen, ...rijen].map((r) => r.map(cel).join(';')).join('\r\n')
  const blob = new Blob(['﻿' + tekst], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = bestandsnaam
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
