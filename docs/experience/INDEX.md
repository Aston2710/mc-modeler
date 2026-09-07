# Incidentes

Ordenado por ID descendente. `mitigado` no es `resuelto`.

| ID | Incidente | Estado | Severidad | Componentes | Detectado |
|---|---|---|---|---|---|
| [EXP-023](023-la-cabecera-solo-existia-en-la-previsualizacion.md) | **La cabecera solo se dibujaba en la previsualización del diálogo** — ni en el PDF ni en el lienzo. `enabled` quedó de guardia en las tres capas de dibujado y **ninguna interfaz lo encendía** desde que la casilla de exportar dejó de escribirlo en el proyecto. En producción desde `7f6ffe3` | resuelto | alta | `App.tsx`, `BpmnCanvas.tsx`, `documentHeader.ts` | 2026-09-07 |
| [EXP-022](022-una-pieza-mal-formada-cancela-el-guardado-entero.md) | **Una sola pieza mal formada en el árbol del modelo cancela el guardado del diagrama ENTERO** — tres horas de trabajo vivas solo en la memoria de una pestaña. La fila de Postgres nunca se corrompió. Capas A y C de PLAN-035 implementadas; **el disparador no está reproducido** | **mitigado** | **crítica** | `useBpmnModeler.ts`, `sanitizeModelTree.ts`, `NativeCopyPasteModule.ts`, `moddle-xml` | 2026-09-02 |
| [EXP-021](021-la-cabecera-en-el-lienzo-se-solapa-con-el-diagrama.md) | La cabecera en el lienzo se dibuja **encima** del diagrama cuando el contenido empieza arriba — un `Math.max(0, …)` le impide subir del origen. El PDF nunca solapa: la vista enseña algo que la exportación no puede producir. **Causa identificada y arreglo diseñado entero, sin implementar** | **activo** | media | `DocumentFrameModule.ts`, `index.css` | 2026-08-28 |
| [EXP-020](020-el-logo-del-cajetin-salia-negro-y-deformado-en-el-pdf.md) | El logo del cajetín salía como una mancha negra deformada: `processWEBP` de jsPDF re-codifica a JPEG —que no tiene alfa— y la proporción del logo estaba cableada a la del estándar medido | resuelto | media | `documentHeader.ts`, `logoImage.ts`, `imageCompress.ts` | 2026-08-27 |
| [EXP-019](019-la-previsualizacion-se-veia-bien-y-no-se-podia-usar.md) | La hoja de PLAN-034 salía impecable en las capturas y no se podía editar: la imagen del diagrama se quedaba los clics, y la celda editable —declarada dentro de su padre— remontaba el `<input>` en cada tecla | resuelto | media | `DocumentSheet.tsx`, `index.css`, `scripts/capturar-ui.mjs` | 2026-08-23 |
| [EXP-018](018-extender-un-tipo-concreto-de-bpmn-corrompe-el-nombre-del-elemento.md) | Extender un tipo **concreto** en el moddle serializa `<bpmn:SequenceFlow>` en vez de `<bpmn:sequenceFlow>`: **139 de 177 diagramas tienen XML no canónico** | **activo** | alta | `moddle/flujo.json`, `current_xml` | 2026-08-23 |
| [EXP-017](017-el-thumbnail-webp-salia-borroso-por-el-tamano-intrinseco-del-svg.md) | `drawImage` amplía el bitmap del tamaño intrínseco del SVG en vez de re-rasterizar el vector | **activo** — corregido en el thumbnail 2026-08-21, **sigue vivo en la exportación PNG/PDF** | media | `src/utils/thumbnailUtils.ts`, `src/hooks/useExport.ts` | 2026-08-21 |
| [EXP-016](016-el-historial-de-migraciones-no-reproduce-la-base.md) | El historial de migraciones no reproducía la base: faltaban 6 archivos de 35 migraciones aplicadas | resuelto | alta | `supabase/migrations`, `comment_threads`, MCP `apply_migration` | 2026-08-13 |
| [EXP-015](015-revoke-update-de-columna-es-noop-con-grant-de-tabla.md) | `REVOKE UPDATE (columna)` no surtió efecto porque existía un `GRANT UPDATE` de tabla | resuelto | alta | migraciones `0023`/`0028` | 2026-08-10 |
| [EXP-014](014-rls-evaluado-por-fila-degradaba-la-lista-de-diagramas.md) | La política RLS de `diagrams` se evaluaba una vez por fila y la lista tardaba 31 ms | resuelto | alta | `private.can_access_diagram`, `diagrams_select` | 2026-08-09 |
| [EXP-013](013-tabla-de-respaldo-expuesta-publicamente.md) | Una tabla de respaldo quedó en `public` con RLS desactivado y permisos para `anon` | resuelto | crítica | `_xml_backup_20260723`, PostgREST | 2026-08-09 |
| [EXP-012](012-ficheros-huerfanos-en-storage-tras-borrado.md) | Los thumbnails sobreviven al borrado de su diagrama y quedan inalcanzables | **activo** | media | `SupabaseRepository.ts`, `storage.objects` | 2026-08-09 |
| [EXP-011](011-perdida-silenciosa-de-cambios-entre-colaboradores.md) | **Dos personas editan el mismo diagrama y los cambios de una no llegan a la otra** | **activo** — mitigado 2026-08-14, causa sin identificar | **crítica** | `useCollab.ts`, `canvasSession.ts`, `diagramStore.ts` | 2026-08-10 |
| [EXP-010](010-mover-contenedor-reruta-las-flechas-internas.md) | Mover un pool, carril o grupo rerutaba las flechas internas | resuelto | alta | `src/bpmn/connections` | 2026-07-27 |
| [EXP-009](009-imagenes-de-la-biblioteca-no-visibles-para-colaboradores.md) | Las imágenes de la biblioteca no eran visibles para otros usuarios | resuelto | media | `images` RLS, `SupabaseImageRepository.ts` | 2026-08-04 |
| [EXP-008](008-diagrama-corrupto-diagnostico-y-mejora-continua.md) | Diagrama corrupto en producción: diagnóstico y mejora continua | resuelto | crítica | `src/persistence`, `current_xml` | 2026-07-23 |
| [EXP-007](007-flechas-duplicadas-por-divergencia-de-id-de-conexion.md) | Flechas duplicadas por divergencia del id de conexión entre clientes | resuelto | alta | `YjsBpmnBinding.ts`, `yBpmnModel.ts` | por-determinar |
| [EXP-006](006-export-bpm-desbordaba-int32.md) | La exportación a `.bpm` desbordaba enteros de 32 bits | resuelto | media | `src/utils/bpmExport.ts` | 2026-07-07 |
| [EXP-005](005-veneno-de-overlay-de-pool-en-el-doc-yjs.md) | Un overlay de pool corrupto quedaba persistido en el documento Yjs | resuelto | crítica | `YjsBpmnBinding.ts`, `createShape` | 2026-07-02 |
| [EXP-004](004-retroceso-de-estado-persistido-en-yjs.md) | El estado persistido de Yjs retrocedía a versiones anteriores | resuelto | crítica | `yjsPersistence.ts` (eliminado) | 2026-07-01 |
| [EXP-003](003-contaminacion-de-pools-entre-diagramas.md) | Elementos de un diagrama aparecían dentro del pool de otro | resuelto | crítica | `canvasSession.ts`, `useCollab.ts` | 2026-07-01 |
| [EXP-002](002-pool-fantasma-al-importar-desde-bizagi.md) | La importación de XML de Bizagi generaba un pool fantasma | resuelto | media | `src/bpmn/import` | 2026-06-28 |
| [EXP-001](001-escritura-cancelada-al-teclear-en-colaboracion.md) | Al teclear una etiqueta en modo colaborativo la edición se cancelaba sola | resuelto | alta | `YjsBpmnBinding.ts` | 2026-06-26 |

