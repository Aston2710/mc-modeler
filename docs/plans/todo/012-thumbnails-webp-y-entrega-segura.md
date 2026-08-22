---
id: PLAN-012
titulo: Thumbnails a WebP con entrega segura, y metodo de trabajo para rendimiento
estado: en-progreso
creado: 2026-08-09
cerrado: 
aprobado_por: 
auditado: 2026-08-21
relacionados: [PLAN-010, PLAN-011]
---

# 07 — Thumbnails rápidos y método de trabajo para rendimiento

Dos preguntas: cómo gestionar el rendimiento de forma sostenible, y cómo hacer que los thumbnails carguen más rápido.

---

## Estado de ejecución — auditado el 2026-08-21

La parte A está **implementada y sin commitear**: vive en el árbol de trabajo de la rama `master-plan-018-auditoria`. Suite completa verde: **26 ficheros, 238 pruebas**.

| Paso de la parte A | Estado | Dónde |
|---|---|---|
| 1 · SVG → WebP rasterizado al guardar | **hecho** | `thumbnailUtils.ts` — `svgToWebp()` + `buildThumbnailSvg()`, con caída al data URL SVG si el entorno no rasteriza (jsdom, canvas bloqueado, navegador sin WebP) |
| 2 · Eliminar la conversión a data URL | **hecho** | `SupabaseRepository.ts` — se abandona `blobToDataUrl` en el camino de lista |
| 3 · `createSignedUrls()` en lote | **hecho** | nuevo `getThumbnailUrls(ids)` en `IDiagramRepository`, implementado en `SupabaseRepository` y `LocalRepository` |
| 4 · Transformación de imagen del servidor | **descartado** | requiere plan Pro; el proyecto está en el gratuito — ver abajo |
| 5 · Atributos del `<img>` | **hecho** | `loading="lazy"` y `decoding="async"` en `DiagramList.tsx` y en las dos tarjetas de `ProjectView.tsx`. `width`/`height` **descartados con motivo** — ver abajo |
| 6 · Barrido de huérfanos en Storage | **movido a [PLAN-017](017-higiene-de-datos-y-retencion.md) paso 1** | era la misma tarea escrita dos veces |
| **nuevo** · Reconversión de lo existente | **implementado, pendiente de ejecución** | `src/lab/thumbForge.ts` + `scripts/backfill-thumbs.mjs` |

### El defecto de nitidez — la regla de escala era la de las fotos

El primer rasterizado usaba `scale = Math.min(1, maxWidth / w)`: nunca ampliar. Es correcto para una foto y **está mal para un origen vectorial**, donde no hay resolución nativa que preservar. La `w` medida sale del `viewBox`, que está en coordenadas de diagrama de bpmn-js (una tarea son 100×80 unidades), así que el tamaño del ráster acabó dependiendo de **cuántos elementos tiene el diagrama** en vez de de cómo se ve.

El efecto era el contrario del intuitivo: **los diagramas simples salían borrosos.** Un recorte al pool superior deja un `viewBox` de ~250×150; rasterizado a 250×150 px y pintado en la caja de 300×140 CSS, una pantalla de 2× lo ampliaba ~1.9×. Los diagramas grandes, al revés, desperdiciaban píxeles.

Cajas de presentación medidas, las tres con `object-fit: contain`:

| Vista | Caja CSS |
|---|---|
| `.diagram-thumb` — portada | ~300 × 140 |
| `.pv-grid-thumb` — proyecto, rejilla | 180 × 110 |
| `.pv-lr-thumb` — proyecto, lista | 48 × 32 |

**Decisión: rasterizar a la caja de presentación por la densidad objetivo, ampliando cuando toque.** Basta cubrir la mayor.

- `THUMB_BOX = 300 × 140` (px CSS) · `THUMB_DPR = 3` → caja objetivo **900 × 420 px físicos**
- `THUMB_QUALITY = 0.92`, no 0.8: por debajo de ~0.9 el códec deja halos alrededor de los trazos de 1 px negro sobre blanco. Los colores planos comprimen muy bien, así que subir la calidad cuesta pocos bytes.
- La escala se calcula con la misma semántica que `contain`, de modo que el ráster cae a **1:1 en píxeles físicos** y el navegador no lo re-escala.
- **Sin dependencia del DPR de quien guarda**: se rasteriza desde vectorial a un tamaño absoluto elegido por nosotros. Dos usuarios con pantallas distintas generan el mismo fichero.

**Y eso no bastó.** Con el lienzo ya en 900×420 las miniaturas seguían borrosas, en la tarjeta y al abrir la imagen suelta. La causa real está en [EXP-017](../../experience/017-el-thumbnail-webp-salia-borroso-por-el-tamano-intrinseco-del-svg.md): un `<img>` con un SVG dentro tiene un **tamaño intrínseco** —sus atributos `width`/`height`—, el navegador rasteriza el vector **una sola vez a ese tamaño**, y `drawImage(img, 0, 0, cw, ch)` **no re-rasteriza: reescala ese bitmap**. Agrandar el destino no agranda el origen.

Arreglado con `sizeSvgForRaster`, que reescribe el `width`/`height` del propio SVG al tamaño del ráster conservando el `viewBox`. La prueba que cierra el agujero afirma sobre el **contenido del `Blob`** que recibe el `<img>`, no sobre el lienzo — las pruebas de lienzo pasaban con el fallo vivo, porque el lienzo sí era correcto.

