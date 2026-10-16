import {
  LIMITES,
  PATRON_ID,
  TIPO_BPMN,
  esActividad,
  esEvento,
  type FlujoSemantico,
  type ModeloSemantico,
  type NodoSemantico,
} from './modelo'

/**
 * Comprobación de INTEGRIDAD del modelo semántico antes de generar nada.
 *
 * Solo bloquea lo que haría un XML roto o ambiguo: ids repetidos o inválidos,
 * referencias a nodos que no existen, flujos que cruzan un pool o un
 * subproceso, eventos de borde sin anfitrión. Es la frontera de DEC-011:
 * integridad referencial sí, reglas semánticas de BPMN no. Un proceso sin
 * evento de fin, una compuerta con una sola salida o una tarea suelta se
 * generan igual; para eso está `validar_diagrama`, que avisa y no bloquea.
 */

export interface InfoNodo {
  nodo: NodoSemantico
  poolId: string
  /** Clave del contenedor de flujos: el pool o el subproceso que lo contiene. */
  contenedor: string
  profundidad: number
}

export interface ResultadoValidacion {
  errores: string[]
  /** Índice de nodos por id, listo para quien genere el XML. */
  nodos: Map<string, InfoNodo>
}

export function validarModelo(modelo: ModeloSemantico): ResultadoValidacion {
  const errores: string[] = []
  const nodos = new Map<string, InfoNodo>()
  const idsUsados = new Set<string>()
  const pools = new Set<string>()

  const reclamarId = (id: unknown, que: string) => {
    if (typeof id !== 'string' || !PATRON_ID.test(id)) {
      errores.push(`${que}: el id ${JSON.stringify(id)} no es válido (letras, números, _ . -; empieza por letra o _; máximo 64)`)
      return false
    }
    if (idsUsados.has(id)) {
      errores.push(`${que}: el id "${id}" está repetido`)
      return false
    }
    idsUsados.add(id)
    return true
  }

  const nombreValido = (nombre: unknown, que: string) => {
    if (nombre === undefined) return
    if (typeof nombre !== 'string') errores.push(`${que}: el nombre debe ser texto`)
    else if (nombre.length > LIMITES.MAX_LARGO_NOMBRE) {
      errores.push(`${que}: el nombre supera ${LIMITES.MAX_LARGO_NOMBRE} caracteres`)
    }
  }

  if (!Array.isArray(modelo?.pools) || modelo.pools.length === 0) {
    return { errores: ['el modelo necesita al menos un pool'], nodos }
  }
  if (modelo.pools.length > LIMITES.MAX_POOLS) {
    errores.push(`como máximo ${LIMITES.MAX_POOLS} pools`)
  }

  const recorrer = (
    lista: NodoSemantico[] | undefined,
    poolId: string,
    contenedor: string,
    carriles: Set<string> | null,
    profundidad: number
  ) => {
    for (const nodo of lista ?? []) {
      const que = `nodo ${JSON.stringify(nodo?.id)}`
      if (!reclamarId(nodo?.id, que)) continue
      if (!(nodo.tipo in TIPO_BPMN)) {
        errores.push(`${que}: tipo "${nodo.tipo}" desconocido`)
        continue
      }
      nombreValido(nodo.nombre, que)
      if (nodo.evento !== undefined && !esEvento(nodo.tipo)) {
        errores.push(`${que}: solo los eventos llevan "evento"`)
      }
      // El carril solo cuenta en el nivel del pool: dentro de un subproceso el
      // contenido hereda el carril del subproceso.
      if (profundidad === 0 && carriles) {
        if (!nodo.carril) errores.push(`${que}: el pool tiene carriles y el nodo no indica cuál`)
        else if (!carriles.has(nodo.carril)) errores.push(`${que}: el carril "${nodo.carril}" no existe en su pool`)
      }
      if (nodo.tipo === 'subproceso') {
        if (profundidad + 1 > LIMITES.MAX_PROFUNDIDAD_SUBPROCESO) {
          errores.push(`${que}: más de ${LIMITES.MAX_PROFUNDIDAD_SUBPROCESO} niveles de subproceso`)
        }
      } else if (nodo.nodos?.length) {
        errores.push(`${que}: solo un subproceso puede contener nodos`)
      }
      nodos.set(nodo.id, { nodo, poolId, contenedor, profundidad })
      if (nodo.tipo === 'subproceso') recorrer(nodo.nodos, poolId, nodo.id, null, profundidad + 1)
    }
  }

  for (const pool of modelo.pools) {
    const que = `pool ${JSON.stringify(pool?.id)}`
    if (!reclamarId(pool?.id, que)) continue
    nombreValido(pool.nombre, que)
    pools.add(pool.id)
    let carriles: Set<string> | null = null
    if (pool.carriles?.length) {
      if (pool.carriles.length > LIMITES.MAX_CARRILES_POR_POOL) {
        errores.push(`${que}: como máximo ${LIMITES.MAX_CARRILES_POR_POOL} carriles`)
      }
      carriles = new Set()
      for (const c of pool.carriles) {
        if (reclamarId(c?.id, `carril ${JSON.stringify(c?.id)}`)) carriles.add(c.id)
        nombreValido(c?.nombre, `carril ${JSON.stringify(c?.id)}`)
      }
    }
    recorrer(pool.nodos, pool.id, pool.id, carriles, 0)
  }

  if (nodos.size > LIMITES.MAX_NODOS) {
    errores.push(`el diagrama tiene ${nodos.size} nodos; el máximo es ${LIMITES.MAX_NODOS}`)
  }

  // Eventos de borde: anfitrión existente, actividad, en el mismo contenedor.
  for (const { nodo, contenedor } of nodos.values()) {
    if (nodo.tipo !== 'evento_borde') {
      if (nodo.adjunto_a !== undefined) errores.push(`nodo "${nodo.id}": solo un evento_borde lleva "adjunto_a"`)
      continue
    }
    const host = nodo.adjunto_a ? nodos.get(nodo.adjunto_a) : undefined
    if (!host) errores.push(`evento_borde "${nodo.id}": "adjunto_a" debe ser el id de una actividad existente`)
    else if (!esActividad(host.nodo.tipo)) errores.push(`evento_borde "${nodo.id}": "${host.nodo.id}" no es una tarea ni un subproceso`)
    else if (host.contenedor !== contenedor) errores.push(`evento_borde "${nodo.id}": debe estar en el mismo nivel que "${host.nodo.id}"`)
  }

  const flujoIds = (lista: FlujoSemantico[] | undefined, que: string) => {
    for (const f of lista ?? []) if (f?.id !== undefined) reclamarId(f.id, `${que} ${JSON.stringify(f.id)}`)
  }
  flujoIds(modelo.flujos, 'flujo')
  flujoIds(modelo.mensajes, 'mensaje')

  for (const f of modelo.flujos ?? []) {
    const que = `flujo ${f?.desde} → ${f?.hasta}`
    nombreValido(f?.nombre, que)
    const a = nodos.get(f?.desde)
    const b = nodos.get(f?.hasta)
    if (!a || !b) {
      errores.push(`${que}: ${!a ? `"${f?.desde}"` : `"${f?.hasta}"`} no es un nodo del modelo`)
      continue
    }
    if (a.poolId !== b.poolId) {
      errores.push(`${que}: une dos pools distintos; entre pools se usan "mensajes"`)
    } else if (a.contenedor !== b.contenedor) {
      errores.push(`${que}: cruza el borde de un subproceso; un flujo de secuencia no sale de su nivel`)
    }
  }

  for (const m of modelo.mensajes ?? []) {
    const que = `mensaje ${m?.desde} → ${m?.hasta}`
    nombreValido(m?.nombre, que)
    const poolDe = (id: string) => (pools.has(id) ? id : nodos.get(id)?.poolId)
    const pa = poolDe(m?.desde)
    const pb = poolDe(m?.hasta)
    if (!pa || !pb) {
      errores.push(`${que}: los extremos deben ser nodos o pools del modelo`)
    } else if (pa === pb) {
      errores.push(`${que}: un mensaje une pools distintos; dentro de un pool se usan "flujos"`)
    }
  }

  return { errores, nodos }
}
