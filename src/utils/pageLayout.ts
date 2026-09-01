/**
 * Geometría de página para la exportación a documento (PLAN-034).
 *
 * Módulo puro: sin DOM, sin jsPDF, sin React. Lo usan la exportación, la Vista
 * Documento y el indicador de legibilidad, y por eso vive aparte — los tres
 * tienen que dar exactamente el mismo número o la previsualización mentiría.
 *
 * TODO LO DE AQUÍ ESTÁ MEDIDO, no estimado (2026-08-22, 177 diagramas de
 * producción y 235 SVG exportados):
 *
 * - La hoja de uso corriente en el destino es **Carta**, no A4. El estándar
 *   documental del que nace esto es Carta vertical con márgenes de 25.4 mm.
 * - Las etiquetas de bpmn-js son `font-size` **12** unidades de diagrama
 *   (3 854 apariciones en los SVG reales); pools y carriles usan 11.
 * - Los diagramas son anchos: proporción mediana **2.40:1**, y solo 5 de 177
 *   son más altos que anchos. Ninguna hoja estándar llega a esa proporción, así
 *   que **el ancho limita casi siempre**.
 * - Con Carta vertical y márgenes de 25.4 solo el 25 % queda legible y se
 *   desperdicia el 65 % del papel. Con Carta apaisada y márgenes de 12.7 sube
 *   al 49 %. De ahí los valores por defecto.
 */

/** 1 punto tipográfico en milímetros. */
export const MM_PER_POINT = 25.4 / 72

/**
 * Tamaño de la fuente de las etiquetas, en unidades de diagrama. Medido sobre
 * los SVG exportados reales, no supuesto.
 */
export const LABEL_FONT_UNITS = 12

export type PageSizeId = 'carta' | 'a4' | 'a3'
export type PageOrientation = 'portrait' | 'landscape'

export interface PageSize {
  id: PageSizeId
  /** Nombre corto para la UI; la traducción va en i18n, esto es el respaldo. */
  label: string
  /** Lado corto y lado largo, en mm. */
  short: number
  long: number
}

export const PAGE_SIZES: Record<PageSizeId, PageSize> = {
  carta: { id: 'carta', label: 'Carta', short: 215.9, long: 279.4 },
  a4: { id: 'a4', label: 'A4', short: 210, long: 297 },
  a3: { id: 'a3', label: 'A3', short: 297, long: 420 },
}

export interface PageSpec {
  size: PageSizeId
  orientation: PageOrientation
  /**
   * El diagrama se dibuja girado 90° dentro de la página. El **documento sigue
   * teniendo la orientación de `orientation`** — solo el dibujo va de lado, y
   * el lector gira el papel. Es lo que hace la documentación normativa con
   * planos anchos, y sube lo legible del 25 % al 35 % sin romper un estándar
   * que exija hoja vertical.
   */
  rotateDiagram: boolean
  /** Margen de la zona de dibujo, en mm. */
  margin: number
  /** Alto reservado arriba para la cabecera, en mm. 0 si no hay cabecera. */
  headerHeight: number
}

/**
 * Carta apaisada con márgenes reducidos: lo medido dice que es lo que más
 * diagramas deja legibles (49 % frente al 25 % de Carta vertical a 25.4 mm).
 */
export const DEFAULT_PAGE_SPEC: PageSpec = {
  size: 'carta',
  orientation: 'landscape',
  rotateDiagram: false,
  margin: 12.7,
  headerHeight: 0,
}

/** Ancho y alto de la hoja, en mm, ya con la orientación aplicada. */
export function pageDimensions(spec: PageSpec): { width: number; height: number } {
  const s = PAGE_SIZES[spec.size]
  return spec.orientation === 'landscape'
    ? { width: s.long, height: s.short }
    : { width: s.short, height: s.long }
}

