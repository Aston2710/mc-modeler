---
documento: normalizacion
vigencia: vigente
actualizado: 2026-08-09
deriva_de: [DEC-006]
---

# 03 — Análisis de normalización

Evaluación tabla por tabla contra 1NF, 2NF, 3NF, BCNF, 4NF y 5NF, seguida de la recomendación de forma normal objetivo.

---

## 1. Veredicto por tabla

| Tabla | 1NF | 2NF | 3NF | BCNF | 4NF | Nota |
|---|:--:|:--:|:--:|:--:|:--:|---|
| `profiles` | ✅ | ✅ | ✅ | ✅ | ✅ | limpia |
| `projects` | ✅ | ✅ | ✅ | ✅ | ✅ | limpia |
| `folders` | ✅ | ✅ | ✅ | ✅ | ✅ | limpia (y muerta) |
| `diagrams` | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | 3 atributos derivados |
| `diagram_collaborators` | ✅ | ✅ | ✅ | ✅ | ✅ | redundancia inter-tabla |
| `project_collaborators` | ✅ | ✅ | ✅ | ✅ | ✅ | ídem |
| `diagram_invites` | ✅ | ✅ | ✅ | ✅ | ✅ | 2 claves candidatas, ambas OK |
| `project_invites` | ✅ | ✅ | ✅ | ✅ | ✅ | ídem |
| `comment_threads` | ⚠️ | ✅ | ⚠️ | ⚠️ | ✅ | `anchor` jsonb + `created_by_name` |
| `comment_replies` | ❌ | ✅ | ⚠️ | ⚠️ | ❌ | `mentions uuid[]` + `author_name` |
| `images` | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | espejo de `storage.objects` |
| `image_folders` | ✅ | ✅ | ✅ | ✅ | ✅ | limpia |
| `notification_outbox` | ⚠️ | ✅ | ❌ | ❌ | ✅ | `recipient_email` + `payload` jsonb |
| `notification_prefs` | ✅ | ✅ | ✅ | ✅ | ✅ | limpia |

**Estado global: el esquema está en 3NF con seis excepciones**, de las cuales cinco son desnormalizaciones deliberadas y una es redundancia gratuita.

---

## 2. 1NF — atomicidad

### ❌ Violación real: `comment_replies.mentions uuid[]`

```sql
mentions uuid[] NOT NULL DEFAULT '{}'::uuid[]
```

Un atributo multivaluado en una columna. Estrictamente, viola 1NF. La forma normalizada sería:

```sql
create table comment_reply_mentions (
  reply_id uuid references comment_replies(id) on delete cascade,
  user_id  uuid references auth.users(id) on delete cascade,
  primary key (reply_id, user_id)
);
```

**Consecuencia práctica de mantener el array:** no hay FK sobre los elementos. Si se borra un usuario, su UUID queda como referencia colgante dentro de `mentions`. El trigger `enqueue_mention_notifications` lo maneja bien (hace `join profiles p on p.id = m.uid`, así que los huérfanos simplemente no generan notificación), pero el dato queda sucio para siempre.

**Recomendación: mantener el array.** Razones: (a) el array se lee siempre completo junto con su reply, nunca se consulta "¿quién fue mencionado en algo?"; (b) normalizarlo añade un JOIN a una tabla que también estaría bajo RLS, y en este sistema cada JOIN bajo RLS es caro (ver [02](rendimiento-base-de-datos.md)); (c) `uuid[]` en Postgres soporta índices GIN si algún día hace falta buscar por mención. La violación de 1NF es teórica y el costo de arreglarla es real.

### ⚠️ jsonb: `comment_threads.anchor`, `notification_outbox.payload`

Formalmente son atributos no atómicos. En la práctica son **el uso correcto de jsonb**:

- `anchor` guarda la posición del comentario en el diagrama (`elementId`, `elementLabel`, coordenadas). Su forma depende del tipo de elemento BPMN anclado y evoluciona con el modelador. Normalizarlo obligaría a una migración cada vez que cambie el anclaje.
- `payload` es la carga del email de notificación. Su forma depende de `kind`. Modelarlo relacionalmente exigiría una tabla por tipo, o una tabla EAV, que es peor que jsonb en todos los ejes.

Ambos son **datos opacos para la base**: nunca se consulta `WHERE anchor->>'x' > 100`. Se leen enteros y se interpretan en el cliente. Ese es exactamente el caso de uso para el que jsonb existe. No tocar.

