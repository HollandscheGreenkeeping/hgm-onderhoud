import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router'
import { useSessie } from './lib/sessie'
import LocatieLayout from './lib/locatie'
import HoofdLayout from './components/HoofdLayout'
import Inloggen from './pages/Inloggen'
import Tweestaps from './pages/Tweestaps'
import LocatieKiezen from './pages/LocatieKiezen'
import NieuweBaan from './pages/NieuweBaan'
import Overzicht from './pages/Overzicht'
import Voorstellen, { VoorstelDetail } from './pages/Voorstellen'
import Storingen from './pages/Storingen'
import StoringDetail from './pages/StoringDetail'
import Taken, { TaakDetail, TaakNieuw } from './pages/Taken'
import Werk, { WerkDetail, WerkNieuw } from './pages/Werk'
import Onderhoud, { SchemaPagina } from './pages/Onderhoud'
import Materieel, { MachineNieuw } from './pages/Materieel'
import MachineDetail from './pages/MachineDetail'
import Rapportage from './pages/Rapportage'
import Wachtwoord from './pages/Wachtwoord'
import Meer from './pages/Meer'
import HoofdOverzicht from './pages/HoofdOverzicht'
import Beheer, { AlleenBeheer } from './pages/Beheer'
import BeheerGebruikers, { GebruikerDetail, GebruikerNieuw } from './pages/BeheerGebruikers'
import BeheerBanen from './pages/BeheerBanen'
import BaanInstellingen from './pages/BaanInstellingen'
import Keuzelijsten from './pages/Keuzelijsten'
import Werkplaats, { AlleenGlobaal } from './pages/Werkplaats'
import Werkorders, { WerkorderNieuw } from './pages/Werkorders'
import WerkorderDetail from './pages/WerkorderDetail'
import WerkplaatsPlanning from './pages/WerkplaatsPlanning'
import Keuringen from './pages/Keuringen'
import MachineKosten from './pages/MachineKosten'
import Inkoop from './pages/Inkoop'
import Bestellingen, { BestellingNieuw } from './pages/Bestellingen'
import BestellingDetail from './pages/BestellingDetail'
import Voorraad from './pages/Voorraad'
import Producten from './pages/Producten'
import Leveranciers from './pages/Leveranciers'
import Budget from './pages/Budget'

// De kaartbibliotheek is groot; pas laden als de kaart echt nodig is (sneller inlogscherm).
const Kaart = lazy(() => import('./pages/Kaart'))

function Beveiligd({ children }: { children: ReactNode }) {
  const { laden, sessie, tweestapsNodig } = useSessie()
  if (laden) return <main className="zacht">Laden…</main>
  if (!sessie) return <Navigate to="/inloggen" replace />
  if (tweestapsNodig) return <Navigate to="/tweestaps" replace />
  // Ingelogd met een tijdelijk wachtwoord van beheer: eerst een eigen wachtwoord kiezen.
  if (sessie.user.user_metadata?.wachtwoord_wijzigen) return <Navigate to="/wachtwoord" replace />
  return children
}

// Oude adressen (gebruikers en instellingen stonden vroeger per baan) naar Beheer.
function NaarBaanInstellingen() {
  const { locatieId } = useParams()
  return <Navigate to={`/beheer/banen/${locatieId}`} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/inloggen" element={<Inloggen />} />
      <Route path="/tweestaps" element={<Tweestaps />} />
      <Route path="/wachtwoord" element={<Wachtwoord />} />
      <Route path="/" element={<Beveiligd><HoofdLayout /></Beveiligd>}>
        <Route index element={<HoofdOverzicht />} />
        <Route path="banen" element={<LocatieKiezen />} />
        <Route path="werkplaats" element={<Werkplaats />}>
          <Route index element={<Navigate to="werkorders" replace />} />
          <Route path="werkorders" element={<Werkorders />} />
          <Route path="werkorders/nieuw" element={<WerkorderNieuw />} />
          <Route path="werkorders/:werkorderId" element={<WerkorderDetail />} />
          <Route path="planning" element={<WerkplaatsPlanning />} />
          <Route path="keuringen" element={<Keuringen />} />
          <Route path="kosten" element={<AlleenGlobaal><MachineKosten /></AlleenGlobaal>} />
        </Route>
        <Route path="inkoop" element={<Inkoop />}>
          <Route index element={<Navigate to="bestellingen" replace />} />
          <Route path="bestellingen" element={<Bestellingen />} />
          <Route path="bestellingen/nieuw" element={<BestellingNieuw />} />
          <Route path="bestellingen/:bestellingId" element={<BestellingDetail />} />
          <Route path="voorraad" element={<Voorraad />} />
          <Route path="producten" element={<Producten />} />
          <Route path="leveranciers" element={<Leveranciers />} />
          <Route path="budget" element={<Budget />} />
        </Route>
        <Route path="beheer" element={<Beheer />}>
          <Route index element={<Navigate to="gebruikers" replace />} />
          <Route path="gebruikers" element={<BeheerGebruikers />} />
          <Route path="gebruikers/nieuw" element={<GebruikerNieuw />} />
          <Route path="gebruikers/:profielId" element={<GebruikerDetail />} />
          <Route path="banen" element={<AlleenBeheer><BeheerBanen /></AlleenBeheer>} />
          <Route path="banen/nieuw" element={<AlleenBeheer><NieuweBaan /></AlleenBeheer>} />
          <Route path="banen/:locatieId" element={<AlleenBeheer><BaanInstellingen /></AlleenBeheer>} />
          <Route path="keuzelijsten" element={<AlleenBeheer><Keuzelijsten /></AlleenBeheer>} />
        </Route>
      </Route>
      <Route path="/nieuwe-baan" element={<Navigate to="/beheer/banen/nieuw" replace />} />
      <Route path="/locatie/:locatieId" element={<Beveiligd><LocatieLayout /></Beveiligd>}>
        <Route index element={<Suspense fallback={<main className="zacht">Kaart laden…</main>}><Kaart /></Suspense>} />
        <Route path="overzicht" element={<Overzicht />} />
        <Route path="voorstellen" element={<Voorstellen />} />
        <Route path="voorstellen/:voorstelId" element={<VoorstelDetail />} />
        <Route path="storingen" element={<Storingen />} />
        <Route path="storingen/:storingId" element={<StoringDetail />} />
        <Route path="taken" element={<Taken />} />
        <Route path="taken/nieuw" element={<TaakNieuw />} />
        <Route path="taken/:taakId" element={<TaakDetail />} />
        <Route path="werk" element={<Werk />} />
        <Route path="werk/nieuw" element={<WerkNieuw />} />
        <Route path="werk/:werkId" element={<WerkDetail />} />
        <Route path="onderhoud" element={<Onderhoud />} />
        <Route path="onderhoud/schemas/:schemaId" element={<SchemaPagina />} />
        <Route path="materieel" element={<Materieel />} />
        <Route path="materieel/nieuw" element={<MachineNieuw />} />
        <Route path="materieel/:machineId" element={<MachineDetail />} />
        <Route path="rapportage" element={<Rapportage />} />
        <Route path="gebruikers" element={<Navigate to="/beheer/gebruikers" replace />} />
        <Route path="instellingen" element={<NaarBaanInstellingen />} />
        <Route path="meer" element={<Meer />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
