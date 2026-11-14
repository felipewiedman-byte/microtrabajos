import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
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
