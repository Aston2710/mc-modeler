import type { Diagram, DiagramSort, DiagramSortKey, Project } from '@/domain/types'

// Dirección con la que arranca cada criterio al seleccionarlo:
// fechas → lo más reciente primero; nombre → A-Z; elementos → el más grande primero.
export const NATURAL_DIR: Record<DiagramSortKey, 'asc' | 'desc'> = {
  updated: 'desc',
  created: 'desc',
  name: 'asc',
  elements: 'desc',
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

export function compareDiagrams(sort: DiagramSort) {
  return (a: Diagram, b: Diagram): number => {
    let r: number
    switch (sort.key) {
      case 'name':
        r = collator.compare(a.name, b.name)
        break
      case 'created':
        r = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        break
      case 'elements':
        r = a.elementCount - b.elementCount
        break
      default:
        r = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
    }
    return sort.dir === 'asc' ? r : -r
  }
}

// Los proyectos obedecen el mismo criterio; 'elements' se traduce a nº de diagramas.
export function compareProjects(sort: DiagramSort, countOf: (projectId: string) => number) {
  return (a: Project, b: Project): number => {
    let r: number
    switch (sort.key) {
      case 'name':
        r = collator.compare(a.name, b.name)
        break
      case 'created':
        r = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        break
      case 'elements':
        r = countOf(a.id) - countOf(b.id)
        break
      default:
        r = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
    }
    return sort.dir === 'asc' ? r : -r
  }
}