Medido en el laboratorio, ya con todo corregido:

| Diagrama | SVG | WebP 900×420 | |
|---|---:|---:|---|
| Trazabilidad de pedido (real) | 90 424 B | **14 344 B** | −84 % |
| Diagrama casi vacío | 2 493 B | 2 812 B | +13 % |

El +13 % es esperado y correcto: ese diagrama está casi vacío, así que su SVG era diminuto, mientras que el WebP siempre ocupa el lienzo fijo y tiene un suelo. Son 300 bytes, y es justo el caso que salía borroso. La estimación de 20-30 kB resultó conservadora: un diagrama real quedó en 14 kB.

Coste aceptado: la portada pasa de ~4.1 MB a en torno a 1 MB en vez de a ~800 kB, y a cambio "borroso" deja de ser una categoría de queja.

### Supermuestreo — la última mejora de definición, y gratis

**En la tarjeta ya estamos en el techo de resolución**: 300×140 CSS a densidad 3 son exactamente los 900×420 que producimos. Subir píxeles no la haría más nítida; solo se notaría abriendo la imagen suelta, que era un diagnóstico y no un caso de uso.

Lo que sí queda por mejorar es **cómo se resuelve el detalle en los píxeles que ya hay**. `THUMB_SUPERSAMPLE = 2`: se rasteriza el SVG a 1800×840 y se reduce a 900×420 con `imageSmoothingQuality = 'high'`. Cada píxel final se promedia de cuatro en vez de decidirse de uno, y los trazos de 1 px y el texto pequeño quedan bastante mejor definidos.

**El fichero no cambia de tamaño ni de peso.** Solo se paga un lienzo intermedio de 4× píxeles al guardar — 1.5 Mpx, milisegundos. Y sin el `imageSmoothingQuality` el navegador usa un remuestreo barato y se pierde justo lo que el supermuestreo venía a ganar, así que hay una prueba que lo fija.

### Lo que se descartó, y por qué

**Esperar a `document.fonts.ready` antes de rasterizar.** Se propuso como corrección y **el mecanismo no se sostiene**: un SVG dentro de un `<img>` se rasteriza en un contexto aislado que **no carga recursos externos**, así que esperar en el documento anfitrión no pondría ninguna webfont a disposición del ráster. Y no hace falta: el texto del diagrama lleva `Arial, sans-serif` inline (bpmn-js, y explícito en `StickyLaneLabelsModule`), que es fuente del sistema y resuelve bien. `Inter` y `JetBrains Mono` sí son webfonts de Google, pero son de la UI, no del lienzo. Si algún día el lienzo usara una webfont, el arreglo sería **incrustarla** en el SVG, ~100 kB por render, desproporcionado para una miniatura.

**Recortar los márgenes vacíos.** Es probablemente la mayor ganancia *percibida* que queda: `topPoolCrop` solo actúa con 2 o más pools, así que en el resto se gastan píxeles en blanco. **No se hizo porque no está medido** — se decide mirando las muestras, no por intuición.

**Engrosar los trazos solo para el thumbnail.** Mejoraría la legibilidad a este tamaño, pero deja de ser una reducción fiel del diagrama. No se toca sin petición explícita.

### Cómo se ajustan las perillas con datos

Dos vías, y **la primera es la buena para decidir**:

**Desde la app, botón THUMBS** (`src/lab/ThumbLab.tsx`, solo en `MODE=lab`). Eliges un diagrama —la lista viene ordenada por número de elementos, porque la definición se juzga en los densos— y pinta las seis variantes **una al lado de otra al tamaño real de la tarjeta**, con un conmutador a 1:1. Es donde hay que juzgarlas: al 100 % se ven tres veces más grandes de lo que se verán.

**Desde el script**, cuando quieres los ficheros en disco o comparar contra producción:

```
node scripts/backfill-thumbs.mjs --comparar=3            # laboratorio
node scripts/backfill-thumbs.mjs --db=prod --comparar=3  # lee producción, no escribe
```

La primera variante es la de la app. Si gana otra, se cambian `THUMB_DPR` / `THUMB_QUALITY` / `THUMB_SUPERSAMPLE` a esos valores. **La comparativa nunca escribe en el bucket, ni con `--apply`**: es una herramienta de decisión.

> Corregido el 2026-08-22: `--comparar` elegía entre los *pendientes*, así que en cuanto la app convertía un diagrama al guardarlo, ese diagrama dejaba de poder compararse — y son justo los interesantes. Ahora elige entre **todos**, ordenados por tamaño de XML descendente.

Para que fuera posible, `svgToWebp` acepta un cuarto parámetro `supersample` (por defecto la constante) y el forge un objeto de `overrides`. Sin overrides el forge llama al camino **real** de `buildThumbnail`, no a una ruta paralela que pudiera divergir del guardado normal — eso importa: el pase de verdad tiene que producir lo mismo que produce la app.

### Por qué NO se ponen `width`/`height` en el `<img>`

El paso 5 los pedía para reservar el hueco y evitar reflow. **Aquí no hay hueco que reservar**: las tres cajas tienen altura fija en CSS (140 / 110 / 32 px), así que el espacio existe antes de que cargue la imagen y el CLS ya es cero. Y como cada thumbnail tiene su propia relación de aspecto, unos `width`/`height` fijos darían una pista de aspecto **falsa** y provocarían un salto visible al cargar. Ponerlos sería peor. Queda anotado en el código para que nadie lo "arregle".

