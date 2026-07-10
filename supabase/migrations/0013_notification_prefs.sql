-- ============================================================================
-- Preferencias de notificación por usuario. Gatean SOLO el correo — la fila de
-- outbox se crea siempre (la campanita in-app siempre funciona). El trigger de
-- entrega consulta las prefs y omite el POST si el usuario apagó ese canal.
-- Sin fila de prefs = todo activado (default).
-- ============================================================================

create table if not exists public.notification_prefs (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  email_enabled  boolean not null default true,   -- interruptor maestro de correo
  invite_events  boolean not null default true,   -- correos de invitación canjeada
  mention_events boolean not null default true,   -- correos de mención
  updated_at     timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

-- Cada quien gestiona SUS preferencias.
drop policy if exists notif_prefs_select on public.notification_prefs;
create policy notif_prefs_select on public.notification_prefs
  for select using (user_id = auth.uid());
drop policy if exists notif_prefs_upsert on public.notification_prefs;
create policy notif_prefs_upsert on public.notification_prefs
  for insert with check (user_id = auth.uid());
drop policy if exists notif_prefs_update on public.notification_prefs;
create policy notif_prefs_update on public.notification_prefs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.notification_prefs to authenticated;

-- ── Entrega: consultar prefs antes del POST ──────────────────────────────────
create or replace function private.deliver_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cfg record;
  prefs record;
begin
  select * into cfg from private.notification_config limit 1;
  if not found then return new; end if;

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