## Incidentes activos

Seis abiertos: EXP-011, EXP-012, EXP-017, EXP-018, EXP-021 y EXP-022. **EXP-019, EXP-020 y EXP-023 nacen resueltos**: se detectaron y se corrigieron el mismo día.

**EXP-023 es el más barato de la lista y el que más tiempo estuvo roto sin que nadie lo notara**: tres líneas de cableado, en producción desde el 2026-09-01. Se sostuvo porque la previsualización del diálogo —el único camino que se construía su propio `enabled`— sí dibujaba la cabecera, así que quien la configuraba la veía funcionar antes de descubrir que el PDF salía sin ella. Su lección es de arquitectura, no de cabeceras: **cuando una decisión se mueve de capa, hay que ir a buscar a todos los que seguían leyéndola donde estaba.**

**EXP-022 es el único con pérdida de trabajo real** y el único `mitigado` de la lista junto a EXP-011. Su arreglo está implementado y probado (414 pruebas), pero **qué produjo la pieza mal formada sigue sin identificarse**: el copiar/pegar es el sospechoso por mecanismo y la vuelta completa del portapapeles sobre un diagrama corriente sale limpia, medido. Se eligió a propósito un arreglo **genérico** —el guardado repara y sigue— precisamente para no depender de conocer el disparador.