### Paso 4 · DESCARTADO — requiere plan Pro y el proyecto está en el gratuito

`supabase/config.toml` lo dice literalmente: *"Image transformation API is available to Supabase Pro plan."* El proyecto **está en el plan gratuito y nunca ha estado en Pro** (confirmado por el usuario el 2026-08-22), así que `/render/image/sign/...?width=320` no está disponible.

**Consecuencia de diseño, y es la correcta:** al no poder pedirle al servidor tamaños a medida, el fichero único tiene que servir a las tres vistas, y por eso la densidad se fija alta (4×, 1200×560) y el navegador reduce para la rejilla y la lista. Es exactamente lo que se hizo.

Si algún día se pasa a Pro, este paso vuelve a estar sobre la mesa y permitiría **bajar** `THUMB_DPR`, porque el ajuste de tamaño lo haría el servidor.

### Reconversión de lo existente

Medido en producción el **2026-08-21**:

| | |
|---|---|
| Objetos en `thumbnails` | **235**, y los **235 son `image/svg+xml`**. Cero WebP |
| Peso total | 11 MB (7 549 kB de válidos + 3 896 kB de huérfanos) |
| Diagramas | 177 · **157 con thumbnail, 20 sin ninguno** |
| Huérfanos | 78 |
| Rutas de subproceso (`<parentId>/subproc/<id>`) | **0** — todas las rutas son `<id>/thumb` |

El paso 1 solo actúa al guardar, así que sin un pase explícito la mejora llega diagrama a diagrama y **el efecto de privacidad no llega nunca** a los que nadie toque.

**Decisión: pase único con `service_role`, renderizando con el motor real de la app.** Dos piezas:

- **`src/lab/thumbForge.ts`** — expone `window.__thumbForge` **solo con `MODE=lab`**, detrás de la misma puerta que `LabBar`. Verificado tras `npm run build`: no aparece en ningún chunk de producción.
- **`scripts/backfill-thumbs.mjs`** — trae el XML con `service_role`, renderiza en un Chrome headless contra la app en modo lab, y sube el WebP.

Por qué dentro de la app y no un `bpmn-navigated-viewer` suelto, que era la vía obvia y es **equivocada**: el SVG de esta app no lo produce un bpmn-js pelado, sino un Modeler con los 26 módulos de `MODELER_CONFIG` —`ThemeAwareRendererModule`, `PhaseModule`, `StickyLaneLabelsModule`— más la extensión de moddle `flujo`, y `getThemedSvg` lee los tokens del CSSOM vivo. Un viewer pelado habría devuelto diagramas sin colores de fase ni de grupo y perdiendo los atributos `flujo:`. La diferencia solo se habría notado mirándolos uno a uno.

Propiedades del pase, verificadas contra el código:

- **No toca ni una fila de `diagrams`.** `saveThumbnail` solo hace `UPDATE` si `thumbnail_path` cambia, y la ruta (`<id>/thumb`, sin extensión) no cambia. Sin bump de `updated_at`, sin reordenar listas, y **sin invalidar la versión CAS de ningún colaborador** — que según el propio comentario del código era la causa de los conflictos fantasma.
- **Cero huérfanos nuevos**: sobrescribe en la misma ruta, con `upsert: true` y `contentType` del data URL.
- **El bucket ya admite WebP**: `image/svg+xml`, `image/webp`, `image/png`, techo 5 MB. La migración `0026` lo dejó preparado.
- **Crea los 20 thumbnails que faltan**, de paso.
- **Por defecto apunta al laboratorio y no escribe.** Producción exige `--db=prod --apply --confirmar=PRODUCCION`.
- **Si el rasterizado cae a SVG, no sube nada** y lo cuenta como fallo: subir un SVG creyendo que se convirtió sería peor que no tocarlo.
- Al terminar **re-verifica los mimes del bucket**. Que no quede ningún SVG es el criterio de aceptación, no una suposición.

**Lo ejecuta el usuario, no el asistente**, y primero contra el laboratorio.

Sobre el navegador: **hace falta un navegador, no Playwright.** Rasterizar esto necesita tres cosas que Node no tiene — un DOM donde bpmn-js construya y **mida** el diagrama (las etiquetas dependen de métricas de texto reales), un `canvas.toDataURL('image/webp')` que codifique, y un CSSOM vivo del que `getThemedSvg` lea los tokens. La primera versión pedía `playwright` + `npx playwright install chromium`, unos **300 MB de Chromium propio**, innecesarios: la dependencia es **`playwright-core`** (unos MB, sin navegadores dentro) y usa el **Chrome o Edge ya instalado** vía `channel`. Prueba los dos y, como último recurso, el Chromium de Playwright si alguien lo instaló. No se añade a `package.json`: es herramienta de una tarea puntual.

Para juzgar la nitidez existe `--muestras=N`, que escribe los N primeros `.webp` en `muestras-thumbs/` (ignorado por git) **incluso en seco** — es la forma de decidir la densidad objetivo sin escribir nada en el bucket.

### Medición real contra producción — 2026-08-22

