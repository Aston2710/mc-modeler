---
documento: rendimiento-base-de-datos
vigencia: vigente
actualizado: 2026-08-09
deriva_de: [DEC-005]
---

# 02 — Análisis de rendimiento

Ventana de medición: `pg_stat_statements` reiniciado el **2026-05-29 13:54 UTC**, lectura el **2026-08-09**. ~72 días de tráfico real de producción.

**Contexto indispensable:** la base ocupa 17 MB y `shared_buffers` son 224 MB. Todo está en RAM. El ratio de aciertos de caché es **100.000%** y casi ninguna consulta registra `shared_blks_read > 0`. Por tanto **no hay ningún cuello de botella de I/O**. Todo lo que sigue es tiempo de CPU, y por eso se arregla con SQL, no con hardware.

---

## 1. Reparto del tiempo total de ejecución

Tiempo acumulado en la ventana: **~7 070 segundos**.

| # | Consulta | Llamadas | Total (s) | Media (ms) | % | Buffers |
|---:|---|---:|---:|---:|---:|---:|
| 1 | **`realtime.apply_rls` sobre WAL** | 990 654 | 5 180.5 | 5.229 | **73.28%** | 1 560 540 484 |
| 2 | `SELECT name FROM pg_timezone_names` | 867 | 539.2 | **621.9** | 7.63% | 0 |
| 3 | `storage.objects` lookup por `(name,bucket_id)` | 26 514 | 202.6 | 7.640 | 2.87% | 1 673 638 |
| 4 | INSERT `yjs_documents` *(legado)* | 15 463 | 124.7 | 8.067 | 1.76% | 2 416 412 |
| 5 | listado de extensiones *(panel Supabase)* | 259 | 108.6 | 419.4 | 1.54% | 2 836 |
| 6 | **`SELECT diagrams.* ORDER BY updated_at DESC`** *(legado)* | 5 786 | 101.9 | **17.62** | 1.44% | 3 530 900 |
| 7 | `UPDATE diagrams SET current_xml,…` | 7 348 | 55.2 | 7.508 | 0.78% | 897 410 |
| 8 | introspección PostgREST (tipos base) | 867 | 42.6 | 49.10 | 0.60% | 1 951 103 |
| 9 | `pg_publication_tables` (realtime) | 3 461 | 41.9 | 12.09 | 0.59% | 309 476 |
| 10 | `INSERT storage.objects … ON CONFLICT` | 4 829 | 40.9 | 8.468 | 0.58% | 199 520 |
| 11 | `pgbouncer.get_auth` | 38 951 | 36.8 | 0.944 | 0.52% | 230 978 |
| 15 | `UPDATE diagrams SET thumbnail_path` | 7 057 | 29.3 | 4.145 | 0.41% | 449 936 |
| 19 | `SELECT diagrams.id WHERE id=$1` | 9 313 | 17.7 | 1.903 | 0.25% | 923 747 |

Lo que este reparto dice, sin adornos: **la aplicación consume menos del 6% del tiempo de la base.** El 73% se lo lleva Realtime, el 7.6% un bug conocido de Supabase, y otro ~3% la introspección de PostgREST y del panel.

---

## <a id="realtime"></a>2. P2 — Realtime: 73% del tiempo, 1.56 mil millones de buffers

```
SELECT wal->>'type', wal->>'schema', wal->>'table', … FROM realtime.apply_rls(…)
  llamadas         990 654
  tiempo total   5 180 539 ms  (86 minutos de CPU)
  media              5.229 ms
  buffers    1 560 540 484     ← ~1 575 buffers (12.6 MB) por llamada
```

**Qué hace:** por cada cambio en el WAL de una tabla publicada, Realtime evalúa las políticas RLS del cambio contra cada suscriptor para decidir a quién difundirlo. Con 5 tablas publicadas, cada INSERT/UPDATE/DELETE en cualquiera de ellas dispara este ciclo.

**Por qué cuesta tanto aquí:**

1. `images` e `image_folders` están publicadas y su política `SELECT` es `true` para `authenticated` → **todo cambio se difunde a todos**, y el filtro no descarta nada, así que el trabajo es máximo.
2. `notification_outbox` está publicada y recibe UPDATEs (`sent_at`, `read_at`, `attempts`): 103 UPDATEs sobre 62 filas, cada uno replicado.
3. `comment_threads`/`comment_replies` tienen políticas que llaman a `can_access_diagram()` → **el costo por fila del hallazgo P1 se multiplica por cada suscriptor en cada evento de WAL**. Los dos problemas se componen.

**Qué hacer** (por orden de retorno):

