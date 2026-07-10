-- ============================================================================
-- Modo digest (batching). Interruptor en notification_config:
--   digest_mode = false (default) → entrega inmediata, 1 correo por evento.
--   digest_mode = true            → el trigger NO hace POST; el time-trigger de
--                                   Apps Script (retryUnsent) agrupa las filas
--                                   sin enviar por destinatario y manda 1 solo
--                                   correo resumen por ventana. Menos correos.
-- ============================================================================

alter table private.notification_config
  add column if not exists digest_mode boolean not null default false;

create or replace function private.deliver_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cfg record;
  prefs record;
begin
  select * into cfg from private.notification_config limit 1;
  if not found then return new; end if;

  -- En modo digest no se envía al instante: lo hace el batch de Apps Script.
  if cfg.digest_mode then return new; end if;

  select * into prefs from public.notification_prefs where user_id = new.recipient_id;
  if found then
    if not prefs.email_enabled then return new; end if;
    if new.kind in ('invite_redeemed_diagram','invite_redeemed_project')
       and not prefs.invite_events then return new; end if;
    if new.kind = 'comment_mention' and not prefs.mention_events then return new; end if;
  end if;

  begin
    perform net.http_post(
      url  := cfg.webhook_url,
      body := jsonb_build_object(
        'secret',          cfg.secret,
        'id',              new.id,
        'recipient_email', new.recipient_email,
        'kind',            new.kind,
        'payload',         new.payload
      )
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;
revoke execute on function private.deliver_notification() from public, anon, authenticated;
