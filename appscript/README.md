# Notificaciones por correo — Apps Script

Emisor de correos del módulo de notificaciones. Supabase encola eventos en
`notification_outbox` (migración `0009_notifications.sql`) y un trigger hace
POST a este Web App, que envía el correo con la cuenta Gmail que lo despliega
(`modeler.notifications@gmail.com`) y marca la fila como enviada.

`Code.gs` es la **copia de referencia** — la versión viva se edita/despliega en
[script.google.com](https://script.google.com). Si cambias algo allá, actualiza
la copia acá.

## Despliegue (una vez, ~15 min)

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

## Notas

- Cuota Gmail consumer: ~100 destinatarios/día. Si se queda corta: cuenta
  Workspace (1,500/día) o cambiar `sendRow_` a un proveedor (Resend/SES).
- Apps Script no expone headers custom en `doPost` → el secret viaja en el
  body JSON (HTTPS). Es un secreto compartido plano: rotarlo = cambiar Script
  Property + `notification_config`.
- Filas con `sent_at is null` y `attempts < 5` de los últimos 2 días se
  reintentan automáticamente cada 15 min.
