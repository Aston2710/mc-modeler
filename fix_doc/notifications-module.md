# Módulo de notificaciones por correo

Fecha: 2026-07-08. Alcance: notificaciones por email para eventos de
colaboración (invitaciones canjeadas, menciones en comentarios), más el
etiquetado `@` en comentarios que las dispara.

Este documento cubre: (1) qué se implementó y por qué, (2) el estándar de
industria para notificaciones y dónde queda nuestro v1, (3) el plan de
evolución.

---

## 1. Qué se implementó

### Arquitectura: outbox + webhook a Apps Script (sin edge functions)

```
Evento (server-side)                     Entrega
─────────────────────                    ───────
redeem_invite RPC ─────┐
redeem_project_invite ─┼─► notification_outbox ─trigger pg_net POST─► Apps Script Web App
trigger comment_replies┘         (tabla)                                   │
                                                                    GmailApp.sendEmail
                                                                           │
                                                              PATCH sent_at (REST, service key)
```

Decisiones:

- **Eventos nacen en Postgres, no en el cliente.** Los RPCs `redeem_*` ya son
  `security definer`; los comentarios entran por INSERT con RLS. Encolar ahí
  (no desde el navegador) hace imposible que un cliente falsee o suprima
  notificaciones. Toda la lógica de "quién recibe" vive en SQL versionado.
- **Outbox** (`notification_outbox`) da auditoría, reintentos y dedupe. Si el
  envío falla, la fila queda con `error` y `sent_at` null; el time-trigger de
  Apps Script la repesca.
- **Sin edge functions.** El Database Webhook (pg_net) apunta directo al Web App
  de Apps Script. Se evaluó Gmail API (OAuth pesado), Resend (servicio externo)
  y edge function Deno (stack nuevo fuera del repo). Apps Script gana para v1:
  envía desde una cuenta Gmail real sin OAuth ni consola de Google, ~20-60
  líneas, gratis, buena entregabilidad (SPF/DKIM de Google).
- **Cuenta emisora neutral** (`modeler.notifications@gmail.com`), independiente
  de los dominios de los usuarios (`@mayoreo`, `@febeca`, etc.). Migrable en ~15
  min: pegar `Code.gs`, configurar Script Properties, re-deploy, actualizar
  `notification_config`. Ver `appscript/README.md`.

### Los 3 tipos de evento

| kind | Se dispara cuando | Destinatarios |
|---|---|---|
| `invite_redeemed_diagram` | alguien NUEVO canjea link de diagrama | todos los colaboradores del diagrama, menos el que entra |
| `invite_redeemed_project` | alguien NUEVO canjea link de proyecto | todos los colaboradores del proyecto, menos el que entra |
| `comment_mention` | comentario con `@usuario` | cada mencionado con acceso, menos el autor |

**Regla anti-spam de invitaciones:** el RPC usa
`get diagnostics inserted = row_count` tras el `insert ... on conflict do
nothing`. Solo encola si `inserted > 0` — un re-canje de alguien que ya era
colaborador no notifica.

**Seguridad de menciones:** el trigger valida cada mencionado con
`private.user_can_access_diagram(d_id, uid)` antes de encolar. Un cliente no
puede usar el array `mentions` para mandar contenido a terceros sin acceso.

### Migraciones

- **0009** — `notification_outbox` (RLS sin policies = invisible/inmutable para
  clientes), columna `mentions uuid[]` en `comment_replies`,
  `private.notification_config` (singleton url+secret, schema privado no
  expuesto por PostgREST), trigger de entrega pg_net, RPCs `redeem_*`
  modificados, trigger de menciones.
- **0010** — `collab_select` / `project_collab_select` ahora dejan ver la lista
  de colaboradores a cualquier colaborador (antes solo al owner) — necesario
  para el autocomplete de `@`.

### Frontend

- `MentionTextarea.tsx` — textarea con dropdown de `@` (anclado bajo el campo,
  no junto al caret — decisión de simplicidad), navegación teclado, `MentionText`
  para resaltar `@Nombre`, `activeMentions()` para filtrar menciones que el
  usuario borró antes de enviar.
- `CommentsPanel.tsx` — integrado en ambos composers; carga colaboradores
  (diagrama + proyecto) para el autocomplete.
- `App.tsx` — deep link `?d=<diagramId>` (los correos apuntan ahí; sobrevive al
  redirect de login vía localStorage, mismo patrón que los invites).

### El secret

Bearer token compartido entre `notification_config.secret` (Supabase) y la
Script Property `SECRET` (Apps Script). Apps Script valida cada POST porque el
Web App es de acceso público. Va en el body JSON, no en header (Apps Script
`doPost` no expone headers custom); sobre HTTPS es seguro. Debe generarse con
CSPRNG real (`openssl rand -hex 32`), no con hash de una frase inventada —
hashear no crea entropía, solo la disfraza.

---

## 2. Estándar de industria vs nuestro v1

Referencias: Google Docs/Drive, Figma, GitHub, Notion, Linear, YouTube.

### Patrones establecidos

