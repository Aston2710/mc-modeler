/**
 * Ciclo de vida del binding de co-edición: cuándo se considera perdido y qué
 * pasa después.
 *
 * Mecanismo A de EXP-011. La versión anterior, al agotar los 10 s esperando la
 * confirmación del canvas, escribía un `console.warn` y hacía `return` — la
 * colaboración quedaba muerta el resto de la sesión. Y como presencia y
 * cursores seguían funcionando, los dos usuarios se veían y creían estar
 * sincronizados mientras editaban en solitario.
 *
 * Dos cambios: agotar el plazo pasa a ser un estado observable (no un final), y
 * el sondeo continúa espaciado, de modo que un canvas que confirma tarde
 * todavía arranca la colaboración.
 *
 * Lo que NO cambia es la condición de arranque: sigue exigiéndose confirmación
 * explícita de que el canvas muestra ESTE diagrama. Relajarla es lo que causó
 * EXP-003 (elementos de un diagrama dentro del pool de otro).
 *
 * Vive fuera del hook para poder probarse con un reloj inyectado.
 */

export type BindingState = 'esperando' | 'activo' | 'agotado'

/** Plazo antes de dar el binding por perdido (sin dejar de reintentar). */
export const BIND_CONFIRM_TIMEOUT_MS = 10000
/** Sondeo mientras hay esperanza. */
export const BIND_POLL_MS = 300
/** Sondeo una vez agotado: más espaciado, para no vigilar en balde. */
export const BIND_RETRY_INTERVAL_MS = 2000

export interface BindingLifecycle {
  /**
   * Evalúa una vuelta del sondeo.
   * `canvasReady` es la confirmación de identidad del canvas — nunca se
   * infiere ni se relaja.
   */
  tick: (canvasReady: boolean) => {
    state: BindingState
    /** Transición ocurrida en esta vuelta, si la hubo. */
    event: 'started' | 'recovered' | 'timeout' | null
    waitedMs: number
    retries: number
    /** Cuánto esperar antes de la próxima vuelta. */
    nextDelayMs: number
  }
  state: () => BindingState
  retries: () => number
}

export function createBindingLifecycle(now: () => number = Date.now): BindingLifecycle {
  const startedAt = now()
  let state: BindingState = 'esperando'
  let retries = 0

  return {
    tick(canvasReady) {
      const waitedMs = now() - startedAt

      if (state === 'activo') {
        return { state, event: null, waitedMs, retries, nextDelayMs: 0 }
      }

      if (canvasReady) {
        const recovered = state === 'agotado'
        state = 'activo'
        return {
          state,
          event: recovered ? 'recovered' : 'started',
          waitedMs,
          retries,
          nextDelayMs: 0,
        }
      }

      let event: 'timeout' | null = null
      if (waitedMs > BIND_CONFIRM_TIMEOUT_MS && state !== 'agotado') {
        state = 'agotado'
        event = 'timeout'
      }

      retries += 1
      return {
        state,
        event,
        waitedMs,
        retries,
        nextDelayMs: state === 'agotado' ? BIND_RETRY_INTERVAL_MS : BIND_POLL_MS,
      }
    },

    state: () => state,
    retries: () => retries,
  }
}
