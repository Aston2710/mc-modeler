---
documento: base-de-datos-inventario
vigencia: vigente
actualizado: 2026-08-09
deriva_de: [PLAN-010]
---

# 01 — Inventario completo del esquema

Levantamiento a 2026-08-09. Tamaño total de la base: **17 MB**.

---

## 1. Mapa de entidades

```
auth.users (23)  ──1:1──>  profiles (23)
      │                        │
      │                        ├──< notification_prefs (1)
      │                        └──< notification_outbox (62)
      │
      ├──< projects (15) ──┬──< project_collaborators (46)   [PK compuesta]
      │                    ├──< project_invites (41)
      │                    ├──< image_folders (7) ──< images (44)
      │                    └──< diagrams.project_id  (ON DELETE SET NULL)
      │
      ├──< folders (0)  ── DEAD ──> diagrams.folder_id
      │
      └──< diagrams (132) ─┬──< diagram_collaborators (156)  [PK compuesta]
                           ├──< diagram_invites (23)
                           ├──< diagrams.parent_diagram_id   [auto-ref, subprocesos]
                           └──< comment_threads (5) ──< comment_replies (9)

BASURA (sin uso en código):
  _xml_backup_20260723 (29)          ← RLS OFF, GRANT ALL a anon  ⚠️
  yjs_documents_backup_20260701 (100) ← sin PK, RLS ON sin políticas
```

`profiles` es la proyección de `auth.users` en el esquema aplicativo, poblada por el trigger `on_auth_user_created`. Todas las FKs de "quién hizo qué" apuntan a `auth.users(id)` directamente, salvo las de notificaciones que apuntan a `profiles(id)` — inconsistencia menor, ver [03](normalizacion.md).

---

## 2. Tablas, tamaños y actividad

Ordenado por tamaño total. `est` = estimación del planificador; `-1` significa que la tabla nunca fue analizada.

| Tabla | Filas | Heap | TOAST | Índices | Total | RLS | seq_scan | idx_scan | ins/upd/del |
|---|---:|---:|---:|---:|---:|:--:|---:|---:|---|
| `diagrams` | 132 | 96 kB | **1472 kB** | 96 kB | 1696 kB | ✅ | 7 053 | 1 263 338 | 277/15 905/145 |
| `yjs_documents_backup_20260701` | 100 | 32 kB | 600 kB | — | 632 kB | ⚠️ sin políticas | 23 | — | 100/0/0 |
| `_xml_backup_20260723` | 29 | 8 kB | 368 kB | — | 376 kB | ❌ **OFF** | 21 | — | 29/0/0 |
| `images` | 44 | 16 kB | 8 kB | 64 kB | 112 kB | ✅ | 317 | 30 | 44/7/1 |
| `notification_outbox` | 62 | 32 kB | 8 kB | 32 kB | 104 kB | ✅ | 447 | 3 252 | 62/103/0 |
| `diagram_collaborators` | 156 | 24 kB | 8 kB | 32 kB | 96 kB | ✅ | **64 814** | 368 427 | 310/0/154 |
| `image_folders` | 7 | 8 kB | 8 kB | 48 kB | 64 kB | ✅ | 309 | 50 | 9/0/2 |
| `diagram_invites` | 23 | 8 kB | 8 kB | 48 kB | 64 kB | ✅ | 16 | 318 | 28/15/5 |
| `project_invites` | 41 | 8 kB | 8 kB | 48 kB | 64 kB | ✅ | 29 | 99 | 41/15/0 |
| `projects` | 15 | 8 kB | 8 kB | 40 kB | 56 kB | ✅ | **24 831** | 138 823 | 18/0/3 |
| `comment_replies` | 9 | 8 kB | 8 kB | 32 kB | 48 kB | ✅ | 1 510 | 47 | 19/0/10 |
| `project_collaborators` | 46 | 8 kB | 8 kB | 32 kB | 48 kB | ✅ | 25 | 378 517 | 49/0/3 |
| `comment_threads` | 5 | 8 kB | 8 kB | 32 kB | 48 kB | ✅ | 1 502 | 11 888 | 14/3/9 |
| `profiles` | 23 | 8 kB | 8 kB | 16 kB | 32 kB | ✅ | 145 | 486 | 23/0/0 |
| `notification_prefs` | 1 | 8 kB | 8 kB | 16 kB | 24 kB | ✅ | 3 | 513 | 1/7/0 |
| `folders` | **0** | 0 | 8 kB | 16 kB | 24 kB | ✅ | 20 | 45 | 0/0/0 |

