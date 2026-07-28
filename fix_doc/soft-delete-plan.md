# Plan — Soft delete + Papelera

**Rama:** `feat/soft-delete` · **Fecha:** 2026-07-28
**Estado:** plan aprobado-pendiente. La **migración se aplica a la BD de prod** → solo con OK explícito.

Consultado antes: `fix_doc/ADR-persistence-source-of-truth.md`, capa `src/persistence/*`, RLS real.

---

## Objetivo

Reemplazar el **borrado duro** actual (`DELETE`, irreversible) por **borrado suave**:
marcar `deleted_at`, ocultar de las listas, y una **Papelera** para restaurar o
eliminar definitivamente. Red de seguridad contra borrado accidental.

## Estado actual (verificado)

- Patrón repositorio: `LocalRepository` (IndexedDB) + `SupabaseRepository` (nube), interfaz `IDiagramRepository`.
- Borrado hoy = `DELETE` real + limpia thumbnails de storage. Irreversible.
- Sin columnas `deleted_at`. RLS: `diagrams` DELETE=owner, SELECT=`can_access_diagram`, UPDATE=`can_edit_diagram`; `projects` análogo.

## Decisiones (defaults propuestos — dime si cambias alguno)

1. **Alcance:** diagramas **y** proyectos. ✅
2. **Cascada:** mandar un proyecto a papelera **también manda sus diagramas** (se ocultan con él) y **se restauran juntos**. La lógica vive en el repo (portable a local y nube).
3. **Purga:** solo **manual** ("Eliminar definitivamente" / "Vaciar papelera") en v1. Auto-purga por antigüedad = después.
4. **Quién:** enviar a papelera / restaurar / purgar = **solo el dueño** (igual que el borrado actual). La UI solo lo ofrece al owner; el `DELETE` real sigue owner-only por RLS.
5. **Modo local (IndexedDB):** también soft delete, por consistencia (simple, sin RLS).

## Cambios

### 1. Migración BD (prod) — `0019_soft_delete.sql`
```sql
alter table public.diagrams add column if not exists deleted_at timestamptz;
alter table public.projects add column if not exists deleted_at timestamptz;
create index if not exists diagrams_deleted_at_idx on public.diagrams (deleted_at) where deleted_at is not null;
create index if not exists projects_deleted_at_idx on public.projects (deleted_at) where deleted_at is not null;
```
- **Aditiva, bajo riesgo.** No borra ni cambia datos existentes (todo queda `deleted_at = null` = visible).
- **RLS sin cambios:** el dueño ya puede `SELECT` sus filas (necesario para ver la Papelera); el marcado usa el `UPDATE` existente. El `DELETE` real (purga) sigue owner-only.

### 2. Dominio (`src/domain/types.ts`)
- `Diagram.deletedAt: string | null`, `Project.deletedAt: string | null`.

### 3. Repositorio (`IDiagramRepository` + Local + Supabase)
- `delete(id)` / `deleteProject(id)` → **soft** (`update ... set deleted_at = now()`). Al borrar proyecto, marcar también sus diagramas. **No** se borran thumbnails (se conservan para restaurar).
- Nuevos: `restore(id)`, `restoreProject(id)`, `purge(id)`, `purgeProject(id)` (= el `DELETE` real + limpieza de thumbnails de hoy), `getTrash()` (diagramas + proyectos con `deleted_at != null`).
- Listas existentes (`getAll`, `getProjects`) → filtrar `deleted_at is null`.
- `deleteWithChildren` → versión soft (marca el árbol de subprocesos).

### 4. Store (`diagramStore`)
- `deleteDiagram`/`deleteProject` → soft (quita de `diagrams`/`projects` en memoria).
- `restoreDiagram`/`restoreProject`, `purgeDiagram`/`purgeProject`, `loadTrash()` + estado `trash`.

### 5. UI (Home)
- Sidebar: destino **Papelera** (con contador) — el que se quitó del prototipo por no existir.
- Vista Papelera: lista de lo borrado con **Restaurar** y **Eliminar definitivo** (con confirmación).
- Tarjeta "···" → "Eliminar" pasa a **"Mover a papelera"** + toast con **Deshacer** (restore inmediato).

## Verificación
- Migración: `deleted_at` existe en ambas tablas; filas actuales intactas y visibles.
- Borrar diagrama → desaparece de la lista, aparece en Papelera; Restaurar lo devuelve; Eliminar definitivo lo quita de verdad (y su thumbnail).
- Borrar proyecto → él y sus diagramas a papelera juntos; restaurar juntos.
- `getAll`/`getProjects` nunca devuelven borrados. Modo local y nube igual.
- Toast "Deshacer" restaura.
- Tests: caso repo soft/restore/purge; RLS (owner ve su papelera, otro no).

## Orden de implementación
1. **Migración** (con tu OK) → aplicar a prod.
2. Dominio + interfaz repo.
3. SupabaseRepository (soft/restore/purge/getTrash + filtros).
4. LocalRepository (idem).
5. Store.
6. UI Papelera + toast Deshacer.
7. Build/lint/test + verificación manual con 2 casos.

**Nada de esto toca `src/bpmn/` (modelado).**
