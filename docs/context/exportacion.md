# Exportación — cómo sale un diagrama de la aplicación

> **Documento vivo.** Gobierna el código futuro de exportación: se edita en sitio, no se
> crea una v2. Última revisión: 2026-08-24 (PLAN-034 fase 6).

Cinco formatos, **dos naturalezas** y un solo hilo de ejecución (`hooks/useExport.ts`):

| Formato | Qué es | Lleva cabecera ISO 7200 | Camino |
|---|---|---|---|
| `.pdf` | documento compuesto, **vectorial** | **sí** | `pdfDocument.ts` + `documentHeader.ts` |
| `.png` | mapa de bits del dibujo | no | `svgToDataUrl` (canvas) |
| `.svg` | el vector del dibujo | no | volcado del SVG temado |
| `.bpmn` | XML estándar BPMN 2.0 | los **datos**, no el dibujo | `inlineImages` |
| `.bpm` | formato nativo de Bizagi | los **datos**, no el dibujo | `bpmExport.ts` |

**La cabecera solo se dibuja en PDF, y es deliberado.** En `.bpmn`/`.bpm` los datos viajan en
`extensionElements` para que otro modelador los ignore sin ensuciar el archivo (DEC/D-A de
PLAN-034); en PNG y SVG no hay hoja, así que no hay dónde ponerla. Quien pida «cabecera en el
PNG» está pidiendo en realidad *«exporta la hoja como imagen»*, que es otra función.

---

## 1 · El camino del PDF, paso a paso

```
ExportModal ─(ExportRequest)→ App.handleExportConfirm ─→ useExport.run
                                                             │
                        getThemedSvg(theme, getSvg) ──────────┤ 1. el dibujo
                                                             │
                        documentHeaderHeight(tpl) ───────────┤ 2. el hueco
                                                             │
                        renderDiagramPdf(svg, {spec, …}) ────┘ 3. la hoja
                              │
                              ├─ jsPDF({unit:'mm', format:[w,h], compress:true})
                              ├─ pdf.rect(fondo)
                              ├─ drawHeader → drawDocumentHeader (primitivas jsPDF)
                              ├─ placement(spec, box) → dónde cae el dibujo, en mm
                              ├─ rotateSvgQuarterTurn (solo si `rotateDiagram`)
                              └─ svg2pdf(el, pdf, {x,y,width,height})
```

**Cinco invariantes que no se negocian:**

1. **La aritmética vive en un solo sitio: `utils/pageLayout.ts`.** Módulo puro, sin DOM ni
   jsPDF. Lo usan la exportación **y** la previsualización. Si divergieran, la
   previsualización mentiría, que es peor que no tenerla.
2. **El diagrama va en vector.** `svg2pdf.js` recorre el SVG; el texto se puede seleccionar y
   buscar, y ampliar no pierde nitidez. Es lo que hace viable la premisa de «una sola imagen»:
   medido sobre los 177 diagramas de producción, en Carta vertical el **53 %** de las etiquetas
   cae por debajo de 4 pt y la proporción mediana (**2,40:1**) no la alcanza ninguna hoja
   estándar — en papel eso es fatal, en un visor no.
3. **La cabecera se dibuja con primitivas, no como imagen.** Es vectorial vaya el diagrama en
   vector o no. La única excepción es el logo, que es una imagen y no puede ser otra cosa.
4. **El giro no rota la hoja, y va en el sentido que hace que el flujo baje.** `rotateDiagram`
   gira *el dibujo* dentro de una hoja que conserva su orientación, porque hay estándares que
   exigen hoja vertical. `svg2pdf` **no tiene opción de rotación** —comprobado en sus tipos—,
   así que el giro se hace en el origen con `translate(minY+h, -minX) rotate(90)` sobre un `<g>`
   que envuelve todo lo renderizable (`defs` y `style` se quedan fuera: los marcadores se
   referencian por URL). **El signo importa**: con −90° un diagrama que se lee de izquierda a
   derecha salía de abajo hacia arriba y había que empezar por el pie de la hoja.
5. **La cabecera crece con sus filas.** `documentHeaderHeight` no es una constante: los 18 mm
   del estándar dan para tres filas, y con las nueve del catálogo el dibujado repartía 1,7 mm
   por línea para un cuerpo de 8 pt —**las filas se amontonaban**, en el PDF y en la
   previsualización—. Ahora la banda ocupa lo que necesita y **el cuerpo no se encoge**: un
   documento de control con letra de 5 pt no sirve para nada. El precio se dice donde se elige.
6. **`compress: true` no es opcional.** Sin él jsPDF escribe los flujos de contenido en claro:
   se midió **265 kB → 55 kB** en el mismo diagrama. Frente al ráster que había antes en
   producción (1 765 kB), son **32×** menos.

### Carga diferida

