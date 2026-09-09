import { describe, it, expect } from 'vitest'
import { scopeForProjectView } from './projectScope'
import type { Diagram } from '@/domain/types'

/** Un diagrama con lo justo para el alcance; el resto no lo mira nadie aquí. */
function d(
  id: string,
  projectId: string | null = null,
  parentDiagramId: string | null = null
): Diagram {
  return {
    id, name: id, xml: '', thumbnail: null,
    folderId: null, projectId, elementCount: 0, schemaVersion: 1,
    createdAt: '2026-09-09T00:00:00.000Z', updatedAt: '2026-09-09T00:00:00.000Z',
    parentDiagramId, subProcessElementId: parentDiagramId ? 'Activity_1' : null,
  }
}

const ids = (ds: Diagram[]) => ds.map((x) => x.id).sort()

describe('scopeForProjectView', () => {
  it('con proyecto devuelve los de ese proyecto y nada más', () => {
    const todos = [d('a', 'P'), d('b', 'P'), d('c', 'Q'), d('suelto')]
    expect(ids(scopeForProjectView(todos, { id: 'a', projectId: 'P' }))).toEqual(['a', 'b'])
  })

  it('con proyecto incluye los subdiagramas, que heredan el projectId', () => {
    const todos = [d('a', 'P'), d('a-sub', 'P', 'a'), d('c', 'Q')]
    expect(ids(scopeForProjectView(todos, { id: 'a', projectId: 'P' }))).toEqual(['a', 'a-sub'])
  })

  it('diagrama suelto sin hijos: solo él', () => {
    const todos = [d('libre'), d('otro'), d('x', 'P')]
    expect(ids(scopeForProjectView(todos, { id: 'libre', projectId: null }))).toEqual(['libre'])
  })

  it('diagrama suelto con hijos: su familia, no los otros sueltos', () => {
    const todos = [d('libre'), d('sub1', null, 'libre'), d('sub2', null, 'libre'), d('ajeno')]
    expect(ids(scopeForProjectView(todos, { id: 'libre', projectId: null })))
      .toEqual(['libre', 'sub1', 'sub2'])
  })

  /**
   * El caso que decidió el diseño: estando dentro de un subproceso hay que
   * **subir** a la raíz, no solo bajar. Si no, el padre desaparece del modal
   * justo cuando se está navegando entre padre e hijos.
   */
  it('activo un subproceso suelto: sube a la raíz y trae a los hermanos y nietos', () => {
    const todos = [
      d('raiz'), d('sub1', null, 'raiz'), d('sub2', null, 'raiz'),
      d('nieto', null, 'sub1'), d('ajeno'),
    ]
    expect(ids(scopeForProjectView(todos, { id: 'sub1', projectId: null })))
      .toEqual(['nieto', 'raiz', 'sub1', 'sub2'])
  })

  it('un ciclo en parentDiagramId no cuelga el modal ni repite tarjetas', () => {
    const a = d('a', null, 'b')
    const b = d('b', null, 'a')
    expect(ids(scopeForProjectView([a, b], { id: 'a', projectId: null }))).toEqual(['a', 'b'])
  })

  it('sin pestaña activa no hay alcance', () => {
    expect(scopeForProjectView([d('a', 'P')], null)).toEqual([])
  })

  it('el activo no está en la lista: alcance vacío, sin reventar', () => {
    expect(scopeForProjectView([d('a')], { id: 'fantasma', projectId: null })).toEqual([])
  })
})
