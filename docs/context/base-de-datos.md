---
documento: base-de-datos
vigencia: vigente
actualizado: 2026-08-10
deriva_de: [PLAN-010, DEC-005, DEC-006]
---

# Auditoría de base de datos — mc-modeler (Supabase)

**Fecha:** 2026-08-09
**Rama:** `DB-Audit`
**Motor:** PostgreSQL 17.6 (aarch64), Supabase gestionado
**Alcance:** esquema `public` completo + `private`, `storage`, `auth`, `realtime`, `net`
**Método:** lectura de catálogo (`pg_catalog`, `information_schema`), `pg_stat_statements` (ventana 2026-05-29 → 2026-08-09, ~72 días), `pg_stat_user_tables/indexes`, `EXPLAIN (ANALYZE, BUFFERS)` bajo rol `authenticated` real, benchmark en caliente con `clock_timestamp()`, linters de Supabase.

## Documentos

| Archivo | Contenido |
|---|---|
| [01-inventario-esquema.md](base-de-datos-inventario.md) | Estructura completa: 16 tablas, columnas, PK/FK/CHECK, 36 índices, 42 políticas RLS, 15 funciones, 12 triggers, publicaciones realtime, buckets |
| [02-rendimiento.md](rendimiento-base-de-datos.md) | Perfil de carga real, top queries, cuellos de botella medidos, índices muertos/faltantes, TOAST, vacuum |
| [03-normalizacion.md](normalizacion.md) | Análisis 1NF→5NF tabla por tabla, violaciones reales vs desnormalización deliberada, **forma normal recomendada y por qué** |
| [04-hallazgos-y-plan.md](../plans/todo/011-remediacion-de-base-de-datos-pendiente.md) | Hallazgos priorizados (P0→P3) con impacto cuantificado y esfuerzo |
| `supabase/migrations/0021`–`0029` (aplicado en `supabase/migrations/0021`–`0029`) | SQL propuesto en la auditoría inicial (referencia histórica) |
| [06-cambios-aplicados.md](../plans/done/010-auditoria-y-remediacion-de-base-de-datos.md) | **8 migraciones aplicadas 2026-08-09** con medición antes/después y prueba de equivalencia |
| [07-thumbnails-y-metodo-rendimiento.md](../plans/todo/012-thumbnails-webp-y-entrega-segura.md) | Por qué los thumbnails van lentos y cómo acelerarlos + método de trabajo para rendimiento |

> **Estado:** las migraciones `0021`–`0028` ya están aplicadas en producción. Ver [06](../plans/done/010-auditoria-y-remediacion-de-base-de-datos.md) para el resultado medido: consulta de lista **31.2 ms → 1.33 ms**, y fuga P0 cerrada.

## Resumen ejecutivo

**Estado general: diseño relacional sólido, ejecución con tres fugas graves.**

El modelo es correcto: claves naturales bien elegidas, integridad referencial completa (23 FKs, todas validadas, con `ON DELETE` explícito en cada una), CHECKs en todos los enums de texto, RLS habilitado en 15 de 16 tablas y centralizado en 7 funciones `SECURITY DEFINER` del esquema `private`. Eso es mejor higiene que la mayoría de proyectos Supabase que se ven en producción.

Los problemas no están en el modelo, están en la capa de acceso.

### Los tres hallazgos que importan

**P0 — Fuga de datos abierta.** La tabla `public._xml_backup_20260723` tiene RLS **deshabilitado** y `GRANT ALL` a `anon`. Está expuesta por PostgREST. Contiene el XML completo de 29 diagramas. Cualquiera con la clave anónima —que viaja en el bundle del frontend— puede leerla y también borrarla. Detalle y mitigación en [04-hallazgos-y-plan.md](../plans/todo/011-remediacion-de-base-de-datos-pendiente.md#p0-1).

**P1 — RLS de `diagrams` cuesta 186× el baseline.** `private.can_access_diagram(id)` se evalúa **una vez por fila** y ejecuta 4 subconsultas `EXISTS` en cada evaluación. Medido en caliente sobre 132 filas:

| Variante | ms/consulta | vs baseline |
|---|---|---|
| C) sin RLS (baseline) | 0.0449 | 1× |
| B) predicado conjuntista inline | 0.49 | 11× |
| **A) RLS actual (función por fila)** | **8.37** | **186×** |

Reescribir el predicado a forma conjuntista da **17× de mejora** (8.37 → 0.49 ms) sin perder ni un ápice de seguridad: el conjunto de filas visibles es idéntico. El costo crece **lineal con el número de filas**; a 10 000 diagramas la lista tarda ~630 ms solo en RLS.

**P2 — Realtime consume el 73% del tiempo total de CPU de la base.** La función de RLS sobre WAL (`realtime.apply_rls`) acumula 5 180 s de ejecución en 990 654 llamadas, con **1 560 540 484** buffers tocados. Es 5.7× todo el resto de la aplicación junto. Causa: 5 tablas en la publicación `supabase_realtime`, dos de ellas (`images`, `image_folders`) con política `SELECT` = `true`, lo que obliga a evaluar y difundir cada cambio contra cada suscriptor.

### Forma normal recomendada

**3NF con cuatro desnormalizaciones deliberadas y documentadas.** No subir a BCNF/4NF/5NF. El razonamiento completo está en [03-normalizacion.md](normalizacion.md#recomendacion); en corto: el esquema ya está en 3NF salvo excepciones que son *caché de snapshot* (nombres de autor, email de destinatario) o *caché derivado* (`element_count`), y en este sistema el costo dominante no son los JOINs sino la evaluación de RLS por fila — normalizar más multiplica precisamente lo que ya es caro.

### Lo que se puede tirar hoy mismo

- `_xml_backup_20260723` (376 kB, RLS off, 29 filas) — respaldo de una migración terminada el 2026-07-23
- `yjs_documents_backup_20260701` (632 kB, sin PK, sin políticas) — respaldo del pivote Yjs ya completado
- `folders` (0 filas, 2 índices) — funcionalidad sustituida por `projects`
- 6 índices con 0 escaneos históricos

Total: ~1 MB de 17 MB, más importante por el ruido y el riesgo que por el espacio.
