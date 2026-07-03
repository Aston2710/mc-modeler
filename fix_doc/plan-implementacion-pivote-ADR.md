# Plan de implementación — Pivote ADR: XML canónico como única fuente de verdad

**Proyecto:** mc-modeler
**Fecha:** 2026-07-03
**Base:** `ADR-persistence-source-of-truth.md` (decisiones #1–#7, pendientes §6)
**Rama:** continúa sobre `ADR-persistence-source`

> **ESTADO (2026-07-03): Etapas 0–5 IMPLEMENTADAS** (commits `6d3e77c`…`94c944a`, 39 tests verdes, build OK).
> - Migraciones aplicadas en prod: `comment_threads_and_replies`, `diagram_images_bucket` (aditivas, sin efecto en cliente viejo).
> - Datos migrados: comentarios (2 hilos, 2 respuestas, idempotente).
> - **Pendiente del usuario:** deploy del cliente, checklist multiusuario (§2.5), `scripts/migrate-images.mjs --yes` (con usuarios en pausa), y Etapa 6 (limpieza, ≥2 semanas después).
**Estado previo ya en prod:** CAS por `updated_at` + `looksLikeBpmn` + reintento (diagramStore), fencing `canvasSession`, append-only log Yjs, candado `createShape`/`resolveParentOrSkip`.

---

## 0. Mapa del pivote

Objetivo final: **cargar = importar `current_xml` y nada más**. Yjs queda como transporte en vivo (broadcast) dentro de una sesión; deja de persistirse y deja de ser autoridad.

```
HOY                                          DESPUÉS
────                                         ────────
abrir diagrama:                              abrir diagrama:
  import current_xml                           import current_xml   ← ÚNICA verdad
  + loadYjsState (snapshot+log)                (nada más)
  + reconcile aditivo sobre canvas  ← veneno
comentarios: Y.Map('comments') → yjs_docs    comentarios: tablas Supabase + Realtime
persistencia elementos: XML + log Yjs        persistencia: SOLO XML (autosave + CAS)
Yjs: transporte + persistencia + autoridad   Yjs: SOLO transporte de sesión
```

Etapas ordenadas por dependencia. **1 → 2 son secuenciales** (1 desactiva la mina de pérdida de comentarios). 3, 4, 5 independientes entre sí, después del pivote.

| Etapa | Qué | Riesgo | Tamaño |
|---|---|---|---|
| 0 | Red de seguridad (backup + verificación) | — | XS |
| 1 | Comentarios → tablas Supabase + Realtime | Medio (migración de datos) | M |
| 2 | Pivote: Yjs solo-transporte (el corazón) | Alto (colaboración en vivo) | M |
| 3 | Serialización canónica única | Bajo | S |
| 4 | Imágenes base64 → Storage | Medio (export .bpm) | M |
| 5 | UI de conflicto explícito (mal-uso) | Bajo | S |
| 6 | Limpieza final (tablas yjs, candados obsoletos) | Bajo | S |

---

## Etapa 0 — Red de seguridad (antes de tocar nada)

1. `node scripts/diagram-backup.mjs create -m "pre-pivote-adr"` — foto completa (XML + estado Yjs fusionado **incluye comentarios** → es también el respaldo de la migración de la Etapa 1).
2. `node scripts/scan-pool-location.mjs --from-backup` — confirmar 103/103 OK (sin CONTAMINADO/SOLO-YJS). Si aparece algo → `fix-ghost` primero.
3. Copiar `backups/` a disco externo/nube.

**Gate de salida:** backup verificado + scan limpio.

---

## Etapa 1 — Comentarios: Y.Doc → tablas Supabase (mina 1 del pivote)

Los comentarios hoy viven en `doc.getMap('comments')` (`YjsCommentBinding.ts`) y se persisten solo vía el log Yjs. Si la Etapa 2 deja de cargar/persistir Yjs sin esto, **se pierden todos los comentarios**. Por eso va primero.

### 1.1 Migración SQL (Supabase)

```sql
create table comment_threads (
  id uuid primary key default gen_random_uuid(),
  diagram_id uuid not null references diagrams(id) on delete cascade,
  anchor jsonb not null,          -- {type:'element',elementId,elementLabel?} | {type:'selection',elementIds,elementLabel?}
  status text not null default 'open' check (status in ('open','resolved')),
  orphaned boolean not null default false,
  created_by uuid references auth.users(id),
  created_by_name text not null default 'Usuario',
  created_at timestamptz not null default now()
);
create index comment_threads_diagram_idx on comment_threads (diagram_id);

create table comment_replies (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references comment_threads(id) on delete cascade,
  author_id uuid references auth.users(id),
  author_name text not null default 'Usuario',
  content text not null,
  created_at timestamptz not null default now()
);
create index comment_replies_thread_idx on comment_replies (thread_id);

-- RLS (reutiliza can_access_diagram existente)
alter table comment_threads enable row level security;
alter table comment_replies enable row level security;
create policy ct_select on comment_threads for select using (can_access_diagram(diagram_id));
create policy ct_insert on comment_threads for insert with check (can_access_diagram(diagram_id));
create policy ct_update on comment_threads for update using (can_access_diagram(diagram_id)); -- resolver/reabrir/orphaned
create policy cr_select on comment_replies for select
  using (exists (select 1 from comment_threads t where t.id = thread_id and can_access_diagram(t.diagram_id)));
create policy cr_insert on comment_replies for insert
  with check (exists (select 1 from comment_threads t where t.id = thread_id and can_access_diagram(t.diagram_id)));

-- Realtime
alter publication supabase_realtime add table comment_threads, comment_replies;
```

Notas:
- Sin `update`/`delete` en replies (append-only por diseño; borrar/editar respuesta = feature futura con policy propia).
- Ids del cliente hoy son `ct_xxx`/`cr_xxx` (generateId), NO uuid. Decisión: **columna `id uuid` y el cliente genera uuid** (`crypto.randomUUID()`). La migración de datos mapea ids viejos → uuid nuevos (nadie referencia esos ids fuera del propio mapa de comentarios).

### 1.2 Cliente — nuevo `SupabaseCommentBinding`

Nuevo archivo `src/collab/SupabaseCommentBinding.ts` que implementa la **misma interfaz `ICommentBinding`** de `commentStore.ts` (createThread/addReply/resolveThread/reopenThread) → la UI (`CommentsPanel.tsx`, que llama `getCommentBinding()`) **no cambia**.

Comportamiento:
- **Carga inicial:** `select` threads+replies por `diagram_id` → `useCommentStore.syncFromYjs(threads)` (renombrar acción a `setThreads`, cambio cosmético).
- **Escrituras optimistas:** `createThread` genera uuid client-side, actualiza el store al instante, luego `insert` async; si falla → revertir + toast. Mantiene la firma síncrona (`createThread(...): string`).
- **Sync en vivo:** canal `postgres_changes` filtrado `diagram_id=eq.<id>` sobre ambas tablas → sobre cualquier evento, refetch (simple, threads son pocos) o patch incremental. Empezar con refetch (barato, correcto); optimizar después si hace falta.
- **Detección de huérfanos:** conserva la lógica de `checkOrphans` (registry + `commandStack.changed` vía `attachModeler`), pero persiste con `update comment_threads set orphaned=...`. Throttle: solo escribir cuando cambia el valor (igual que hoy).
- Ciclo de vida: creado en `useCollab` (o mejor: hook propio `useComments(diagramId)` desacoplado de Yjs — así el pivote de la Etapa 2 no lo toca).

Cambios en archivos existentes:
- `src/store/commentStore.ts` — sin cambios estructurales (la interfaz ya es agnóstica). `createdAt: number` ↔ `timestamptz`: convertir en el binding.
- `src/hooks/useCollab.ts` — quitar `YjsCommentBinding`; instanciar `SupabaseCommentBinding` (o mover a `useComments`).
- `src/collab/YjsCommentBinding.ts` — se borra en Etapa 6 (mantener mientras exista el script de migración por referencia).

### 1.3 Migración de datos (script local, service_role)

Nuevo `scripts/migrate-comments.mjs` (mismo patrón `_lib.mjs`):
1. Por diagrama: reconstruir Y.Doc (`buildDoc`) → leer `getMap('comments')` → threads+replies.
2. INSERT en `comment_threads`/`comment_replies` (uuid nuevos, conservar `created_at` como `to_timestamp(ms/1000)`, `created_by` = uuid si parsea, si no null + `created_by_name`).
3. Idempotente: marcar migrados (o `on conflict do nothing` con uuid determinista `uuid_v5(diagram_id + old_id)`).
4. Dry-run por defecto; `--yes` aplica; reporta conteos por diagrama (esperado vs insertado).

### 1.4 Cutover Etapa 1

1. Aplicar migración SQL (tablas vacías, sin efecto en app actual).
2. Backup fresco → correr `migrate-comments.mjs --yes`.
3. Verificar conteos (script imprime; spot-check en 2–3 diagramas con comentarios).
4. Deploy del cliente con `SupabaseCommentBinding`.
5. Ventana entre 2 y 4: comentarios nuevos creados vía Yjs no están en tablas → **pausa corta de usuarios** (como en fix-ghost) o re-correr el script (idempotente con uuid determinista) justo tras el deploy.

**Gate de salida:** comentarios visibles en 2 navegadores, crear/responder/resolver/reabrir se propaga en vivo sin Yjs, huérfanos persisten.

**Rollback:** revertir deploy (el cliente viejo sigue leyendo el Y.Doc, que quedó intacto — nada lo borró).

---

## Etapa 2 — El pivote: Yjs solo-transporte-en-vivo (2c del ADR)

Prerequisito cumplido: §6bis verificó **0 diagramas necesitan backfill** (mina 2 no existe) y Etapa 1 sacó los comentarios (mina 1).

### 2.1 Cambios en `src/hooks/useCollab.ts`

**Quitar (persistencia Yjs):**
- `loadYjsState(diagramId)` y el bucle de `Y.applyUpdate` inicial — el doc de sesión **nace vacío**.
- `appendYjsUpdate`, `flushDeltas`, `pendingDeltas`, `schedulePersist`, `persistTimer`, `APPEND_RETRY_MS`.
- Keyframe periódico (`keyframeTick`, `KEYFRAME_MS`, `dirtySinceKeyframe`).
- Keyframe de cierre en el cleanup (`appendYjsUpdate(...encodeStateAsUpdate...)`).
- Import de `@/collab/yjsPersistence` (el archivo se borra en Etapa 6).

**Conservar (transporte en vivo):**
- `Y.Doc` por sesión + `YjsBpmnBinding` + `onDocUpdate → channel.sendYjsUpdate` (broadcast).
- Handshake late-joiner: `onSubscribed`/`onJoin → sendFullState` (ya existe en `SupabaseProvider.ts`).
- Presencia + cursores + fencing (`isCanvasReadyFor`, `startBindingWhenReady`, `BIND_CONFIRM_TIMEOUT_MS`).
- `onDocUpdate` queda solo con el broadcast (sin push a `pendingDeltas`).

Resultado neto: `useCollab` pierde ~60 líneas; el flujo de arranque queda: conectar canal → binding cuando canvas confirme → doc vacío se puebla solo con diffs de la sesión (local + peers).

### 2.2 Semántica resultante (verificada contra el binding actual)

- `YjsBpmnBinding.start()` con doc vacío → rama `ymap.size === 0` → baseline sin escribir nada. Exactamente el diseño ya documentado ("no sembramos el diagrama completo").
- Late-joiner: importa `current_xml` → peers le mandan su estado (diffs desde el inicio de SUS sesiones) → `reconcileCanvasToDoc` aplica solo diffs. Los elementos que su XML ya refleja dan `snapshotsEqual` → no-op.
- **El vector del veneno muere:** ya no existe "estado Yjs de hace semanas reconciliándose encima del XML". Lo único que se reconcilia son cambios de la sesión en curso.
- Persistencia de elementos = **solo** autosave XML (`useAutoSave` cada 20s + CAS). La ventana máxima de pérdida ante crash ≈ intervalo de autosave — igual que hoy para el XML, y el log Yjs que "cubría" ese hueco era precisamente la fuente de corrupción.

### 2.3 Matiz conocido (documentar, no bloquea)

Si un peer A lleva una sesión larga y el joiner B llega con un XML MÁS nuevo que algún valor viejo del doc de A (p. ej. A editó el elemento X hace rato, otro lo cambió después vía otra sesión ya cerrada y guardó), el snapshot LWW de A podría "revivir" un valor viejo en B. **Hoy ya pasa igual** (el doc persistido era aún más viejo); el pivote lo reduce, no lo introduce. Mitigación futura si molesta: epoch del doc ligado a `updated_at` del último save (descartar snapshots de epoch anterior). Anotar como deuda, no implementar ahora.

### 2.4 DB: congelar, no borrar (todavía)

- Dejar de escribir `yjs_updates`/`yjs_documents` (efecto automático del 2.1).
- **NO** dropear tablas aún — son el rollback y la fuente del script de migración de comentarios. Se van en Etapa 6.
- Si existe compactador server-side (cron/edge function del log): pausarlo.

### 2.5 Pruebas (2d del ADR)

Unit (Vitest, ya hay patrón en `YjsBpmnBinding.guard.test.ts` / `.integration.test.ts`):
- useCollab ya no llama `loadYjsState`/`appendYjsUpdate` (mock del módulo → 0 llamadas).
- Binding con doc vacío → no escribe al doc en start (baseline puro).
- Late-join simulado: doc A con diffs de sesión → aplicar a doc B → reconcile crea solo lo nuevo.

Manual multiusuario (2 navegadores, checklist):
1. Edición simultánea (mover, crear, borrar, tipear labels) → converge, sin cancelar edición (guards M1/C1/C3/C4 intactos).
2. Late-join a mitad de sesión → ve estado en vivo completo.
3. A edita, cierra sin esperar autosave → B sigue viendo los cambios (los tiene en su doc); autosave de B los persiste. Documentar: si TODOS cierran antes de cualquier autosave, se pierde la ventana (≤20s) — aceptado.
4. Cambio de pestaña rápido A↔B (la carrera histórica) → sin contaminación.
5. Comentarios en vivo (ya sin Yjs) durante co-edición.
6. Refresh a mitad de edición → reabre desde XML, sin fantasmas.
7. Correr `scan-pool-location.mjs` tras la sesión de prueba → 0 CONTAMINADO.

**Gate de salida:** checklist completo en staging/prod con usuarios reales.

**Rollback:** revertir deploy → el cliente viejo vuelve a leer/escribir el log (las tablas siguen vivas). El hueco: cambios hechos durante la ventana pivote no están en el log — pero SÍ en `current_xml`, que es la verdad. Consistente.

---

## Etapa 3 — Serialización canónica única (pendiente 4 del ADR)

Cierra "dos dialectos de XML" (`<bpmn:participant>` vs `<participant>`).

1. **Regla:** todo XML que se persista sale de `modeler.saveXML()` (moddle serializer) — nunca de strings construidos a mano.
2. Auditar productores de XML que llegan a `saveDiagram`/`repository.save`:
   - `useAutoSave.getXml` → ya es `saveXML()` ✓
   - `importDiagram` (ImportModal / `bpmImport.ts`) → hoy puede guardar el XML crudo importado. Cambiar a: importar al modeler → `saveXML()` → guardar el resultado normalizado. (Alternativa sin canvas: normalizar con moddle headless en el import.)
   - `EMPTY_BPMN` / `EMPTY_SUBPROCESS_BPMN` (diagramStore) → plantillas propias, ya dialecto `bpmn:` ✓
   - `duplicateDiagram` → copia XML ya persistido ✓ (heredará normalización con el tiempo).
3. Endurecer `looksLikeBpmn` (opcional): además del regex, `DOMParser` + check de `parsererror` — rechaza XML malformado, sigue barato.
4. No hay migración retroactiva: los XML "sin prefijo" existentes son válidos y se re-serializan canónicos en su próximo guardado. Los scripts de diagnóstico ya son agnósticos al prefijo.

---

## Etapa 4 — Imágenes embebidas → Supabase Storage (pendiente 1)

Hoy: imágenes como `[IMAGE:dataUrl]` base64 dentro del XML → filas de MBs (riesgo de bloat señalado en ADR §3.5).

1. Bucket `diagram-images` (privado), path `<diagram_id>/<image_id>`; policies por `can_access_diagram` (mismo patrón que `thumbnails`).
2. Alta de imagen (`ImageUploadModal` / `ImageContextPadModule`): subir a Storage → guardar en el elemento `[IMAGE:storage://diagram-images/<path>]` (o URL firmada corta + resolución al render). Render: resolver a signed URL con cache en memoria (patrón `thumbCache` de `SupabaseRepository`).
3. **Export `.bpm`** (`bpmExport.ts`): decidir — (a) inline de vuelta (fetch → base64) para archivo autocontenido [recomendado], o (b) exportar la referencia y requerir sesión al importar. Import `.bpm` con base64: al importar, subir a Storage y reescribir la referencia (así el import nunca re-infla el XML).
4. Duplicar diagrama: copiar objetos de Storage al path del nuevo id (o compartir con refcount — más simple: copiar).
5. Migración retroactiva: `scripts/migrate-images.mjs` — escanear `current_xml` con `data:` URLs → subir → reescribir XML → save (backup previo). Dry-run primero.
6. Borrado de diagrama: limpiar carpeta de Storage (hoy los thumbnails ya tienen ese flujo — replicar).

---

## Etapa 5 — Confirmación explícita de conflicto en UI (pendiente 5)

Hoy (`diagramStore.saveDiagram`): doble conflicto CAS → acepta el estado del otro en silencio (`console.warn`). Correcto para tiempo real; el caso mal-uso (pestaña vieja abierta días, edición offline larga) merece señal.

1. En la rama de doble conflicto: toast persistente (via `uiStore`/`ToastContainer`) — "Este diagrama cambió en el servidor. Se cargó la versión más reciente." + botón "Recargar" (re-import del XML fresco al canvas) y opción avanzada "Guardar mi copia como duplicado" (usa `duplicateDiagram` con el XML local → cero pérdida sin clobber).
2. Nunca ofrecer "forzar sobreescritura" — contradice el ADR.
3. Test: extender `diagramStore.cas.test.ts` — doble conflicto dispara la notificación.

---

## Etapa 6 — Limpieza final (tras ≥2 semanas estables post-pivote)

1. Backup final del estado Yjs (`diagram-backup.mjs create -m "pre-drop-yjs"`) → archivar.
2. `drop table yjs_updates; drop table yjs_documents;` (+ quitar de publicaciones/policies).
3. Borrar código muerto: `src/collab/yjsPersistence.ts`, `src/collab/YjsCommentBinding.ts`, ramas de compat en scripts (`buildDoc`, `yjsMergedState` en backup — el backup pasa a solo-XML+comentarios-en-tablas).
4. Simplificar `resolveParentOrSkip`: el caso "canvas sin pools → permitir parent no resoluble" existía para diagramas con pool solo-en-Yjs; §6bis demostró que no existen → **parent no resoluble = descartar siempre** (candado más duro). Ajustar `YjsBpmnBinding.guard.test.ts`.
5. Actualizar docs: `scripts-diagnostico-backup-restore.md` (scan pierde la columna POOL-YJS; taxonomía se reduce), ADR §6 → estados ✅.

---

## Riesgos y mitigaciones (resumen)

| Riesgo | Etapa | Mitigación |
|---|---|---|
| Pérdida de comentarios en migración | 1 | Backup pre-pivote contiene Y.Doc fusionado; script idempotente con conteos; Y.Doc no se toca hasta Etapa 6 |
| Comentarios creados en la ventana de cutover | 1 | Pausa corta de usuarios o re-run idempotente post-deploy |
| Regresión en co-edición en vivo | 2 | El binding NO cambia (solo deja de recibir estado persistido); checklist multiusuario; rollback = revert deploy |
| Cambios sin persistir si todos cierran <20s | 2 | Ventana ya existente hoy; opcional: flush de autosave en `beforeunload` |
| Snapshot viejo de sesión larga revive valor | 2 | Ya ocurre hoy con ventana mayor; deuda anotada (epoch por `updated_at`) |
| Export .bpm sin imágenes | 4 | Inline al exportar (opción a) |
| Drop prematuro de tablas yjs | 6 | Esperar ≥2 semanas + backup archivado |

## Orden de ejecución propuesto (conversaciones/PRs)

1. **PR-1:** Etapa 1 completa (SQL + binding + script migración). Cutover coordinado.
2. **PR-2:** Etapa 2 (pivote useCollab) + suite de pruebas. Cutover con checklist multiusuario.
3. **PR-3:** Etapa 3 + Etapa 5 (chicas, juntas).
4. **PR-4:** Etapa 4 (imágenes).
5. **PR-5:** Etapa 6 (limpieza), semanas después.
