---
id: EXP-017
titulo: El thumbnail WebP salia borroso porque drawImage amplia el bitmap del tamano intrinseco del SVG
estado: activo
severidad: media
fecha_deteccion: 2026-08-21
fecha_cierre:
componentes: [src/utils/thumbnailUtils.ts, src/hooks/useExport.ts]
relacionados: [PLAN-012, MASTER-PLAN-018]
---

> **Estado: `activo`, y es deliberado.** La causa está corregida en el thumbnail
> (2026-08-21) y **sigue viva en la exportación a PNG y PDF** — el mismo
> mecanismo, otro fichero. Marcarlo `resuelto` porque un camino ya está bien es
> la misma trampa que confundir `mitigado` con `resuelto`. Ver *El mismo defecto
> sigue vivo en la exportación* al final.

# El thumbnail WebP salía borroso porque `drawImage` amplía el bitmap del tamaño intrínseco del SVG

## Síntoma

Tras pasar los thumbnails de SVG a WebP ([PLAN-012](../plans/todo/012-thumbnails-webp-y-entrega-segura.md) paso 1), las miniaturas se veían **borrosas en la tarjeta**. Y también **al abrir la imagen suelta en el navegador**, lo que descartaba que fuera un problema de cómo se mostraba: el defecto estaba en el fichero guardado.

Los diagramas **simples** eran los peores, que es lo contrario de lo que uno espera.

## Causa

Dos fallos encadenados, y el segundo sobrevivió al arreglo del primero.

### Primer fallo — la regla de las fotos sobre un origen vectorial

```ts
const scale = Math.min(1, maxWidth / w)   // "nunca ampliar"
```

Correcto para una foto, **erróneo para un SVG**: no hay resolución nativa que preservar. La `w` medida sale del `viewBox`, que está en **coordenadas de diagrama** de bpmn-js (una tarea son 100×80 unidades), así que el tamaño del ráster acabó dependiendo de *cuántos elementos tenía el diagrama* en vez de de cómo se iba a ver.

Se corrigió calculando el lienzo a partir de la caja de presentación (300×140 CSS × densidad 3 = 900×420 px). **Y siguió saliendo borroso.**

### Segundo fallo — el tamaño intrínseco del `<img>`

Aquí está la causa real:

```ts
const blob = new Blob([svg], ...)     // el SVG conserva width="250" height="150"
const img = new Image()               // ← tamano intrinseco: 250×150
img.src = URL.createObjectURL(blob)
// ...
ctx.drawImage(img, 0, 0, 900, 420)    // ← ESCALA un bitmap de 250×150
```

Un `<img>` con un SVG dentro tiene un **tamaño intrínseco**: el de sus atributos `width`/`height`. El navegador rasteriza el vector **una vez, a ese tamaño**, y guarda un bitmap. `drawImage(img, 0, 0, cw, ch)` **no re-rasteriza el vector**: reescala el bitmap que ya generó.

Es decir: agrandar el lienzo no agranda la rasterización. Sube la resolución del destino y deja la del origen intacta, y el resultado es una ampliación borrosa. Y como el `viewBox` de un diagrama simple es pequeño, **los simples eran los que más se ampliaban** — de ahí la inversión del síntoma.

## Solución

Reescribir el `width`/`height` **del propio SVG** al tamaño del ráster antes de cargarlo, conservando el `viewBox`:

```ts
export function sizeSvgForRaster(svg, box) {
  const { w, h } = parseSvgSize(svg)
  const scale = Math.min(box.width / w, box.height / h)   // contain
  const width = Math.max(1, Math.round(w * scale))
  const height = Math.max(1, Math.round(h * scale))
  const resized = svg.replace(/<svg\b[^>]*>/, (tag) => /* fija width y height */)
  return { svg: resized, width, height }
}
```

Con los atributos en píxeles, el navegador rasteriza el vector directamente a 900×420 y `drawImage` queda 1:1.

Dos detalles que importan:

- **El `viewBox` no se toca.** Es lo que mantiene el encuadre y lo que usa `anchorBackgroundRect` para anclar el fondo. Cambiarlo rompería el recorte al pool superior.
- **Solo se reescribe la etiqueta `<svg>` raíz.** El fondo inyectado es un `<rect width="100%" height="100%">`, y tocarlo lo dejaría fuera de sitio. Por eso el `replace` va sin la bandera `g`.

## Verificación

`src/utils/thumbnailUtils.webp.test.ts`, y la prueba que de verdad cierra el agujero es la de punta a punta:

