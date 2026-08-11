---
id: PLAN-011
titulo: Deuda de esquema pendiente en la base de datos
estado: todo
creado: 2026-08-09
cerrado:
aprobado_por:
relacionados: [PLAN-010, PLAN-012, PLAN-016, PLAN-017, PLAN-018]
---

# Deuda de esquema pendiente en la base de datos

> **Este plan se acotó el 2026-08-10.** Nació como el documento completo de hallazgos de la auditoría; la mayoría ya está aplicada (PLAN-010) y dos temas tienen plan propio. Aquí queda solo la deuda de esquema que sigue abierta.

## Qué ya no está aquí

| Salió a | Qué se llevó |
|---|---|
| [PLAN-010](../done/010-auditoria-y-remediacion-de-base-de-datos.md) | Todo lo aplicado: fuga P0, RLS conjuntista, indices, `owner_id`, limites de bucket, comentarios |
| [PLAN-016](016-podar-la-publicacion-de-realtime.md) | Realtime al 73 % del CPU |
| [PLAN-017](017-higiene-de-datos-y-retencion.md) | Los 76 huerfanos de Storage y las politicas de retencion |
| [PLAN-012](012-thumbnails-webp-y-entrega-segura.md) | El rendimiento de la carga de thumbnails |

## Objetivo

Cerrar la deuda de esquema que quedo sin aplicar porque exige cambios coordinados en el cliente TypeScript. Ninguna tiene impacto operativo hoy.

## Alcance

**Entra:** cuatro elementos de deuda, ninguno urgente.

**No entra:** nada que ya este en los planes de la tabla de arriba.

## Los cuatro pendientes

### 1 · `thumbnail_path` es derivable al 100 %

Verificado sobre los datos: **119 filas con thumbnail, 0 excepciones** al patron `id || '/thumb'`, identico a `thumbPath()` en `SupabaseRepository.ts:9`.

Es la unica violacion de 3NF sin justificacion (ver `context/normalizacion.md`). Sustituir por `has_thumbnail boolean`. Toca 6 sitios del repositorio.

**Depende de PLAN-012:** si los thumbnails migran a WebP, conviene hacer ambos cambios en el mismo despliegue y no tocar dos veces los mismos 6 sitios.

Mientras tanto, la columna esta documentada en el propio esquema con `COMMENT ON` (migracion `0027`) para que nadie la "arregle" en la direccion equivocada.

### 2 · Sin politica `UPDATE` en las tablas de colaboradores

`diagram_collaborators` y `project_collaborators` no tienen politica `UPDATE`. Cambiar el rol de un colaborador exige DELETE + INSERT, lo que pierde `created_at` e `invited_by` originales.

No hay consumidor hoy: la UI no permite cambiar un rol. Se aplica cuando exista esa funcionalidad, no antes — anadir superficie de politica sin usuario es deuda, no mejora.

### 3 · `profiles` es legible por cualquier autenticado

Politica `profiles_select_self` con `qual = true` y rol `public`. Expone `email` y `display_name` de los 23 usuarios a cualquier autenticado.

Es necesario para el autocompletado de menciones y para mostrar colaboradores. No es explotable por `anon` (sin sesion no hay nada que correlacionar), pero **el email no deberia viajar**.

Sustituir por una vista `public_profiles(id, display_name, avatar_url)` sin email. El trigger `enqueue_mention_notifications` **no se ve afectado**: es `SECURITY DEFINER` y salta RLS.

Antes de aplicar hay que revisar que consulta el cliente para el autocompletado de menciones.

### 4 · Limpieza estructural menor

- **`pg_net` en el esquema `public`.** Contamina el espacio expuesto por PostgREST. Moverlo exige recrear la extension y corta las notificaciones durante la migracion. Riesgo bajo, prioridad baja.
- **FKs de usuario inconsistentes.** Unas apuntan a `auth.users`, otras a `profiles`. Ambas cadenas acaban en el mismo sitio, asi que no hay error; unificar en `profiles` desacoplaria el modelo de la tabla de sistema de Supabase.
- **Proteccion de contrasenas filtradas desactivada.** Interruptor del panel de Auth, verificacion contra HaveIBeenPwned.
- **`folders`** tiene 0 filas, pero **el cliente la usa** (`getFolders`/`saveFolder`/`deleteFolder`, `SupabaseRepository.ts:443-467`). No borrar sin retirar antes esos metodos. Documentado con `COMMENT ON TABLE`.

## Criterios de aceptacion

- `diagrams` no tiene columna `thumbnail_path` y el cliente usa `has_thumbnail`
- Ninguna consulta desde el cliente puede leer el email de otro usuario
- El linter de Supabase no reporta `extension_in_public`
- La proteccion de contrasenas filtradas esta activa

## Riesgos

**Tocar dos veces los mismos 6 sitios** si el punto 1 se hace por separado de PLAN-012. Mitigacion: hacerlos juntos.

