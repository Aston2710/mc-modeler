import type { Diagram } from '@/domain/types'

/** La pestaña activa, reducida a lo que decide el alcance. */
export interface ActiveScope {
  id: string
  projectId: string | null
}

/**
 * Qué diagramas ve el navegador del editor (`ProjectView`, el botón de carpeta
 * de la barra de pestañas). Ver PLAN-037.
 *
 * El modal se llama "diagramas del proyecto" y antes mostraba la cuenta entera:
 * con 104 diagramas eso es una cuadrícula ilegible de cosas que no vienen al
 * caso. El alcance es el del diagrama abierto:
 *
 * - **Con proyecto** → los diagramas de ese proyecto. Los subdiagramas de
 *   drill-down entran solos, porque `createSubDiagram` hereda el `projectId`.
 * - **Suelto** (`projectId === null`) → su familia: la raíz de su árbol y todos
 *   los descendientes. Se sube *y* se baja a propósito: estando en un subproceso,
 *   el padre tiene que seguir estando a la vista.
 *
 * El orden no se decide aquí — lo pone quien la llama (por `updatedAt`).
 */
export function scopeForProjectView(diagrams: Diagram[], active: ActiveScope | null): Diagram[] {
  if (!active) return []
  if (active.projectId !== null) {
    const proyecto = active.projectId
    return diagrams.filter((d) => d.projectId === proyecto)
  }

  const porId = new Map(diagrams.map((d) => [d.id, d]))
  let raiz = porId.get(active.id)
  if (!raiz) return []

  // Subir hasta la raíz. El `vistos` no es paranoia gratuita: un
  // `parentDiagramId` en ciclo (dato corrupto) colgaría el modal entero.
  const subida = new Set<string>([raiz.id])
  while (raiz.parentDiagramId) {
    const padre = porId.get(raiz.parentDiagramId)
    if (!padre || padre.projectId !== null || subida.has(padre.id)) break
    subida.add(padre.id)
    raiz = padre
  }

  const hijosDe = new Map<string, Diagram[]>()
  for (const d of diagrams) {
    if (!d.parentDiagramId) continue
    const hermanos = hijosDe.get(d.parentDiagramId)
    if (hermanos) hermanos.push(d)
    else hijosDe.set(d.parentDiagramId, [d])
  }

  const familia: Diagram[] = []
  const vistos = new Set<string>()
  const pendientes: Diagram[] = [raiz]
  while (pendientes.length) {
    const d = pendientes.pop() as Diagram
    if (vistos.has(d.id) || d.projectId !== null) continue
    vistos.add(d.id)
    familia.push(d)
    const hijos = hijosDe.get(d.id)
    if (hijos) pendientes.push(...hijos)
  }
  return familia
}
