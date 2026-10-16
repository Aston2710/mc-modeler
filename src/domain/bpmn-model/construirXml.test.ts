// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Modeler from 'bpmn-js/lib/Modeler'
import flujoModdle from '../../bpmn/moddle/flujo.json'
import BizagiLayouter from '../../bpmn/connections/BizagiLayouter'
import { installJsdomSvgShims } from '../../bpmn/testing/jsdomSvgShims'
import { construirXml, ErrorModelo } from './construirXml'
import { disponerModelo, type Caja } from './layout'
import {
  MODELO_COMPUERTAS,
  MODELO_POOLS_CARRILES,
  MODELO_SIMPLE,
  MODELO_SUBPROCESO,
} from './fixtures'
import type { ModeloSemantico } from './modelo'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

const dentro = (a: Caja, b: Caja) =>
  a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height

const solapan = (a: Caja, b: Caja) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

const CASOS: [string, ModeloSemantico][] = [
  ['simple', MODELO_SIMPLE],
  ['compuertas', MODELO_COMPUERTAS],
  ['pools y carriles', MODELO_POOLS_CARRILES],
  ['subproceso expandido', MODELO_SUBPROCESO],
]

let container: HTMLDivElement
let modeler: Any

beforeEach(() => {
  installJsdomSvgShims()
  container = document.createElement('div')
  document.body.appendChild(container)
  // El layouter del cliente incluido: su ConnectionImportNormalizer re-traza
  // al importar, igual que en la app.
  modeler = new Modeler({
    container,
    additionalModules: [BizagiLayouter],
    moddleExtensions: { flujo: flujoModdle },
  })
})

afterEach(() => {
  modeler?.destroy()
  container.remove()
})

describe('construirXml — cada caso se abre en bpmn-js sin avisos', () => {
  for (const [nombre, modelo] of CASOS) {
    it(nombre, async () => {
      const { xml, elementos } = await construirXml(modelo)
      const { warnings } = await modeler.importXML(xml)
      expect(warnings).toEqual([])
      expect(elementos).toBeGreaterThan(0)

      // Todo nodo del modelo tiene forma en el canvas.
      const registry = modeler.get('elementRegistry')
      const ids: string[] = []
      const recoger = (lista: Any[]) => lista.forEach((n) => { ids.push(n.id); recoger(n.nodos ?? []) })
      modelo.pools.forEach((p) => { ids.push(p.id); recoger(p.nodos) })
      for (const id of ids) expect(registry.get(id), id).toBeTruthy()

      // Toda flecha queda ortogonal tras el re-trazado del cliente.
      for (const conn of registry.filter((e: Any) => e.waypoints)) {
        const wps = conn.waypoints
        for (let i = 1; i < wps.length; i++) {
          const recta = Math.round(wps[i].x) === Math.round(wps[i - 1].x) || Math.round(wps[i].y) === Math.round(wps[i - 1].y)
          expect(recta, `${conn.id} segmento ${i}`).toBe(true)
        }
      }
    })
  }
})