---

## 3. 2NF — dependencia funcional completa de la clave

**Sin violaciones.** Las dos únicas claves compuestas son `diagram_collaborators(diagram_id, user_id)` y `project_collaborators(project_id, user_id)`, y sus atributos no-clave (`role`, `invited_by`, `created_at`) dependen de la clave **completa**: el rol es del par, no del diagrama ni del usuario por separado. Correcto.

---

## 4. 3NF — dependencias transitivas

### ❌ `notification_outbox.recipient_email`

```
recipient_id → profiles.email
recipient_id → recipient_email    ← transitiva
```

Dependencia transitiva de libro. Si un usuario cambia su email, las filas históricas del outbox conservan el viejo.

**Veredicto: dejarla, y es correcto que exista.** Un outbox es un registro de *lo que se envió*, no de *a quién pertenece la dirección hoy*. Si el email cambia después del envío, el registro histórico debe seguir diciendo a dónde fue el correo. Esto no es desnormalización por descuido, es **inmutabilidad de evento**. La misma lógica que se aplica a guardar el precio en una línea de factura en vez de mirar el precio actual del producto.

Lo único que le falta es que sea explícito. Añadir un `COMMENT ON COLUMN` que diga "snapshot deliberado, no sincronizar con profiles.email" evita que alguien lo "arregle" dentro de dos años.

### ❌ `comment_threads.created_by_name` y `comment_replies.author_name`

```
created_by → profiles.display_name
created_by → created_by_name      ← transitiva
```

Mismo caso, misma justificación parcial: el comentario conserva el nombre con el que se firmó. Pero aquí el argumento es **más débil** que en el outbox, porque un comentario sí es una entidad viva: si alguien cambia su nombre para mostrar, es razonable que sus comentarios lo reflejen.

Hay además un motivo técnico a favor de mantenerlo: `comment_replies.author_id` es nullable y su FK es `NO ACTION`. El snapshot es el plan B cuando el autor ya no está. Y evita un JOIN con `profiles` —bajo RLS— en cada carga de hilo.

**Veredicto: mantener, pero documentar como snapshot.** El default `'Usuario'` confirma que ya se diseñó pensando en el caso "autor desconocido".

### ⚠️ `diagrams.element_count`

Derivado de `current_xml`. Es un caché: contar elementos exige parsear el XML, cosa que la base no puede hacer y que el cliente ya hace al guardar. Sin él, la lista de diagramas no podría mostrar el número de elementos sin traer los 3 764 kB de XML — que es precisamente el problema que `LIST_COLUMNS` resuelve.

**Veredicto: mantener. Es un caché justificado y barato.** Riesgo: puede desincronizarse si alguien escribe `current_xml` sin actualizarlo. Se cierra con un CHECK imposible, o simplemente aceptando que el cliente es el único escritor.

### ❌ `diagrams.thumbnail_path` — esta sí es redundancia gratuita

```
id → thumbnail_path              (thumbnail_path = id || '/thumb', SIEMPRE)
```

Verificado sobre los datos: **119 filas con thumbnail, 0 excepciones** al patrón. Y en el código, `SupabaseRepository.ts:9`:

```ts
const thumbPath = (id: string) => `${id}/thumb`
```

La columna no aporta información: el path se puede calcular. Lo único que codifica de verdad es *si existe o no* un thumbnail (13 filas en NULL).

**Veredicto: es una violación de 3NF sin contrapartida.** Sustituir por `has_thumbnail boolean not null default false`. Beneficios: (a) el path deja de poder desincronizarse del bucket; (b) ~40 bytes menos por fila; (c) el tipo expresa la semántica real. Costo: una migración con backfill trivial y tocar 6 sitios de `SupabaseRepository`. Ver `supabase/migrations/0021`–`0029` (aplicado en `supabase/migrations/0021`–`0029`).

### ⚠️ `images.storage_path`, `mime`, `size_bytes`

Los tres son espejo de `storage.objects` (que guarda `metadata->>'size'`, `metadata->>'mimetype'` y la propia `name`). Es duplicación entre dos sistemas.

**Veredicto: mantener.** `storage.objects` es una tabla del sistema de Supabase; acoplar el modelo aplicativo a su estructura interna es peor que duplicar tres campos. Además la galería necesita listar imágenes con tamaño y tipo sin hacer un JOIN a `storage`, que tiene su propio RLS.

