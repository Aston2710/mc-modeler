import { z } from 'zod'

/**
 * Esquemas de entrada de las tools. Reflejan los tipos de
 * `src/domain/bpmn-model/modelo.ts`; las descripciones son lo que lee la IA
 * para decidir cómo llamar, así que van en español y con ejemplos.
 *
 * Los límites finos (ids, referencias, carriles) los comprueba
 * `validarModelo` con mensajes precisos; aquí solo se acota la forma y el
 * tamaño, para no dejar pasar basura ni payloads gigantes.
 */

export const TIPOS_NODO = [
  'inicio', 'fin', 'intermedio_captura', 'intermedio_lanzamiento', 'evento_borde',
  'tarea', 'tarea_usuario', 'tarea_servicio', 'tarea_manual', 'tarea_script',
  'tarea_envio', 'tarea_recepcion', 'tarea_regla_negocio', 'subproceso',
  'compuerta_exclusiva', 'compuerta_paralela', 'compuerta_inclusiva',
  'compuerta_eventos', 'compuerta_compleja',
] as const

export const DEFINICIONES_EVENTO = [
  'mensaje', 'temporizador', 'error', 'senal', 'terminacion', 'condicional', 'escalamiento', 'compensacion',
] as const

const id = z.string().min(1).max(64).describe('Id legible y único en el diagrama: letras, números, _ . - (empieza por letra o _). Ej.: "revisar_solicitud"')
const nombre = z.string().max(200)

const camposNodo = {
  id,
  tipo: z.enum(TIPOS_NODO).describe('Tipo BPMN del nodo'),
  nombre: nombre.optional().describe('Texto visible. En tareas, verbo + objeto: "Revisar solicitud"'),
  carril: z.string().max(64).optional().describe('Id del carril. Obligatorio si el pool tiene carriles'),
  evento: z.enum(DEFINICIONES_EVENTO).optional().describe('Solo eventos: tipo de disparador. Sin él, evento simple'),
  adjunto_a: z.string().max(64).optional().describe('Solo evento_borde: id de la tarea o subproceso donde va montado'),
  interrumpe: z.boolean().optional().describe('Solo evento_borde. Por defecto true'),
}

export interface NodoEntrada {
  id: string
  tipo: (typeof TIPOS_NODO)[number]
  nombre?: string
  carril?: string
  evento?: (typeof DEFINICIONES_EVENTO)[number]
  adjunto_a?: string
  interrumpe?: boolean
  nodos?: NodoEntrada[]
}

export const esquemaNodo: z.ZodType<NodoEntrada> = z.lazy(() =>
  z.object({
    ...camposNodo,
    nodos: z.array(esquemaNodo).max(200).optional()
      .describe('Solo subproceso: su contenido, que se dibuja expandido dentro de él'),
  })
)

const esquemaFlujo = z.object({
  id: id.optional(),
  desde: z.string().max(64).describe('Id del nodo de origen'),
  hasta: z.string().max(64).describe('Id del nodo de destino'),
  nombre: nombre.optional().describe('Etiqueta. Ej.: "Sí" / "No" a la salida de una compuerta'),
})

export const esquemaModelo = z.object({
  pools: z.array(z.object({
    id,
    nombre: nombre.describe('Nombre del pool: el proceso o la organización'),
    carriles: z.array(z.object({ id, nombre })).max(20).optional()
      .describe('Carriles (roles o áreas). Si hay, cada nodo de primer nivel indica el suyo'),
    nodos: z.array(esquemaNodo).max(500),
  })).min(1).max(12),
  flujos: z.array(esquemaFlujo).max(1000).optional()
    .describe('Flujos de secuencia, siempre dentro del mismo pool y del mismo nivel de subproceso'),
  mensajes: z.array(esquemaFlujo).max(200).optional()
    .describe('Flujos de mensaje entre pools distintos. Los extremos pueden ser nodos o pools'),
})

export const esquemaOperacion = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('agregar_nodo'),
    ...camposNodo,
    pool: z.string().max(64).optional().describe('Pool donde va. Obligatorio si hay varios, salvo con despues_de o dentro_de'),
    dentro_de: z.string().max(64).optional().describe('Id de un subproceso expandido donde va'),
    despues_de: z.string().max(64).optional().describe('Id de un nodo existente: el nuevo se coloca a su derecha, en su carril'),
  }),
  z.object({ op: z.literal('renombrar'), id: z.string().max(64), nombre }),
  z.object({
    op: z.literal('conectar'),
    desde: z.string().max(64),
    hasta: z.string().max(64),
    nombre: nombre.optional(),
    id: id.optional(),
  }).describe('Mismo pool y nivel → flujo de secuencia; pools distintos → flujo de mensaje'),
  z.object({ op: z.literal('eliminar'), id: z.string().max(64) })
    .describe('Elimina un nodo o un flujo, con sus flujos y eventos de borde dependientes. No elimina pools ni carriles'),
])
