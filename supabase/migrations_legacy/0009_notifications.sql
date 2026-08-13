-- ============================================================================
-- Notificaciones por correo (outbox + webhook a Apps Script).
--
-- Eventos:
--   1. invite_redeemed_diagram  — alguien canjeó un link de invitación de diagrama
--   2. invite_redeemed_project  — ídem para proyecto
--   3. comment_mention          — mención @usuario en un comentario
--
-- Arquitectura: los eventos nacen en servidor (RPCs redeem_* y trigger sobre
-- comment_replies) e insertan filas en notification_outbox. Un trigger sobre el
-- outbox hace POST (pg_net, async) al Web App de Apps Script, que envía el
-- correo vía GmailApp y marca sent_at por REST. Filas sin sent_at las repesca
-- el time-trigger de Apps Script (reintentos). Ver appscript/README.md.
-- ============================================================================

create extension if not exists pg_net;

-- ── Outbox ───────────────────────────────────────────────────────────────────
create table if not exists public.notification_outbox (
  id              uuid primary key default gen_random_uuid(),
  recipient_id    uuid references public.profiles(id) on delete cascade,
  recipient_email text not null,
  kind            text not null check (kind in
                    ('invite_redeemed_diagram','invite_redeemed_project','comment_mention')),
  payload         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  attempts        int not null default 0,
  error           text
);
create index if not exists notification_outbox_unsent_idx
  on public.notification_outbox (created_at) where sent_at is null;

-- RLS sin policies: invisible e inmutable para anon/authenticated. Escriben las
-- funciones security definer; lee/actualiza Apps Script con la service key.
alter table public.notification_outbox enable row level security;

-- ── Menciones ────────────────────────────────────────────────────────────────
-- Solo en comment_replies: el primer mensaje de un hilo también es una reply,
-- así que un único trigger cubre hilos nuevos y respuestas.
alter table public.comment_replies
  add column if not exists mentions uuid[] not null default '{}';

-- ── Config del webhook (schema private, no expuesto por PostgREST) ───────────
-- Singleton. Se llena tras desplegar el Apps Script:
--   insert into private.notification_config (webhook_url, secret)
--   values ('https://script.google.com/macros/s/<ID>/exec', '<SECRET>');
create table if not exists private.notification_config (
  id          boolean primary key default true check (id),
  webhook_url text not null,
  secret      text not null
);

-- ── Helper: acceso de un usuario arbitrario (los existentes usan auth.uid()) ─
create or replace function private.user_can_access_diagram(d_id uuid, u_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.diagrams d where d.id = d_id and d.owner_id = u_id)
      or exists (select 1 from public.diagram_collaborators c where c.diagram_id = d_id and c.user_id = u_id)
      or exists (
        select 1 from public.diagrams d
        join public.project_collaborators pc on pc.project_id = d.project_id
        where d.id = d_id and pc.user_id = u_id)
      or exists (
        select 1 from public.diagrams d
        join public.projects p on p.id = d.project_id
        where d.id = d_id and p.owner_id = u_id);
$$;
revoke execute on function private.user_can_access_diagram(uuid, uuid) from public, anon, authenticated;

-- ── Entrega: outbox → POST al Web App ────────────────────────────────────────
-- Sin config todavía → la fila queda sin sent_at y la repesca el retry de
-- Apps Script. Cualquier fallo del POST se traga: enviar correo jamás debe
-- romper la operación que lo originó.
create or replace function private.deliver_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare cfg record;
begin
  select * into cfg from private.notification_config limit 1;
  if not found then return new; end if;
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

drop trigger if exists notification_outbox_deliver on public.notification_outbox;
create trigger notification_outbox_deliver after insert on public.notification_outbox
  for each row execute function private.deliver_notification();