Pase en seco sobre los **177 diagramas de producción**, renderizando con la app del laboratorio y sin escribir nada. **177/177, cero fallos**: todos los diagramas reales rasterizan sin error, que era la incógnita que ningún número podía despejar.

| | Antes (SVG) | Después (WebP a 4×) |
|---|---:|---:|
| Mínimo | 1.8 kB | 1.4 kB |
| Mediana | 30.5 kB | 21.7 kB |
| **Máximo** | **432.5 kB** | **47.9 kB** |
| Suma de los 157 existentes | 7 549.1 kB | **3 596.4 kB** (**−52.4 %**) |
| 20 thumbnails nuevos | — | 235.4 kB |
| Total del bucket tras el pase | — | 3 831.9 kB |

Tres lecturas que el porcentaje global esconde:

1. **El máximo cae 9×.** Es el resultado que de verdad importa: el peso deja de depender de la complejidad del diagrama. `AS-IS` pasa de 432.5 kB a 17.5 kB (−96 %); `diagrama_1 (2)`, de 270.4 a 20.4. La cola cara desaparece y con ella el p90 que motivó el plan.
2. **49 de 157 crecen, y da igual.** Son los diagramas casi vacíos: su SVG era diminuto y ahora pagan el suelo del lienzo fijo de 1200×560. Entre los 49 suman **+287 kB**, ruido frente a lo que ahorran los otros 108. Y son exactamente los que antes salían borrosos.
3. **20 diagramas ganan miniatura por primera vez.** Hoy muestran el icono gris de marcador de posición. No estaba en el plan; sale gratis con el pase.

Con esto, la elección de **4× queda respaldada por datos**: −52 % con la densidad alta. A 3× se ahorrarían del orden de 1.3 MB más en el conjunto, pero con `loading="lazy"` y el TTL de 90 minutos una descarga completa sin caché es rara. Bajar a 3 sigue siendo una línea si algún día el egress aprieta.

### Pase real en el laboratorio — 2026-08-22

`--apply --incluir-webp` sobre los 7 diagramas del laboratorio: **7/7, cero fallos**, y la re-verificación del bucket imprimió *"No queda ningún thumbnail en SVG"*. Comprobado además por fuera con `scripts/estado-lab.mjs`: **7 WebP · 0 SVG · 0 otros · 0 sin objeto**.

Dos cosas que este pase demostró y que no se sabían:

**El render es determinista.** Los siete salieron con el **mismo tamaño exacto** que en el pase anterior (5.7, 3.8, 13.3, 27.7, 23.7, 16.8, 20.4 kB). Mismo XML y mismos ajustes producen el mismo fichero, así que repetir el backfill es idempotente y no hay que temer un pase a medias.

**Las dimensiones son las correctas**, leídas de la cabecera de cada WebP y no de lo que dijera el script:

| Muestra | Píxeles | |
|---|---|---|
| Diagrama borrado / en carpeta | 1200×511 | limitado por el ancho |
| Prueba | 1200×433 | limitado por el ancho |
| Trazabilidad de pedido | 1200×459 | limitado por el ancho |
| **Negociación especial** | **656×560** | **limitado por el alto — ampliado para llenarlo** |
| Diagrama suelto | 1132×560 | limitado por el alto |
| Diagrama del proyecto | 1102×560 | limitado por el alto |

Todos caben en 1200×560 y **todos llenan al menos un eje**: es la semántica `contain` funcionando, y la confirmación de que EXP-017 está cerrado en este camino. `Negociación especial` es el caso interesante — 656 px de ancho significa que se **amplió** desde las unidades de diagrama para llenar el alto, que es exactamente lo que antes producía el borroso.

### Pase en producción — 2026-08-22 · ejecutado

`--db=prod --apply --confirmar=PRODUCCION`. **177 convertidos, cero fallos.**

Verificado por SQL contra producción, no por lo que dijera el script:

| | Antes | Después |
|---|---:|---:|
| Diagramas con thumbnail | 157 de 177 | **177 de 177** |
| Thumbnails en WebP | 0 | **177** |
| **Thumbnails de diagramas en SVG** | 157 | **0** |
| Peso de los thumbnails vivos | 7 549 kB | **3 832 kB** (−49.2 %) |
| Huérfanos (sin diagrama) | 78, SVG, 3 896 kB | **78, SVG, 3 896 kB** — intactos |
| Peso del bucket completo | 11 445 kB | 7 728 kB |

**Matiz sobre el mensaje del script.** Al terminar imprime *"No queda ningún thumbnail en SVG"*, y eso está acotado a **los thumbnails de diagramas**. En el bucket siguen quedando **78 SVG huérfanos**, que este plan no toca por diseño: son de [PLAN-017](017-higiene-de-datos-y-retencion.md) paso 1. Tomar ese mensaje como "el bucket ya no tiene SVG" sería falso.

**La propiedad que más importaba, ahora demostrada y no supuesta:** el pase escribió 177 objetos en Storage a las 15:59 UTC y **tocó exactamente cero filas de `diagrams`** — el `updated_at` más reciente de la tabla sigue siendo del día anterior (2026-08-21 17:54 UTC). Sin bump de `updated_at`, sin reordenar la lista de nadie, y **sin invalidar la versión CAS de ningún colaborador**, que según el comentario del propio código era la causa de los conflictos fantasma.

