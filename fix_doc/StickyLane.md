# StickyLaneLabels — Documentación técnica

## Qué es

Feature estilo Bizagi: cuando el usuario hace scroll horizontal y la columna de etiquetas de pool/lane desaparece por la izquierda, un overlay HTML la ancla al borde izquierdo del viewport. El diagrama sigue siendo interactivo; el overlay es decorativo (`pointer-events: none`).

## Archivo

`src/bpmn/canvas/StickyLaneLabelsModule.ts`

Registrado en `src/bpmn/config.ts` como módulo adicional de bpmn-js:
```ts
import StickyLaneLabelsModule from './canvas/StickyLaneLabelsModule'
// ...
additionalModules: [
  // ...
  StickyLaneLabelsModule,
]
```

---

## Arquitectura

### Overlay HTML

Al evento `canvas.init`, se inserta un `<div>` hermano del SVG de bpmn-js dentro del contenedor del canvas:

```
.djs-container
  ├── <svg>          ← bpmn-js (z-index base)
  └── <div data-sticky-labels>  ← nuestro overlay (z-index:2)
```

El overlay es `position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; pointer-events:none`.

En cada `canvas.viewbox.changed` (via RAF batching), se destruye y reconstruye el contenido del overlay con `innerHTML = ''` + append de divs.

### Por qué HTML y no SVG

bpmn-js expone `canvas.getLayer()` pero devuelve un elemento SVG — los textos SVG no soportan `text-overflow:ellipsis`. El servicio `Overlays` de bpmn-js ancla elementos HTML a coordenadas de diagrama (se mueven con el pan/zoom), no al viewport. El enfoque HTML overlay con recálculo en `viewbox.changed` es el único que permite etiquetas fijas al viewport con truncado de texto nativo.

---

## Layout de columnas

```
x=0          x=30px       x=60px
|  pool label |  lane label |  → SVG lane content
|   (pool-fill)|  (lane-fill)|
```

Estos 30px por columna replican la constante `POOL_LABEL_W = 30` de bpmn-js.

---

## Cuándo se activa

Solo cuando `poolScrX < 0` (la esquina izquierda del pool está fuera de pantalla). También se salta si `poolRightScrX < poolLabelScrW + 4` (pool demasiado pequeño para mostrar las etiquetas).

---

## Cálculo de coordenadas

```ts
const poolScrYTop = Math.round((pool.y - vb.y) * s)
const poolScrYBot = Math.round((pool.y + pool.height - vb.y) * s)
```

Clave: calcular `top` y `bottom` por separado con `Math.round`, luego `h = bot - top`. Esto garantiza que el borde inferior del div caiga en el mismo pixel que el separador SVG. Si se usara `h = Math.round(height * s)`, el redondeo independiente puede desfasar 1px y el fondo del div tapa la línea SVG.

---

## Bordes y colores

Todos los bordes son `1.5px solid var(--pool-stroke)` — coincide exactamente con `PARTICIPANT_STROKE_WIDTH = 1.5` de bpmn-js.

Colores de fondo:
- Pool label div: `var(--pool-fill)`
- Lane label divs: `var(--lane-fill)`

Definidos en `src/index.css` y usados también por `ThemeColors.ts` para el renderer SVG → mismo valor en HTML y SVG.

### Lógica de bordes por elemento

**Pool div (x=0–30px):**
- `leftBorder`: siempre (borde exterior izquierdo del pool)
- `rightBorder`: siempre (separador pool↔lane)
- `topBorder`: solo si `poolScrYTop >= 0` (borde superior visible en viewport)
- `bottomBorder`: solo si `poolScrYBot <= cH` (borde inferior visible en viewport)

**Lane divs (x=30–60px):**
- `rightBorder`: siempre (separador lane↔contenido)
- `topBorder`: solo en el **primer** lane (`laneScrYTop === poolScrYTop`) y `poolScrYTop >= 0`
- `bottomBorder`:
  - Último lane (`laneScrYBot === poolScrYBot`): solo si `poolScrYBot <= cH` (borde inferior del pool)
  - Resto de lanes: siempre (separador horizontal entre lanes)