**Notas de lectura:**

- `diagrams` tiene 96 kB de heap y **1472 kB de TOAST**: el 94% del peso de la tabla es `current_xml` fuera de línea. Distribución del XML: total 3764 kB sin comprimir, media 29 kB, p95 93 kB, máximo 294 kB. TOAST lo comprime a 1472 kB (ratio 2.6:1).
- `diagram_collaborators` con 64 814 escaneos secuenciales sobre 156 filas y `projects` con 24 831 sobre 15: no es un problema de índices faltantes, es que las funciones RLS las consultan constantemente y el planificador elige seq scan por el tamaño ínfimo. Es correcto a esta escala; deja de serlo a escala de miles.
- `diagrams` acumula 15 905 UPDATEs contra 277 INSERTs: ratio 57:1. Es el patrón de autoguardado. Cada UPDATE de `current_xml` reescribe la fila **y** el TOAST.

---

## 3. Definición de columnas

### `diagrams` — entidad central
| # | Columna | Tipo | Null | Default |
|---|---|---|:--:|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `owner_id` | uuid | NO | — |
| 3 | `folder_id` | uuid | SÍ | — |
| 4 | `name` | text | NO | — |
| 5 | `current_xml` | text | NO | — |
| 6 | `element_count` | integer | NO | `0` |
| 7 | `thumbnail_path` | text | SÍ | — |
| 8 | `schema_version` | integer | NO | `1` |
| 9 | `created_at` | timestamptz | NO | `now()` |
| 10 | `updated_at` | timestamptz | NO | `now()` |
| 11 | `parent_diagram_id` | uuid | SÍ | — |
| 12 | `sub_process_element_id` | text | SÍ | — |
| 13 | `project_id` | uuid | SÍ | — |
| 14 | `deleted_at` | timestamptz | SÍ | — |

### `projects`
`id` uuid PK · `owner_id` uuid NN · `name` text NN · `created_at`/`updated_at` timestamptz NN `now()` · `deleted_at` timestamptz

### `profiles`
`id` uuid PK (FK→`auth.users`) · `email` text · `display_name` text · `avatar_url` text · `created_at` timestamptz NN

### `diagram_collaborators` / `project_collaborators`
PK compuesta `(diagram_id|project_id, user_id)` · `role` text NN CHECK · `invited_by` uuid · `created_at` timestamptz NN

### `diagram_invites` / `project_invites`
`id` uuid PK · `diagram_id|project_id` uuid NN · `email` text · `role` text NN CHECK · `token` text NN **UNIQUE** · `created_by` uuid NN · `expires_at` · `accepted_at` · `created_at`

### `comment_threads`
`id` uuid PK · `diagram_id` uuid NN · `anchor` **jsonb** NN · `status` text NN `'open'` CHECK · `orphaned` bool NN `false` · `created_by` uuid · `created_by_name` text NN `'Usuario'` · `created_at`

### `comment_replies`
`id` uuid PK · `thread_id` uuid NN · `author_id` uuid · `author_name` text NN `'Usuario'` · `content` text NN · `created_at` · `mentions` **uuid[]** NN `'{}'`

### `images`
`id` uuid PK · `owner_id` uuid NN · `project_id` uuid · `folder_id` uuid · `name` text NN · `storage_path` text NN · `mime` text NN `'image/webp'` · `size_bytes` int NN `0` · `created_at`/`updated_at`

### `image_folders`
`id` uuid PK · `owner_id` uuid NN · `project_id` uuid · `name` text NN · `created_at`

### `notification_outbox`
`id` uuid PK · `recipient_id` uuid (FK→`profiles`) · `recipient_email` text NN · `kind` text NN CHECK · `payload` **jsonb** NN `'{}'` · `created_at` · `sent_at` · `attempts` int NN `0` · `error` text · `read_at`

