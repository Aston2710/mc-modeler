---
id: PLAN-034
titulo: Vista Documento — cajetin configurable y exportacion a la medida de la hoja
estado: todo
creado: 2026-08-22
cerrado:
aprobado_por:
prioridad: 1
relacionados: [EXP-017, PLAN-012, MASTER-PLAN-027, DEC-011]
---

# PLAN-034 · Vista Documento: cajetín configurable y exportación a la medida de la hoja

> **Prioridad 1.** Es el único plan con fecha externa: nace de un compromiso con el equipo de procesos de la empresa.

## Origen

El equipo de procesos —los responsables de método de los silos (Ventas, Compras, Logística…)— vio la herramienta, le dio valor, y pidió dos cosas por correo:

1. **Un encabezado** con logo, nombre del documento, código, fecha y revisión, *"que se genere en la sección superior"* de cada diagrama y *"que se pueda editar según la información de cada documento"*.
2. Un recordatorio de la **simbología de colores** para encuadrar tareas (Agente Inteligente, Sistema Actual/Mejoras, RPA, Integraciones, Nuevos Sistemas). **Esto ya está hecho** vía `flujo:groupColor`; era una leyenda, no una petición nueva.

Sus documentos viven en un **BPA** que organiza los procesos en Silo → Macroproceso → Proceso → Subproceso y sirve PDFs alojados en Google Drive. El encabezado que piden es el cajetín de esos documentos normativos.

## La restricción que ordena todo el plan

> **La herramienta no se cablea a ninguna empresa.** Ni un logo, ni un formato, ni un esquema de códigos entra en el repositorio. Todo lo que pidan tiene que poder expresarse como **configuración que ellos cargan**, y tiene que servir igual a una universidad, a una consultora o a un estudiante.

Esto no es una concesión diplomática: es también la mejor respuesta *para ellos*. Cableado, cada cambio de logo o de campo sería un cambio de código y un despliegue. Configurable, lo cambian ellos sin depender de nadie.

Segunda restricción, de [DEC-011](../../context/decisiones.md) y de la filosofía del proyecto: **el usuario dibuja lo que quiera.** La herramienta encaja en la hoja lo que le den; **no re-maqueta el diagrama** ni opina sobre si un proceso debería estar descompuesto. Eso es del diagramador, no del modelador.

## Qué NO entra

| Fuera | Por qué |
|---|---|
| Generar el documento normativo completo | Son 9 páginas de texto (objetivo, reglas, referencias…). mc-modeler hace diagramas y los exporta; no es un editor de documentación |
| Historial de revisiones **automático** | Es [PLAN-026](026-historial-de-operaciones.md), fase 6 de MASTER-PLAN-019, sin empezar y marcado opcional. Aquí la tabla de control de cambios son **campos que el usuario rellena** |
| Códigos validados, únicos o correlativos | Un registro con su tabla y sus reglas. Aquí el código es **texto libre** con pista de formato |
| "Aprobado por" como flujo de aprobación | Campo de texto |
| Re-maquetar el diagrama para que encaje | Es reordenar el dibujo de otra persona |
| **Mosaico en varias hojas** | Descartado por decisión del usuario el 2026-08-22: *"sería preferible hacer que todo quepa en una sola imagen"*. Ver D-E — con salida vectorial deja de hacer falta |

---

## Lo medido — y es lo que decide el diseño

Todo lo que sigue se midió el **2026-08-22 sobre los 177 diagramas de producción** con `scripts/medir-legibilidad.mjs`, y sobre los **235 SVG exportados** que se respaldaron del bucket. No hay ninguna estimación.

### La geometría real del estándar

De `Formato Norma 2026.07.docx`, leyendo el XML del `.docx`:

| | |
|---|---|
| Página | **Carta 215.9 × 279.4 mm, vertical** — no A4 |
| Márgenes | 25.4 mm por los cuatro lados |
| Cajetín | 3 columnas: **40.0 │ 74.6 │ 50.3 mm** = 164.9 mm |
| Logo | 20.4 × 12.1 mm |
| Campos | `<Nombre del Documento>` · `Código: xxxxx-xx-xx-xx` · `Fecha: <dd/MM/YYYY>` · `Revisión: xx` |

**En Venezuela la hoja de uso corriente es Carta, no A4.** Toda la medición se hizo sobre Carta. La exportación de hoy está cableada a `format: 'a4'`.

### Los diagramas son anchos, y ninguna hoja les llega

Tamaño en unidades de diagrama, y proporción ancho/alto:

| | min | p25 | **mediana** | p75 | p90 | max |
|---|---|---|---|---|---|---|
| Ancho | 208 | 930 | **1 428** | 2 270 | 3 073 | 7 400 |
| Alto | 88 | 360 | **510** | 960 | 1 340 | 2 780 |
| **Proporción** | 0.73 | 1.91 | **2.40** | 3.28 | 4.39 | **13.92** |

**Solo 5 de 177 son más altos que anchos.** La proporción mediana es 2.40:1 y la mejor proporción de una hoja estándar es 1.79 (A4 apaisada) o 1.60 (Carta apaisada). Conclusión: **el ancho limita casi siempre, en cualquier orientación.**

### Legibilidad: qué tamaño de letra sale de verdad

La referencia de fuente no es supuesta: se contó sobre los 235 SVG reales exportados de producción, y las etiquetas usan `font-size` **12** (3 854 apariciones, tareas y eventos) y **11** (2 058, pools y carriles). Se mide sobre 12.

Zona de dibujo = página − márgenes − 22 mm de cajetín.

| Página | ≥ 8 pt cómodo | **Utilizable ≥ 6 pt** | < 4 pt ilegible | Uso del papel |
|---|---:|---:|---:|---:|
| **Carta vertical** *(su estándar)* | 16 % | **25 %** | **53 %** | 35 % |
| Carta vertical, diagrama **girado 90°** | 23 % | **35 %** | 37 % | 53 % |
| Carta apaisada | 25 % | **41 %** | 34 % | 63 % |
| **Carta apaisada + márgenes 12.7 mm** | 33 % | **49 %** | 30 % | 60 % |
| A3 apaisada *(solo pantalla)* | 54 % | **68 %** | 12 % | 64 % |

Tres cosas que salen de esta tabla y que son el núcleo del plan:

1. **En su configuración actual, el 53 % de los diagramas sale ilegible y se desperdicia el 65 % del papel.**
2. **Pasar a Carta apaisada con márgenes de dibujo de 12.7 mm dobla lo utilizable (25 % → 49 %) sin tocar un solo diagrama.** Es la mejora más barata de todo el plan.
3. **Girar el diagrama 90° en la hoja vertical** sube de 25 % a 35 % **sin romper su estándar**: el documento sigue siendo Carta vertical y el lector gira el papel. Es lo que hace la documentación normativa con planos anchos.

### Mosaico: medido y descartado

Se midió por completitud. Sobre Carta apaisada con márgenes de 12.7 mm, a 6 pt: **1 hoja** 88 (50 %), **2 hojas** 44 (25 %), **3–4** 22 (12 %), **más de 4** 23 (13 %). Mediana 2, p90 6.

Funciona, pero **está descartado** (D-E): el usuario prefiere una sola imagen, y con salida vectorial deja de ser necesario. Los números quedan aquí por si algún día se retoma para impresión en papel.

### Qué construcciones SVG usan de verdad los diagramas

Contado sobre los mismos 235 SVG exportados, para saber el riesgo de pasarlos a PDF vectorial **antes** de instalar nada:

| Construcción | Presencia |
|---|---|
| `foreignObject`, `mask`, `clipPath`, `filter`, `use`, `pattern`, degradados, `textPath` | **cero, en los 235** |
| `marker` + `marker-end` (puntas de flecha) | 206 ficheros · 4 384 |
| Bloque `<style>` CSS | los 235 — es el que inyecta `injectThemeIntoSvg` |
| `tspan` (texto multilínea) | 222 ficheros · 12 599 |
| `transform`, `stroke-dasharray`, `fill-opacity` | habituales, sin nada exótico |
| `<image>` incrustada | solo 2 ficheros |
| Tipografía declarada | **`Arial, sans-serif` y ninguna otra** |

**Todo lo que rompe los conversores SVG→PDF está ausente.** El vocabulario es pequeño y convencional. Quedan dos puntos a resolver, ambos conocidos:

1. **El bloque `<style>`**, que muchos conversores ignoran porque solo honran atributos de presentación. Es *nuestro propio* estilo inyectado, con una sola regla: se puede volcar a atributos antes de convertir.
2. **Los marcadores**, que son lo único que hay que verificar con una prueba real.