-- ── redeem_invite: encolar notificación a colaboradores del diagrama ─────────
-- Solo si el insert fue real (re-canje de alguien ya dentro no notifica).
create or replace function public.redeem_invite(invite_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  inv record;
  inserted int;
  actor record;
  d_name text;
begin
  select * into inv from public.diagram_invites where token = invite_token limit 1;
  if not found then
    raise exception 'Invitación inválida';
  end if;
  if inv.expires_at is not null and inv.expires_at < now() then
    raise exception 'Invitación expirada';
  end if;

  insert into public.diagram_collaborators (diagram_id, user_id, role, invited_by)
  values (inv.diagram_id, auth.uid(), inv.role, inv.created_by)
  on conflict (diagram_id, user_id) do nothing;
  get diagnostics inserted = row_count;

  update public.diagram_invites set accepted_at = now()
    where id = inv.id and accepted_at is null;

  if inserted > 0 then
    select coalesce(display_name, email, 'Alguien') as name, email
      into actor from public.profiles where id = auth.uid();
    select name into d_name from public.diagrams where id = inv.diagram_id;

    insert into public.notification_outbox (recipient_id, recipient_email, kind, payload)
    select dc.user_id, p.email, 'invite_redeemed_diagram',
           jsonb_build_object(
             'diagramId',   inv.diagram_id,
             'diagramName', coalesce(d_name, 'Diagrama'),
             'actorName',   actor.name,
             'actorEmail',  actor.email,
             'role',        inv.role)
    from public.diagram_collaborators dc
    join public.profiles p on p.id = dc.user_id
    where dc.diagram_id = inv.diagram_id
      and dc.user_id <> auth.uid()
      and p.email is not null;
  end if;

  return inv.diagram_id;
end;
$$;

-- ── redeem_project_invite: ídem sobre project_collaborators ──────────────────
create or replace function public.redeem_project_invite(invite_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  inv record;
  inserted int;
  actor record;
  p_name text;
begin
  select * into inv from public.project_invites where token = invite_token limit 1;
  if not found then
    raise exception 'Invitación inválida';
  end if;
  if inv.expires_at is not null and inv.expires_at < now() then
    raise exception 'Invitación expirada';
  end if;

  insert into public.project_collaborators (project_id, user_id, role, invited_by)
  values (inv.project_id, auth.uid(), inv.role, inv.created_by)
  on conflict (project_id, user_id) do nothing;
  get diagnostics inserted = row_count;

  update public.project_invites set accepted_at = now()
    where id = inv.id and accepted_at is null;

  if inserted > 0 then
    select coalesce(display_name, email, 'Alguien') as name, email
      into actor from public.profiles where id = auth.uid();
    select name into p_name from public.projects where id = inv.project_id;

    insert into public.notification_outbox (recipient_id, recipient_email, kind, payload)
    select pc.user_id, p.email, 'invite_redeemed_project',
           jsonb_build_object(
             'projectId',   inv.project_id,
             'projectName', coalesce(p_name, 'Proyecto'),
             'actorName',   actor.name,
             'actorEmail',  actor.email,
             'role',        inv.role)
    from public.project_collaborators pc
    join public.profiles p on p.id = pc.user_id
    where pc.project_id = inv.project_id
      and pc.user_id <> auth.uid()
      and p.email is not null;
  end if;

  return inv.project_id;
end;
$$;

-- ── Menciones: trigger sobre comment_replies ─────────────────────────────────
-- Valida que cada mencionado realmente tenga acceso al diagrama (un cliente
-- malicioso no puede usar mentions para mandar contenido a terceros).
create or replace function private.enqueue_mention_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d_id uuid;
  d_name text;
  anchor_label text;
begin
  if new.mentions is null or array_length(new.mentions, 1) is null then
    return new;
  end if;

  select t.diagram_id, coalesce(t.anchor->>'elementLabel', ''), d.name
    into d_id, anchor_label, d_name
  from public.comment_threads t
  join public.diagrams d on d.id = t.diagram_id
  where t.id = new.thread_id;
  if d_id is null then return new; end if;

  insert into public.notification_outbox (recipient_id, recipient_email, kind, payload)
  select p.id, p.email, 'comment_mention',
         jsonb_build_object(
           'diagramId',    d_id,
           'diagramName',  coalesce(d_name, 'Diagrama'),
           'actorName',    coalesce(new.author_name, 'Alguien'),
           'excerpt',      left(new.content, 300),
           'elementLabel', anchor_label)
  from (select distinct unnest(new.mentions) as uid) m
  join public.profiles p on p.id = m.uid
  where m.uid is distinct from new.author_id
    and p.email is not null
    and private.user_can_access_diagram(d_id, m.uid);

  return new;
end;
$$;
revoke execute on function private.enqueue_mention_notifications() from public, anon, authenticated;

drop trigger if exists comment_replies_mentions on public.comment_replies;
create trigger comment_replies_mentions after insert on public.comment_replies
  for each row execute function private.enqueue_mention_notifications();
