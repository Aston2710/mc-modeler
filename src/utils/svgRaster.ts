/**
 * Primitiva compartida para rasterizar SVG con nitidez real (EXP-017).
 *
 * Vive en su propio módulo porque la necesitan `utils/thumbnailUtils.ts` y
 * `hooks/useExport.ts`, y el primero ya importa `getThemedSvg` del segundo:
 * ponerla en cualquiera de los dos crearía un ciclo.
 *
 * EL PROBLEMA QUE RESUELVE. Un `<img>` con un SVG dentro tiene un **tamaño
 * intrínseco**: el de sus atributos `width`/`height`. El navegador rasteriza el
 * vector **una sola vez, a ese tamaño**, y guarda un bitmap. `drawImage(img, x,
 * y, w, h)` **no re-rasteriza el vector**: reescala el bitmap que ya generó.
 *
 * Por eso agrandar el lienzo no basta. El SVG que sale de bpmn-js viene medido
 * en coordenadas de diagrama, así que dibujarlo más grande producía una
 * ampliación borrosa en vez de un render de más resolución. **El tamaño hay que
 * fijarlo en el ORIGEN, no en el destino.**
 */

/**
 * Fija el `width`/`height` de la etiqueta `<svg>` **raíz**, en píxeles, sin
 * tocar el `viewBox` ni nada de dentro.
 *
 * El `viewBox` se conserva a propósito: es lo que mantiene el encuadre, y de él
 * dependen el recorte al pool superior y el anclaje del rect de fondo.
 *
 * `replace` con una regex sin la bandera `g` sustituye solo la primera
 * ocurrencia, que es la etiqueta de apertura. También deliberado: el fondo que
 * inyecta `injectThemeIntoSvg` es un `<rect width="100%" height="100%">` y
 * reescribirlo lo dejaría fuera de sitio.
 */
export function setSvgPixelSize(svg: string, width: number, height: number): string {
  return svg.replace(/<svg\b[^>]*>/, (tag) => {
    let out = tag
    out = /\bwidth="[^"]*"/.test(out)
      ? out.replace(/\bwidth="[^"]*"/, `width="${width}"`)
      : out.replace(/<svg\b/, `<svg width="${width}"`)
    out = /\bheight="[^"]*"/.test(out)
      ? out.replace(/\bheight="[^"]*"/, `height="${height}"`)
      : out.replace(/<svg\b/, `<svg height="${height}"`)
    return out
  })
}
