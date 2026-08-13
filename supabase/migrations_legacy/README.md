# Historial de migraciones (2026-05-29 → 2026-08-10)

Estas 29 migraciones **ya estan aplicadas en produccion** y no vuelven a ejecutarse. Estan aqui, fuera de `migrations/`, por dos razones.

## 1. No reproducen la base

Produccion tiene **35 migraciones registradas**; aqui hay 29 archivos. Faltan seis:

| Version registrada | Nombre | Que creaba |
|---|---|---|
| 20260529213322 | `harden_project_functions` | endurecido de funciones de proyecto |
| 20260702022002 | `yjs_append_only_log_phase1` | fase del pivote Yjs |
| 20260702024614 | `yjs_documents_client_readonly_phase5` | fase del pivote Yjs |
| 20260703125222 | `diagram_backups_table` | `public._xml_backup_20260723` |
| 20260703193103 | `comment_threads_and_replies` | **las dos tablas de comentarios** |
| 20260703195158 | `diagram_images_bucket` | bucket `diagram-images` |

Se aplicaron con la herramienta MCP de Supabase, que ejecuta y registra en la base pero **no escribe el `.sql` en el repositorio**. Nadie los guardo despues.

Efecto: un Postgres virgen fallaba en `0008` (usa `comment_threads`, que nadie crea) y en `0021` (copia de `public._xml_backup_20260723`, que nadie crea). Se descubrio el 2026-08-13, al montar el entorno local — la primera vez que alguien intento reconstruir desde cero.

## 2. Su valor ahora es documental

Para **construir** la base esta `supabase/migrations/20260813000000_baseline_produccion.sql`: la foto del esquema de hoy, obtenida por introspeccion de solo lectura.

Para **entender por que** la base es como es, estos archivos. Cada uno explica en sus comentarios el problema que resolvia. Los mas valiosos:

- `0021_secure_backup_tables.sql` — la fuga P0: una tabla de respaldo con RLS apagado y `GRANT ALL` a `anon`, con el XML completo de 29 diagramas expuesto por la API publica.
- `0023_protect_owner_id.sql` y `0028_fix_owner_id_column_grants.sql` — por que `diagrams` y `projects` no tienen `UPDATE` de tabla sino permisos por columna. Y la trampa que costo dos migraciones: **un `REVOKE` por columna es un no-op si existe un `GRANT` de tabla**.
- `0025_rls_select_setbased.sql` — por que la politica de `SELECT` de `diagrams` esta escrita con `IN` y no con `EXISTS` correlacionado: 31.2 ms → 1.33 ms en la lista.
- `0018_drop_yjs_tables.sql` — el cierre del pivote a XML como fuente de verdad.

## Regla a partir de ahora

Toda migracion nueva se escribe **primero como archivo** en `supabase/migrations/`, se prueba en local con `npm run db:reset`, y solo entonces se aprueba para produccion. Aplicar sin dejar el archivo es lo que produjo este agujero.
