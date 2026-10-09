import {
  createMcpHandler,
  getPublicOrigin,
  metadataCorsOptionsRequestHandler,
  protectedResourceHandler,
  withMcpAuth,
} from 'mcp-handler'
import { leerConfig, type Config } from './config'
import { registrarHerramientas } from './herramientas'
import { verificarToken } from './supabase'

/**
 * Manejador Web de todo el servidor. Rutas:
 *
 *   /mcp                                         el endpoint MCP (con OAuth)
 *   /.well-known/oauth-protected-resource[/mcp]  metadatos RFC 9728
 *   /                                            una línea de texto, sin datos
 *
 * El servidor de autorización es Supabase Auth (`<SUPABASE_URL>/auth/v1`); este
 * servidor solo es el "resource server": no emite tokens, los verifica.
 */
export function crearApp(config: Config = leerConfig()) {
  const issuer = `${config.supabaseUrl}/auth/v1`
  const recurso = (req: Request) => `${config.publicUrl ?? getPublicOrigin(req)}/mcp`

  const mcp = createMcpHandler(
    (server) => registrarHerramientas(server, config),
    {
      serverInfo: { name: 'flujo', version: '0.1.0' },
      instructions:
        'Conector de Flujo (modelador BPMN). Crea y modifica diagramas en el espacio de trabajo del usuario: ' +
        'listar_proyectos → crear_diagrama con un modelo sin coordenadas; obtener_diagrama → modificar_diagrama con la versión. ' +
        'Nunca borra ni mueve diagramas o proyectos. La validación solo avisa.',
      verboseLogs: false,
    }
  )

  const protegido = withMcpAuth(mcp, (_req, token) => verificarToken(config, token), {
    required: true,
    resourceUrl: config.publicUrl,
  })

  return async function manejar(req: Request): Promise<Response> {
    const { pathname, searchParams } = new URL(req.url)
    // `_r` lo pone el enrutado de Vercel (scripts/build.mjs); en local manda la ruta.
    const r = searchParams.get('_r')
    if (r === 'prm' || pathname.startsWith('/.well-known/oauth-protected-resource')) {
      if (req.method === 'OPTIONS') return metadataCorsOptionsRequestHandler()()
      return protectedResourceHandler({ authServerUrls: [issuer], resourceUrl: recurso(req) })(req)
    }
    if (!r && (pathname === '/mcp' || pathname === '/mcp/')) return protegido(req)
    if (r === 'raiz' || pathname === '/') {
      return new Response('Servidor MCP de Flujo. Endpoint: /mcp\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } })
    }
    return new Response('no encontrado\n', { status: 404 })
  }
}
