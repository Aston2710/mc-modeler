# Auditoría de seguridad y control de acceso — hallazgos sin verificar

**Fecha del análisis:** 2026-10-06 · **Fecha del documento:** 2026-10-08
**Solicitado por:** santiagojmg28
**Procedencia:** análisis estático asistido por Claude sobre el repo. No lo produjo el equipo de desarrollo.
**Método:** lectura de SQL (sobre todo `supabase/migrations/20260813000000_baseline_produccion.sql`) y de código cliente, contrastados con los `.md` del proyecto. **No se ejecutó nada**: ni consultas, ni pruebas, ni cambios.

> **Estado de todo este documento: 🔍 por verificar.**
> Cada hallazgo es una hipótesis fundada en lectura de código, no un hecho comprobado. Ninguno debe tratarse como incidente (EXP) ni como corrección pendiente (PLAN) hasta que se verifique. Aplica la regla del proyecto: *mitigado ≠ resuelto*, y tampoco *sospechado = confirmado*.

## Alcance y límites

**Se leyó:** baseline SQL, `appscript/Code.gs`, `SupabaseProvider.ts`, `useCollab.ts`, `sharing.ts`, `SupabaseCommentBinding.ts`, `authStore.ts`, `ImportModal.tsx`, `bpmImport.ts`, `imageStorage.ts`, `SupabaseImageRepository.ts`, `vercel.json`, `index.html`, `vite.config.ts`, `supabase/config.toml`, y los docs de base de datos, planes y experiencias citados abajo.

**No se leyó:** todos los componentes de UI, las migraciones de `migrations_legacy/` salvo `0009` y `0012`, los `.xml` de arquitectura completos, ni las imágenes de `public/`.

**No es visible desde el repo:** la configuración de Auth y Realtime de producción (confirmación de correo, longitud mínima de contraseña, si Realtime exige autorización en canales). `supabase/config.toml` es solo del entorno local.

**Límite del baseline:** el baseline dice ser introspección de solo lectura de producción al 2026-08-13. En `supabase/migrations/` hay dos migraciones posteriores, revisadas el 2026-10-08:
- `20260813225135_bucket_thumbnails_5mb.sql`: solo sube el límite de tamaño del bucket `thumbnails`. No afecta a ningún hallazgo.
- `20260823000000_projects_doc_template.sql`: añade `projects.doc_template` y su grant de UPDATE por columna. No afecta a ningún hallazgo; su cabecera **confirma** que el UPDATE de `projects` se concede columna a columna (coherente con la migración `0028`).

Ninguna toca colaboradores, notificaciones, comentarios, perfiles ni Realtime. Queda sin responder si producción tiene cambios aplicados con la herramienta MCP que no dejaron archivo en el repo (EXP-016 documenta que ya pasó 6 veces). Comprobarlo exige consultar el historial de migraciones de producción.

## Resumen

| ID | Hallazgo | Severidad si se confirma | Categoría |
|---|---|---|---|
| SEG-01 | Cualquier usuario autenticado puede añadirse como colaborador | Alta | No documentado |
| SEG-02 | La bandeja de notificaciones podría usarse como relé de correo | Alta | No documentado |
| SEG-09 | El canal Realtime `diagram:<id>` no es privado | Media-alta | Contradice la documentación |
| SEG-03 | La autoría de los comentarios la decide el cliente | Media | No documentado |
| SEG-04 | `profiles.email` es editable por su dueño | Media | No documentado |
| SEG-10 | `profiles` es legible por `anon` | Media | Documentado con razonamiento incorrecto |
| SEG-05 | Un editor podría mover o borrar diagramas por API | Media-baja | No documentado |
| SEG-08 | Apps Script: dependencia operativa y de credenciales | Media-baja | No documentado |
| SEG-07 | Invitaciones por enlace sin caducidad ni validación de correo | Baja-media | No documentado |
| SEG-06 | Sin CSP ni cabeceras de seguridad | Baja-media | No documentado |

---

## A. Hallazgos que ningún documento recoge

