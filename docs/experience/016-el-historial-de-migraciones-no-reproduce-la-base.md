---
id: EXP-016
titulo: El historial de migraciones no reproducia la base en un Postgres virgen
estado: resuelto
severidad: alta
fecha_deteccion: 2026-08-13
fecha_cierre: 2026-08-13
componentes: [supabase/migrations, comment_threads, comment_replies, _xml_backup_20260723, mcp apply_migration]
relacionados: [MASTER-PLAN-018, context/desarrollo-local.md, EXP-013]
---

# El historial de migraciones no reproducía la base en un Postgres virgen

## Síntoma

Al levantar por primera vez un entorno local (Supabase en Docker), reproducir las 29 migraciones del repositorio sobre un Postgres vacío falló **dos veces**:

```
Applying migration 0008_comment_delete_policies.sql...
ERROR: relation "public.comment_threads" does not exist (SQLSTATE 42P01)
```

```
Applying migration 0021_secure_backup_tables.sql...
ERROR: relation "public._xml_backup_20260723" does not exist (SQLSTATE 42P01)
```

En producción esas migraciones se habían aplicado sin problema.

## Causa

Producción tiene **35 migraciones registradas**; el repositorio tiene **29 archivos**. Faltan seis:

| Versión registrada | Nombre | Qué creaba |
|---|---|---|
| 20260529213322 | `harden_project_functions` | endurecido de funciones de proyecto |
| 20260702022002 | `yjs_append_only_log_phase1` | fase del pivote Yjs |
| 20260702024614 | `yjs_documents_client_readonly_phase5` | fase del pivote Yjs |
| 20260703125222 | `diagram_backups_table` | `public._xml_backup_20260723` |
| 20260703193103 | `comment_threads_and_replies` | las dos tablas de comentarios |
| 20260703195158 | `diagram_images_bucket` | bucket `diagram-images` |

Se aplicaron con la herramienta MCP de Supabase (`apply_migration`), que **ejecuta el SQL y lo registra en la base, pero no escribe el archivo `.sql` en el repositorio**. En seis ocasiones nadie lo guardó después.

Las tablas de comentarios sí se crearon con una migración — lo que se perdió fue su archivo. La distinción importa: no es esquema hecho a mano sin registro, es registro sin archivo.

## Por qué no se detectó antes

Porque producción solo avanza. Cada migración encuentra el estado que dejó la anterior **más** lo aplicado por fuera del repositorio, así que todas funcionan. El hueco solo se manifiesta al reconstruir desde cero, y hasta el 2026-08-13 nadie lo había intentado.

## Impacto

- **Sin recuperación ante desastre**: el repositorio no bastaba para levantar la base de nuevo.
- **Sin entorno de pruebas**: no se podía ensayar una migración antes de producción, que es exactamente lo que se estaba montando.
- **Documentación desalineada**: `context/base-de-datos-inventario.md` describe 14 tablas; el historial solo sabía crear 12.
- **Degradación acumulativa**: cada aplicación sin archivo añade un hueco más difícil de reconstruir que el anterior.

Nunca hubo riesgo para los datos ni para el servicio. El problema es de reproducibilidad, no de integridad.

## Resolución

Se descartó reconstruir los seis archivos perdidos: para levantar un entorno local basta la foto del esquema de hoy, no la película de cómo se llegó a él.

1. **Baseline** — `supabase/migrations/20260813000000_baseline_produccion.sql`: el esquema completo de producción al 2026-08-13, obtenido por **introspección de solo lectura** con las funciones de DDL de Postgres (`pg_get_functiondef`, `pg_get_constraintdef`, `pg_get_triggerdef`, `pg_get_expr`, `pg_indexes`). Nada deducido: es lo que hay.
2. **Historial archivado** — las 29 migraciones pasaron a `supabase/migrations_legacy/` con un README que explica el hueco. Su valor sigue siendo alto, pero es documental: explican *por qué* la base es como es.
3. **Verificación** — huella md5 de 13 categorías del catálogo, calculada en local y en producción. Las 13 coinciden en conteo y en hash:

   | | | | |
   |---|---|---|---|
   | tablas 17 | columnas 114 | restricciones 52 | índices 46 |
   | funciones 15 | triggers 8 | políticas 56 | RLS activo 14 |
   | permisos tabla 290 | permisos columna 36 | realtime 5 | replica full 5 |
   | buckets 2 | | | |

   Los hashes cubren el texto completo de cada definición, no solo los nombres.

Producción no se tocó en ningún momento: solo consultas de lectura al catálogo.

## Prevención

Toda migración nueva se escribe **primero como archivo** en `supabase/migrations/`, se prueba con `npm run db:reset` en local, y solo entonces se aprueba para producción. Aplicar sin dejar el archivo es la práctica que produjo este agujero.

La comprobación es barata y ahora existe: si `db reset` funciona, el repositorio reproduce la base.