/**
 * Zona útil para el dibujo, en mm, **con el giro ya aplicado**.
 *
 * La cabecera no gira: se descuenta siempre del alto de la hoja. Lo que se
 * intercambia al girar son los ejes del dibujo dentro de lo que queda.
 */
export function drawingArea(spec: PageSpec): { width: number; height: number } {
  const { width, height } = pageDimensions(spec)
  const w = Math.max(1, width - spec.margin * 2)
  const h = Math.max(1, height - spec.margin * 2 - spec.headerHeight)
  return spec.rotateDiagram ? { width: h, height: w } : { width: w, height: h }
}

/**
 * Escala de encaje en **mm por unidad de diagrama**, con semántica `contain`:
 * el eje que primero toca el borde manda. Devuelve 0 si el diagrama es
 * degenerado, para que el llamador no divida por cero.
 */
export function fitScale(spec: PageSpec, diagramWidth: number, diagramHeight: number): number {
  if (!(diagramWidth > 0) || !(diagramHeight > 0)) return 0
  const area = drawingArea(spec)
  return Math.min(area.width / diagramWidth, area.height / diagramHeight)
}

/** Tamaño en PUNTOS al que queda una etiqueta con esa escala. */
export function labelPointSize(scale: number): number {
  return (LABEL_FONT_UNITS * scale) / MM_PER_POINT
}

export type Legibility = 'comoda' | 'limite' | 'dificil' | 'ilegible'

/**
 * Veredicto **a tamaño natural, sobre papel**. En un PDF vectorial visto en
 * pantalla, `dificil` e incluso `ilegible` siguen siendo utilizables ampliando:
 * quien consuma esto debe decir *"a tamaño natural son N pt"*, no *"no se lee"*.
 */
export function legibility(pointSize: number): Legibility {
  if (pointSize >= 8) return 'comoda'
  if (pointSize >= 6) return 'limite'
  if (pointSize >= 4) return 'dificil'
  return 'ilegible'
}

/**
 * Proporción que necesitaría la hoja para no desperdiciar papel con este
 * diagrama, y la que ofrece la elegida. Alimenta el mensaje honesto de la Vista
 * Documento: *"necesita 3.3:1; esta hoja da 1.60"*.
 */
export function aspectComparison(
  spec: PageSpec,
  diagramWidth: number,
  diagramHeight: number
): { needed: number; offered: number } {
  const area = drawingArea(spec)
  return {
    needed: diagramHeight > 0 ? diagramWidth / diagramHeight : 0,
    offered: area.height > 0 ? area.width / area.height : 0,
  }
}

/**
 * Rectángulo donde cae el diagrama dentro de la hoja, en mm y en coordenadas de
 * página (origen arriba-izquierda), centrado en la zona útil.
 *
 * Con `rotateDiagram`, `width`/`height` son los del dibujo **ya girado**, es
 * decir lo que ocupa en la hoja; quien dibuje debe aplicar la rotación de −90°
 * alrededor del centro del rectángulo.
 */
export function placement(
  spec: PageSpec,
  diagramWidth: number,
  diagramHeight: number
): { x: number; y: number; width: number; height: number; scale: number } {
  const scale = fitScale(spec, diagramWidth, diagramHeight)
  const page = pageDimensions(spec)
  // Tamaño en la hoja: si va girado, el ancho del diagrama ocupa alto y al revés.
  const drawnW = (spec.rotateDiagram ? diagramHeight : diagramWidth) * scale
  const drawnH = (spec.rotateDiagram ? diagramWidth : diagramHeight) * scale
  const bandTop = spec.margin + spec.headerHeight
  const bandH = Math.max(0, page.height - bandTop - spec.margin)
  const bandW = Math.max(0, page.width - spec.margin * 2)
  return {
    x: spec.margin + (bandW - drawnW) / 2,
    y: bandTop + (bandH - drawnH) / 2,
    width: drawnW,
    height: drawnH,
    scale,
  }
}
