/**
 * Nombres de los campos de la cabecera de documento, traducidos.
 *
 * Viven aparte de `utils/iso7200.ts` a propósito: ese módulo declara **qué**
 * campos existen y de dónde vienen normativamente, y no debe depender del
 * idioma. Aquí está la única capa que sabe traducir, y es la que se inyecta en
 * `resolveDocumentHeader` para que el dibujado del PDF reciba las etiquetas ya
 * resueltas sin importar i18next.
 *
 * DOS NOMBRES POR CAMPO, y no es redundancia:
 *
 * - `fieldName` es como lo llama ISO 7200 — *«Nº de identificación»*. Es el que
 *   se ve al configurar, donde importa reconocer el campo de la norma.
 * - `fieldShort` es el que **cabe dentro del recuadro dibujado** — *«Código»*.
 *   Un rótulo de 20 caracteres en una celda de 50 mm se come el valor.
 */
import i18n from '@/i18n'
import type { DocumentMetaField } from '@/bpmn/elements/documentMeta'

/** Nombre del campo según ISO 7200. Para configurar. */
export function fieldName(field: DocumentMetaField): string {
  return i18n.t(`iso7200.fields.${field}`)
}

/** Etiqueta corta, la que se dibuja dentro de la cabecera. */
export function fieldShort(field: DocumentMetaField): string {
  return i18n.t(`iso7200.short.${field}`)
}

/**
 * Estado del documento, traducido. Se guarda el identificador —`released`— y no
 * el texto: cambiar de idioma no puede cambiar el dato.
 */
export function statusName(value: string): string {
  return value ? i18n.t(`iso7200.status.${value}`) : ''
}
