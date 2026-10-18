import type { CapacitorConfig } from '@capacitor/cli'

// iOS-app (TestFlight) rond dezelfde web-app. Bouwen: npm run ios (build + sync + Xcode openen).
const config: CapacitorConfig = {
  appId: 'nl.hgmgolf.onderhoud',
  appName: 'HGM Onderhoud',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#ffffff',
  },
}

export default config
