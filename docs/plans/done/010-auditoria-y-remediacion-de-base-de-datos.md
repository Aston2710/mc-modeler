---
id: PLAN-010
titulo: Auditoria de la base de datos Supabase y remediacion aplicada
estado: done
creado: 2026-08-09
cerrado: 2026-08-10
aprobado_por: jredondo
relacionados: [EXP-013, EXP-014, EXP-015, DEC-005, DEC-006, PLAN-011, PLAN-012, MASTER-PLAN-018]
---

# 06 — Cambios aplicados (2026-08-09)

Ocho migraciones aplicadas a producción. Ninguna requiere cambios en TypeScript. Todas verificadas antes y después.

| Migración | Qué hace |
|---|---|
| `0021_secure_backup_tables` | Cierra la fuga P0: mueve los 2 respaldos a `private` y los saca de `public` |
| `0022_fk_indexes_and_stats` | 7 índices de FK + 2 índices parciales para la lista + umbrales de autoanalyze |
| `0023_protect_owner_id` | Primer intento de proteger `owner_id` — **inoperante**, corregido en 0028 |
| `0024_rls_initplan` | `auth.uid()` → `(select auth.uid())` en 30 políticas |
| `0025_rls_select_setbased` | **RLS conjuntista en `diagrams_select` y `projects_select`** |
| `0026_storage_limits` | `file_size_limit` + `allowed_mime_types` en los 2 buckets |
| `0027_document_denormalizations` | `COMMENT ON` en las 11 desnormalizaciones deliberadas |
| `0028_fix_owner_id_column_grants` | Corrección de 0023 |

---

## Incidentes que documenta

Tres hallazgos de esta auditoria pasaron el umbral de incidente y tienen documento propio en `experience/`. El plan registra **que se arreglaron**; los incidentes registran **por que no hay que revertirlos**:

| | |
|---|---|
| [EXP-013](../../experience/013-tabla-de-respaldo-expuesta-publicamente.md) | Tabla de respaldo en `public` con RLS off y `GRANT` a `anon` |
| [EXP-014](../../experience/014-rls-evaluado-por-fila-degradaba-la-lista-de-diagramas.md) | RLS evaluado por fila: 31 ms para 131 filas, coste lineal |
| [EXP-015](../../experience/015-revoke-update-de-columna-es-noop-con-grant-de-tabla.md) | `REVOKE UPDATE (columna)` no surtio efecto — la desviacion de este plan |

Los otros diez hallazgos son trabajo pendiente sin defecto asociado: viven en PLAN-011, PLAN-016 y PLAN-017.

## Resultado medido

### Consulta de lista de diagramas (`getAll`), usuario real con 78 diagramas visibles

**Antes:**
```
Sort (actual time=31.071..31.080 rows=78)
  Sort Method: quicksort  Memory: 37kB
  Buffers: shared hit=1344
  ->  Seq Scan on diagrams (actual time=20.268..30.985 rows=78)
        Filter: ((deleted_at IS NULL) AND private.can_access_diagram(id))
        Rows Removed by Filter: 54
Execution Time: 31.212 ms
```

**Después:**
```
Index Scan using diagrams_updated_at_live_idx on diagrams (actual time=0.249..1.019 rows=78)
  Filter: ((owner_id = (InitPlan 1).col1) OR (ANY (id = (hashed SubPlan 7).col1))
           OR (ANY (project_id = (hashed SubPlan 10).col1))
           OR (ANY (project_id = (hashed SubPlan 16).col1)))
  Buffers: shared hit=121
Execution Time: 1.330 ms
```

| Métrica | Antes | Después | Mejora |
|---|---:|---:|---:|
| Tiempo de ejecución | 31.212 ms | **1.330 ms** | **23×** |
| Buffers tocados | 1 344 | **121** | **11×** |
| Plan | Seq Scan + Sort | **Index Scan, sin Sort** | — |
| Filas devueltas | 78 | 78 | idéntico |

Desaparecieron el `Seq Scan` y el `Sort`: el índice parcial `diagrams_updated_at_live_idx` ya entrega las filas en el orden pedido. Solo empezó a usarse tras el `ANALYZE` — sin estadísticas reales el planificador no lo consideraba.

### Benchmark aislado del predicado (10 iteraciones tras 3 de calentamiento)

| Variante | ms/consulta | vs baseline sin RLS |
|---|---:|---:|
| Sin RLS (baseline, referencia) | 0.0449 | 1× |
| **Predicado nuevo (conjuntista)** | **0.262** | 5.8× |
| Predicado anterior (función por fila) | 8.733 | 194× |

**33× de mejora** en el predicado aislado — mejor que el 17× que estimé en la auditoría, porque el `ANALYZE` dio al planificador estadísticas reales con las que elegir mejores planes para las subconsultas.

### Prueba de equivalencia — ejecutada ANTES de aplicar

Comparación del conjunto exacto de diagramas visibles para **los 23 usuarios reales**, predicado viejo contra predicado nuevo, mediante hash MD5 del listado ordenado de `id`:

```
usuarios_evaluados            23
identicos                     23
DIVERGENTES                    0
filas_visibles_total_actual  497
filas_visibles_total_nuevo   497
```

Cero divergencias. El cambio de RLS no altera la visibilidad de ningún usuario sobre ningún diagrama.

---

## P0 — fuga cerrada

