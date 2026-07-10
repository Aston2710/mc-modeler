# Notificaciones por correo — Apps Script

Emisor de correos del módulo de notificaciones. Supabase encola eventos en
`notification_outbox` (migración `0009_notifications.sql`) y un trigger hace
POST a este Web App, que envía el correo con la cuenta Gmail que lo despliega
(`modeler.notifications@gmail.com`) y marca la fila como enviada.

`Code.gs` es la **copia de referencia** — la versión viva se edita/despliega en
[script.google.com](https://script.google.com). Si cambias algo allá, actualiza
la copia acá.

---

## ✅ Lo que tienes que hacer (checklist, ~20 min)

Migraciones 0009-0014 YA están aplicadas en la BD remota. Falta desplegar el
script y conectar el webhook. Cuenta emisora: `modeler.notifications@gmail.com`.

- [ ] **1. Generar el SECRET.** En una terminal: `openssl rand -hex 32`. Copiar
      el resultado (lo usas en los pasos 3 y 6, idéntico en ambos).
- [ ] **2. Crear el script.** Entrar a script.google.com **con
      modeler.notifications@gmail.com** → Nuevo proyecto → pegar todo `Code.gs`
      → nombrarlo "MC Modeler Notifs".
- [ ] **3. Script Properties.** Engranaje (Configuración del proyecto) →
      Propiedades del script → agregar:

      | Property | Valor |
      |---|---|
      | `SECRET` | el del paso 1 |
      | `SUPABASE_URL` | `https://imtwcdfiugphqrculrms.supabase.co` |
      | `SERVICE_KEY` | tu `SUPABASE_SERVICE_ROLE_KEY` del `.env.local` |
      | `BASE_URL` | tu URL de Vercel, sin `/` final (ej. `https://mc-modeler.vercel.app`) |
      | `SENDER_NAME` | `MC Modeler` |

- [ ] **4. Desplegar.** Implementar → Nueva implementación → tipo **Aplicación
      web** → Ejecutar como: **Yo**, Acceso: **Cualquier persona** → autorizar
      permisos de Gmail → copiar la URL `.../exec`.
- [ ] **5. Time-trigger.** Activadores (reloj, panel izq) → Añadir activador →
      función `retryUnsent`, origen "según tiempo", cada **15 minutos**.
- [ ] **6. Conectar webhook.** Supabase → SQL Editor → correr (con TU URL y el
      MISMO secret del paso 1):

      ```sql
      insert into private.notification_config (webhook_url, secret)
      values ('https://script.google.com/macros/s/<TU_ID>/exec', '<SECRET_DEL_PASO_1>')
      on conflict (id) do update
        set webhook_url = excluded.webhook_url, secret = excluded.secret;
      ```

- [ ] **7. Probar.** Correr el INSERT de la sección [Probar](#probar) con tu
      correo. Debe llegar en segundos.
- [ ] **8. Prueba real end-to-end.** Con 2 cuentas: canjear un link de invitación
      y mencionar a alguien con `@` en un comentario. Verificar correo + campanita.
- [ ] **9. Commitear las migraciones** 0011-0014 y los archivos nuevos al repo.

Verificar en cualquier momento qué quedó encolado/enviado:

```sql
select kind, recipient_email, created_at, sent_at, error
from public.notification_outbox order by created_at desc limit 20;
```

---

## Despliegue (detalle de los pasos 2-6, ~15 min)

1. Entrar a script.google.com **con la cuenta emisora** → Nuevo proyecto.
2. Pegar el contenido de `Code.gs`. Nombrar el proyecto (ej. "MC Modeler Notifs").
3. Configuración del proyecto (engranaje) → **Script Properties**:

   | Property | Valor |
   |---|---|
   | `SECRET` | cadena aleatoria larga (ej. `openssl rand -hex 24`) |
   | `SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `SERVICE_KEY` | service_role key (Dashboard → Settings → API) |
   | `BASE_URL` | URL pública de la app, sin slash final |
   | `SENDER_NAME` | `MC Modeler` |

4. **Implementar → Nueva implementación → Aplicación web**:
   - Ejecutar como: **Yo**
   - Acceso: **Cualquier persona**
   - Autorizar los permisos de Gmail cuando lo pida.
   - Copiar la URL `https://script.google.com/macros/s/<ID>/exec`.
5. **Time-trigger de reintentos**: Activadores (reloj) → Añadir activador →
   función `retryUnsent`, según tiempo, cada 15 minutos.
6. Registrar el webhook en Supabase (SQL Editor):

   ```sql
   insert into private.notification_config (webhook_url, secret)
   values ('https://script.google.com/macros/s/<ID>/exec', '<SECRET>')
   on conflict (id) do update
     set webhook_url = excluded.webhook_url, secret = excluded.secret;
   ```

## Probar

```sql
insert into public.notification_outbox (recipient_email, kind, payload)
values ('tu@correo.com', 'comment_mention',
        '{"diagramId":"x","diagramName":"Prueba","actorName":"Tester","excerpt":"hola @tú"}');
```

Debe llegar el correo en segundos. Si no: revisar `select * from
public.notification_outbox order by created_at desc` (columna `error`) y las
ejecuciones en script.google.com → Ejecuciones.

## Actualizar el código desplegado

Editar en script.google.com → **Implementar → Administrar implementaciones →
editar (lápiz) → Versión: Nueva**. ⚠️ NO crear "Nueva implementación": eso
genera otra URL y el webhook apuntaría a la vieja.

## Cambiar la cuenta emisora

1. Con la cuenta nueva: pasos 1–5 (pegar `Code.gs` del repo, mismas properties).
2. Actualizar `private.notification_config` con la URL nueva (paso 6).
3. Listo — nada más cambia. El `SENDER_NAME` mantiene el nombre visible.

## Modo digest (batching)

Por defecto: entrega inmediata, 1 correo por evento. Para agrupar y mandar menos
correos (1 resumen por destinatario por ventana del time-trigger):

```sql
update private.notification_config set digest_mode = true;
```

Con `digest_mode = true` el trigger de Supabase NO envía al instante; el
time-trigger `retryUnsent` (cada 15 min) junta las notificaciones sin enviar de
cada destinatario y manda un solo correo resumen. Bajar el intervalo del
time-trigger = digest más frecuente. Volver a inmediato: `set digest_mode =
false`. `retryUnsent` respeta las preferencias por usuario en ambos modos.

## Notas

- Cuota Gmail consumer: ~100 destinatarios/día. Si se queda corta: cuenta
  Workspace (1,500/día) o cambiar `sendRow_` a un proveedor (Resend/SES). El
  modo digest reduce mucho el conteo (agrupa por destinatario).
- Apps Script no expone headers custom en `doPost` → el secret viaja en el
  body JSON (HTTPS). Es un secreto compartido plano: rotarlo = cambiar Script
  Property + `notification_config`.
- Filas con `sent_at is null` y `attempts < 5` de los últimos 2 días se
  reintentan automáticamente cada 15 min.
