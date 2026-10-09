import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import '@/i18n'
// bpmn-js CSS before index.css — our overrides load last and win !important battles
// @ts-ignore
import 'bpmn-js/dist/assets/bpmn-js.css'
// @ts-ignore
import 'bpmn-js/dist/assets/diagram-js.css'
// @ts-ignore
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css'
import './index.css'
import App from './App'

// Modo laboratorio (`npm run lab`): sesion automatica y cambio de usuario.
// Vite sustituye import.meta.env.MODE por una constante al compilar, asi que
// en el build de produccion esta rama es inalcanzable y rollup descarta el
// modulo entero — no llega ni una linea al bundle real.
const LabBar = import.meta.env.MODE === 'lab' ? lazy(() => import('./lab/LabBar')) : null

// Banco de pruebas de thumbnails: compara ajustes de definicion a ojo, a tamaño
// de tarjeta. Misma puerta de MODE, asi que tampoco entra en produccion.
const ThumbLab = import.meta.env.MODE === 'lab' ? lazy(() => import('./lab/ThumbLab')) : null

// Forja de thumbnails para el backfill de PLAN-012: expone window.__thumbForge
// para que `scripts/backfill-thumbs.mjs` pueda renderizar con el motor real de
// la app. La usa tambien ThumbLab.
if (import.meta.env.MODE === 'lab') {
  void import('./lab/thumbForge').then((m) => m.installThumbForge())
}

// Pantalla de consentimiento del conector MCP (MASTER-PLAN-038): Supabase Auth
// redirige aquí cuando un asistente pide acceso. Es una página aparte —no
// monta el editor— y se carga bajo demanda: no pesa en el arranque normal.
const OAuthConsent = window.location.pathname === '/oauth/consent'
  ? lazy(() => import('./components/auth/OAuthConsent'))
  : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {OAuthConsent ? (
      <Suspense fallback={null}>
        <OAuthConsent />
      </Suspense>
    ) : (
      <App />
    )}
    {LabBar && (
      <Suspense fallback={null}>
        <LabBar />
      </Suspense>
    )}
    {ThumbLab && (
      <Suspense fallback={null}>
        <ThumbLab />
      </Suspense>
    )}
  </StrictMode>
)