1. **Deep link al recurso EXACTO, con foco.** El correo es un puntero; el botón
   deja al usuario en el sub-objeto puntual, no en el contenedor. Google Docs
   abre el doc con el hilo de comentario resaltado (`?disco=<id>`); Figma hace
   zoom al pin; GitHub ancla `#issuecomment-<id>`.
2. **Continuar tras login.** Sin sesión → login → sigue al destino (`?next=` /
   stash en cliente). Nunca pierde el destino.
3. **Sin acceso → mensaje claro** ("Solicitar acceso"), nunca fallo silencioso.
4. **Centro de notificaciones in-app (campanita)** — el backbone. Correo = push;
   campana = lista durable. Ambos van al mismo deep link. Click marca leído.
5. **Preferencias + unsubscribe** por usuario (qué eventos, email/in-app/ambos,
   frecuencia). Link de baja en cada correo, a menudo requisito legal (CAN-SPAM).
6. **Batching / digest** para no inundar (agrupar N eventos, digest por ventana).

### Dónde queda nuestro v1

| Aspecto | Estándar | v1 |
|---|---|---|
| Continuar tras login | ✅ | ✅ |
| Deep link al recurso | enfoca sub-objeto | ⚠️ abre diagrama, no el comentario |
| Sin acceso → aviso | ✅ | ❌ silencioso (guard sin toast) |
| Centro in-app (campana) | ✅ backbone | ❌ no existe |
| Preferencias/unsubscribe | ✅ (a veces legal) | ❌ manda siempre |
| Batching/digest | ✅ | ❌ 1 correo por evento |
| Invite → landing | recurso/proyecto | ⚠️ diagrama sí, proyecto → home |

**Veredicto:** v1 es correo transaccional correcto en lo básico (evento
server-side, outbox, deep link, auth-continue) pero le faltan las dos piezas que
definen una solución madura: **centro in-app** y **preferencias/unsubscribe**.
El diseño outbox deja ambas abiertas sin rehacer nada — la tabla puede volverse
la fuente de la campanita.

---

## 3. Evolución — 4 fases (IMPLEMENTADAS 2026-07-09)

Todas aplicadas a la BD remota y verificadas (typecheck + build + 59 tests).

### Fase 1 — Deep link enfocado al comentario

Cierra el gap donde "Ver comentario" abría solo el diagrama.

- **Migración 0011**: `threadId` agregado al payload del trigger de menciones.
- **Apps Script**: `mUrl = base + '/?d=' + diagramId + '&thread=' + threadId`.
- **App.tsx**: lee `?thread=`, y vía `activateThreadWhenReady()`
  (`src/lib/notificationNav.ts`) espera a que el binding cargue el hilo →
  `setPanelOpen(true)` + `setActiveThread`. Fallback timeout 20s. Fallback sin
  acceso: toast `notifications.noAccess` + limpia el thread pendiente.

### Fase 2 — Centro de notificaciones in-app (campanita)

`notification_outbox` es ahora también la fuente de la bandeja.

- **Migración 0012**: columna `read_at`; RLS `select`/`update` de lo propio
  (`recipient_id = auth.uid()`); grant `update (read_at)` a nivel columna (no
  pueden tocar otras columnas); `replica identity full` + publicación Realtime.
- **`notificationStore.ts`**: lista (máx 50), no-leídas, `markRead`/`markAllRead`
  optimistas, suscripción Realtime INSERT/UPDATE filtrada por `recipient_id`.
- **`NotificationBell.tsx`** en Toolbar (cloud): badge, dropdown, click →
  `openNotificationTarget()` (navegación interna sin recargar) + `markRead`.
  Arranca/para en App.tsx según `sessionUserId`.

### Fase 3 — Preferencias + unsubscribe

- **Migración 0013**: `notification_prefs (user_id pk, email_enabled,
  invite_events, mention_events)`. `deliver_notification` consulta prefs y omite
  el POST si el canal está apagado — la fila igual se crea (la campana siempre
  funciona). Sin fila = todo activado.
- **UI**: panel de engranaje dentro del dropdown de la campana con 3 toggles.
  `setPref` optimista + upsert.
- **Unsubscribe**: footer del correo enlaza a la app (login-gated). Unsubscribe
  con token firmado sin login queda pendiente (requiere `doGet` en Apps Script).

### Fase 4 — Batching / digest

- **Migración 0014**: flag `digest_mode` en `notification_config`. `false`
  (default) = inmediato, 1 correo/evento. `true` = el trigger no envía; el
  time-trigger `retryUnsent` agrupa las filas sin enviar por destinatario y
  manda 1 correo resumen por ventana.
- **Apps Script**: `retryUnsent` reescrito — agrupa por destinatario (1 →
  individual, 2+ → `sendDigest_`), respeta prefs en ambos modos (en digest el
  trigger no las filtró), marca suprimidas por pref como enviadas.

**Gaps restantes (conscientes):** invite de proyecto sigue sin ruta a proyecto
específico (abre diagrama sí, proyecto → sin nav); unsubscribe one-click sin
login (solo link a la app).