```ts
// El SVG que recibe el navegador ya viene medido en pixeles
const texto = await blobCapturado.text()
expect(texto).toContain('width="700"')
expect(texto).not.toContain('width="250"')
```

**Las pruebas del lienzo no habrían detectado esto**: el lienzo *sí* tenía el tamaño correcto. El agujero estaba entre el lienzo y el origen, así que hay que afirmar sobre el contenido del `Blob` que se le entrega al `<img>`.

## Prevención

Esta corrección **parece redundante y alguien la va a querer quitar**: "si ya le paso el tamaño a `drawImage`, ¿para qué toco los atributos del SVG?". La respuesta es que `drawImage` escala un bitmap ya rasterizado, y quien lo borre volverá a introducir el borroso sin que ninguna prueba de tamaño de lienzo falle.

Regla general que deja este incidente: **al rasterizar un vector, el tamaño hay que fijarlo en el ORIGEN, no en el destino.** Vale igual para `canvas`, para `createImageBitmap` con `resizeWidth` y para cualquier `<img>` que lleve un SVG dentro.

## Alcance del daño

Ninguno en producción **en los thumbnails**: los 235 objetos del bucket seguían siendo SVG cuando se detectó. Sí afectó a los que la app generó **en el laboratorio** mientras el fallo estaba vivo; se rehacen con `node scripts/backfill-thumbs.mjs --apply --incluir-webp`.

En la exportación, ver abajo: ahí lleva afectando desde siempre.

---

## El mismo defecto sigue vivo en la exportación

Estudiado el 2026-08-22 a petición del usuario, **sin tocar el código**.

`src/hooks/useExport.ts:218`, `svgToDataUrl(svg, scale, bg, padding)`:

```ts
const { w, h } = parseSvgSize(svg)              // unidades de diagrama
const cw = Math.round((w + padding * 2) * scale)
const ch = Math.round((h + padding * 2) * scale)
canvas.width = cw; canvas.height = ch           // lienzo a escala ✓
// ...
const blob = new Blob([svg], ...)               // el SVG NO se toca ✗
const img = new Image()                         // intrinseco: w × h
img.onload = () => {
  ctx.drawImage(img, padding * scale, padding * scale, w * scale, h * scale)
  resolve(canvas.toDataURL('image/png'))
}
```

Es **exactamente** el patrón de arriba: lienzo a escala, origen sin escalar, `drawImage` ampliando. Consecuencias:

| Camino | Escala | Qué sale de verdad |
|---|---|---|
| PNG | 1× | **correcto** — es 1:1, no hay ampliación |
| PNG | 2× (por defecto en el modal) | ampliación 2× de un render 1× |
| PNG | 3× | ampliación 3× de un render 1× |
| PDF | 2× fija (`useExport.ts:313`) | ampliación 2× de un render 1× |
| **SVG** | — | **intacto**: no se rasteriza, sale vectorial y perfecto |

Es decir: **hoy elegir 3× en el modal de exportación no da más detalle que 1×, solo más píxeles y más peso.** Y el PDF, que es el formato que la gente imprime y comparte, va siempre por ese camino.

El arreglo sería el mismo de una línea —fijar `width`/`height` del SVG a `w*scale`/`h*scale` antes del `Blob`— pero hay que resolver un detalle de estructura: `thumbnailUtils` ya importa `getThemedSvg` de `useExport`, así que la primitiva compartida no puede vivir en ninguno de los dos sin crear un ciclo. Necesita un módulo neutro propio.

**No verificado empíricamente en la exportación**: la evidencia es que es el mismo código y el mismo mecanismo, y en el thumbnail el borroso era visible. Se comprueba exportando un PNG a 3× y ampliándolo: si el detalle no supera al de 1×, está confirmado.

Cosas que también salieron al leerlo, y no se han tocado:

- **`parseSvgSize` está duplicado** en `useExport.ts:207` y en `thumbnailUtils.ts`, con semánticas distintas: el de exportación ignora el `viewBox` y cae a 800×600 si faltan `width`/`height`; el del thumbnail prefiere el `viewBox` y devuelve 0. Dos comportamientos para la misma pregunta.
- **La exportación no supermuestrea, y no le hace falta.** Una vez que rasterice al tamaño correcto, un render vectorial a 2× ya trae su propio antialiasing. Supermuestrear ahí multiplicaría la memoria en diagramas grandes sin ganancia.
- El techo de escala es 3 (`PngScale = 1 | 2 | 3`), así que no hay riesgo de desbordar el lienzo máximo del navegador.