### SEG-01 · Auto-alta como colaborador 🔍

**Evidencia.** La política `collab_insert` de `diagram_collaborators` permite insertar si `private.is_diagram_owner(diagram_id)` **o** `user_id = (SELECT auth.uid())`. `project_collab_insert` tiene la misma forma.

**Escenario.** La segunda condición solo comprueba quién es el usuario insertado, no sobre qué diagrama ni con qué rol. Un usuario autenticado que conozca el id de un diagrama podría insertar una fila a su nombre, con el rol que elija, y ganar acceso por `can_access_diagram`.

**Mitigantes.** Los ids son UUID, no adivinables. Aparecen, sin embargo, en URLs compartidas (`?d=<id>`), capturas y enlaces de notificaciones. Depende también de que el `CHECK` del rol y la política de SELECT no lo impidan, y de que producción no tenga un cambio posterior que lo corrija.

**Cómo verificar.** En el lab, con un usuario sin relación con el diagrama, intentar el insert por PostgREST con rol `editor` y luego con rol `owner`. Resultado esperado si el sistema es seguro: rechazo en ambos.

**Relación con lo documentado.** PLAN-011 P3-2 propone una política UPDATE sobre colaboradores, pero no menciona el INSERT.

### SEG-02 · Relé de correo a través de `notification_outbox` 🔍

**Evidencia.**
- La migración `0012` (y PLAN-004) afirma que un `grant update (read_at)` a nivel de columna limita a `authenticated` a tocar solo `read_at`, "evitando abuso del retry".
- El baseline concede `select, insert, update, delete, truncate, references, trigger` sobre todas las tablas de `public` a `anon`, `authenticated` y `service_role`, y solo revoca el UPDATE de tabla en `diagrams` y `projects`.
- EXP-015 documenta exactamente esta lección: con un `GRANT` de tabla, el grant por columna no limita nada.
- La política `notif_update_own` exige `recipient_id = auth.uid()`, pero no restringe qué columnas cambian.

**Escenario.** Un usuario podría actualizar sus propias filas del outbox cambiando `recipient_email`, `payload`, `sent_at` (a null) y `attempts` (a 0). `retryUnsent` en Apps Script selecciona filas con `sent_at is null`, `attempts < 5` y `created_at` de los últimos 2 días (máximo 100 por ejecución) y envía correo a `recipient_email` desde la cuenta Gmail de la aplicación. Sería un canal para enviar correo arbitrario con el remitente legítimo de la app.

**Mitigantes.** Solo afecta a filas propias creadas en los últimos 2 días. Hay que comprobar si producción tiene un revoke posterior del UPDATE de tabla.

**Cómo verificar.** `has_column_privilege` para `authenticated` sobre `notification_outbox` en `recipient_email`, `payload`, `sent_at` y `attempts`. Si alguna da `true`, probar el UPDATE real en el lab. Revisar además si `Code.gs` escapa el HTML de `payload` al construir el cuerpo del correo.

**Relación con lo documentado.** PLAN-004 y la migración `0012` dan por hecha una protección que EXP-015 enseña que no existe por sí sola.

### SEG-03 · Autoría de comentarios forjable 🔍

**Evidencia.** `SupabaseCommentBinding.ts` envía `author_id`, `author_name`, `created_by` y `created_by_name` desde el navegador. Las políticas `ct_insert` y `cr_insert` solo exigen `can_access_diagram`, sin comprobar que el autor sea quien inserta.

**Escenario.** Un colaborador podría escribir comentarios atribuidos a otra persona. Además, las menciones disparan correos con el nombre del supuesto autor.

**Cómo verificar.** En el lab, insertar un comentario con `author_id` de otro usuario. Revisar si hay un trigger que sobrescriba esos campos.

### SEG-04 · `profiles.email` editable 🔍

**Evidencia.** `profiles_update_self` usa `using (id = auth.uid())` sin `WITH CHECK`, y el grant de tabla cubre todas las columnas. `addCollaboratorByEmail` busca el perfil con `profiles.select('id').ilike('email', ...)`.

