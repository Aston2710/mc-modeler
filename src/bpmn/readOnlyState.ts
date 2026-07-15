/**
 * Estado read-only del canvas bpmn-js — puente entre React (que conoce el rol
 * del usuario vía collabStore) y los módulos de bpmn-js (que no pueden leer
 * Zustand directamente y se instancian una sola vez).
 *
 * Un viewer (rol 'viewer' en diagram_collaborators / project_collaborators) NO
 * puede modificar el diagrama de ninguna forma; solo leer y comentar. La BD ya
 * lo impide server-side (RLS: diagrams_update → can_edit_diagram excluye viewer).
 * Este flag aplica el mismo bloqueo en el cliente:
 *   - ReadOnlyModule veta toda mutación del canvas (mover/crear/borrar/editar).
 *   - useCollab deja de transmitir cambios locales (modo recibir-solo).
 *   - La UI (paleta, propiedades, toolbar) se muestra deshabilitada.
 *
 * React llama setBpmnReadOnly() cuando cambia el rol o la pestaña activa.
 */

let readOnly = false
const listeners = new Set<(v: boolean) => void>()

export function setBpmnReadOnly(value: boolean): void {
  if (value === readOnly) return
  readOnly = value
  for (const l of listeners) {
    try { l(value) } catch { /* noop */ }
  }
}

export function isBpmnReadOnly(): boolean {
  return readOnly
}

/** Suscribe a cambios del flag; devuelve función para desuscribir. */
export function onReadOnlyChange(listener: (v: boolean) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
