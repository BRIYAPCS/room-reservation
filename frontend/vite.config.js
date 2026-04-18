import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // In production (GitHub Pages) use the subpath from env.
  // In dev use '/' so the Vite proxy works normally.
  const base = mode === 'production' ? (env.VITE_BASE_PATH || '/') : '/'

  return {
    base,
    plugins: [react()],

    server: {
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://localhost:4000',
          changeOrigin: true,
        },
        '/images': {
          target: 'http://localhost:4000',
          changeOrigin: true,
        },
      },
    },

    build: {
      minify: 'esbuild',
      sourcemap: false,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-fullcalendar': [
              '@fullcalendar/core',
              '@fullcalendar/react',
              '@fullcalendar/daygrid',
              '@fullcalendar/timegrid',
              '@fullcalendar/list',
              '@fullcalendar/interaction',
            ],
          },
        },
      },
    },
  }
})
