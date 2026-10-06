import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'HGM Golf Onderhoud',
        short_name: 'HGM Onderhoud',
        lang: 'nl',
        display: 'standalone',
        start_url: '/',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      // Altijd online (zie plan): alleen de app-schil cachen, geen data.
      workbox: { navigateFallbackDenylist: [/^\/auth/] },
    }),
  ],
})
