import { ELEMENT_SIZES } from '../../bpmn/ElementSizes'
import { esCompuerta, esEvento, type FlujoSemantico, type ModeloSemantico, type NodoSemantico } from './modelo'

/**
 * Layout de un modelo semántico: decide DÓNDE va cada forma. Las flechas no se
 * calculan aquí sino en `construirXml`, con el mismo `BizagiLayouter` del
 * cliente — que además las vuelve a trazar al abrir el diagrama
 * (`ConnectionImportNormalizer`), así que lo que importa de verdad es que las
 * FORMAS queden bien colocadas.
 *
 * Por qué no `bpmn-auto-layout`: medido el 2026-10-08, la versión publicada
 * (1.3.0) solo dispone el primer participante y no dibuja pools, carriles ni
 * flujos de mensaje (docs/addons/investigacion-mcp.md §5.1).
 *
 * Algoritmo, de izquierda a derecha como dibuja la gente en Bizagi:
 *  1. columnas por camino más largo desde los inicios, con los ciclos
 *     neutralizados (un "volver a revisar" no empuja el proceso hacia atrás);
 *  2. filas por carril: cada nodo intenta la fila de su predecesor y baja a la
 *     siguiente libre, así las ramas de una compuerta se abren hacia abajo;
 *  3. tamaños: los de la paleta de la app (`ELEMENT_SIZES`) y, para un
 *     subproceso, el de su contenido dispuesto con el mismo algoritmo;
 *  4. eventos de borde montados sobre el borde inferior de su actividad.
 */

export interface Caja {
  x: number
  y: number
  width: number
  height: number
}

export interface ResultadoLayout {
  nodos: Map<string, Caja>
  pools: Map<string, Caja>
  carriles: Map<string, Caja>
}

const ORIGEN = { x: 100, y: 50 }
const ETIQUETA_POOL = 30
const ETIQUETA_CARRIL = 30
const SEPARACION_POOLS = 60
const ANCHO_MIN_POOL = ELEMENT_SIZES.participantExpanded.width
const ALTO_MIN_CARRIL = 120
const HUECO_COLUMNAS = 50
const HUECO_FILAS = 40
const EXTRA_FILA_CON_BORDE = 30
const ESPACIO_ENTRE_BORDES = 44

interface Margenes {
  x: number
  y: number
  altoMinCarril: number
}

const MARGEN_POOL: Margenes = { x: 40, y: 30, altoMinCarril: ALTO_MIN_CARRIL }
const MARGEN_SUBPROCESO: Margenes = { x: 20, y: 20, altoMinCarril: 0 }
/** Hueco superior del subproceso expandido para su etiqueta. */
const CABECERA_SUBPROCESO = 20

function tamanoBase(nodo: NodoSemantico): { width: number; height: number } {
  if (esEvento(nodo.tipo)) return { ...ELEMENT_SIZES.event }
  if (esCompuerta(nodo.tipo)) return { ...ELEMENT_SIZES.gateway }
  return { ...ELEMENT_SIZES.task }
}

interface Nivel {
  /** Posiciones relativas al origen del nivel, incluidos los descendientes. */
  cajas: Map<string, Caja>
  altoCarriles: number[]
  ancho: number
  alto: number
}

/**
 * Dispone un nivel: el contenido de un pool (con N carriles) o el de un
 * subproceso (un solo carril implícito).
 */