Deja además una fragilidad de fondo que ningún parche cierra: **el guardado es todo o nada.** Mientras `current_xml` sea un documento entero (DEC-001) escrito de una pieza, cualquier defecto local del árbol es un defecto global del guardado. Y descubrió que **no hay ninguna copia local del trabajo no guardado** — es la capa D de PLAN-035.

**EXP-021 es el único abierto con el arreglo ya diseñado y escrito.** No está pendiente de investigar ni de decidir: está pendiente de *aplicarse*. Se dejó fuera del despliegue del 2026-09-01 por decisión del usuario —salía antes lo ya probado—, y su documento lleva el parche completo: qué línea quita el clamp, qué se borra de CSS, y **cuál de las pruebas actuales afirma justo lo contrario del arreglo y hay que reescribir**. Quien lo retome no tiene que rediagnosticar nada.

**EXP-020 y EXP-021 comparten familia con EXP-017**: los tres son discrepancias entre lo que se ve y lo que se produce —una rasterización, un decodificador, una vista de lienzo—. La lección repetida es que **el pixel que se ve en pantalla no prueba el pixel que se escribe en el archivo**.

**EXP-018 es el de mayor alcance de los cuatro**: afecta al XML canónico, que es la fuente de verdad del proyecto (DEC-001). No lo introdujo PLAN-034 — se descubrió *al* implementarlo, porque el primer intento de anclar los datos de la cabecera reprodujo el mismo error sobre el elemento raíz y una prueba existente lo cazó. Las tres extensiones anteriores llevaban rompiéndolo desde que se añadieron, sin prueba que las cubriera.

**EXP-017 está `activo` aunque el síntoma que lo destapó ya no ocurre.** La causa se corrigió en el thumbnail el 2026-08-21 y **el mismo mecanismo sigue vivo en la exportación a PNG y PDF**: elegir 3× en el modal no da hoy más detalle que 1×. Se estudió el 2026-08-22 sin tocar el código, por decisión del usuario. Cerrarlo por tener un camino arreglado sería la misma trampa que confundir `mitigado` con `resuelto`.

**EXP-011 está mitigado desde el 2026-08-14** ([PLAN-014](../plans/done/014-mitigacion-perdida-de-trabajo-en-colaboracion.md)): sus tres mecanismos dejaron de ser silenciosos. Sigue **activo** porque la mitigación reduce el daño sin arreglar la causa, que continúa sin identificar. La solución de fondo es [MASTER-PLAN-019](../plans/todo/019-master-plan-servidor-autoritativo-de-colaboracion.md).

## Los cinco incidentes de la auditoría 2026-08

EXP-011 a EXP-015 salieron de la misma auditoría. **Son problemas preexistentes encontrados leyendo el código y los datos**, no regresiones de las migraciones `0021`–`0029`. La excepción es EXP-015, que documenta una desviación *durante* la ejecución de PLAN-010.

Tres quedaron resueltos por esas migraciones (013, 014, 015); dos siguen abiertos porque requieren cambios en el cliente (011, 012).

EXP-010 se documentó como `activo` porque en la rama de la auditoría el fix no existía: llegó a `main` trece minutos después de crearse esa rama. Quedó `resuelto` al mezclar, el 2026-08-12.

**Los tres resueltos comparten el mismo riesgo de recaída: su corrección parece innecesaria.** El predicado conjuntista de EXP-014 duplica lógica; el `GRANT` columna a columna de EXP-015 parece complicación gratuita; y una tabla de respaldo en `public` seguirá pareciendo inofensiva. Sus secciones de *Prevención* existen sobre todo para quien vaya a "simplificar".

**EXP-017 pertenece a esa misma familia** por motivo distinto: reescribir el `width`/`height` del SVG parece redundante cuando ya se le pasa el tamaño a `drawImage`. Quien lo borre reintroduce el borroso sin que falle ninguna prueba de tamaño de lienzo.

## Pendiente de completar

El front-matter se generó al reorganizar (2026-08-10) a partir de los encabezados existentes. Los campos marcados `por-determinar` necesitan revisión de quien vivió el incidente: fechas de detección y cierre en EXP-007, y la verificación explícita en los incidentes que no la documentaron.