Efecto secundario que no estaba en el plan: **20 diagramas que mostraban el icono gris de marcador de posición ahora tienen vista previa**.

### Respaldo y vuelta atrás

El backfill **sobrescribe** cada `<id>/thumb` y no hay deshacer objeto a objeto, así que antes del pase en producción hay respaldo. Dos scripts nuevos, ambos en `scripts/` (fuera del repo):

| Script | Qué hace |
|---|---|
| `thumbs-backup.mjs` | descarga **todo** el bucket a `backups/thumbnails-<db>-<sello>/`, con `manifest.json` (ruta, mime, bytes, etag, y si el diagrama existe). Solo lee |
| `thumbs-restore.mjs` | la vuelta atrás. En seco por defecto; producción exige `--apply --confirmar=PRODUCCION` |

Al contrario que `backfill-thumbs.mjs`, **el respaldo apunta a producción por defecto**: un respaldo de la base equivocada no rompe nada, pero no tener el de producción cuando hace falta sí. El riesgo está invertido.

Por defecto la restauración **omite los 78 huérfanos**, para no resucitar lo que [PLAN-017](017-higiene-de-datos-y-retencion.md) va a barrer. `--incluir-huerfanos` los trae si alguna vez hiciera falta.

**Ejecutado el 2026-08-22 contra producción:**

```
Objetos : 235  ·  11 445.5 kB  ·  image/svg+xml ×235  ·  78 huérfanos
Descargados : 235   Fallos: 0
backups/thumbnails-prod-2026-08-22T15-04-34-329Z
```

Verificado de forma independiente, no solo por lo que dijo el script: 235 ficheros en disco contra 235 en el manifest, **11 720 175 bytes exactos en los dos lados**, cero ficheros vacíos, cero avisos de tamaño. Y el camino de restauración probado en seco: 157 restaurables, 0 fallos. Un respaldo cuya restauración nadie ha ejercitado no es un respaldo.

### Antes de cerrar este plan

- [x] **respaldo del bucket `thumbnails` de producción** — 2026-08-22, 235/235, verificado, restauración probada en seco
- [x] **decidir la densidad** — 4× (1200×560), elegido a ojo en el banco del laboratorio
- [x] **decidir el TTL de la URL firmada** — 90 minutos, y `onError` que re-firma
- [x] **pase en seco contra producción** — 2026-08-22, 177/177 sin fallos, −52.4 % sobre los objetos existentes. Confirma el 4×
- [x] **pase real en el laboratorio** (`--apply --incluir-webp`) — 2026-08-22, 7/7, 0 SVG restantes, dimensiones verificadas por cabecera. Ya está ejercitada la escritura
- [x] **pase en producción** — 2026-08-22, 177/177, 0 fallos, verificado por SQL: 177 WebP, 0 SVG de diagramas, 0 filas de `diagrams` tocadas
- [x] **paso 4 descartado** — requiere plan Pro y el proyecto está en el gratuito
- [x] **commiteado y desplegado** — 2026-08-22
- [ ] revisión a ojo de la portada en producción
- [ ] **cierre del plan: requiere aprobación explícita del usuario**

> **El pase de producción lo ejecuta el usuario**, por instrucción explícita suya. El asistente prepara, respalda y verifica.

---

# Parte A — Thumbnails

## Diagnóstico: qué pasa hoy realmente

Seguimiento del camino completo, de la generación al píxel en pantalla.

### 1. Generación (`thumbnailUtils.ts:47-68`)

```ts
const themedSvg = await getThemedSvg('light', getSvg)   // SVG COMPLETO del diagrama
let svg = ensureViewBox(themedSvg)
if (crop) svg = applyCrop(svg, crop)
svg = anchorBackgroundRect(svg)
return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
```

El thumbnail **es el diagrama BPMN entero en vectorial**. Cada forma, cada etiqueta, cada `<path>` de cada flujo de secuencia. Recortar al pool superior cambia el `viewBox`, pero **no elimina un solo nodo del SVG** — sigue viajando el diagrama completo, solo que se muestra una porción.

### 2. Almacenamiento

Verificado en `storage.objects`:

```
bucket thumbnails: 194 objetos, mime ÚNICO image/svg+xml
mediana 36 kB · p90 103 kB · máximo 433 kB · total 10 212 kB
```

### 3. Descarga (`SupabaseRepository.ts:333-361`)

```ts
const { data } = await this.sb.storage.from(THUMB_BUCKET).download(thumbPath(id))
const url = await blobToDataUrl(data)     // Blob → base64 data URL
this.thumbCache.set(id, url)
```

### 4. Coste real de abrir la portada con 78 diagramas visibles

| Concepto | Coste |
|---|---|
| Peticiones HTTP a la API de Storage | **78**, autenticadas, bucket privado → **sin CDN, sin caché HTTP del navegador** |
| Consultas a `storage.objects` que generan | 78 × **7.64 ms de media** (medido en `pg_stat_statements`) |
| Bytes transferidos | **~4 106 kB** |
| Conversiones `FileReader` a base64 | 78, cada una asíncrona |
| Memoria retenida en `thumbCache` | ~5.5 MB de strings base64 (base64 infla **+33%**), **para siempre** |
| Trabajo del navegador por tarjeta | decodificar base64 → parsear XML → construir DOM SVG → **rasterizar un diagrama vectorial completo**, en el hilo principal |