Y una consecuencia excelente: al ser todo **Arial**, que PDF trae de serie como Helvetica, **el texto sale seleccionable y buscable sin incrustar tipografías**. Para un BPA que indexa documentos, eso es una función que no pidieron.

> No confundir con el caso del thumbnail, donde rasterizar y *perder* el texto extraíble se contaba como ventaja de privacidad. Allí el thumbnail se sirve solo; aquí el PDF lo exporta el usuario deliberadamente para publicarlo.

### El hallazgo que cambia el criterio: el PDF de hoy es una foto

`useExport.ts` rasteriza antes de meter nada en el PDF:

```ts
const dataUrl = await svgToDataUrl(themedSvg, 2, bg)   // SVG → PNG
pdf.addImage(dataUrl, 'PNG', x, margin + 12, w, h)     // un BITMAP
```

El PDF lleva un mapa de bits. Al ampliar en el visor se ve borroso —y con [EXP-017](../../experience/017-el-thumbnail-webp-salia-borroso-por-el-tamano-intrinseco-del-svg.md) sin corregir en este camino, es un bitmap 1× ampliado, borroso sobre borroso—, el texto no se puede seleccionar ni buscar, y el fichero pesa de más.

**Esto reencuadra la legibilidad entera.** Un diagrama a 3.9 pt impreso en papel es ilegible y no hay vuelta. El mismo diagrama en un PDF **vectorial**, en el visor de Drive donde ellos lo consumen, se lee ampliando. La pregunta deja de ser *"¿cabe legible en la hoja?"* y pasa a ser *"¿cabe, y se puede ampliar sin pérdida?"*.

Comprobado en el código, no supuesto: **`addSvgAsImage` de jsPDF tampoco sirve** — su propia documentación dice *"Parses SVG XML and saves it as image into the PDF. Depends on canvas-element and canvg"*, y `canvg` está instalado como dependencia opcional. Vector real exige **`svg2pdf.js`**, que no está en el árbol. Es la única dependencia nueva de todo el plan.

---

## Decisiones de diseño

### D-A · El cajetín es un marco de documento, no contenido del diagrama

No se dibuja como elementos BPMN. Si entrara en el modelo: contaminaría `current_xml` y el `.bpmn` exportado a otros modeladores, participaría en el routing y en el binding de colaboración —la pieza más delicada del sistema—, alguien lo movería o lo borraría sin querer, y en un lienzo con paneo infinito "la parte superior" deja de existir en cuanto arrastras.

Se dibuja **en la exportación**, y opcionalmente como **capa superpuesta no interactiva** en el lienzo. Ese patrón ya existe en el proyecto: `StickyLaneLabelsModule` ancla etiquetas al viewport fuera del modelo ([`patrones-ui-sticky-lane.md`](../../context/patrones-ui-sticky-lane.md)).

Vocabulario deliberado: **cajetín**, no "cabecera de la empresa". Es un elemento estándar de documentación técnica, y eso despersonaliza la conversación siendo además cierto.

### D-B · Tres capas separadas

| Capa | Qué | Dónde | Por qué ahí |
|---|---|---|---|
| **Datos** | código, revisión, tipo, distribución, autor, aprobador, clasificación | atributos `flujo:` en el XML del diagrama | mismo patrón que `flujo:groupColor`, `flujo:phaseColor`, `flujo:linkedDiagram`. Viaja con el diagrama, sobrevive a la colaboración, va dentro de `current_xml` protegido por CAS, y **va y vuelve por `.bpmn` sin pérdida** |
| **Plantilla** | logo, qué campos existen, sus etiquetas, la maqueta, tamaño de hoja por defecto | **proyecto** | es el estándar; se comparte por `project_collaborators` y los responsables lo heredan |
| **Render** | pintar el cajetín | solo exportación (y overlay opcional) | el modelo BPMN no se toca |

Consecuencia elegante: **el `.bpmn` lleva los datos pero no el dibujo del cajetín.**

### D-C · La unidad es el proyecto, no el usuario

Se descartó "personalización por usuario", que era la idea inicial. Tres razones:

1. Ocho responsables configurando cada uno lo suyo → **deriva**, y un estándar que deriva deja de ser un estándar.
2. **Hoy "por usuario" es en realidad "por navegador"**: `SupabaseRepository.getPreferences` dice literalmente *"Preferencias: locales por dispositivo"*. Cambian de portátil y lo pierden.
3. Alguien nuevo tendría que reconstruirlo mirando una captura.

El nivel de usuario se conserva **solo como valor por defecto** para quien no trabaja dentro de un proyecto: el estudiante, el usuario suelto. Cascada: usuario → proyecto → diagrama.

**Construido el 2026-09-01** (`utils/localDocumentHeader.ts`). El nivel de usuario vive en `localStorage`, **no** en `UserPreferences`: aquéllas viajan por el repositorio y en la nube son una fila de producción, así que añadirles un campo es un cambio de esquema — y meterles un logo en base64 sería además cargar una fila que se lee al arrancar. La plantilla de un diagrama suelto no la comparte nadie, porque un diagrama suelto no lo comparte nadie.

Y ahí el logo va **por valor, no por referencia**, porque no hay alternativa: la biblioteca de imágenes es *por proyecto*, así que sin proyecto no hay nada a lo que apuntar. Se guarda un solo logo —el actual— y se sustituye al cambiarlo. La separación entre los dos caminos está forzada por construcción: `parseStoredDocumentHeader`, el único camino por el que entra una plantilla desde Postgres o IndexedDB, **descarta `logoDataUrl` siempre**.

### D-D · El logo reutiliza la biblioteca de imágenes

No hace falta infraestructura nueva: ya existen la tabla `images`, `SupabaseImageRepository` y el bucket. Un logo es una imagen más.

**Ratificado el 2026-08-27**, al preguntarse si convenía guardarlo aparte. Sigue siendo lo correcto por tres motivos: la plantilla guarda una **referencia** (`logoImageId`) y meter el base64 en `projects.doc_template` cargaría la consulta de la portada, que es la trampa que PLAN-012 desmontó; la subida, los permisos por RLS, el borrado y la sincronización ya existen ahí; y el ámbito coincide — un logo es del proyecto entero, igual que la biblioteca.

Lo que **sí** cambia es por dónde se trae: se importa desde el propio panel de la cabecera (`DocumentLogoField`), no abriendo la galería. La biblioteca es un modal y el panel vive dentro de otro. Entra en una carpeta «Logos» creada al vuelo, y **como PNG sin pérdida**, no como el WebP con pérdida del resto de la biblioteca.

### D-E · Una sola imagen, y por eso el vector va primero

Decidido por el usuario el 2026-08-22: **el diagrama entero en una sola imagen**, no repartido en hojas.

Eso no es solo una preferencia estética, **es lo que fija el orden de las fases**. Encajar el diagrama completo en una página siempre es posible; lo que no es posible con un ráster es que además se lea. El mosaico existía únicamente porque un mapa de bits congela la resolución.

Con salida **vectorial** el problema se disuelve: una página, el diagrama completo, y quien lo lea amplía cuanto quiera sin pérdida. La medición de legibilidad deja de ser un veredicto y pasa a ser información — *"a tamaño natural esto son 3.9 pt; amplía al 200 % para leerlo"*.

Por eso el vector deja de ser la fase 3 y pasa a la **fase 1**, y el mosaico se descarta.

Sigue habiendo un caso donde la medición manda: **quien imprima en papel**. Ahí no hay zoom, y ahí valen el selector de hoja y el indicador en puntos. Pero es el caso minoritario: su BPA sirve PDFs en un visor de Drive.

### D-F · Se publica sin plantilla por defecto

Ningún logo en el repositorio. Como mucho, un ejemplo neutro tipo "cajetín ISO genérico". El logo de la empresa es un dato que ellos suben a su proyecto.

---

## Fases

### Fase 0 · Prueba de vector *(medio día, y condiciona todo)*

Antes de comprometer nada: convertir con `svg2pdf.js` una **muestra de los 235 SVG reales ya respaldados** y comprobar tres cosas.

1. Que los **marcadores** (puntas de flecha) salen — es lo único no trivial del vocabulario.
2. Que el bloque `<style>` inyectado se honra o, si no, que volcarlo a atributos de presentación lo resuelve.
3. Que el texto queda **seleccionable** y que no hace falta incrustar tipografías (todo es Arial).

Se hace contra ficheros que ya están en disco, así que no necesita ni la app ni la red. **Si falla, la fase 1 cae al plan B** —ráster de alta resolución, ver abajo— y el resto del plan no se mueve.

### Fase 1 · Una sola imagen, ampliable

El corazón, y va primero por D-E.

