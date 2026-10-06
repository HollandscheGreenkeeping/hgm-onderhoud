import { kleuren, type Categorie, type Statusfilter } from './stijl'
import { kleurBovenCss, kleurOnderCss, kleurschaalCss, nap } from './hoogte'

export type Laaginstellingen = {
  achtergrond: 'luchtfoto' | 'brt'
  baanvlakken: boolean
  holes: boolean
  meldingen: boolean
  hoogte: boolean
  hoogtelijnen: 0 | 0.1 | 0.25 | 0.5 // interval in m, 0 = uit
  reliëf: 0 | 1 | 2 | 5 // 3D-overdrijving, 0 = plat
  categorieen: Record<Categorie, boolean>
  status: Statusfilter
}

export const standaardLagen: Laaginstellingen = {
  achtergrond: 'luchtfoto',
  baanvlakken: true,
  holes: true,
  meldingen: true,
  hoogte: false,
  hoogtelijnen: 0,
  reliëf: 0,
  categorieen: { beregening: true, drainage: true, kabel: true, overig: true },
  status: 'alle',
}

const categorieNamen: Record<Categorie, string> = {
  beregening: 'Beregening',
  drainage: 'Drainage',
  kabel: 'Kabels',
  overig: 'Overig',
}

const statusNamen: Record<Statusfilter, string> = {
  alle: 'Alles',
  storing: 'Storing',
  onderhoud: 'In onderhoud / gepland',
  in_orde: 'In orde',
}

function Vink({ aan, kleur, onChange, children }: {
  aan: boolean; kleur?: string; onChange: (aan: boolean) => void; children: string
}) {
  return (
    <label className="vink">
      <input type="checkbox" checked={aan} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
      {kleur && <span className="stip" style={{ background: kleur }} />}
    </label>
  )
}

export type HoogteStatus = { status: 'uit' | 'laden' | 'klaar' | 'fout'; laag?: number; hoog?: number; op?: 'baan' | 'beeld' }