- Quitar `images` e `image_folders` de la publicación y sustituir la sincronía de la biblioteca por un canal Broadcast explícito (el cliente ya sabe cuándo sube una imagen; no necesita que la base se lo cuente vía WAL). Elimina la fuente de eventos más ruidosa y la que menos filtra.
- Quitar `notification_outbox` y difundir el aviso por Broadcast desde el trigger, o dejar que el cliente haga *poll* del `notification_outbox_unsent_idx` — que ya existe y es parcial.
- Dejar publicadas solo `comment_threads` y `comment_replies`, que son las que sí necesitan `postgres_changes` con filtro por diagrama.

Estimación conservadora: quitar las 3 tablas ruidosas debería recortar el volumen de eventos WAL en un orden de magnitud. No se puede medir *a priori* sin reproducir el tráfico, así que **medir antes y después** con `pg_stat_statements` reiniciado.

---

## <a id="rls"></a>3. P1 — RLS de `diagrams`: 186× el baseline, medido

### El plan real

`EXPLAIN (ANALYZE, BUFFERS)` de la consulta de lista, ejecutada con `SET LOCAL role = authenticated` y un JWT real de un usuario con 29 diagramas propios:

```
Sort (actual time=31.071..31.080 rows=78 loops=1)
  Sort Key: updated_at DESC
  Sort Method: quicksort  Memory: 37kB
  Buffers: shared hit=1344
  ->  Seq Scan on diagrams (actual time=20.268..30.985 rows=78 loops=1)
        Filter: ((deleted_at IS NULL) AND private.can_access_diagram(id))
        Rows Removed by Filter: 54
        Buffers: shared hit=1341
Planning Time: 2.297 ms
Execution Time: 31.212 ms
```

**31 ms para filtrar 132 filas.** 1 341 buffers para una tabla cuyo heap son 12 páginas. La aritmética: ~10 buffers por fila, que es exactamente lo que cuestan los 4 `EXISTS` de `can_access_diagram()` ejecutados fila a fila.

Es también la explicación de los 1 244 343 escaneos sobre `diagrams_pkey` y los 64 814 escaneos secuenciales sobre `diagram_collaborators`: no son consultas de la aplicación, son la función RLS iterando.

### Benchmark en caliente

10 iteraciones tras 3 de calentamiento, mismo usuario, misma sesión, `count(*)` sobre `diagrams` (132 filas):

| Variante | ms/consulta | Factor |
|---|---:|---:|
| **C)** sin RLS (baseline puro) | **0.0449** | 1× |
| **B)** predicado conjuntista inline | **0.49** | 11× |
| **A)** RLS actual (`can_access_diagram` por fila) | **8.37** | **186×** |

El predicado B es:

```sql
   d.owner_id = (select auth.uid())
or exists (select 1 from diagram_collaborators c
             where c.diagram_id = d.id and c.user_id = (select auth.uid()))
or d.project_id in (select project_id from project_collaborators
                      where user_id = (select auth.uid()))
or d.project_id in (select id from projects where owner_id = (select auth.uid()))
```

**Devuelve exactamente el mismo conjunto de filas** (78 en ambos casos). La diferencia es dónde se evalúa: el planificador materializa las tres subconsultas **una vez** en hashes y luego hace una comprobación O(1) por fila, en vez de llamar a una función opaca 132 veces.

**Ganancia: 17× (8.37 → 0.49 ms).** El `(select auth.uid())` envuelto también evita que Postgres reevalúe `auth.uid()` por fila — es el mismo patrón que el linter `auth_rls_initplan` pide en 22 políticas más.

### Por qué escala mal

El costo es **lineal en el número de filas de `diagrams`**, con un factor de ~63 µs por fila:

| Diagramas | RLS actual | RLS conjuntista |
|---:|---:|---:|
| 132 (hoy) | 8.4 ms | 0.5 ms |
| 1 000 | ~63 ms | ~1 ms |
| 10 000 | ~630 ms | ~4 ms |
| 100 000 | ~6.3 s | ~30 ms |

A 10 000 diagramas la pantalla de inicio tarda más de medio segundo **solo en autorización**, antes de ordenar y de serializar. Con la forma conjuntista sigue siendo instantánea porque el trabajo pasa a depender de cuántos diagramas ve *ese usuario*, no de cuántos existen.

### Riesgo del cambio

El predicado inline en la política RLS **duplica lógica** que hoy vive en un solo sitio. Mitigación: mantener las funciones `can_*` para las políticas de `UPDATE`/`DELETE` y para uso desde triggers (donde se evalúan una vez, no por fila), y usar la forma conjuntista **solo en las políticas `SELECT` de `diagrams` y `projects`**, que son las que se aplican sobre conjuntos grandes. Ver SQL en `supabase/migrations/0021`–`0029` (aplicado en `supabase/migrations/0021`–`0029`).

