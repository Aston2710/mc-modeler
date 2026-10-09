import { ELEMENT_SIZES } from '../../bpmn/ElementSizes'
import type { TipoNodo } from './modelo'

/**
 * Tamaño de una tarea o subproceso colapsado según su nombre.
 *
 * POR QUÉ. La paleta crea las tareas a 90×60, que basta para lo que escribe
 * una persona. La IA escribe nombres de cuatro o cinco palabras y, a 90×60,
 * la etiqueta ocupa tres o cuatro líneas: el texto sube hasta arriba del todo
 * y el icono del tipo de tarea (usuario, servicio, envío…) le tapa la primera
 * letra. Medido en la copia de pruebas el 2026-10-09: "Identificarse en el
 * control de acceso" se veía como "dentificarse".
 *
 * GEOMETRÍA (bpmn-js 18, BpmnRenderer + TextRenderer):
 *  - la etiqueta va centrada en vertical y en horizontal, Arial 12 px,
 *    interlineado 1.2 y 5 px de relleno;
 *  - el icono del tipo se dibuja en la esquina superior izquierda: ocupa
 *    hasta x≈30 (el sobre de `tarea_envio`, el más ancho) e y≈25.
 * Una caja vale si la etiqueta cabe y su primera línea empieza por debajo del
 * icono o a la derecha de él.
 *
 * El ancho del texto se ESTIMA con las métricas de Arial: no hay DOM en el
 * servidor. Se redondea hacia arriba (FACTOR_SEGURIDAD) para que la estimación
 * falle por exceso, nunca por defecto.
 *
 * Solo crece: el tamaño mínimo sigue siendo el de la paleta, y una caja
 * existente nunca se encoge (eso lo decide quien llama).
 */

const FUENTE_PX = 12
const INTERLINEA = FUENTE_PX * 1.2
const RELLENO = 5
const ICONO = { derecha: 30, abajo: 25 }
const FACTOR_SEGURIDAD = 1.08

/** De menor a mayor: el primero que vale gana. */
const CANDIDATOS: ReadonlyArray<{ width: number; height: number }> = [
  { width: 90, height: 60 },
  { width: 120, height: 60 },
  { width: 90, height: 80 },
  { width: 120, height: 80 },
  { width: 150, height: 80 },
  { width: 180, height: 80 },
  { width: 180, height: 100 },
]

/** Tipos que llevan icono en la esquina superior izquierda. */
const CON_ICONO: ReadonlySet<TipoNodo> = new Set<TipoNodo>([
  'tarea_usuario', 'tarea_servicio', 'tarea_manual', 'tarea_script',
  'tarea_envio', 'tarea_recepcion', 'tarea_regla_negocio',
])

// Anchos de Arial en milésimas de em (tabla AFM de Helvetica/Arial).
const ESTRECHOS = new Set([...'iljIíì.,;:|!\'']) // 222–278
const SEMI = new Set([...'ftr() -/[]']) // 278–333
const ANCHOS = new Set([...'mwMW@%']) // 833–944
const MAYUSCULAS_ANCHAS = /[A-ZÁÉÍÓÚÑ¿?]/

function anchoCaracter(c: string): number {
  if (c === ' ') return 278
  if (ESTRECHOS.has(c)) return 250
  if (SEMI.has(c)) return 320
  if (ANCHOS.has(c)) return 880
  if (MAYUSCULAS_ANCHAS.test(c)) return 700
  if (/[csvxyzkñ]/.test(c)) return 500
  return 556
}

/** Ancho estimado de un texto en px, a 12 px de Arial. */
export function anchoTexto(texto: string): number {
  let milesimas = 0
  for (const c of texto) milesimas += anchoCaracter(c)
  return (milesimas / 1000) * FUENTE_PX * FACTOR_SEGURIDAD
}

/** Reparte en líneas como diagram-js: por palabras, sin partir ninguna. */
export function partirEnLineas(texto: string, anchoUtil: number): string[] {
  const lineas: string[] = []
  let actual = ''
  for (const palabra of texto.trim().split(/\s+/).filter(Boolean)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra
    if (!actual || anchoTexto(prueba) <= anchoUtil) actual = prueba
    else {
      lineas.push(actual)
      actual = palabra
    }
  }
  if (actual) lineas.push(actual)
  return lineas
}

function vale(nombre: string, caja: { width: number; height: number }, conIcono: boolean): boolean {
  const anchoUtil = caja.width - 2 * RELLENO
  const lineas = partirEnLineas(nombre, anchoUtil)
  if (lineas.some((l) => anchoTexto(l) > anchoUtil)) return false // una palabra no cabe
  const altoTexto = lineas.length * INTERLINEA
  if (altoTexto > caja.height - 2 * RELLENO) return false
  if (!conIcono) return true
  const arriba = (caja.height - altoTexto) / 2
  const izquierda = (caja.width - anchoTexto(lineas[0])) / 2
  return arriba >= ICONO.abajo || izquierda >= ICONO.derecha
}

/**
 * Tamaño para una actividad nueva (tarea o subproceso colapsado). Los demás
 * tipos no pasan por aquí: eventos y compuertas llevan la etiqueta fuera.
 */
export function tamanoActividad(tipo: TipoNodo, nombre?: string): { width: number; height: number } {
  const base = tipo === 'subproceso' ? ELEMENT_SIZES.subProcessCollapsed : ELEMENT_SIZES.task
  const texto = nombre?.trim()
  if (!texto) return { ...base }
  const conIcono = CON_ICONO.has(tipo)
  const caja = CANDIDATOS.find((c) => c.width >= base.width && c.height >= base.height && vale(texto, c, conIcono))
  return { ...(caja ?? CANDIDATOS[CANDIDATOS.length - 1]) }
}
