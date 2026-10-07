import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { useSessie } from './lib/sessie'
import LocatieLayout from './lib/locatie'
import Inloggen from './pages/Inloggen'
import Tweestaps from './pages/Tweestaps'
import LocatieKiezen from './pages/LocatieKiezen'
import NieuweBaan from './pages/NieuweBaan'
import Overzicht from './pages/Overzicht'
import Voorstellen from './pages/Voorstellen'
import Instellingen from './pages/Instellingen'
import Storingen from './pages/Storingen'
import StoringDetail from './pages/StoringDetail'
import Taken from './pages/Taken'
import Werk from './pages/Werk'
import Onderhoud from './pages/Onderhoud'
import Materieel from './pages/Materieel'
import MachineDetail from './pages/MachineDetail'
import Rapportage from './pages/Rapportage'
import Gebruikers from './pages/Gebruikers'
import Wachtwoord from './pages/Wachtwoord'
import Meer from './pages/Meer'

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

export default function App() {
  return (
    <Routes>
      <Route path="/inloggen" element={<Inloggen />} />
      <Route path="/tweestaps" element={<Tweestaps />} />
      <Route path="/wachtwoord" element={<Wachtwoord />} />
      <Route path="/" element={<Beveiligd><LocatieKiezen /></Beveiligd>} />
      <Route path="/nieuwe-baan" element={<Beveiligd><NieuweBaan /></Beveiligd>} />
      <Route path="/locatie/:locatieId" element={<Beveiligd><LocatieLayout /></Beveiligd>}>
        <Route index element={<Suspense fallback={<main className="zacht">Kaart laden…</main>}><Kaart /></Suspense>} />
        <Route path="overzicht" element={<Overzicht />} />
        <Route path="voorstellen" element={<Voorstellen />} />
        <Route path="storingen" element={<Storingen />} />
        <Route path="storingen/:storingId" element={<StoringDetail />} />
        <Route path="taken" element={<Taken />} />
        <Route path="werk" element={<Werk />} />
        <Route path="onderhoud" element={<Onderhoud />} />
        <Route path="materieel" element={<Materieel />} />
        <Route path="materieel/:machineId" element={<MachineDetail />} />
        <Route path="rapportage" element={<Rapportage />} />
        <Route path="gebruikers" element={<Gebruikers />} />
        <Route path="instellingen" element={<Instellingen />} />
        <Route path="meer" element={<Meer />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