function disponerNivel(
  nodos: NodoSemantico[],
  flujos: FlujoSemantico[],
  carrilDe: (n: NodoSemantico) => number,
  numCarriles: number,
  margen: Margenes
): Nivel {
  const principales = nodos.filter((n) => n.tipo !== 'evento_borde')
  const bordesDe = new Map<string, NodoSemantico[]>()
  for (const n of nodos) {
    if (n.tipo === 'evento_borde' && n.adjunto_a) {
      const lista = bordesDe.get(n.adjunto_a) ?? []
      lista.push(n)
      bordesDe.set(n.adjunto_a, lista)
    }
  }
  const anfitrionDe = new Map<string, string>()
  for (const [host, lista] of bordesDe) for (const b of lista) anfitrionDe.set(b.id, host)

  // ── Tamaños (y layout interno de los subprocesos) ──
  const tamano = new Map<string, { width: number; height: number }>()
  const internos = new Map<string, Nivel>()
  const flujosPorContenedor = (sub: NodoSemantico) => {
    const ids = new Set((sub.nodos ?? []).map((n) => n.id))
    return flujos.filter((f) => ids.has(f.desde) && ids.has(f.hasta))
  }
  for (const n of principales) {
    if (n.tipo === 'subproceso' && n.nodos?.length) {
      const interno = disponerNivel(n.nodos, flujosPorContenedor(n), () => 0, 1, MARGEN_SUBPROCESO)
      internos.set(n.id, interno)
      tamano.set(n.id, {
        width: Math.max(interno.ancho, ELEMENT_SIZES.task.width),
        height: Math.max(interno.alto + CABECERA_SUBPROCESO, ELEMENT_SIZES.task.height),
      })
    } else {
      tamano.set(n.id, tamanoBase(n))
    }
  }

  // ── Grafo del nivel (un flujo desde un evento de borde cuenta desde su anfitrión) ──
  const ids = new Set(principales.map((n) => n.id))
  const extremo = (id: string) => anfitrionDe.get(id) ?? id
  const sucesores = new Map<string, string[]>()
  const desdeBorde = new Set<string>() // destinos alcanzados desde un evento de borde
  for (const id of ids) sucesores.set(id, [])
  for (const f of flujos) {
    const a = extremo(f.desde)
    const b = extremo(f.hasta)
    if (!ids.has(a) || !ids.has(b) || a === b) continue
    sucesores.get(a)!.push(b)
    if (anfitrionDe.has(f.desde)) desdeBorde.add(`${a}>${b}`)
  }

  // Aristas de retroceso por DFS en el orden de entrada: se ignoran al asignar
  // columnas, si no un ciclo no tendría solución.
  const retroceso = new Set<string>()
  const estado = new Map<string, 1 | 2>()
  const dfs = (id: string) => {
    estado.set(id, 1)
    for (const s of sucesores.get(id)!) {
      if (estado.get(s) === 1) retroceso.add(`${id}>${s}`)
      else if (!estado.has(s)) dfs(s)
    }
    estado.set(id, 2)
  }
  const entrantes = new Map<string, number>()
  for (const id of ids) entrantes.set(id, 0)
  for (const [a, ss] of sucesores) for (const b of ss) if (a !== b) entrantes.set(b, entrantes.get(b)! + 1)
  // Primero desde las fuentes, luego lo que quede (ciclos sin fuente).
  for (const n of principales) if (entrantes.get(n.id) === 0 && !estado.has(n.id)) dfs(n.id)
  for (const n of principales) if (!estado.has(n.id)) dfs(n.id)

  const predecesores = new Map<string, string[]>()
  for (const id of ids) predecesores.set(id, [])
  for (const [a, ss] of sucesores) {
    for (const b of ss) if (!retroceso.has(`${a}>${b}`)) predecesores.get(b)!.push(a)
  }

  // ── Columnas: camino más largo (Kahn sobre el DAG, desempate por orden de entrada) ──
  const columna = new Map<string, number>()
  const pendientes = new Map<string, number>()
  for (const id of ids) pendientes.set(id, predecesores.get(id)!.length)
  const orden = principales.map((n) => n.id)
  const cola = orden.filter((id) => pendientes.get(id) === 0)
  const visitados: string[] = []
  while (cola.length) {
    const id = cola.shift()!
    visitados.push(id)
    const c = Math.max(-1, ...predecesores.get(id)!.map((p) => columna.get(p) ?? 0)) + 1
    columna.set(id, c)
    for (const s of sucesores.get(id)!) {
      if (retroceso.has(`${id}>${s}`)) continue
      pendientes.set(s, pendientes.get(s)! - 1)
      if (pendientes.get(s) === 0) cola.push(s)
    }
  }

  // ── Filas por carril ──
  const carril = new Map<string, number>()
  for (const n of principales) carril.set(n.id, Math.min(Math.max(carrilDe(n), 0), numCarriles - 1))
  // Recorrido en PROFUNDIDAD siguiendo el flujo (no columna a columna): el
  // camino principal se coloca entero primero y cada rama secundaria busca
  // después su fila. Una fila sirve si está libre la celda del nodo Y las
  // celdas por las que viajará su flecha hasta los sucesores ya colocados en
  // ese carril; si no, una rama larga (la salida "No" que salta hasta la
  // compuerta de cierre) cruzaría las ramas que tiene debajo. Medido en el
  // laboratorio el 2026-10-08: columna a columna, "Notificar rechazo" quedaba
  // pegada a "Preparar envío" y sus flechas se confundían.
  const fila = new Map<string, number>()
  const ocupado = new Set<string>()
  const celda = (l: number, c: number, r: number) => `${l}:${c}:${r}`
  const enDag = new Set(visitados)
  const colocar = (id: string) => {
    const l = carril.get(id)!
    const c = columna.get(id)!
    let preferida = 0
    const preds = predecesores.get(id)!.filter((p) => carril.get(p) === l && fila.has(p))
    if (preds.length) {
      const p = preds[0]
      preferida = fila.get(p)! + (desdeBorde.has(`${p}>${id}`) ? 1 : 0)
    }
    const tramos = sucesores.get(id)!
      .filter((s) => !retroceso.has(`${id}>${s}`) && fila.has(s) && carril.get(s) === l)
      .map((s) => columna.get(s)!)
    const libre = (r: number) => {
      if (ocupado.has(celda(l, c, r))) return false
      for (const cs of tramos) for (let k = c + 1; k < cs; k++) if (ocupado.has(celda(l, k, r))) return false
      return true
    }
    let r = preferida
    while (!libre(r)) r++
    fila.set(id, r)
    ocupado.add(celda(l, c, r))
    for (const cs of tramos) for (let k = c + 1; k < cs; k++) ocupado.add(celda(l, k, r))
  }
  const visitar = (id: string) => {
    if (fila.has(id) || !enDag.has(id)) return
    colocar(id)
    for (const s of sucesores.get(id)!) if (!retroceso.has(`${id}>${s}`)) visitar(s)
  }
  for (const id of orden) if (predecesores.get(id)!.length === 0) visitar(id)
  for (const id of orden) visitar(id)

  // ── Medidas de columnas y filas ──
  const numColumnas = Math.max(0, ...[...columna.values()].map((c) => c + 1))
  const anchoColumna = Array<number>(numColumnas).fill(0)
  for (const id of visitados) {
    const c = columna.get(id)!
    anchoColumna[c] = Math.max(anchoColumna[c], tamano.get(id)!.width)
  }
  const altoFila: number[][] = Array.from({ length: numCarriles }, () => [])
  const extraFila: number[][] = Array.from({ length: numCarriles }, () => [])
  for (const id of visitados) {
    const l = carril.get(id)!
    const r = fila.get(id)!
    altoFila[l][r] = Math.max(altoFila[l][r] ?? 0, tamano.get(id)!.height)
    if (bordesDe.has(id)) extraFila[l][r] = EXTRA_FILA_CON_BORDE
  }
  for (let l = 0; l < numCarriles; l++) {
    for (let r = 0; r < altoFila[l].length; r++) altoFila[l][r] ??= ELEMENT_SIZES.task.height
  }

  const xColumna: number[] = []
  let x = margen.x
  for (let c = 0; c < numColumnas; c++) {
    xColumna.push(x)
    x += anchoColumna[c] + HUECO_COLUMNAS
  }
  const ancho = (numColumnas ? x - HUECO_COLUMNAS : x) + margen.x

  const altoCarriles: number[] = []
  const yCarril: number[] = []
  const yFila: number[][] = []
  let y = 0
  for (let l = 0; l < numCarriles; l++) {
    yCarril.push(y)
    const filas = altoFila[l]
    yFila.push([])
    let yy = y + margen.y
    for (let r = 0; r < filas.length; r++) {
      yFila[l].push(yy)
      yy += filas[r] + (extraFila[l][r] ?? 0) + HUECO_FILAS
    }
    const contenido = filas.length ? yy - HUECO_FILAS - y + margen.y : margen.y * 2
    const alto = Math.max(contenido, margen.altoMinCarril)
    altoCarriles.push(alto)
    y += alto
  }

  // ── Cajas ──
  const cajas = new Map<string, Caja>()
  for (const id of visitados) {
    const t = tamano.get(id)!
    const l = carril.get(id)!
    const c = columna.get(id)!
    const r = fila.get(id)!
    const caja: Caja = {
      x: Math.round(xColumna[c] + (anchoColumna[c] - t.width) / 2),
      y: Math.round(yFila[l][r] + (altoFila[l][r] - t.height) / 2),
      width: t.width,
      height: t.height,
    }
    cajas.set(id, caja)
    const interno = internos.get(id)
    if (interno) {
      for (const [hijo, h] of interno.cajas) {
        cajas.set(hijo, { ...h, x: h.x + caja.x, y: h.y + caja.y + CABECERA_SUBPROCESO })
      }
    }
  }
  for (const [host, lista] of bordesDe) {
    const h = cajas.get(host)
    if (!h) continue
    lista.forEach((b, i) => {
      const s = ELEMENT_SIZES.event
      const cx = Math.max(h.x + s.width / 2, h.x + h.width - s.width / 2 - 2 - i * ESPACIO_ENTRE_BORDES)
      cajas.set(b.id, {
        x: Math.round(cx - s.width / 2),
        y: Math.round(h.y + h.height - s.height / 2),
        width: s.width,
        height: s.height,
      })
    })
  }

  return { cajas, altoCarriles, ancho, alto: y }
}