---

## 4. `pg_timezone_names` — 7.63% del tiempo, no es culpa de la aplicación

```
SELECT name FROM pg_timezone_names   →  867 llamadas, 621.9 ms de media
```

Es PostgREST recargando su caché de esquema. Cada recarga escanea el catálogo de zonas horarias, que en Postgres es una función que lee el disco del sistema. 867 recargas en 72 días = ~12 al día.

No es tráfico de la aplicación y no se puede optimizar desde el esquema. Lo que sí se puede: **reducir las recargas**, que se disparan con cada `NOTIFY pgrst, 'reload schema'` y con cada DDL. Se dispara sola en cada migración y cada vez que se abre el panel de Supabase. 7.6% del tiempo total en algo que no sirve a ningún usuario.

Junto con las consultas #5, #8, #13 y #14 (introspección de PostgREST y del panel), el *overhead* de plataforma suma **~3.1%** adicional. Total no atribuible a la aplicación: **~84%**.

---

## 5. Consultas legadas ya corregidas (verificado en código)

Dos de los diez peores registros son de código que **ya no existe**:

**#4 — `INSERT INTO yjs_documents`** (15 463 llamadas, 124.7 s). La tabla se eliminó en la migración `0018_drop_yjs_tables` (2026-07-19). Es el rastro del pivote Yjs→XML documentado en `project_pivote_adr_estado`.

**#6 — `SELECT diagrams.* ORDER BY updated_at DESC`** (5 786 llamadas, **17.62 ms** de media, 3 530 900 buffers). Traía `current_xml` completo de cada diagrama en la pantalla de lista: **3 764 kB de XML por carga**. Corregido: `SupabaseRepository.ts:123` define `LIST_COLUMNS` sin `current_xml`, y el comentario del código documenta exactamente el porqué. La consulta actual (`getAll`) filtra además `deleted_at IS NULL`, que la vieja no tenía — confirmación de que el registro es anterior a la migración `0019_soft_delete` (2026-07-29).

Estos 227 s de la ventana no volverán a acumularse. Al reiniciar `pg_stat_statements` el reparto real de la aplicación se verá mucho más limpio.

---

## 6. Patrón de escritura de `diagrams` — el otro costo real

```
7 348 UPDATE de current_xml   ·  7.508 ms media  ·  897 410 buffers
7 057 UPDATE de thumbnail_path ·  4.145 ms media  ·  449 936 buffers
9 313 SELECT id WHERE id=$1    ·  1.903 ms media  ·  923 747 buffers
```

Tres observaciones:

**a) El `SELECT id` previo al guardado.** `SupabaseRepository.save()` hace un `SELECT id WHERE id=$1` para decidir entre INSERT y UPDATE (línea 153-158). El motivo está documentado en el código y es correcto: un `upsert` incluiría `owner_id` en el UPDATE y un editor podría robar la propiedad del diagrama. Pero cuesta 1.9 ms **y arrastra la evaluación completa de RLS** — de ahí los 923 747 buffers para 9 313 consultas de una sola fila por PK (99 buffers por consulta que debería costar 3).

Alternativa sin round-trip extra ni riesgo: un `INSERT … ON CONFLICT (id) DO UPDATE SET … ` que **omita `owner_id` de la lista de asignaciones**. Postgres no toca lo que no se le nombra. Elimina una consulta completa por guardado.

**b) `thumbnail_path` se escribe casi tan a menudo como el XML** (7 057 vs 7 348 UPDATEs). Y su valor es **100% derivable del `id`**: se verificó que las 119 filas con thumbnail cumplen `thumbnail_path = id || '/thumb'`, sin una sola excepción, coincidiendo con `const thumbPath = (id) => \`${id}/thumb\`` en `SupabaseRepository.ts:9`. Son 7 057 UPDATEs, 29 s de CPU y 449 936 buffers gastados en almacenar un dato calculable. Sustituir por `has_thumbnail boolean` no cambiaría el número de UPDATEs, pero eliminaría 40 bytes por fila y, más importante, elimina la posibilidad de que la columna y el bucket se desincronicen.

