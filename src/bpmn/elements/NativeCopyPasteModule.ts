/**
 * NativeCopyPasteModule.ts — copiar y pegar por el portapapeles del sistema,
 * con los tres agujeros de `bpmn-js-native-copy-paste` cerrados (PLAN-035).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO EN VEZ DE LA DEPENDENCIA. El módulo original hace
 * lo correcto en lo grande: mete la selección en el portapapeles del sistema
 * como texto, así que se puede pegar entre pestañas y entre navegadores. Pero el
 * portapapeles solo guarda TEXTO, y una pieza de moddle no es texto: lo que
 * viaja es una descripción, y al pegar hay que volver a fabricar cada pieza.
 *
 * Ese traductor de vuelta tenía tres agujeros. Los tres están medidos en
 * `nativeCopyPaste.test.ts`, que además **afirma el comportamiento roto de la
 * librería** para que se note si algún día lo arreglan y esto sobra:
 *
 *  1. **Tipo desconocido → descartado en silencio.** Devolvía `undefined` sin
 *     avisar a nadie. Un elemento desaparecía del pegado y nadie se enteraba.
 *
 *  2. **Lo que no parecía una pieza pasaba tal cual.** Un objeto plano con un
 *     `$type` entraba al modelo sin descriptor, y ahí se queda: inofensivo en
 *     pantalla, letal al guardar. `saveXML` es todo o nada, así que una sola
 *     pieza así cancela el guardado COMPLETO del diagrama, para siempre, hasta
 *     que alguien la quite. Ver EXP-022.
 *
 *  3. **`$attrs` no viajaba.** Los atributos que moddle no reconoce como
 *     propiedad de un tipo se guardan en `$attrs`, que **no es enumerable** y
 *     por tanto `JSON.stringify` lo ignora. Consecuencia real, no teórica:
 *     copiar un objeto de datos con imágenes vinculadas perdía el vínculo,
 *     porque `flujo:linkedImages` cuelga de `bpmn:FlowNode` y un
 *     `bpmn:DataObjectReference` no es un FlowNode — así que ahí vivía en
 *     `$attrs`. Pasaba **siempre**, y en silencio.
 *
 * EL INVARIANTE QUE ESTE MÓDULO SOSTIENE. Del pegado no sale nunca un objeto sin
 * descriptor. Se cumple por dos vías a propósito redundantes: el traductor
 * fabrica bien, y luego una pasada de comprobación barre lo que quede. La
 * segunda no debería encontrar nada; existe porque el coste de que encuentre
 * algo y no lo barra es perder un diagrama entero.
 *
 * NO sustituye al saneo del guardado (`model/sanitizeModelTree.ts`). Este cierra
 * la vía que conocemos; aquel protege de las que no.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

/** Prioridad del original: por encima del copyPaste propio de bpmn-js. */
const HIGHER_PRIORITY = 2050

/** Marca del contenido propio en el portapapeles. Igual que la del original. */
const PREFIX = 'bpmn-js-clip----'

/**
 * Clave con la que los atributos sueltos viajan por el portapapeles. Lleva `$`
 * doble para no colisionar nunca con una propiedad de BPMN ni con `$attrs`.
 */
const LOOSE_ATTRS = '$$attrs'

function esObjeto(v: unknown): v is AnyObj {
  return typeof v === 'object' && v !== null
}

/**
 * Al escribir en el portapapeles: añade los atributos sueltos, que de otro modo
 * se quedan por el camino porque `$attrs` no es enumerable.
 */
function replacer(_clave: string, valor: unknown): unknown {
  if (esObjeto(valor) && typeof valor.$type === 'string') {
    const attrs = valor.$attrs
    if (esObjeto(attrs) && Object.keys(attrs).length > 0) {
      return { ...valor, [LOOSE_ATTRS]: { ...attrs } }
    }
  }
  return valor
}

export interface CopyPasteIssue {
  kind: 'unknown-type' | 'unlabeled-dropped'
  type: string | null
}

/**
 * Al leer del portapapeles: vuelve a fabricar cada pieza con la factoría de
 * moddle, restaurando los atributos sueltos.
 *
 * Las piezas con id se reutilizan, porque la misma aparece varias veces en el
 * texto —bpmn-js enlaza la parte visual con la semántica— y tienen que volver a
 * ser el MISMO objeto, no dos copias.
 */
export function createSafeReviver(
  moddle: AnyObj,
  onIssue: (i: CopyPasteIssue) => void
): (clave: string, valor: unknown) => unknown {
  const cache: Record<string, AnyObj> = {}

  return function (_clave: string, valor: unknown): unknown {
    if (!esObjeto(valor) || typeof valor.$type !== 'string') return valor

    const id = typeof valor.id === 'string' ? valor.id : null
    if (id && cache[id]) return cache[id]

    const tipo: string = valor.$type
    let conocido = false
    try { conocido = !!moddle.getTypeDescriptor?.(tipo) } catch { conocido = false }

    if (!conocido) {
      // Se sigue descartando —una pieza que el modelo no conoce no se puede
      // fabricar— pero ya no en silencio.
      onIssue({ kind: 'unknown-type', type: tipo })
      return undefined
    }

    const attrs: AnyObj = { ...valor }
    delete attrs.$type
    const sueltos = attrs[LOOSE_ATTRS]
    delete attrs[LOOSE_ATTRS]

    let el: AnyObj
    try {
      el = moddle.create(tipo, attrs)
    } catch {
      onIssue({ kind: 'unknown-type', type: tipo })
      return undefined
    }

    if (esObjeto(sueltos)) {
      for (const [k, v] of Object.entries(sueltos)) {
        try {
          if (typeof el.set === 'function') el.set(k, v)
          else el.$attrs[k] = v
        } catch { /* un atributo suelto irrecuperable no tumba el pegado */ }
      }
    }

    if (id) cache[id] = el
    return el
  }
}