`jspdf` y `svg2pdf.js` entran con `import()` dinámico dentro de `renderDiagramPdf`. Efecto
colateral medido al hacerlo: **el bundle principal bajó de 1 857 kB a 1 466 kB (−21 %)**.
`import type { jsPDF }` se borra en compilación, así que tipar con el jsPDF real no arrastra
nada al grafo de módulos. **No importar `jspdf` arriba en ningún fichero del camino crítico.**

### El tema, sin flash

`getThemedSvg` remapea los colores **sobre la cadena SVG**, no re-renderizando el canvas: lee
del CSSOM los valores autorales de `:root` y de `[data-theme="dark"]` y sustituye
valor-origen → valor-destino en **una sola pasada** (un reemplazo secuencial se
auto-contamina). Cada valor se registra en sus **dos serializaciones**, hex y `rgb()`, porque
el navegador re-serializa `style="fill: …"` como `rgb(...)`.

- Los colores de `flujo:groupColor` **no** se remapean: son literales que eligió el usuario.
- Si el CSSOM no es legible (hoja cross-origin) se cae al camino antiguo `withTheme`, que
  **provoca un flash de tema visible en toda la app**. Es el único camino con efecto visual.
- `sanitizeExportedSvg` quita el markup transitorio de diagram-js (`.djs-dragger`, lasso,
  resizers…). Sin esto, un autosave en mitad de un arrastre metía formas negras en el export.

---

## 2 · La interfaz: el taller de documento (fase 6)

Dos zonas con **ejes independientes**, y esa es toda la idea:

- **El escenario** (izquierda) es la hoja: se lleva el sobrante y **no encoge nunca**.
  `Encajar` juzga la composición; `100 %` juzga la letra —un píxel CSS es 1/96 de pulgada por
  definición del estándar, así que a esa escala lo que se ve mide lo que medirá— y ampliada se
  arrastra con el puntero.
- **El inspector** (derecha) lleva lo que se decide, en secciones plegables y **con su propio
  scroll**. Añadir campos alarga esa columna; no estrecha la hoja.

**Lo que esto sustituye, y por qué:** la fase 5 era una columna de suma cero —alto fijo, todo
apilado en el mismo eje—, así que encender la cabecera metía 180 px de editor y la hoja caía de
745×576 a 490×380. Se hacía pequeño justo lo único que se viene a mirar.

Reglas de la interfaz que conviene no deshacer:

- **La hoja no se edita.** Ya se intentó: celdas de 3 mm imposibles de apuntar y la imagen del
  diagrama robando los clics (EXP-019). Los datos se rellenan en el inspector.
- **La cabecera nace apagada, y encenderla es decisión de cada exportación.** La plantilla del
  proyecto dice **qué** lleva la cabecera —campos y logo, que se definen una vez—; **si** se
  dibuja lo dice quien exporta, y se recuerda en su navegador. Sin marcarla, `App` no pasa
  plantilla y no se reserva ni un milímetro de hueco. Consecuencia: `doc_template.enabled` en
  la base **ya no decide nada de la exportación** — queda vestigial hasta que toque limpiarlo.
- **Los desplegables no son `<select>`.** Todos pasan por `components/ui/Picker.tsx`. Lo fueron
  —caja propia con el `select` transparente encima— y la lista, que la dibuja el navegador,
  traía tres cosas que no se arreglan con CSS: se veía **blanco sobre blanco** (el popup toma
  el color del `select`, y el nuestro era transparente), el resaltado era **el azul del
  sistema**, y arrastraba sombras y esquinas del navegador dentro del diálogo. Antes de eso,
  con `appearance: none` y ancho automático, Firefox calculaba el ancho intrínseco **sin contar
  el `padding-right`** y la flecha se pintaba sobre la última letra. El precio de tener lista
  propia es implementar el teclado: `Enter`/`Espacio`/`↓` abren, `↑ ↓ Inicio Fin` mueven,
  `Enter` elige, `Esc` cierra, y es un `listbox` con `aria-activedescendant`.
- **La fecha viene puesta —hoy— y no hay botón de «automático».** Un mando que hay que
  descubrir no es mejor que un valor sensato ya escrito. Se resuelve en el diálogo y viaja en
  `ExportRequest.documentMeta`: **abrir «Exportar» y cancelar no modifica el diagrama**, y lo
  que se dibuja es exactamente la hoja que se estaba mirando.
- **Las casillas de la plantilla siguen siendo casillas.** Nueve decisiones independientes: se
  ve el estado de todas a la vez y se cambia una sin tocar las demás. Un multiselector esconde
  el estado detrás de un clic y unas fichas pulsables pierden la etiqueta de procedencia, que
  es la que evita defender un campo citando una norma que no lo contiene. Lo que faltaba no era
  otro control: era **decir el precio** —«9 campos · cabecera de 40 mm, 18 % de la hoja»—.
