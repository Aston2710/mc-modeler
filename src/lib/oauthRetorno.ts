/**
 * ¿A dónde vuelve el código de autorización? (revisión del PR #1, R1)
 *
 * Con el registro dinámico de clientes activo, cualquiera puede dar de alta un
 * cliente OAuth llamado "Claude" con `redirect_uri` a un dominio suyo y mandar
 * el enlace a un usuario. El nombre lo elige quien registra el cliente; lo
 * único que no puede falsear es el host al que vuelve el código. Por eso la
 * pantalla de consentimiento lo enseña destacado y avisa en rojo cuando no es
 * uno de los asistentes conocidos.
 *
 * La lista es deliberadamente corta y exacta (sin subdominios): un host nuevo
 * se añade aquí a mano, con su motivo.
 */

const HOSTS_CONOCIDOS = new Set([
  'claude.ai', // callback de los conectores de Claude: https://claude.ai/api/mcp/auth_callback
  'claude.com',
])

/**
 * Solo en el laboratorio y con el Inspector de MCP. En producción un retorno a
 * localhost no es un asistente de confianza: el código lo recibiría un proceso
 * de la máquina de quien aprueba (revisión del PR #1, punto 3).
 */
const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '[::1]'])

/** `npm run lab` (MODE 'lab') o `npm run dev`; Vite lo sustituye por una constante al compilar. */
const LOCAL_PERMITIDO = import.meta.env.MODE === 'lab' || import.meta.env.DEV

export interface Retorno {
  /** Host tal cual, o la URI entera si no se puede analizar. */
  host: string
  /** true solo si es un asistente conocido por HTTPS, o local en laboratorio o desarrollo. */
  conocido: boolean
}

export function evaluarRetorno(redirectUri: string, permitirLocal: boolean = LOCAL_PERMITIDO): Retorno {
  let url: URL
  try {
    url = new URL(redirectUri)
  } catch {
    return { host: redirectUri, conocido: false }
  }
  const host = url.hostname.toLowerCase()
  if (permitirLocal && HOSTS_LOCALES.has(host)) return { host: url.host, conocido: true }
  return { host: url.host, conocido: url.protocol === 'https:' && HOSTS_CONOCIDOS.has(host) }
}
