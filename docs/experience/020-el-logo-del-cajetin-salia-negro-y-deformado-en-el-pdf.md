---
id: EXP-020
titulo: El logo del cajetín salía negro y deformado en el PDF
estado: resuelto
severidad: media
fecha_deteccion: 2026-08-27
fecha_cierre: 2026-08-27
componentes: [src/utils/documentHeader.ts, src/utils/logoImage.ts, src/utils/imageCompress.ts, src/components/modals/DocumentSheet.tsx]
relacionados: [PLAN-034, EXP-017]
---

# El logo del cajetín salía negro y deformado en el PDF

## Síntoma

La cabecera de documento de PLAN-034 salía correcta en el PDF —marco, título,
filas de control— salvo la celda del logo, que llevaba **un rectángulo negro con
una silueta rota dentro**. Ni el logo del usuario ni nada reconocible.

Y **la previsualización se veía bien.** Ese es el detalle que costó tiempo: el
`<img>` de la hoja recibe los mismos bytes y el navegador los pinta sin problema,
así que el defecto solo existía al otro lado de `addImage`.

## Causa

Son **dos averías distintas que se sumaban**, y por eso la imagen no se
reconocía de ninguna manera.

### 1. jsPDF re-codifica el WebP como JPEG, y el JPEG no tiene alfa

`utils/imageCompress.ts` guarda **toda** la biblioteca de imágenes como WebP
(`canvas.toDataURL('image/webp', 0.9)`). Es la decisión correcta para la
biblioteca —pesa la mitad y el egress es el recurso escaso—, pero al logo le
aplica igual.

`jsPDF.addImage` no se fía de la pista de formato que se le pasa: husmea la
cabecera del binario. Detecta `RIFF…WEBP` y entra por `processWEBP`, que en el
fuente de jsPDF 3 hace esto:

```js
jsPDFAPI.processWEBP = function (imageData, index, alias, compression) {
  var reader = new WebPDecoder(imageData);
  var pixels = reader.getData();                       // RGBA
  var encoder = new JPEGEncoder(100);
  var data = encoder.encode({ data: pixels, width, height }, 100);
  return jsPDFAPI.processJPEG.call(this, data, index, alias, compression);
};
```

**Decodifica a RGBA y lo vuelve a codificar como JPEG.** El JPEG no tiene canal
alfa. Cada píxel transparente —que en un lienzo llega como `(0,0,0,0)`— se
escribe como negro opaco. Un logo con fondo transparente sale como una mancha
negra con la forma recortada en negativo: exactamente lo que se veía.

De propina, ese camino empalma a mano el chunk `ALPH` con el `VP8` antes de
decodificar (`src_size = alpha_size + payload_size + 8`), y el tamaño que calcula
deja los bordes sucios. Da igual para el diagnóstico: con el alfa perdido el logo
ya era irreconocible.

### 2. La proporción del logo estaba cableada

`drawDocumentHeader` encajaba el logo así:

```ts
const caja = fitLogo({ x, y, width: w0, height }, opts.logoAspect ?? 20.4 / 12.1)
```

`opts.logoAspect` **no lo pasaba nadie** — ni `useExport`, ni las pruebas. Así
que todos los logos se dibujaban con la proporción del logo del `.docx` que se
midió para las columnas: **1.686:1**. Un logo cuadrado salía estirado un 69 %.

La previsualización no lo enseñaba porque su `.sheet__logo` usa `object-fit:
contain`, que respeta la proporción real. Los dos caminos discrepaban en silencio.

## Fix

**`utils/logoImage.ts`** decodifica el logo con el navegador —que sabe de WebP,
PNG, JPEG y SVG— y lo **re-codifica a PNG**. Al PNG jsPDF sí lo trata bien:
`processAlphaPNG` saca el alfa a un `/SMask` del PDF, así que la transparencia
llega intacta. El decodificado da además el **tamaño real**, que arregla la
proporción.

La preparación se inyecta en `resolveDocumentHeader` como cuarto parámetro, junto
al cargador de la imagen y al traductor de etiquetas, por el mismo motivo que
aquellos: necesita `canvas` y un decodificador de verdad, y el módulo tiene que
seguir siendo probable sin navegador. Si la preparación falla, se conserva el
original — mejor un logo con la proporción del estándar que ningún logo.

Se prepara **una vez al abrir el proyecto**, no en cada exportación.

Tres cosas más, del mismo tirón:

- La proporción medida viaja en la plantilla (`DocumentHeaderTemplate.logoAspect`)
  y `drawDocumentHeader` la usa. La del estándar queda como último recurso, con el
  nombre que le corresponde: `FALLBACK_LOGO_ASPECT`.
- El logo que se importa desde la interfaz se guarda como **PNG sin pérdida**, no
  como el WebP con pérdida de la biblioteca. Un logo es tipografía y bordes
  limpios: es justo el contenido que el WebP a 0.9 ensucia con halos.
- El aire de `fitLogo` (2 mm) se exporta como `LOGO_PADDING` y la previsualización
  lo descuenta. Sobre una celda de 18 mm son casi la cuarta parte del alto: sin
  descontarlo, la vista enseñaba el logo más grande de lo que sale.

## Prevención

**Una pista de formato no arregla un decodificador.** El código anterior escribía
`tpl.logo.includes('image/jpeg') ? 'JPEG' : 'PNG'` y eso parecía cubrir el
problema. No cubría nada: jsPDF ignora la pista cuando reconoce la cabecera del
binario, que es siempre. La única forma de controlar qué decodificador entra es
**controlar los bytes**.

**Lo que la biblioteca guarda no es lo que el PDF necesita.** WebP con alfa es
óptimo para servir por HTTP y tóxico para meter en un PDF. Cualquier imagen que
vaya a `addImage` pasa por `prepareLogo` primero; el día que haya una segunda
—una firma, un sello— la regla ya está escrita.

**Un valor por defecto que nadie sobreescribe no es un valor por defecto: es una
constante.** `opts.logoAspect ?? 20.4 / 12.1` se leía como «si no dicen otra
cosa», y en realidad era «siempre». La señal es un parámetro opcional que ningún
llamador pasa: o se pasa, o se llama `FALLBACK_` y se dice por qué.

**Dos caminos que dibujan lo mismo tienen que compartir sus números.** La
previsualización y el PDF discrepaban en la proporción y en el aire. La
previsualización existe para no mentir sobre el PDF; cada constante que no
comparten es una mentira esperando su turno.