- **La legibilidad ya no está.** Existió como espécimen a tamaño real —un rótulo del diagrama
  compuesto a los puntos que tendría impreso—, y se retiró por decisión del usuario: estos
  documentos **se consumen en digital**, ampliando, así que un veredicto «sobre papel» ocupaba
  sitio para responder una pregunta que nadie hace. La aritmética sigue en `pageLayout`
  (`legibility`, `labelPointSize`) con sus pruebas, para el guion de medición y para quien la
  necesite; lo que se fue es la ficha.
- **Sin logo, la celda queda en blanco.** Decía «sin logo», y un rótulo que anuncia una
  ausencia elegida es ruido — y encima mentía, porque ese texto no está en el PDF.
- **`color-scheme` se declara por tema** (`:root` y `[data-theme="dark"]`). Es lo único que
  gobierna lo que dibuja el navegador y no nosotros: listas de `<select>`, calendarios de
  `<input type="date">`, barras de scroll. Sin esa línea, en tema oscuro el navegador los pinta
  en claro y las opciones salen ilegibles con el resaltado azul del sistema.
- **Lo elegido se recuerda** en `localStorage` (`utils/exportPreferences.ts`), no en
  `UserPreferences`: aquello viaja por el repositorio y en la nube es una fila de producción.
  Se **valida al leer**, siempre: un `margin` inventado saldría a la aritmética de la hoja.
- **El nombre del fichero se sanea dos veces**, en el diálogo y en `useExport`: lo que llegue
  acaba en un `download`, así que no se confía en que venga limpio.
- **Sin nada que previsualizar, el diálogo se ajusta a lo que dice** (`.bpmn`/`.bpm`).

---

## 3 · Límites conocidos — lo que HOY no hace

Ninguno es un defecto oculto: están aquí para que nadie los descubra a mitad de una entrega.

| # | Límite | Detalle |
|---|---|---|
| L1 | **Una sola hoja, siempre** | `renderDiagramPdf` crea un `jsPDF` y llama a `svg2pdf` una vez. `sheetNumber()` devuelve `1 / 1` **fijo**. Partir un diagrama en varias hojas con solape es trabajo de motor y se midió y descartó en su día como «mosaico» |
| L2 | **PNG y SVG no llevan hoja ni cabecera** | Son el dibujo, no el documento. El PNG añade un relleno **fijo de 20 px** (`svgToDataUrl`), no configurable |
| L3 | **El logo es lo único no vectorial del PDF** | Y no se recomprime: entra tal como está en la biblioteca de imágenes |
| L4 | **`svg2pdf` necesita el SVG vivo en el DOM** | Se monta en un host de 2 000×2 000 px fuera de pantalla y se consultan estilos calculados. Un cambio en el `<style>` que inyecta el tema cambia el PDF |
| L5 | **`ExportOptions.orientation` sigue existiendo, deprecado** | El diálogo ya manda solo `page`; el campo se conserva para llamadas antiguas. Deuda a retirar cuando no queden |
| L6 | **Las longitudes máximas de ISO 7200 no están cableadas** | El texto normativo no se pudo leer, y un límite inventado es peor que ninguno |

---

## 4 · Dónde vive cada cosa

| Fichero | Trabajo |
|---|---|
| `hooks/useExport.ts` | orquesta los cinco formatos, el tema y la descarga |
| `utils/pageLayout.ts` | **la aritmética**: hoja, zona de dibujo, encaje, puntos, legibilidad |
| `utils/pdfDocument.ts` | compone la hoja PDF y mete el vector; giro de 90° |
| `utils/documentHeader.ts` | la plantilla, sus medidas medidas y su dibujado |
| `utils/iso7200.ts` | catálogo de campos, con procedencia y control declarados |
| `utils/exportPreferences.ts` | lo último elegido, en el navegador, validado al leer |
| `components/modals/ExportModal.tsx` | el taller: escenario + inspector + pie |
| `components/modals/DocumentSheet.tsx` | la hoja acotada, con encajar / 100 % / arrastre |
| `components/modals/DocumentGauge.tsx` | legibilidad: el espécimen a tamaño real |
| `components/modals/DocumentFieldControl.tsx` | el control que pide cada campo |
| `scripts/capturar-ui.mjs` | capturas del laboratorio para criticar el diseño mirándolo |

## Referencias

- [PLAN-034](../plans/todo/034-vista-documento-y-cajetin-configurable.md) — el plan, sus
  mediciones y su registro de ejecución.
- [EXP-017](../experience/017-el-thumbnail-webp-salia-borroso-por-el-tamano-intrinseco-del-svg.md)
  — el tamaño se fija en el origen, no en el destino.
- [EXP-018](../experience/018-extender-un-tipo-concreto-de-bpmn-corrompe-el-nombre-del-elemento.md)
  — por qué los datos del documento van en `extensionElements`.
- [EXP-019](../experience/019-la-previsualizacion-se-veia-bien-y-no-se-podia-usar.md) — por qué
  la hoja no se edita y por qué los componentes no se declaran dentro de otros.