/**
 * Barrido final: quita del árbol pegado cualquier objeto que declare un `$type`
 * y no tenga descriptor. Es la red del invariante — si el traductor hizo su
 * trabajo, no encuentra nada.
 */
export function dropUnlabeled(raiz: unknown, onIssue: (i: CopyPasteIssue) => void): void {
  const visto = new Set<AnyObj>()

  function walk(nodo: unknown): void {
    if (!esObjeto(nodo) || visto.has(nodo)) return
    visto.add(nodo)

    if (Array.isArray(nodo)) {
      for (let i = nodo.length - 1; i >= 0; i--) {
        const hijo = nodo[i]
        if (esObjeto(hijo) && typeof hijo.$type === 'string' && !hijo.$descriptor) {
          onIssue({ kind: 'unlabeled-dropped', type: hijo.$type })
          nodo.splice(i, 1)
          continue
        }
        walk(hijo)
      }
      return
    }

    for (const k of Object.keys(nodo)) {
      const hijo = nodo[k]
      if (esObjeto(hijo) && typeof hijo.$type === 'string' && !hijo.$descriptor) {
        onIssue({ kind: 'unlabeled-dropped', type: hijo.$type })
        delete nodo[k]
        continue
      }
      walk(hijo)
    }
  }

  walk(raiz)
}

/** Serializa el árbol de la copia para el portapapeles. */
export function serializeTree(tree: unknown): string {
  return PREFIX + JSON.stringify(tree, replacer)
}

/**
 * Reconstruye el árbol desde el texto del portapapeles, o `null` si el texto no
 * es contenido nuestro.
 */
export function deserializeTree(
  texto: string | null | undefined,
  moddle: AnyObj,
  onIssue: (i: CopyPasteIssue) => void
): AnyObj | null {
  if (!texto || !texto.startsWith(PREFIX)) return null
  const tree = JSON.parse(texto.substring(PREFIX.length), createSafeReviver(moddle, onIssue))
  dropUnlabeled(tree, onIssue)
  return tree
}

/**
 * @param eventBus  bus de diagram-js
 * @param copyPaste el copyPaste propio de bpmn-js, al que se delega
 * @param moddle    la factoría, para volver a fabricar al pegar
 */
export function NativeCopyPaste(this: AnyObj, eventBus: AnyObj, copyPaste: AnyObj, moddle: AnyObj) {
  const issues: CopyPasteIssue[] = []
  const onIssue = (i: CopyPasteIssue) => {
    issues.push(i)
    console.warn('[copiar-pegar]', i.kind, i.type ?? '')
  }

  const handleCopied = (context: AnyObj) => {
    if (context.hints?.clip === false) return
    navigator.clipboard.writeText(serializeTree(context.tree)).catch((err) => {
      console.error('[copiar-pegar] no se pudo escribir en el portapapeles', err)
      eventBus.fire('flujo-copy-paste:error', { message: 'clipboard-write', error: err })
    })
    // Corta la integración de portapapeles de más abajo: ya lo llevamos nosotros.
    context.hints.clip = false
  }

  const handlePaste = (context: AnyObj) => {
    if (context.tree) return

    const copia = { ...context }

    navigator.clipboard.readText().then((texto) => {
      issues.length = 0
      let tree: AnyObj | null = null
      try {
        tree = deserializeTree(texto, moddle, onIssue)
      } catch (err) {
        console.error('[copiar-pegar] contenido del portapapeles ilegible', err)
        eventBus.fire('flujo-copy-paste:error', { message: 'clipboard-parse', error: err })
        return
      }
      if (!tree) return

      copyPaste.paste({ ...copia, tree })

      if (issues.length > 0) {
        eventBus.fire('flujo-copy-paste:issues', { issues: [...issues] })
      }
    }).catch((err) => {
      console.error('[copiar-pegar] no se pudo leer el portapapeles', err)
      eventBus.fire('flujo-copy-paste:error', { message: 'clipboard-read', error: err })
    })

    // Detiene este primer intento; el de verdad va en el `then` de arriba.
    return false
  }

  // Solo si el navegador tiene portapapeles asíncrono. En jsdom no lo hay, así
  // que en las pruebas este módulo queda inerte y la vuelta se hace a mano
  // llamando a `serializeTree` / `deserializeTree`.
  if (typeof navigator !== 'undefined' && typeof navigator.clipboard !== 'undefined') {
    eventBus.on('copyPaste.elementsCopied', HIGHER_PRIORITY, handleCopied)
    eventBus.on('copyPaste.pasteElements', HIGHER_PRIORITY, handlePaste)
  }
}

NativeCopyPaste.$inject = ['eventBus', 'copyPaste', 'moddle']

export default {
  __init__: ['flujoNativeCopyPaste'],
  flujoNativeCopyPaste: ['type', NativeCopyPaste],
}
