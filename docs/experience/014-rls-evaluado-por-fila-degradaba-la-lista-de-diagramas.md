---
id: EXP-014
titulo: La politica RLS de diagrams se evaluaba una vez por fila y la lista tardaba 31 ms
estado: resuelto
severidad: alta
fecha_deteccion: 2026-08-09
fecha_cierre: 2026-08-10
componentes: [private.can_access_diagram, diagrams_select, projects_select, storage.objects]
relacionados: [PLAN-010, DEC-005, MASTER-PLAN-018]
---

# La política RLS de `diagrams` se evaluaba una vez por fila y la lista tardaba 31 ms

## Síntoma

La pantalla de inicio no se percibía lenta —131 diagramas, la red y los thumbnails dominaban la espera—, así que nadie lo reportó.

Lo que delató el problema no fue el tiempo, fue la aritmética de un `EXPLAIN`: **1 344 buffers para una tabla cuyo heap son 12 páginas.** Unas 10 páginas tocadas por fila devuelta. Eso es imposible sin trabajo oculto ejecutándose fila a fila.

## Impacto

Ninguno percibido con el volumen actual. El problema era el **crecimiento**: el coste era lineal, ~63 µs por fila de `diagrams`, independientemente de cuántas viera el usuario.

| Diagramas | Solo autorizar |
|---:|---:|
| 131 (hoy) | 31 ms |
| 1 000 | ~63 ms |
| 10 000 | **~630 ms** |
| 100 000 | ~6.3 s |

A 10 000 diagramas la portada tardaría más de medio segundo **solo en decidir qué puede ver el usuario**, antes de ordenar y serializar. Es la clase de degradación que aparece cuando el producto empieza a funcionar.

El mismo patrón afectaba a las políticas de `storage.objects`: 12.3 ms para filtrar 194 thumbnails.

## Reproducción

Determinista. **Hay que medir con el rol real**, o no se ve nada:

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<uuid-real>","role":"authenticated"}';
  explain (analyze, buffers) select id from diagrams where deleted_at is null;
rollback;
```

Sin `set local role`, la conexión es superusuario, RLS no se aplica y la consulta tarda 0.045 ms. **Factor 700 entre lo que se mide y lo que le pasa al usuario.**

Plan observado antes del arreglo:

```
Seq Scan on diagrams (actual time=20.268..30.985 rows=78)
  Filter: ((deleted_at IS NULL) AND private.can_access_diagram(id))
  Rows Removed by Filter: 54
  Buffers: shared hit=1341
Execution Time: 31.212 ms
```

## Causa raíz

`private.can_access_diagram(d_id)` es una función `SQL` `STABLE` que ejecuta **cuatro subconsultas `EXISTS`** (dueño ∪ colaborador del diagrama ∪ colaborador del proyecto ∪ dueño del proyecto).

La política la invocaba directamente:

```sql
diagrams_select USING ( private.can_access_diagram(id) )
```

**Para el planificador, una función es opaca.** No puede mirar dentro ni materializar sus resultados: solo puede llamarla, una vez por cada fila candidata. Las cuatro subconsultas se reejecutaban 131 veces.

Centralizar la autorización en funciones `SECURITY DEFINER` es **arquitectura correcta** —evita recursión de RLS y duplicar lógica entre 42 políticas— y no era el error. El error era **dónde** se usaba: en una política `SELECT` que se aplica sobre un conjunto, no sobre una fila.

Agravante secundario: `auth.uid()` sin envolver se reevaluaba también por fila (linter `auth_rls_initplan`, 22 políticas afectadas).

## Solución planteada

Reescribir las políticas `SELECT` de `diagrams` y `projects` con el predicado expresado de forma conjuntista, para que el planificador materialice los conjuntos una vez.

## Solución realizada

Lo planteado (migraciones `0024`, `0025`, `0029`), en tres partes:

1. `auth.uid()` → `(select auth.uid())` en 30 políticas: se convierte en un `InitPlan` que se ejecuta **una vez por consulta**.
2. Predicado conjuntista en `diagrams_select` y `projects_select`.
3. El mismo patrón en `thumbnails_select` y `diagram_images_select` de `storage.objects`.

**Las funciones `private.can_*` no se eliminaron.** Siguen usándose en las políticas `UPDATE`/`DELETE`/`INSERT`, que se evalúan sobre una fila concreta y ahí no hay diferencia de coste.

Plan resultante:

```
Index Scan using diagrams_updated_at_live_idx on diagrams (rows=79)
  Filter: (owner_id = (InitPlan 1).col1) OR (ANY (id = (hashed SubPlan 7).col1)) ...
  Buffers: shared hit=125
```

`hashed SubPlan` es la señal de que funcionó: el planificador construyó tablas hash y la comprobación pasó a ser O(1) por fila.

## Verificación

**Equivalencia probada antes de aplicar**, sobre los 23 usuarios reales: hash MD5 del listado ordenado de ids visibles, predicado viejo contra nuevo.

```
usuarios evaluados            23
identicos                     23
DIVERGENTES                    0
filas visibles totales   497 / 497
```

Rendimiento, 20 iteraciones en caliente tras 5 de calentamiento:

| | Antes | Después |
|---|---:|---:|
| Consulta de lista completa | 31.212 ms | **0.186 ms** |
| Buffers | 1 344 | **121** |
| Predicado aislado | 8.733 ms | 0.262 ms |
| Políticas de `storage.objects` | 12.298 ms | 2.408 ms |
| Plan | Seq Scan + Sort | Index Scan sin Sort |

`ANALYZE` fue necesario para que el planificador usara el índice parcial nuevo: con `reltuples = -1` lo ignoraba.

## Prevención

- **Señal de recaída:** buffers por fila devuelta. Divide `Buffers: shared hit` entre `rows`; por encima de ~5 en una consulta indexada hay trabajo escondido.

  ```sql
  select left(query, 80), calls, rows,
         round((shared_blks_hit + shared_blks_read)::numeric / nullif(calls,0), 1) as buffers_por_llamada
  from extensions.pg_stat_statements where calls > 100 order by 4 desc limit 20;
  ```

- **NO "simplificar" el predicado devolviéndolo a la función.** Es el riesgo real de recaída: el predicado conjuntista **duplica lógica** que también vive en `private.can_access_diagram`, y a quien lea las políticas le parecerá redundancia evitable. No lo es: la duplicación compra un factor 33. La regla está en DEC-005 y la migración `0025` lo explica en su cabecera.

- **Regla derivada:** en políticas `SELECT` sobre tablas que se escanean, nunca una llamada a función; predicado conjuntista. En `UPDATE`/`DELETE`/`INSERT`, la función está bien — se evalúa sobre una fila.

- **Cualquier cambio de RLS exige la prueba de equivalencia** antes de aplicarlo: hash del conjunto de ids visibles, usuario por usuario, antes y después. Sin ella un cambio de política es una apuesta con datos de otros.

- **Medir siempre con `set local role authenticated`.** Es la trampa que hace invisible esta clase de problema: como superusuario todo va rápido.
