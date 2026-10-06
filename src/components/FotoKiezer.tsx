import { useEffect, useMemo } from 'react'

// Foto's toevoegen. Eén vak: op een telefoon kiest de gebruiker zelf camera of galerij.
export default function FotoKiezer({ fotos, wijzig }: { fotos: File[]; wijzig: (f: File[]) => void }) {
  const voorbeelden = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos])
  useEffect(() => () => voorbeelden.forEach((u) => URL.revokeObjectURL(u)), [voorbeelden])

  return (
    <div className="fotokiezer">
      <label className="foto-toevoegen">
        <span className="foto-plus" aria-hidden="true">+</span>
        <span>
          <strong>Foto toevoegen</strong>
          <span className="zacht klein-tekst"> · camera of galerij</span>
        </span>
        <input type="file" accept="image/*" multiple hidden
               onChange={(e) => { if (e.target.files) wijzig([...fotos, ...Array.from(e.target.files)]); e.target.value = '' }} />
      </label>
      {fotos.length > 0 && (
        <div className="fotos">
          {voorbeelden.map((u, i) => (
            <div key={u} className="foto-voorbeeld">
              <img src={u} alt={`Foto ${i + 1}`} />
              <button type="button" aria-label="Foto verwijderen"
                      onClick={() => wijzig(fotos.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
