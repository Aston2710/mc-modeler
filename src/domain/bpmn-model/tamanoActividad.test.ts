import { describe, expect, it } from 'vitest'
import { ELEMENT_SIZES } from '../../bpmn/ElementSizes'
import { construirXml } from './construirXml'
import { anchoTexto, partirEnLineas, tamanoActividad } from './tamanoActividad'

describe('tamanoActividad', () => {
  it('sin nombre, o con uno que cabe, conserva el tamaño de la paleta', () => {
    expect(tamanoActividad('tarea_usuario')).toEqual(ELEMENT_SIZES.task)
    expect(tamanoActividad('tarea', 'Revisar')).toEqual(ELEMENT_SIZES.task)
    expect(tamanoActividad('subproceso', 'Pagar')).toEqual(ELEMENT_SIZES.subProcessCollapsed)
  })

  it('una tarea sin icono solo crece si el texto no cabe', () => {
    expect(tamanoActividad('tarea', 'Revisar solicitud de compra')).toEqual(ELEMENT_SIZES.task)
    const larga = tamanoActividad('tarea', 'Revisar la solicitud de compra con el departamento financiero y legal')
    expect(larga.width * larga.height).toBeGreaterThan(ELEMENT_SIZES.task.width * ELEMENT_SIZES.task.height)
  })

  // Regresión: en la copia de pruebas (2026-10-09) el icono de usuario tapaba
  // la "I" de este nombre a 90×60.
  it('con icono, la primera línea queda libre del icono', () => {
    const nombre = 'Identificarse en el control de acceso'
    const t = tamanoActividad('tarea_usuario', nombre)
    expect(t).not.toEqual(ELEMENT_SIZES.task)

    const lineas = partirEnLineas(nombre, t.width - 10)
    const arriba = (t.height - lineas.length * 14.4) / 2
    const izquierda = (t.width - anchoTexto(lineas[0])) / 2
    expect(arriba >= 25 || izquierda >= 30).toBe(true)
  })

  it('nunca encoge por debajo de la paleta y tiene techo', () => {
    const enorme = tamanoActividad('tarea_servicio', 'palabra '.repeat(60))
    expect(enorme.width).toBeLessThanOrEqual(180)
    expect(enorme.height).toBeLessThanOrEqual(100)
    for (const n of ['A', 'Aprobar', 'Notificar al solicitante', 'Registrar hora de entrada']) {
      const t = tamanoActividad('tarea_envio', n)
      expect(t.width).toBeGreaterThanOrEqual(ELEMENT_SIZES.task.width)
      expect(t.height).toBeGreaterThanOrEqual(ELEMENT_SIZES.task.height)
    }
  })

  it('partirEnLineas no parte palabras', () => {
    expect(partirEnLineas('Identificarse', 10)).toEqual(['Identificarse'])
    expect(partirEnLineas('  a   b  ', 200)).toEqual(['a b'])
  })
})

describe('construirXml con nombres largos', () => {
  it('las tareas con icono y nombre largo salen más grandes que las de la paleta, sin solaparse', async () => {
    const { xml } = await construirXml({
      pools: [{
        id: 'p', nombre: 'Llegada',
        nodos: [
          { id: 'ini', tipo: 'inicio' },
          { id: 't1', tipo: 'tarea_usuario', nombre: 'Identificarse en el control de acceso' },
          { id: 't2', tipo: 'tarea_usuario', nombre: 'Verificar identidad y autorización' },
          { id: 't3', tipo: 'tarea', nombre: 'Archivar' },
          { id: 'fin', tipo: 'fin' },
        ],
      }],
      flujos: [
        { desde: 'ini', hasta: 't1' }, { desde: 't1', hasta: 't2' },
        { desde: 't2', hasta: 't3' }, { desde: 't3', hasta: 'fin' },
      ],
    })
    const caja = (id: string) => {
      const m = new RegExp(`bpmnElement="${id}"[^>]*>\\s*<dc:Bounds x="([\\d.-]+)" y="([\\d.-]+)" width="([\\d.-]+)" height="([\\d.-]+)"`).exec(xml)!
      const [x, y, width, height] = m.slice(1).map(Number)
      return { x, y, width, height }
    }
    const t1 = caja('t1')
    const t2 = caja('t2')
    const t3 = caja('t3')
    expect(t1.width * t1.height).toBeGreaterThan(90 * 60)
    expect(t3).toMatchObject({ width: 90, height: 60 })
    expect(t1.x + t1.width).toBeLessThanOrEqual(t2.x)
    expect(t2.x + t2.width).toBeLessThanOrEqual(t3.x)
  })
})