**Escenario.** Un usuario podría cambiar su propio email por el de otra persona y recibir invitaciones y menciones dirigidas a ella, o romper la búsqueda por email. Si `profiles` tiene otras columnas con significado (roles, flags), también serían editables.

**Cómo verificar.** `has_column_privilege` sobre `profiles.email` y demás columnas; intentar el UPDATE en el lab. Comprobar si `profiles.email` se sincroniza desde `auth.users` por trigger.

### SEG-05 · Restricciones de la papelera solo en la UI 🔍

**Evidencia.** PLAN-009 restringe la papelera al dueño, pero solo en la interfaz. El grant por columna de `diagrams` (migración `0028`) incluye `deleted_at`, `project_id`, `parent_diagram_id` y `folder_id`.

**Escenario.** Un editor con acceso a la API podría hacer soft-delete o mover un diagrama a otro proyecto, saltándose la restricción. Depende de si la política UPDATE de `diagrams` admite a los editores.

**Cómo verificar.** En el lab, como editor (no dueño), intentar `PATCH` de `deleted_at` y de `project_id`.

### SEG-06 · Sin CSP ni cabeceras de seguridad 🔍

**Evidencia.** `vercel.json` solo contiene `rewrites` a `/index.html`. `index.html` carga Google Fonts desde un dominio externo.

**Escenario.** No hay defensa en profundidad si aparece un XSS. Hay texto de usuario en etiquetas BPMN, comentarios y diagramas importados (`.bpmn` y `.bpm`).

**Nota.** `ImportModal.tsx` valida `.bpmn` con `includes('bpmn') || includes('definitions')`, y `bpmImport.ts` no limita el tamaño del archivo ni comprueba que `parseFloat` devuelva un número finito. Son riesgos de robustez del cliente, no de seguridad del servidor.

### SEG-07 · Invitaciones por enlace 🔍

**Evidencia.** `createInviteLink` usa `expiresInDays = null` por defecto (no caduca) y `crypto.randomUUID()`. `redeem_invite` y `redeem_project_invite` son `SECURITY DEFINER` y no validan que el correo del que canjea coincida con uno invitado.

**Escenario.** El enlace es un secreto al portador permanente. Si se reenvía o se filtra, cualquiera con cuenta gana acceso hasta que alguien lo revoque.

**Nota.** Que las invitaciones sean un enlace secreto sí está documentado. Lo que no consta es el valor por defecto sin caducidad.

### SEG-08 · Apps Script como dependencia operativa 🔍

**Evidencia.** `SECRET` y `SERVICE_KEY` (service_role) viven en Script Properties, fuera de la rotación y el control de Supabase. `deliver_notification` envía el secreto en el cuerpo del `net.http_post`. `retryUnsent` descarta en silencio lo que supera 2 días o 5 intentos.

**Riesgos.** Una sola cuenta de Google es punto único de fallo. Las cuotas de Gmail no constan en ningún documento. Quien edite el script o acceda a la cuenta de Google tiene la clave `service_role`. Un correo perdido no deja traza visible para el usuario.

**Relación con lo documentado.** D-02.4 de `auditoria-decisiones.md` ya propone retirar Apps Script del camino de correo con una Edge Function. Este hallazgo añade el argumento de seguridad.

---

## B. Documentado, pero contradicho o con razonamiento incorrecto

### SEG-09 · Canal Realtime no privado 🔍

**Qué dice la documentación.** `docs/addons/arquitectura.xml`: "RLS decide quién puede unirse al canal". PLAN-015 dice lo contrario: "RLS protege la base, no el canal de broadcast".

**Evidencia en código.** `SupabaseProvider.ts` crea `supabase.channel('diagram:${id}', { config: { presence: { key }, broadcast: { self: false } } })` sin `private: true`. El baseline no define políticas sobre `realtime.messages`. El bloqueo de edición para visores (`if (!canEdit(diagramId)) return` en `useCollab.ts`) existe solo en el cliente.