### `notification_prefs`
`user_id` uuid **PK** (FK→`profiles`) · `email_enabled`/`invite_events`/`mention_events` bool NN `true` · `updated_at`

### `folders` (muerta)
`id` uuid PK · `owner_id` uuid NN · `name` text NN · `created_at`

---

## 4. Integridad referencial — 23 FKs, todas validadas

| Tabla origen | Columna | → Destino | ON DELETE |
|---|---|---|---|
| `profiles` | `id` | `auth.users(id)` | CASCADE |
| `projects` | `owner_id` | `auth.users(id)` | CASCADE |
| `folders` | `owner_id` | `auth.users(id)` | CASCADE |
| `diagrams` | `owner_id` | `auth.users(id)` | CASCADE |
| `diagrams` | `folder_id` | `folders(id)` | SET NULL |
| `diagrams` | `parent_diagram_id` | `diagrams(id)` | CASCADE |
| `diagrams` | `project_id` | `projects(id)` | SET NULL |
| `diagram_collaborators` | `diagram_id` | `diagrams(id)` | CASCADE |
| `diagram_collaborators` | `user_id` | `auth.users(id)` | CASCADE |
| `diagram_collaborators` | `invited_by` | `auth.users(id)` | SET NULL |
| `diagram_invites` | `diagram_id` | `diagrams(id)` | CASCADE |
| `diagram_invites` | `created_by` | `auth.users(id)` | CASCADE |
| `project_collaborators` | `project_id` | `projects(id)` | CASCADE |
| `project_collaborators` | `user_id` | `auth.users(id)` | CASCADE |
| `project_collaborators` | `invited_by` | `auth.users(id)` | SET NULL |
| `project_invites` | `project_id` | `projects(id)` | CASCADE |
| `project_invites` | `created_by` | `auth.users(id)` | CASCADE |
| `comment_threads` | `diagram_id` | `diagrams(id)` | CASCADE |
| `comment_threads` | `created_by` | `auth.users(id)` | *(sin acción)* |
| `comment_replies` | `thread_id` | `comment_threads(id)` | CASCADE |
| `comment_replies` | `author_id` | `auth.users(id)` | *(sin acción)* |
| `images` | `owner_id` | `auth.users(id)` | CASCADE |
| `images` | `project_id` | `projects(id)` | SET NULL |
| `images` | `folder_id` | `image_folders(id)` | SET NULL |
| `image_folders` | `owner_id` | `auth.users(id)` | CASCADE |
| `image_folders` | `project_id` | `projects(id)` | CASCADE |
| `notification_outbox` | `recipient_id` | `profiles(id)` | CASCADE |
| `notification_prefs` | `user_id` | `profiles(id)` | CASCADE |

**Ninguna FK es `DEFERRABLE`** y **todas están `VALIDATED`**. Cobertura de integridad: correcta.

Dos FKs sin `ON DELETE` explícito (`comment_threads.created_by`, `comment_replies.author_id`) usan `NO ACTION`: borrar un usuario de `auth.users` fallará si dejó comentarios. Es deliberado y razonable (los comentarios conservan `*_name` como snapshot), pero implica que el borrado de cuenta requiere anular esas columnas antes.

### CHECK constraints (5)
```sql
comment_threads.status        ∈ {'open','resolved'}
diagram_collaborators.role    ∈ {'owner','editor','viewer'}
project_collaborators.role    ∈ {'owner','editor','viewer'}
diagram_invites.role          ∈ {'editor','viewer'}
project_invites.role          ∈ {'editor','viewer'}
notification_outbox.kind      ∈ {'invite_redeemed_diagram','invite_redeemed_project','comment_mention'}
```
Todos los dominios cerrados están protegidos. No hay ENUMs nativos — decisión válida en Supabase (los ENUM son un dolor de migrar).

### Restricciones UNIQUE (2)
`diagram_invites.token`, `project_invites.token`

### Sin PK (2)
`yjs_documents_backup_20260701`, `_xml_backup_20260723` — ambas basura.

---

