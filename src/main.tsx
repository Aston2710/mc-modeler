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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {LabBar && (
      <Suspense fallback={null}>
        <LabBar />
      </Suspense>
    )}
  </StrictMode>
)
