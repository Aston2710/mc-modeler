---
id: PLAN-016
titulo: Podar la publicacion de Realtime — 73% del CPU de la base
estado: todo
creado: 2026-08-10
cerrado:
aprobado_por:
relacionados: [PLAN-010, PLAN-012, context/rendimiento-base-de-datos.md]
---

# Podar la publicación de Realtime

## Objetivo

Reducir el consumo de CPU de la base, hoy dominado por Realtime, sin perder ninguna funcionalidad que el usuario perciba.

## El dato

Medido sobre 72 días de tráfico real (`pg_stat_statements`, ventana 2026-05-29 → 2026-08-09):

```
realtime.apply_rls sobre WAL
  llamadas         990 654
  tiempo total   5 180 539 ms   =  86 minutos de CPU
  media              5.229 ms
  buffers    1 560 540 484      ≈ 1 575 buffers (12.6 MB) por llamada
  porcentaje del tiempo total de la base:  73.28 %
```

Es **5.7× todo el resto de la aplicación junto**. Para contexto: la aplicación entera consume menos del 6 % del tiempo de CPU de la base.

## Por qué cuesta tanto

Por cada cambio en el WAL de una tabla publicada, Realtime evalúa las políticas RLS de ese cambio contra cada suscriptor para decidir a quién difundirlo. Con 5 tablas publicadas, cualquier `INSERT`/`UPDATE`/`DELETE` dispara el ciclo.

Tres agravantes concretos:

1. **`images` e `image_folders` tienen política `SELECT = true`.** El filtro no descarta a nadie, así que el trabajo por evento es el máximo posible y se difunde a todos.
2. **`notification_outbox` recibe `UPDATE`s** (`sent_at`, `read_at`, `attempts`): 103 actualizaciones sobre 62 filas, todas replicadas.
3. **`comment_threads` y `comment_replies`** tenían políticas que llamaban a `can_access_diagram()`. La migración `0025` abarató esa evaluación, pero cada evento de WAL sigue pagándola por suscriptor.

## Alcance

**Entra:** retirar de la publicación `supabase_realtime` las tres tablas que no la necesitan, y sustituir su sincronía por canales Broadcast explícitos desde el cliente.

**No entra:** `comment_threads` y `comment_replies`. Sí necesitan `postgres_changes` con filtro por diagrama: son datos que llegan de otro usuario y que el cliente no puede predecir.

## Precondiciones

**El cliente debe migrarse ANTES de tocar la publicación.** Si se aplica el SQL primero, la biblioteca de imágenes y el indicador de notificaciones dejan de actualizarse solos, sin ningún error visible. Es una regresión funcional silenciosa.

Reiniciar `pg_stat_statements` justo antes del cambio:

```sql
select extensions.pg_stat_statements_reset();
```

Sin eso no hay forma de medir el efecto: la ventana actual arrastra 72 días e incluye código que ya no existe (`yjs_documents`, el `SELECT *` con XML).

## Pasos

1. **`images` / `image_folders`.** El cliente ya sabe cuándo sube o borra una imagen; no necesita que la base se lo cuente vía WAL. Sustituir por un mensaje Broadcast en el canal del proyecto. Es la mayor fuente de ruido y la que menos filtra.
2. **`notification_outbox`.** Difundir el aviso por Broadcast desde el trigger, o dejar que el cliente consulte periódicamente — el índice parcial `notification_outbox_unsent_idx` ya existe y está hecho para eso.
3. Desplegar el cliente y **verificar que la sincronía sigue funcionando** antes de tocar nada en la base.
4. Aplicar el SQL:
   ```sql
   alter publication supabase_realtime drop table public.images;
   alter publication supabase_realtime drop table public.image_folders;
   alter publication supabase_realtime drop table public.notification_outbox;
   ```
5. Dejar correr una semana de tráfico real y comparar.

## Criterios de aceptación

- `pg_publication_tables` para `supabase_realtime` devuelve exactamente 2 filas
- Subir una imagen sigue apareciendo en la galería de otro usuario del mismo proyecto
- El indicador de notificaciones sigue actualizándose
- Los comentarios siguen llegando en vivo, sin cambios
- `realtime.apply_rls` baja de forma medible su porcentaje del tiempo total

## Riesgos

**Regresión funcional silenciosa** si se aplica el SQL antes que el cliente. Es el riesgo principal y se evita con el orden de los pasos.

**No hay estimación honesta de la ganancia.** Se puede razonar que quitar las tres tablas más ruidosas recorta el volumen de eventos en un orden de magnitud, pero no se puede cuantificar *a priori* sin reproducir el tráfico. Por eso el criterio de aceptación es "baja de forma medible" y no un porcentaje inventado.

**Broadcast no garantiza entrega**, igual que `postgres_changes`. Para la biblioteca de imágenes es aceptable: el peor caso es que un usuario vea la imagen nueva al refrescar. Para notificaciones también, porque el estado real vive en la tabla.

## Registro de ejecución

(se rellena durante la ejecución)

## Resultado

(se rellena al cerrar)
