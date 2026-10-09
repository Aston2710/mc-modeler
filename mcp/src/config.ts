/**
 * Configuración del servidor MCP. Todo por variables de entorno del proyecto
 * de Vercel (o de la shell en local). NINGUNA es un secreto:
 *
 *   SUPABASE_URL            https://<ref>.supabase.co — pública, va en el bundle de la SPA
 *   SUPABASE_ANON_KEY       la clave anónima — pública por diseño
 *   APP_URL                 https://mc-modeler.vercel.app — para enlazar al diagrama
 *   MCP_PUBLIC_URL          URL pública de este servidor, sin barra final (opcional:
 *                           si falta se deduce de las cabeceras de la petición)
 *   MCP_HABILITAR_MODIFICAR '1' habilita modificar_diagrama (etapa 2, PLAN-042).
 *                           Apagada por defecto: no se enciende en producción hasta
 *                           que el cliente con la opción C esté desplegado.
 *
 * Deliberadamente NO hay `SUPABASE_SERVICE_ROLE_KEY`: el servidor actúa
 * siempre con el JWT del usuario (DEC-013). Si alguien la añade, el código no
 * la lee.
 */

export interface Config {
  supabaseUrl: string
  supabaseAnonKey: string
  appUrl: string
  publicUrl?: string
  habilitarModificar: boolean
}

export function leerConfig(env: Record<string, string | undefined> = process.env): Config {
  const faltan = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'].filter((k) => !env[k])
  if (faltan.length) throw new Error(`faltan variables de entorno: ${faltan.join(', ')}`)
  return {
    supabaseUrl: env.SUPABASE_URL!.replace(/\/+$/, ''),
    supabaseAnonKey: env.SUPABASE_ANON_KEY!,
    appUrl: (env.APP_URL ?? 'https://mc-modeler.vercel.app').replace(/\/+$/, ''),
    publicUrl: env.MCP_PUBLIC_URL?.replace(/\/+$/, ''),
    habilitarModificar: env.MCP_HABILITAR_MODIFICAR === '1',
  }
}

/** Límites del transporte. El modelo y el XML tienen los suyos en domain/bpmn-model. */
export const LIMITES_HTTP = {
  /** Cuerpo de una petición MCP. Un modelo de 500 nodos cabe de sobra. */
  MAX_BYTES_PETICION: 512 * 1024,
  /** Tiempo máximo de una tool antes de abandonar. */
  TIMEOUT_TOOL_MS: 25_000,
  /** Espera máxima para saber quién está en el canal de un diagrama. */
  TIMEOUT_PRESENCIA_MS: 4_000,
  /** Llamadas a tools por usuario y minuto (las escrituras: 20, en la base). */
  LLAMADAS_POR_MINUTO: 60,
} as const