Nota: `storage_path` **sí** es información real y no derivable — el path lo genera el repositorio con un esquema que no es una función pura del `id` (a diferencia de `thumbnail_path`). No confundir los dos casos.

### ❌ Redundancia inter-tabla: `diagrams.owner_id` ↔ `diagram_collaborators(role='owner')`

El trigger `diagrams_add_owner` inserta automáticamente al dueño como colaborador con `role='owner'`. Resultado medido: **129 de las 156 filas de `diagram_collaborators` (83%) son duplicados exactos de `diagrams.owner_id`.**

Esto no viola ninguna forma normal formalmente —son tablas distintas— pero es **redundancia de estado con dos fuentes de verdad**. Si alguien cambiase `diagrams.owner_id` sin tocar la fila de colaborador, quedarían inconsistentes. Nada lo impide hoy.

Y es la razón por la que `can_access_diagram()` tiene 4 ramas donde bastarían 3: la primera (`d.owner_id = auth.uid()`) es un subconjunto de la segunda.

**Veredicto: es deliberado y lo recomiendo mantener.** El motivo es que unifica la consulta "¿qué diagramas veo?" en una sola tabla y permite que el dueño aparezca en la lista de colaboradores de la UI sin un UNION. Pero conviene:
- documentar que `diagram_collaborators` es la vista materializada de la autorización y `diagrams.owner_id` es la fuente de verdad de la propiedad;
- proteger `owner_id` contra UPDATE — la política `diagrams_update` usa `can_edit_diagram()`, que permite a un editor actualizar la fila, y **nada en el `WITH CHECK` impide que cambie `owner_id`**. El código lo evita conscientemente (`SupabaseRepository.ts:151-152`: *"No usamos upsert: en un UPDATE incluiría owner_id y un editor podría robar la propiedad"*), pero es una defensa en el cliente, no en la base. Ver [04](../plans/todo/011-remediacion-de-base-de-datos-pendiente.md#p1-2).

---

## 5. BCNF

Ninguna tabla tiene un determinante que no sea superclave, salvo las mismas dependencias transitivas ya listadas. `diagram_invites` y `project_invites` tienen dos claves candidatas (`id` y `token`), ambas simples y sin solapamiento — el caso clásico que rompe BCNF (claves candidatas compuestas y solapadas) no se da aquí.

**Las tablas limpias en 3NF ya están en BCNF.** No hay trabajo pendiente.

---

## 6. 4NF y 5NF

**4NF:** la única dependencia multivaluada es `comment_replies.mentions`, discutida arriba. Descomponerla daría 4NF; la recomendación es no hacerlo.

**5NF:** no existe ninguna relación ternaria en el esquema. Las tablas de asociación son binarias (`diagrama × usuario`, `proyecto × usuario`) con atributos propios (`role`), lo que las hace entidades por derecho propio, no candidatas a descomposición por dependencia de reunión. **5NF no aplica.**

---

## <a id="recomendacion"></a>7. Recomendación: 3NF con excepciones documentadas

### La respuesta corta

**Quedarse en 3NF. No subir a BCNF (ya se cumple donde importa), no ir a 4NF ni 5NF.** Y de las seis excepciones actuales, corregir **una** (`thumbnail_path`) y **documentar formalmente** las otras cinco.

### Por qué 3NF y no menos

Bajar de 3NF —desnormalizar más, por ejemplo cachear `owner_email` en `diagrams` o el conteo de comentarios— no compra nada aquí, porque **el costo dominante de este sistema no son los JOINs**. Está medido en [02](rendimiento-base-de-datos.md): la base entera cabe en `shared_buffers`, el ratio de aciertos es 100%, y todos los JOINs de la aplicación son entre tablas de decenas de filas. Un JOIN aquí cuesta microsegundos. Desnormalizar para evitarlos es pagar riesgo de inconsistencia a cambio de nada.

### Por qué no BCNF/4NF/5NF

Este es el punto importante y va contra el instinto académico.

**En un sistema con RLS por fila, cada tabla adicional es un multiplicador de costo, no un divisor.** Cuando se normaliza más, se sustituye "una columna redundante" por "un JOIN a una tabla nueva". En Postgres normal ese JOIN cuesta un *index lookup*. Aquí cuesta un *index lookup* **más la evaluación completa de la política RLS de la tabla nueva**, que en este esquema significa hasta 4 subconsultas `EXISTS`. El benchmark lo cuantifica: 0.0449 ms sin RLS contra 8.37 ms con RLS sobre la misma tabla de 132 filas. **Factor 186.**

Normalizar `comment_replies.mentions` a 4NF, por ejemplo, convertiría una lectura de array —gratis, viaja con la fila— en un JOIN a `comment_reply_mentions`, que necesitaría su propia política RLS, que a su vez tendría que preguntar por el hilo, que preguntaría por el diagrama, que llamaría a `can_access_diagram()`. Se habría cambiado un array de UUIDs por una cadena de tres saltos bajo autorización. Eso es **sobrenormalizar**: pureza teórica pagada con latencia real y con superficie de política que mantener.

La regla operativa para este proyecto:

> Normaliza hasta 3NF por defecto. Desnormaliza solo cuando el dato sea (a) un snapshot inmutable de un evento, (b) un caché de algo caro de recalcular, o (c) opaco para la base. Documenta cada excepción en el propio esquema con `COMMENT ON COLUMN`. Nunca desnormalices "por rendimiento" sin una medición previa.

Las cinco excepciones actuales encajan exactamente en esas tres categorías:

| Excepción | Categoría | Acción |
|---|---|---|
| `notification_outbox.recipient_email` | (a) snapshot de evento | documentar |
| `comment_threads.created_by_name` | (a) snapshot de evento | documentar |
| `comment_replies.author_name` | (a) snapshot de evento | documentar |
| `diagrams.element_count` | (b) caché de cómputo caro | documentar |
| `comment_replies.mentions`, `anchor`, `payload` | (c) opacos para la base | documentar |
| **`diagrams.thumbnail_path`** | **ninguna — es derivable puro** | **corregir → `has_thumbnail`** |

### El único caso donde subir de nivel sí valdría la pena

Si algún día se quiere consultar "todas las menciones a un usuario, en todos los diagramas" —una bandeja de menciones, no de notificaciones— entonces `comment_reply_mentions` (4NF) se justifica, porque el patrón de acceso cambia: pasarías a consultar por `user_id`, y un array no se indexa bien para eso sin GIN. Mientras el único acceso siga siendo "dame las menciones de este reply", el array gana.

Ese es el criterio general: **la forma normal correcta depende del patrón de acceso, no del número.** 3NF es el punto de equilibrio para este esquema porque el acceso es lectura-pesada, jerárquico (usuario → proyecto → diagrama → hilo → reply) y siempre desciende por la jerarquía. Nunca se consulta de lado ni de abajo hacia arriba, que es donde la sobrenormalización deja de doler y empieza a pagar.

---

## 8. Deuda estructural no relacionada con formas normales

Cosas que un DBA marca aunque no sean violaciones de normalización:

**`folders` está muerta.** 0 filas, 2 índices, una FK entrante desde `diagrams.folder_id` (que también está sin uso, su índice tiene 2 escaneos). La funcionalidad se sustituyó por `projects`. Borrar la tabla y la columna, o al menos documentar por qué siguen ahí.

**Inconsistencia en el destino de las FKs de usuario.** `diagrams.owner_id`, `projects.owner_id`, `*_collaborators.user_id` apuntan a `auth.users(id)`. Pero `notification_outbox.recipient_id` y `notification_prefs.user_id` apuntan a `profiles(id)`. Ambas cadenas terminan en el mismo sitio (`profiles.id` es FK a `auth.users.id`), así que no hay bug — pero elegir un solo destino haría el modelo más legible. `profiles` es la mejor elección para el esquema aplicativo: `auth.users` es una tabla del sistema y depender de ella acopla el modelo a Supabase.

**Sin restricción de unicidad en nombres.** Nada impide dos diagramas con el mismo nombre en el mismo proyecto, ni dos proyectos con el mismo nombre para el mismo dueño. Puede ser deliberado (draw.io tampoco lo impide). Vale la pena decidirlo explícitamente en vez de que sea un accidente.

**`schema_version` existe pero nunca se usa para nada visible.** Está en `diagrams` con default 1. Es previsión correcta para migraciones futuras del formato BPMN. Solo asegurarse de que hay un plan de qué hacer cuando llegue el 2.