describe('disponerModelo — geometría', () => {
  for (const [nombre, modelo] of CASOS) {
    it(`${nombre}: nada se solapa y todo cae dentro de su pool`, () => {
      const l = disponerModelo(modelo)
      for (const pool of modelo.pools) {
        const pc = l.pools.get(pool.id)!
        const nivel = pool.nodos.filter((n) => n.tipo !== 'evento_borde')
        for (const n of pool.nodos) expect(dentro(l.nodos.get(n.id)!, pc), `${n.id} en ${pool.id}`).toBe(true)
        for (let i = 0; i < nivel.length; i++) {
          for (let j = i + 1; j < nivel.length; j++) {
            expect(solapan(l.nodos.get(nivel[i].id)!, l.nodos.get(nivel[j].id)!), `${nivel[i].id} × ${nivel[j].id}`).toBe(false)
          }
        }
      }
      // Pools apilados sin solaparse.
      const pools = [...l.pools.values()]
      for (let i = 1; i < pools.length; i++) expect(pools[i].y).toBeGreaterThanOrEqual(pools[i - 1].y + pools[i - 1].height)
    })
  }

  it('cada nodo queda dentro de su carril', () => {
    const l = disponerModelo(MODELO_POOLS_CARRILES)
    for (const n of MODELO_POOLS_CARRILES.pools[0].nodos) {
      if (n.tipo === 'evento_borde') continue
      expect(dentro(l.nodos.get(n.id)!, l.carriles.get(n.carril!)!), `${n.id} ∈ ${n.carril}`).toBe(true)
    }
  })

  it('el evento de borde queda montado sobre el borde inferior de su actividad', () => {
    const l = disponerModelo(MODELO_POOLS_CARRILES)
    const host = l.nodos.get('preparar')!
    const borde = l.nodos.get('plazo')!
    expect(borde.y + borde.height / 2).toBe(host.y + host.height)
    expect(borde.x).toBeGreaterThanOrEqual(host.x)
    expect(borde.x + borde.width).toBeLessThanOrEqual(host.x + host.width)
  })

  it('el contenido de un subproceso queda dentro del subproceso', () => {
    const l = disponerModelo(MODELO_SUBPROCESO)
    const sub = l.nodos.get('verificar')!
    for (const id of ['vS', 'rut', 'banco', 'vE']) expect(dentro(l.nodos.get(id)!, sub), id).toBe(true)
  })

  it('el flujo principal avanza de izquierda a derecha', () => {
    const l = disponerModelo(MODELO_SIMPLE)
    const xs = ['inicio', 'revisar', 'registrar', 'fin'].map((id) => l.nodos.get(id)!.x)
    expect([...xs].sort((a, b) => a - b)).toEqual(xs)
  })

  it('una rama que salta columnas no se mete entre las de un bloque paralelo', () => {
    // Regresión vista en el laboratorio (2026-10-08): "Notificar rechazo" (rama
    // "No", que salta hasta la compuerta de cierre) caía en la fila de
    // "Preparar envío" y sus flechas se confundían.
    const l = disponerModelo(MODELO_COMPUERTAS)
    const y = (id: string) => l.nodos.get(id)!.y
    expect(y('rechazar')).toBeGreaterThan(y('facturar'))
    expect(y('rechazar')).toBeGreaterThan(y('enviar'))
  })

  it('un ciclo no rompe el layout', () => {
    // pedir → verificar cierra un ciclo con error → pedir.
    expect(() => disponerModelo(MODELO_SUBPROCESO)).not.toThrow()
  })
})

describe('construirXml — integridad de entrada', () => {
  const base = (): ModeloSemantico => structuredClone(MODELO_SIMPLE)

  it('ids repetidos', async () => {
    const m = base()
    m.pools[0].nodos[1].id = 'inicio'
    await expect(construirXml(m)).rejects.toThrow(/repetido/)
  })

  it('flujo a un nodo inexistente', async () => {
    const m = base()
    m.flujos!.push({ desde: 'fin', hasta: 'fantasma' })
    await expect(construirXml(m)).rejects.toBeInstanceOf(ErrorModelo)
  })

  it('flujo de secuencia entre pools', async () => {
    const m = structuredClone(MODELO_POOLS_CARRILES)
    m.flujos!.push({ desde: 'pedir', hasta: 'recibir' })
    await expect(construirXml(m)).rejects.toThrow(/mensajes/)
  })

  it('flujo que cruza el borde de un subproceso', async () => {
    const m = structuredClone(MODELO_SUBPROCESO)
    m.flujos!.push({ desde: 'S', hasta: 'rut' })
    await expect(construirXml(m)).rejects.toThrow(/subproceso/)
  })

  it('pool con carriles y nodo sin carril', async () => {
    const m = structuredClone(MODELO_POOLS_CARRILES)
    delete m.pools[0].nodos[0].carril
    await expect(construirXml(m)).rejects.toThrow(/carril/)
  })

  it('evento de borde sin anfitrión válido', async () => {
    const m = structuredClone(MODELO_POOLS_CARRILES)
    m.pools[0].nodos.find((n) => n.id === 'plazo')!.adjunto_a = 'stock'
    await expect(construirXml(m)).rejects.toThrow(/tarea ni un subproceso/)
  })

  it('id con caracteres inválidos', async () => {
    const m = base()
    m.pools[0].nodos[0].id = 'con espacio'
    await expect(construirXml(m)).rejects.toThrow(/no es válido/)
  })

  it('más de 500 nodos', async () => {
    const m: ModeloSemantico = {
      pools: [{ id: 'P', nombre: 'P', nodos: Array.from({ length: 501 }, (_, i) => ({ id: `t${i}`, tipo: 'tarea' as const })) }],
    }
    await expect(construirXml(m)).rejects.toThrow(/máximo es 500/)
  })

  it('sin reglas semánticas: un proceso sin fin se genera igual', async () => {
    const m = base()
    m.pools[0].nodos = m.pools[0].nodos.filter((n) => n.tipo !== 'fin')
    m.flujos = m.flujos!.filter((f) => f.hasta !== 'fin')
    await expect(construirXml(m)).resolves.toHaveProperty('xml')
  })
})
