---
id: EXP-021
titulo: La cabecera en el lienzo se solapa con el diagrama, y el PDF nunca lo hace
estado: activo
severidad: media
fecha_deteccion: 2026-08-28
fecha_cierre: null
componentes: [src/bpmn/canvas/DocumentFrameModule.ts, src/index.css, src/utils/pageLayout.ts]
relacionados: [PLAN-034, EXP-017, EXP-019]
---

# La cabecera en el lienzo se solapa con el diagrama, y el PDF nunca lo hace

> **Causa identificada, arreglo diseñado, sin implementar.** Se dejó documentado
> a propósito el 2026-09-01 para desplegar antes lo que ya estaba probado. Este
> documento existe para que el arreglo no se pierda: está entero aquí, con lo que
> hay que tocar y las pruebas que hay que reescribir.

## Síntoma

Con **Ver → Cabecera de documento** encendida, si el contenido del diagrama
empieza cerca del borde superior del lienzo —recién creado, o porque alguien lo
subió—, la banda de la cabecera **se dibuja encima de los elementos**. Se ve
translúcida, así que no los esconde del todo, pero ni la cabecera ni las tareas
que hay debajo se leen bien.

Reportado con captura el 2026-08-28: la fila superior de tareas y el texto
«Código / Fecha / Estado / Elaboró» ocupando el mismo sitio.

## Es deliberado, y está probado

No es una regresión. `DocumentFrameModule.ts:166`:

```ts
const y = Math.max(0, contenido.y - h - GAP)
```

El `Math.max(0, …)` impide que la banda suba por encima del origen del lienzo.
Si no cabe, se apoya en `y = 0` y se marca `.is-overlapping`, que en CSS es un
fondo blanco al 72 %:

```css
.doc-frame__band.is-overlapping { background: color-mix(in srgb, #ffffff 72%, transparent); }
```

Hay prueba que lo fija (`DocumentFrameModule.test.ts`), y su comentario dice que
**es el caso frecuente, no el raro** — con un diagrama ancho la banda mide más
que el aire que suele haber sobre el contenido, porque su alto escala con el
ancho del dibujo.

El documento del módulo lo justifica así: *«Preferible a moverle los elementos al
usuario por decisión nuestra»*.

## Por qué hay que cambiarlo igual

**El PDF nunca solapa.** `pageLayout.ts:165` reserva el hueco y baja el diagrama:

```ts
const bandTop = spec.margin + spec.headerHeight
const bandH   = Math.max(0, page.height - bandTop - spec.margin)
```

Así que el lienzo enseña una composición que la exportación **no puede
producir**. Es la regla que este proyecto aplica en todas partes —la
previsualización no miente— rota en el único sitio donde la cabecera se mira
mientras se trabaja.

Y el dilema del comentario es falso. Se planteó como binario: solapar, o moverle
los elementos al usuario. Hay una tercera opción que no hace ninguna de las dos.

## El arreglo, en dos partes

### 1 · Quitar el clamp

```ts
const y = contenido.y - h - GAP   // sin Math.max
```

bpmn-js acepta coordenadas negativas sin problema: el viewbox no tiene origen
duro y los elementos pueden vivir en negativo. La banda queda **siempre encima**
del contenido, no tapa nada, no mueve nada, y coincide con el PDF.

Con ello mueren:

- la clase `is-overlapping` y su cálculo (`DocumentFrameModule.ts:183`),
- su regla en `index.css` (~línea 2728),
- y la translucencia, que solo existía para paliar el solape.

### 2 · Revelarla al encenderla

**Es el problema que abre la parte 1, y por eso no es opcional.** Si el contenido
está pegado al borde superior del viewport, la banda cae fuera y el culling
(`DocumentFrameModule.ts:177`) no la dibuja: se enciende «Ver → Cabecera» y no se
ve nada. Cambiar un solape confuso por una ausencia confusa no es progreso.

Bandera `_revelar` que pone `setVisible(true)` y consume `_render`. Si la banda
queda por encima del viewport:

```ts
if (sy < 0) this._canvas.scroll({ dx: 0, dy: -sy + 12 })
```

`canvas.scroll` de diagram-js, en píxeles de pantalla.

Dos condiciones que no se pueden saltar:

- **Solo al encender**, nunca en cada repintado. Si no, pelearía con el paneo
  del usuario cada vez que se acerque al borde.
- **La bandera se limpia antes de desplazar.** `canvas.scroll` dispara
  `canvas.viewbox.changed`, que vuelve a llamar a `_schedule` → `_render`; sin
  limpiarla primero, se realimenta.

El salto es real y por eso hay que acompañarlo: `h` escala con el ancho del
contenido (`h = (alto / REFERENCE_BAND_MM) × contenido.width`), así que un
diagrama de 3 000 unidades da una banda de ~212 y la vista se mueve bastante.

## Qué hay que tocar

| Fichero | Qué |
|---|---|
| `src/bpmn/canvas/DocumentFrameModule.ts` | quitar el clamp; quitar `is-overlapping`; añadir `_revelar` + `canvas.scroll`; corregir el doc del módulo (líneas 29-31, que describen el comportamiento viejo) |
| `src/index.css` | borrar la regla `.doc-frame__band.is-overlapping` |
| `src/bpmn/canvas/DocumentFrameModule.test.ts` | **la prueba `'sin sitio arriba, se apoya en el origen y avisa de que solapa'` afirma hoy justo lo contrario del arreglo.** Se reescribe: la banda queda **encima** (`top` negativo) y **sin** clase de solape. Añadir una que fije que revelar solo ocurre al encender, no en cada repintado |

## Prevención

**Un comentario que dice «preferible a la alternativa» tiene que nombrar las dos
alternativas de verdad.** Aquí se compararon solapar y mover elementos del
usuario, y se eligió bien entre esas dos — pero la tercera, que no hace ninguna
de las dos cosas, no estaba en la lista. La señal es un `Math.max(0, …)` sobre
una coordenada de lienzo: **el lienzo no tiene origen**, y tratarlo como si lo
tuviera se paga en otro sitio.

**Cualquier vista que diga representar la exportación se compara con la
aritmética de la exportación, no con la intuición.** `placement()` y
`documentHeaderHeight()` ya decían que el solape es imposible en la hoja. Bastaba
leerlas. Es la misma lección de EXP-020 con la proporción del logo, y de EXP-017
con la resolución: **el píxel que se ve en pantalla no prueba el píxel que se
escribe en el archivo.**
