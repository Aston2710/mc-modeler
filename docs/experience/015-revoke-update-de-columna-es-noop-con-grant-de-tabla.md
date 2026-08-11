---
id: EXP-015
titulo: REVOKE UPDATE (columna) no surtio efecto porque existia un GRANT UPDATE de tabla
estado: resuelto
severidad: alta
fecha_deteccion: 2026-08-10
fecha_cierre: 2026-08-10
componentes: [diagrams, projects, migracion 0023, migracion 0028]
relacionados: [PLAN-010, MASTER-PLAN-018]
---

# `REVOKE UPDATE (columna)` no surtió efecto porque existía un `GRANT UPDATE` de tabla

## Síntoma

La migración `0023` se aplicó **sin error**. Postgres aceptó el comando, devolvió éxito, y la protección no existía.

Se descubrió al verificar después de aplicar:

```sql
select has_column_privilege('authenticated','public.diagrams','owner_id','UPDATE');
--  t     ← debía ser false
```

Sin esa verificación, el agujero habría quedado abierto con una migración en el historial afirmando que estaba cerrado.

## Impacto

Ninguno en producción: el hueco ya existía antes y siguió existiendo unos minutos más, hasta aplicar la corrección.

**Lo que sí importa es lo que la migración `0023` pretendía cerrar.** La política `diagrams_update` usa `can_edit_diagram(id)` en `USING` y en `WITH CHECK`. Un colaborador con rol `editor` pasa ambas comprobaciones, y **nada le impedía incluir `owner_id` en el UPDATE** — escalada a propietario del diagrama.

El cliente lo evitaba conscientemente (`SupabaseRepository.ts:151-152`):

```ts
// No usamos upsert: en un UPDATE incluiría owner_id y un editor podría
// robar la propiedad. Distinguimos insert (con owner) de update (sin owner).
```

Pero eso es defensa **en el cliente**. Un `PATCH /rest/v1/diagrams?id=eq.X` con `{"owner_id":"..."}` hecho a mano desde la consola del navegador, con la sesión de un editor legítimo, se la salta entera.

## Reproducción

Determinista, en cualquier PostgreSQL:

```sql
create table t (id int, owner_id uuid, name text);
grant update on t to some_role;                 -- privilegio de TABLA
revoke update (owner_id) on t from some_role;   -- aceptado, sin efecto
select has_column_privilege('some_role','t','owner_id','UPDATE');  -- t
```

Ningún error, ningún aviso. El comando se acepta y no cambia nada.

## Causa raíz

En PostgreSQL, los privilegios de tabla y los de columna son **dos conjuntos independientes**, y la comprobación de acceso pasa si **cualquiera de los dos** lo permite.

`GRANT UPDATE ON t` concede el privilegio a nivel de tabla, que cubre todas las columnas presentes y futuras. `REVOKE UPDATE (col)` solo puede retirar un privilegio *de columna* — que en este caso nunca se había concedido por separado. No perfora el de tabla.

Supabase concede `UPDATE` a nivel de tabla a `anon` y `authenticated` por defecto en el esquema `public`, así que el escenario se da siempre.

**La forma correcta** es revocar el privilegio de tabla y reconceder columna a columna, omitiendo la que se quiere proteger.

## Solución planteada

`revoke update (owner_id) on public.diagrams from authenticated, anon;` — migración `0023`.

## Solución realizada

Migración `0028_fix_owner_id_column_grants`:

```sql
revoke update on public.diagrams from authenticated, anon;
grant update (
  id, folder_id, name, current_xml, element_count, thumbnail_path,
  schema_version, created_at, updated_at, parent_diagram_id,
  sub_process_element_id, project_id, deleted_at
) on public.diagrams to authenticated, anon;
```

Idéntico para `projects`. **`0023` se conservó en el historial** con una cabecera que explica que no surtió efecto y apunta a `0028`: está aplicada en producción y el historial de migraciones debe coincidir con la realidad.

**No se tocó `folders` ni `image_folders`**: su cliente usa `upsert()` con `owner_id` en el payload (`SupabaseRepository.ts:459`, `SupabaseImageRepository.ts:149`), y un upsert sobre fila existente es un UPDATE. Revocar ahí habría roto el guardado de carpetas.

## Divergencia

Lo planteado era una línea; lo realizado son dos comandos y una lista explícita de trece columnas. La diferencia **es** el incidente: la forma corta es la intuitiva, la aceptada por el motor, y la que no funciona.

## Verificación

Auditoría estática de los 13 caminos de escritura del cliente: columnas usadas `name`, `deleted_at`, `project_id`, `thumbnail_path`, `current_xml`, `element_count`, `folder_id`, `schema_version`. **Cero mandan `owner_id`.** Todas están en el `GRANT`.

Prueba en vivo como rol `authenticated` con JWT real, sobre un diagrama desechable:

```
crear=OK  autosave=OK  thumbnail=OK  papelera=OK  restaurar=OK
mover-a-proyecto=OK  trigger-colaborador=OK  visible-por-RLS=OK
robo-propiedad=BLOQUEADO OK  |  borrar=OK
```

```
has_column_privilege(...,'diagrams','owner_id','UPDATE')   → false
has_column_privilege(...,'diagrams','name','UPDATE')       → true
has_table_privilege (...,'diagrams','INSERT')              → true
```

## Prevención

- **Señal de recaída:** cualquier `REVOKE ... (columna)` en una migración. Verificar siempre con `has_column_privilege`, nunca asumir que el comando hizo lo que decía.

- **NO "simplificar" la migración `0028`.** Revocar el `UPDATE` de tabla y reconceder trece columnas parece complicación gratuita al lado de un `revoke update (owner_id)` de una línea. Sustituirlo por la forma corta reabre la escalada de privilegio **en silencio**, y el sistema seguirá pareciendo correcto. Este documento existe sobre todo por esto.

- **Trampa asociada:** al añadir una columna nueva a `diagrams` o `projects` hay que **añadirla también al `GRANT`**, o el cliente no podrá escribirla. El error será un 403 confuso, sin relación aparente con la migración que añadió la columna. Está anotado en la cabecera de `0028`.

- **Regla derivada:** una migración que aplica sin error no prueba nada sobre privilegios. Cada cambio de permisos se verifica con `has_table_privilege` / `has_column_privilege`, y preferiblemente ejercitando la operación real bajo el rol real.

- **La defensa en el cliente no cuenta como control.** El comentario de `SupabaseRepository.ts:151` es correcto y útil, pero PostgREST expone la tabla directamente: lo que no impida la base, no está impedido.