`public._xml_backup_20260723` tenía RLS deshabilitado y `GRANT ALL` a `anon`, expuesta por PostgREST con el XML completo de 29 diagramas.

**Decisión tomada:** en vez de un `DROP` irreversible, los datos se copiaron a `private` y las tablas se eliminaron de `public`. El esquema `private` no está en la lista de esquemas expuestos de PostgREST y no tiene GRANTs a `anon`/`authenticated`. La fuga está cerrada y el respaldo sigue existiendo.

```
tablas backup en public              0        ← antes 2
respaldos preservados en private     29 + 100 ← intactos
grants a anon/authenticated en private   0
```

Si quieres que desaparezcan de verdad:
```sql
drop table private._xml_backup_20260723;
drop table private.yjs_documents_backup_20260701;
```

Los linters de seguridad de Supabase ya no reportan ni `rls_disabled_in_public` ni `rls_enabled_no_policy`. Quedan 4 avisos, todos intencionales o de panel:

| Aviso | Estado |
|---|---|
| `pg_net` en esquema `public` | conocido, mover corta las notificaciones — prioridad baja |
| `redeem_invite` es SECURITY DEFINER accesible | **intencional**: necesita saltar RLS para insertar en un diagrama que el usuario aún no ve |
| `redeem_project_invite` ídem | **intencional** |
| Protección de contraseñas filtradas desactivada | interruptor del panel de Auth, pendiente |

---

## Corrección a media ejecución: `REVOKE UPDATE (columna)`

`0023` aplicó `revoke update (owner_id) on diagrams from authenticated`. La verificación posterior lo desmintió:

```
has_column_privilege('authenticated','public.diagrams','owner_id','UPDATE')  →  true
```

**Causa:** en PostgreSQL, `REVOKE UPDATE (columna)` es un no-op cuando existe un `GRANT UPDATE` a nivel de tabla — el privilegio de tabla cubre todas las columnas y el revoke de columna no lo perfora. La forma correcta es revocar el privilegio de tabla y volver a concederlo columna a columna.

`0028` lo hace bien. Verificación final:

| Comprobación | Esperado | Real |
|---|---|---|
| `authenticated` puede UPDATE `diagrams.owner_id` | false | **false** |
| `authenticated` puede UPDATE `diagrams.name` | true | **true** |
| `authenticated` puede UPDATE `diagrams.current_xml` | true | **true** |
| `authenticated` puede INSERT en `diagrams` | true | **true** |
| `authenticated` puede UPDATE `projects.owner_id` | false | **false** |
| `authenticated` puede UPDATE `projects.name` | true | **true** |

Un editor ya no puede robar la propiedad de un diagrama con un `PATCH` manual. La defensa dejó de depender del cliente.

**No se tocó `folders` ni `image_folders`**: su cliente usa `upsert()` con `owner_id` en el payload (`SupabaseRepository.ts:459`, `SupabaseImageRepository.ts:149`), y un upsert sobre fila existente es un UPDATE. Revocar ahí habría roto el guardado de carpetas.

---

## Falsa alarma resuelta

Una verificación intermedia reportó "30 políticas con `auth.uid()` sin envolver" después de aplicar `0024`. Era mi patrón de búsqueda, no las políticas: PostgreSQL deparsa `(select auth.uid())` como `( SELECT auth.uid() AS uid)`, que no coincide con un `LIKE '%select auth.uid()%'`. Confirmado leyendo el `qual` real:

```sql
diagrams_delete → (owner_id = ( SELECT auth.uid() AS uid))
```

Forma InitPlan correcta en las 30.

---

## Lo que NO se aplicó, y por qué

| Acción | Motivo |
|---|---|
| Podar la publicación de realtime (73% del CPU) | Requiere que el cliente sustituya `postgres_changes` por canales Broadcast. Sin eso, la biblioteca de imágenes y el badge de notificaciones dejan de actualizarse solos. |
| `thumbnail_path` → `has_thumbnail` | Requiere tocar 6 sitios de `SupabaseRepository`. Documentado con `COMMENT ON` mientras tanto. |
| Vista `public_profiles` sin email | Requiere revisar el autocompletado de menciones en el cliente. |
| **Borrar la tabla `folders`** | **Verificado: SÍ se usa.** `getFolders`/`saveFolder`/`deleteFolder` existen en `SupabaseRepository.ts:443-467`. Tiene 0 filas pero el código la consulta. Documentado con `COMMENT ON TABLE`. |
| Borrar índices sin uso | Los de `images`/`image_folders` están muertos solo porque la política `SELECT` es `true` y el cliente no filtra. Si se acota la visibilidad, se activan solos. Borrarlos sería una regresión futura por ahorrar 64 kB. |
| Política `UPDATE` en tablas de colaboradores | No hay consumidor hoy. Añadirla amplía superficie sin beneficio inmediato. |
| Barrido de thumbnails huérfanos | 78 objetos, 3 896 kB. Requiere decidir qué hacer con los de la papelera. Ver [07](../todo/012-thumbnails-webp-y-entrega-segura.md). |

---

## Estado de `pg_stat_statements`

**No se reinició.** La ventana sigue siendo 2026-05-29 → hoy, así que las medias históricas contienen tráfico de antes de estos cambios y ya no reflejan el estado real.

Antes de medir el efecto de la poda de realtime, reiniciar y dejar correr una semana:

```sql
select extensions.pg_stat_statements_reset();
```
