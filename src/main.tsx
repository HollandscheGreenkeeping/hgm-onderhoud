import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { SessieProvider } from './lib/sessie'
import App from './App'
import './styles/app.css'

// In ontwikkeling: een serviceworker van een eerdere testbuild (npm run preview) kan oude code
// blijven serveren op dezelfde poort. Opruimen en eenmalig herladen.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(async (lijst) => {
    if (!lijst.length) return
    await Promise.all(lijst.map((r) => r.unregister()))
    for (const naam of await caches.keys()) await caches.delete(naam)
    location.reload()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessieProvider>
        <App />
      </SessieProvider>
    </BrowserRouter>
  </StrictMode>,
)