## 5. Índices — 36 en total

### Usados intensivamente
| Índice | Escaneos | Definición |
|---|---:|---|
| `diagrams_pkey` | 1 244 343 | `btree(id)` |
| `project_collaborators_pkey` | 354 991 | `btree(project_id, user_id)` |
| `diagram_collaborators_pkey` | 325 752 | `btree(diagram_id, user_id)` |
| `projects_pkey` | 138 818 | `btree(id)` |
| `collab_user_idx` | 42 675 | `btree(user_id)` |
| `project_collab_user_idx` | 23 526 | `btree(user_id)` |
| `diagrams_project_idx` | 17 637 | `btree(project_id)` |
| `comment_threads_pkey` | 10 379 | `btree(id)` |

> El 1.24 M de escaneos sobre `diagrams_pkey` frente a ~9 000 consultas REST reales es la firma de `can_access_diagram()` evaluándose por fila. Ver [02](rendimiento-base-de-datos.md).

### Uso bajo pero justificado
`notification_outbox_unsent_idx` (3 066, parcial `WHERE sent_at IS NULL`), `comment_threads_diagram_idx` (1 509), `diagrams_owner_idx` (1 057), `notification_prefs_pkey` (513), `profiles_pkey` (486), `profiles`/`invites` varios, `diagrams_deleted_at_idx` (149, parcial), `diagrams_parent_idx` (150).

### Índices muertos — 0 escaneos históricos en 72 días
| Índice | Tabla | Tamaño |
|---|---|---:|
| `folders_owner_idx` | `folders` | 8 kB |
| `image_folders_owner_idx` | `image_folders` | 16 kB |
| `image_folders_project_idx` | `image_folders` | 16 kB |
| `images_owner_idx` | `images` | 16 kB |
| `images_project_idx` | `images` | 16 kB |
| `projects_deleted_at_idx` | `projects` | 8 kB |

Y `diagrams_folder_idx` con 2 escaneos (funcionalidad `folders` muerta).

Los de `images`/`image_folders` están muertos por una razón concreta: la política `SELECT` de esas tablas es `true` para `authenticated`, así que el cliente nunca filtra por `owner_id`/`project_id` en la lectura — trae todo. Si algún día se restringe la visibilidad, estos índices se activarán solos. **No borrarlos si hay plan de acotar la biblioteca de imágenes.**

### FKs sin índice de cobertura (7) — reportadas por el linter
`comment_replies.author_id` · `comment_threads.created_by` · `diagram_collaborators.invited_by` · `diagram_invites.created_by` · `notification_outbox.recipient_id` · `project_collaborators.invited_by` · `project_invites.created_by`

Impacto hoy: nulo (tablas de decenas de filas). Impacto real: en el `DELETE` de un usuario, Postgres escanea secuencialmente cada tabla referenciante para validar la FK. Con volumen, borrar una cuenta se vuelve O(n) por tabla.

