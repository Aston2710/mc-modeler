-- Correo al invitado cuando el owner comparte escribiendo su email.
--
-- Hasta ahora solo se notificaba a los colaboradores que YA estaban cuando
-- alguien canjeaba un enlace (invite_redeemed_*). El invitado no recibía nada:
--   * con cuenta  → se insertaba en *_collaborators en silencio;
--   * sin cuenta  → se copiaba un enlace al portapapeles del owner.
--
-- Cuatro kinds nuevos en notification_outbox:
--   collaborator_added_diagram / collaborator_added_project
--       el owner añadió a un usuario registrado. Va también a la campanita.
--   invite_email_diagram / invite_email_project
--       el owner invitó a un correo sin cuenta: se le manda el enlace con token.
--
-- Requiere appscript/Code.gs con las plantillas de estos kinds desplegado
-- ANTES de aplicar esta migración: un kind desconocido el script lo marca como
-- enviado con error 'kind desconocido' y el correo se pierde.

-- ── 0. El CHECK de kind admite los cuatro nuevos ────────────────────────────

alter table public.notification_outbox drop constraint notification_outbox_kind_check;
alter table public.notification_outbox add constraint notification_outbox_kind_check
  check (kind = any (array[
    'invite_redeemed_diagram', 'invite_redeemed_project', 'comment_mention',
    'collaborator_added_diagram', 'collaborator_added_project',
    'invite_email_diagram', 'invite_email_project'
  ]));

-- ── 1. Colaborador añadido por otro usuario ─────────────────────────────────

create or replace function private.enqueue_collaborator_added()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor record;
  r_email text;
  res_name text;
begin
  -- Solo altas hechas por OTRO usuario. Fuera quedan:
  --   * la fila 'owner' del trigger de creación de diagrama/proyecto;
  --   * el canje de enlace (el propio usuario se inserta; redeem_* ya avisa);
  --   * inserciones sin sesión (service role, SQL editor).
  if new.role = 'owner' or auth.uid() is null or new.user_id = auth.uid() then
    return new;
  end if;

  select email into r_email from public.profiles where id = new.user_id;
  if r_email is null then return new; end if;

  select coalesce(display_name, email, 'Alguien') as name, email
    into actor from public.profiles where id = auth.uid();

  if tg_table_name = 'project_collaborators' then
    select name into res_name from public.projects where id = new.project_id;
    insert into public.notification_outbox (recipient_id, recipient_email, kind, payload)
    values (new.user_id, r_email, 'collaborator_added_project',
            jsonb_build_object(
              'projectId',   new.project_id,
              'projectName', coalesce(res_name, 'Proyecto'),
              'actorName',   actor.name,
              'actorEmail',  actor.email,
              'role',        new.role));
  else
    select name into res_name from public.diagrams where id = new.diagram_id;
    insert into public.notification_outbox (recipient_id, recipient_email, kind, payload)
    values (new.user_id, r_email, 'collaborator_added_diagram',
            jsonb_build_object(
              'diagramId',   new.diagram_id,
              'diagramName', coalesce(res_name, 'Diagrama'),
              'actorName',   actor.name,
              'actorEmail',  actor.email,
              'role',        new.role));
  end if;
  return new;
end;
$function$;

drop trigger if exists diagram_collaborators_notify_added on public.diagram_collaborators;
create trigger diagram_collaborators_notify_added
  after insert on public.diagram_collaborators
  for each row execute function private.enqueue_collaborator_added();

drop trigger if exists project_collaborators_notify_added on public.project_collaborators;
create trigger project_collaborators_notify_added
  after insert on public.project_collaborators
  for each row execute function private.enqueue_collaborator_added();

-- ── 2. Invitación con email a alguien sin cuenta ────────────────────────────

create or replace function private.enqueue_invite_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor record;
  res_name text;
  recent int;
  target text := lower(btrim(new.email));
  is_project boolean := tg_table_name = 'project_invites';
begin
  if target is null or target = '' or auth.uid() is null then
    return new;
  end if;
  if target !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Correo no válido: %', new.email;
  end if;

  -- Cuota anti-abuso: la cuenta emisora es Gmail consumer (~100 destinatarios
  -- al día para TODA la app). Se cuenta por actorId del payload, que escribe
  -- este trigger — created_by lo pone el cliente y no es fiable.
  select count(*) into recent
  from public.notification_outbox
  where kind in ('invite_email_diagram', 'invite_email_project')
    and payload->>'actorId' = auth.uid()::text
    and created_at > now() - interval '24 hours';
  if recent >= 20 then
    raise exception 'Límite de invitaciones por correo alcanzado (20 en 24 h)';
  end if;

  select coalesce(display_name, email, 'Alguien') as name, email
    into actor from public.profiles where id = auth.uid();

  if is_project then
    select name into res_name from public.projects where id = new.project_id;
  else
    select name into res_name from public.diagrams where id = new.diagram_id;
  end if;

  insert into public.notification_outbox (recipient_id, recipient_email, kind, payload)
  values (
    (select id from public.profiles where lower(email) = target limit 1),
    target,
    case when is_project then 'invite_email_project' else 'invite_email_diagram' end,
    jsonb_build_object(
      'token',       new.token,
      'name',        coalesce(res_name, case when is_project then 'Proyecto' else 'Diagrama' end),
      'actorId',     auth.uid(),
      'actorName',   actor.name,
      'actorEmail',  actor.email,
      'role',        new.role,
      'expiresAt',   new.expires_at));
  return new;
end;
$function$;

drop trigger if exists diagram_invites_notify_email on public.diagram_invites;
create trigger diagram_invites_notify_email
  after insert on public.diagram_invites
  for each row when (new.email is not null)
  execute function private.enqueue_invite_email();

drop trigger if exists project_invites_notify_email on public.project_invites;
create trigger project_invites_notify_email
  after insert on public.project_invites
  for each row when (new.email is not null)
  execute function private.enqueue_invite_email();

-- ── 3. Preferencias: los kinds nuevos cuentan como "invitaciones" ───────────

create or replace function private.deliver_notification()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  cfg record;
  prefs record;
begin
  select * into cfg from private.notification_config limit 1;
  if not found then return new; end if;

  if cfg.digest_mode then return new; end if;

  select * into prefs from public.notification_prefs where user_id = new.recipient_id;
  if found then
    if not prefs.email_enabled then return new; end if;
    if new.kind in ('invite_redeemed_diagram','invite_redeemed_project',
                    'collaborator_added_diagram','collaborator_added_project',
                    'invite_email_diagram','invite_email_project')
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
$function$;