#### Por qué topBorder en el primer lane

Sin este borde, el div del primer lane (background opaco `--lane-fill`) tapa el borde superior SVG del pool en el rango x=30–60px. El borde superior aparece en x=0–30px (pool div) y x=60px+ (SVG), pero tiene un **hueco** en x=30–60px → efecto "tarjeta" flotante. Con `topBorder` en el primer lane, el borde es continuo de x=0 a x=60px.

---

## Texto

```ts
span.style.cssText = [
  'position:absolute',
  'top:50%', 'left:50%',
  `max-width:${maxTextW}px`,
  'transform:translate(-50%,-50%) rotate(-90deg)',
  'white-space:nowrap', 'overflow:hidden', 'text-overflow:ellipsis',
  ...
].join(';')
```

`position:absolute` + `top/left:50%` + `transform:translate(-50%,-50%)` es el patrón correcto para centrar texto rotado sin que el contenedor flex/block restrinja el ancho del span a los 30px del div padre.

---

## Compromiso estructural (limitación inherente)

El overlay es una reconstrucción visual de la columna de etiquetas, no un movimiento real de elementos SVG. Esto implica:

1. **Separadores verticales desfasados**: En modo sticky (pool scrolleado 100px a la izquierda con s=1), los separadores SVG naturales están a x=–70px y x=–40px en pantalla (fuera del viewport). El overlay los redibuja a x=30px y x=60px del viewport. No coinciden con nada del SVG visible.

2. **Doble línea en separadores**: Si el pool NO ha scrolleado lo suficiente (0 < |naturalPoolX| < 30px), el SVG aún muestra la columna de etiquetas parcialmente. El overlay NO se activa en este rango (`if (poolScrX >= 0) return`), por lo que no hay doble render.

3. **Sin sincronización de selección/hover**: Si el usuario selecciona un lane en bpmn-js, el resaltado SVG no se replica en el overlay HTML. No es un bug — el overlay es solo decorativo.

4. **Los bordes del overlay no se alinean con el SVG cuando el pool scrollea poco**: Para un pool scrolleado apenas –1px, el separador SVG está a x=29px y el overlay lo pinta a x=30px. Diferencia de 1px. Irrelevante en práctica.

No hay solución perfecta a estos compromisos sin mover los elementos dentro del SVG de bpmn-js (lo cual requeriría hooks privados que no expone la API pública).

---

## Historial de bugs resueltos

| Bug | Causa | Fix |
|-----|-------|-----|
| Labels invisibles al scrollear sustancialmente | `poolLabelW = max(0, poolSepX)` → se vuelve 0 cuando poolScrX < –30px | Usar ancho fijo `Math.round(POOL_LABEL_W * s)` |
| Texto truncado ("ac..." en lugar de "actor 1") | Span como flex-item del div de 30px → constrainted a 30px | `position:absolute; top:50%; left:50%; transform:translate(-50%,-50%)` |
| Doble línea en separador de lanes | Border CSS 2px encima del stroke SVG 1.5px | Eliminar `bottomBorder` de lane divs / usar 1.5px igual que SVG |
| Separador desaparecía según zoom | `height = Math.round(laneScrH)` podía ser 1px mayor → tapaba línea SVG; con `bottomBorder:false` el SVG quedaba expuesto | Calcular `h = Math.round(bot) - Math.round(top)` para coincidir exacto con pixel SVG |
| `border-bottom` completamente invisible | Typo: `'border-bottom:2px, px solid ...'` (coma → CSS inválido) | `'border-bottom:1.5px solid var(--pool-stroke)'` |
| Efecto "tarjeta" (sticky parece elemento separado) | Lane divs sin `topBorder` → div opaco tapa borde superior SVG en x=30–60px → hueco en el borde | `topBorder: isFirstLane && poolScrYTop >= 0` en primer lane |
