import { StrictMode } from 'react'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
