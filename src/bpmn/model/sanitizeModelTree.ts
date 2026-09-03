/**
 * sanitizeModelTree.ts — repara el árbol del modelo para que el guardado nunca
 * se detenga por una pieza mal formada (EXP-022, PLAN-035).
 *
 * EL PROBLEMA QUE RESUELVE. Mientras se edita, el diagrama vive en memoria como
 * un árbol de objetos `moddle`. Cada uno lleva su descriptor —su "etiqueta"— en
 * el prototipo, y el serializer de moddle-xml lo lee para saber cómo escribirlo:
 *
 *     var elementDescriptor = element.$descriptor
 *     var isGeneric = elementDescriptor.isGeneric   // ← moddle-xml/writer.js
 *
 * Si en el árbol entra un objeto que NO nació de la factoría de moddle —un
 * objeto plano con un `$type` y sin descriptor— el serializer se detiene ahí y
 * `saveXML()` lanza `Cannot read properties of undefined (reading 'isGeneric')`.
 *
 * Y el guardado es **todo o nada**: una sola pieza mal formada entre cientos
 * correctas cancela el guardado completo del diagrama. Eso es lo que convirtió
 * un defecto pequeño en horas de trabajo irrecuperable el 2026-09-02.
 *
 * Los dos síntomas están medidos en `sanitizeModelTree.test.ts`, y son
 * distinguibles, que es lo que permite diagnosticar por el mensaje:
 *
 *   | qué hay en el árbol            | mensaje de saveXML             |
 *   |--------------------------------|--------------------------------|
 *   | objeto plano (con `$type`)     | reading 'isGeneric'            |
 *   | hueco (`undefined`)            | reading '$descriptor'          |
 *
 * QUÉ HACE. Recorre el árbol por las propiedades **contenidas** —las que el
 * serializer visita; las referencias se escriben por id y no se recorren— y por
 * cada nodo mal formado:
 *
 *   1. si su `$type` lo conoce el moddle, lo **reconstruye** como pieza real
 *      copiando los valores simples que la pieza aún lleva encima;
 *   2. si no, lo **quita**, porque una pieza que no se puede reconstruir no se
 *      puede escribir; y
 *   3. en los dos casos lo **cuenta y lo devuelve**.
 *
 * POR QUÉ REPARAR Y NO NEGARSE. La app ya tiene la regla contraria y sigue
 * vigente: si detecta coordenadas no finitas se NIEGA a guardar (ver
 * `useBpmnModeler.exportXml`), porque una vez se guardaron NaN y eso corrompió
 * un diagrama de verdad. La diferencia es la naturaleza del defecto: allí el
 * dato está mal y escribirlo hace daño; aquí el dato está bien y solo está mal
 * envuelto, así que se puede reenvolver sin inventar nada. **Las dos reglas
 * conviven y no se deben unificar.**
 *
 * POR QUÉ NUNCA EN SILENCIO. Un arreglo automático y mudo es exactamente cómo
 * un problema real se esconde durante un año. `sanitizeModelTree` no avisa por
 * su cuenta —es una función pura sobre el árbol— pero **devuelve el parte**, y
 * quien la llama tiene la obligación de registrarlo y de decírselo a quien está
 * trabajando. Ver `reportIncident('save.model_repaired')`.
 *
 * LÍMITE HONESTO. La reconstrucción conserva lo que el objeto plano todavía
 * lleva: sus valores simples. Lo que ese objeto hubiera perdido antes de llegar
 * aquí ya estaba perdido. Esto rescata el diagrama, no resucita el dato.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEl = any

/** Un nodo mal formado y qué se hizo con él. */
export interface SanitizeFinding {
  /** Ruta dentro del árbol, p. ej. `definitions/rootElements/flowElements[3]`. */
  path: string
  /** `$type` que declaraba el objeto, o `null` si no declaraba ninguno. */
  type: string | null
  /** Id que llevaba, si llevaba. */
  id: string | null
  /** `repaired` = reconstruido como pieza real · `removed` = no se pudo. */
  action: 'repaired' | 'removed'
}

export interface SanitizeReport {
  findings: SanitizeFinding[]
  repaired: number
  removed: number
  /** `true` si se tocó algo — la señal para reintentar el guardado. */
  changed: boolean
}

export const EMPTY_REPORT: SanitizeReport = {
  findings: [], repaired: 0, removed: 0, changed: false,
}

/**
 * Un nodo está mal formado si es un objeto y NO tiene descriptor. El descriptor
 * vive en el prototipo de cada tipo generado por la factoría, así que su
 * ausencia es prueba de que el objeto no salió de ahí.
 *
 * Los `undefined` dentro de una colección también cuentan: rompen el guardado
 * igual, solo con otro mensaje.
 */
function estaMalFormado(o: unknown): boolean {
  if (o === null || o === undefined) return true
  if (typeof o !== 'object') return false
  return !(o as AnyEl).$descriptor
}

