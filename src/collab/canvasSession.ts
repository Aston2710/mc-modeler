/**
 * Fencing token para el ciclo de vida del canvas bpmn-js compartido.
 *
 * El canvas es único para todas las pestañas (ver App.tsx) y se reimporta en
 * cada cambio de diagrama. Sistemas async independientes (colaboración Yjs,
 * autosave, guardado manual) necesitan saber con certeza "¿el canvas ya
 * muestra el diagrama X, confirmado?" — nunca inferirlo de heurísticas como
 * "¿tiene elementos?", porque durante un cambio de diagrama el canvas
 * transitoriamente sigue mostrando el diagrama ANTERIOR mientras el nuevo
 * aún está importando.
 *
 * Patrón (igual al de fencing tokens en locks distribuidos: Chubby/etcd):
 * cada importXml() reclama una nueva generación. Solo la importación cuyo
 * token coincide con la generación vigente al completarse puede marcar el
 * diagrama como "listo". Cualquier import que resuelva tarde — porque ya se
 * inició otro después — queda invalidado y se descarta en silencio, en vez
 * de contaminar el estado de un diagrama distinto.
 */

let generation = 0
let readyDiagramId: string | null = null
let readyGeneration = -1

/** Llamar al INICIAR una importación. El token devuelto identifica esta importación. */
export function beginImport(): number {
  generation += 1
  readyDiagramId = null
  return generation
}

/** Llamar cuando la importación con `token` terminó de renderizarse en el canvas. */
export function completeImport(token: number, diagramId: string): void {
  if (token !== generation) return // import obsoleto: se inició otro después, este resultado ya no aplica
  readyDiagramId = diagramId
  readyGeneration = token
}

/** ¿El canvas confirma, en este instante, que muestra `diagramId` completo? */
export function isCanvasReadyFor(diagramId: string): boolean {
  return readyDiagramId === diagramId && readyGeneration === generation
}

export function getReadyDiagramId(): string | null {
  return readyDiagramId
}