El último punto es el más caro y el menos visible. Un `<img src="data:image/svg+xml;base64,...">` de un BPMN con cientos de nodos obliga al navegador a construir un árbol SVG completo y rasterizarlo. Multiplicado por 78 tarjetas.

El caché en memoria (`thumbCache`, `thumbPaths`) con identidad estable del dataURL está muy bien resuelto y es lo que hoy evita el desastre en navegaciones posteriores. Pero **no ayuda en la primera carga**, que es exactamente donde se percibe la lentitud.

---

## Las cinco correcciones, por orden de impacto

### 1 · Rasterizar el thumbnail a WebP en el guardado — **el cambio grande**

Un BPMN vectorial es el peor formato posible para una miniatura de 320 px: se transmite y se rasteriza el detalle completo para mostrar un sello de correos.

**Ya tienes el código hecho.** `useExport.ts:213` define:

```ts
export function svgToDataUrl(svg: string, scale: number, bg: string, padding = 20): Promise<string>
```

Rasteriza SVG → PNG por canvas offscreen. Se usa para exportar PNG. Basta reutilizarlo en `buildThumbnail` con una escala pequeña y `toBlob(..., 'image/webp', 0.8)` en vez de `toDataURL('image/png')`:

```ts
// thumbnailUtils.ts — en vez de devolver el data URL del SVG
const svg = anchorBackgroundRect(...)          // igual que hoy
return svgToWebp(svg, { maxWidth: 640, quality: 0.8 })   // rasterizado a tamaño fijo
```

> Los tamaños de esta tabla eran la estimación inicial, a 640 px de ancho y calidad 0.8.
> **Se revisaron al alza el 2026-08-21** —caja 900×420, calidad 0.92— porque a 640 px
> los diagramas simples salían borrosos y a 0.8 la línea fina cogía halos. Ver
> *Estado de ejecución* arriba; las cifras vigentes son las de allí.

| | SVG hoy | WebP 640 px (estimación inicial) |
|---|---:|---:|
| Peso mediano | 36 kB | **~8-12 kB** |
| Peso p90 | 103 kB | **~15 kB** (el peso deja de depender de la complejidad del diagrama) |
| Peso máximo | 433 kB | **~20 kB** |
| Portada de 78 tarjetas | ~4 106 kB | **~800 kB** |
| Decodificación | parseo XML + rasterizado vectorial, hilo principal | decodificación de imagen, **hilo aparte** |
| Coste del rasterizado | en **cada** render de **cada** tarjeta | **una vez**, al guardar |

**~5× menos bytes y el rasterizado se mueve de tiempo-de-lectura a tiempo-de-escritura.** Esa reubicación importa más que los bytes: hoy se paga en cada carga de portada de cada usuario; pasaría a pagarse una vez por guardado.

Efecto secundario: elimina el `p90 = 103 kB`. El peso de un WebP a resolución fija es casi constante, no crece con la complejidad del diagrama. Los diagramas grandes dejan de ser los lentos.

### 2 · Dejar de convertir a data URL

`blobToDataUrl` cuesta triple: un `FileReader` asíncrono por imagen, **+33% de tamaño** por base64, y el string queda retenido en el `Map` del heap de JS mientras viva la sesión.

Con las tarjetas apuntando a una URL real, `<img>` descarga en paralelo con el resto, usa la caché HTTP del navegador y libera la memoria cuando quiere. Cero base64, cero `FileReader`, cero retención.

### 3 · Que el `<img>` apunte a una URL, no a un blob descargado a mano

Aquí hay una decisión que te corresponde:

**Opción A — bucket `thumbnails` público.** Cada thumbnail pasa a ser un `GET` plano servido por el CDN de Supabase, con cabeceras de caché a largo plazo. La segunda visita no toca la red. Es la opción más rápida con diferencia.

> Contrapartida de seguridad: la URL contiene el UUID del diagrama y sería accesible sin sesión para quien la conozca. Es el patrón de "URL capacidad" — un UUIDv4 no es adivinable, pero deja de haber control de acceso sobre la miniatura. Los thumbnails muestran la estructura del proceso. **Es tu decisión, no la tomo por ti.**

**Opción B — bucket privado con `createSignedUrls()` en lote.** El método plural acepta N rutas y devuelve N URLs firmadas en **una sola llamada**:

```ts
const { data } = await sb.storage.from('thumbnails')
  .createSignedUrls(ids.map(thumbPath), 3600)
```

Sustituye 78 llamadas secuenciales a `download()` + 78 conversiones a base64 por **1 llamada**, y luego el navegador descarga las 78 imágenes en paralelo con su propio caché. Conserva el control de acceso. Casi todo el beneficio de A sin la contrapartida.

**Recomendación: opción B.** Mantiene la propiedad de seguridad y captura la mayor parte de la ganancia. Solo pasar a A si tras medir la firma sigue siendo el cuello.

### 4 · Transformación de imagen del lado del servidor

Solo funciona sobre raster — otra razón para el punto 1. Con WebP almacenado, Supabase puede servir exactamente el tamaño de visualización:

```
/storage/v1/render/image/sign/thumbnails/<id>/thumb?width=320&quality=70
```

Sirve para pedir 320 px en la rejilla y 640 px en la vista de detalle, sin guardar dos archivos.

### 5 · Atributos del `<img>` en la tarjeta

