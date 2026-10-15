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

/** Solo en el laboratorio y con el Inspector de MCP. */
const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '[::1]'])

export interface Retorno {
  /** Host tal cual, o la URI entera si no se puede analizar. */
  host: string
  /** true solo si es un asistente conocido por HTTPS, o local. */
  conocido: boolean
}

export function evaluarRetorno(redirectUri: string): Retorno {
  let url: URL
  try {
    url = new URL(redirectUri)
  } catch {
    return { host: redirectUri, conocido: false }
  }
  const host = url.hostname.toLowerCase()
  if (HOSTS_LOCALES.has(host)) return { host: url.host, conocido: true }
  return { host: url.host, conocido: url.protocol === 'https:' && HOSTS_CONOCIDOS.has(host) }
}
