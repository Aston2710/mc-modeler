/**
 * Registro de incidentes: fallos que hoy ocurren en silencio.
 *
 * Hermano de `utils/perf.ts`, pero mide otra cosa: perf mide cuánto tarda algo
 * que funciona; esto anota algo que NO funcionó y nadie vio.
 *
 * ESTADO PROVISIONAL. Hoy el destino es la consola con formato estructurado.
 * PLAN-013 lo cambiará por una tabla append-only en Postgres con envío por
 * lotes y cola en IndexedDB. Esta superficie (`reportIncident` + el catálogo
 * cerrado de `IncidentCode`) es la que PLAN-013 necesita, así que ese cambio
 * tocará solo este archivo, no a quien lo llama.
 *
 * REGLA DURA DE CONTENIDO — el detalle debe poder enseñarse a alguien que no
 * tiene derecho a ver ningún proceso de la empresa:
 *
 *   NUNCA: XML, etiquetas de elementos, nombres de diagrama, texto de
 *          comentarios, correos, trazas de pila con closures.
 *   SIEMPRE: ids, códigos, contadores, milisegundos, tamaños, generaciones.
 *
 * El tipo de `detail` solo admite escalares precisamente para forzarlo.
 */

/**
 * Catálogo cerrado. Un código nuevo se añade aquí y en el `CHECK` de la tabla
 * cuando exista (PLAN-013). Cerrado a propósito: una tabla donde el cliente
 * inserta necesita límites.
 */
export type IncidentCode =
  /** Expiró la espera de confirmación del canvas: la colaboración no arrancó. */
  | 'collab.bind_timeout'
  /** El binding arrancó tras uno o más reintentos, no a la primera. */
  | 'collab.bind_recovered'
  /** Se emitió una edición sin saber todavía el rol; se encoló. */
  | 'collab.edit_deferred'
  /** El buffer de ediciones diferidas se llenó y se descartó lo más viejo. */
  | 'collab.edit_buffer_overflow'
  /** Los roles resolvieron como viewer: lo encolado se descarta (correcto). */
  | 'collab.edit_dropped_no_role'
  /** Segundo choque de CAS al guardar: aquí se pierde trabajo. */
  | 'collab.cas_double_conflict'
  /** El XML no pasó la validación de guardado; se evitó pisar datos buenos. */
  | 'save.invalid_xml'
  /**
   * El árbol del modelo tenía piezas mal formadas, se repararon y el guardado
   * salió adelante. **Aquí NO se pierde trabajo** — es la red que lo evita.
   * Si esto aparece, hay una fuente de piezas mal formadas que sigue viva.
   */
  | 'save.model_repaired'
  /** Se reparó lo que se pudo y el guardado siguió fallando: aquí sí se pierde. */
  | 'save.model_unrepairable'
  /** La BD dice que hay thumbnail y Storage no lo tiene. */
  | 'storage.thumb_missing'

export type IncidentSeverity = 'info' | 'warn' | 'error'

/** Solo escalares: es lo que impide que se cuele contenido del dominio. */
export type IncidentDetail = Record<string, string | number | boolean>

export interface Incident {
  code: IncidentCode
  severity: IncidentSeverity
  /** Reloj del cliente en el momento del incidente. */
  at: number
  /** Id del diagrama afectado, si aplica. */
  diagramId?: string
  detail?: IncidentDetail
}

/**
 * Tope del buffer en memoria. Un incidente repetido en bucle no debe crecer
 * sin control; al llenarse se descarta el más viejo y se cuenta cuántos.
 */
const MAX_BUFFERED = 200

const buffer: Incident[] = []
let dropped = 0

/**
 * Registra un incidente. Nunca lanza y nunca bloquea: un fallo del registro no
 * puede convertirse en un fallo de la app. Mismo principio que
 * `private.deliver_notification`, que envuelve su `net.http_post` en
 * `EXCEPTION WHEN OTHERS THEN NULL`.
 */
export function reportIncident(
  code: IncidentCode,
  detail?: IncidentDetail,
  options?: { severity?: IncidentSeverity; diagramId?: string }
): void {
  try {
    const incident: Incident = {
      code,
      severity: options?.severity ?? 'warn',
      at: Date.now(),
      diagramId: options?.diagramId,
      detail,
    }

    if (buffer.length >= MAX_BUFFERED) {
      buffer.shift()
      dropped += 1
    }
    buffer.push(incident)

    // Destino provisional. El formato es intencionadamente plano y legible:
    //   [incidente] collab.bind_timeout diagram=<uuid> waited_ms=10032 …
    const parts: string[] = [code]
    if (incident.diagramId) parts.push(`diagram=${incident.diagramId}`)
    for (const [k, v] of Object.entries(detail ?? {})) parts.push(`${k}=${String(v)}`)

    const line = `[incidente] ${parts.join(' ')}`
    if (incident.severity === 'error') console.error(line)
    else if (incident.severity === 'warn') console.warn(line)
    else console.info(line)
  } catch {
    /* el registro jamás rompe al llamador */
  }
}

/** Incidentes acumulados en esta sesión, del más viejo al más nuevo. */
export function getIncidents(): readonly Incident[] {
  return buffer
}

/** Cuántos se descartaron por desbordar el buffer. */
export function getDroppedCount(): number {
  return dropped
}

export function clearIncidents(): void {
  buffer.length = 0
  dropped = 0
}

declare global {
  interface Window {
    __flujoIncidents?: {
      list: () => readonly Incident[]
      table: () => void
      dropped: () => number
      clear: () => void
    }
  }
}

if (typeof window !== 'undefined') {
  window.__flujoIncidents = {
    list: getIncidents,
    table: () => console.table(buffer.map((i) => ({ ...i.detail, code: i.code, diagramId: i.diagramId }))),
    dropped: getDroppedCount,
    clear: clearIncidents,
  }
}
