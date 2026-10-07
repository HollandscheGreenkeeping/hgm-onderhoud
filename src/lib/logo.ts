// Snijdt lege randen van een logo weg vóór het uploaden, zodat het overal (kopbalk, tegels,
// rapport) zo groot mogelijk staat. PNG: transparante en witte randen. SVG: viewBox om de tekening.
// Lukt het niet, dan gaat het origineel ongewijzigd door.

const marge = 0.02 // 2 % lucht rondom

export async function logoBijsnijden(bestand: File): Promise<Blob> {
  try {
    if (bestand.type === 'image/svg+xml') return await svgBijsnijden(bestand)
    if (bestand.type === 'image/png') return await pngBijsnijden(bestand)
  } catch { /* origineel gebruiken */ }
  return bestand
}

async function pngBijsnijden(bestand: File): Promise<Blob> {
  const bitmap = await createImageBitmap(bestand)
  const { width: b, height: h } = bitmap
  const canvas = new OffscreenCanvas(b, h)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const px = ctx.getImageData(0, 0, b, h).data
  // Leeg = bijna doorzichtig, of (bijna) wit.
  const leeg = (i: number) => px[i + 3] < 16 || (px[i] > 245 && px[i + 1] > 245 && px[i + 2] > 245)

  let links = b, rechts = -1, boven = h, onder = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < b; x++) {
      if (leeg((y * b + x) * 4)) continue
      if (x < links) links = x
      if (x > rechts) rechts = x
      if (y < boven) boven = y
      if (y > onder) onder = y
    }
  }
  if (rechts < 0) return bestand // helemaal leeg

  const m = Math.round(Math.max(rechts - links, onder - boven) * marge)
  const x0 = Math.max(0, links - m), y0 = Math.max(0, boven - m)
  const x1 = Math.min(b, rechts + 1 + m), y1 = Math.min(h, onder + 1 + m)
  if (x0 === 0 && y0 === 0 && x1 === b && y1 === h) return bestand

  const uit = new OffscreenCanvas(x1 - x0, y1 - y0)
  uit.getContext('2d')!.drawImage(canvas, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0)
  return uit.convertToBlob({ type: 'image/png' })
}

async function svgBijsnijden(bestand: File): Promise<Blob> {
  const doc = new DOMParser().parseFromString(await bestand.text(), 'image/svg+xml')
  const svg = doc.documentElement
  if (svg.nodeName !== 'svg' || doc.querySelector('parsererror')) return bestand

  // Meten kan alleen in het document. Eerst alles wat code kan uitvoeren eruit (scripts, on…-attributen).
  const meet = document.importNode(svg, true) as unknown as SVGSVGElement
  meet.querySelectorAll('script, foreignObject').forEach((e) => e.remove())
  for (const e of [meet, ...meet.querySelectorAll('*')]) {
    for (const a of [...e.attributes]) if (a.name.toLowerCase().startsWith('on')) e.removeAttribute(a.name)
  }
  meet.setAttribute('style', 'position:absolute;left:-99999px;top:0;visibility:hidden')
  document.body.appendChild(meet)
  let vak: DOMRect
  try { vak = meet.getBBox() } finally { meet.remove() }
  if (!vak.width || !vak.height) return bestand

  const m = Math.max(vak.width, vak.height) * marge
  const r = (n: number) => Math.round(n * 100) / 100
  svg.setAttribute('viewBox', [vak.x - m, vak.y - m, vak.width + 2 * m, vak.height + 2 * m].map(r).join(' '))
  svg.setAttribute('width', String(r(vak.width + 2 * m)))
  svg.setAttribute('height', String(r(vak.height + 2 * m)))
  svg.removeAttribute('preserveAspectRatio')
  return new Blob([new XMLSerializer().serializeToString(doc)], { type: 'image/svg+xml' })
}