1. **Salida PDF vectorial** con `svg2pdf.js`: el diagrama completo en una página, ampliable sin pérdida, texto seleccionable y buscable, fichero ligero.
2. **Cierra [EXP-017](../../experience/017-el-thumbnail-webp-salia-borroso-por-el-tamano-intrinseco-del-svg.md) en el camino PDF**, porque desaparece el ráster. El camino **PNG sigue con el defecto** y hay que arreglarlo aparte: fijar `width`/`height` del SVG antes del `Blob`, igual que en el thumbnail.
3. **Plan B si la fase 0 falla:** mantener el ráster pero rasterizando de verdad a la resolución objetivo. Hoy son ~250 DPI efectivos por culpa de EXP-017; arreglado, la misma escala 2 da ~500 DPI, suficiente para ampliar y leer. Peor que el vector —sin texto seleccionable y con ficheros más pesados— pero sin dependencias nuevas.

### Fase 2 · El cajetín existe y se puede rellenar

Lo que pidieron por correo.

1. **Modelo de datos.** Atributos `flujo:doc*` en el XML por diagrama. Plantilla por proyecto: requiere **una columna nueva** (p. ej. `projects.doc_template jsonb`) → **cambio de esquema: aprobación explícita y laboratorio primero.**
2. **Panel "Documento"** en la barra de propiedades, con los campos que declare la plantilla. Autorrellenables donde tenga sentido: nombre del diagrama, fecha de `updated_at`, autor del perfil.
3. **Cajetín dibujado en el PDF**, con la maqueta de tres celdas. Se dibuja con las primitivas de jsPDF, así que es vectorial vaya o no vaya el diagrama en vector: las dos fases no se estorban.
4. **Selector de hoja**: Carta / A4 / A3 × vertical / apaisada / **diagrama girado 90°**, con márgenes de dibujo configurables. Hoy `format: 'a4'` está cableado y en Venezuela la hoja de uso corriente es Carta.
5. Por defecto, según lo medido: **Carta apaisada con márgenes de dibujo reducidos** — 49 % utilizable frente al 25 % de su configuración actual.

### Fase 3 · Vista Documento

La previsualización, que es lo que convierte esto en una función y no en un formulario.

- Muestra **la página tal cual va a exportarse**: tamaño y orientación reales, cajetín dibujado, diagrama encajado a escala real.
- **Los campos se editan ahí mismo**, sobre la previsualización.
- **Indicador de legibilidad en vivo**, en puntos. Con vector deja de ser una alarma y pasa a ser información útil: *"a tamaño natural, 3.9 pt — amplía para leer"*, y sigue siendo un veredicto real para quien vaya a imprimir.
- Complemento honesto: *"este diagrama necesita proporción 3.3:1; la hoja elegida da 1.60"*.

### Fase 4 · Cajetín en el lienzo

Capa superpuesta no interactiva, activable, con el patrón de `StickyLaneLabelsModule`. Responde a *"que se genere en la sección superior"* sin meter nada en el modelo.

**Dónde se dibuja, y por qué ahí.** Justo encima del contenido y abarcando su anchura, que es donde caerá impreso: en la hoja la banda ocupa el ancho de la zona de dibujo y el diagrama se ajusta a ese mismo ancho, porque el límite es siempre el ancho (mediana 2,40:1 contra 1,79 de la mejor hoja). La proporción alto/ancho se toma de la hoja por defecto; la medida exacta de cada hoja la da la Vista Documento, que es la que manda.

**Cuando no cabe encima, se solapa traslúcida.** Con un diagrama ancho la banda mide más que el aire que suele quedar sobre el contenido. Antes que mover los elementos del usuario por decisión nuestra, la banda se apoya en el origen del lienzo y se vuelve traslúcida: se solapa, pero no esconde nada.

**Lo que la prueba defiende.** `DocumentFrame.$inject` es exactamente `['eventBus', 'canvas', 'elementRegistry']`, y hay una comprobación que falla si alguien añade `modeling`, `bpmnFactory`, `elementFactory`, `commandStack` o `moddle`. Inyectar cualquiera de esos es la señal de que se va a crear un elemento, y eso es justo lo que D-A prohíbe.

El interruptor vive en **Ver → Cabecera de documento** y es una preferencia de vista: no cambia lo que se exporta ni lo que se guarda. **Nace apagada**: el lienzo es para dibujar, y la cabecera pertenece al documento.

### Fase 5 · Replanteo de la experiencia, y el nombre de la norma

La fase 3 dejó la función completa y la experiencia repartida entre tres sitios: la barra de propiedades para escribir los datos, el diálogo de exportación para encender la cabecera, y la hoja para corregir. Se sentía como navegar, no como componer un documento.

