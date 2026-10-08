import type { IncomingMessage, ServerResponse } from 'node:http'
import { LIMITES_HTTP } from './config'

/**
 * Adaptador Node ⇄ Web. `mcp-handler` produce un manejador
 * `(Request) => Response`; el lanzador Node de Vercel y el servidor local
 * hablan `(req, res)`. El mismo adaptador sirve a los dos, así lo que se prueba
 * en local es lo que corre desplegado.
 *
 * Rechaza cuerpos grandes ANTES de leerlos enteros (413), para que un payload
 * gigante no llegue a parsearse.
 */
export function aManejadorNode(manejar: (req: Request) => Promise<Response>) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0] ?? 'http'
      const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? 'localhost'
      const url = new URL(req.url ?? '/', `${proto}://${host}`)

      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) {
        if (Array.isArray(v)) v.forEach((x) => headers.append(k, x))
        else if (v !== undefined) headers.set(k, v)
      }

      let body: Uint8Array | undefined
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const declarado = Number(req.headers['content-length'] ?? 0)
        if (declarado > LIMITES_HTTP.MAX_BYTES_PETICION) return responder413(res)
        const trozos: Buffer[] = []
        let total = 0
        for await (const trozo of req) {
          total += (trozo as Buffer).length
          if (total > LIMITES_HTTP.MAX_BYTES_PETICION) return responder413(res)
          trozos.push(trozo as Buffer)
        }
        body = new Uint8Array(Buffer.concat(trozos))
      }

      const respuesta = await manejar(new Request(url, { method: req.method, headers, body }))
      res.statusCode = respuesta.status
      respuesta.headers.forEach((v, k) => res.setHeader(k, v))
      if (respuesta.body) {
        const reader = respuesta.body.getReader()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(value)
        }
      }
      res.end()
    } catch {
      // Sin detalles: un error interno no debe filtrar nada de la petición.
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('content-type', 'application/json')
      }
      res.end(JSON.stringify({ error: 'error interno' }))
    }
  }
}

function responder413(res: ServerResponse) {
  res.statusCode = 413
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ error: `la petición supera ${LIMITES_HTTP.MAX_BYTES_PETICION} bytes` }))
}
