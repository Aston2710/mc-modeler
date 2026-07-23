# Flechas duplicadas en colaboración — divergencia de id de conexión

**Rama:** `main` (local, sin commit al momento de escribir)
**Archivo núcleo:** `src/collab/YjsBpmnBinding.ts`
**Test:** `src/collab/YjsBpmnBinding.connid.test.ts` (bpmn-js real en jsdom)

---

## Síntoma

"A veces se crean varias flechas duplicadas de una misma flecha" — sin que dos personas hayan dibujado la misma flecha. Shapes nunca se duplican; solo conexiones. Aparece de forma intermitente, típicamente tras recargar el diagrama, cambiar de pestaña y volver, o cualquier reconcile-desde-XML.

## Causa raíz (no es race condition ni concurrencia)

Asimetría entre cómo el binding Yjs crea shapes vs conexiones:

- `createShape` construye el businessObject y **fija su id**: `businessObject.id = snap.id`.
- `createConnection` (antes) pasaba solo `{ id, type }` a `modeling.createConnection`, **sin** construir bo ni fijar id.

En bpmn-js (`ElementFactory.js:161-166`), si no se pasa businessObject, hace `bpmnFactory.create(type)` que asigna un **id automático** al bo. `snap.id` se aplica al elemento de diagrama pero **no** al businessObject:

```
element.id       = snap.id             (ej. "Flow_X")  ← clave del Y.Doc
businessObject.id = "SequenceFlow_auto" (divergente!)   ← lo que se serializa al XML
```

**El ciclo que duplica:**
1. El binding crea la flecha (colaboración o reconcile del doc persistido) → element.id=`Flow_X`, bo.id=`auto`.
2. Al exportar, el XML usa el id del bo (`auto`); `Flow_X` no queda en el XML.
3. Al re-importar, bpmn-js crea la flecha con element.id=`auto` (sigue al bo).
4. El Y.Doc sigue con la clave `Flow_X` → en `reconcileCanvasToDoc` esa clave no está en el registro → se trata como alta → **crea una segunda flecha**. `updateElement` (`if (!el) createShapeOrConnection`) hace lo mismo con updates.

Shapes no sufren esto porque su bo.id == element.id == snap.id (createShape lo fija) → sobrevive el round-trip export/import. El Y.Doc **persiste** server-side (`yjs_documents` + `yjs_updates`, append-only), así que las entradas con id divergente sobreviven entre sesiones — por eso también afecta a un solo usuario que recarga (el reconcile-on-start crea las conexiones del doc).

## Solución

### Fix principal — coherencia de id (espejo de createShape)
`createConnection` ahora construye el businessObject y fija `businessObject.id = snap.id` antes de `modeling.createConnection`. Así `element.id == businessObject.id == clave del doc` a través de export/import → el guard idempotente `if (registry.get(snap.id)) return` vuelve a ser efectivo. Sana lo nuevo y las entradas del doc ya persistidas (fuerza el id en cada reconcile-create).

### Red de seguridad — dedup NO destructivo (para datos ya guardados corruptos)
Un diagrama guardado ANTES del fix tiene el XML con id-auto y el doc con id-original; en la primera carga tras el fix podrían coexistir ambas. `sameConnectionExists(source, target, snap)` omite la creación si ya existe una conexión con **mismo source→target, mismo tipo y waypoints idénticos** (redondeados).
- **No borra nada** (solo omite crear) → cero riesgo de pérdida de datos.
- **No confunde flechas paralelas legítimas**: dos paralelas reales nunca comparten waypoints exactos (van separadas ±10px por el TableRouter-lite). El criterio de waypoints idénticos las distingue.

## Medidas de seguridad / por qué es seguro

- No se elimina ningún elemento ni entrada del doc (el dedup solo omite crear).
- El dedup usa igualdad exacta de waypoints, no heurística difusa → no descarta conexiones distintas.
- El fix es simétrico con el patrón ya probado de `createShape`.
- Compatible con el resto del binding (suppress/origin/corrective pass intactos).

## Verificación

`src/collab/YjsBpmnBinding.connid.test.ts` (bpmn-js REAL — el bug vive en cómo bpmn-js asigna el id del bo, un mock no lo capturaría):
1. Conexión creada por el binding → `businessObject.id === element.id === 'Flow_remote'` (falla sin el fix).
2. Segundo reconcile → no duplica (1 sola flecha).
3. Snapshot con otro id pero misma flecha (waypoints idénticos) → no se crea el duplicado; sigue habiendo 1.
4. Paralela legítima (waypoints distintos) → SÍ se crea (2 flechas).

Suite completa **137/137**, `tsc` + `lint` + `build` limpios.

## Limitación conocida

Si una flecha ya-corrupta fue **editada** tras la divergencia de modo que los waypoints del doc difieren de los del XML, el dedup por waypoints exactos no la reconoce y podría aparecer un duplicado una vez más; al borrarlo y guardar, el doc se normaliza (el fix principal ya evita nuevas divergencias). Es un caso residual de datos preexistentes, no del flujo nuevo.
