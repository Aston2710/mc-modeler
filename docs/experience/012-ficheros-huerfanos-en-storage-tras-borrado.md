---
id: EXP-012
titulo: Los thumbnails sobreviven al borrado de su diagrama y quedan inalcanzables
estado: activo
severidad: media
fecha_deteccion: 2026-08-09
fecha_cierre:
componentes: [SupabaseRepository.ts, storage.objects, diagrams]
relacionados: [PLAN-017, PLAN-010]
---

# Los thumbnails sobreviven al borrado de su diagrama y quedan inalcanzables

## Síntoma

El bucket `thumbnails` contiene más objetos que diagramas existen. Medido el 2026-08-09:

```
thumbnails de diagramas vivos       116
thumbnails de diagramas en papelera   2
thumbnails SIN diagrama en la tabla  76   ← 3 854 kB
```

Nadie lo había notado porque no hay ninguna vista que compare Storage contra la base.

## Impacto

**Retención de datos no intencionada.** Un thumbnail es el SVG del diagrama: contiene el nombre de cada tarea, cada carril y cada compuerta como texto. Son 3 854 kB de representación visual de procesos internos que alguien creyó haber eliminado.

**Y no se pueden borrar desde la aplicación.** La política de Storage ata el permiso al diagrama:

```sql
thumbnails_delete: bucket_id='thumbnails'
                   AND ((storage.foldername(name))[1])::uuid IN (diagramas que puedo editar)
```

Si el diagrama no existe, el predicado es falso para todo el mundo. Los ficheros son **inalcanzables incluso para su dueño**: no se pueden leer ni borrar salvo con `service_role`.

Impacto de coste: despreciable a esta escala. El problema es de gobernanza del dato, no de espacio.

## Reproducción

Determinista, dos caminos:

**1. Borrado en cascada** — el principal. Las FKs propagan el borrado sin que el navegador intervenga:

```
diagrams.owner_id          → auth.users(id)  ON DELETE CASCADE
diagrams.parent_diagram_id → diagrams(id)    ON DELETE CASCADE
```

Eliminar una cuenta de `auth.users` borra sus diagramas dentro de Postgres. El cliente no se entera y el fichero se queda. Lo mismo al purgar un diagrama padre con subprocesos.

**2. Fallo parcial del borrado en dos pasos** — `SupabaseRepository.ts:327-330`:

```ts
const { error } = await this.sb.from('diagrams').delete().eq('id', id)
if (error) throw error
await this.sb.storage.from(THUMB_BUCKET).remove([thumbPath(id)])
```

Dos operaciones sin transacción común. La fila se borra primero; si la segunda falla —red, sesión caducada, pestaña cerrada— ya no queda a quién reclamarle.

## Causa raíz

**La limpieza de Storage vive solo en el cliente, y el borrado de filas puede ocurrir sin cliente.**

Es un desajuste de responsabilidad: la integridad referencial entre `diagrams` y `storage.objects` está implementada en TypeScript, mientras que una de las dos partes (la tabla) tiene borrado en cascada dentro de la base. Postgres no sabe que ese fichero existe; el navegador no sabe que la fila desapareció.

El orden del código además garantiza que, ante fallo, el residuo sea el fichero y no la fila —que es el orden menos malo, pero sigue dejando residuo.

## Solución planteada

**Barrido puntual** de los 76 actuales. `storage.protect_delete()` bloquea `DELETE` por SQL a propósito:

```
RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
  USING HINT = 'This prevents accidental data loss from orphaned objects.'
```

Con razón: `storage.objects` es solo el índice; borrar la fila deja el blob real en S3, invisible y facturado. Se cambiarían 76 huérfanos visibles por 76 invisibles. Las vías correctas son el panel de Supabase o un script con `service_role` que llame a la Storage API.

**Cierre estructural** para que no se vuelva a acumular: trigger `AFTER DELETE` sobre `diagrams` que encole el borrado del objeto, en vez de depender del cliente. Cubre también las cascadas, que es donde el cliente nunca llega. El patrón ya existe en el proyecto: `notification_outbox` + `pg_net`.

Detalle en PLAN-017.

## Solución realizada

Nada todavía. Estado `activo`.

## Verificación

Pendiente. Criterio: tras el barrido, cero objetos en `thumbnails` cuyo primer segmento de ruta no corresponda a un diagrama existente; y tras borrar una cuenta de prueba con diagramas, cero residuo nuevo.

## Prevención

- **Consulta de vigilancia** (solo lista, no borra):

  ```sql
  select o.name, pg_size_pretty((o.metadata->>'size')::bigint) as peso
  from storage.objects o
  where o.bucket_id = 'thumbnails'
    and split_part(o.name, '/', 1) not in (select id::text from diagrams)
  order by (o.metadata->>'size')::bigint desc;
  ```

- **Cuidado al barrer, dos trampas:**
  1. Los diagramas en papelera (`deleted_at` no nulo) **sí necesitan su thumbnail**. El filtro debe consultar `diagrams` completa, no solo los vivos.
  2. Los thumbnails de subproceso usan otra convención: `<parentId>/subproc/<elementId>` (`SupabaseRepository.ts:403`). Un barrido que asuma `<id>/thumb` los trataría mal.

- **Regla derivada:** cuando un dato viva en dos sistemas (tabla y bucket) y uno de ellos tenga borrado en cascada, la limpieza no puede vivir en el cliente. El cliente no participa en las cascadas.
