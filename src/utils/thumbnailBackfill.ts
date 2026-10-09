/**
 * Miniaturas que faltan, generadas en segundo plano desde la portada.
 *
 * POR QUÉ. La miniatura se hace al guardar desde el editor (`buildThumbnail`).
 * Un diagrama escrito por fuera de la app —el conector MCP (MASTER-PLAN-038),
 * que corre en un servidor sin DOM y no puede renderizar— llega sin ella, y la
 * portada le ponía el icono genérico hasta que alguien lo abriera y guardara.
 * Visto en la copia de pruebas el 2026-10-09: todos los diagramas creados por
 * Claude salían sin vista previa.
 *
 * CÓMO. Cuando la portada sabe qué diagramas no tienen miniatura, los encola
 * aquí. Se procesan de uno en uno, con una pausa entre cada uno para no
 * acaparar el hilo, y con el Modeler oculto de `bpmn/headlessModeler.ts`, que
 * se descarga en un chunk aparte solo si hay algo que generar. Cada diagrama
 * se intenta UNA vez por sesión: si falla (p. ej. un lector sin permiso de
 * escritura), no se reintenta en bucle.
 *
 * COSTE ACEPTADO. La primera miniatura de un diagrama escribe `thumbnail_path`
 * en su fila y el trigger mueve `updated_at`: el diagrama sube una vez en
 * "Última modificación" y su versión CAS cambia. Es exactamente lo que ya
 * pasa al guardarlo por primera vez desde el editor. Por eso se saltan los
 * diagramas abiertos en una pestaña: ahí la miniatura la hará el autosave.
 */

const MAX_POR_SESION = 20
const ESPERA_INICIAL_MS = 1500
const PAUSA_ENTRE_DIAGRAMAS_MS = 300

export interface DependenciasBackfill {
  /** XML completo del diagrama (la lista solo trae metadatos). */
  obtenerXml(id: string): Promise<string>
  /** Sube la miniatura y la pone en la tarjeta. */
  guardar(id: string, dataUrl: string): Promise<void>
  /** Si está abierto en una pestaña, se salta: lo cubrirá el autosave. */
  estaAbierto(id: string): boolean
  /** Inyectable en pruebas; por defecto, el Modeler oculto. */
  renderizar?(xml: string): Promise<string>
}

const intentados = new Set<string>()
const cola: string[] = []
let corriendo = false

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function programarMiniaturasFaltantes(ids: string[], deps: DependenciasBackfill): void {
  for (const id of ids) if (!intentados.has(id) && !cola.includes(id)) cola.push(id)
  if (corriendo || cola.length === 0 || intentados.size >= MAX_POR_SESION) return
  corriendo = true
  void esperar(ESPERA_INICIAL_MS).then(() => procesar(deps))
}

async function procesar(deps: DependenciasBackfill): Promise<void> {
  let liberar: (() => void) | undefined
  try {
    let renderizar = deps.renderizar
    if (!renderizar) {
      const m = await import('@/bpmn/headlessModeler')
      renderizar = m.renderizarMiniatura
      liberar = m.liberarModelerOculto
    }
    while (cola.length > 0 && intentados.size < MAX_POR_SESION) {
      const id = cola.shift()!
      if (intentados.has(id) || deps.estaAbierto(id)) continue
      intentados.add(id)
      try {
        const xml = await deps.obtenerXml(id)
        if (xml) await deps.guardar(id, await renderizar(xml))
      } catch (err) {
        console.warn('[Flujo] miniatura en segundo plano no generada (no crítico):', id, err)
      }
      await esperar(PAUSA_ENTRE_DIAGRAMAS_MS)
    }
  } catch (err) {
    console.warn('[Flujo] generador de miniaturas no disponible:', err)
  } finally {
    // Sin trabajo pendiente, el Modeler oculto solo ocupa memoria.
    liberar?.()
    corriendo = false
  }
}

/** Solo para pruebas: vuelve al estado de una sesión nueva. */
export function reiniciarBackfillParaPruebas(): void {
  intentados.clear()
  cola.length = 0
  corriendo = false
}
