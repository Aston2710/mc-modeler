/**
 * Modelo semántico de un diagrama BPMN: lo que una IA describe, sin
 * coordenadas. Es el contrato de entrada de `crear_diagrama` en el conector MCP
 * (MASTER-PLAN-038, PLAN-040) y lo que devuelve `obtener_diagrama`.
 *
 * Los nombres van en español porque son la superficie que lee la IA: el
 * esquema de las tools se genera a partir de estos mismos tipos.
 *
 * Este módulo y sus hermanos son PUROS: sin DOM, sin React, sin bpmn-js. Se
 * ejecutan igual en el navegador, en Vitest y en la función del servidor.
 */

export type TipoNodo =
  | 'inicio'
  | 'fin'
  | 'intermedio_captura'
  | 'intermedio_lanzamiento'
  | 'evento_borde'
  | 'tarea'
  | 'tarea_usuario'
  | 'tarea_servicio'
  | 'tarea_manual'
  | 'tarea_script'
  | 'tarea_envio'
  | 'tarea_recepcion'
  | 'tarea_regla_negocio'
  | 'subproceso'
  | 'compuerta_exclusiva'
  | 'compuerta_paralela'
  | 'compuerta_inclusiva'
  | 'compuerta_eventos'
  | 'compuerta_compleja'

export type DefinicionEvento =
  | 'mensaje'
  | 'temporizador'
  | 'error'
  | 'senal'
  | 'terminacion'
  | 'condicional'
  | 'escalamiento'
  | 'compensacion'

export interface NodoSemantico {
  /** Id legible elegido por quien describe el diagrama. Se conserva en el XML. */
  id: string
  tipo: TipoNodo
  nombre?: string
  /** Id del carril, si el pool tiene carriles. Ignorado dentro de un subproceso. */
  carril?: string
  /** Solo eventos. Sin definición = evento simple. */
  evento?: DefinicionEvento
  /** Solo `evento_borde`: id de la actividad sobre la que va montado. */
  adjunto_a?: string
  /** Solo `evento_borde`. Por defecto interrumpe. */
  interrumpe?: boolean
  /** Solo `subproceso`: su contenido, que se dibuja expandido. */
  nodos?: NodoSemantico[]
}

export interface CarrilSemantico {
  id: string
  nombre: string
}

export interface PoolSemantico {
  id: string
  nombre: string
  carriles?: CarrilSemantico[]
  nodos: NodoSemantico[]
}

export interface FlujoSemantico {
  /** Opcional: si falta se genera uno. */
  id?: string
  desde: string
  hasta: string
  nombre?: string
}

export interface ModeloSemantico {
  pools: PoolSemantico[]
  /** Flujos de secuencia: dentro del mismo pool y del mismo nivel de subproceso. */
  flujos?: FlujoSemantico[]
  /** Flujos de mensaje: entre pools distintos. Extremos: nodos o pools. */
  mensajes?: FlujoSemantico[]
}

/** Tipo BPMN de cada nodo. */
export const TIPO_BPMN: Record<TipoNodo, string> = {
  inicio: 'bpmn:StartEvent',
  fin: 'bpmn:EndEvent',
  intermedio_captura: 'bpmn:IntermediateCatchEvent',
  intermedio_lanzamiento: 'bpmn:IntermediateThrowEvent',
  evento_borde: 'bpmn:BoundaryEvent',
  tarea: 'bpmn:Task',
  tarea_usuario: 'bpmn:UserTask',
  tarea_servicio: 'bpmn:ServiceTask',
  tarea_manual: 'bpmn:ManualTask',
  tarea_script: 'bpmn:ScriptTask',
  tarea_envio: 'bpmn:SendTask',
  tarea_recepcion: 'bpmn:ReceiveTask',
  tarea_regla_negocio: 'bpmn:BusinessRuleTask',
  subproceso: 'bpmn:SubProcess',
  compuerta_exclusiva: 'bpmn:ExclusiveGateway',
  compuerta_paralela: 'bpmn:ParallelGateway',
  compuerta_inclusiva: 'bpmn:InclusiveGateway',
  compuerta_eventos: 'bpmn:EventBasedGateway',
  compuerta_compleja: 'bpmn:ComplexGateway',
}

/** Inverso de TIPO_BPMN, para describir un XML existente. */
export const TIPO_SEMANTICO: Record<string, TipoNodo> = Object.fromEntries(
  Object.entries(TIPO_BPMN).map(([k, v]) => [v, k as TipoNodo])
)

export const DEFINICION_BPMN: Record<DefinicionEvento, string> = {
  mensaje: 'bpmn:MessageEventDefinition',
  temporizador: 'bpmn:TimerEventDefinition',
  error: 'bpmn:ErrorEventDefinition',
  senal: 'bpmn:SignalEventDefinition',
  terminacion: 'bpmn:TerminateEventDefinition',
  condicional: 'bpmn:ConditionalEventDefinition',
  escalamiento: 'bpmn:EscalationEventDefinition',
  compensacion: 'bpmn:CompensateEventDefinition',
}

export const DEFINICION_SEMANTICA: Record<string, DefinicionEvento> = Object.fromEntries(
  Object.entries(DEFINICION_BPMN).map(([k, v]) => [v, k as DefinicionEvento])
)

export const esEvento = (t: TipoNodo): boolean =>
  t === 'inicio' || t === 'fin' || t === 'intermedio_captura' ||
  t === 'intermedio_lanzamiento' || t === 'evento_borde'

export const esCompuerta = (t: TipoNodo): boolean => t.startsWith('compuerta_')

export const esActividad = (t: TipoNodo): boolean => t.startsWith('tarea') || t === 'subproceso'

/**
 * Límites del conector. `MAX_NODOS` coincide con `MAX_ELEMENTS`
 * (`domain/bpmnElements.ts`) y con la guardia de la base (500 elementos).
 */
export const LIMITES = {
  MAX_NODOS: 500,
  MAX_POOLS: 12,
  MAX_CARRILES_POR_POOL: 20,
  MAX_PROFUNDIDAD_SUBPROCESO: 3,
  MAX_LARGO_NOMBRE: 200,
  MAX_BYTES_XML: 1024 * 1024,
} as const

/** Id XML válido (NCName acotado) y legible. */
export const PATRON_ID = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/