### Índices faltantes que sí importan
Ninguno crítico hoy — pero ver [04](../plans/todo/011-remediacion-de-base-de-datos-pendiente.md#p2-3) para `diagrams(updated_at DESC) WHERE deleted_at IS NULL`, que es el orden exacto de la consulta de lista y hoy se resuelve con Seq Scan + Sort.

---

## 6. RLS — 42 políticas sobre 15 tablas

### Funciones de autorización (esquema `private`, todas `SECURITY DEFINER`, `STABLE`, `SET search_path=public`)

| Función | Qué evalúa |
|---|---|
| `is_diagram_owner(d_id)` | 1 EXISTS |
| `is_project_owner(p_id)` | 1 EXISTS |
| `can_access_project(p_id)` | 2 EXISTS (dueño ∪ colaborador) |
| `can_edit_project(p_id)` | 2 EXISTS (dueño ∪ colaborador con rol owner/editor) |
| `can_access_diagram(d_id)` | **4 EXISTS** (dueño ∪ colab. de diagrama ∪ colab. del proyecto ∪ dueño del proyecto) |
| `can_edit_diagram(d_id)` | **4 EXISTS** con filtro de rol |
| `user_can_access_diagram(d_id, u_id)` | 4 EXISTS, variante con usuario explícito (usada por el trigger de menciones) |

Diseño correcto: centralizar la lógica en funciones `SECURITY DEFINER` evita recursión de RLS y duplicación entre 42 políticas. El problema no es la arquitectura sino el **costo por fila** — ver [02](rendimiento-base-de-datos.md#rls).

### Matriz de políticas

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `diagrams` | `can_access_diagram(id)` | `owner_id = auth.uid()` | `can_edit_diagram(id)` | `owner_id = auth.uid()` |
| `projects` | `can_access_project(id)` | `owner_id = auth.uid()` | `can_edit_project(id)` | `owner_id = auth.uid()` |
| `folders` | — política única `ALL`: `owner_id = auth.uid()` — |
| `diagram_collaborators` | `user_id = uid() OR can_access_diagram()` | `is_diagram_owner() OR user_id=uid()` | — | `is_diagram_owner() OR user_id=uid()` |
| `project_collaborators` | `user_id = uid() OR can_access_project()` | `is_project_owner() OR user_id=uid()` | — | `is_project_owner() OR user_id=uid()` |
| `diagram_invites` | `is_diagram_owner() OR created_by=uid()` | `is_diagram_owner()` | — | `is_diagram_owner()` |
| `project_invites` | `is_project_owner() OR created_by=uid()` | `is_project_owner()` | — | `is_project_owner()` |
| `comment_threads` | `can_access_diagram(diagram_id)` | `can_access_diagram(diagram_id)` | `can_edit_diagram(diagram_id)` | `created_by = uid()` |
| `comment_replies` | EXISTS thread ∧ `can_access_diagram` | EXISTS thread ∧ `can_access_diagram` | — | `author_id = uid()` |
| `images` | **`true`** (rol `authenticated`) | dueño ∧ (proyecto null ∨ editable) | dueño ∨ editor del proyecto | dueño ∨ editor del proyecto |
| `image_folders` | **`true`** (rol `authenticated`) | ídem | ídem | ídem |
| `profiles` | **`true`** | `id = uid()` | `id = uid()` | — |
| `notification_outbox` | `recipient_id = uid()` | — | `recipient_id = uid()` | — |
| `notification_prefs` | `user_id = uid()` | `user_id = uid()` | `user_id = uid()` | — |
| `yjs_documents_backup_20260701` | RLS ON, **cero políticas** → nadie lee (fail-closed, correcto) | | | |
| `_xml_backup_20260723` | **RLS OFF + GRANT ALL a `anon`** ⚠️ | | | |

**Sobre las políticas `true`:** en `images`/`image_folders` es una decisión deliberada documentada (biblioteca de imágenes compartida entre todo usuario autenticado, commit `752484c`). En `profiles` expone `email` y `display_name` de los 23 usuarios a cualquier autenticado — necesario para el autocompletado de menciones y para mostrar avatares de colaboradores, pero conviene sustituirlo por una vista que exponga solo lo necesario. Ninguna de las tres es explotable por `anon` (el rol de las dos primeras es `authenticated`; `profiles` es `public` pero sin sesión `auth.uid()` es NULL y el resto de tablas no filtra nada útil).

**Faltantes:** `diagram_collaborators` y `project_collaborators` no tienen política `UPDATE`. Cambiar el rol de un colaborador requiere DELETE + INSERT. Funciona, pero pierde `created_at` y `invited_by`. Ver [04](../plans/todo/011-remediacion-de-base-de-datos-pendiente.md#p3-2).

---

## 7. Funciones y triggers

### Triggers en `public` (7) + `auth` (1)

| Trigger | Tabla | Momento | Función |
|---|---|---|---|
| `on_auth_user_created` | `auth.users` | AFTER INSERT | `public.handle_new_user()` → crea `profiles` |
| `diagrams_set_updated_at` | `diagrams` | BEFORE UPDATE | `set_updated_at()` |
| `diagrams_add_owner` | `diagrams` | AFTER INSERT | `add_owner_as_collaborator()` |
| `projects_set_updated_at` | `projects` | BEFORE UPDATE | `set_updated_at()` |
| `projects_add_owner` | `projects` | AFTER INSERT | `add_project_owner_as_collaborator()` |
| `images_set_updated_at` | `images` | BEFORE UPDATE | `set_updated_at()` |
| `comment_replies_mentions` | `comment_replies` | AFTER INSERT | `private.enqueue_mention_notifications()` |
| `notification_outbox_deliver` | `notification_outbox` | AFTER INSERT | `private.deliver_notification()` → `net.http_post` |

**`deliver_notification` hace una llamada HTTP saliente dentro de un trigger.** `pg_net` la encola de forma asíncrona (no bloquea el commit) y el bloque está envuelto en `EXCEPTION WHEN OTHERS THEN NULL`, así que un webhook caído no rompe el INSERT. Diseño correcto para el caso. La cola (`net.http_request_queue`) está en 0 filas y `net._http_response` en 7 — sana.

### RPCs expuestas (`SECURITY DEFINER`, invocables por `authenticated`)
- `public.redeem_invite(text)` → canjea invitación de diagrama, inserta colaborador, marca `accepted_at`, encola notificaciones a los demás colaboradores
- `public.redeem_project_invite(text)` → equivalente para proyectos

Ambas validan expiración y usan `ON CONFLICT DO NOTHING`. **No validan que el email de la invitación coincida con el del usuario que la canjea** — cualquiera con el token entra. Es el modelo "link secreto", coherente con `token UNIQUE`, pero conviene dejarlo explícito. El linter las marca por ser `SECURITY DEFINER` accesibles; es intencional y correcto (necesitan saltar RLS para insertar en `diagram_collaborators` de un diagrama que el usuario aún no puede ver).

### Otras tablas
`private.notification_config` — 1 fila con `webhook_url`, `secret`, `digest_mode`. Fuera de `public`, no expuesta por PostgREST. Correcto.

---

## 8. Realtime, Storage y extensiones

### Publicación `supabase_realtime` — 5 tablas
`comment_threads` · `comment_replies` · `notification_outbox` · `image_folders` · `images`

`realtime.subscription` está en 0 filas ahora mismo (sin clientes conectados). El costo histórico de esta publicación es el hallazgo P2 — ver [02](rendimiento-base-de-datos.md#realtime).

### Storage — 2 buckets, ambos privados

| Bucket | Objetos | Bytes | Media | `file_size_limit` |
|---|---:|---:|---:|---|
| `thumbnails` | 194 | 10 212 kB | 53 kB | **null** |
| `diagram-images` | 52 | 5 626 kB | 108 kB | **null** |

Sin límite de tamaño por archivo en ninguno de los dos. Un cliente comprometido puede subir un archivo arbitrariamente grande. Ver [04](../plans/todo/011-remediacion-de-base-de-datos-pendiente.md#p2-4).

`thumbnails` tiene 194 objetos para 132 diagramas: 62 huérfanos, restos de diagramas purgados y de thumbnails de subprocesos.

### Extensiones instaladas (5)
`plpgsql` · `pgcrypto` (extensions) · `uuid-ossp` (extensions) · `pg_stat_statements` (extensions) · `supabase_vault` (vault) · **`pg_net` 0.20.3 en `public`** ⚠️

`pg_net` en `public` está marcado por el linter: contamina el espacio de nombres expuesto por PostgREST. Mover a un esquema propio requiere recrear la extensión, lo que corta el flujo de notificaciones durante la migración. Riesgo bajo, prioridad baja.

### Configuración del servidor
```
PostgreSQL 17.6 aarch64 · max_connections 60 · shared_buffers 224 MB
effective_cache_size 384 MB · work_mem 2184 kB · cache hit ratio 100.000 %
```
Instancia pequeña. `shared_buffers` de 224 MB contra una base de 17 MB significa que **todo cabe en RAM** — de ahí el 100% de aciertos de caché y los 0 `shared_blks_read` en casi todas las consultas. Cualquier lentitud actual es CPU, no I/O. Esto es importante para interpretar [02](rendimiento-base-de-datos.md): los cuellos de botella medidos son puro cómputo, no disco, y no se arreglan con más RAM.