**c) Cada UPDATE de `current_xml` reescribe el TOAST completo.** Media de 29 kB por diagrama, p95 de 93 kB, máximo 294 kB. Postgres no hace actualización parcial de TOAST: cambiar un byte del XML reescribe todos los *chunks*. Con 15 905 UPDATEs históricos sobre `diagrams`, eso es mucha rotación de páginas TOAST y mucho WAL. Es inherente al modelo "un XML por diagrama" y **no recomiendo cambiarlo** — la alternativa (descomponer el BPMN en tablas relacionales) destruiría el rendimiento de apertura del diagrama, que es la operación crítica. Lo que sí conviene es no guardar cuando el XML no cambió, si el autoguardado no lo comprueba ya.

---

## 7. Vacuum y estadísticas

| Tabla | Vivas | Muertas | % muerto | autoanalyze | Último autoanalyze |
|---|---:|---:|---:|---:|---|
| `notification_prefs` | 1 | 7 | **87.5%** | 0 | nunca |
| `comment_threads` | 5 | 12 | **70.6%** | 0 | nunca |
| `comment_replies` | 9 | 10 | **52.6%** | 0 | nunca |
| `diagram_invites` | 23 | 20 | **46.5%** | 0 | nunca |
| `image_folders` | 7 | 2 | 22.2% | 0 | nunca |
| `projects` | 15 | 3 | 16.7% | 0 | **nunca** |
| `diagram_collaborators` | 156 | 31 | 16.6% | 8 | 2026-08-04 |
| `diagrams` | 132 | 23 | 14.8% | 277 | 2026-08-06 |
| `profiles` | 23 | 0 | 0% | 0 | nunca |

Los porcentajes altos son irrelevantes en términos de espacio (hablamos de decenas de filas) pero **sí importan por las estadísticas**: 6 tablas nunca han pasado por `ANALYZE`, incluida `projects`, que aparece en las cuatro funciones RLS. El planificador está trabajando con `reltuples = -1` en `folders`, `image_folders`, `diagram_invites`, `comment_threads`, `comment_replies` y `_xml_backup_20260723`, es decir, adivinando.

Con estas cardinalidades el planificador acierta igual (todo cabe en una página). Pero `ANALYZE` es gratis y elimina la variable. Recomendación: un `ANALYZE` explícito sobre el esquema tras cada migración, y bajar `autovacuum_analyze_scale_factor` en las tablas pequeñas de alta rotación para que el umbral no dependa de un porcentaje de cero filas.

---

## 8. Storage

| Bucket | Objetos | Bytes | Media/obj | Límite de tamaño |
|---|---:|---:|---:|---|
| `thumbnails` | 194 | 10 212 kB | 53 kB | **ninguno** |
| `diagram-images` | 52 | 5 626 kB | 108 kB | **ninguno** |

La consulta #3 del ranking (`storage.objects` por `(name, bucket_id)`, 26 514 llamadas, **7.64 ms de media**) es cara para un lookup por índice único. 63 buffers por llamada. Causa probable: RLS de `storage.objects` más el hecho de que ambos buckets son privados, lo que obliga a firmar cada acceso.

`SupabaseRepository` ya cachea agresivamente los thumbnails en memoria (`thumbCache`, `thumbPaths`) con identidad estable del dataURL para evitar el parpadeo — ver comentarios en las líneas 100-107. Ese caché es lo que evita que estas 26 514 llamadas sean 10 veces más.

**194 objetos para 132 diagramas**: hay ~62 thumbnails huérfanos. `purgeAll`/`purge` sí borran del bucket (líneas 265, 292, 330), así que el residuo probablemente viene de subprocesos y de borrados anteriores a la migración de papelera.

~~**Ningún bucket tiene `file_size_limit`.**~~ Un cliente comprometido, o un bug de generación de thumbnail, podía subir un archivo de cualquier tamaño. **Resuelto:** la migración `0026` puso techos explícitos, y el 2026-08-13 el de `thumbnails` se ajustó de 2 MB a 5 MB porque el valor inicial quedó apretado. Estado vigente en [`base-de-datos-inventario.md`](base-de-datos-inventario.md#storage).

---

## 9. Resumen: dónde está realmente el tiempo

```
73.3%  Realtime WAL/RLS          ← quitar 3 tablas de la publicación
 7.6%  pg_timezone_names          ← plataforma, reducir recargas de esquema
 3.1%  introspección PostgREST/panel ← plataforma
 3.2%  legado ya corregido (yjs + SELECT *)  ← desaparece solo
 2.9%  storage.objects lookup
 
~5%    TODO EL RESTO DE LA APLICACIÓN
```

Y dentro de ese ~5%, el multiplicador dominante es la evaluación de RLS por fila, que además es lo que hace caro el 73% de Realtime. **Arreglar el RLS de `diagrams`/`projects` y podar la publicación son las dos únicas acciones de rendimiento que valen la pena hoy.** Todo lo demás son índices que no se usan y microsegundos.