```html
<img src={url} width={320} height={200} loading="lazy" decoding="async" alt="" />
```

- `loading="lazy"` — con 78 tarjetas, la mayoría nace fuera de pantalla. El navegador no descarga lo que no se ve.
- `decoding="async"` — saca la decodificación del hilo principal.
- `width`/`height` explícitos — reservan el hueco y evitan reflow (además de mejorar el CLS).

Tres atributos, coste cero, efecto inmediato en la percepción de velocidad.

---

## Limpieza de huérfanos — **no es de este plan**

Este plan describía un barrido de huérfanos que **[PLAN-017](017-higiene-de-datos-y-retencion.md) paso 1 ya tenía**, con la misma consulta y las mismas dos trampas. Estaba escrito dos veces; se hace una, en PLAN-017, dentro de la misma tanda de laboratorio que PLAN-011.

Medición actualizada el 2026-08-21 (la de este plan era del 9 de agosto):

```
objetos en el bucket                    235   ← los 235 son SVG, 11 MB
thumbnails válidos (diagrama existente) 157
thumbnails huérfanos                     78   ← 3 896 kB, 33% del bucket
diagramas sin ningún thumbnail           20
rutas de subproceso                       0   ← ya no se usa esa convención
```

Este plan **sí** afecta a esos números en un punto: el backfill crea los 20 thumbnails que faltan y reconvierte los 157 válidos, pero **no toca los 78 huérfanos**. Conviene hacer el barrido de PLAN-017 *antes* del backfill para no gastar tiempo de render en nada — aunque el script ya los ignora, porque itera sobre `diagrams`, no sobre el bucket.

---

## Resumen de la parte A

| Paso | Esfuerzo | Efecto |
|---|---|---|
| 1. SVG → WebP rasterizado al guardar | medio (reutiliza `svgToDataUrl`) | **~5× menos bytes** + rasterizado fuera del render |
| 2. Eliminar la conversión a data URL | bajo | −33% de bytes, −memoria, −`FileReader` |
| 3. `createSignedUrls()` en lote | bajo | **78 llamadas → 1**, descarga paralela, caché HTTP |
| 4. Transformación de imagen del servidor | bajo (requiere 1) | tamaño exacto de visualización |
| 5. `lazy` + `async` (sin dimensiones, ver arriba) | trivial | no descarga lo que no se ve |
| ~~6. Barrido de huérfanos~~ | — | **movido a [PLAN-017](017-higiene-de-datos-y-retencion.md) paso 1**, que ya lo tenía |

Los pasos 1+2+3 juntos llevan la primera carga de portada de ~4.1 MB y 78 peticiones secuenciales a **~1.9 MB y 1 petición + 78 descargas paralelas cacheables**, con la caja de 900×420 y calidad 0.92 que fija el *Estado de ejecución*.

---

# Parte B — Cómo gestionar el rendimiento de aquí en adelante

Lo que esta auditoría enseña sobre este sistema en concreto, convertido en método.

## 1. Medir con `EXPLAIN (ANALYZE, BUFFERS)` bajo el rol real, siempre

Es la regla número uno **en este proyecto específicamente**, porque con RLS la consulta que ejecuta el usuario no se parece a la que ejecutas tú:

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<uuid-real>","role":"authenticated"}';
  explain (analyze, buffers) <la consulta>;