**Romper el autocompletado de menciones** al restringir `profiles`. Mitigacion: revisar el consumidor antes, no despues.

**Cortar las notificaciones** al mover `pg_net`. Mitigacion: ventana de mantenimiento, o simplemente no hacerlo — el beneficio es cosmetico.

## Registro de ejecucion

(se rellena durante la ejecucion)

## Resultado

(se rellena al cerrar)

---

## Apendice — SQL propuesto y no aplicado

Numeracion de migracion actualizada: `0021`-`0029` ya estan aplicadas, asi que estas empiezan en `0030`.

```sql
-- BLOQUE 8 · P2-5 — thumbnail_path → has_thumbnail
-- Migración sugerida: 0030_has_thumbnail.sql
-- Riesgo: MEDIO. Exige cambios en SupabaseRepository (6 sitios).
-- ============================================================================
--
-- Verificado sobre los datos: 119 filas con thumbnail, 0 excepciones al patrón
-- `id || '/thumb'`, que coincide exactamente con thumbPath() en
-- SupabaseRepository.ts:9. La columna no aporta información: es derivable.
--
-- NO APLICAR hasta que el cliente esté listo. Orden seguro:
--   1) añadir has_thumbnail y hacer backfill  (esta migración, parte A)
--   2) desplegar el cliente que escribe/lee ambas columnas
--   3) desplegar el cliente que solo usa has_thumbnail
--   4) borrar thumbnail_path                  (esta migración, parte B)

-- Parte A
alter table public.diagrams
  add column if not exists has_thumbnail boolean not null default false;

update public.diagrams
   set has_thumbnail = (thumbnail_path is not null)
 where has_thumbnail is distinct from (thumbnail_path is not null);

-- Parte B — SOLO tras desplegar el cliente actualizado
-- alter table public.diagrams drop column thumbnail_path;
-- BLOQUE 10 · P3-2 — Política UPDATE en las tablas de colaboradores
-- Migración sugerida: 0031_collaborator_role_update.sql
-- Riesgo: bajo.
-- ============================================================================
--
-- Hoy no existe política UPDATE: cambiar el rol de un colaborador exige
-- DELETE + INSERT, lo que pierde created_at e invited_by originales.

create policy collab_update on public.diagram_collaborators
  for update using (private.is_diagram_owner(diagram_id))
  with check (private.is_diagram_owner(diagram_id));

create policy project_collab_update on public.project_collaborators
  for update using (private.is_project_owner(project_id))
  with check (private.is_project_owner(project_id));

-- Limitar el UPDATE a la columna role: el dueño no debe poder reasignar
-- la fila a otro diagrama ni a otro usuario.
revoke update on public.diagram_collaborators from authenticated, anon;
revoke update on public.project_collaborators from authenticated, anon;
grant  update (role) on public.diagram_collaborators to authenticated;
grant  update (role) on public.project_collaborators to authenticated;
-- BLOQUE 11 · P3-3 — Dejar de exponer los emails de todos los usuarios
-- Migración sugerida: 0032_public_profiles_view.sql
-- Riesgo: MEDIO. Exige revisar el flujo de autocompletado de menciones.
-- ============================================================================
--
-- profiles_select_self tiene qual = true y rol public: expone email y
-- display_name de los 23 usuarios a cualquier autenticado.
--
-- NO APLICAR hasta verificar qué consulta el cliente para el autocompletado
-- de menciones. El trigger enqueue_mention_notifications NO se ve afectado:
-- es SECURITY DEFINER y salta RLS.

-- create view public.public_profiles
--   with (security_invoker = true) as
--   select id, display_name, avatar_url from public.profiles;
--
-- grant select on public.public_profiles to authenticated;
--
-- drop policy if exists profiles_select_self on public.profiles;
-- create policy profiles_select_self on public.profiles
--   for select using (id = (select auth.uid()));
-- BLOQUE 12 · P3-4 — Limpieza estructural
-- Migración sugerida: 0033_drop_folders.sql
-- Riesgo: MEDIO. Verificar que el cliente no referencia folders en ningún sitio.
-- ============================================================================
--
-- `folders` tiene 0 filas y su funcionalidad fue sustituida por `projects`.
-- diagrams.folder_id está sin uso (su índice tiene 2 escaneos en 72 días).

-- Verificar antes:
--   select count(*) from public.folders;                          -- debe ser 0
--   select count(*) from public.diagrams where folder_id is not null; -- debe ser 0
--   grep -rn "folder_id\|from('folders')" src/

-- drop index concurrently if exists public.diagrams_folder_idx;
-- alter table public.diagrams drop column folder_id;   -- borra la FK en cascada
-- drop table public.folders;


-- ============================================================================
-- FUERA DE SQL — acciones en el panel de Supabase
-- ============================================================================
--
-- 1. Auth → Policies → activar "Leaked password protection"
--    (verificación contra HaveIBeenPwned). Linter: auth_leaked_password_protection
--
-- 2. Revisar la política de retención de `net._http_response` (7 filas hoy,
```