**Escenario.** Quien tenga la clave anónima (pública por diseño) y el id de un diagrama podría suscribirse a su canal, leer presencia y actualizaciones Yjs, o enviar actualizaciones propias. Los editores las aplicarían y su autoguardado las persistiría en `current_xml`, con lo que el servidor, que no valida contenido (DEC-001), las aceptaría.

**Mitigantes.** Id no adivinable. Falta confirmar si el proyecto Supabase tiene activada la autorización de Realtime.

**Cómo verificar.** En el lab, conectar un cliente con solo la clave anónima al canal de un diagrama y comprobar si recibe o puede emitir mensajes.

**Acción documental pendiente.** Corregir `arquitectura.xml` (afirmación inexacta) aunque el hallazgo no se confirme.

### SEG-10 · `profiles` legible por `anon` 🔍

**Qué dice la documentación.** `base-de-datos-inventario.md` indica que `profiles` es "no explotable por anon". PLAN-011 P3-3 (vista pública de perfiles) está registrado como pendiente y no aplicado.

**Evidencia.** `profiles_select_self` se declara `for select to public using (true)`, a pesar del nombre. Con la clave anónima se podrían listar emails y nombres de todos los usuarios (21 al momento del análisis).

**Valoración.** El razonamiento del inventario es incorrecto: el rol `public` incluye a `anon`. Que P3-3 esté pendiente es coherente, pero su urgencia se rebajó con una premisa errónea.

**Cómo verificar.** Consulta a `/rest/v1/profiles` con solo la clave anónima, en el lab.

---

## C. Documentado y coherente

No requieren acción nueva en este documento; ya constan en el repo:
- Servidor sin validación del contenido XML (DEC-001, D-02).
- Ventana de pérdida de unos 20–25 s por el autoguardado y guardados redundantes por N clientes.
- Borrador local (PLAN-036).
- Incidentes de colaboración (EXP-011 y relacionados).
- Imágenes públicas y exposición del respaldo (EXP-013, resuelto).
- Backups manuales (`operacion-scripts.md`).
- Protección de contraseñas filtradas desactivada (PLAN-010, PLAN-011).
- `pg_net` en `public` (PLAN-010).

---

## Protocolo de verificación

1. **Primero**, comprobar el historial de migraciones de producción contra los archivos del repo: puede haber cambios aplicados por MCP sin archivo (EXP-016) que alteren grants o políticas de las tablas implicadas.
2. **Entorno:** solo el lab (`npm run lab`), con roles reales (`anon`, `authenticated`) y JWT de usuarios de prueba. **Nunca contra datos reales.**
3. **Privilegios:** `has_table_privilege` y `has_column_privilege`, que son consultas de catálogo de solo lectura, también aceptables contra producción (así se hizo en PLAN-010).
4. **Pruebas de comportamiento:** intentos reales de INSERT/UPDATE/PATCH por PostgREST y de suscripción por Realtime, tal como lo haría un atacante con la clave anónima.
5. **Registrar el resultado** en este documento: cambiar 🔍 por ✅ (descartado) o ⚠️ (confirmado) y anotar la prueba hecha.
6. **Si se confirma:** abrir un PLAN en `plans/todo/` para la corrección. Solo hay EXP si hubo explotación o incidente real. Cualquier corrección debe pasar por lab antes de producción, como indica el baseline.

## Implicaciones para la conexión MCP

- EXP-016: `apply_migration` del MCP de Supabase ejecuta y registra el SQL pero **no escribe el `.sql`** en el repo. Una conexión MCP debe cerrar esa divergencia o el historial seguirá sin reproducir la base.
- SEG-01 a SEG-05 y SEG-09 dependen de grants y políticas. Un MCP que se conecte con credenciales amplias, sobre todo `service_role`, **saltaría esas barreras y ocultaría el problema** al probarlas.
- Propuesta de partida: modo solo lectura, rol propio de privilegios mínimos, sin acceso a `.env.local` ni a las claves de Apps Script, y cualquier cambio de esquema sujeto a aprobación explícita.