rollback;
```

Sin `set local role`, tu conexión es superusuario, RLS no se aplica y verás 0.04 ms donde el usuario ve 31 ms. **Factor 700 de diferencia entre lo que mides y lo que pasa.** Todos los números de esta auditoría se tomaron así.

## 2. Fiarse de `Buffers`, no de los milisegundos

Los ms varían con la temperatura de la caché, la carga del vecino en la instancia compartida y el ruido. `Buffers: shared hit=N` es **trabajo determinista**: cuántas páginas de 8 kB tocó la consulta.

La señal que delató el problema de RLS no fue el tiempo, fue la aritmética: **1 344 buffers para una tabla cuyo heap son 12 páginas**. Eso es imposible sin trabajo oculto por fila. Después: 121 buffers.

Regla práctica: divide buffers entre filas devueltas. Si sale más de ~5 en una consulta indexada, hay algo escondido.

## 3. En RLS, nunca una llamada a función por fila

Es la lección central. Comparativa medida sobre la misma tabla de 132 filas:

```
sin RLS                       0.0449 ms
predicado conjuntista         0.262  ms      ← se materializa una vez
función SECURITY DEFINER      8.733  ms      ← se ejecuta por fila
```

Centralizar la autorización en funciones `private.can_*` es **arquitectura correcta** — evita recursión de RLS y duplicar lógica entre 42 políticas. El error no es la función, es **dónde se usa**:

- Políticas **`SELECT` sobre tablas que se escanean** → predicado conjuntista. El planificador materializa las subconsultas en hashes y comprueba O(1) por fila.
- Políticas **`UPDATE`/`DELETE`/`INSERT`**, que se evalúan sobre una fila concreta → la función está perfecta. No la cambies.

Esa distinción es exactamente lo que hace `0025`: cambia dos políticas `SELECT` y deja intactas las otras 40.

## 4. `ANALYZE` después de cada migración

El índice `diagrams_updated_at_live_idx` existía y **el planificador lo ignoraba** hasta que corrió `ANALYZE`. Con `reltuples = -1` el planificador adivina, y adivinando prefiere el `Seq Scan`.

Índice sin estadísticas = índice que pagas mantener y no usas. Añade `analyze` al final de cada migración que toque índices o volumen de datos.

## 5. Mover trabajo de lectura a escritura

Vale para toda la aplicación, y aquí hay dos ejemplos vivos:

- `element_count` es un caché derivado: se calcula una vez al guardar en vez de parsear 3.7 MB de XML en cada carga de lista. Decisión correcta, ya tomada.
- El rasterizado del thumbnail es el mismo patrón sin aplicar: hoy se paga en cada render de cada tarjeta de cada usuario. Debería pagarse una vez por guardado.

Pregunta a hacerse ante cualquier cosa lenta: *¿cuántas veces se lee esto frente a cuántas veces se escribe?* En `diagrams` la proporción es **15 905 UPDATEs contra 1.24 M de lecturas indexadas**. Todo lo que se pueda precalcular al escribir, sale rentable.

## 6. No traer lo que no se muestra

La mayor victoria de rendimiento del proyecto ya estaba hecha antes de esta auditoría, y no fue un índice: fue `LIST_COLUMNS` en `SupabaseRepository.ts:123`. Excluir `current_xml` de la lista quitó **3 764 kB por carga de portada**. El registro histórico lo confirma: esa consulta promediaba **17.62 ms** y tocaba 3 530 900 buffers.

`select('*')` sobre una tabla con una columna TOAST grande es la trampa más cara y más fácil de caer en PostgREST.

## 7. Distinguir el tiempo de la aplicación del tiempo de la plataforma

En la ventana medida, la aplicación consume **menos del 6%** del tiempo de CPU de la base. El resto: 73% Realtime, 7.6% `pg_timezone_names` (recargas de esquema de PostgREST), 3% introspección del panel.

Antes de optimizar una consulta, comprobar qué porcentaje del total representa. Optimizar 10× algo que es el 0.3% del tiempo no se nota. Podar la publicación de realtime sí.

## 8. Reiniciar el contador al medir un cambio

`pg_stat_statements` acumula desde el 2026-05-29. Dos de las diez consultas más caras del ranking **son de código que ya no existe** (`yjs_documents`, el `SELECT diagrams.*`). Las medias históricas mienten sobre el presente.

Antes de evaluar un cambio: `select extensions.pg_stat_statements_reset();`, dejar correr una semana de tráfico real, comparar.

## 9. Cuatro consultas de vigilancia

Para revisar cada mes o antes de cada release:

```sql
-- 1. Reparto del tiempo: ¿dónde se va realmente?
select left(regexp_replace(query,'\s+',' ','g'),90) as q, calls,
       round(total_exec_time::numeric,1) as tot_ms,
       round(mean_exec_time::numeric,2) as media_ms,
       round((100*total_exec_time/sum(total_exec_time) over ())::numeric,2) as pct
from extensions.pg_stat_statements order by total_exec_time desc limit 20;

-- 2. Buffers por fila: delata trabajo oculto por fila (RLS, funciones, TOAST)
select left(regexp_replace(query,'\s+',' ','g'),90) as q, calls, rows,
       round((shared_blks_hit + shared_blks_read)::numeric / nullif(calls,0), 1) as buffers_por_llamada
from extensions.pg_stat_statements
where calls > 100 order by 4 desc limit 20;

-- 3. Tablas que se escanean secuencialmente teniendo índices
select relname, seq_scan, idx_scan, n_live_tup,
       round(100.0*seq_scan/nullif(seq_scan+idx_scan,0),1) as pct_seq
from pg_stat_user_tables
where schemaname='public' and n_live_tup > 1000
order by seq_scan desc;

-- 4. Índices que pagas y no usas
select relname, indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid))
from pg_stat_user_indexes where schemaname='public' and idx_scan = 0
order by pg_relation_size(indexrelid) desc;
```

Y los linters de Supabase, que son gratis y detectaron correctamente tanto la fuga P0 como las 22 políticas con `auth.uid()` sin envolver:

```
mcp__supabase__get_advisors  type=security | type=performance
```

## 10. Verificar equivalencia antes de tocar seguridad

Cualquier cambio en RLS se valida comparando el conjunto exacto de filas visibles, usuario por usuario, antes y después. No "parece que funciona": un hash del listado ordenado de ids, para todos los usuarios reales.

Es lo que se hizo antes de aplicar `0025` — 23 usuarios, 23 hashes idénticos, 497 filas en ambos lados, 0 divergencias. Sin esa prueba, un cambio de RLS es una apuesta con datos de otros.

---

## Lo siguiente, por retorno

| # | Acción | Ganancia |
|---|---|---|
| 1 | Thumbnails a WebP + `createSignedUrls` en lote + `lazy` | portada: ~4.1 MB / 78 peticiones → ~800 kB / 1 petición |
| 2 | Podar la publicación de realtime | hasta 73% del CPU de la base |
| 3 | `upsert` en `save()` sin el `SELECT id` previo (ya es seguro tras `0028`) | −9 313 consultas por ventana |
| 4 | `thumbnail_path` → `has_thumbnail` | limpieza 3NF, −40 B/fila |
| 5 | Barrido de 78 huérfanos en Storage | −3 896 kB |
