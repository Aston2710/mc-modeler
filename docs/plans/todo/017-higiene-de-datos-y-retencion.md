---
id: PLAN-017
titulo: Higiene de datos y politicas de retencion
estado: todo
creado: 2026-08-10
cerrado:
aprobado_por:
auditado: 2026-08-21
relacionados: [EXP-012, PLAN-010, PLAN-011, PLAN-012, PLAN-013]
---

# Higiene de datos y políticas de retención

## Objetivo

Que ningún dato crezca sin límite ni sobreviva a lo que representa. Hoy hay tres acumulaciones sin política definida y una de ellas retiene material sensible.

Ninguna es urgente por espacio; la de Storage sí lo es por gobernanza del dato.

## Alcance

**Entra:** los ficheros huérfanos de Storage, la retención de `notification_outbox`, la retención de la papelera, y el cierre estructural para que el residuo de Storage no se vuelva a acumular.

**Entra también, corregido el 2026-08-21:** el paso 2 es un trigger `AFTER DELETE`, o sea **un cambio de esquema**. Este plan decía *"No entra: cambios de esquema"* y su propio paso 2 lo era — se habría colado en producción por una puerta que el documento declaraba cerrada. Sí sigue fuera cualquier cambio de *columnas* o de tablas.

**Este plan es dueño del barrido de huérfanos.** [PLAN-012](012-thumbnails-webp-y-entrega-segura.md) describía el mismo barrido, con la misma consulta y las mismas trampas; se quitó de allí el 2026-08-21. Se ejecuta en la misma tanda de laboratorio que [PLAN-011](011-remediacion-de-base-de-datos-pendiente.md), porque los dos son solo base de datos y comparten el ciclo de verificación.

## Estado medido

Dos mediciones: la original y la de la auditoría de consistencia. Los huérfanos no eran 76.

| Acumulación | 2026-08-10 | **2026-08-21** | Política actual |
|---|---|---|---|
| Objetos en `thumbnails` | — | **235, los 235 SVG, 11 MB** | ninguna |
| Huérfanos en `thumbnails` | 76 ficheros, 3 854 kB | **78 ficheros, 3 896 kB** (33 % del bucket) | ninguna |
| Diagramas sin thumbnail | — | 20 de 177 | — |
| Rutas de subproceso en el bucket | — | **0** | — |
| `notification_outbox` | 62 filas, 0 sin enviar, la más antigua del 2026-07-09 | por remedir al ejecutar | ninguna: nadie borra los enviados |
| Papelera `diagrams` | 6 elementos, el más antiguo del 2026-07-29 | **9** | ninguna: se acumula indefinidamente |
| Papelera `projects` | 0 | 0 | ninguna |

Sobre las **0 rutas de subproceso**: tanto este plan como PLAN-012 advertían de la convención `<parentId>/subproc/<elementId>`. Hoy **las 235 rutas del bucket son `<id>/thumb`** y ningún diagrama tiene `parent_diagram_id`. La advertencia se conserva como guarda del criterio de barrido —es gratis y protege si vuelven los subprocesos— pero no hay nada de eso que proteger ahora mismo.

## Precondiciones — decisiones de producto, no técnicas

1. **¿Cuánto vive algo en la papelera antes de desaparecer?** 30 días es lo habitual. Nadie lo ha decidido, así que hoy la respuesta es "para siempre".
2. **¿Cuánto se conserva el histórico de notificaciones enviadas?** Es un registro de qué se mandó y a quién.
3. **Quién ejecuta la poda.** `pg_cron` **no está instalado** en el proyecto — verificado. Hay dos vías: habilitarlo, o hacerlo desde el Apps Script que ya corre para las notificaciones. La segunda no añade dependencias.

## Pasos

### 1 · Barrido de los 78 huérfanos

> **Orden respecto a PLAN-012:** conviene barrer **antes** del backfill de thumbnails, para no gastar tiempo de render en objetos que van a desaparecer. No es un requisito: el script del backfill itera sobre `diagrams`, no sobre el bucket, así que los huérfanos le son invisibles de todas formas.

`storage.protect_delete()` bloquea el `DELETE` por SQL a propósito, y hace bien: `storage.objects` es solo el índice, borrar la fila deja el blob en S3 invisible y facturado. Se cambiarían 76 huérfanos visibles por 76 invisibles.

Vías correctas: panel de Supabase, o script con `service_role` que llame a la Storage API. El proyecto ya tiene convención de `scripts/*.mjs` (fuera del repo, ver `context/operacion-scripts.md`).

**Listar antes de borrar, y revisar la lista.** Dos trampas documentadas en EXP-012:
- los diagramas en papelera **sí** necesitan su thumbnail → filtrar contra `diagrams` completa, no solo los vivos
- los thumbnails de subproceso usan `<parentId>/subproc/<elementId>`, no `<id>/thumb`

```sql
select o.name, pg_size_pretty((o.metadata->>'size')::bigint) as peso
from storage.objects o
where o.bucket_id = 'thumbnails'
  and split_part(o.name, '/', 1) not in (select id::text from diagrams)
order by (o.metadata->>'size')::bigint desc;
```

### 2 · Cierre estructural del residuo de Storage

Trigger `AFTER DELETE` en `diagrams` que encole el borrado del objeto, en vez de depender del cliente. Es lo que cubre las cascadas —`owner_id → auth.users ON DELETE CASCADE` y `parent_diagram_id`—, donde el navegador nunca participa.

El patrón ya existe en el proyecto: `notification_outbox` + `pg_net` + `private.deliver_notification`. Mismo esquema, encolando una llamada a la Storage API.

Cuidado con lo aprendido en la auditoría: **la tabla de cola no debe entrar en la publicación de Realtime** (ver PLAN-016), y el trigger debe envolver el fallo en `EXCEPTION WHEN OTHERS THEN NULL` para que un error de red nunca impida borrar un diagrama.

### 3 · Retención de `notification_outbox`

Purgar las filas con `sent_at` no nulo y más antiguas que el plazo que se decida. La consulta es trivial; la decisión es de la precondición 2.

### 4 · Retención de la papelera

Purgado definitivo de `diagrams`/`projects` con `deleted_at` anterior al plazo. **Debe borrar también el thumbnail** — si el paso 2 está hecho, el trigger se encarga solo.

Aviso al usuario antes de que algo desaparezca: hoy la papelera promete implícitamente que el dato sigue ahí.

## Criterios de aceptación

- Cero objetos en `thumbnails` cuyo primer segmento no corresponda a un diagrama existente
- Tras borrar una cuenta de prueba con diagramas, cero residuo nuevo en Storage
- `notification_outbox` y la papelera tienen poda automática con plazo documentado
- La poda no borra thumbnails de diagramas que siguen en papelera
- La poda no toca los thumbnails de subproceso por confundir la convención de ruta

## Riesgos

**Borrar de más.** Es el riesgo real: un filtro mal escrito destruye thumbnails vivos. Mitigación: listar y revisar antes de borrar, y empezar por los huérfanos evidentes.

**Borrar la fila de `storage.objects` en vez del objeto.** Deja el blob huérfano en S3, peor que el estado actual porque es invisible. Por eso el paso 1 exige la Storage API y no SQL.

**Purgar la papelera sin aviso.** Un usuario que borró algo hace 31 días y esperaba recuperarlo. Mitigación: avisar en la UI de la papelera cuánto tiempo queda.

## Registro de ejecución

(se rellena durante la ejecución)

## Resultado

(se rellena al cerrar)
