import { useMemo } from 'react'
import QRCode from 'qrcode'

// QR-code als SVG (scherp bij elke maat, drukt goed af). Donkere modules in currentColor.
export default function QrCode({ tekst, className }: { tekst: string; className?: string }) {
  const pad = useMemo(() => {
    const { modules } = QRCode.create(tekst, { errorCorrectionLevel: 'M' })
    const n = modules.size
    let d = ''
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`
    return { d, n }
  }, [tekst])
  return (
    <svg className={className} viewBox={`0 0 ${pad.n} ${pad.n}`} shapeRendering="crispEdges" role="img" aria-label={`QR-code: ${tekst}`}>
      <path d={pad.d} fill="currentColor" />
    </svg>
  )
}

// Basisadres voor QR-codes: in de iOS-app is location.origin geen webadres.
export const appAdres = typeof window !== 'undefined' && window.location.protocol.startsWith('http')
  ? window.location.origin : 'https://hgm-onderhoud.vercel.app'