**El nombre sale de la norma, no de nosotros.** [ISO 7200:2004](https://www.iso.org/standard/35446.html) —*«Data fields in title blocks and document headers»*, UNE-EN ISO 7200 en español— cubre **dos** objetos y conviene no confundirlos: el *cuadro de rotulación* va en el ángulo inferior derecho de un plano con 180 mm de ancho, y la *cabecera de documento* es la banda superior a todo el ancho. Lo que se construyó aquí es lo segundo, así que se llama **cabecera de documento (ISO 7200)** y no «cajetín». `titleBlock.ts` pasó a `documentHeader.ts` en el mismo movimiento: nada estaba commiteado, así que el renombrado salió sin historia sucia.

**Un catálogo de campos con su procedencia declarada** (`utils/iso7200.ts`). Cada campo dice si es de la norma, si la norma lo hace obligatorio, y con qué control se rellena. Los cuatro que vienen de la práctica de calidad y no de ISO 7200 —revisión, tipo, clasificación, distribución— se marcan como tales, para que nadie los defienda citando una norma que no los contiene.

**Y tres opcionales de la norma se quedaron fuera por su nombre**: *título suplementario*, *referencia técnica* y *departamento*. Que un campo esté en la norma no lo hace útil aquí; añadirlo es añadir un hueco que alguien tiene que rellenar, así que la carga de la prueba la tiene el campo, no su ausencia. El peor de los tres era *referencia técnica*: suena a un código y en ISO 7200 significa «la persona de contacto» — un rótulo que engaña es peor que la falta del campo. El catálogo queda en 10. Las **longitudes máximas que la norma sí especifica no están cableadas**: no se pudo leer el texto normativo, y un límite inventado es peor que ninguno.

**Ningún campo de texto que pueda no serlo.** La regla, que es del usuario: *si la norma fija los valores, son esos; si no los fija, se escribe.*

| Campo | Control | Por qué |
|---|---|---|
| Estado del documento | lista cerrada | **La norma fija los cuatro valores.** Es el único caso |
| Fecha de edición | calendario + «automático» | Una fecha es una fecha. El automático toma la última modificación |
| Título | texto, con el nombre del diagrama de sugerencia | La norma no fija el contenido |
| Nº de identificación | texto | **ISO 7200 no define su composición.** Inventarle una gramática de segmentos sería convertir la herramienta en el formato de una empresa |
| Creado por / Aprobado por | personas del proyecto | Se elige, no se escribe. Sin nadie conocido, cae a texto |
| Revisión | contador | Sube y baja; nunca se teclea |
| Nº de hoja | **calculado** | La norma lo exige y la herramienta lo sabe: pedirlo sería pedir que alguien se equivoque |

**Un solo recorrido vertical.** El diálogo pasa a una columna, en el orden en que se decide: qué archivo → qué hoja → cómo va a quedar → la cabecera a tamaño de trabajo. Sin barra lateral, sin pasos y sin nada que buscar en otra pantalla. El panel de la barra derecha **desaparece**.

**La hoja deja de editarse y el editor es la propia cabecera.** La hoja tiene un solo trabajo —decir la verdad sobre cómo queda impreso— y debajo se dibuja el mismo objeto del tamaño en que se puede rellenar. No copia las proporciones impresas: a tamaño de trabajo la celda derecha real deja 195 px y un calendario no cabe. Las medidas de verdad están acotadas arriba.

**La hoja manda, y todo lo demás cede sitio.** El recorrido sigue siendo el mismo, pero el reparto del espacio no: la previsualización es lo que se viene a ver, así que los mandos se comprimen en un riel de 26 px, la cabecera a tamaño de trabajo **nace plegada** —se abre al marcar «incluir cabecera», que es cuando se decide— y las medidas dejan de apilarse debajo del papel para ir en una **columna al margen**, que es donde van las anotaciones en un plano. El motivo es geométrico: una hoja apaisada está limitada por el alto, así que cada bloque debajo le quitaba lo escaso mientras 700 px se quedaban en blanco a los lados.

**La plantilla del proyecto vive detrás de un botón**, porque se toca una vez: qué campos lleva la cabecera y qué logo. Se guarda `fields` —la lista de campos— y **no las etiquetas**: salen traducidas del catálogo, así que una plantilla no queda en español dentro de un proyecto en inglés.

---

### Fase 6 · El taller de documento

La fase 5 dejó **una columna de suma cero**: alto fijo y todo apilado en el mismo eje, así que cada bloque que aparecía le quitaba alto a la hoja. Encender la cabecera metía 180 px de editor y la previsualización caía de 745×576 a 490×380 — se hacía pequeño justo lo único que se viene a mirar. El usuario lo reportó tres veces con captura, y la tercera con la corrección exacta: *«no tanto la modal, sino la sección de previsualización»*.

**Dos zonas con ejes independientes**, y eso es toda la idea:

- **El escenario** es la hoja: se lleva el sobrante y no encoge nunca. `Encajar` juzga la composición; `100 %` juzga la letra —un píxel CSS es 1/96 de pulgada por definición del estándar, así que a esa escala lo que se ve mide lo que medirá—; ampliada se arrastra con el puntero.
- **El inspector** lleva lo que se decide, en secciones plegables y **con su propio scroll**. Añadir campos alarga esa columna; no estrecha la hoja.

**La réplica de la cabecera «a tamaño de trabajo» desaparece.** Existía porque la hoja era diminuta y sus celdas de 3 mm no se podían pulsar (EXP-019); con la hoja grande, dos representaciones del mismo objeto solo repartían la atención. Los campos son ahora filas del inspector, con el mismo control por campo que fijaba el catálogo.

**Tres comodidades que se pedían a mano cada vez:** lo elegido se recuerda en el navegador —hoja, orientación, margen, giro, tema, resolución y qué secciones quedaron abiertas—, el nombre del fichero se puede escribir, y un diagrama vacío se dice **antes** de pulsar en vez de fallar después con un error sin traducir.

Lo que **no** entra, por decisión del usuario: varias hojas. El PDF sigue siendo de una, y el «nº de hoja» sigue fijo en 1/1. Los diagramas se consumen en digital, así que ampliar sustituye a paginar.

---

## Dependencias y colisiones

| Con | Qué pasa |
|---|---|
| [EXP-017](../../experience/017-el-thumbnail-webp-salia-borroso-por-el-tamano-intrinseco-del-svg.md) | Está **activo** por el camino de exportación. La fase 3 lo resuelve para PDF al pasar a vector; **PNG sigue pendiente** |
| [EXP-021](../../experience/021-la-cabecera-en-el-lienzo-se-solapa-con-el-diagrama.md) | **Activo, y es de este plan.** La cabecera de la fase 4 se dibuja encima del diagrama cuando el contenido empieza arriba; el PDF nunca lo hace. Arreglo diseñado y escrito, aplazado el 2026-09-01 para desplegar antes lo ya probado. **Bloquea el criterio de aceptación 8** |
| **[MASTER-PLAN-027](027-master-plan-modulo-diagramas-de-arquitectura.md) D5** | Colisión real: D5 decidió "preset editable por el usuario, persistido en el navegador". Es **la misma familia de decisión**. Si esto se construye aparte, habrá dos sistemas de personalización que divergen. La capa de presentación debería formar parte del contrato de módulos de su fase 0 — **decidir una vez, no dos** |
| [PLAN-012](012-thumbnails-webp-y-entrega-segura.md) | Comparte `useExport.ts` y el helper de rasterizado. Ya cerrado en su parte de thumbnails |
| Esquema | La fase 1 necesita una columna en `projects`. Aprobación explícita + laboratorio |

## Riesgos

**Que crezca hacia el gestor documental.** El BPA sirve PDFs de Drive; la tentación de "ya que estamos, subimos el PDF automáticamente" o "guardamos el histórico de revisiones" convierte un modelador en un DMS. La frontera: **mc-modeler produce la página; ellos la publican.** Superficie de integración cero.

**Que el cajetín acabe en el modelo.** Es el atajo obvio y rompe el `.bpmn`, el routing y la colaboración. Ver D-A.

**Que se cablee "solo esta vez".** Un logo por defecto, un formato de código en el validador, un campo obligatorio con su nombre. Cada uno parece inocente y junta los convierte en un producto interno.

**Que `svg2pdf.js` no aguante los marcadores.** Es el único riesgo técnico real y por eso existe la fase 0, que lo despeja en medio día contra ficheros reales antes de comprometer nada. Mitigación si falla: el plan B de ráster a resolución real, que ya está descrito.

**Que se acepte el ráster "por ahora".** Sin vector, una sola imagen y legible son incompatibles para la mitad de los diagramas, por bien que se elija la hoja. Si la fase 0 sale mal, el plan B es aceptable; lo que no lo es es quedarse con el ráster actual, que además arrastra EXP-017.

## Criterios de aceptación

1. Borrando la plantilla de un proyecto, la app sigue funcionando y exporta sin cajetín.
2. **No hay ningún logo ni formato de empresa en el repositorio.** `grep` del nombre de la empresa en `src/` y `docs/`: cero.
3. Un diagrama exportado a `.bpmn` y reimportado conserva los datos del documento **y no contiene ningún elemento de cajetín**.
4. El mismo diagrama exportado a `.bpmn` y abierto en otro modelador no muestra basura.
5. La Vista Documento indica el tamaño de letra en puntos, y cambiar la hoja lo actualiza al instante.
6. Cambiar de dispositivo conserva la plantilla del proyecto (es la prueba de que no quedó en preferencias locales).
7. El PDF de la fase 3 permite **seleccionar el texto** del diagrama.
8. **La cabecera en el lienzo nunca se dibuja encima del diagrama.** Es lo que hace el PDF —`placement()` reserva el hueco y baja el dibujo—, y una vista que dice representar la hoja no puede enseñar una composición que la exportación no produce. **Sin cumplir**: ver [EXP-021](../../experience/021-la-cabecera-en-el-lienzo-se-solapa-con-el-diagrama.md), que lleva el arreglo entero escrito.

## Despliegue a producción

> Redactado el 2026-09-01 sobre el estado **verificado** ese día. No ejecutado.
> Los pasos 4 y 6 son irreversibles en la práctica y necesitan aprobación
> explícita, cada uno por separado.

### Estado de partida, comprobado

| Qué | Cómo se comprobó | Resultado |
|---|---|---|
| El trabajo está **sin commitear y sobre `main`** | `git status`, `git branch` | 28 ficheros modificados, 32 nuevos, rama `main` — **la que despliega** |
| Todo es de PLAN-034, sin mezcla | revisión de los diffs uno a uno | sí. El cambio de `thumbnailUtils.ts` es solo sacar `setSvgPixelSize` a `svgRaster.ts`, que este plan necesitaba |
| `projects.doc_template` en producción | `information_schema.columns` | **NO existe**. La tabla tiene 6 columnas: `id, owner_id, name, created_at, updated_at, deleted_at` |
| Migraciones aplicadas en producción | historial de migraciones | la última es `20260813225135_bucket_thumbnails_5mb`. **Falta `20260823000000`** |
| `showDocumentHeader` ¿necesita migración? | `SupabaseRepository.getPreferences` | **No.** Delega en el repositorio local: las preferencias son por dispositivo |
| ¿Reincide en EXP-018? | `flujo.json` | **No.** `DocumentMeta` se declara **sin `extends`** y se ancla por `extensionElements`, que es la vía correcta |
| Verificación en verde | `lint`, `test`, `build` | 393 pruebas / 35 ficheros, `--max-warnings 0`, build correcto |

### La trampa: `supabase db push` NO se ejecuta a ciegas

El historial de producción **no contiene `20260813000000_baseline_produccion`**, que sí está en `supabase/migrations/`. Ese fichero es un **volcado por introspección** hecho para el laboratorio (EXP-016): reproduce el esquema desde cero. Producción llegó a ese esquema por la vía larga —las 35 migraciones reales—, así que nunca registró el baseline.

Un `db push` a secas vería ese hueco e intentaría aplicar el volcado **sobre una base que ya tiene todo**. Antes de empujar nada hay que cerrar el hueco.

### El orden, y por qué es ese

**Primero la base de datos, después el código.**

- **Migración antes que código**: no rompe nada. Es puramente aditiva —`add column if not exists` sin `default`, dos `grant`, un `comment` y un `analyze`—; sin `default`, Postgres no reescribe ninguna fila y la operación es de metadatos. El código actual en producción no conoce la columna y no la toca.
- **Código antes que migración**: rompe en silencio, que es lo peor. `getProjectDocTemplate` hace `select('doc_template')`; sin la columna, PostgREST devuelve error, y el `.catch()` de `App.tsx` —que existe para que una plantilla rota no impida trabajar— **se lo traga**. Resultado: la cabecera no funciona para nadie y no hay ni un error a la vista.

---

### Paso 0 · Preflight

```bash
npm run lint && npm run test && npm run build
git fetch origin && git status
```

Los tres en verde y `main` local al día con `origin/main`. Si alguien más tiene trabajo en vuelo sobre los mismos ficheros, se resuelve antes.

### Paso 1 · Salir de `main`

```bash
git checkout -b plan-034-vista-documento
```

**Nada se commitea sobre `main`.** `main` despliega a producción: un commit ahí es una publicación.

### Paso 2 · Commits

Reparto sugerido, por unidad de revisión:

| # | Asunto | Ficheros |
|:-:|---|---|
| 1 | `feat(export): render the PDF page with the diagram as vector` | `pageLayout`, `pdfDocument`, `svgRaster`, `thumbnailUtils`, `useExport`, `package.json` (`svg2pdf.js`), sus pruebas |
| 2 | `feat(bpmn): anchor document data without touching the model` | `documentMeta`, `flujo.json`, `extensionCasing.test`, `config.ts`, `useBpmnModeler`, `PropertiesPanel`, `RightPanel` |
| 3 | `feat(doc-header): the ISO 7200 header, its template and its storage` | `documentHeader`, `iso7200`, `fieldLabels`, i18n, los tres del patrón repositorio, `domain/types`, **la migración** |
| 4 | `feat(export): the document workshop` | `ExportModal`, `DocumentSheet`, `DocumentFieldControl`, `DocumentHeaderTemplatePanel`, `Picker`, `exportPreferences`, `index.css`, `App.tsx` |
| 5 | `fix(doc-header): stop jsPDF mangling the logo, and measure its real aspect` | `logoImage`, `DocumentLogoField`, `ImageThumb` |
| 6 | `feat(doc-header): a template for diagrams outside any project` | `localDocumentHeader` + su prueba |
| 7 | `feat(canvas): show the document header on the canvas` | `DocumentFrameModule` + prueba, `MenuBar`, `BpmnCanvas`, `preferencesStore` |
| 8 | `docs: PLAN-034 and EXP-018 to EXP-021` | `docs/`, `.gitignore`, `vite.config.ts` |

**Advertencia honesta:** el reparto es para *revisar*, no para *bisecar*. Los ficheros dependen unos de otros y los commits intermedios probablemente no compilen. **Solo la punta está verificada en verde.** Quien necesite bisectabilidad real, que haga un solo commit; es preferible a prometer una garantía falsa.

### Paso 3 · Rama remota y PR

```bash
git push -u origin plan-034-vista-documento
gh pr create --base main
```

El PR es el punto donde se revisa. No se mezcla hasta que el paso 5 esté verde.

### Paso 4 · La migración · **REQUIERE APROBACIÓN EXPLÍCITA**

Producción es viva: 185 diagramas, 36 personas, 19 proyectos. Regla #2 del proyecto.

Lo que se aplica es `supabase/migrations/20260823000000_projects_doc_template.sql`, ya probado y verificado **en el laboratorio** (10/10, incluida la comprobación como usuario real con `anon` + sesión, que es lo que destapó el 403 de grants).

**Ruta A — CLI, la recomendada.** Cierra primero el hueco del baseline:

```bash
supabase migration repair --status applied 20260813000000
supabase db push --dry-run     # DEBE listar SOLO 20260823000000
supabase db push
```

El `--dry-run` no es opcional: es lo que confirma que el `repair` funcionó. Si lista el baseline, **parar**.

**Ruta B — a mano**, si el CLI no está enlazado a producción: ejecutar el SQL del fichero en el editor y registrar la versión, para que el historial no vuelva a desalinearse:

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('20260823000000', 'projects_doc_template')
on conflict do nothing;
```

Sin corte de servicio: `add column` sin `default` es metadatos, y `analyze` sobre 19 filas es instantáneo.

### Paso 5 · Verificar en producción

```sql
-- 1 · la columna existe
select column_name from information_schema.columns
 where table_schema='public' and table_name='projects' and column_name='doc_template';

-- 2 · es escribible: deben salir `authenticated` y `anon`
select grantee, privilege_type from information_schema.column_privileges
 where table_schema='public' and table_name='projects' and column_name='doc_template';

-- 3 · LA QUE IMPORTA: `owner_id` sigue sin UPDATE. Debe devolver CERO filas.
select grantee from information_schema.column_privileges
 where table_schema='public' and table_name='projects'
   and column_name='owner_id' and privilege_type='UPDATE';
```

La 3 es la que protege lo que los grants por columna existen para proteger: que nadie se apropie de un proyecto reescribiendo su dueño (migración `0028`). La 2 es la que faltaba y daba `403 permission denied for table projects` — error de **GRANT**, no de política.

Después, los avisos de seguridad y de rendimiento del proyecto.

### Paso 6 · Mezclar · **es el despliegue**

Mezclar el PR a `main`. Vercel construye y publica. A partir de ese momento está en manos de los usuarios.

### Paso 7 · Humo en producción

1. Diagrama **en un proyecto** → Exportar → PDF: la cabecera sale con su logo, **sin deformar y sin fondo negro** (EXP-020).
2. Cambiar la plantilla → recargar → **persiste**. Es la prueba de que el grant funcionó; sin él el cambio se veía en pantalla y no se guardaba.
3. Diagrama **suelto** → plantilla de este navegador, logo por valor → recargar → persiste.
4. Diagrama compartido **en solo lectura** → sale la nota `readOnly` y no deja tocar la plantilla.
5. **Modo local sin `VITE_SUPABASE_*`**: la app funciona entera. Es la regla que no se rompe.
6. `.bpmn` exportado y reimportado conserva los datos del documento; abierto en otro modelador, sin basura (criterios 3 y 4).
7. **La portada no se ralentiza.** `doc_template` no está en `PROJECT_LIST_COLUMNS` y no debe entrar nunca.

### Vuelta atrás

- **Código**: Vercel, retroceso instantáneo a `0af855c`.
- **Base de datos**: **no se revierte.** Un `drop column` borraría las plantillas que la gente ya haya creado. Una columna nula es inerte para el código anterior, así que dejarla no cuesta nada. Es la asimetría de siempre: el código se retira, los datos no.

### Lo que este despliegue NO lleva

| Qué | Estado |
|---|---|
| [EXP-021](../../experience/021-la-cabecera-en-el-lienzo-se-solapa-con-el-diagrama.md) — la cabecera del lienzo solapa el diagrama | documentado con el arreglo entero, aplazado a propósito |
| [EXP-018](../../experience/018-extender-un-tipo-concreto-de-bpmn-corrompe-el-nombre-del-elemento.md) — 139 diagramas con XML no canónico | **activo y ajeno**. Este plan no lo introduce ni lo arregla |
| [EXP-017](../../experience/017-el-thumbnail-webp-salia-borroso-por-el-tamano-intrinseco-del-svg.md) en el camino PNG | activo. La fase 1 lo resolvió para PDF, no para PNG |
| El backfill de thumbnails de [PLAN-012](012-thumbnails-webp-y-entrega-segura.md) | pendiente, de su plan |

Y cerrar PLAN-034 sigue necesitando, además de esto, el **visto bueno visual y la aprobación explícita del usuario**.

## Registro de ejecución

| Fecha | Qué | Resultado |
|---|---|---|
| 2026-08-22 | Medición completa antes de diseñar | 177 diagramas de producción y 235 SVG exportados. Geometría del estándar leída del `.docx`. Verificado en el código que `addSvgAsImage` de jsPDF también rasteriza |
| 2026-08-23 | **Fase 0 · prueba de vector: PASA, sin plan B** | 10 SVG reales convertidos con `svg2pdf.js` 2.7.0 (peer `jspdf ^4.0.0`, compatible). Cero imágenes incrustadas, fuentes base-14 sin incrustar, texto extraíble (*"Proceso de facturación"*), 610–1 806 trazos por fichero → los marcadores dibujan. **El `<style>` inyectado se honra tal cual**: la salida con y sin inlinear es byte a byte idéntica, así que ese paso previsto se descarta. 128–201 ms |
| 2026-08-23 | **Fase 1 · exportación vectorial** | `pdfDocument.ts` con carga diferida de `jspdf` y `svg2pdf.js`. **Efecto colateral: el bundle principal baja de 1 857 kB a 1 466 kB (−21 %)**, porque jsPDF ya no entra al arranque. `svg2pdf` **no tiene opción de rotación** —comprobado en sus tipos—, así que el giro de 90° se hace rotando el SVG en el origen (`rotateSvgQuarterTurn`). EXP-017 corregido también en el camino PNG. Verificado de punta a punta contra producción: 16/16 PDFs, 0 problemas, hoja correcta en las 4 variantes |
| 2026-08-23 | **Fase 1 · los PDF salían sin comprimir** | Al inspeccionar un PDF generado: 173 flujos de contenido, **ninguno comprimido**. `new jsPDF({ compress: true })` lo arregla: **265 kB → 55 kB**. Frente al ráster que hay hoy en producción para el mismo diagrama (1 765 kB), son **32× menos** |
| 2026-08-23 | **[EXP-018](../../experience/018-extender-un-tipo-concreto-de-bpmn-corrompe-el-nombre-del-elemento.md) descubierto al implementar la fase 2** | El primer intento ancló los datos del cajetín con `extends: ["bpmn:Definitions"]` y una prueba existente cazó que el elemento raíz salía `<bpmn:Definitions>`. Al medirlo salió algo mayor: **extender cualquier tipo concreto rompe su nombre**, y las tres extensiones que ya existían dejaron **139 de 177 diagramas de producción con `<bpmn:SequenceFlow>`**, 40 con `<bpmn:Group>` y 20 con `<bpmn:SubProcess>`. **PLAN-034 no lo introduce ni lo arregla**: usa `extensionElements` con un tipo suelto, que es la vía correcta y no toca ningún descriptor |
| 2026-08-23 | **Fase 2 · datos y cajetín** | `flujo:DocumentMeta` en `extensionElements` con roundtrip probado; `titleBlock.ts` con las medidas reales del `.docx` (40.0 │ 74.6 │ 50.3 mm) y **sin logo ni marca por defecto**; migración `20260823000000_projects_doc_template` aplicada y verificada **solo en el laboratorio** (8/8 comprobaciones); panel "Documento" en el hueco de "sin selección"; selector de hoja en el modal. Cajetín verificado en el PDF real: su código aparece **como texto**, añade operadores y reserva sitio al diagrama |
| 2026-08-23 | **Fase 3 · Vista Documento** | La primera entrega no valía: no había previsualización visible —solo se montaba con el formato en PDF, y el formato por defecto era `.bpmn`— y el cajetín **no se podía encender desde ninguna parte**, porque `DEFAULT_TITLE_BLOCK.enabled` es `false` y ninguna interfaz lo tocaba. Rehecho: el modal a dos columnas con la hoja siempre delante, `DocumentSheet` acotada como un plano (cotas en mm, guías de margen, celdas editables pulsándolas) y un **espécimen a tamaño real** con un rótulo de verdad del diagrama compuesto al tamaño exacto en puntos que tendrá impreso — el número solo no dice nada, las letras sí |
| 2026-08-23 | **403 al guardar la plantilla, y por qué la verificación no lo vio** | `PATCH /rest/v1/projects` → `permission denied for table projects`, que es error de **GRANT** y no de política: el UPDATE de esa tabla se concede columna a columna para que nadie reescriba `owner_id` (migración `0028`), así que una columna nueva no la escribe nadie hasta tener su `grant update (doc_template)`. `verificar-migracion-lab.mjs` usaba `service_role`, que **se salta los grants por columna**, y daba 8/8 con la función rota. Ahora comprueba también como usuario real (`anon` + sesión) y que `owner_id` sigue prohibido: 10/10 |
| 2026-08-23 | **Fase 4 · cajetín en el lienzo** | `DocumentFrameModule`: capa HTML sobre el contenedor del canvas, `pointer-events: none`, con interruptor en **Ver → Cajetín del documento** (preferencia de vista: no cambia lo que se exporta ni lo que se guarda). 20 pruebas nuevas, y la que importa comprueba que la inyección sigue siendo `['eventBus','canvas','elementRegistry']`: añadir `modeling` o una fábrica es la señal de que se va a crear un elemento, y eso es lo que D-A prohíbe. Dos defectos propios encontrados al probarlo: el guardia del `requestAnimationFrame` bloqueaba todo repintado posterior si el callback corría antes de devolver el id, y el viewport se medía por el `clientWidth` de una capa recién creada en vez de por el viewbox |
| 2026-08-23 | **La hoja no se podía editar con el diagrama delante** | Playwright lo cazó al intentar pulsar una celda: *`<img class="sheet__diagram"> intercepts pointer events`*. La imagen de la previsualización es decoración y se estaba quedando los clics de las celdas editables — con el diagrama girado su caja tapa la banda entera. `pointer-events: none` en la imagen y `z-index` en la banda |
| 2026-08-23 | **En la hoja solo se podía escribir una letra** | Encontrado con Playwright: `elementHandle.press: Element is not attached to the DOM`. La celda editable estaba declarada **dentro** de `DocumentSheet`, así que cada pulsación cambiaba el borrador, la hoja se volvía a renderizar y React veía un **tipo de componente nuevo**: desmontaba el `<input>` y montaba otro, perdiendo el foco. Sacada al ámbito del módulo, con el foco pedido por la propia celda. Es el segundo defecto de esta clase que aparece por probar la interfaz de verdad y no solo por leerla |
| 2026-08-23 | **Fase 5 · el nombre sale de la norma** | Validado: **ISO 7200:2004** existe y su título cubre *cuadros de rotulación* **y** *cabeceras de documento*. El nuestro va arriba y a todo el ancho, así que es lo segundo: pasa a llamarse **cabecera de documento (ISO 7200)**, y `titleBlock.*` a `documentHeader.*` en 19 ficheros. Los cinco campos obligatorios de la norma son nº de identificación, título, **propietario legal**, fecha de edición y **nº de hoja**; los dos últimos no existían. Las longitudes máximas que la norma especifica **no se cablean**: el texto normativo no se pudo leer (PDF de muestra en imagen, sin poppler) y un límite inventado es peor que ninguno |
| 2026-08-23 | **Fase 5 · catálogo de campos con procedencia** | `utils/iso7200.ts`: cada campo declara si es de ISO 7200, si la norma lo hace obligatorio y con qué control se rellena. Regla del usuario, y gobierna el fichero: *si la norma fija los valores, son esos; si no, se escribe.* Sale **una sola lista cerrada** —el estado del documento, que la norma sí fija— y el código se queda como texto, porque ISO 7200 no define su composición y una gramática de segmentos sería nuestro invento. Cuatro campos —revisión, tipo, clasificación, distribución— se marcan **fuera de ISO 7200** para que nadie los defienda citando una norma que no los contiene. 17 pruebas, dos de ellas cruzando catálogo y modelo en los dos sentidos: un campo en uno y no en el otro es un dato que se pierde en silencio |
| 2026-08-23 | **Fase 5 · un solo recorrido** | El diálogo pasa a una columna —archivo → hoja → cómo queda → la cabecera a tamaño de trabajo—, el panel de la barra derecha **desaparece** y la hoja deja de ser editable. Los datos se rellenan en `DocumentHeaderEditor`, que dibuja la misma cabecera del tamaño en que se puede trabajar, con el control adecuado a cada campo: calendario con «automático», contador para la revisión, lista cerrada para el estado, colaboradores para las personas, y el nº de hoja **calculado**. La plantilla del proyecto —qué campos, qué logo— queda detrás de un botón. Guarda `fields` y **no las etiquetas**, que salen traducidas: si no, una plantilla en español acabaría dentro de un proyecto en inglés |
| 2026-08-23 | **La hoja no giraba, y llevaba la geometría distorsionada** | Lo pidió comprobar el usuario y estaba roto: `flex: 1` y `max-height` de `.sheet__paper` ganaban al `aspect-ratio`, así que la hoja medía **siempre 642×300 (2,14:1)**, ni giraba al pasar a vertical ni tenía la proporción de Carta (1,294). Como todo lo de dentro se posiciona en porcentajes de esa caja, el milímetro horizontal y el vertical tenían escalas distintas: **la previsualización se veía estirada en todas las capturas anteriores**. La caja pasa a calcularse en píxeles. Verificado con `scripts/verificar-orientacion.mjs`: horizontal 1,294 · vertical 0,773 · producto 0,9999 |
| 2026-08-23 | **Segunda mentira de la hoja: el texto no escalaba** | Al girar a vertical, el recuadro encogía y el texto de la cabecera no, así que «Revisión» salía cortado por debajo de la línea — un problema que el PDF no tiene. El cuerpo pasa a fijarse al tamaño real escalado. Sale diminuto, y debe salirlo: es una maqueta a escala, y los valores se leen abajo a tamaño de trabajo |
| 2026-08-23 | **Un corte por marcadores se llevó 1 100 líneas de CSS** | Podando reglas huérfanas, un `indexOf` del marcador de cierre encontró el bloque que yo mismo había añadido **al final del fichero** y borró todo lo que había en medio: 51 603 caracteres, la mayoría CSS preexistente. Reconstruido empalmando la cabeza actual con la cola del baseline commiteado y volviendo a añadir solo lo de PLAN-034; verificado con un comparador que confirma **cero reglas del baseline ausentes** y que toda clase usada en el código está definida. La poda se rehízo con guardia: cada corte declara cuántas líneas espera y **aborta si se pasa** |
| 2026-08-23 | **Tres campos de la norma se quedan fuera por su nombre** | Decisión del usuario: *si el término no es bueno, mejor no añadir el campo.* Fuera **título suplementario** (nadie lo llama así), **referencia técnica** (suena a un código y en la norma significa «la persona de contacto» — un rótulo que engaña es peor que la falta del campo) y **departamento** (dato de organigrama que nadie pidió y se solapa con «Elaboró»). Se queda **estado del documento**: lenguaje llano y el único campo cuyo vocabulario fija la norma, que es lo que hace funcionar la regla de no teclear. El catálogo queda en 10 campos y el motivo de las tres ausencias está escrito en `iso7200.ts`, para que nadie las reponga creyendo que fue un olvido |
| 2026-08-23 | **La cabecera en el lienzo nace apagada** | Decisión del usuario. El lienzo es para dibujar; la cabecera pertenece al documento y se compone al exportar. Se apaga en la preferencia, en los valores por defecto del repositorio local y en el propio módulo del canvas, que ya no dibuja nada hasta que alguien se lo pide. Quien la quiera delante la enciende en **Ver → Cabecera de documento** y su elección se recuerda |
| 2026-08-23 | **La hoja se veía pequeña rodeada de gris inútil** | Reportado con captura. Dos causas: el banco gris se estiraba al ancho del diálogo para dar sitio al espécimen que llevaba dentro, dejando una franja enorme alrededor de una hoja pequeña; y el alto de la hoja era **un número fijo**. El espécimen sale del banco —es una medida *sobre* la hoja, no parte de ella— y el banco pasa a ajustarse al papel. El alto deja de ser fijo: se probaron 248 px (diminuta en pantalla grande) y 372 px (la cabecera bajo el pliegue en pantalla pequeña), así que ahora es una fracción de la ventana acotada entre 210 y 430 px, siguiendo el redimensionado |
| 2026-08-23 | **La hoja pequeña: el arreglo era otro** | El primer intento encogió el marco en vez de agrandar la hoja, y el usuario lo corrigió: *«la idea no era hacer el espacio más pequeño, era hacer la hoja más grande»*. El fallo de fondo era la pregunta: se probaron **tres topes fijos** —248 px se veía diminuta, 372 px hundía la cabecera bajo el pliegue, una fracción de la ventana desperdiciaba el hueco que el diálogo ya tenía— y no hay número correcto, porque el hueco depende de la ventana. Ahora el diálogo tiene **alto fijo** (92 vh), todo lo que rodea a la hoja ocupa un alto conocido, y la hoja se lleva el resto: se mide con un ResizeObserver sobre un contenedor que crece por reparto de flex y recorta lo que sobre, así que **la medición no se realimenta**. Consecuencia: la previsualización es siempre lo más grande que cabe y nada hace scroll |
| 2026-08-23 | **La hoja seguía pequeña, y ahora se sabe por qué: el reparto, no el tamaño del diálogo** | Reportado con captura por tercera vez, y la corrección del usuario fue explícita: *«no tanto la modal, sino la sección de previsualización»*. Con el diálogo ya a 96 vh la hoja medía 453×350 porque **una hoja apaisada está limitada por el alto**: le sobraba escala horizontal (2,8×) y le faltaba vertical, así que los 700 px de aire lateral eran el síntoma y los bloques apilados debajo la causa. Tres cortes: las medidas —espécimen y cocientes— pasan a una **columna de 232 px al margen del papel**, que es donde van las anotaciones en un plano; los cinco formatos dejan de ser tarjetas de 200 px y pasan a un segmentado que mide lo que mide, con el tema al otro extremo del mismo riel (una fila menos); y el cromo del diálogo —cabecera, relleno, pie— se aprieta. La cabecera a tamaño de trabajo nace **plegada**: su título es el mando, y marcar «incluir cabecera» la abre. Resultado sobre una ventana de 900 px: la hoja pasa de 453×350 a ~745×576, **2,7× de área**. Y el alto fijo deja de aplicarse donde no tiene sentido: en `.bpmn` y `.bpm` no hay nada que previsualizar, así que el diálogo se ajusta a lo que dice en vez de dejar media pantalla en blanco; en PNG y SVG el recuadro se lleva el sobrante y la imagen lo llena —es un SVG, ampliar no cuesta nitidez— |
| 2026-08-23 | **Los desplegables llevaban la flecha encima del texto** | Visible en la misma captura: «Cart⌄» donde decía «Carta». Con `appearance: none`, ancho automático y la flecha en el fondo, Firefox calcula el ancho intrínseco de un `<select>` **sin contar el `padding-right`**. Anchos fijos lo tapan hasta que se traduce la aplicación. `components/ui/Picker.tsx`: la caja la dibuja un `span`, el ancho lo fija un texto fantasma con el valor seleccionado y el `<select>` va encima transparente — **piel, no reimplementación**: la lista nativa, el teclado y el lector de pantalla siguen siendo los del sistema |
| 2026-08-24 | **Fase 6 · el taller: dos ejes en vez de uno** | El diálogo pasa a 98vw × 96vh con **escenario e inspector**. La hoja deja de competir por el alto: con la cabecera encendida y sus cinco campos a la vista mide **1 100×880 px de dispositivo** (≈690×550 CSS en una ventana de 1600×1000), frente a 490×380 antes. `Encajar` / `100 %` / `−` / `+` y arrastre con `setPointerCapture`, con el desplazamiento acotado a lo que sobresale y devuelto al centro al volver a encajar. El inspector es lo único que scrollea: `.modal-body` pasa a `overflow: hidden` a propósito, porque si el cuerpo entero se pudiera desplazar la hoja se iría hacia arriba al mirar los campos, que es justo lo que había que evitar. `DocumentHeaderEditor` **se borra** —era la segunda representación del mismo objeto— y su lógica de controles sale a `DocumentFieldControl.tsx`, en su propio módulo por la razón de EXP-019 |
| 2026-08-24 | **Se recuerda lo elegido, y se valida al leerlo** | `utils/exportPreferences.ts` en `localStorage`, **no** en `UserPreferences`: aquello viaja por el repositorio y en la nube es una fila de producción; un campo nuevo ahí sería un cambio de esquema para una comodidad de una sola máquina. Lo que se lee se valida campo a campo —`localStorage` es texto que puede haber escrito cualquiera, y un `margin: 3` inventado saldría a la aritmética de la hoja y la previsualización mentiría—. 6 pruebas, dos de ellas para basura deliberada |
| 2026-08-24 | **El diagrama vacío se decía después de pulsar** | `modals.export.emptyDiagram` existía en los dos idiomas y **no lo usaba nadie**: exportar un diagrama sin elementos llegaba hasta `renderDiagramPdf` y salía como *«El diagrama no declara tamaño»*, en crudo y sin traducir. Ahora el escenario lo dice y el botón de exportar se apaga |
| 2026-08-24 | **La cabecera nace apagada, y deja de ser un dato del proyecto** | Decisión del usuario. La casilla escribía `enabled` en `projects.doc_template`, así que una vez encendida quedaba encendida **para todo el mundo y para siempre**: el diálogo abría con cabecera sin que nadie la hubiera pedido esa vez. Ahora la plantilla dice *qué* lleva la cabecera —campos y logo, que se definen una vez— y *si* se dibuja lo dice quien exporta: `ExportRequest.includeHeader`, recordado en el navegador y **apagado cuando no hay nada recordado**. Sin marcarla, `App` no pasa plantilla y no se reserva ni un milímetro de hueco (zona de dibujo 254×191 en vez de 254×173). `doc_template.enabled` queda **vestigial**: ya no decide nada de la exportación |
| 2026-08-24 | **Las filas de la cabecera se amontonaban, y salió activando todos los campos** | Lo encontró el usuario haciendo la prueba correcta: marcar los nueve campos del catálogo. `documentHeaderHeight` devolvía **los 18 mm de la plantilla, fijos**, y el dibujado repartía `(18 − 3) / 9 = 1,7 mm` por línea para un cuerpo de 8 pt —2,82 mm—, así que las filas se pisaban unas a otras **en el PDF igual que en la previsualización**. Ahora el alto crece con las filas (`filas × cuerpo × 1,45 + 3 mm`) y **el cuerpo no se encoge**: un documento de control con letra de 5 pt no sirve de nada. Con nueve campos: 40 mm, el 18 % de una Carta apaisada — y el panel de la plantilla lo dice con esas palabras, porque el precio hay que verlo donde se elige |
| 2026-08-24 | **El giro de 90° ponía el flujo de abajo hacia arriba** | Reportado mirándolo. `rotateSvgQuarterTurn` giraba −90°, así que un diagrama que se lee de izquierda a derecha salía **empezando por el pie de la hoja**. Pasa a +90° —`translate(minY+h, -minX) rotate(90)`—, y la previsualización con él. Dos pruebas: la que fija la matriz (la caja cae en el primer cuadrante) y una nueva que fija **el sentido**, porque es lo que se rompió y una matriz correcta con el signo al revés pasa igual de bien |
| 2026-08-24 | **Los desplegables nativos: blanco sobre blanco y el azul del sistema** | La caja era nuestra y la lista del navegador, que toma el color del `select` — y el nuestro estaba transparente para no duplicar el texto. Resultado: opciones invisibles hasta pasar el ratón, resaltado azul ajeno a la paleta y las sombras del navegador dentro del diálogo. `Picker` pasa a ser un `listbox` propio con teclado completo (`Enter`/`Espacio`/`↓` abren, `↑ ↓ Inicio Fin` mueven, `Esc` cierra) y `aria-activedescendant`; la lista va en `fixed` porque el inspector tiene `overflow-y: auto` y la recortaría. Se enrutan también el estado del documento, las personas y el logo: no queda ningún `<select>` en el taller |
| 2026-08-24 | **La fecha: valor por defecto en vez de un botón** | Decisión del usuario: *«no debería ser un botón; por defecto se pone la fecha actual»*. Fuera el «automático» que copiaba la última modificación. La fecha se resuelve en el diálogo —hoy si el campo está vacío— y viaja en `ExportRequest.documentMeta`, así que **abrir «Exportar» y cancelar no modifica el diagrama** y el PDF es exactamente la hoja que se estaba mirando, sin volver a leer del lienzo |
| 2026-08-24 | **Faltaba `color-scheme`, y por eso las listas nativas eran ilegibles** | Rastreando por qué un desplegable se veía «blanco sobre blanco con el hover azul» apareció una causa que va más allá del taller: **la hoja de estilos no declaraba `color-scheme` en ninguna parte**. Es lo único que gobierna lo que dibuja el navegador y no nosotros —listas de `<select>`, calendarios de `<input type="date">`, barras de scroll—, así que en tema oscuro los pintaba en claro, con el resaltado del sistema. Ahora se declara por tema, y las opciones nativas llevan color explícito de cinturón. Afecta a **toda la app**, no solo a exportar |
| 2026-08-24 | **Fuera la legibilidad, fuera el «sin logo»** | Decisión del usuario, y la razón es la misma que ya había dado: estos documentos se consumen en digital, ampliando, así que un veredicto «sobre papel» ocupaba sitio para responder algo que nadie pregunta. Se borra `DocumentGauge` y su CSS; la aritmética (`legibility`, `labelPointSize`) se queda en `pageLayout` con sus pruebas, para el guion de medición. Y la celda del logo, sin logo, queda **en blanco**: el rótulo «sin logo» anunciaba una ausencia elegida y además no está en el PDF, así que mentía. Con ellos se van 14 claves de i18n y 2 675 caracteres de CSS huérfano, podados con la misma guardia de siempre |
| 2026-08-24 | **El corte de CSS, con guardia otra vez** | Sustituir tres bloques de `index.css` se hizo con un script que declara cuántos caracteres espera cada corte y **aborta si se pasa**. Abortó en el primer intento (3 361 > 3 000) sin escribir el fichero. Es la misma guardia que se puso cuando un `indexOf` de un marcador se llevó 1 100 líneas de CSS preexistente |
| 2026-08-27 | **[EXP-020](../../experience/020-el-logo-del-cajetin-salia-negro-y-deformado-en-el-pdf.md) · el logo salía negro y deformado** | Reportado con dos PDF. Dos averías sumadas. **La primera**: la biblioteca guarda todo en WebP y `processWEBP` de jsPDF decodifica a RGBA y **lo vuelve a codificar como JPEG**, que no tiene alfa — cada píxel transparente se escribe negro opaco. **La segunda**: `opts.logoAspect ?? 20.4 / 12.1` y **nadie pasaba `logoAspect`**, así que todos los logos se estiraban a la proporción del `.docx` medido. La previsualización no lo enseñaba porque su `object-fit: contain` respeta la proporción real. `utils/logoImage.ts` decodifica con el navegador y re-codifica a **PNG**, que jsPDF sí trata bien (`processAlphaPNG` → `/SMask`), y de paso mide el tamaño real. Se prepara una vez al abrir el proyecto, no en cada exportación. `LOGO_PADDING` se exporta para que la vista descuente el mismo aire que el dibujado |
| 2026-08-27 | **El logo se trae desde donde se configura la cabecera** | Regla de UX del usuario, y la restricción que la ordena: la biblioteca de imágenes **es un modal**, y este panel vive dentro de otro — un modal sobre otro entierra la hoja justo cuando se está decidiendo cómo queda. El desplegable de **nombres** de imagen se sustituye por `DocumentLogoField`: zona de arrastre que sube el archivo sin salir, miniatura sobre tablero de ajedrez —la transparencia ahora llega al PDF, así que se ve—, tamaño en píxeles con aviso por debajo de 200 px (la celda mide ~20 mm: más abajo sale blando **al imprimir**), y las imágenes del proyecto en una tira de miniaturas en vez de una lista de rótulos. **Se sigue guardando en la biblioteca**, y es deliberado: meter el base64 en `projects.doc_template` es exactamente la trampa que PLAN-012 desmontó. Entra en una carpeta «Logos» que se crea sola, para no mezclarlo con los diagramas escaneados; y se sube como **PNG sin pérdida**, porque un logo es tipografía y bordes limpios, justo lo que el WebP a 0.9 ensucia |
| 2026-09-01 | **El diagrama suelto tenía la cabecera a medias** | Reportado con captura desde el laboratorio: sin proyecto se podían rellenar los campos que la plantilla neutra ya traía y **nada más** — ni logo, ni elegir qué campos salen. El panel lo decía con un cartel, *«la cabecera se define en el proyecto»*: describía bien el código y mal el producto, porque el estudiante o quien está probando la herramienta son justo quienes no tienen proyecto. Es el **nivel de usuario de D-C**, que estaba decidido y sin construir. `utils/localDocumentHeader.ts`: plantilla completa en `localStorage` —**no** en `UserPreferences`, que en la nube es una fila de producción—, con el logo **por valor** (`logoDataUrl`), porque la biblioteca de imágenes es por proyecto y sin proyecto no hay a qué apuntar. Los dos caminos no se cruzan **por construcción**: `parseStoredDocumentHeader` descarta `logoDataUrl` siempre, así que un base64 no puede acabar en `projects.doc_template` ni saltándose la interfaz. Tope de 1 MB en el logo local: `localStorage` es cuota compartida y pasarse se llevaría por delante lo ya guardado. `canConfigureTemplate` deja de significar «tiene proyecto» y pasa a significar «puede editar». 10 pruebas nuevas |
| 2026-09-01 | **[EXP-021](../../experience/021-la-cabecera-en-el-lienzo-se-solapa-con-el-diagrama.md) · documentado y aplazado a propósito** | La cabecera en el lienzo se dibuja **encima** del diagrama cuando el contenido empieza arriba: `Math.max(0, contenido.y - h - GAP)` le impide subir del origen, y se compensa poniéndola translúcida. Es deliberado y tiene prueba, pero **el PDF nunca solapa** —`placement()` reserva el hueco y baja el dibujo—, así que la vista enseña una composición que la exportación no puede producir. El comentario del módulo planteaba un dilema falso (solapar o mover los elementos del usuario); la tercera vía no hace ninguna de las dos: **quitar el clamp** —bpmn-js acepta coordenadas negativas— y, como eso deja la banda fuera del viewport cuando el contenido está pegado arriba, **revelarla con `canvas.scroll` solo al encenderla**. Decisión del usuario: **documentar y no tocar**, para desplegar antes lo ya probado. El documento lleva el parche entero, incluida **la prueba actual que afirma justo lo contrario y hay que reescribir** |
| 2026-08-22 | **Reordenado: "una sola imagen"** | Decisión del usuario (D-E). El mosaico se descarta y el vector sube de la fase 3 a la fase 1, porque una imagen única y legible **solo** es posible sin ráster. Se midió el vocabulario SVG de los 235 exportados para acotar el riesgo antes de instalar nada: cero `foreignObject`, máscaras, filtros, `use`, patrones y degradados; solo marcadores, `tspan`, `transform` y Arial. Riesgo bajo, y la fase 0 lo despeja |

## Resultado

(se rellena al cerrar)
