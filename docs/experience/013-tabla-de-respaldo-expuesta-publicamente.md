---
id: EXP-013
titulo: Una tabla de respaldo quedo en public con RLS desactivado y permisos para anon
estado: resuelto
severidad: critica
fecha_deteccion: 2026-08-09
fecha_cierre: 2026-08-10
componentes: [public._xml_backup_20260723, PostgREST]
relacionados: [PLAN-010, MASTER-PLAN-018]
---

# Una tabla de respaldo quedó en `public` con RLS desactivado y permisos para `anon`

## Síntoma

Ninguno visible. Nada fallaba, nada iba lento, ningún usuario se quejó.

Apareció al inventariar el esquema durante la auditoría: `public._xml_backup_20260723` tenía `relrowsecurity = false` — RLS **desactivado** — y `GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` a los roles `anon`, `authenticated` y `service_role`.

El linter de seguridad de Supabase la reportaba como `rls_disabled_in_public`, nivel **ERROR**. Nadie miraba el linter.

## Impacto

**Exposición de datos, activa y silenciosa.**

La tabla contenía `id`, `name`, `current_xml`, `updated_at` y `backed_up_at` de **29 diagramas** — el XML completo de cada uno, con el nombre de cada tarea, carril y compuerta. Son procesos internos de la empresa.

Está en el esquema `public`, que PostgREST expone en `/rest/v1/`. La clave anónima de Supabase viaja en el bundle del frontend por diseño: es información pública. Cualquiera que la extrajera podía leer los 29 diagramas y también insertarlos, modificarlos o vaciar la tabla con un `TRUNCATE`.

No hay evidencia de que se explotara. Tampoco hay forma de saberlo: no había registro de acceso.

Una segunda tabla, `yjs_documents_backup_20260701`, tenía RLS activo **pero cero políticas**. Eso es fail-closed —nadie podía leerla— así que no hubo exposición, solo 632 kB de residuo.

## Reproducción

Determinista. Con la clave anónima del proyecto, que está en el bundle:

```
GET /rest/v1/_xml_backup_20260723?select=*
```

Verificación desde SQL:

```sql
select relname, relrowsecurity from pg_class
 where relname = '_xml_backup_20260723';        -- relrowsecurity = false

select grantee, privilege_type from information_schema.role_table_grants
 where table_name = '_xml_backup_20260723';     -- incluye anon
```

## Causa raíz

**Una tabla creada con `CREATE TABLE ... AS SELECT` en el esquema `public` nace sin RLS y hereda los `GRANT` por defecto del esquema**, que en Supabase incluyen a `anon` y `authenticated`.

El respaldo se creó el 2026-07-23 antes de una migración de XML. Se hizo en `public` porque es el esquema por defecto y porque era temporal. Nada en el proceso obligaba a revisar RLS ni a limpiarla después: quedó ahí once semanas.

No es un fallo de la política de seguridad del proyecto —el resto de las 15 tablas tenían RLS correctamente configurado— sino de que **una tabla temporal escapó al proceso** que sí se aplica a las tablas del modelo.

## Solución planteada

`DROP TABLE`. El respaldo correspondía a una migración terminada.

## Solución realizada

**No se borró.** Se movió el dato al esquema `private` y se eliminó de `public` (migración `0021_secure_backup_tables`):

```sql
create table if not exists private._xml_backup_20260723 as
  select * from public._xml_backup_20260723;
drop table if exists public._xml_backup_20260723;

revoke all on all tables in schema private from anon, authenticated;
```

Mismo tratamiento para `yjs_documents_backup_20260701`.

## Divergencia

Se planteó un `DROP` y se ejecutó un traslado. Motivo: el `DROP` es irreversible y no había certeza absoluta de que el respaldo hubiera dejado de hacer falta. Mover a `private` cierra la exposición de inmediato —PostgREST no expone ese esquema y no tiene `GRANT` a `anon`— y conserva la opción de borrar después con calma.

Cerrar la fuga y destruir el dato son dos decisiones distintas; se tomó la urgente y se dejó abierta la otra.

## Verificación

```
tablas backup en public              0        (antes 2)
respaldos preservados en private     29 + 100 filas
grants a anon/authenticated en private   0
```

Los linters de seguridad de Supabase dejaron de reportar `rls_disabled_in_public` y `rls_enabled_no_policy`.

## Prevención

- **Señal de recaída:** cualquier tabla en `public` cuyo nombre empiece por `_` o contenga `backup`, `tmp`, `old` o una fecha. Y el linter `rls_disabled_in_public`, que ya lo decía y nadie leía.

  ```sql
  select c.relname, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  ```

- **Regla derivada:** los respaldos y las tablas temporales **no van en `public`**. `private` no está expuesto por PostgREST y no tiene `GRANT` a `anon`. Un respaldo en `public` está publicado en Internet aunque nadie lo sepa.

- **Revisar los avisos de los linters tras cada migración.** `mcp__supabase__get_advisors` con `type=security` es gratis y detectó esto correctamente durante once semanas sin que nadie lo leyera.

- **Lo que no protege:** que el resto del esquema tenga RLS impecable. Esta tabla convivió con 15 tablas bien configuradas. La higiene del modelo no se propaga sola a lo que se crea a mano.
