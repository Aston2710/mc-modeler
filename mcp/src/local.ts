import { createServer } from 'node:http'
import { crearApp } from './app'
import { aManejadorNode } from './nodeAWeb'

/**
 * Servidor local para el laboratorio y el Inspector de MCP. Mismo manejador
 * que la función desplegada. Variables (ver config.ts), por ejemplo contra el
 * laboratorio:
 *
 *   SUPABASE_URL=http://127.0.0.1:54321
 *   SUPABASE_ANON_KEY=<la clave anónima del laboratorio>
 *   APP_URL=http://localhost:5175
 *   MCP_PUBLIC_URL=http://localhost:7655
 *   MCP_HABILITAR_MODIFICAR=1
 */
const puerto = Number(process.env.PORT ?? 7655)
createServer(aManejadorNode(crearApp())).listen(puerto, () => {
  console.log(`MCP de Flujo en http://localhost:${puerto}/mcp`)
})
