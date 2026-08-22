---
id: MASTER-PLAN-018
titulo: Auditoria 2026-08 — base de datos, rendimiento y colaboracion
tipo: master-plan
estado: en-progreso
creado: 2026-08-10
cerrado:
aprobado_por:
progreso: 2/7
agrupa: [PLAN-010, PLAN-011, PLAN-012, PLAN-013, PLAN-014, PLAN-016, PLAN-017]
relacionados: [EXP-011, EXP-012, DEC-005, DEC-006, DEC-007, DEC-009]
---

# MASTER-PLAN-018 · Auditoría 2026-08 — base de datos, rendimiento y colaboración

> **Este es el documento que se abre para saber qué toca ahora.** No contiene trabajo propio: agrupa, ordena y lleva la cuenta de siete planes en cuatro frentes.

## Qué es un master plan

Un master plan **no ejecuta nada**. Agrupa planes que comparten origen o tema, define en qué orden atacarlos, y sirve de tablero: cada plan que se cierra queda marcado aquí. Cuando las siete casillas están marcadas, este documento se cierra y pasa a `done`.

Convención completa en [`docs/README.md`](../../README.md#master-plans).

## Origen

Auditoría de la base de datos Supabase del 2026-08-09/10. Empezó como revisión de esquema y rendimiento; al leer el código para entender el modelo de datos aparecieron dos problemas vivos no documentados (EXP-011, EXP-012), uno de ellos con pérdida de datos.

**Restricción que ordena todo:** hay una presentación en producción próxima. La prioridad no es el mayor beneficio técnico, es **que nada pierda datos y que la demostración no falle**.

## Tablero

| | Plan | Frente | Estado | Bloqueado por |
|:-:|---|---|---|---|
| ☑ | [PLAN-010](../done/010-auditoria-y-remediacion-de-base-de-datos.md) | base de datos | **done** 2026-08-10 | — |
| ☑ | [PLAN-014](../done/014-mitigacion-perdida-de-trabajo-en-colaboracion.md) | colaborativo | **done** 2026-08-14 | — |
| ☐ | [PLAN-013](013-cola-de-incidentes-auditable.md) | observabilidad | todo | **5 decisiones** |
| ◐ | [PLAN-012](012-thumbnails-webp-y-entrega-segura.md) | rendimiento | **en-progreso** — parte A implementada, sin commitear | nada |
| ☐ | [PLAN-017](017-higiene-de-datos-y-retencion.md) | base de datos | todo | 3 decisiones de producto |
| ☐ | [PLAN-016](016-podar-la-publicacion-de-realtime.md) | rendimiento | todo | migrar cliente a Broadcast |
| ☐ | [PLAN-011](011-remediacion-de-base-de-datos-pendiente.md) | base de datos | todo | va con PLAN-012 |

**Progreso: 2/7.** `◐` = trabajo en el árbol, casilla sin marcar: implementado no es cerrado.

> El servidor autoritativo salió a [MASTER-PLAN-019](019-master-plan-servidor-autoritativo-de-colaboracion.md) el 2026-08-11: es infraestructura, no corrección de lo existente.
>
> El módulo de diagramas de arquitectura vive en [MASTER-PLAN-027](027-master-plan-modulo-diagramas-de-arquitectura.md) desde el 2026-08-13: es expansión de producto, no corrección. No comparte ningún plan con este tablero.
>
> `PLAN-005` (cambio de pestañas con instancia viva) **tampoco forma parte de este master plan**: es anterior a la auditoría. Pero tiene un vínculo que hay que mirar antes de retomarlo — ver *Fuera de alcance* al final.

## Orden de ejecución

### Fase 0 — antes de la presentación · ✅ COMPLETA (2026-08-13)

**Solo dos cosas, y una es de cinco minutos.**

1. ☑ **Subir el límite del bucket `thumbnails` a 5 MB.** Elimina un techo que introdujo la migración `0026` y que hoy tiene 4.7× de margen. No es grave —el fallo está capturado como no crítico y el XML se guarda igual— pero quitarlo es gratis. SQL puro, sin despliegue.
   → Aplicado el **2026-08-13**, migración `20260813225135_bucket_thumbnails_5mb`. Probado antes en el entorno local ([`desarrollo-local.md`](../../context/desarrollo-local.md)): 3 MB entra donde antes se rechazaba, 6 MB sigue devolviendo `EntityTooLarge`.
2. ☑ **PLAN-014 paso 2** — que el doble conflicto de CAS pregunte en vez de decidir. Es lo único que hoy puede destruir trabajo del usuario, y su escenario —dos pestañas, mismo diagrama— es el primero que alguien probará.
   → Ya estaba implementado; se descubrió el 2026-08-11 (`diagramStore.ts:349-355`, `App.tsx:271-315`).

Nada más de esta lista mejora la presentación lo suficiente como para justificar el riesgo de tocarlo antes.

### Fase 1 — inmediatamente después

3. ☑ **PLAN-014 completo** (pasos 1 y 3: encolar en vez de descartar, y que el plazo agotado sea un evento). → **Cerrado el 2026-08-14.**

### Reordenado el 2026-08-21 — por tandas, no por fases

El orden anterior ponía **PLAN-013 en cabeza**, y llevaba dos semanas sin poder arrancar: no está bloqueado por trabajo, está bloqueado por cinco decisiones de producto. Es exactamente el riesgo que este documento se anotó a sí mismo ("que PLAN-013 se quede en las precondiciones"), y se materializó. Un tablero que dice *"lo siguiente es X"* sobre algo que no puede empezar hace que todo lo de detrás parezca bloqueado sin estarlo.

La unidad de agrupación ya no es "la fase" sino **una migración, un ciclo de laboratorio, una pasada por los mismos ficheros** — porque con la regla de que ningún cambio de esquema se estrena en producción, el coste dominante es el ciclo del laboratorio, no la sesión de trabajo.

| Tanda | Qué | ¿Laboratorio? | Espera |
|:-:|---|:-:|---|
| **1** | **PLAN-012** — thumbnails a WebP. Implementado; le falta ejecutar el backfill y commitear | no | nada |
| **2** | **PLAN-011 + PLAN-017**, en **una sola migración y un solo ciclo de laboratorio** | sí | 3 decisiones de producto de PLAN-017 |
| **3** | **PLAN-013** | sí | 5 decisiones de producto |
| — | **PLAN-016** | sí | migrar el cliente a Broadcast; sin eso hay regresión silenciosa |

Por qué la tanda 2 se agrupa: PLAN-011 (`has_thumbnail`, el `upsert` sin `SELECT` previo, deuda de esquema) y PLAN-017 (barrido de huérfanos, trigger `AFTER DELETE`, retención de outbox y papelera) son **todo base de datos, ningún canvas**, y comparten el mismo ciclo de verificación. Hacerlos por separado paga ese ciclo dos veces sin ganar nada. PLAN-011 ya dependía de PLAN-012 para no tocar dos veces los mismos 6 sitios.

**Lo que NO se agrupa, y se propuso agrupar:** la columna `kind` de [MASTER-PLAN-027](027-master-plan-modulo-diagramas-de-arquitectura.md) fase 0 **no** entra en la migración de la tanda 2. Parecía gratis tocar el esquema una vez, y es al revés: la decisión D4 —"misma tabla + `kind`"— es precisamente la que ese master plan marca *para replantear*. Meter una migración en producción por eficiencia, para una decisión que se piensa revisar, es cómo se acaba con una columna que nadie quiere.


## Dependencias reales

```
PLAN-014 ──> (protege la presentación)
PLAN-013 ──> MASTER-PLAN-019 decidir la infraestructura con datos
PLAN-012 ──> PLAN-011        has_thumbnail depende de migrar los thumbnails
PLAN-012 ──> PLAN-017        el barrido de huérfanos salió de PLAN-012 y vive aquí
PLAN-011 ─┬─> tanda 2        una migración, un ciclo de laboratorio
PLAN-017 ─┘
cliente  ──> PLAN-016        Broadcast antes de podar la publicación
```

Nada más está acoplado. La única razón por la que PLAN-011 y PLAN-017 van juntos es el coste del ciclo de laboratorio, no una dependencia técnica: si hiciera falta, se pueden separar.

## Criterios de cierre

Este master plan se cierra cuando:

- las siete casillas del tablero están marcadas y sus planes están en `plans/done/`
- EXP-011 y EXP-012 no siguen en estado `activo`
- `context/base-de-datos.md` refleja el estado final, no el de la auditoría

Si algún plan se descarta en vez de ejecutarse, se marca igualmente y el motivo queda en *Resultado*. Un master plan que espera para siempre a un plan que ya nadie va a hacer es ruido.

## Riesgos

**Que la fase 0 crezca.** ~~La tentación de "ya que estamos" antes de una presentación es exactamente cómo se rompe una demostración. Dos elementos, y ninguno más.~~ — Cerrada el 2026-08-13 con exactamente esos dos elementos.

**Que PLAN-013 se quede en las precondiciones.** Sus cinco decisiones llevan abiertas desde que se escribió. Sin ellas, MASTER-PLAN-019 (la infraestructura) nunca podrá decidirse con datos y volverá a discutirse con opiniones.

**Que el tablero se quede sin actualizar.** Un master plan con casillas obsoletas es peor que ninguno: se confía en él. La regla es marcar la casilla en el mismo turno en que el plan se mueve a `done`.

## Fuera de alcance

**PLAN-005** (cambio de pestañas con instancia viva, 2026-07-15) es anterior a la auditoría y no se evaluó aquí. Pero el mecanismo A de EXP-011 se dispara precisamente al **cambiar rápido entre pestañas**, y PLAN-005 reescribe justo ese camino: puede aliviar el problema o empeorarlo, pero no es neutro.

~~Si se retoma, hacerlo **después** de PLAN-014, cuando el fallo ya sea observable.~~

**Corrección (auditoría del 2026-08-14): no está "por retomar" — lleva meses en producción.** Su documento decía que el flag `flujo:tabsCache` seguía OFF; está **ON por defecto**.

Durante esa auditoría se planteó que `canvasSession`, al mantener un contador de generación único para todas las instancias vivas, rompiera el fencing y explicara el mecanismo A de EXP-011. **Se verificó y es falso**: el camino de re-adjuntar llama a `beginImport()` y `completeImport()` de forma síncrona (`useBpmnModeler.ts:299-308`), sin ventana entre medias. El fencing funciona con varias instancias.

**El mecanismo A sigue sin causa identificada.** El registro que añade PLAN-014 sigue siendo la vía para averiguarlo.

## Registro de ejecución

| Fecha | Qué | Resultado |
|---|---|---|
| 2026-08-10 | PLAN-010 cerrado | 9 migraciones aplicadas (`0021`–`0029`). Lista de diagramas 31.2 → 1.33 ms. Fuga P0 cerrada. Lo que requiere cliente se derivó a PLAN-011, PLAN-012 y PLAN-016 |
| 2026-08-13 | **Fase 0 cerrada** | Bucket `thumbnails` 2 MB → 5 MB (migración `20260813225135`). El fallo de subida deja de ser un `console.warn` genérico: `describeThumbUploadError` reporta el tamaño y si el techo fue la causa, con 5 pruebas que fijan el mensaje literal de Storage. El paso 2 de PLAN-014 ya estaba hecho |
| 2026-08-13 | Entorno local montado | Stack de Supabase en Docker + `npm run lab` en el puerto 7654. Al montarlo salió [EXP-016](../../experience/016-el-historial-de-migraciones-no-reproduce-la-base.md): el historial no reproducía la base porque faltaban 6 de las 35 migraciones registradas. Resuelto con un baseline por introspección, verificado con huella md5 de 13 categorías del catálogo. **A partir de ahora ninguna migración se estrena en producción** |
| 2026-08-14 | **PLAN-014 cerrado** | Mecanismos A y B de EXP-011 mitigados: las ediciones emitidas antes de conocer el rol se encolan en vez de descartarse, y agotar la espera del canvas deja de ser definitivo (se sigue reintentando). Registro estructurado en `src/utils/incidents.ts`. 22 pruebas. **No arregla la causa** — EXP-011 sigue activo |
| 2026-08-21 | **Tablero curado** | El `INDEX.md` de `todo` decía 1/7 y este documento 2/7; ambos dicen 2/7. Se corrigió "ocho planes / ocho casillas" (quedaron siete al salir PLAN-015 a MASTER-PLAN-019). PLAN-012 pasa a `en-progreso`: su parte A está implementada en el árbol de trabajo y sin commitear, y el tablero lo daba por no empezado |
| 2026-08-21 | **Reordenado por tandas** | PLAN-013 sale de la cabeza de la cola: llevaba dos semanas parado en decisiones, no en trabajo. PLAN-011 y PLAN-017 se agrupan en un solo ciclo de laboratorio. El barrido de huérfanos, que estaba escrito **dos veces** (PLAN-012 paso 6 y PLAN-017 paso 1, misma consulta), se queda solo en PLAN-017. Se descartó agrupar la columna `kind` de MASTER-PLAN-027 con esa migración: su decisión D4 está marcada para replantear |
| 2026-08-21 | **PLAN-012 · defecto de nitidez corregido** | El rasterizado usaba la regla de las fotos (`Math.min(1, …)`, nunca ampliar) sobre un origen **vectorial**, donde no hay resolución nativa que preservar. El tamaño del ráster acabó dependiendo de cuántos elementos tenía el diagrama: los **simples** salían borrosos (un recorte a pool superior daba 250×150 px para una caja de 300×140 CSS, ampliada ~1.9× en pantallas de 2×). Ahora se rasteriza a la caja de presentación por la densidad objetivo: **900×420 px, calidad 0.92**. 3 pruebas nuevas fijan que nunca excede la caja y que la llena en al menos un eje |
| 2026-08-22 | **PLAN-012 · reconversión aplicada en producción** | Respaldo previo verificado (235 objetos, 11 720 175 bytes, restauración probada en seco). **177/177 convertidos, cero fallos.** Los thumbnails vivos pasan de 7 549 kB a 3 832 kB (−49.2 %) y el máximo cae de 432 kB a 48 kB: el peso deja de depender de la complejidad del diagrama. 20 diagramas ganan vista previa por primera vez. Verificado por SQL que **no se tocó ni una fila de `diagrams`**: sin bump de `updated_at`, sin invalidar la versión CAS de nadie. Quedan 78 huérfanos en SVG, que son de PLAN-017 |
| 2026-08-21 | **PLAN-012 · [EXP-017](../../experience/017-el-thumbnail-webp-salia-borroso-por-el-tamano-intrinseco-del-svg.md), la causa real del borroso** | Con el lienzo ya en 900×420 las miniaturas **seguían** borrosas, también al abrir la imagen suelta. Un `<img>` con un SVG dentro tiene tamaño intrínseco: el navegador rasteriza el vector una vez a ese tamaño y `drawImage` **reescala ese bitmap** en vez de re-rasterizar. Agrandar el destino no agranda el origen. Arreglado con `sizeSvgForRaster`, que fija el `width`/`height` del SVG conservando el `viewBox`. La prueba nueva afirma sobre el contenido del `Blob` que recibe el `<img>`: las de lienzo pasaban con el fallo vivo |
| 2026-08-21 | **PLAN-012 · reconversión de lo existente** | Medido: **235 objetos en el bucket, los 235 SVG**, 11 MB; 20 diagramas sin thumbnail; 78 huérfanos; 0 rutas de subproceso. Por RLS ninguna sesión de navegador ve los 177 diagramas, así que hace falta `service_role`: `src/lab/thumbForge.ts` (renderiza con el `MODELER_CONFIG` real, gated a `MODE=lab`, verificado ausente del bundle de producción) + `scripts/backfill-thumbs.mjs`. Por defecto apunta al laboratorio y no escribe. **Lo ejecuta el usuario** |
| 2026-08-14 | PLAN-005 auditado | Su documento decía que el multicanva estaba apagado; lleva meses **activo en producción**. Corregido paso a paso contra el código. Se hizo su paso 6 parcial (`dispose` al cerrar pestaña, que fugaba instancias). Se descartó por verificación la hipótesis de que el fencing fallara con varias instancias |

## Resultado

(se rellena al cerrar)