export default function Laagpaneel({ lagen, wijzig, sluit, hoogte, afstemmen }: {
  lagen: Laaginstellingen
  hoogte: HoogteStatus
  afstemmen: (op: 'baan' | 'beeld') => void
  wijzig: (l: Laaginstellingen) => void
  sluit: () => void
}) {
  const zet = (deel: Partial<Laaginstellingen>) => wijzig({ ...lagen, ...deel })

  return (
    <div className="paneel laagpaneel">
      <div className="paneel-kop">
        <strong>Lagen</strong>
        <button className="knop tweede klein" onClick={sluit}>Sluiten</button>
      </div>

      <fieldset>
        <legend>Achtergrond</legend>
        <div className="schakelaar">
          {(['luchtfoto', 'brt'] as const).map((a) => (
            <button key={a} className={`knop ${lagen.achtergrond === a ? '' : 'tweede'}`}
                    onClick={() => zet({ achtergrond: a })}>
              {a === 'luchtfoto' ? 'Luchtfoto' : 'Kaart'}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Baan</legend>
        <Vink aan={lagen.baanvlakken} kleur={kleuren.green} onChange={(v) => zet({ baanvlakken: v })}>Baanvlakken</Vink>
        <Vink aan={lagen.holes} kleur="var(--kleur-rand-sterk)" onChange={(v) => zet({ holes: v })}>Holes</Vink>
      </fieldset>

      <fieldset>
        <legend>Hoogte (AHN)</legend>
        <Vink aan={lagen.hoogte} kleur="var(--kleur-gepland)" onChange={(v) => zet({ hoogte: v })}>Hoogtekaart</Vink>
        <span className="veldlabel klein-tekst">3D-reliëf</span>
        <div className="schakelaar">
          {([[0, 'Plat'], [1, 'Echt'], [2, '2×'], [5, '5×']] as const).map(([r, n]) => (
            <button key={r} className={`knop ${lagen.reliëf === r ? '' : 'tweede'}`} onClick={() => zet({ reliëf: r })}>{n}</button>
          ))}
        </div>
        {lagen.reliëf > 0 && (
          <p className="zacht klein-tekst">
            Kantel de kaart om de hoogte te zien: twee vingers omhoog schuiven, of rechtermuisknop slepen.
            {lagen.reliëf > 1 && ' Hoogtes zijn overdreven, zodat kleine verschillen opvallen.'}
          </p>
        )}
        {(lagen.hoogte || lagen.reliëf > 0) && hoogte.status === 'laden' && <p className="zacht klein-tekst">Hoogtegegevens ophalen…</p>}
        {(lagen.hoogte || lagen.reliëf > 0) && hoogte.status === 'fout' && <p className="zacht klein-tekst">Hoogtekaart niet beschikbaar (PDOK).</p>}
        {lagen.hoogte && hoogte.status === 'klaar' && hoogte.laag != null && hoogte.hoog != null && (
          <div className="hoogte-legenda">
            <span className="hoogte-balk">
              <span style={{ background: kleurOnderCss }} title="lager" />
              <span style={{ background: kleurschaalCss }} />
              <span style={{ background: kleurBovenCss }} title="hoger" />
            </span>
            <span className="mono">{nap(hoogte.laag)}</span>
            <span className="mono">{nap(hoogte.hoog)}</span>
            <p className="zacht klein-tekst">
              {hoogte.op === 'beeld' ? 'Kleuren passen zich aan op wat in beeld is: zoom in voor meer detail.' : 'Kleuren vast op de hele baan.'}
              Grijs ligt lager dan de schaal, paars hoger. Beweeg of tik op de kaart voor de hoogte op die plek.
            </p>
            <div className="schakelaar">
              <button className={`knop ${hoogte.op === 'beeld' ? 'tweede' : ''}`} onClick={() => afstemmen('baan')}>Vast: hele baan</button>
              <button className={`knop ${hoogte.op === 'beeld' ? '' : 'tweede'}`} onClick={() => afstemmen('beeld')}>Volgt beeld</button>
            </div>
          </div>
        )}
        {lagen.hoogte && (
          <>
            <span className="veldlabel klein-tekst">Hoogtelijnen</span>
            <div className="schakelaar">
              {([[0, 'Uit'], [0.1, '10 cm'], [0.25, '25 cm'], [0.5, '50 cm']] as const).map(([i, n]) => (
                <button key={i} className={`knop ${lagen.hoogtelijnen === i ? '' : 'tweede'}`} onClick={() => zet({ hoogtelijnen: i })}>{n}</button>
              ))}
            </div>
          </>
        )}
      </fieldset>

      <fieldset>
        <legend>Objecten en leidingen</legend>
        {(Object.keys(categorieNamen) as Categorie[]).map((c) => (
          <Vink key={c} aan={lagen.categorieen[c]} kleur={kleuren[c]}
                onChange={(v) => zet({ categorieen: { ...lagen.categorieen, [c]: v } })}>
            {categorieNamen[c]}
          </Vink>
        ))}
        <Vink aan={lagen.meldingen} kleur={kleuren.storing} onChange={(v) => zet({ meldingen: v })}>
          Meldingen zonder object
        </Vink>
        <p className="zacht klein-tekst">Gestippelde leiding = overgetrokken van tekening, niet ingemeten.</p>
      </fieldset>

      <fieldset>
        <legend>Status</legend>
        {(Object.keys(statusNamen) as Statusfilter[]).map((s) => (
          <label key={s} className="vink">
            <input type="radio" name="status" checked={lagen.status === s} onChange={() => zet({ status: s })} />
            <span>{statusNamen[s]}</span>
            {s === 'storing' && <span className="stip" style={{ background: kleuren.storing }} />}
            {s === 'onderhoud' && <span className="stip" style={{ background: kleuren.gepland }} />}
          </label>
        ))}
      </fieldset>
    </div>
  )
}