/** Valores que se pueden trasladar tal cual a la pieza reconstruida. */
function propsSimples(o: AnyEl): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith('$')) continue
    const t = typeof v
    if (t === 'string' || t === 'number' || t === 'boolean') {
      out[k] = v as string | number | boolean
    }
  }
  return out
}

/**
 * Recorre el árbol de `definitions` y repara lo que encuentre mal formado.
 *
 * `moddle` es la factoría del modeler (`modeler.get('moddle')`). Se pasa en vez
 * de importarla para que esto sea probable sin arrancar bpmn-js entero, igual
 * que `elements/documentMeta.ts`.
 *
 * Es idempotente: llamarla dos veces sobre un árbol ya sano no cambia nada y
 * devuelve `changed: false`.
 */
export function sanitizeModelTree(moddle: AnyEl, definitions: AnyEl): SanitizeReport {
  const findings: SanitizeFinding[] = []
  if (!definitions || !definitions.$descriptor) {
    // Sin raíz sana no hay nada que recorrer: el árbol entero es irreparable
    // desde aquí y quien llama debe dejar que el error original salga.
    return { ...EMPTY_REPORT }
  }

  const visto = new Set<AnyEl>()

  /** Intenta reconstruir; devuelve la pieza nueva o `null` si no se puede. */
  function reconstruir(roto: AnyEl, parent: AnyEl): AnyEl | null {
    const tipo = roto && typeof roto === 'object' ? roto.$type : null
    if (!tipo || typeof tipo !== 'string') return null
    // `getTypeDescriptor` es la vía sin excepciones para preguntar si el moddle
    // conoce un tipo; `create` con un tipo desconocido lanzaría.
    let conocido = false
    try { conocido = !!moddle.getTypeDescriptor?.(tipo) } catch { conocido = false }
    if (!conocido) return null
    try {
      const nueva = moddle.create(tipo, propsSimples(roto))
      nueva.$parent = parent
      return nueva
    } catch {
      return null
    }
  }

  /** Sustituye o elimina `roto` dentro de la propiedad `prop` de `parent`. */
  function reemplazar(parent: AnyEl, prop: string, roto: AnyEl, ruta: string): void {
    const nueva = reconstruir(roto, parent)
    const actual = parent.get ? parent.get(prop) : parent[prop]
    const tipo = roto && typeof roto === 'object' ? (roto.$type ?? null) : null
    const id = roto && typeof roto === 'object' ? (roto.id ?? null) : null

    if (Array.isArray(actual)) {
      const i = actual.indexOf(roto)
      if (i < 0) return
      if (nueva) actual[i] = nueva
      else actual.splice(i, 1)
    } else {
      if (parent.set) parent.set(prop, nueva ?? undefined)
      else parent[prop] = nueva ?? undefined
    }

    findings.push({ path: ruta, type: tipo, id, action: nueva ? 'repaired' : 'removed' })
  }

  function walk(nodo: AnyEl, ruta: string): void {
    if (!nodo || typeof nodo !== 'object' || visto.has(nodo)) return
    visto.add(nodo)

    const props = nodo.$descriptor?.properties ?? []
    for (const p of props) {
      // Las referencias se serializan por id y el serializer no las recorre:
      // recorrerlas aquí solo daría falsos positivos y ciclos.
      if (p.isReference) continue

      const valor = nodo.get ? nodo.get(p.name) : nodo[p.name]

      if (Array.isArray(valor)) {
        // De atrás hacia delante: eliminar no desplaza lo que queda por mirar.
        for (let i = valor.length - 1; i >= 0; i--) {
          const hijo = valor[i]
          if (hijo !== null && typeof hijo === 'object' && !estaMalFormado(hijo)) {
            walk(hijo, `${ruta}/${p.name}[${i}]`)
          } else if (estaMalFormado(hijo)) {
            reemplazar(nodo, p.name, hijo, `${ruta}/${p.name}[${i}]`)
          }
        }
        continue
      }

      if (valor !== null && valor !== undefined && typeof valor === 'object') {
        if (estaMalFormado(valor)) reemplazar(nodo, p.name, valor, `${ruta}/${p.name}`)
        else walk(valor, `${ruta}/${p.name}`)
      }
    }
  }

  walk(definitions, 'definitions')

  const repaired = findings.filter((f) => f.action === 'repaired').length
  const removed = findings.filter((f) => f.action === 'removed').length
  return { findings, repaired, removed, changed: findings.length > 0 }
}

/**
 * Resumen de una línea para el registro de incidentes. **Sin nombres, sin
 * etiquetas, sin texto del dominio**: solo tipos e ids técnicos, que es la
 * regla de contenido de `utils/incidents.ts`.
 */
export function describeReport(r: SanitizeReport): string {
  return r.findings.map((f) => `${f.action}:${f.type ?? 'sin-tipo'}`).join(',')
}
