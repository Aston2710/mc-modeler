---
id: EXP-023
titulo: La cabecera solo existía en la previsualización — un `enabled` que nadie encendía
estado: resuelto
severidad: alta
fecha_deteccion: 2026-09-07
fecha_cierre: 2026-09-07
componentes: [src/App.tsx, src/components/canvas/BpmnCanvas.tsx, src/components/modals/ExportModal.tsx, src/utils/documentHeader.ts]
relacionados: [PLAN-034, EXP-021, EXP-020, EXP-017, EXP-019]
---

# La cabecera solo existía en la previsualización

## Síntoma

En **producción**: se configura la cabecera —logo, campos—, se marca «incluir
cabecera» al exportar, **la hoja del diálogo la enseña**… y no sale ni en el PDF
descargado ni en el lienzo con **Ver → Cabecera de documento** encendida.

El reporte llegó con una observación que parecía contradecirlo: *«yo vi en
producción cómo se mostraba la cabecera»*. Y es cierto — lo que se veía era la
previsualización, que es el **único** de los tres caminos que la dibujaba.

## Causa

`enabled` es un campo de la plantilla (`DocumentHeaderTemplate`) que decide si se
dibuja. Tras `7f6ffe3` («the document workshop»), la decisión *«dibujar sí/no»*
se movió de la plantilla del proyecto al diálogo de exportación —correcto: si no,
encenderla una vez la dejaba encendida para todo el equipo y para siempre—, pero
`enabled` **se quedó como guardia en las tres capas de dibujado sin que nadie lo
pusiera en `true`**:

- nace `false` en `DEFAULT_DOCUMENT_HEADER` y en `DEFAULT_STORED_DOCUMENT_HEADER`,
- `parseStoredDocumentHeader` lo normaliza a `o.enabled === true` → `false`,
- `DocumentHeaderTemplatePanel` solo emite `logo` y `fields`.

Un `enabled` que venga de la plantilla guardada era, por construcción, siempre
`false`. Confirmado en los datos: las dos filas de `projects.doc_template` en
producción tenían logo y campos configurados y `"enabled": false`.

Con eso, cada camino moría en un sitio distinto:

| Camino | Dónde moría |
|---|---|
| **PDF** | `App.tsx` pasaba `docTemplate` **tal cual** a `runExport`; `useExport` calculaba `documentHeaderHeight(tpl)` → `0` y `drawDocumentHeader` salía en su primera línea (`if (!tpl.enabled) return`) |
| **Lienzo** | `BpmnCanvas` pasaba la misma plantilla y `DocumentFrameModule._render` cortaba en `if (!tpl || !tpl.enabled || !this._visible) return` — el interruptor del menú movía `_visible` y no se veía nada |
| **Previsualización** | **No moría**: `ExportModal` construía su copia con `{ ...plantilla, enabled: incluirCabecera }` para la hoja. Por eso funcionaba, y solo ahí |

`40ef0b3` («show the document header on the canvas») nació ya muerto por lo
mismo: se implementó y probó el módulo, y el gato nunca recibió una plantilla
encendida.

Ninguna prueba lo cazó porque todas las de `documentHeader.ts` y
`DocumentFrameModule.test.ts` construyen su plantilla con `enabled: true` a mano
—que es exactamente lo que la aplicación no hacía—. **El defecto no estaba en
ningún módulo: estaba en el cableado entre ellos, que es lo que no cubría
ninguna prueba.**

## Arreglo

Una función que nombra la regla, y tres llamadas:

```ts
// utils/documentHeader.ts
export function enableDocumentHeader(tpl: DocumentHeaderTemplate, draw: boolean): DocumentHeaderTemplate {
  return { ...tpl, enabled: draw }
}
```

- `App.tsx` → `req.includeHeader && docTemplate ? enableDocumentHeader(docTemplate, true) : undefined`
- `BpmnCanvas.tsx` → `frame.setTemplate(documentHeader ? enableDocumentHeader(documentHeader, true) : null)`;
  quien gobierna la vista es `setVisible`, como dice el módulo.
- `ExportModal.tsx` → la copia que ya hacía a mano, ahora por la misma función.

Dos pruebas nuevas en `documentHeader.test.ts` fijan que la plantilla por defecto
—apagada, que es como llega siempre— se vuelve dibujable sin mutarse. 419
pruebas en verde, `lint` y `build` limpios.

**`enabled` sigue en `StoredDocumentHeader` y es dato muerto**: en
`projects.doc_template` no lo lee nadie para decidir nada. Sacarlo del tipo
guardado es la limpieza que cierra la puerta del todo; se dejó fuera de este
arreglo a propósito, para que el despliegue sea de tres líneas y no de un
refactor de tipos. La función es el único sitio que habría que tocar.

## Prevención

**Un campo que ninguna interfaz escribe es un campo muerto, y un campo muerto que
además es un guardia apaga la función entera en silencio.** La señal a buscar:
cuando una decisión se *mueve* de capa —aquí, de la plantilla del proyecto a la
exportación—, hay que ir a buscar a todos los que seguían leyéndola donde estaba.
Fueron tres, y el commit solo arregló uno.

**La previsualización que se construye su propio estado no prueba la
exportación.** Es la tercera vez que este proyecto lo paga: EXP-017 (resolución),
EXP-020 (proporción del logo) y ahora esto, que es el caso extremo —la vista no
enseñaba una cabecera *distinta*, enseñaba **la única que existía**—. Cuando la
vista y la salida no comparten el objeto, comparten el bug.

**Y la lección del reporte:** *«lo vi en producción»* y *«no sale en producción»*
eran las dos ciertas a la vez. Que un usuario vea algo funcionando no descarta un
diagnóstico — puede estar mirando el único camino que funciona.
