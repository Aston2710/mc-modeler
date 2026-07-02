# Rework de persistencia colaborativa: de snapshot compartido a log append-only

**Proyecto:** mc-modeler
**Stack:** React 19 · bpmn-js v18 · Yjs CRDT · Supabase (Postgres + Realtime) · localforage
**Archivos centrales:** `src/collab/yjsPersistence.ts`, `src/hooks/useCollab.ts`
**Base de datos:** tablas `public.yjs_documents`, `public.yjs_updates` (nueva)
**Severidad:** Alta — riesgo de retroceso/pérdida del estado persistido de un diagrama bajo concurrencia
**Fecha:** 2026-07-01
**Estado:** Fases 1, 2, 3 y 5 en producción. Fase 4 (compactación) pendiente. Pruebas manuales pendientes.

---

## Tabla de contenidos

1. [Contexto y relación con el fix anterior](#1-contexto)
2. [El problema](#2-el-problema)
3. [Por qué los parches no bastan](#3-por-qué-los-parches-no-bastan)
4. [Decisiones de arquitectura](#4-decisiones-de-arquitectura)
5. [Arquitectura elegida: log append-only + snapshot compactado](#5-arquitectura-elegida)
6. [Relación con la filosofía Google Docs](#6-relación-con-la-filosofía-google-docs)
7. [Plan por fases](#7-plan-por-fases)
8. [Fase 1 — DDL](#8-fase-1--ddl)
9. [Fase 2 — Lectura dual](#9-fase-2--lectura-dual)
10. [Fase 3 — Escritura append-only](#10-fase-3--escritura-append-only)
11. [Fase 5 — yjs_documents solo-lectura](#11-fase-5--yjs_documents-solo-lectura)
12. [Fase 4 — Compactación (PENDIENTE)](#12-fase-4--compactación-pendiente)
13. [Garantía de no-pérdida de datos existentes](#13-garantía-de-no-pérdida)
14. [Impacto en usuarios existentes](#14-impacto-en-usuarios-existentes)
15. [Modos de fallo y por qué cada uno es seguro](#15-modos-de-fallo)
16. [Riesgos gestionados durante el rollout](#16-riesgos-gestionados)
17. [Pruebas pendientes](#17-pruebas-pendientes)
18. [Limpieza pendiente](#18-limpieza-pendiente)
19. [Archivos y migraciones](#19-archivos-y-migraciones)

---

## 1. Contexto

Este rework es **independiente** de dos incidentes previos, aunque toca la misma zona:

- `collab-typing-concurrency-fix.md` — protección del editor inline (interceptor prioridad 5000) en el **cliente**.
- `pool-cross-contamination-race-fix.md` — condición de carrera de orquestación de canvas que cruzaba contenido entre diagramas en el **cliente** (fencing token `canvasSession.ts`).

Este documento cubre una tercera capa, distinta: la **integridad de la persistencia en el servidor** para el *mismo* diagrama. Surgió al auditar `yjsPersistence.ts` durante la verificación final del fix de pool cruzado (ver §10.2 de ese doc, "hallazgo adicional").

---

## 2. El problema

### Diseño original

`yjs_documents` guardaba el estado completo del `Y.Doc` de cada diagrama en una única celda:

```
yjs_documents (diagram_id PK, state text /* base64 */, updated_at)
```

El cliente persistía así (debounce 1500 ms):

```typescript
// saveYjsState — ORIGINAL
await supabase.from('yjs_documents').upsert(
  { diagram_id, state: base64(Y.encodeStateAsUpdate(doc)), updated_at: now() },
  { onConflict: 'diagram_id' }
)
```

### El defecto

`yjs_documents.state` es **una celda mutable compartida** contra la que N clientes hacen **read-modify-write** (`upsert` = "escribe todo mi estado, pisando lo que hubiera"). Semántica **last-write-wins** sin control de versión.

**Escenario de fallo:** dos clientes editan el mismo diagrama. Cliente A guarda un estado completo. Cliente B, momentáneamente rezagado por un blip de red (aún no recibió por Realtime el último cambio de A), guarda su estado — más viejo — y **pisa** el de A. El checkpoint persistido retrocede. Si en ese instante todos se desconectan, la próxima carga fría parte del estado retrocedido.

No cruza datos entre diagramas distintos (la fila está aislada por `diagram_id`), pero **puede retroceder/perder cambios del mismo diagrama**.

### Por qué no lo detectábamos siempre

El sync en vivo (Realtime broadcast, peer-to-peer) enmascara el problema mientras haya clientes conectados: Yjs converge entre peers vivos. El defecto solo muerde en **carga fría** (todos desconectados, reconstrucción desde DB). Ventana proporcional a la latencia → intermitente, peor con más usuarios concurrentes.

---

## 3. Por qué los parches no bastan

Se evaluaron y descartaron soluciones incrementales sobre la celda compartida:

| Parche | Por qué no |
|---|---|
| Merge-before-write (leer estado guardado, `applyUpdate`, reescribir) | Reduce la ventana pero deja una carrera read-modify-write residual. No elimina la clase de fallo. |
| Optimistic lock / CAS (columna `rev`, `UPDATE ... WHERE rev=?` + retry) | Robusto, pero sigue siendo escritura sobre celda compartida con reintentos. Complejidad sin eliminar la raíz. |

**Principio de diseño:** eliminar la escritura compartida, no protegerla. Si nadie sobreescribe, no hay nada que perder. Parchar la celda compartida es precisamente el tipo de acumulación de deuda que lleva a una crisis de software más adelante.

---

## 4. Decisiones de arquitectura

Cuatro decisiones, tomadas de patrones probados en sistemas distribuidos:

1. **Log de operaciones append-only, no estado mutable** (event sourcing / commit log). El almacén de verdad es una secuencia inmutable de updates; el "estado actual" es un derivado. Es el patrón canónico de persistencia de Yjs en servidor (`y-leveldb`, `y-redis`, `Hocuspocus`, `y-postgres`) — no invención propia.

2. **Snapshot compactado como optimización de lectura, no como verdad.** El log completo sería caro de leer; un snapshot periódico + tail acota el costo. El snapshot es cache reconstruible, no la fuente.

3. **Single-writer del snapshot vía separación de roles.** Los clientes solo appendean al log (INSERT). El snapshot lo escribe exclusivamente un compactador server-side (service-role). Nunca dos escritores sobre la misma celda.

4. **Fail-closed / defensa en profundidad.** RLS revoca la escritura de clientes a la tabla de snapshot (Fase 5), de modo que ni un bug futuro del cliente pueda corromperla. Datos sensibles (procesos de negocio) → ante duda, el sistema se abstiene.

---

## 5. Arquitectura elegida

```
                    ┌─────────────────────────────────────────────┐
   Cliente A ──┐    │  yjs_updates (LOG append-only)               │
   Cliente B ──┼──▶ │  id(seq) | diagram_id | update(b64) | ts     │  ◀── solo INSERT
   Cliente C ──┘    │  ...                                          │      (clientes)
                    └─────────────────────────────────────────────┘
                                     │
                          Compactador (service-role, Fase 4)
                          lee snapshot + tail → fusiona (Y.mergeUpdates)
                                     │ escribe (única fuente de escritura)
                                     ▼
                    ┌─────────────────────────────────────────────┐
                    │  yjs_documents (SNAPSHOT compactado)         │
                    │  diagram_id | state(b64) | last_seq | ts     │  ◀── solo lectura
                    └─────────────────────────────────────────────┘      (clientes)

   Carga (cliente) = state (snapshot)  +  updates WHERE id > last_seq  → applyUpdate en orden
```

**Por qué mata la carrera de raíz:** dos INSERT nunca colisionan — cada uno recibe su propio `id` de secuencia. Cero read-modify-write. Cero last-write-wins. Cero pérdida por construcción, no por sincronización. Los updates de Yjs son conmutativos e idempotentes → aplicar snapshot + tail en cualquier orden reconstruye exactamente el mismo doc.

**Decisión de formato:** columna `update` en `text`/base64 (misma convención que `yjs_documents.state`), no `bytea`. Razón: `bytea` sobre PostgREST/supabase-js devuelve hex `\x...` que hay que decodificar — fricción real — a cambio de ~33% de tamaño, irrelevante a los tamaños actuales (snapshots avg 12 kB). Simplicidad e integración probada sobre micro-optimización.

---

## 6. Relación con la filosofía Google Docs

El modo colaborativo del proyecto se diseñó siguiendo el modelo de Google Docs. Este rework **refuerza** esa filosofía, no la contradice:

- Google Docs nunca "guarda el documento entero sobreescribiendo" — persiste un **log de operaciones (mutaciones)** y las reproduce.
- El `upsert` de estado completo original era precisamente **la desviación** del patrón a nivel de persistencia.
- El log append-only ES el modelo Google Docs aplicado a la capa que faltaba.

| Capa | Filosofía Google Docs | Antes | Ahora |
|---|---|---|---|
| Cliente: aplicar ops remotas sin romper edición | Dos capas separadas (interceptor 5000) | ✅ Alineado | ✅ Intacto |
| Servidor: persistir cambios | Log append-only de operaciones | ❌ Desviado (upsert estado completo) | ✅ Alineado |

El interceptor prioridad 5000, `suppress`, guards de `directEditing` y todo `YjsBpmnBinding` quedan **intactos** — son otra capa del stack.

---

## 7. Plan por fases

Diseñado para ser desplegable y reversible fase por fase, con orden estricto por seguridad.

| Fase | Qué | Toca | Depende de |
|---|---|---|---|
| 1 | DDL: crear `yjs_updates`, añadir `last_seq`, RLS, índices | DB (aditivo) | — |
| 2 | Lectura dual (snapshot + tail) | Cliente (read) | Fase 1 |
| 3 | Escritura al log (delta + keyframe + reintento) | Cliente (write) | Fase 2 desplegada |
| 4 | Compactador (Edge Function + pg_cron) | Infra | Fase 3 |
| 5 | `yjs_documents` solo-lectura para clientes | DB (RLS) | Fase 3 desplegada |

**Orden crítico (riesgo A1):** Fase 2 (lectura dual) debe estar desplegada a TODOS los clientes antes de Fase 3. Fase 5 (revocar escritura) debe ir después de que Fase 3 esté en producción — si se revoca la escritura mientras clientes viejos aún hacen `upsert`, sus guardados fallarían.

---

## 8. Fase 1 — DDL

Migración `yjs_append_only_log_phase1`. Puramente aditiva; no modifica ninguna fila existente.

```sql
-- Log append-only. Clientes SOLO insertan.
create table if not exists public.yjs_updates (
  id          bigint generated always as identity primary key,
  diagram_id  uuid not null references public.diagrams(id) on delete cascade,
  update      text not null,          -- base64 (misma convención que yjs_documents.state)
  created_at  timestamptz not null default now()
);

create index if not exists yjs_updates_diagram_seq_idx
  on public.yjs_updates (diagram_id, id);

-- Cursor de compactación. Filas existentes -> 0 (snapshot actual sigue válido tal cual).
alter table public.yjs_documents
  add column if not exists last_seq bigint not null default 0;

-- RLS: reusa las funciones de autorización existentes.
alter table public.yjs_updates enable row level security;

create policy yjs_updates_select on public.yjs_updates
  for select using (private.can_access_diagram(diagram_id));

create policy yjs_updates_insert on public.yjs_updates
  for insert with check (private.can_edit_diagram(diagram_id));
-- Sin policy de UPDATE/DELETE -> denegados a clientes; solo el compactador (service-role) borra.
```

Verificado post-migración: checksum de los 100 `state` idéntico al baseline, `last_seq=0` en las 100 filas, log vacío, `yjs_updates` sin hallazgos de advisor.

---

## 9. Fase 2 — Lectura dual

`loadYjsState` deja de devolver un único string y pasa a devolver la lista de blobs a aplicar (snapshot + tail):

```typescript
export async function loadYjsState(diagramId: string): Promise<string[]> {
  if (!supabase) return []
  const blobs: string[] = []

  // 1. Snapshot compactado + cursor.
  const { data: snap } = await supabase
    .from('yjs_documents')
    .select('state, last_seq')
    .eq('diagram_id', diagramId)
    .maybeSingle()
  const snapState = (snap as { state: string | null } | null)?.state ?? null
  if (snapState) blobs.push(snapState)
  const lastSeq = (snap as { last_seq: number | null } | null)?.last_seq ?? 0

  // 2. Tail: updates del log posteriores al snapshot, en orden de secuencia.
  const { data: tail } = await supabase
    .from('yjs_updates')
    .select('update')
    .eq('diagram_id', diagramId)
    .gt('id', lastSeq)
    .order('id', { ascending: true })
  if (tail) for (const row of tail as { update: string }[]) blobs.push(row.update)

  return blobs
}
```

Consumidor en `useCollab.ts` — aplica cada blob con su propio guard (mejora de integridad: una fila corrupta ya no invalida la carga entera):

```typescript
const blobs = await loadYjsState(diagramId)
if (disposed) return
for (const b64 of blobs) {
  try { Y.applyUpdate(doc, base64ToUint8(b64), REMOTE_ORIGIN) } catch { /* fila corrupta: ignorar */ }
}
```

**Retrocompatible:** para diagramas existentes (`last_seq=0`, log vacío) devuelve `[snapshot]` — comportamiento idéntico al anterior. La escritura seguía por `upsert` en esta fase (sin cambios), por lo que clientes viejos y nuevos coexisten.

---

## 10. Fase 3 — Escritura append-only

**Aquí muere la carrera.** El cliente deja de hacer `upsert` de estado completo y pasa a appendear al log.

`yjsPersistence.ts` — `saveYjsState` (upsert) reemplazada por `appendYjsUpdate` (INSERT):

```typescript
export async function appendYjsUpdate(diagramId: string, updateB64: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase
    .from('yjs_updates')
    .insert({ diagram_id: diagramId, update: updateB64 })
  return !error
}
```

`useCollab.ts` — buffer de deltas fusionados + keyframes + reintento:

```typescript
const PERSIST_DEBOUNCE_MS = 1500
const KEYFRAME_MS = 30000          // keyframe periódico (red de seguridad)
const APPEND_RETRY_MS = 2000       // backoff de reintento

let pendingDeltas: Uint8Array[] = []
let dirtySinceKeyframe = false

// Fusiona los deltas de la ventana en un update y lo añade al log.
// Si falla (red), reencola al frente y reintenta — nunca descarta un cambio.
const flushDeltas = async () => {
  if (disposed || pendingDeltas.length === 0) return
  const merged = Y.mergeUpdates(pendingDeltas)
  pendingDeltas = []
  const ok = await appendYjsUpdate(diagramId, uint8ToBase64(merged))
  if (!ok && !disposed) {
    pendingDeltas.unshift(merged)
    setTimeout(() => { void flushDeltas() }, APPEND_RETRY_MS)
  }
}

const onDocUpdate = (update: Uint8Array, origin: unknown) => {
  if (origin === REMOTE_ORIGIN) return
  channel.sendYjsUpdate(uint8ToBase64(update))  // sync en vivo, sin cambios
  pendingDeltas.push(update)                     // persistencia: acumular delta
  dirtySinceKeyframe = true
  schedulePersist()                              // volcado fusionado (debounce 1.5s)
}

// Keyframe periódico si hubo cambios: snapshot completo al log como checkpoint.
const keyframeTick = () => {
  if (disposed) return
  if (dirtySinceKeyframe) {
    dirtySinceKeyframe = false
    void appendYjsUpdate(diagramId, uint8ToBase64(Y.encodeStateAsUpdate(doc)))
  }
  keyframeTimer = setTimeout(keyframeTick, KEYFRAME_MS)
}

// Al desmontar (cambio de diagrama / cierre): keyframe de cierre = snapshot completo.
// Captura TODO el estado del doc (incluidos deltas pendientes ya aplicados al doc).
void appendYjsUpdate(diagramId, uint8ToBase64(Y.encodeStateAsUpdate(doc)))
```

**Puntos clave del diseño:**
- **Keyframes al log, no a `yjs_documents`.** Un estado completo también es un update Yjs válido → se appendea como una fila más. Así el cliente **nunca** vuelve a escribir la celda de snapshot; se mantiene el invariante "cero escritura compartida".
- **Reintento con reencolado**: un INSERT fallido no pierde el cambio; se reintenta con backoff.
- **Triple red de seguridad ante deltas perdidos**: reintento + keyframe periódico (30s) + keyframe de cierre. Acota la pérdida máxima (ante desconexión total simultánea) a la ventana entre keyframes.
- **`Y.mergeUpdates`** agrupa los deltas de la ventana en un solo INSERT → mismo número de writes que el upsert original (uno por ventana debounce), pero payload mucho menor (delta ~cientos de bytes vs snapshot ~12 kB).

---

## 11. Fase 5 — yjs_documents solo-lectura

Migración `yjs_documents_client_readonly_phase5`. Defensa en profundidad: tras Fase 3 ningún cliente escribe `yjs_documents`, así que se revoca formalmente esa capacidad.

```sql
drop policy if exists yjs_insert on public.yjs_documents;   -- INSERT de clientes
drop policy if exists yjs_update on public.yjs_documents;   -- UPDATE de clientes
-- yjs_select se MANTIENE: la lectura dual necesita leer state + last_seq.
```

Estado final de policies:

| Tabla | Cliente puede | Cliente NO puede |
|---|---|---|
| `yjs_updates` | SELECT, INSERT | UPDATE, DELETE |
| `yjs_documents` | SELECT | INSERT, UPDATE |

El compactador (service-role, Fase 4) bypassa RLS → sigue pudiendo escribir el snapshot y borrar filas fusionadas del log.

**Nota sobre diagramas nuevos:** tras Fase 5, ningún cliente crea filas en `yjs_documents`. Un diagrama nuevo puede no tener fila de snapshot nunca (hasta que el compactador la cree). `loadYjsState` maneja el snapshot nulo (devuelve solo el tail del log). Funciona sin fila de snapshot.

---

## 12. Fase 4 — Compactación (PENDIENTE)

**No implementada aún. Conversación y decisiones para mañana.**

### Problema que resuelve

Sin compactador, el log (`yjs_updates`) solo crece y `yjs_documents.state` queda congelado. Funcionalmente correcto (la lectura dual reconstruye desde snapshot congelado + log completo), pero:
- Las lecturas se alargan a medida que crece el tail.
- El almacenamiento crece (irrelevante al volumen actual, relevante a largo plazo).

### Diseño propuesto

**Supabase Edge Function** (Deno corre `npm:yjs`) disparada por **`pg_cron`** (vía `pg_net` para invocar la función HTTP, con la service-role key en el Vault de Supabase).

Algoritmo, seguro ante inserts concurrentes:

1. `fold_upto := SELECT max(id) FROM yjs_updates WHERE diagram_id=?` al inicio.
2. Fusionar `state` actual + updates con `id <= fold_upto` (`Y.applyUpdate` sobre un doc, luego `Y.encodeStateAsUpdate`).
3. **En una sola transacción:** `UPDATE yjs_documents SET state=?, last_seq=fold_upto` **y** `DELETE FROM yjs_updates WHERE diagram_id=? AND id <= fold_upto`.
4. Updates con `id > fold_upto` (insertados durante la compactación) quedan intactos para la próxima ronda.

**Seguridad:** ningún update se pierde (solo se borran los ya fusionados, atómicamente con la escritura del snapshot); un lector concurrente ve `(snapshot viejo + todos los updates)` o `(snapshot nuevo + tail)` — ambos reconstruyen el mismo doc.

### Decisiones pendientes para mañana

- **Mecanismo de disparo**: `pg_cron` + `pg_net` + service key en Vault vs. otra opción. Implica un secreto y un endpoint nuevos en producción.
- **Lock de compactación concurrente** (riesgo A2): `pg_advisory_xact_lock(diagram_id)` o `SELECT ... FOR UPDATE SKIP LOCKED` para que dos runs solapados no toquen el mismo diagrama.
- **Cadencia**: por intervalo (cada N min) vs. por umbral de filas por diagrama.
- **Monitoreo**: lag de compactación (filas sin foldear por diagrama); alerta si crece.

---

## 13. Garantía de no-pérdida

Verificada empíricamente durante Fase 1, no en teoría:

- Baseline pre-migración: 100 filas en `yjs_documents`, checksum `1174322996451d0c7fa9b7a2bbf420be`.
- Respaldo creado (`yjs_documents_backup_20260701`): 100 filas, **mismo checksum**.
- Post-migración: **mismo checksum** — datos existentes byte a byte idénticos.
- `diagrams.current_xml` (102 filas): nunca tocado en ninguna fase.

Ninguna fase hace UPDATE/DELETE ni transforma filas existentes de `yjs_documents`. Fase 1 y 5 son puramente aditivas (crear tabla, añadir columna) o de permisos (revocar policies). La columna `state` nunca cambió de tipo (se mantuvo `text`), por lo que cero transformación de datos históricos.

---

## 14. Impacto en usuarios existentes

**Ninguno perceptible. Transparente. Sin proceso de backfill.**

El contenido que un usuario **ve** al abrir un diagrama sale de `diagrams.current_xml` (importado al canvas por `App.tsx`), **no** de la capa Yjs. `yjs_documents`/log es solo el overlay de co-edición en vivo.

- Diagramas existentes: `current_xml` intacto → se ven idénticos.
- Capa Yjs para diagramas existentes: `loadYjsState` devuelve `[snapshot existente]` + `[]` (log vacío) → idéntico al comportamiento previo.
- Aunque `yjs_documents` estuviera vacía, los diagramas se seguirían viendo (salen de `current_xml`).

---

## 15. Modos de fallo

| Fallo | Resultado |
|---|---|
| Dos clientes escriben "a la vez" | Dos INSERT con ids distintos. Ambos persisten. Imposible perder uno. |
| Cliente rezagado por blip de red | Su INSERT es un delta más en el log; se fusiona igual. No pisa nada. |
| Todos se desconectan a la vez | El log tiene todos los deltas + keyframes; próxima carga reconstruye. |
| INSERT de delta falla (red) | Reintento con backoff; si persiste el fallo, el keyframe periódico/de cierre lo captura. |
| Fila de update corrupta | `applyUpdate` la rechaza (try/catch por blob); el resto del doc converge. Aislada a una fila. |
| Diagrama borrado | `on delete cascade` limpia log y snapshot. |
| Compactador crashea a media compactación (Fase 4) | Rollback transaccional; log intacto; reintento limpio. |
| Cliente intenta escribir `yjs_documents` (bug futuro) | RLS deniega (Fase 5). Imposible corromper la celda de snapshot. |

Honestidad: ningún diseño garantiza "cero fallos" en absoluto. Lo que este diseño **sí garantiza por construcción** es la eliminación de la clase de fallo objetivo — pérdida/retroceso del estado persistido por escritura concurrente — porque no existe escritura compartida sobreescribible en ningún punto del camino cliente.

---

## 16. Riesgos gestionados

| ID | Riesgo | Manejo |
|---|---|---|
| A1 | Ventana de versiones mixtas (cliente viejo upsert + nuevo append) | Orden estricto: Fase 2 (lectura dual) desplegada a todos antes de Fase 3; Fase 5 (revocar) solo tras Fase 3 en prod. Cumplido. |
| A2 | Compactación concurrente consigo misma | Lock por diagrama (pendiente en Fase 4). |
| A3 | Deltas que fallan al persistir | Reintento + keyframe periódico + keyframe de cierre. Implementado en Fase 3. |
| A4 | Atomicidad snapshot+delete en compactación | Una transacción (pendiente en Fase 4). |
| B5 | Crecimiento del log sin compactador | Aceptable al volumen actual; Fase 4 lo acota. Monitoreo pendiente. |

---

## 17. Pruebas pendientes

**Todas pendientes — a realizar mañana.**

1. **Escritura al log en prod**: editar un diagrama → confirmar que aparecen filas en `yjs_updates` para ese `diagram_id`.
   ```sql
   select id, diagram_id, length(update) as len_b64, created_at
   from public.yjs_updates
   where diagram_id = '<id>'
   order by id desc limit 20;
   ```
2. **Reconstrucción en carga fría**: editar, cerrar todas las sesiones, reabrir → confirmar que el diagrama refleja las últimas ediciones (snapshot congelado + tail del log).
3. **Multiusuario concurrente**: dos sesiones en el mismo diagrama editando a la vez → confirmar convergencia sin pérdida tras recargar ambas.
4. **Reintento ante fallo de red**: simular fallo de INSERT → confirmar reencolado y persistencia posterior.
5. **Keyframe de cierre**: editar y cambiar de pestaña → confirmar fila de keyframe (estado completo) en el log.
6. **Test determinista en CI** (recomendado): inyectar latencia artificial en `appendYjsUpdate`/`loadYjsState` para reproducir carreras de forma repetible.

---

## 18. Limpieza pendiente

- **Tabla de respaldo**: `public.yjs_documents_backup_20260701` (100 filas, RLS cerrado, solo service-role lee). Borrar cuando se confirme que todo quedó bien:
  ```sql
  DROP TABLE public.yjs_documents_backup_20260701;
  ```
- **Fase 4 (compactador)**: pendiente — sin ella el log crece indefinidamente (aceptable a corto plazo al volumen actual).

---

## 19. Archivos y migraciones

**Código (en producción):**

| Archivo | Cambio |
|---|---|
| `src/collab/yjsPersistence.ts` | `loadYjsState` → `string[]` (snapshot + tail); `saveYjsState` (upsert) reemplazada por `appendYjsUpdate` (INSERT al log) |
| `src/hooks/useCollab.ts` | Buffer de deltas fusionados, keyframe periódico + de cierre, reintento con backoff; eliminado el upsert de estado completo |

**Migraciones Supabase:**

| Versión / nombre | Fase | Efecto |
|---|---|---|
| `yjs_append_only_log_phase1` | 1 | Crear `yjs_updates`, añadir `last_seq`, RLS, índice |
| `yjs_documents_client_readonly_phase5` | 5 | Revocar INSERT/UPDATE de clientes en `yjs_documents` |

**Pendiente:**
- Migración de Fase 4 (pg_cron + pg_net + lock de compactación) + Edge Function del compactador.
