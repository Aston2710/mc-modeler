import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// ── Modo laboratorio ────────────────────────────────────────────────────────
// `npm run lab` levanta el stack de Supabase en Docker y sirve la app en
// http://localhost:7654 apuntando a esa base local, NUNCA a produccion.
//
// Las credenciales de abajo son las de demostracion del CLI de Supabase:
// identicas en toda instalacion local del mundo y sin valor fuera de tu
// maquina. No son secretos, por eso pueden vivir en un archivo versionado —
// asi el laboratorio funciona recien clonado el repo, sin configurar nada.
//
// Se inyectan por `define` en vez de por un archivo .env a proposito: .env*
// esta en .gitignore, y no queremos que un archivo de entorno versionado se
// convierta con el tiempo en el sitio donde alguien deja un secreto de verdad.
const LAB_PORT = 7654
const LAB_SUPABASE_URL = 'http://127.0.0.1:54321'
const LAB_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

export default defineConfig(({ mode }) => {
  const isLab = mode === 'lab'

  return {
  plugins: [
    react(),
    tailwindcss(),
  ],
  define: isLab
    ? {
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(LAB_SUPABASE_URL),
        'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(LAB_SUPABASE_ANON_KEY),
        'import.meta.env.VITE_LAB': JSON.stringify(true),
      }
    : {},
  server: {
    port: isLab ? LAB_PORT : 5175,
    strictPort: true,
    open: isLab,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['bpmn-js'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'bpmn-js': ['bpmn-js'],
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
  },
  }
})