export function disponerModelo(modelo: ModeloSemantico): ResultadoLayout {
  const flujos = modelo.flujos ?? []
  const niveles = modelo.pools.map((pool) => {
    const carriles = pool.carriles ?? []
    const indice = new Map(carriles.map((c, i) => [c.id, i]))
    const nivel = disponerNivel(
      pool.nodos,
      flujos,
      (n) => (n.carril ? indice.get(n.carril) ?? 0 : 0),
      Math.max(carriles.length, 1),
      MARGEN_POOL
    )
    const cabecera = ETIQUETA_POOL + (carriles.length ? ETIQUETA_CARRIL : 0)
    return { pool, carriles, nivel, cabecera, anchoNecesario: cabecera + nivel.ancho }
  })

  const anchoPool = Math.max(ANCHO_MIN_POOL, ...niveles.map((n) => n.anchoNecesario))
  const resultado: ResultadoLayout = { nodos: new Map(), pools: new Map(), carriles: new Map() }
  let y = ORIGEN.y
  for (const { pool, carriles, nivel, cabecera } of niveles) {
    const altoPool = nivel.alto
    resultado.pools.set(pool.id, { x: ORIGEN.x, y, width: anchoPool, height: altoPool })
    let yc = y
    carriles.forEach((c, i) => {
      resultado.carriles.set(c.id, {
        x: ORIGEN.x + ETIQUETA_POOL,
        y: yc,
        width: anchoPool - ETIQUETA_POOL,
        height: nivel.altoCarriles[i],
      })
      yc += nivel.altoCarriles[i]
    })
    for (const [id, caja] of nivel.cajas) {
      resultado.nodos.set(id, { ...caja, x: caja.x + ORIGEN.x + cabecera, y: caja.y + y })
    }
    y += altoPool + SEPARACION_POOLS
  }
  return resultado
}
