import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
import { createRequire } from 'module'
const compat = createRequire(import.meta.url)('./postcss-compat.cjs')

export default defineConfig({
  base: '/',
  css: { postcss: { plugins: process.env.NO_COMPAT ? [] : [compat()] } },
  plugins: [react()],
  build: {
    rollupOptions: {
      // segunda entrada: el pequeño script de las páginas de resultados (/partidos): búsqueda, tema y compartir tarjeta (mismo dibujo que el mapa)
      input: { main: 'index.html', portal: 'src/portal.js' },
      output: {
        entryFileNames: chunk => chunk.name === 'portal' ? 'portal.js' : 'assets/[name]-[hash].js',
        // librerías en archivos aparte: el celular las guarda en caché y no las vuelve a bajar cuando cambia solo el código de la app
        manualChunks: id => {
          if (!id.includes('node_modules')) return
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react'
          if (/node_modules\/leaflet\//.test(id)) return 'vendor-leaflet'
          if (/node_modules\/(d3-[^/]+|topojson-client|world-atlas|internmap)\//.test(id)) return 'vendor-geo'
        },
      },
    },
  },
})
